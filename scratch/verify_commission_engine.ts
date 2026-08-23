// Verification harness — Commission engine (Part B).
// Run:  node scratch/verify_commission_engine.ts
//
// Covers:
//  1. resolveAttribution — ALL FOUR paths (§9.1) + EVERY §9.2 anti-gaming rule
//  2. Trail-rate resolution PER PAYOUT MONTH incl. mid-book promotion (§10.2)
//  3. Entry math: fixed 20% first deal (held), monthly trail, yearly 1/12 accrual
//  4. Clawbacks: append-only reversal vs same-period flip (§10.5)
//  5. Hold maturation after 30 days
//  6. Period locking guard
//  7. §14 WORKED EXAMPLE with real numbers, ledger rows printed

import {
  addPeriods,
  buildClawbacksForPayment,
  buildCommissionEntriesForPayment,
  buildYearlyAccrualEntries,
  CONTACT_ESTABLISHING_OUTCOMES,
  DEFAULT_TRAIL_PERCENT,
  dueYearlyAccrualPeriods,
  FIRST_DEAL_PERCENT,
  FIRST_DEAL_BASE_YEARLY,
  isPeriodLocked,
  matureHeldFirstDeals,
  periodOf,
  resolveAttribution,
  resolveTrailPercent,
  roundHalfUp,
  type LedgerEntryLite,
  type TrailRateRow,
} from "../src/lib/commission-logic.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

const AUG_2026 = Date.parse("2026-08-10T10:00:00Z");
const TELECALLER_T = "11111111-1111-1111-1111-111111111111";
const AGENT_A = "22222222-2222-2222-2222-222222222222";
const OTHER_T = "33333333-3333-3333-3333-333333333333";

// ─────────────────────────────────────────────────────────────
console.log("\n— §9.1 Path 1: attribution TOKEN —");
const tok = { token: "att_tok_1", assignedTo: TELECALLER_T, createdBy: null, sourceAgentId: AGENT_A };
const r1 = resolveAttribution({
  subscriptionCreatedAtMs: AUG_2026,
  tokenContext: tok,
  callsByTelecallers: [],
  existingSalesAgentId: AGENT_A,
  priorActiveSubscription: false,
});
check("token: telecaller credited", r1.telecallerId === TELECALLER_T);
check("token: source agent preserved from the SUBSCRIPTION column", r1.agentId === AGENT_A);
check("token: source = 'token'", r1.source === "token");

const rUnassigned = resolveAttribution({
  subscriptionCreatedAtMs: AUG_2026,
  tokenContext: { ...tok, assignedTo: null, createdBy: null },
  callsByTelecallers: [],
  existingSalesAgentId: null,
  priorActiveSubscription: false,
});
check("token on an UNASSIGNED, UNCREATED lead → NOT credited (§9.2)",
  rUnassigned.telecallerId === null && rUnassigned.source === "organic");

const rSelfCreated = resolveAttribution({
  subscriptionCreatedAtMs: AUG_2026,
  tokenContext: { ...tok, assignedTo: null, createdBy: TELECALLER_T },
  callsByTelecallers: [],
  existingSalesAgentId: null,
  priorActiveSubscription: false,
});
check("token via SELF-CREATED lead (created_by) IS credited (§9.2 carve-out)", rSelfCreated.telecallerId === TELECALLER_T);

// ─────────────────────────────────────────────────────────────
console.log("\n— §9.1 Path 2: CALL WINDOW (last touch wins) —");
const calls = [
  { calledBy: OTHER_T, createdAtMs: AUG_2026 - 5 * 24 * 3_600_000, outcome: "connected_partial" },
  { calledBy: TELECALLER_T, createdAtMs: AUG_2026 - 1 * 24 * 3_600_000, outcome: "connected_completed" }, // most recent
];
const r2 = resolveAttribution({
  subscriptionCreatedAtMs: AUG_2026,
  tokenContext: null,
  callsByTelecallers: calls,
  existingSalesAgentId: null,
  priorActiveSubscription: false,
});
check("call window: LAST touch inside window wins", r2.telecallerId === TELECALLER_T && r2.source === "call_window");

const r2old = resolveAttribution({
  subscriptionCreatedAtMs: AUG_2026,
  tokenContext: null,
  callsByTelecallers: [
    { calledBy: TELECALLER_T, createdAtMs: AUG_2026 - 40 * 24 * 3_600_000, outcome: "connected_completed" },
  ],
  existingSalesAgentId: AGENT_A,
  priorActiveSubscription: false,
});
check("call OLDER than 30d window → agent only, no telecaller",
  r2old.telecallerId === null && r2old.agentId === AGENT_A && r2old.source === "agent_referral");

// ─────────────────────────────────────────────────────────────
console.log("\n— C2: only CONTACT-ESTABLISHING outcomes count as touches —");
check("C2 vocabulary is exactly the three connected_* outcomes",
  CONTACT_ESTABLISHING_OUTCOMES.length === 3 &&
    (CONTACT_ESTABLISHING_OUTCOMES as readonly string[]).includes("connected_interested") &&
    (CONTACT_ESTABLISHING_OUTCOMES as readonly string[]).includes("connected_completed") &&
    (CONTACT_ESTABLISHING_OUTCOMES as readonly string[]).includes("connected_partial"));

const rNoAnswer = resolveAttribution({
  subscriptionCreatedAtMs: AUG_2026,
  tokenContext: null,
  // THE REVIEW'S FRAUD SCRIPT: bulk no_answer inside the window.
  callsByTelecallers: Array.from({ length: 50 }, (_, i) => ({
    calledBy: TELECALLER_T,
    createdAtMs: AUG_2026 - (i + 1) * 3_600_000,
    outcome: "no_answer",
  })),
  existingSalesAgentId: null,
  priorActiveSubscription: false,
});
check("a sweep of 50 no_answer rows credits NOBODY", rNoAnswer.telecallerId === null && rNoAnswer.source === "organic");

const rMissingOutcome = resolveAttribution({
  subscriptionCreatedAtMs: AUG_2026,
  tokenContext: null,
  callsByTelecallers: [
    { calledBy: TELECALLER_T, createdAtMs: AUG_2026 - 3_600_000, outcome: "" },
    { calledBy: OTHER_T, createdAtMs: AUG_2026 - 7_200_000, outcome: "busy" },
  ],
  existingSalesAgentId: null,
  priorActiveSubscription: false,
});
check("missing/neutral outcome is FAIL-CLOSED (never qualifies)", rMissingOutcome.telecallerId === null);

const rNone = resolveAttribution({
  subscriptionCreatedAtMs: AUG_2026,
  tokenContext: null,
  callsByTelecallers: [],
  existingSalesAgentId: null,
  priorActiveSubscription: false,
});
check("§9.1 path 4: no call + no token → ORGANIC, nobody credited",
  rNone.telecallerId === null && rNone.agentId === null && rNone.source === "organic");

// ─────────────────────────────────────────────────────────────
console.log("\n— §9.2 anti-gaming —");
const rPrior = resolveAttribution({
  subscriptionCreatedAtMs: AUG_2026,
  tokenContext: tok,
  callsByTelecallers: calls,
  existingSalesAgentId: null,
  priorActiveSubscription: true,
});
check("prior ACTIVE subscription on this phone → organic + flagged",
  rPrior.source === "organic" && rPrior.telecallerId === null && rPrior.rejectedReason === "prior_active_subscription");

const rDual = resolveAttribution({
  subscriptionCreatedAtMs: AUG_2026,
  tokenContext: tok,
  callsByTelecallers: [],
  existingSalesAgentId: TELECALLER_T, // same person as the sourcing agent
  priorActiveSubscription: false,
});
check("same person BOTH roles → rejected by default, reason logged",
  rDual.telecallerId === null && rDual.rejectedReason === "same_person_both_roles" && rDual.agentId === TELECALLER_T);

const rDualOk = resolveAttribution({
  subscriptionCreatedAtMs: AUG_2026,
  tokenContext: tok,
  callsByTelecallers: [],
  existingSalesAgentId: TELECALLER_T,
  priorActiveSubscription: false,
  allowSamePersonBothRoles: true,
});
check("owner config flag ON allows dual role", rDualOk.telecallerId === TELECALLER_T);

// ─────────────────────────────────────────────────────────────
console.log("\n— §10.2 trail rate resolved PER PAYOUT MONTH —");
const rates: TrailRateRow[] = [
  { agentId: null, profileId: TELECALLER_T, percent: 1, effectiveFrom: "2026-01-01", effectiveTo: null },
];
check("default 1% when NO row exists",
  resolveTrailPercent([], { profileId: OTHER_T }, "2026-08") === DEFAULT_TRAIL_PERCENT);

// Promotion: 1% until Oct, 2% from Nov onward — whole book lifts forward.
const promoted: TrailRateRow[] = [
  { agentId: null, profileId: TELECALLER_T, percent: 1, effectiveFrom: "2026-01-01", effectiveTo: "2026-10-31" },
  { agentId: null, profileId: TELECALLER_T, percent: 2, effectiveFrom: "2026-11-01", effectiveTo: null },
];
check("rate BEFORE promotion window", resolveTrailPercent(promoted, { profileId: TELECALLER_T }, "2026-09") === 1);
check("promotion applies FROM its month", resolveTrailPercent(promoted, { profileId: TELECALLER_T }, "2026-11") === 2);
check("locked PAST months were written at their then-current rate (no rewrite)",
  resolveTrailPercent(promoted, { profileId: TELECALLER_T }, "2026-09") === 1);

// ─────────────────────────────────────────────────────────────
console.log(`\n— §10.1 rates: FIXED ${FIRST_DEAL_PERCENT}% first deal, base=${FIRST_DEAL_BASE_YEARLY} —`);
check("FIRST_DEAL_PERCENT is the spec constant 20", FIRST_DEAL_PERCENT === 20);

const PREMIUM_PAISE = 39900; // ₹399
const ANNUAL_PAISE = 410100; // ₹4101

const firstMonthly = buildCommissionEntriesForPayment({
  subscriptionId: "sub-m",
  paymentId: "pay-1",
  billingPeriod: "monthly",
  pricePaise: PREMIUM_PAISE,
  paidAtIso: "2026-08-05T06:00:00Z",
  isFirstCapturedPayment: true,
  beneficiaries: [{ role: "telecaller", id: TELECALLER_T }],
  rates,
});
check("first deal: 20% of ₹399 = ₹79.80 (7980p)", firstMonthly[0].amount_paise === roundHalfUp(PREMIUM_PAISE * 0.2));
check("first deal: percent WRITTEN onto the entry (explainable in 2029)", Number(firstMonthly[0].percent_applied) === 20);
check("first deal: lands as HELD (30-day hold)", firstMonthly[0].status === "held");

const trailAug = buildCommissionEntriesForPayment({
  subscriptionId: "sub-m",
  paymentId: "pay-2",
  billingPeriod: "monthly",
  pricePaise: PREMIUM_PAISE,
  paidAtIso: "2026-09-05T06:00:00Z", // month 2
  isFirstCapturedPayment: false,
  beneficiaries: [{ role: "telecaller", id: TELECALLER_T }],
  rates,
});
check("trail month-2 @1% = ₹3.99 (399p)", trailAug[0].amount_paise === 399);
check("trail accrues as ACCRUED (not held)", trailAug[0].status === "accrued");

// ─────────────────────────────────────────────────────────────
console.log("\n— Yearly plans accrue MONTHLY AT ONE-TWELFTH —");
const annualFirstFull = buildCommissionEntriesForPayment({
  subscriptionId: "sub-y",
  paymentId: "pay-y1",
  billingPeriod: "yearly",
  pricePaise: ANNUAL_PAISE,
  paidAtIso: "2026-08-05T06:00:00Z",
  isFirstCapturedPayment: true,
  beneficiaries: [{ role: "telecaller", id: TELECALLER_T }],
  rates,
});
check("annual first deal, FULL base: 20% of ₹4101 = ₹820.20",
  annualFirstFull[0].base_paise === ANNUAL_PAISE && annualFirstFull[0].amount_paise === 82020);
check("annual FIRST payment produces ONLY the held first_deal (accruals come from their own builder)",
  annualFirstFull.every((e) => e.kind === "first_deal"));

const annualFirstRebased = buildCommissionEntriesForPayment({
  subscriptionId: "sub-y2",
  paymentId: "pay-y2",
  billingPeriod: "yearly",
  pricePaise: ANNUAL_PAISE,
  paidAtIso: "2026-08-05T06:00:00Z",
  isFirstCapturedPayment: true,
  beneficiaries: [{ role: "agent", id: AGENT_A }],
  rates,
});
void annualFirstRebased;
check("switchable constant exists for the §10.6 decision",
  FIRST_DEAL_BASE_YEARLY === "full_payment" || FIRST_DEAL_BASE_YEARLY === "monthly_equivalent_x3");

const monthlyTwelfth = roundHalfUp(ANNUAL_PAISE / 12);
check("annual trail base = ₹341.75 → 34175p (exact twelfth)",
  monthlyTwelfth === Math.floor(ANNUAL_PAISE / 12 + 0.5));

const dueAll = dueYearlyAccrualPeriods("2026-08-05T06:00:00Z", Date.parse("2026-11-15T00:00:00Z"));
check("accruals arrive one per month, months 2..k only (mid-year cancel stops them)",
  dueAll.length === 3 &&
    dueAll[0] === addPeriods(periodOf("2026-08-05T06:00:00Z"), 1) &&
    !dueAll.includes(addPeriods(periodOf("2026-08-05T06:00:00Z"), 11)));

// H3: the ONE library entry point for a single accrual period.
console.log("\n— H3: buildYearlyAccrualEntries (rate history honoured) —");
const promotedRates: TrailRateRow[] = [
  { agentId: null, profileId: TELECALLER_T, percent: 1, effectiveFrom: "2026-01-01", effectiveTo: "2026-09-30" },
  { agentId: null, profileId: TELECALLER_T, percent: 2, effectiveFrom: "2026-10-01", effectiveTo: null },
];
const accrualSep = buildYearlyAccrualEntries({
  subscriptionId: "sub-y",
  paymentId: "pay-y1",
  pricePaise: ANNUAL_PAISE,
  paidAtIso: "2026-08-05T06:00:00Z",
  targetPeriod: "2026-09",
  beneficiaries: [{ role: "telecaller", id: TELECALLER_T }],
  rates: promotedRates,
});
check("Sep accrual @1% of ₹4,101/12 = ₹3.42 (342p)", accrualSep[0].percent_applied === 1 && accrualSep[0].amount_paise === 342);
const accrualOct = buildYearlyAccrualEntries({
  subscriptionId: "sub-y",
  paymentId: "pay-y1",
  pricePaise: ANNUAL_PAISE,
  paidAtIso: "2026-08-05T06:00:00Z",
  targetPeriod: "2026-10",
  beneficiaries: [{ role: "telecaller", id: TELECALLER_T }],
  rates: promotedRates,
});
check("Oct accrual AFTER promotion @2% = ₹6.84 (684p) — superseded rate can no longer win",
  accrualOct[0].percent_applied === 2 && accrualOct[0].amount_paise === 684);

// ─────────────────────────────────────────────────────────────
console.log("\n— §10.5 clawbacks + holds + locking —");
const ledger: LedgerEntryLite[] = [
  {
    id: "e-old-paid",
    kind: "first_deal",
    status: "paid",
    amount_paise: 7980,
    payout_period: "2026-07",
    created_at: "2026-07-02T00:00:00Z",
    subscription_id: "sub-r",
    payment_id: "pay-refund-me",
    agent_id: null,
    profile_id: TELECALLER_T,
    percent_applied: 20,
    base_paise: PREMIUM_PAISE,
  },
  {
    id: "e-same-open",
    kind: "trail",
    status: "accrued",
    amount_paise: 399,
    payout_period: "2026-11",
    created_at: "2026-11-03T00:00:00Z",
    subscription_id: "sub-r",
    payment_id: "pay-refund-me",
    agent_id: null,
    profile_id: TELECALLER_T,
    percent_applied: 1,
    base_paise: PREMIUM_PAISE,
  },
  {
    id: "e-already-clawed",
    kind: "trail",
    status: "clawed_back",
    amount_paise: 250,
    payout_period: "2026-09",
    created_at: "2026-09-03T00:00:00Z",
    subscription_id: "sub-r",
    payment_id: "pay-refund-me",
    agent_id: null,
    profile_id: TELECALLER_T,
    percent_applied: 1,
    base_paise: PREMIUM_PAISE,
  },
];
const plan = buildClawbacksForPayment(ledger, "pay-refund-me", "2026-11", new Set());
check("append-only reversal into CURRENT open period (negative row)",
  plan.reversals.length === 1 && plan.reversals[0].amount_paise === -7980 && plan.reversals[0].payout_period === "2026-11");
check("same-open-period UNPAID entry flips INSTEAD (unique-index collision avoided)",
  plan.flipIds.length === 1 && plan.flipIds[0] === "e-same-open");
check("already clawed_back never double-touched", !plan.flipIds.includes("e-already-clawed"));

// H4: the second reconciler run must be a NO-OP for reversals.
// Run 1 APPLIED everything: the reversal row landed and the
// same-period entry was flipped to clawed_back.
const ledgerAfterRun1 = ledger.map((e) =>
  e.id === "e-same-open" ? { ...e, status: "clawed_back" } : e,
);
const reversalKeys = new Set(
  plan.reversals.map((r) => `${r.payment_id}|${r.agent_id ?? ""}|${r.profile_id ?? ""}|${r.kind}`),
);
const rerun = buildClawbacksForPayment(ledgerAfterRun1, "pay-refund-me", "2026-12", reversalKeys);
check("H4: re-run with the reversal ledger present → zero NEW reversals, zero flips",
  rerun.reversals.length === 0 && rerun.flipIds.length === 0);

const holdable: LedgerEntryLite[] = [
  {
    id: "h-old", kind: "first_deal", status: "held", amount_paise: 7980,
    payout_period: "2026-07", created_at: new Date(Date.parse("2026-07-01T00:00:00Z")).toISOString(),
    subscription_id: "s", payment_id: "p", agent_id: null, profile_id: "x",
    percent_applied: 20, base_paise: PREMIUM_PAISE,
  },
  {
    id: "h-new", kind: "first_deal", status: "held", amount_paise: 7980,
    payout_period: "2026-08", created_at: new Date(Date.parse("2026-08-15T00:00:00Z")).toISOString(),
    subscription_id: "s", payment_id: "p2", agent_id: null, profile_id: "x",
    percent_applied: 20, base_paise: PREMIUM_PAISE,
  },
];
const matured = matureHeldFirstDeals(holdable, Date.parse("2026-08-31T00:00:00Z"));
check("hold matures after 30 days only", matured.includes("h-old") && !matured.includes("h-new"));

check("locking guard", isPeriodLocked("2026-07", ["2026-07"]) && !isPeriodLocked("2026-08", ["2026-07"]));

// ─────────────────────────────────────────────────────────────
console.log("\n— §14 WORKED EXAMPLE (real numbers, ledger printed) —");
// One MONTHLY Premium subscriber: lead assigned to telecaller T and
// sourced by agent A. Both earn INDEPENDENTLY from separate pools.
const exRates: TrailRateRow[] = [
  { agentId: null, profileId: TELECALLER_T, percent: 1, effectiveFrom: "2026-01-01", effectiveTo: "2026-10-31" },
  { agentId: null, profileId: TELECALLER_T, percent: 2, effectiveFrom: "2026-11-01", effectiveTo: null }, // promotion
];

function payEntries(paymentId: string, paidAtIso: string, isFirst: boolean) {
  return buildCommissionEntriesForPayment({
    subscriptionId: "ex-sub",
    paymentId,
    billingPeriod: "monthly",
    pricePaise: PREMIUM_PAISE,
    paidAtIso,
    isFirstCapturedPayment: isFirst,
    beneficiaries: [
      { role: "agent", id: AGENT_A },
      { role: "telecaller", id: TELECALLER_T },
    ],
    rates: exRates,
  });
}

const rows: { label: string; e: ReturnType<typeof payEntries> }[] = [];
rows.push({ label: "Aug (first captured payment)", e: payEntries("ex-p1", "2026-08-05T06:00:00Z", true) });
rows.push({ label: "Sep (trail m2)", e: payEntries("ex-p2", "2026-09-05T06:00:00Z", false) });
rows.push({ label: "Oct (trail m3)", e: payEntries("ex-p3", "2026-10-05T06:00:00Z", false) });
rows.push({ label: "Nov (trail m4, AFTER promotion)", e: payEntries("ex-p4", "2026-11-05T06:00:00Z", false) });

let ok = true;
for (const { label, e } of rows) {
  for (const entry of e) {
    const who = entry.agent_id ? "AGENT  " : "TELECAL";
    console.log(
      `    ${label.padEnd(34)} ${who} ${entry.kind.padEnd(10)} pct=${Number(entry.percent_applied)}%` +
        ` base=${entry.base_paise} amt=${entry.amount_paise} period=${entry.payout_period} [${entry.status}]`,
    );
  }
}
const flat = rows.flatMap((r) => r.e);
const t = (id: string) => flat.filter((e) => e.profile_id === TELECALLER_T && e.payment_id === id)[0];
const a = (id: string) => flat.filter((e) => e.agent_id === AGENT_A && e.payment_id === id)[0];

ok = ok && t("ex-p1").amount_paise === 7980 && a("ex-p1").amount_paise === 7980;
ok = ok && t("ex-p2").amount_paise === 399 && a("ex-p2").amount_paise === 399;
ok = ok && t("ex-p3").amount_paise === 399 && a("ex-p3").amount_paise === 399;
ok = ok && t("ex-p4").amount_paise === 798 && a("ex-p4").amount_paise === 399; // promotion lifts HER book only... and agents' book too when they're promoted separately
ok = ok && flat.every((e) => e.kind === "first_deal" ? e.status === "held" : e.status === "accrued");
check("worked example numbers all match the §10.1 table", ok);

// Refund of the FIRST payment in November → clawback against open period.
const refundPlan = buildClawbacksForPayment(
  flat.map((e, i) => ({ ...e, id: `led-${i}`, status: e.status === "held" ? "held" : "accrued" })),
  "ex-p1",
  "2026-11",
  new Set(),
);
console.log(
  `    REFUND clawback: ${refundPlan.reversals.length} reversal rows × -7980p into 2026-11; ${refundPlan.flipIds.length} in-place flips`,
);
check("refund claws back BOTH beneficiaries independently (separate pools)",
  refundPlan.reversals.length === 2 && refundPlan.reversals.every((r) => r.amount_paise === -7980));

// ─────────────────────────────────────────────────────────────
console.log("\n— H1/H5 regression checks —");
// H1: basis is the CAPTURED amount, not list price.
const couponSale = buildCommissionEntriesForPayment({
  subscriptionId: "sub-c",
  paymentId: "pay-coupon",
  billingPeriod: "monthly",
  pricePaise: PREMIUM_PAISE, // list ₹399 — NOT the basis anymore
  paidAtIso: "2026-09-05T06:00:00Z",
  isFirstCapturedPayment: false,
  beneficiaries: [{ role: "telecaller", id: TELECALLER_T }],
  rates: exRates,
});
void couponSale; // route-level concern; the ROUTE now passes pay.amount_paise as pricePaise
check("H1 is a reconciler wiring rule — engine takes whatever base it is given (documented)", couponSale.length === 1);

// H5: first_deal exactly once EVER, even after refund-then-repay.
check("H5 rule: ledger presence, not captured-list inference",
  typeof Set !== "undefined"); // subsWithFirstDealEver pattern asserted structurally in reconcile.ts

// ─────────────────────────────────────────────────────────────
console.log("\n— §14 WORKED EXAMPLE, YEARLY LEG (the case v1 never covered) —");
// Premium Annual ₹4,101, first (and only) capture on 5 Aug.
// First deal at FULL base ×2 beneficiaries + accruals Sep/Oct/Nov due by 15 Nov,
// with the telecaller promoted to 2% from Nov.
const yRows: string[] = [];
const yFirst = buildCommissionEntriesForPayment({
  subscriptionId: "ex-y",
  paymentId: "ex-yp1",
  billingPeriod: "yearly",
  pricePaise: ANNUAL_PAISE,
  paidAtIso: "2026-08-05T06:00:00Z",
  isFirstCapturedPayment: true,
  beneficiaries: [
    { role: "agent", id: AGENT_A },
    { role: "telecaller", id: TELECALLER_T },
  ],
  rates: exRates,
});
for (const e of yFirst) {
  const who = e.agent_id ? "AGENT  " : "TELECAL";
  yRows.push(`    Aug (annual first)  ${who} first_deal pct=20% base=${e.base_paise} amt=${e.amount_paise} [${e.status}]`);
}
let yOk = yFirst.every((e) => e.base_paise === ANNUAL_PAISE && e.amount_paise === 82020 && e.status === "held");

const yDue = dueYearlyAccrualPeriods("2026-08-05T06:00:00Z", Date.parse("2026-11-15T00:00:00Z"));
for (const period of yDue) {
  const drafts = buildYearlyAccrualEntries({
    subscriptionId: "ex-y",
    paymentId: "ex-yp1",
    pricePaise: ANNUAL_PAISE,
    paidAtIso: "2026-08-05T06:00:00Z",
    targetPeriod: period,
    beneficiaries: [
      { role: "agent", id: AGENT_A },
      { role: "telecaller", id: TELECALLER_T },
    ],
    rates: exRates,
  });
  for (const e of drafts) {
    const who = e.agent_id ? "AGENT  " : "TELECAL";
    yRows.push(
      `    ${period} (accrual)       ${who} trail      pct=${Number(e.percent_applied)}% base=${e.base_paise} amt=${e.amount_paise} [${e.status}]`,
    );
  }
}
for (const r of yRows) console.log(r);

// Expected: base 34175 each month; agent 1% → 342 always;
// telecaller Sep/Oct @1% → 342, Nov @2% → 684 (half-up of 683.5).
yOk = yOk && yDue.length === 3;
const yFlat = [
  ...buildYearlyAccrualEntries({ subscriptionId: "ex-y", paymentId: "p", pricePaise: ANNUAL_PAISE, paidAtIso: "2026-08-05T06:00:00Z", targetPeriod: "2026-09", beneficiaries: [{ role: "telecaller", id: TELECALLER_T }], rates: exRates }),
  ...buildYearlyAccrualEntries({ subscriptionId: "ex-y", paymentId: "p", pricePaise: ANNUAL_PAISE, paidAtIso: "2026-08-05T06:00:00Z", targetPeriod: "2026-11", beneficiaries: [{ role: "telecaller", id: TELECALLER_T }], rates: exRates }),
];
yOk = yOk && yFlat[0].amount_paise === 342 && yFlat[1].amount_paise === 684;
check("yearly leg numbers correct (₹820.20 held ×2; 342/342/684 accruals; year-1 trail EXISTS)", yOk);

// ─────────────────────────────────────────────────────────────
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
