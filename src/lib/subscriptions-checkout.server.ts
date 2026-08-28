import type { SupabaseClient } from "@supabase/supabase-js";
import { validateCouponForPlan, type CouponDecision } from "@/lib/coupons.server";
import { pendingCheckoutIsStale } from "@/lib/checkout-ttl";
import {
  createMandateForSubscription,
  getCurrentMandate,
  retireMandate,
  syncMandateFromGateway,
  MandateError,
  type MandateRow,
} from "@/lib/mandates.server";
import { candidatesForPlan, getAdapter } from "@/lib/gateways/registry";
import { isTerminalMandateStatus, type GatewayId, type MandateStatus } from "@/lib/gateways/types";
import type { BillingPeriod } from "@/lib/gateways/tenure";

// ─────────────────────────────────────────────────────────────
// PUNYATA — Signup-first checkout: create-checkout (server-only)
//
// Post-login buy step. The caller is already authenticated
// (requireUser); name/phone are NEVER re-entered here.
//
// Flow:
//   1. resolve plan (slug or uuid) — must be active
//   2. confirm SOME gateway can currently sell it
//   3. optional coupon → validated; recorded as attribution
//   4. INSERT subscriptions row status='pending' (RLS-compatible)
//   5. raise a MANDATE for it through the gateway registry — which
//      picks the provider, derives the tenure, and fails over if the
//      preferred provider is unwell
//   6. return what the frontend needs to open that gateway's checkout
//
// GATEWAY NEUTRALITY (migration 022): this module names no provider.
// Gateway identifiers live on subscription_mandates, never on the
// subscription — so a blocked Razorpay account is a rotation change,
// not an outage, and a subscription can outlive any single provider.
//
// TENURE: never a literal cycle count. See gateways/tenure.ts for the
// 2026-08-28 incident that rule exists to prevent.
//
// ACTIVATION DISCIPLINE: this module never sets status='active'.
// Only the gateway webhook does.
// ─────────────────────────────────────────────────────────────

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  price_paise: number;
  billing_period: BillingPeriod;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveActivePlan(
  db: SupabaseClient,
  planIdOrSlug: string,
): Promise<PlanRow | null> {
  // Slug first (public URLs use slug aliases like "grah"); fall back to
  // uuid only when the input IS one — .eq('id', 'grah') would make
  // Postgres throw an invalid-uuid cast error.
  const cols = "id,name,slug,price_paise,billing_period";
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
  /** subscription_mandates.id — our own handle on the instrument. */
  mandateId: string;
  gateway: GatewayId;
  gatewayMandateId: string;
  gatewayCustomerId: string | null;
  /** Publishable key for the gateway's browser SDK, when it uses one. */
  gatewayPublicKey: string | null;
  /** Tells the frontend which checkout to drive. */
  checkoutStrategy: string;
  /** Provider-hosted payment page, for redirect-style gateways. */
  hostedCheckoutUrl: string | null;
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

/**
 * Confirms at least one gateway can sell this plan right now, and
 * distinguishes the two very different reasons it might not:
 *   • no gateway plan ids configured → the plan is not sellable yet
 *     (a setup task for the owner, not a transient fault)
 *   • ids configured but every gateway unhealthy/disabled → a
 *     temporary outage, worth retrying shortly
 * Collapsing these into one message is how a config gap gets
 * misdiagnosed as an outage for a week.
 */
async function assertPlanIsSellable(db: SupabaseClient, planId: string): Promise<void> {
  const candidates = await candidatesForPlan(db, planId);
  if (candidates.length > 0) return;

  const { count } = await db
    .from("plan_gateway_refs")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", planId)
    .eq("is_active", true);

  if (!count) {
    throw new CheckoutError("Yeh plan abhi payment ke liye configure nahi hua hai.", 503);
  }
  throw new CheckoutError(
    "Payment gateway abhi temporarily unavailable hai. Kripya thodi der baad try karein.",
    503,
  );
}

/** Reuse payload for a pending checkout whose mandate is still fresh. */
function outcomeFromExistingMandate(input: {
  subscriptionDbId: string;
  mandate: MandateRow;
  plan: PlanRow;
  couponCode: string | null;
  coupon: CouponDecision["coupon"] | null;
}): CreateCheckoutOutcome {
  const adapter = getAdapter(input.mandate.gateway);
  return {
    subscriptionDbId: input.subscriptionDbId,
    mandateId: input.mandate.id,
    gateway: input.mandate.gateway,
    gatewayMandateId: input.mandate.gateway_mandate_id,
    gatewayCustomerId: input.mandate.gateway_customer_id,
    gatewayPublicKey: adapter.publicKey(),
    checkoutStrategy: adapter.checkoutStrategy,
    hostedCheckoutUrl: null,
    planName: input.plan.name,
    planPricePaise: input.plan.price_paise,
    couponCode: input.couponCode,
    coupon: input.coupon,
  };
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

  // Fail before touching the database — an unsellable plan must not
  // leave a pending subscription row behind.
  await assertPlanIsSellable(adminDb, plan.id);

  // [Bug 1.9 / Pass-2 P5] Double-click / retried requests used to spawn
  // unbounded pending mandates for the same user+plan — including every
  // telecaller link-send, which always carries attribution. The
  // pending-row reuse below applies to ALL flows.
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
    .select("id,coupon_id,acquisition_channel,sales_agent_id,telecaller_id,created_at")
    .eq("user_id", userId)
    .eq("plan_id", plan.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingPending = existingPendingRow as {
    id: string;
    coupon_id: string | null;
    acquisition_channel: string | null;
    sales_agent_id: string | null;
    telecaller_id: string | null;
    created_at: string;
  } | null;

  // The gateway identifiers now live on the mandate, not the
  // subscription — one extra read, and the whole flow stops caring
  // which provider issued it.
  const existingMandate = existingPending
    ? await getCurrentMandate(adminDb, existingPending.id)
    : null;

  // ── [SESSION_STUCK_PENDING_CHECKOUT — Bug A fix] ────────────────
  // An abandoned checkout sheet stays `created` on the GATEWAY'S side
  // forever and fires ZERO webhooks. The old unconditional reuse handed
  // the same dead id back on every retry — Chirayu's own Premium
  // checkout bounced twice against two stuck `Created` subscriptions.
  // Policy:
  //   • ≤ PENDING_REUSE_WINDOW_MINUTES old → reuse (the genuine
  //     double-click fast path [Bug 1.9] stays untouched).
  //   • older than the window → NEVER trust the cached id blind; ask
  //     the gateway what it actually is:
  //       'created'                        → abandoned sheet: cancel
  //                                          upstream, delete the local
  //                                          row (mandate cascades),
  //                                          audit, fresh creation.
  //       'cancelled'/'expired'/'completed'→ already terminal there:
  //                                          delete locally, audit,
  //                                          fresh creation.
  //       live (authenticated/active/pending/halted)
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
  //                                          (a gateway hiccup must not
  //                                          become a 500 or a trap).
  if (existingPending && existingMandate) {
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
      return outcomeFromExistingMandate({
        subscriptionDbId: existingPending.id,
        mandate: existingMandate,
        plan,
        couponCode: existingPending.coupon_id ? couponCode : null,
        coupon: existingPending.coupon_id && couponDecision?.ok ? couponDecision.coupon : null,
      });
    }

    const ageMinutes = Math.max(
      0,
      Math.round((Date.now() - Date.parse(existingPending.created_at)) / 60_000),
    );
    let remoteStatus: MandateStatus | null = null;
    try {
      remoteStatus = await syncMandateFromGateway(adminDb, existingMandate);
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
            gateway: existingMandate.gateway,
            gateway_mandate_id: existingMandate.gateway_mandate_id,
            age_minutes: ageMinutes,
          },
        });
      } catch {
        /* audit is best-effort */
      }
      // fall through — keep row AND object, create fresh below
    }

    const auditDiscard = async () => {
      try {
        await adminDb.from("audit_logs").insert({
          admin_id: null,
          action: "checkout.stale_pending_discarded",
          entity: "subscriptions",
          entity_id: existingPending.id,
          meta: {
            gateway: existingMandate.gateway,
            gateway_mandate_id: existingMandate.gateway_mandate_id,
            gateway_status: remoteStatus,
            age_minutes: ageMinutes,
          },
        });
      } catch {
        /* audit is best-effort */
      }
    };

    if (remoteStatus === "created") {
      // The exact live-incident shape: an unauthenticated sheet whose
      // retries could never complete. Retire BOTH sides, then recreate.
      await retireMandate(adminDb, existingMandate, "abandoned_checkout", {
        cancelAtGateway: true,
      });
      await adminDb
        .from("subscriptions")
        .delete()
        .eq("id", existingPending.id)
        .eq("user_id", userId);
      await auditDiscard();
    } else if (remoteStatus && isTerminalMandateStatus(remoteStatus)) {
      // Terminal upstream already — nothing to cancel there. Deleting
      // the subscription cascades the mandate row away.
      await adminDb
        .from("subscriptions")
        .delete()
        .eq("id", existingPending.id)
        .eq("user_id", userId);
      await auditDiscard();
    } else if (remoteStatus !== null) {
      // Mandate possibly alive (authenticated/active/pending/halted):
      // preserve it for webhook reconciliation, fresh checkout alongside.
      try {
        await adminDb.from("audit_logs").insert({
          admin_id: null,
          action: "checkout.stale_pending_kept_alive_mandate",
          entity: "subscriptions",
          entity_id: existingPending.id,
          meta: {
            gateway: existingMandate.gateway,
            gateway_mandate_id: existingMandate.gateway_mandate_id,
            gateway_status: remoteStatus,
            age_minutes: ageMinutes,
          },
        });
      } catch {
        /* audit is best-effort */
      }
    }
    // In every non-reuse branch control falls through to the normal
    // fresh-creation path below exactly as if this row hadn't existed.
  } else if (existingPending && !existingMandate) {
    // Unusable orphan from a crashed creation — the error path below
    // deletes these; remove it so the fresh insert is the only row.
    await adminDb.from("subscriptions").delete().eq("id", existingPending.id).eq("user_id", userId);
  }

  // Pending row FIRST so it exists before money moves; the mandate is
  // attached immediately after, before checkout opens.
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

  // [Pass-2 P3] Track the mandate so ANY failure after its creation
  // can retire it — otherwise every error path leaks a live
  // money-collecting object whose webhooks resolve to a deleted row.
  let createdMandate: Awaited<ReturnType<typeof createMandateForSubscription>> | null = null;

  try {
    createdMandate = await createMandateForSubscription(adminDb, {
      subscriptionId: subRow.id,
      planId: plan.id,
      billingPeriod: plan.billing_period,
      couponCode,
      // First mandate on a brand-new pending subscription: nothing to
      // displace, so it charges as soon as the customer authorises it.
      isCurrent: true,
    });

    // A failover that succeeded is still an incident worth seeing —
    // record which gateways refused before this one accepted.
    if (createdMandate.failedAttempts.length > 0) {
      try {
        await adminDb.from("audit_logs").insert({
          admin_id: null,
          action: "checkout.gateway_failover",
          entity: "subscription_mandates",
          entity_id: createdMandate.mandateId,
          meta: {
            subscription_id: subRow.id,
            used_gateway: createdMandate.gateway,
            failed_attempts: createdMandate.failedAttempts,
          },
        });
      } catch {
        /* audit is best-effort */
      }
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
      mandateId: createdMandate.mandateId,
      gateway: createdMandate.gateway,
      gatewayMandateId: createdMandate.gatewayMandateId,
      gatewayCustomerId: createdMandate.gatewayCustomerId,
      gatewayPublicKey: createdMandate.publicKey,
      checkoutStrategy: createdMandate.checkoutStrategy,
      hostedCheckoutUrl: createdMandate.shortUrl,
      planName: plan.name,
      planPricePaise: plan.price_paise,
      couponCode,
      coupon: couponDecision && couponDecision.ok ? couponDecision.coupon : null,
    };
  } catch (err) {
    // No orphaned pending rows from failed gateway calls — and no
    // orphaned GATEWAY objects either (Pass-2 P3): the mandate we just
    // raised is cancelled best-effort so its webhooks never land on a
    // row that no longer exists.
    if (createdMandate) {
      await retireMandate(
        adminDb,
        {
          id: createdMandate.mandateId,
          gateway: createdMandate.gateway,
          gateway_mandate_id: createdMandate.gatewayMandateId,
        },
        "checkout_failed",
        { cancelAtGateway: true },
      ).catch(() => {});
    }
    await adminDb.from("subscriptions").delete().eq("id", subRow.id).eq("user_id", userId);
    // A gateway/mandate fault reaching here is an operational failure,
    // not a code bug — translate it to the checkout vocabulary the
    // route already knows how to serialise.
    if (err instanceof MandateError) throw new CheckoutError(err.message, err.status);
    throw err;
  }
}
