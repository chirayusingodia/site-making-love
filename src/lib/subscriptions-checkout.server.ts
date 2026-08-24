import type { SupabaseClient } from "@supabase/supabase-js";
import { createRazorpaySubscription } from "@/lib/razorpay.server";
import { validateCouponForPlan, type CouponDecision } from "@/lib/coupons.server";

// ─────────────────────────────────────────────────────────────
// PUNYATA — Signup-first checkout: create-checkout (server-only)
//
// Post-login buy step. The caller is already authenticated
// (requireUser); name/phone are NEVER re-entered here.
//
// Flow:
//   1. resolve plan (slug or uuid) — must be active
//   2. optional coupon → validated; recorded as attribution
//   3. INSERT subscriptions row status='pending' (RLS-compatible)
//   4. create Razorpay Subscription for the plan's razorpay_plan_id
//   5. persist razorpay_sub_id BEFORE any webhook can arrive
//      (webhook resolves our row by razorpay_sub_id — the row must
//      be linkable the moment Checkout charges the customer)
//   6. return what the frontend needs to open Razorpay Checkout
//
// ACTIVATION DISCIPLINE: this module never sets status='active'.
// Only /api/payments/webhook does.
// ─────────────────────────────────────────────────────────────

// ─── Subscription tenure: "runs until cancelled" ──────────────
// Razorpay has no literal "forever" flag — total_count is MANDATORY
// at creation and capped at 100 YEARS (their documented maximum). A
// live subscription can be cancelled at any moment regardless of how
// much total_count remains, so we model "no fixed term, renews until
// the subscriber (or admin) cancels" as simply the maximum legal
// tenure — like a no-fixed-term gym membership on a platform that
// demands some number.
//
// ⚠️ Subscriptions created BEFORE 2026-08-23 carry the old short
// tenures (12 monthly / 5 yearly cycles). Razorpay does NOT
// retroactively extend a live mandate's total_count — those keep
// their original end date (see session log for the census).
export const SUBSCRIPTION_MAX_YEARS = 100;

/** Billable cycles per year per billing_period. Declared as an
 *  exhaustive Record: adding a third period (weekly/daily) to the
 *  PlanRow union FAILS TO COMPILE until it gets a row here, so its
 *  total_count always derives as 100 years of that cadence — never
 *  left unhandled. */
const CYCLES_PER_YEAR: Record<PlanRow["billing_period"], number> = {
  monthly: 12,
  yearly: 1,
};

export function totalCountForBillingPeriod(period: PlanRow["billing_period"]): number {
  return SUBSCRIPTION_MAX_YEARS * CYCLES_PER_YEAR[period];
}

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  price_paise: number;
  billing_period: "monthly" | "yearly";
  razorpay_plan_id: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveActivePlan(
  db: SupabaseClient,
  planIdOrSlug: string,
): Promise<PlanRow | null> {
  // Slug first (public URLs use slug aliases like "grah"); fall back to
  // uuid only when the input IS one — .eq('id', 'grah') would make
  // Postgres throw an invalid-uuid cast error.
  const cols = "id,name,slug,price_paise,billing_period,razorpay_plan_id";
  const bySlug = await db
    .from("plans")
    .select(cols)
    .eq("slug", planIdOrSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (bySlug.data) return bySlug.data as PlanRow;
  if (!UUID_RE.test(planIdOrSlug)) return null;

  const byId = await db
    .from("plans")
    .select(cols)
    .eq("id", planIdOrSlug)
    .eq("is_active", true)
    .maybeSingle();
  return (byId.data as PlanRow | null) ?? null;
}

export interface CreateCheckoutOutcome {
  subscriptionDbId: string;
  razorpaySubscriptionId: string;
  razorpayCustomerId: string | null;
  planName: string;
  planPricePaise: number;
  couponCode: string | null;
  coupon: CouponDecision["coupon"] | null;
}

export class CheckoutError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export async function createCheckoutForUser(input: {
  adminDb: SupabaseClient;
  userId: string;
  planIdOrSlug: string;
  couponCode?: string | null;
  /**
   * Telecaller panel (§5.5): stamp acquisition_channel='telecall'.
   */
  acquisitionChannel?: string | null;
  /** Sourcing field agent credited on the sale (leads.source_agent_id). */
  salesAgentId?: string | null;
  /** §9.1 path 1: closing telecaller resolved from a lead's
   *  attribution token at checkout creation — stamped write-once. */
  telecallerId?: string | null;
}): Promise<CreateCheckoutOutcome> {
  const { adminDb, userId, planIdOrSlug } = input;
  const couponCode = input.couponCode?.trim() ? input.couponCode.trim().toUpperCase() : null;

  const plan = await resolveActivePlan(adminDb, planIdOrSlug);
  if (!plan) throw new CheckoutError("Plan not found or inactive", 404);
  if (!plan.razorpay_plan_id) {
    // Not a code bug to silently route around — the plan simply is not
    // sellable yet until its Razorpay Plan id is set in the admin manager.
    throw new CheckoutError("Yeh plan abhi payment ke liye configure nahi hua hai.", 503);
  }

  // [Bug 1.9] Double-click / retried requests used to spawn unbounded
  // pending Razorpay subscriptions for the same user+plan. Reuse the
  // live one when it exists and the caller brings NO extra attribution
  // (those callers need their own stamped row); clean up a stale
  // linkless row otherwise.
  const carriesAttribution =
    Boolean(couponCode) ||
    Boolean(input.acquisitionChannel) ||
    Boolean(input.salesAgentId) ||
    Boolean(input.telecallerId);

  let existingPending:
    | {
        id: string;
        razorpay_sub_id: string | null;
        razorpay_customer_id: string | null;
      }
    | null = null;

  if (!carriesAttribution) {
    const { data } = await adminDb
      .from("subscriptions")
      .select("id,razorpay_sub_id,razorpay_customer_id")
      .eq("user_id", userId)
      .eq("plan_id", plan.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    existingPending = data ?? null;

    if (existingPending?.razorpay_sub_id) {
      return {
        subscriptionDbId: existingPending.id,
        razorpaySubscriptionId: existingPending.razorpay_sub_id,
        razorpayCustomerId: existingPending.razorpay_customer_id ?? null,
        planName: plan.name,
        planPricePaise: plan.price_paise,
        couponCode: null, // already stamped on the reused row's attribution
        coupon: null,
      };
    }
    if (existingPending && !existingPending.razorpay_sub_id) {
      // Unusable orphan from a crashed creation — the error path below
      // deletes these; remove it so the fresh insert is the only row.
      await adminDb
        .from("subscriptions")
        .delete()
        .eq("id", existingPending.id)
        .eq("user_id", userId);
    }
  }

  let couponDecision: CouponDecision | null = null;
  if (couponCode) {
    // §2.2 (Hospitals session): the agent-visibility WIDENING is gone.
    // Only ordinary public/personally-assigned coupons validate here —
    // exactly what the public post-login checkout always allowed.
    couponDecision = await validateCouponForPlan(adminDb, {
      code: couponCode,
      planId: plan.id,
      planPricePaise: plan.price_paise,
      userId,
    });
    if (!couponDecision.ok || !couponDecision.coupon) {
      throw new CheckoutError("Coupon code valid nahi hai.", 400);
    }
  }

  // Pending row FIRST so it exists before money moves; razorpay_sub_id
  // is attached immediately after creation, before checkout opens.
  const { data: subRow, error: insErr } = await adminDb
    .from("subscriptions")
    .insert({
      user_id: userId,
      plan_id: plan.id,
      ...(couponDecision?.ok ? { coupon_id: couponDecision.coupon!.id } : {}),
      status: "pending",
      ...(input.acquisitionChannel
        ? { acquisition_channel: input.acquisitionChannel }
        : couponDecision?.ok
          ? { acquisition_channel: `coupon:${couponDecision.coupon!.code}` }
          : {}),
      ...(input.salesAgentId ? { sales_agent_id: input.salesAgentId } : {}),
      ...(input.telecallerId
        ? {
            telecaller_id: input.telecallerId,
            attribution_source: "token",
            attributed_at: new Date().toISOString(),
          }
        : {}),
    })
    .select("id")
    .single();
  if (insErr || !subRow) {
    throw new CheckoutError(`subscription create failed: ${insErr?.message ?? "no row"}`, 500);
  }

  try {
    const rzpSub = await createRazorpaySubscription({
      razorpayPlanId: plan.razorpay_plan_id!,
      subscriptionDbId: subRow.id,
      couponCode,
      totalCount: totalCountForBillingPeriod(plan.billing_period),
    });

    const { error: updErr } = await adminDb
      .from("subscriptions")
      .update({
        razorpay_sub_id: rzpSub.id,
        ...(rzpSub.customer_id ? { razorpay_customer_id: rzpSub.customer_id } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", subRow.id)
      .eq("user_id", userId); // never widen beyond the caller's own row
    if (updErr) {
      // Row exists but is not linked to Razorpay yet — the webhook would
      // land on an unknown subscription. Fail loudly; retry creates fresh.
      throw new CheckoutError(`linking razorpay id failed: ${updErr.message}`, 500);
    }

    // [Bug 1.2] The coupon cap was only ever PREVIEWED — nothing
    // incremented times_redeemed, so max_redemptions never bound
    // anything. redeem_coupon() (migration 018) increments
    // atomically and refuses past-cap codes; a NULL here means the
    // coupon ran out between validation and now → fail the checkout.
    if (couponDecision?.ok && couponDecision.coupon) {
      const { data: redeemed, error: redeemErr } = await adminDb
        .rpc("redeem_coupon", { p_code: couponDecision.coupon.code })
        .single();
      if (redeemErr || redeemed === null) {
        if (redeemErr && !/pgrst202|42P01|does not exist/i.test(redeemErr.message)) {
          throw new CheckoutError(`coupon redemption failed: ${redeemErr.message}`, 500);
        }
        throw new CheckoutError("Coupon code valid nahi hai.", 400);
      }
    }

    return {
      subscriptionDbId: subRow.id,
      razorpaySubscriptionId: rzpSub.id,
      razorpayCustomerId: rzpSub.customer_id ?? null,
      planName: plan.name,
      planPricePaise: plan.price_paise,
      couponCode,
      coupon: couponDecision && couponDecision.ok ? couponDecision.coupon : null,
    };
  } catch (err) {
    // No orphaned pending rows from failed Razorpay calls.
    await adminDb.from("subscriptions").delete().eq("id", subRow.id).eq("user_id", userId);
    throw err;
  }
}
