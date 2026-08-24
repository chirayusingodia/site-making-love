// ─────────────────────────────────────────────────────────────
// PUNYATA — Part B: Commission engine (PURE)
//
// Mirrors sankalp-logic.ts discipline: every decision is an
// exported pure function, zero imports, callers pass data in
// (including nowMs). This module NEVER touches Supabase, env or
// Date.now() — which is exactly what lets scratch/
// verify_commission_engine.ts prove the money math, the four
// attribution paths and every §9.2 anti-gaming rule against real
// inputs before any of this can move a paisa.
//
// THE TWO RATE MECHANICS (§10.2 — get this wrong and every future
// payout dispute comes from here):
//   • first-deal bonus = FIXED constant FIRST_DEAL_PERCENT (20),
//     still WRITTEN onto each entry so history stays explainable.
//   • trail rate = RESOLVED PER PAYOUT MONTH from rate history;
//     promotion lifts the whole book forward, locked months never
//     change.
// ─────────────────────────────────────────────────────────────

// ─── Constants — every one tunable in exactly ONE place ──────

/** Fixed forever. Not per-person, not tiered, promotion-proof. */
export const FIRST_DEAL_PERCENT = 20;

/** First-deal BASE for yearly plans (§10.6 open decision):
 *  'full_payment'            — 20% of the whole annual amount.
 *  'monthly_equivalent_x3'   — 20% of (price ÷ 12) × 3 ≈ one quarter's worth.
 * Switching later is a one-line change here, NOT a migration. */
export const FIRST_DEAL_BASE_YEARLY: "full_payment" | "monthly_equivalent_x3" = "full_payment";

/** Standard trail when a person has no explicit rate row. */
export const DEFAULT_TRAIL_PERCENT = 1;

/** Call-window attribution look-back (§9.1 path 2). */
export const ATTRIBUTION_WINDOW_DAYS = 30;

/** First-deal entries mature held → payable after this many days. */
export const FIRST_DEAL_HOLD_DAYS = 30;

/** Yearly plans accrue trail monthly at one-twelfth, months 2–12. */
export const YEARLY_TRAIL_ACCRUAL_MONTHS = 11;

// ─── Structural shapes ───────────────────────────────────────

export interface AttributionTokenContext {
  token: string;
  /** leads.assigned_to — the telecaller the lead was assigned to. */
  assignedTo: string | null;
  /** leads.created_by — set when a telecaller self-created via §5.4. */
  createdBy: string | null;
  /** The field agent who sourced this lead (leads.source_agent_id). */
  sourceAgentId: string | null;
}

export interface AttributionCallRow {
  calledBy: string;
  createdAtMs: number;
  /**
   * C2 (REVIEW): the outcome MUST ride along — see
   * CONTACT_ESTABLISHING_OUTCOMES. A row without a qualifying outcome
   * is not a touch and never credits anyone (fail-closed).
   */
  outcome: string;
}

/**
 * C2 (REVIEW_TELECALLER_SESSION.md): only these outcomes prove a real
 * conversation happened. The original fraud: bulk-log `no_answer`
 * across the whole never_bought queue, then harvest 20%+trail on every
 * organic buyer for 30 days. A ring that nobody answered is not a sale
 * you made — it does not enter the attribution window.
 */
export const CONTACT_ESTABLISHING_OUTCOMES = [
  "connected_interested",
  "connected_completed",
  "connected_partial",
] as const;

export function isContactEstablishingOutcome(outcome: string | undefined | null): boolean {
  return (
    typeof outcome === "string" &&
    (CONTACT_ESTABLISHING_OUTCOMES as readonly string[]).includes(outcome)
  );
}

export interface ResolvedAttribution {
  telecallerId: string | null;
  agentId: string | null;
  source: "token" | "call_window" | "agent_referral" | "organic";
  /** Set when §9.2 blocked a credit — endpoints must log this. */
  rejectedReason?: string;
}

function periodStartMs(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return Date.UTC(y, m - 1, 1);
}

/**
 * §9.1 — resolves WHO gets credited, in strict priority order:
 *
 *   1. token        — deterministic; valid only when the lead was
 *                     ASSIGNED to that telecaller or CREATED by her
 *                     (§9.2: never credited on a lead never hers).
 *   2. call_window  — a qualifying call by a telecaller within
 *                     ATTRIBUTION_WINDOW_DAYS BEFORE the subscription
 *                     existed; LAST touch wins.
 *   3. agent_referral — the subscription arrived through the agent's
 *                     own referral column; agent only, no telecaller.
 *   4. organic      — nobody. The genuine default.
 *
 * ANTI-GAMING (each enforced HERE, not in the endpoint):
 *   • priorActiveSubscription → organic outright (no re-selling an
 *     existing customer to yourself).
 *   • dual-role on one subscription → rejected unless the owner
 *     config flag is explicitly on; rejection is REPORTED via
 *     rejectedReason so the caller writes the audit row.
 */
export function resolveAttribution(input: {
  subscriptionCreatedAtMs: number;
  tokenContext: AttributionTokenContext | null;
  callsByTelecallers: AttributionCallRow[];
  existingSalesAgentId: string | null;
  /** Did profiles.phone have an ACTIVE subscription before her first call? */
  priorActiveSubscription: boolean;
  /** Owner config, DEFAULT OFF (§9.2). */
  allowSamePersonBothRoles?: boolean;
}): ResolvedAttribution {
  const {
    subscriptionCreatedAtMs,
    tokenContext,
    callsByTelecallers,
    existingSalesAgentId,
    priorActiveSubscription,
    allowSamePersonBothRoles = false,
  } = input;

  // §9.2 hard stop: an existing customer cannot be "sold" again.
  if (priorActiveSubscription) {
    return {
      telecallerId: null,
      agentId: existingSalesAgentId,
      source: existingSalesAgentId ? "agent_referral" : "organic",
      rejectedReason: "prior_active_subscription",
    };
  }

  // Path 1 — deterministic token.
  if (tokenContext) {
    const hers = tokenContext.assignedTo ?? tokenContext.createdBy;
    if (!hers) {
      // Unassigned, uncreated lead: the token proves CONTACT, not
      // ownership — fall through to weaker paths rather than pay on
      // a lead she was never given.
    } else {
      let telecallerId: string | null = hers;
      let rejectedReason: string | undefined;
      if (
        !allowSamePersonBothRoles &&
        existingSalesAgentId &&
        existingSalesAgentId === telecallerId
      ) {
        telecallerId = null;
        rejectedReason = "same_person_both_roles";
      }
      return {
        telecallerId,
        agentId: existingSalesAgentId ?? tokenContext.sourceAgentId ?? null,
        source: "token",
        ...(rejectedReason ? { rejectedReason } : {}),
      };
    }
  }

  // Path 2 — call window, last touch inside the window.
  // C2: only contact-establishing outcomes qualify (fail-closed when
  // the outcome is missing).
  const windowStart = subscriptionCreatedAtMs - ATTRIBUTION_WINDOW_DAYS * 24 * 3_600_000;
  const qualifying = callsByTelecallers
    .filter((c) => isContactEstablishingOutcome(c.outcome))
    .filter((c) => c.createdAtMs >= windowStart && c.createdAtMs <= subscriptionCreatedAtMs)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
  if (qualifying.length > 0) {
    let telecallerId: string | null = qualifying[0].calledBy;
    let rejectedReason: string | undefined;
    if (
      !allowSamePersonBothRoles &&
      existingSalesAgentId &&
      existingSalesAgentId === telecallerId
    ) {
      telecallerId = null;
      rejectedReason = "same_person_both_roles";
    }
    return {
      telecallerId,
      agentId: existingSalesAgentId,
      source: telecallerId ? "call_window" : existingSalesAgentId ? "agent_referral" : "organic",
      ...(rejectedReason ? { rejectedReason } : {}),
    };
  }

  // Path 3 / 4.
  if (existingSalesAgentId) {
    return { telecallerId: null, agentId: existingSalesAgentId, source: "agent_referral" };
  }
  return { telecallerId: null, agentId: null, source: "organic" };
}

// ─── Trail-rate resolution (per payout month, §10.2) ─────────

export interface TrailRateRow {
  agentId: string | null;
  profileId: string | null;
  percent: number;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null; // NULL = current
}

/**
 * The rate in force for ONE person during ONE payout month: the
 * latest row whose [from, to) covers the month's first day. A
 * promotion mid-book lifts every FOLLOWING month automatically —
 * that is what "promotion" means — while locked past months were
 * already written at their then-current rates.
 *
 * [Pass-2 L4] `to` is EXCLUSIVE, as documented: a row with
 * effectiveTo = '2026-09-01' expires BEFORE September's payout month,
 * so it must not match September (the old `>=` made back-dated
 * endings keep paying the old rate for that whole month — a payout
 * dispute waiting to happen).
 */
export function resolveTrailPercent(
  rates: TrailRateRow[],
  beneficiary: { agentId?: string | null; profileId?: string | null },
  payoutPeriod: string,
): number {
  const monthStartIso = new Date(periodStartMs(payoutPeriod)).toISOString().slice(0, 10);
  const mine = rates
    .filter((r) => r.agentId === (beneficiary.agentId ?? null))
    .filter((r) => r.profileId === (beneficiary.profileId ?? null))
    .filter((r) => r.effectiveFrom <= monthStartIso)
    .filter((r) => r.effectiveTo === null || r.effectiveTo > monthStartIso)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return mine.length > 0 ? mine[0].percent : DEFAULT_TRAIL_PERCENT;
}

// ─── Money math ──────────────────────────────────────────────

/** Round HALF-UP to the paisa, at ENTRY level — never at a total. */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

/** 'YYYY-MM' of an ISO timestamp, computed in ASIA/KOLKATA.
 *  [Pass-2 L1] The old raw `.slice(0,7)` bucketed by UTC, so a
 *  payment captured 00:00–05:30 IST on the 1st landed in the PREVIOUS
 *  payout period — and once that month locked, acceptDrafts dropped
 *  it forever. Mirrors performance-logic.ts istPeriodOf (kept local:
 *  this module stays zero-import pure). */
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istPeriodOf(isoTs: string): string {
  return new Date(Date.parse(isoTs) + IST_OFFSET_MS).toISOString().slice(0, 7);
}

/** Legacy alias — every caller now gets the IST-correct period.
 *  Kept exported because scratch verifiers and earnings.ts import it. */
export function periodOf(isoDateOrTs: string): string {
  // Pure date strings ('YYYY-MM-DD', no time) carry no zone ambiguity;
  // anything with a time component is treated as a UTC instant and
  // converted to IST before slicing.
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDateOrTs)) {
    return isoDateOrTs.slice(0, 7);
  }
  return istPeriodOf(isoDateOrTs);
}

export function addPeriods(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export interface BeneficiaryRef {
  role: "agent" | "telecaller";
  id: string;
}

export interface LedgerEntryDraft {
  subscription_id: string;
  payment_id: string;
  agent_id: string | null;
  profile_id: string | null;
  kind: "first_deal" | "trail";
  percent_applied: number;
  base_paise: number;
  amount_paise: number;
  payout_period: string;
  status: "held" | "accrued";
  note?: string;
}

/**
 * Builds the ledger drafts for ONE captured payment (§10.4 steps 2–4).
 *
 *  • first captured payment → one `first_deal` entry per beneficiary
 *    at FIXED FIRST_DEAL_PERCENT, status 'held' (30-day hold, §10.5).
 *  • otherwise → trail at the rate resolved FOR THAT PAYOUT MONTH.
 *    Yearly plans accrue MONTHLY AT ONE-TWELFTH across the following
 *    11 periods (months 2–12) — not as a lump, so a mid-year
 *    cancellation simply stops generating them.
 *  • Rounding half-up happens per entry; base_paise stored alongside
 *    so every figure is re-derivable with evidence.
 *
 * Pure: returns drafts; persistence + UNIQUE-conflict handling live
 * in the reconciler endpoint.
 */
export function buildCommissionEntriesForPayment(input: {
  subscriptionId: string;
  paymentId: string;
  billingPeriod: "monthly" | "yearly";
  pricePaise: number;
  paidAtIso: string;
  isFirstCapturedPayment: boolean;
  beneficiaries: BeneficiaryRef[];
  rates: TrailRateRow[];
}): LedgerEntryDraft[] {
  const {
    subscriptionId,
    paymentId,
    billingPeriod,
    pricePaise,
    paidAtIso,
    isFirstCapturedPayment,
    beneficiaries,
    rates,
  } = input;

  const out: LedgerEntryDraft[] = [];
  const period = periodOf(paidAtIso);

  if (isFirstCapturedPayment) {
    // §10.6: the yearly BASE question is one named constant.
    const basePaise =
      billingPeriod === "yearly" && FIRST_DEAL_BASE_YEARLY === "monthly_equivalent_x3"
        ? roundHalfUp((pricePaise / 12) * 3)
        : pricePaise;
    for (const b of beneficiaries) {
      out.push({
        subscription_id: subscriptionId,
        payment_id: paymentId,
        agent_id: b.role === "agent" ? b.id : null,
        profile_id: b.role === "telecaller" ? b.id : null,
        kind: "first_deal",
        percent_applied: FIRST_DEAL_PERCENT,
        base_paise: basePaise,
        amount_paise: roundHalfUp((basePaise * FIRST_DEAL_PERCENT) / 100),
        payout_period: period,
        status: "held",
        note: "first deal — held 30 days",
      });
    }
    return out;
  }

  const makeTrail = (basePaise: number, payoutPeriod: string) => {
    for (const b of beneficiaries) {
      const percent = resolveTrailPercent(
        rates,
        b.role === "agent" ? { agentId: b.id } : { profileId: b.id },
        payoutPeriod,
      );
      out.push({
        subscription_id: subscriptionId,
        payment_id: paymentId,
        agent_id: b.role === "agent" ? b.id : null,
        profile_id: b.role === "telecaller" ? b.id : null,
        kind: "trail",
        percent_applied: percent,
        base_paise: basePaise,
        amount_paise: roundHalfUp((basePaise * percent) / 100),
        payout_period: payoutPeriod,
        status: "accrued",
      });
    }
  };

  if (billingPeriod === "yearly") {
    // Months 2–12, one-twelfth each, created AS EACH MONTH ARRIVES —
    // the caller invokes this once per arrival with the right index.
    // Here we generate ALL 11 drafts only when told to backfill;
    // normally callers use buildYearlyAccrualEntries below.
    const monthlyBase = roundHalfUp(pricePaise / 12);
    for (let i = 1; i <= YEARLY_TRAIL_ACCRUAL_MONTHS; i++) {
      makeTrail(monthlyBase, addPeriods(period, i));
    }
    return out;
  }

  makeTrail(pricePaise, period);
  return out;
}

/**
 * Which trail periods are DUE as of `nowMs` for a yearly subscription
 * activated at paidAtIso (§10.4 step 3): month k accrues when its
 * period has arrived, so cancellation stops future accruals for free.
 */
export function dueYearlyAccrualPeriods(paidAtIso: string, nowMs: number): string[] {
  const start = periodOf(paidAtIso);
  const out: string[] = [];
  for (let i = 1; i <= YEARLY_TRAIL_ACCRUAL_MONTHS; i++) {
    const p = addPeriods(start, i);
    if (periodStartMs(p) <= nowMs) out.push(p);
  }
  return out;
}

/**
 * H2/H3 (REVIEW): the ONE library entry point for a single yearly
 * accrual period. The reconciler used to hand-roll the rate lookup
 * here — no `effective_to` filter, no ordering, dead variables — and
 * wired it to the wrong branch, so year-1 trail was never created at
 * all. Every accrual decision now lives in this tested function:
 * base = one-twelfth (half-up per entry), rate resolved PER PAYOUT
 * PERIOD via resolveTrailPercent.
 *
 * Returns one draft per beneficiary; zero-paise outcomes are the
 * caller's policy decision (H6), not silently dropped here.
 */
export function buildYearlyAccrualEntries(input: {
  subscriptionId: string;
  paymentId: string;
  pricePaise: number;
  paidAtIso: string;
  targetPeriod: string;
  beneficiaries: BeneficiaryRef[];
  rates: TrailRateRow[];
}): LedgerEntryDraft[] {
  const { subscriptionId, paymentId, pricePaise, targetPeriod, beneficiaries, rates } = input;
  const monthlyBase = roundHalfUp(pricePaise / 12);
  return beneficiaries.map((b) => {
    const percent = resolveTrailPercent(
      rates,
      b.role === "agent" ? { agentId: b.id } : { profileId: b.id },
      targetPeriod,
    );
    return {
      subscription_id: subscriptionId,
      payment_id: paymentId,
      agent_id: b.role === "agent" ? b.id : null,
      profile_id: b.role === "telecaller" ? b.id : null,
      kind: "trail" as const,
      percent_applied: percent,
      base_paise: monthlyBase,
      amount_paise: roundHalfUp((monthlyBase * percent) / 100),
      payout_period: targetPeriod,
      status: "accrued" as const,
    };
  });
}

// ─── Holds, clawbacks, locking (§10.5) ───────────────────────

export interface LedgerEntryLite {
  id: string;
  kind: "first_deal" | "trail";
  status: string;
  amount_paise: number;
  payout_period: string;
  created_at: string;
  subscription_id: string;
  payment_id: string;
  agent_id: string | null;
  profile_id: string | null;
  percent_applied: number;
  base_paise: number;
}

/** held → payable after the 30-day no-refund window. */
export function matureHeldFirstDeals(entries: LedgerEntryLite[], nowMs: number): string[] {
  return entries
    .filter(
      (e) =>
        e.kind === "first_deal" &&
        e.status === "held" &&
        Date.parse(e.created_at) + FIRST_DEAL_HOLD_DAYS * 24 * 3_600_000 <= nowMs,
    )
    .map((e) => e.id);
}

export interface ClawbackPlan {
  /**
   * New negative rows to INSERT into the CURRENT open period — the
   * ledger stays append-only; originals are never edited.
   */
  reversals: LedgerEntryDraft[];
  /**
   * Edge case (§10.5 + the partial UNIQUE index): when the original
   * entry sits in THIS SAME open period and has not been paid yet,
   * a duplicate-tuple reversal would collide with regeneration
   * idempotency — so THAT row flips to clawed_back INSTEAD (a
   * status transition; amounts stay immutable).
   */
  flipIds: string[];
}

export function buildClawbacksForPayment(
  entries: LedgerEntryLite[],
  paymentId: string,
  currentOpenPeriod: string,
  /**
   * H4 (REVIEW): keys of ORIGINAL entries that already have a
   * reversal row somewhere in the ledger — `${payment_id}|${agent_id}
   * |${profile_id}|${kind}`. Without this, the partial unique index's
   * negative-amount exemption let every reconciler run append ANOTHER
   * reversal: one refund became thirty under a cron.
   */
  existingReversalKeys?: Set<string>,
): ClawbackPlan {
  const plan: ClawbackPlan = { reversals: [], flipIds: [] };
  for (const e of entries) {
    if (e.payment_id !== paymentId) continue;
    if (e.amount_paise <= 0) continue; // already a reversal
    if (e.status === "clawed_back" || e.status === "void") continue;
    // H4: an existing reversal for THIS original (any period) means done.
    const originalKey = `${e.payment_id}|${e.agent_id ?? ""}|${e.profile_id ?? ""}|${e.kind}`;
    if (existingReversalKeys?.has(originalKey)) continue;
    if (e.payout_period === currentOpenPeriod && e.status !== "paid") {
      plan.flipIds.push(e.id);
      continue;
    }
    plan.reversals.push({
      subscription_id: e.subscription_id,
      payment_id: e.payment_id,
      agent_id: e.agent_id,
      profile_id: e.profile_id,
      kind: e.kind,
      percent_applied: e.percent_applied,
      base_paise: e.base_paise,
      amount_paise: -e.amount_paise,
      payout_period: currentOpenPeriod,
      status: "accrued",
      note: "clawback reversal (refund/chargeback)",
    });
  }
  return plan;
}

/** Locked periods reject creation/edit/reversal outright (§10.5). */
export function isPeriodLocked(period: string, lockedPeriods: string[]): boolean {
  return lockedPeriods.includes(period);
}
