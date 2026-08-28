import type { SupabaseClient } from "@supabase/supabase-js";
import { razorpayAdapter } from "./razorpay";
import { GatewayError, type GatewayId, type PaymentGatewayAdapter } from "./types";

// ─────────────────────────────────────────────────────────────
// PUNYATA — Gateway registry: selection, circuit breaker, failover
//
// "What if the Razorpay account gets blocked for a few days?" — this
// module is the answer. It decides WHICH gateway serves a given plan
// right now, and fails over when one is unwell.
//
// THREE INDEPENDENT WAYS A GATEWAY LEAVES ROTATION
//   1. Not configured   — credentials absent in this deployment.
//                         Checked in code; never selected.
//   2. Manual kill switch — payment_gateways.is_enabled = false. An
//                         owner flips this the moment an account is
//                         frozen, without a deploy.
//   3. Circuit breaker  — N consecutive failures trip it for a
//                         cool-off window. AUTOMATIC.
//
// WHY THE BREAKER LIVES IN POSTGRES, NOT IN MEMORY
// Every serverless invocation starts cold, so an in-process breaker
// would forget the last 50 failures and hammer a dead provider on
// every single request — a breaker that never trips. State shared
// through the database is the only kind that works here.
//
// FAILOVER IS NOT UNCONDITIONAL. Only GatewayError.retryable faults
// (provider down, credentials rejected, timeout) move to the next
// gateway. A malformed-request fault (a 400 like the 2026-08-28
// end_time rejection) stops immediately: every provider would reject
// it identically, and retrying would bury OUR bug behind a fallback.
// ─────────────────────────────────────────────────────────────

/** Consecutive failures that trip a gateway's breaker. */
export const BREAKER_FAILURE_THRESHOLD = 3;
/** How long a tripped breaker stays open before the next attempt
 *  probes the gateway again (half-open by lapsing). */
export const BREAKER_COOLOFF_SECONDS = 300;

/**
 * Every adapter this build knows how to speak. Adding a gateway =
 * one adapter module + one entry here + a payment_gateways row +
 * plan_gateway_refs rows. No changes to checkout, webhooks, or the
 * subscription schema.
 */
const ADAPTERS: Record<GatewayId, PaymentGatewayAdapter> = {
  [razorpayAdapter.id]: razorpayAdapter,
};

export function getAdapter(gateway: GatewayId): PaymentGatewayAdapter {
  const adapter = ADAPTERS[gateway];
  if (!adapter) {
    throw new GatewayError(gateway, `No adapter compiled in for gateway "${gateway}"`, {
      retryable: false,
    });
  }
  return adapter;
}

export function knownGatewayIds(): GatewayId[] {
  return Object.keys(ADAPTERS);
}

export interface GatewayCandidate {
  gateway: GatewayId;
  adapter: PaymentGatewayAdapter;
  /** This plan's id at this gateway (plan_gateway_refs). */
  gatewayPlanId: string;
}

/**
 * The gateways that can sell THIS plan right now, best first.
 *
 * A gateway qualifies only if all four hold:
 *   • an adapter is compiled in (we can speak its API),
 *   • it is enabled with an un-tripped breaker (usable_payment_gateways),
 *   • credentials are present in this deployment,
 *   • the plan has an active id at that gateway.
 *
 * That last condition is the one people forget: a fallback gateway
 * with no plan id configured is not a fallback, it is a 500 waiting
 * to happen. Callers get an ordered list and try them in turn.
 */
export async function candidatesForPlan(
  db: SupabaseClient,
  planId: string,
): Promise<GatewayCandidate[]> {
  const { data: usableRows, error: usableErr } = await db.rpc("usable_payment_gateways");
  if (usableErr) {
    throw new Error(`usable_payment_gateways failed: ${usableErr.message}`);
  }
  const ordered = (usableRows ?? []) as { gateway: string; priority: number }[];

  const { data: refRows, error: refErr } = await db
    .from("plan_gateway_refs")
    .select("gateway,gateway_plan_id")
    .eq("plan_id", planId)
    .eq("is_active", true);
  if (refErr) {
    throw new Error(`plan_gateway_refs lookup failed: ${refErr.message}`);
  }
  const planRefs = new Map(
    ((refRows ?? []) as { gateway: string; gateway_plan_id: string }[]).map((r) => [
      r.gateway,
      r.gateway_plan_id,
    ]),
  );

  const candidates: GatewayCandidate[] = [];
  for (const row of ordered) {
    const adapter = ADAPTERS[row.gateway];
    if (!adapter || !adapter.isConfigured()) continue;
    const gatewayPlanId = planRefs.get(row.gateway);
    if (!gatewayPlanId) continue;
    candidates.push({ gateway: row.gateway, adapter, gatewayPlanId });
  }
  return candidates;
}

// ─── Breaker bookkeeping ─────────────────────────────────────

export async function recordGatewayFailure(
  db: SupabaseClient,
  gateway: GatewayId,
  reason: string,
): Promise<void> {
  const { error } = await db.rpc("gateway_record_failure", {
    p_gateway: gateway,
    p_reason: reason,
    p_threshold: BREAKER_FAILURE_THRESHOLD,
    p_cooloff_seconds: BREAKER_COOLOFF_SECONDS,
  });
  // Health telemetry must never be the reason a checkout fails — the
  // customer's payment matters more than our bookkeeping.
  if (error) console.error(`gateway_record_failure(${gateway}) failed:`, error.message);
}

export async function recordGatewaySuccess(db: SupabaseClient, gateway: GatewayId): Promise<void> {
  const { error } = await db.rpc("gateway_record_success", { p_gateway: gateway });
  if (error) console.error(`gateway_record_success(${gateway}) failed:`, error.message);
}

// ─── Failover executor ──────────────────────────────────────

export interface FailoverAttempt {
  gateway: GatewayId;
  error: string;
  retryable: boolean;
}

export class AllGatewaysFailedError extends Error {
  readonly attempts: FailoverAttempt[];
  constructor(attempts: FailoverAttempt[]) {
    const detail = attempts.map((a) => `${a.gateway}: ${a.error}`).join(" | ") || "none available";
    super(`All payment gateways failed (${detail})`);
    this.name = "AllGatewaysFailedError";
    this.attempts = attempts;
  }
}

export interface FailoverResult<T> {
  value: T;
  gateway: GatewayId;
  gatewayPlanId: string;
  /** Gateways tried and rejected before this one succeeded. Recorded
   *  in the audit trail so a silent failover is still visible. */
  failedAttempts: FailoverAttempt[];
}

/**
 * Runs `attempt` against each candidate in priority order until one
 * succeeds, maintaining breaker state as it goes.
 *
 * Non-retryable failures abort the whole sequence immediately — see
 * the module header for why that is the correct behaviour and not a
 * missed opportunity to retry.
 */
export async function withGatewayFailover<T>(
  db: SupabaseClient,
  candidates: GatewayCandidate[],
  attempt: (candidate: GatewayCandidate) => Promise<T>,
): Promise<FailoverResult<T>> {
  const failedAttempts: FailoverAttempt[] = [];

  for (const candidate of candidates) {
    try {
      const value = await attempt(candidate);
      await recordGatewaySuccess(db, candidate.gateway);
      return {
        value,
        gateway: candidate.gateway,
        gatewayPlanId: candidate.gatewayPlanId,
        failedAttempts,
      };
    } catch (err) {
      const retryable = err instanceof GatewayError ? err.retryable : true;
      const countsAgainstHealth = err instanceof GatewayError ? err.countsAgainstHealth : true;
      const message = err instanceof Error ? err.message : String(err);
      failedAttempts.push({ gateway: candidate.gateway, error: message, retryable });

      if (!retryable) {
        // OUR request was invalid. Not the gateway's fault, so the
        // breaker is left alone (tripping it would take a healthy
        // provider out of rotation over our own bug) and no other
        // gateway is tried — they would all reject it identically.
        throw err;
      }

      if (countsAgainstHealth) {
        // Provider-side fault — count it toward the breaker so a
        // sustained outage stops being attempted at all.
        await recordGatewayFailure(db, candidate.gateway, message);
      }
      // else: this gateway simply cannot serve THIS request (e.g. no
      // legal mandate tenure left before its calendar ceiling) while
      // being perfectly healthy. Move on to the next candidate without
      // marking it down — see GatewayError.countsAgainstHealth.
    }
  }

  throw new AllGatewaysFailedError(failedAttempts);
}
