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

/** Billable cycles before the Razorpay subscription completes.
 *  UPI AutoPay mandates need a finite total_count. Monthly plans run
 *  one year; yearly plans five years — business-tunable constants. */
const TOTAL_COUNT_MONTHLY = 12;
const TOTAL_COUNT_YEARLY = 5;

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

  let couponDecision: CouponDecision | null = null;
  if (couponCode) {
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
      ...(couponDecision?.ok
        ? { acquisition_channel: `coupon:${couponDecision.coupon!.code}` }
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
      totalCount: plan.billing_period === "yearly" ? TOTAL_COUNT_YEARLY : TOTAL_COUNT_MONTHLY,
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
