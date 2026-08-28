// ─────────────────────────────────────────────────────────────
// PUNYATA — Mandate tenure arithmetic (pure, gateway-neutral)
//
// THE INCIDENT THIS MODULE EXISTS TO PREVENT (2026-08-28)
// Every checkout failed with:
//   "end_time must be between 946684800 and 4765046400"
// because tenure was a hardcoded constant — 100 years of cycles —
// while the gateway's limit is a FIXED CALENDAR DATE (2120-12-31).
// "now + 100 years" already overshoots that wall in 2026, and any
// other flat constant would overshoot it too, just later. A constant
// can never be correct against a moving deadline.
//
// So: tenure is DERIVED from the time actually remaining to the
// gateway's ceiling, clamped to our own policy tenure. It shrinks on
// its own as the calendar advances; nothing here can drift out of
// range with age.
//
// WHY MANDATES ARE TIME-BOXED AT ALL
// RBI/NPCI require every UPI Autopay / e-mandate to carry a fixed
// debit count or validity — "charge forever" is not expressible. The
// subscription is permanent; the mandate under it is a renewable
// instrument (see subscription_mandates + mandates.server.ts).
// ─────────────────────────────────────────────────────────────

export type BillingPeriod = "monthly" | "yearly";

/**
 * Tenure requested per mandate. 50 years is deliberately far longer
 * than any subscriber will hold the plan, so renewal is a safety net
 * that realistically never fires — while staying comfortably inside
 * the gateway ceiling for decades (~94 years of headroom as of 2026),
 * unlike the 100 that broke it.
 */
export const MANDATE_TENURE_YEARS = 50;

/** Billable cycles per year per billing_period. Exhaustive Record:
 *  adding a third period to BillingPeriod FAILS TO COMPILE until it
 *  gets a row here — a new cadence can never silently fall back to
 *  someone else's cycle length. */
export const CYCLES_PER_YEAR: Record<BillingPeriod, number> = {
  monthly: 12,
  yearly: 1,
};

/**
 * Deliberately GENEROUS per-cycle length. Used to divide the
 * available headroom into cycles, so over-estimating the cycle makes
 * us UNDER-count cycles — erring toward a shorter mandate that is
 * definitely legal, never a longer one that gets rejected.
 */
export const MAX_CYCLE_SECONDS: Record<BillingPeriod, number> = {
  monthly: 31 * 24 * 60 * 60,
  yearly: 366 * 24 * 60 * 60,
};

/**
 * Distance we keep from the gateway's hard ceiling. Absorbs clock
 * skew between us and the gateway, plus its own start_at/end_time
 * rounding — landing exactly ON the boundary is still a rejection.
 */
export const CEILING_SAFETY_BUFFER_DAYS = 30;

export interface TenureInput {
  period: BillingPeriod;
  /** Policy tenure to request. Defaults to MANDATE_TENURE_YEARS. */
  years?: number;
  /**
   * The gateway's absolute end_time ceiling in unix SECONDS, or null
   * for a gateway with no calendar limit (most card-network rails
   * outside India). Razorpay: 4765046400 (2120-12-31).
   */
  maxEndTimeSeconds: number | null;
  /** Injectable for tests; defaults to now. */
  nowSeconds?: number;
}

/**
 * How many debit cycles to request for a new mandate:
 * min(policy tenure, headroom to the gateway ceiling).
 *
 * RETURNS 0 when this gateway can offer NO legal tenure at all for
 * this cadence — i.e. less than one whole cycle of headroom remains
 * before its ceiling.
 *
 * 0 is a deliberate signal, not a clamp failure. An earlier draft
 * forced a floor of 1 here, reasoning that selling the shortest
 * possible mandate beats failing a checkout. That was wrong: below one
 * cycle of headroom, even a 1-cycle mandate computes an end_time PAST
 * the ceiling, so the "graceful" fallback was a request guaranteed to
 * be rejected — reproducing the 2026-08-28 error with extra steps.
 *
 * The honest answer is "not this gateway", which lets the registry
 * fail over to a provider that CAN serve it (one with a later ceiling,
 * or none at all). Callers must treat 0 as "gateway unavailable for
 * this plan", never pass it to an API.
 */
export function totalCountForTenure(input: TenureInput): number {
  const years = input.years ?? MANDATE_TENURE_YEARS;
  const policyMaxCycles = Math.floor(years * CYCLES_PER_YEAR[input.period]);

  // No calendar ceiling (e.g. a pure card-network gateway) — policy
  // tenure is the only bound.
  if (input.maxEndTimeSeconds === null) {
    return Math.max(0, policyMaxCycles);
  }

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const bufferSeconds = CEILING_SAFETY_BUFFER_DAYS * 24 * 60 * 60;
  const availableSeconds = input.maxEndTimeSeconds - nowSeconds - bufferSeconds;
  const ceilingMaxCycles = Math.floor(availableSeconds / MAX_CYCLE_SECONDS[input.period]);

  return Math.max(0, Math.min(policyMaxCycles, ceilingMaxCycles));
}

/**
 * When a mandate of this many cycles is expected to run out — stored
 * on the row so the renewal sweep is an indexed date comparison
 * rather than a per-row round trip to the gateway.
 *
 * Uses the same generous cycle length as the count derivation, so the
 * stored date is at or LATER than reality; the renewal lookahead
 * window is what absorbs that slack.
 */
export function expectedEndAt(
  period: BillingPeriod,
  totalCount: number,
  fromMs: number = Date.now(),
): Date {
  return new Date(fromMs + totalCount * MAX_CYCLE_SECONDS[period] * 1000);
}

/**
 * Guard used right before handing total_count to a gateway: proves
 * the resulting end_time is inside the advertised window. Belt and
 * braces over totalCountForTenure — if a caller ever hand-rolls a
 * count (an admin override, a migration script), this is what stops
 * the 2026-08-28 error class from reaching a customer's screen again.
 */
export function tenureFitsGatewayCeiling(input: {
  period: BillingPeriod;
  totalCount: number;
  maxEndTimeSeconds: number | null;
  nowSeconds?: number;
}): boolean {
  if (input.maxEndTimeSeconds === null) return input.totalCount >= 1;
  if (!Number.isInteger(input.totalCount) || input.totalCount < 1) return false;
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const endTime = nowSeconds + input.totalCount * MAX_CYCLE_SECONDS[input.period];
  return endTime <= input.maxEndTimeSeconds;
}
