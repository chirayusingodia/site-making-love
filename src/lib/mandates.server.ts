import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AllGatewaysFailedError,
  candidatesForPlan,
  getAdapter,
  withGatewayFailover,
  type FailoverAttempt,
} from "@/lib/gateways/registry";
import {
  MANDATE_TENURE_YEARS,
  expectedEndAt,
  tenureFitsGatewayCeiling,
  totalCountForTenure,
  type BillingPeriod,
} from "@/lib/gateways/tenure";
import {
  GatewayError,
  isTerminalMandateStatus,
  type GatewayId,
  type MandateStatus,
} from "@/lib/gateways/types";

// ─────────────────────────────────────────────────────────────
// PUNYATA — Mandate lifecycle (server-only)
//
// A SUBSCRIPTION is the customer relationship: permanent, no gateway
// identifiers, cancelled only when the subscriber (or an admin) says
// so. A MANDATE is the instrument that collects money for it:
// time-boxed by law (RBI/NPCI require a fixed debit count), tied to
// ONE gateway, and therefore REPLACEABLE.
//
// This module owns every transition of that instrument:
//   create   — with gateway failover (registry picks the provider)
//   sync     — reconcile our row with what the gateway reports
//   renew    — raise a replacement before the incumbent runs out
//   promote  — swap the replacement in once the customer authorises it
//   retire   — stand a mandate down, optionally cancelling it upstream
//
// ACTIVATION DISCIPLINE (unchanged): nothing here writes
// subscriptions.status. Mandate status and subscription status are
// separate facts — a dead mandate does not by itself end a
// subscription, which is exactly what makes renewal possible.
// ─────────────────────────────────────────────────────────────

export class MandateError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "MandateError";
    this.status = status;
  }
}

export interface MandateRow {
  id: string;
  subscription_id: string;
  gateway: GatewayId;
  gateway_mandate_id: string;
  gateway_customer_id: string | null;
  gateway_plan_id: string | null;
  status: MandateStatus;
  total_count: number;
  tenure_years: number | null;
  cycles_paid: number;
  expected_end_at: string | null;
  is_current: boolean;
  replaces_mandate_id: string | null;
  renewal_started_at: string | null;
  retired_at: string | null;
  retire_reason: string | null;
  created_at: string;
}

const MANDATE_COLUMNS =
  "id,subscription_id,gateway,gateway_mandate_id,gateway_customer_id,gateway_plan_id,status," +
  "total_count,tenure_years,cycles_paid,expected_end_at,is_current,replaces_mandate_id," +
  "renewal_started_at,retired_at,retire_reason,created_at";

// ─── Reads ───────────────────────────────────────────────────

/** The mandate currently authorised to charge, if any. The partial
 *  unique index guarantees at most one. */
export async function getCurrentMandate(
  db: SupabaseClient,
  subscriptionId: string,
): Promise<MandateRow | null> {
  const { data, error } = await db
    .from("subscription_mandates")
    .select(MANDATE_COLUMNS)
    .eq("subscription_id", subscriptionId)
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw new MandateError(`current mandate lookup failed: ${error.message}`);
  return (data as MandateRow | null) ?? null;
}

/** Resolves a webhook's (gateway, gateway id) pair back to our rows.
 *  This is the replacement for the old subscriptions.razorpay_sub_id
 *  lookup — and the reason a second gateway needs no schema change. */
export async function findMandateByGatewayId(
  db: SupabaseClient,
  gateway: GatewayId,
  gatewayMandateId: string,
): Promise<MandateRow | null> {
  const { data, error } = await db
    .from("subscription_mandates")
    .select(MANDATE_COLUMNS)
    .eq("gateway", gateway)
    .eq("gateway_mandate_id", gatewayMandateId)
    .maybeSingle();
  if (error) throw new MandateError(`mandate lookup failed: ${error.message}`);
  return (data as MandateRow | null) ?? null;
}

// ─── Creation (with failover) ───────────────────────────────

export interface CreateMandateOptions {
  subscriptionId: string;
  planId: string;
  billingPeriod: BillingPeriod;
  couponCode?: string | null;
  /**
   * Whether this mandate becomes the charging one immediately.
   * true  — first mandate on a fresh subscription (nothing to displace).
   * false — a RENEWAL replacement: it must not displace a working
   *         mandate until the customer has authorised it, so it is
   *         born dormant and promoted later by promoteMandate().
   */
  isCurrent: boolean;
  replacesMandateId?: string | null;
  /** Override the policy tenure. Almost never wanted. */
  tenureYears?: number;
}

export interface CreatedMandate {
  mandateId: string;
  gateway: GatewayId;
  gatewayMandateId: string;
  gatewayCustomerId: string | null;
  publicKey: string | null;
  checkoutStrategy: string;
  shortUrl: string | null;
  totalCount: number;
  tenureYears: number;
  /** Gateways that failed before this one worked — audited so a
   *  silent failover is never invisible after the fact. */
  failedAttempts: FailoverAttempt[];
}

/**
 * Raises a new mandate for a subscription, trying each eligible
 * gateway in priority order.
 *
 * Tenure is computed PER GATEWAY, because the calendar ceiling is a
 * per-provider fact — the same 50-year policy yields a different
 * total_count at a provider with a 2120 wall than at one with none.
 * Nothing in this path may pass a literal cycle count; that is the
 * bug of 2026-08-28, and tenureFitsGatewayCeiling() re-checks the
 * derived value before it is ever sent.
 */
export async function createMandateForSubscription(
  db: SupabaseClient,
  opts: CreateMandateOptions,
): Promise<CreatedMandate> {
  const tenureYears = opts.tenureYears ?? MANDATE_TENURE_YEARS;

  const candidates = await candidatesForPlan(db, opts.planId);
  if (candidates.length === 0) {
    // Either no gateway is healthy, or this plan has no gateway plan
    // id configured. Both are operational states, not code bugs — say
    // so in a customer-safe way and let the caller surface it.
    throw new MandateError(
      "Payment ke liye koi gateway available nahi hai. Kripya thodi der baad try karein.",
      503,
    );
  }

  // Our id is minted up front so it can ride along in the gateway's
  // notes — every webhook payload then carries a direct pointer back
  // to this exact row, even before the row exists.
  const mandateDbId = randomUUID();

  const result = await withGatewayFailover(db, candidates, async (candidate) => {
    const totalCount = totalCountForTenure({
      period: opts.billingPeriod,
      years: tenureYears,
      maxEndTimeSeconds: candidate.adapter.maxEndTimeSeconds,
    });

    // 0 = this gateway has under one cycle of headroom left before its
    // calendar ceiling, so NO legal tenure exists here. Fail over to a
    // provider that can serve it, WITHOUT marking this one unhealthy —
    // it is working fine, it just cannot sell this cadence any more.
    if (totalCount < 1) {
      throw new GatewayError(
        candidate.gateway,
        `${candidate.gateway} has no legal ${opts.billingPeriod} tenure left before its end_time ceiling`,
        { retryable: true, countsAgainstHealth: false },
      );
    }

    // Belt-and-braces: never hand a gateway a tenure we have not
    // proven lands inside its advertised window. Unlike the case above
    // this one means the DERIVATION disagrees with the GUARD — a code
    // bug, not an operational state — so it is non-retryable: every
    // gateway would be handed the same broken arithmetic.
    if (
      !tenureFitsGatewayCeiling({
        period: opts.billingPeriod,
        totalCount,
        maxEndTimeSeconds: candidate.adapter.maxEndTimeSeconds,
      })
    ) {
      throw new GatewayError(
        candidate.gateway,
        `derived tenure (${totalCount} cycles of ${opts.billingPeriod}) exceeds ${candidate.gateway}'s end_time ceiling`,
        { retryable: false },
      );
    }

    const mandate = await candidate.adapter.createMandate({
      gatewayPlanId: candidate.gatewayPlanId,
      subscriptionDbId: opts.subscriptionId,
      mandateDbId,
      couponCode: opts.couponCode ?? null,
      totalCount,
    });
    return { mandate, totalCount };
  });

  const { mandate, totalCount } = result.value;
  const adapter = getAdapter(result.gateway);

  const { error: insErr } = await db.from("subscription_mandates").insert({
    id: mandateDbId,
    subscription_id: opts.subscriptionId,
    gateway: result.gateway,
    gateway_mandate_id: mandate.gatewayMandateId,
    gateway_customer_id: mandate.gatewayCustomerId,
    gateway_plan_id: result.gatewayPlanId,
    status: mandate.status,
    total_count: totalCount,
    tenure_years: tenureYears,
    expected_end_at: expectedEndAt(opts.billingPeriod, totalCount).toISOString(),
    is_current: opts.isCurrent,
    ...(opts.replacesMandateId
      ? {
          replaces_mandate_id: opts.replacesMandateId,
          renewal_started_at: new Date().toISOString(),
        }
      : {}),
  });

  if (insErr) {
    // The mandate exists upstream but we cannot record it, so its
    // webhooks would resolve to nothing. Retire it rather than leak a
    // live money-collecting object we have lost track of.
    await adapter.cancelMandate(mandate.gatewayMandateId).catch(() => {});
    throw new MandateError(`recording mandate failed: ${insErr.message}`);
  }

  return {
    mandateId: mandateDbId,
    gateway: result.gateway,
    gatewayMandateId: mandate.gatewayMandateId,
    gatewayCustomerId: mandate.gatewayCustomerId,
    publicKey: adapter.publicKey(),
    checkoutStrategy: adapter.checkoutStrategy,
    shortUrl: mandate.shortUrl,
    totalCount,
    tenureYears,
    failedAttempts: result.failedAttempts,
  };
}

// ─── Sync / retire / promote ────────────────────────────────

/**
 * Asks the gateway what a mandate's real state is and records it.
 * Used before deciding whether to reuse a stale pending checkout: an
 * abandoned sheet stays `created` upstream forever and fires no
 * webhooks, so our own row can never answer this question alone.
 */
export async function syncMandateFromGateway(
  db: SupabaseClient,
  mandate: MandateRow,
): Promise<MandateStatus> {
  const adapter = getAdapter(mandate.gateway);
  const remote = await adapter.fetchMandate(mandate.gateway_mandate_id);
  if (remote.status !== mandate.status) {
    await db
      .from("subscription_mandates")
      .update({
        status: remote.status,
        ...(remote.gatewayCustomerId ? { gateway_customer_id: remote.gatewayCustomerId } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", mandate.id);
  }
  return remote.status;
}

/**
 * Stands a mandate down. cancelAtGateway=false is for mandates that
 * are ALREADY terminal upstream (nothing to cancel) or that we must
 * deliberately leave alive — never cancel a working mandate just
 * because our bookkeeping moved on.
 */
export async function retireMandate(
  db: SupabaseClient,
  mandate: Pick<MandateRow, "id" | "gateway" | "gateway_mandate_id">,
  reason: string,
  opts: { cancelAtGateway: boolean } = { cancelAtGateway: true },
): Promise<void> {
  if (opts.cancelAtGateway) {
    // Best-effort by contract: a failed cancel leaves the same orphan
    // that would have existed without this call.
    await getAdapter(mandate.gateway)
      .cancelMandate(mandate.gateway_mandate_id)
      .catch((err) =>
        console.error(
          `retireMandate: cancel at ${mandate.gateway} failed:`,
          err instanceof Error ? err.message : err,
        ),
      );
  }
  const nowIso = new Date().toISOString();
  const { error } = await db
    .from("subscription_mandates")
    .update({
      is_current: false,
      status: "cancelled",
      retired_at: nowIso,
      retire_reason: reason,
      updated_at: nowIso,
    })
    .eq("id", mandate.id);
  if (error) throw new MandateError(`retiring mandate failed: ${error.message}`);
}

/**
 * Makes a replacement mandate the charging one, atomically retiring
 * the incumbent (promote_mandate() in migration 022 — the swap must
 * be one transaction or the one-current-per-subscription index can be
 * transiently violated by two racing webhook deliveries).
 *
 * The displaced mandate is then cancelled upstream so the customer is
 * never exposed to two live mandates that could both debit them.
 */
export async function promoteMandate(db: SupabaseClient, mandateId: string): Promise<void> {
  const { data, error } = await db.rpc("promote_mandate", { p_mandate_id: mandateId });
  if (error) throw new MandateError(`promote_mandate failed: ${error.message}`);

  const retired = (data ?? []) as {
    retired_gateway: string;
    retired_gateway_mandate_id: string;
  }[];

  for (const row of retired) {
    await getAdapter(row.retired_gateway)
      .cancelMandate(row.retired_gateway_mandate_id)
      .catch((err) =>
        console.error(
          `promoteMandate: cancelling displaced mandate ${row.retired_gateway_mandate_id} failed:`,
          err instanceof Error ? err.message : err,
        ),
      );
  }
}

/** Records a settled cycle. Drives the renewal sweep's
 *  cycles-remaining test without a round trip to the gateway. */
export async function recordMandateCycle(
  db: SupabaseClient,
  mandateId: string,
  cyclesPaid: number | null,
  status: MandateStatus | null,
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof cyclesPaid === "number" && cyclesPaid >= 0) patch.cycles_paid = cyclesPaid;
  if (status) patch.status = status;
  if (Object.keys(patch).length === 1) return;
  const { error } = await db.from("subscription_mandates").update(patch).eq("id", mandateId);
  if (error) console.error(`recordMandateCycle failed: ${error.message}`);
}

// ─── Renewal sweep ──────────────────────────────────────────

/**
 * Days before a mandate's expected end at which we start raising its
 * replacement. Generous on purpose: a UPI Autopay renewal needs the
 * CUSTOMER to authorise the new mandate, so the window has to be long
 * enough to notify them, let them ignore it, remind them, and still
 * have the old mandate charging throughout.
 */
export const RENEWAL_LOOKAHEAD_DAYS = 90;

/** Also renew when this few debits remain, regardless of dates — a
 *  mandate can exhaust its count before its calendar estimate. */
export const RENEWAL_LOOKAHEAD_CYCLES = 2;

export interface RenewalCandidate {
  mandate: MandateRow;
  subscriptionId: string;
  planId: string;
  billingPeriod: BillingPeriod;
  userId: string;
  reason: "expiring_soon" | "cycles_exhausted" | "terminal_upstream";
}

/**
 * Finds active subscriptions whose charging mandate is running out.
 *
 * Deliberately scoped to status='active': a cancelled or expired
 * subscription has no claim on a new mandate, and a pending one has
 * not been paid for yet.
 */
export async function findMandatesDueForRenewal(
  db: SupabaseClient,
  limit = 100,
): Promise<RenewalCandidate[]> {
  const horizon = new Date(Date.now() + RENEWAL_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("subscription_mandates")
    .select(
      `${MANDATE_COLUMNS},subscriptions!inner(id,user_id,plan_id,status,plans!inner(billing_period))`,
    )
    .eq("is_current", true)
    .eq("subscriptions.status", "active")
    .is("renewal_started_at", null)
    .limit(limit);
  if (error) throw new MandateError(`renewal sweep failed: ${error.message}`);

  interface EmbeddedSubscription {
    id: string;
    user_id: string;
    plan_id: string;
    status: string;
    plans: { billing_period: BillingPeriod } | { billing_period: BillingPeriod }[] | null;
  }

  // PostgREST embeds a to-one relation as an OBJECT at runtime, but the
  // generated types describe it as an array. Normalise both shapes
  // rather than trusting either — a wrong guess here silently yields
  // zero renewal candidates forever, which is the kind of bug a
  // safety-net job would hide for years.
  const first = <T>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const rows = (data ?? []) as unknown as (MandateRow & {
    subscriptions: EmbeddedSubscription | EmbeddedSubscription[] | null;
  })[];

  const due: RenewalCandidate[] = [];
  for (const row of rows) {
    const sub = first(row.subscriptions);
    const plan = first(sub?.plans);
    if (!sub || !plan?.billing_period) continue;

    let reason: RenewalCandidate["reason"] | null = null;
    if (isTerminalMandateStatus(row.status)) {
      // Already finished upstream — the subscription is live with no
      // working instrument behind it. Most urgent case.
      reason = "terminal_upstream";
    } else if (row.total_count - row.cycles_paid <= RENEWAL_LOOKAHEAD_CYCLES) {
      reason = "cycles_exhausted";
    } else if (row.expected_end_at && row.expected_end_at <= horizon) {
      reason = "expiring_soon";
    }
    if (!reason) continue;

    due.push({
      mandate: row,
      subscriptionId: sub.id,
      planId: sub.plan_id,
      billingPeriod: plan.billing_period,
      userId: sub.user_id,
      reason,
    });
  }
  return due;
}

/**
 * Raises a replacement mandate for one expiring mandate and queues
 * the customer notification that asks them to authorise it.
 *
 * WHY THE SWAP IS NOT SILENT: a card-network subscription can be
 * migrated to a fresh token server-side (that is what Stripe's
 * account updater does, and why Spotify never asks). A UPI Autopay
 * mandate cannot — NPCI requires the payer's consent to register a
 * new one. So the honest flow is: raise the replacement, keep the OLD
 * mandate charging, ask the customer to approve the new one, and
 * promote it only when its webhook confirms authorisation. The
 * subscriber sees one consent tap, never an interruption in service.
 */
export async function startMandateRenewal(
  db: SupabaseClient,
  candidate: RenewalCandidate,
): Promise<{ ok: true; newMandateId: string } | { ok: false; error: string }> {
  try {
    const created = await createMandateForSubscription(db, {
      subscriptionId: candidate.subscriptionId,
      planId: candidate.planId,
      billingPeriod: candidate.billingPeriod,
      // Dormant until the customer authorises it — see above.
      isCurrent: false,
      replacesMandateId: candidate.mandate.id,
    });

    // Stamp the incumbent so the sweep does not re-raise a
    // replacement for it on every run.
    await db
      .from("subscription_mandates")
      .update({
        renewal_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidate.mandate.id);

    await db.from("notifications").insert({
      user_id: candidate.userId,
      type: "mandate_renewal_required",
      channel: "whatsapp",
      status: "pending",
      message:
        "Namaste 🙏 Aapki Punyata sewa jaari rakhne ke liye payment mandate renew karna hai. " +
        "Neeche diye link se ek baar approve kar dein — aapki sewa bina rukavat chalti rahegi.",
      meta: {
        subscription_id: candidate.subscriptionId,
        old_mandate_id: candidate.mandate.id,
        new_mandate_id: created.mandateId,
        gateway: created.gateway,
        reason: candidate.reason,
      },
    });

    await db.from("audit_logs").insert({
      admin_id: null,
      action: "mandate.renewal_started",
      entity: "subscription_mandates",
      entity_id: created.mandateId,
      meta: {
        subscription_id: candidate.subscriptionId,
        replaces_mandate_id: candidate.mandate.id,
        reason: candidate.reason,
        gateway: created.gateway,
        previous_gateway: candidate.mandate.gateway,
        total_count: created.totalCount,
        tenure_years: created.tenureYears,
        failed_gateway_attempts: created.failedAttempts,
      },
    });

    return { ok: true, newMandateId: created.mandateId };
  } catch (err) {
    const message =
      err instanceof AllGatewaysFailedError || err instanceof Error
        ? err.message
        : "renewal failed";
    // A failed renewal must not abort the sweep — the next run
    // retries, and the incumbent mandate is still charging meanwhile.
    await db
      .from("audit_logs")
      .insert({
        admin_id: null,
        action: "mandate.renewal_failed",
        entity: "subscription_mandates",
        entity_id: candidate.mandate.id,
        meta: {
          subscription_id: candidate.subscriptionId,
          reason: candidate.reason,
          error: message,
        },
      })
      .then(undefined, () => {
        /* audit is best-effort inside a failure path */
      });
    return { ok: false, error: message };
  }
}
