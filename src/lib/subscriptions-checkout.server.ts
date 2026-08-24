import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cancelRazorpaySubscription,
  createRazorpaySubscription,
  fetchRazorpaySubscription,
} from "@/lib/razorpay.server";
import { validateCouponForPlan, type CouponDecision } from "@/lib/coupons.server";
import { pendingCheckoutIsStale } from "@/lib/checkout-ttl";

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

  // [Bug 1.9 / Pass-2 P5] Double-click / retried requests used to spawn
  // unbounded pending Razorpay subscriptions for the same user+plan —
  // including every telecaller link-send, which always carries
  // attribution. The pending-row reuse below now applies to ALL flows.
  //
  // Coupon must be validated BEFORE the reuse decision — reuse legality
  // depends on whether the live pending row already carries this coupon
  // (same coupon → safe reuse; different coupon → stale row retired).
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

  const { data: existingPendingRow } = await adminDb
    .from("subscriptions")
    .select(
      "id,razorpay_sub_id,razorpay_customer_id,coupon_id,acquisition_channel,sales_agent_id,telecaller_id,created_at",
    )
    .eq("user_id", userId)
    .eq("plan_id", plan.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingPending = existingPendingRow as {
    id: string;
    razorpay_sub_id: string | null;
    razorpay_customer_id: string | null;
    coupon_id: string | null;
    acquisition_channel: string | null;
    sales_agent_id: string | null;
    telecaller_id: string | null;
    created_at: string;
  } | null;

  // ── [SESSION_STUCK_PENDING_CHECKOUT — Bug A fix] ────────────────
  // An abandoned Razorpay Checkout sheet stays `created` on THEIR side
  // forever and fires ZERO webhooks. The old unconditional reuse handed
  // the same dead id back on every retry — Chirayu's own Premium
  // checkout bounced twice against two stuck `Created` subscriptions.
  // Policy now:
  //   • ≤ PENDING_REUSE_WINDOW_MINUTES old → reuse (the genuine
  //     double-click fast path [Bug 1.9] stays untouched).
  //   • older than the window → NEVER trust the cached id blind; ask
  //     Razorpay what it actually is:
  //       'created'                        → abandoned sheet: cancel
  //                                          (best-effort), delete the
  //                                          local row, audit, fresh
  //                                          creation below.
  //       'cancelled'/'expired'/'completed'→ already terminal there:
  //                                          delete locally, audit,
  //                                          fresh creation.
  //       'authenticated'/'active'/'pending'/'halted'
  //                                        → a mandate may genuinely be
  //                                          ALIVE that our webhook never
  //                                          heard about. Never cancel a
  //                                          working mandate and never
  //                                          destroy webhook linkage —
  //                                          keep the row/object and
  //                                          hand the customer a FRESH
  //                                          checkout alongside; the
  //                                          newest-pending ordering
  //                                          makes every later retry hit
  //                                          the new one.
  //       fetch itself failed              → fail safe: keep row AND
  //                                          object, still create fresh
  //                                          (a Razorpay hiccup must not
  //                                          become a 500 or a trap).
  if (existingPending?.razorpay_sub_id) {
    const sameCoupon =
      !couponCode ||
      existingPending.coupon_id === (couponDecision?.ok ? couponDecision.coupon!.id : null);
    const stale = pendingCheckoutIsStale(existingPending.created_at);

    if (sameCoupon && !stale) {
      // [Bug 1.9 / Pass-2 P5] Fast-path reuse + attribution back-fill.
      const backfill: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.acquisitionChannel && !existingPending.acquisition_channel) {
        backfill.acquisition_channel = input.acquisitionChannel;
      }
      if (input.salesAgentId && !existingPending.sales_agent_id) {
        backfill.sales_agent_id = input.salesAgentId;
      }
      if (input.telecallerId && !existingPending.telecaller_id) {
        backfill.telecaller_id = input.telecallerId;
        backfill.attribution_source = "token";
        backfill.attributed_at = new Date().toISOString();
      }
      if (Object.keys(backfill).length > 1) {
        await adminDb.from("subscriptions").update(backfill).eq("id", existingPending.id);
      }
      return {
        subscriptionDbId: existingPending.id,
        razorpaySubscriptionId: existingPending.razorpay_sub_id,
        razorpayCustomerId: existingPending.razorpay_customer_id ?? null,
        planName: plan.name,
        planPricePaise: plan.price_paise,
        couponCode: existingPending.coupon_id ? couponCode : null,
        coupon: existingPending.coupon_id && couponDecision?.ok ? couponDecision.coupon : null,
      };
    }

    const ageMinutes = Math.max(
      0,
      Math.round((Date.now() - Date.parse(existingPending.created_at)) / 60_000),
    );
    let rzpStatus: string | null = null;
    try {
      const rzp = await fetchRazorpaySubscription(existingPending.razorpay_sub_id);
      rzpStatus = typeof rzp.status === "string" ? rzp.status : null;
    } catch (err) {
      console.error(
        "stale-pending recheck failed (failing safe to fresh creation):",
        err instanceof Error ? err.message : err,
      );
      try {
        await adminDb.from("audit_logs").insert({
          admin_id: null,
          action: "checkout.stale_pending_recheck_failed",
          entity: "subscriptions",
          entity_id: existingPending.id,
          meta: {
            razorpay_sub_id: existingPending.razorpay_sub_id,
            age_minutes: ageMinutes,
          },
        });
      } catch {
        /* audit is best-effort */
      }
      // fall through — keep row AND object, create fresh below
    }

    if (rzpStatus === "created") {
      // The exact live-incident shape: an unauthenticated sheet whose
      // retries could never complete. Retire BOTH sides, then recreate.
      await cancelRazorpaySubscription(existingPending.razorpay_sub_id).catch(() => {});
      await adminDb
        .from("subscriptions")
        .delete()
        .eq("id", existingPending.id)
        .eq("user_id", userId);
      try {
        await adminDb.from("audit_logs").insert({
          admin_id: null,
          action: "checkout.stale_pending_discarded",
          entity: "subscriptions",
          entity_id: existingPending.id,
          meta: {
            razorpay_sub_id: existingPending.razorpay_sub_id,
            razorpay_status: rzpStatus,
            age_minutes: ageMinutes,
          },
        });
      } catch {
        /* audit is best-effort */
      }
    } else if (rzpStatus === "cancelled" || rzpStatus === "expired" || rzpStatus === "completed") {
      // Terminal on Razorpay's side already — nothing to cancel there.
      await adminDb
        .from("subscriptions")
        .delete()
        .eq("id", existingPending.id)
        .eq("user_id", userId);
      try {
        await adminDb.from("audit_logs").insert({
          admin_id: null,
          action: "checkout.stale_pending_discarded",
          entity: "subscriptions",
          entity_id: existingPending.id,
          meta: {
            razorpay_sub_id: existingPending.razorpay_sub_id,
            razorpay_status: rzpStatus,
            age_minutes: ageMinutes,
          },
        });
      } catch {
        /* audit is best-effort */
      }
    } else if (rzpStatus !== null) {
      // Mandate possibly alive (authenticated/active/pending/halted):
      // preserve it for webhook reconciliation, fresh checkout alongside.
      try {
        await adminDb.from("audit_logs").insert({
          admin_id: null,
          action: "checkout.stale_pending_kept_alive_mandate",
          entity: "subscriptions",
          entity_id: existingPending.id,
          meta: {
            razorpay_sub_id: existingPending.razorpay_sub_id,
            razorpay_status: rzpStatus,
            age_minutes: ageMinutes,
          },
        });
      } catch {
        /* audit is best-effort */
      }
    }
    // In every non-reuse branch control falls through to the normal
    // fresh-creation path below exactly as if this row hadn't existed.
  } else if (existingPending && !existingPending.razorpay_sub_id) {
    // Unusable orphan from a crashed creation — the error path below
    // deletes these; remove it so the fresh insert is the only row.
    await adminDb.from("subscriptions").delete().eq("id", existingPending.id).eq("user_id", userId);
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

  // [Pass-2 P3] Track the Razorpay object so ANY failure after its
  // creation can cancel it — otherwise every error path leaks a live
  // Razorpay subscription whose webhooks resolve to a deleted row.
  let createdRazorpaySubId: string | null = null;

  try {
    const rzpSub = await createRazorpaySubscription({
      razorpayPlanId: plan.razorpay_plan_id!,
      subscriptionDbId: subRow.id,
      couponCode,
      totalCount: totalCountForBillingPeriod(plan.billing_period),
    });
    createdRazorpaySubId = rzpSub.id;

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
        // [Pass-2 residual P3] pgrst116 belongs here too: a coupon that
        // hits its cap between validate and redeem can surface as a
        // PostgREST no-rows error — that must be the clean 400 below,
        // never a raw driver-error 500.
        if (redeemErr && !/pgrst202|pgrst116|42P01|does not exist/i.test(redeemErr.message)) {
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
    // No orphaned pending rows from failed Razorpay calls — and no
    // orphaned RAZORPAY objects either (Pass-2 P3): the mandate we
    // just created is cancelled best-effort so its webhooks never land
    // on a row that no longer exists.
    if (createdRazorpaySubId) {
      await cancelRazorpaySubscription(createdRazorpaySubId).catch(() => {});
    }
    await adminDb.from("subscriptions").delete().eq("id", subRow.id).eq("user_id", userId);
    throw err;
  }
}
