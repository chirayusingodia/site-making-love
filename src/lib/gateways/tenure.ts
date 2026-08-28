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
   * outside India). Razorpay: 4765046400 (2120-12-31). A FIXED WALL —
   * headroom against it shrinks as the calendar advances.
   */
  maxEndTimeSeconds: number | null;
  /**
   * The tightest "years from creation" ceiling across every payment
   * method this gateway can present at checkout, or null for none.
   *
   * THE INCIDENT THIS FIELD EXISTS TO PREVENT (2026-08-28, same day as
   * the end_time incident above): checkout failed with
   *   "expire_at cannot be more than 30 years for upi"
   * even though the 50-year policy tenure landed comfortably inside
   * the 2120 end_time wall. UPI Autopay mandates carry their OWN,
   * separate NPCI/Razorpay rule capping validity at 30 years from
   * creation — unrelated to the calendar wall and far tighter than it.
   *
   * UPI is offered (often as the RECOMMENDED option) at checkout for
   * every subscription, and Razorpay computes one total_count/end_time
   * for the whole subscription object, not one per payment method — so
   * this cap binds the mandate even if the customer ends up paying by
   * card. It must be treated as gateway-wide, not method-specific.
   *
   * UNLIKE maxEndTimeSeconds, this ceiling is RELATIVE to "now": it
   * never drifts back into violation as the calendar advances, so it
   * needs no self-correcting arithmetic — just a plain per-call clamp.
   */
  maxRelativeTenureYears?: number | null;
  /** Injectable for tests; defaults to now. */
  nowSeconds?: number;
}

/**
 * How many debit cycles to request for a new mandate:
 * min(policy tenure, headroom to the gateway's absolute end_time wall,
 * headroom to its relative "years from now" cap).
 *
 * RETURNS 0 when this gateway can offer NO legal tenure at all for
 * this cadence — i.e. less than one whole cycle of headroom remains
 * before the tighter of its ceilings.
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
  let maxCycles = Math.floor(years * CYCLES_PER_YEAR[input.period]);

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const bufferSeconds = CEILING_SAFETY_BUFFER_DAYS * 24 * 60 * 60;

  if (input.maxEndTimeSeconds !== null) {
    const availableSeconds = input.maxEndTimeSeconds - nowSeconds - bufferSeconds;
    const ceilingMaxCycles = Math.floor(availableSeconds / MAX_CYCLE_SECONDS[input.period]);
    maxCycles = Math.min(maxCycles, ceilingMaxCycles);
  }

  if (input.maxRelativeTenureYears != null) {
    const relativeSeconds = input.maxRelativeTenureYears * 365 * 24 * 60 * 60 - bufferSeconds;
    const relativeMaxCycles = Math.floor(relativeSeconds / MAX_CYCLE_SECONDS[input.period]);
    maxCycles = Math.min(maxCycles, relativeMaxCycles);
  }

  return Math.max(0, maxCycles);
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
 * the resulting end_time is inside BOTH advertised windows — the
 * absolute calendar wall and the relative "years from now" cap (e.g.
 * Razorpay UPI's 30-year rule). Belt and braces over totalCountForTenure
 * — if a caller ever hand-rolls a count (an admin override, a migration
 * script), this is what stops either 2026-08-28 error class from
 * reaching a customer's screen again.
 */
export function tenureFitsGatewayCeiling(input: {
  period: BillingPeriod;
  totalCount: number;
  maxEndTimeSeconds: number | null;
  maxRelativeTenureYears?: number | null;
  nowSeconds?: number;
}): boolean {
  if (!Number.isInteger(input.totalCount) || input.totalCount < 1) return false;
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const endTime = nowSeconds + input.totalCount * MAX_CYCLE_SECONDS[input.period];

  if (input.maxEndTimeSeconds !== null && endTime > input.maxEndTimeSeconds) return false;

  if (input.maxRelativeTenureYears != null) {
    const relativeEndTime = nowSeconds + input.maxRelativeTenureYears * 365 * 24 * 60 * 60;
    if (endTime > relativeEndTime) return false;
  }

  return true;
}
