// ─────────────────────────────────────────────────────────────
// PUNYATA — Owner Performance leaderboard: PURE aggregation
//
// SESSION_HOSPITALS_ATTRIBUTION_PERFORMANCE_PROMPT.md §6.2.
// Zero imports, range + nowMs injected, every date bucketed in
// ASIA/KOLKATA (the review's MEDIUM finding: a payment at 00:30 IST
// on the 1st belongs to the NEW month even though UTC says the old
// one). Endpoints call these functions; they never re-implement the
// math inline — that is the meta-lesson from
// REVIEW_TELECALLER_SESSION.md, enforced again here.
//
// Correctness rules baked in (§6.4):
//   • Revenue = CAPTURED payments only. Never list price, never
//     status='active' as a money proxy.
//   • Attribution follows subscriptions.telecaller_id /
//     sales_agent_id — what the LEDGER actually paid on — so this
//     view can never disagree with commission_entries.
//   • Fair-sample guard: fewer than MIN_LEADS_FOR_RANKING leads ⇒
//     insufficientData=true; the UI keeps such rows out of the
//     top/bottom highlight. A bad week on 3 leads is not a firing.
//   • Rates travel as ratio + raw numerator/denominator so the UI
//     shows "12/50", not just a naked percentage.
// ─────────────────────────────────────────────────────────────

/** Fair-sample floor — below this, a lens row is "insufficient data". */
export const MIN_LEADS_FOR_RANKING = 20;

const IST_OFFSET_MS = 5.5 * 3_600_000;
const DAY_MS = 24 * 3_600_000;

// ─── IST time helpers ────────────────────────────────────────

/** 'YYYY-MM' of an ISO timestamp, computed in Asia/Kolkata. */
export function istPeriodOf(isoTs: string): string {
  return new Date(Date.parse(isoTs) + IST_OFFSET_MS).toISOString().slice(0, 7);
}

/** 'YYYY-MM-DD' of an ISO timestamp, computed in Asia/Kolkata. */
export function istDateOf(isoTs: string): string {
  return new Date(Date.parse(isoTs) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Inclusive IST calendar-date range check. */
export function inRangeIst(isoTs: string, fromIsoDate: string, toIsoDate: string): boolean {
  const d = istDateOf(isoTs);
  return d >= fromIsoDate && d <= toIsoDate;
}

/** Today's IST date as YYYY-MM-DD (the only place nowMs may enter). */
export function todayIst(nowMs: number): string {
  return new Date(nowMs + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * All payout periods ('YYYY-MM') covered by the inclusive IST range —
 * used to filter commission_entries.payout_period.
 */
export function periodsBetween(fromIsoDate: string, toIsoDate: string): string[] {
  const out: string[] = [];
  let cursor = `${fromIsoDate.slice(0, 7)}-01`;
  const endPeriod = toIsoDate.slice(0, 7);
  while (cursor.slice(0, 7) <= endPeriod && out.length < 1200) {
    out.push(cursor.slice(0, 7));
    const [y, m] = cursor.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    cursor = next;
  }
  return out;
}

// ─── Rates ───────────────────────────────────────────────────

export interface Rate {
  /** numerator */
  n: number;
  /** denominator */
  d: number;
}
export function rateValue(r: Rate): number | null {
  return r.d === 0 ? null : r.n / r.d;
}
function pctText(r: Rate): string {
  const v = rateValue(r);
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}
export function formatRate(r: Rate): string {
  return `${r.n}/${r.d} (${pctText(r)})`;
}

// ─── Structural input shapes (camelCase; mapped by the data layer) ──

export interface PerfLeadRow {
  id: string;
  assignedTo: string | null;
  sourceAgentId: string | null;
  hospitalId: string | null;
  freePoojaBy: string | null;
  /** §2 (REVIEW_HOSPITALS_SESSION.md): needed to measure LINKS SENT —
   *  a lead sitting at 'link_sent' with no conversion is exactly the
   *  "she sends links but can't close" coaching signal. */
  status: string;
  createdAt: string;
  convertedAt: string | null;
  subscriptionId: string | null;
}

export interface PerfCallRow {
  calledBy: string;
  leadId: string | null;
  outcome: string;
  createdAt: string;
}

export interface PerfSubRow {
  id: string;
  telecallerId: string | null;
  salesAgentId: string | null;
  status: string;
  startDate: string | null;
  createdAt: string;
  pausedAt: string | null;
  cancelledAt: string | null;
  /** Razorpay exhausted its own retries (subscription.halted).
   *  Recoverable, but NOT being billed — never counts as active. */
  haltedAt: string | null;
}

export interface PerfPaymentRow {
  subscriptionId: string;
  amountPaise: number;
  status: string;
  createdAt: string;
}

export interface PerfCommissionEntry {
  agentId: string | null;
  profileId: string | null;
  kind: "first_deal" | "trail";
  amountPaise: number;
  payoutPeriod: string;
}

export interface PerfAllotmentRow {
  hospitalId: string;
  agentId: string;
  allottedFrom: string;
  allottedTo: string | null;
}

export interface PerfPersonRef {
  id: string;
  name: string;
}

export interface PerfRange {
  /** inclusive IST dates, YYYY-MM-DD */
  from: string;
  to: string;
}

export interface PerfDataset {
  telecallers: PerfPersonRef[];
  agents: PerfPersonRef[];
  hospitals: PerfPersonRef[];
  leads: PerfLeadRow[];
  calls: PerfCallRow[];
  subs: PerfSubRow[];
  payments: PerfPaymentRow[];
  commissions: PerfCommissionEntry[];
  allotments: PerfAllotmentRow[];
  range: PerfRange;
}

// ─── Shared internals ────────────────────────────────────────

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

/** Captured payments (paise) on the given subscription ids, IST-range filtered. */
function capturedRevenue(ds: PerfDataset, subIds: Set<string>): number {
  return sum(
    ds.payments
      .filter(
        (p) =>
          p.status === "captured" &&
          subIds.has(p.subscriptionId) &&
          inRangeIst(p.createdAt, ds.range.from, ds.range.to),
      )
      .map((p) => p.amountPaise),
  );
}

function commissionTotals(
  ds: PerfDataset,
  match: (e: PerfCommissionEntry) => boolean,
): { firstDealPaise: number; trailPaise: number; totalPaise: number } {
  const periods = new Set(periodsBetween(ds.range.from, ds.range.to));
  const mine = ds.commissions.filter((e) => periods.has(e.payoutPeriod) && match(e));
  const firstDealPaise = sum(mine.filter((e) => e.kind === "first_deal").map((e) => e.amountPaise));
  const trailPaise = sum(mine.filter((e) => e.kind === "trail").map((e) => e.amountPaise));
  return { firstDealPaise, trailPaise, totalPaise: firstDealPaise + trailPaise };
}

/** Subscriptions "activated" (start_date, falling back to creation) inside the IST range. */
function activatedInRange(ds: PerfDataset, s: PerfSubRow): boolean {
  const stamp = s.startDate ? `${s.startDate}T00:00:00+05:30` : s.createdAt;
  return inRangeIst(stamp, ds.range.from, ds.range.to);
}

// ─── Lens 1: TELECALLERS ─────────────────────────────────────

export interface TelecallerPerfRow {
  telecallerId: string;
  name: string;
  leadsAssigned: number;
  callsMade: number;
  leadsCalled: number;
  /** contact-establishing calls ÷ leads_assigned — the coach signal */
  contactRate: Rate;
  freePoojas: number;
  linksSent: number;
  conversions: number;
  /** conversions ÷ free_poojas — closing skill */
  freePoojaToPaidRate: Rate;
  conversionRate: Rate;
  revenueGeneratedPaise: number;
  activeBookCount: number;
  churnCount: number;
  earnings: { firstDealPaise: number; trailPaise: number; totalPaise: number };
  /** converted_at − first contact, averaged over HER converted leads (days, 1dp) */
  avgDaysToConvert: number | null;
  insufficientData: boolean;
}

export function rankTelecallers(ds: PerfDataset): TelecallerPerfRow[] {
  const rows: TelecallerPerfRow[] = [];
  // First-contact timestamp per lead (earliest call wins).
  const firstContact = new Map<string, string>();
  for (const c of ds.calls) {
    if (!c.leadId) continue;
    const prev = firstContact.get(c.leadId);
    if (!prev || c.createdAt < prev) firstContact.set(c.leadId, c.createdAt);
  }

  for (const tc of ds.telecallers) {
    // [Pass-2 L12] leads are range-filtered HERE, matching the calls
    // filter and the hospital lens — the pure module can no longer
    // silently depend on every caller pre-filtering the lead rows.
    const myLeads = ds.leads.filter(
      (l) => l.assignedTo === tc.id && inRangeIst(l.createdAt, ds.range.from, ds.range.to),
    );
    const myLeadIds = new Set(myLeads.map((l) => l.id));
    const myCalls = ds.calls.filter(
      (c) => c.calledBy === tc.id && inRangeIst(c.createdAt, ds.range.from, ds.range.to),
    );
    const contactCalls = myCalls.filter(
      (c) =>
        c.outcome === "connected_interested" ||
        c.outcome === "connected_completed" ||
        c.outcome === "connected_partial",
    );
    const leadsCalled = new Set(
      myCalls.map((c) => c.leadId).filter((id): id is string => id !== null),
    );

    const myLeadsFreePooja = myLeads.filter((l) => l.freePoojaBy === tc.id).length;
    // §2 (REVIEW): links SENT ≠ conversions. A lead that received the
    // WhatsApp link but has not paid sits at status='link_sent' with
    // no subscription — counting only converted leads hid the exact
    // funnel gap this column exists to expose.
    const linksSent = myLeads.filter(
      (l) => l.status === "link_sent" || l.status === "converted" || l.subscriptionId !== null,
    ).length;

    const mySubs = ds.subs.filter((s) => s.telecallerId === tc.id);
    const conversions = mySubs.filter((s) => activatedInRange(ds, s)).length;
    const convLeadIds = new Set(myLeads.filter((l) => l.subscriptionId !== null).map((l) => l.id));
    const conversionRate: Rate = { n: convLeadIds.size, d: myLeads.length };

    // Churn signal: paused, cancelled, AND halted timestamps inside
    // the range. Halted is treated like paused (recoverable — a
    // resume flips it back), never like cancelled (final).
    const churnCount = mySubs.filter(
      (s) =>
        (s.pausedAt && inRangeIst(s.pausedAt, ds.range.from, ds.range.to)) ||
        (s.cancelledAt && inRangeIst(s.cancelledAt, ds.range.from, ds.range.to)) ||
        (s.haltedAt && inRangeIst(s.haltedAt, ds.range.from, ds.range.to)),
    ).length;

    // Conversion speed over leads SHE converted (has both timestamps).
    const convertDays: number[] = [];
    for (const l of myLeads) {
      if (!l.convertedAt) continue;
      const fc = firstContact.get(l.id);
      if (!fc) continue;
      convertDays.push(Math.max(0, (Date.parse(l.convertedAt) - Date.parse(fc)) / DAY_MS));
    }
    const avgDaysToConvert =
      convertDays.length > 0 ? Math.round((sum(convertDays) / convertDays.length) * 10) / 10 : null;

    const leadsAssigned = myLeads.length;
    rows.push({
      telecallerId: tc.id,
      name: tc.name,
      leadsAssigned,
      callsMade: myCalls.length,
      leadsCalled: leadsCalled.size,
      contactRate: { n: contactCalls.length, d: leadsAssigned },
      freePoojas: myLeadsFreePooja,
      linksSent,
      conversions,
      freePoojaToPaidRate: { n: conversions, d: myLeadsFreePooja },
      conversionRate,
      revenueGeneratedPaise: capturedRevenue(ds, new Set(mySubs.map((s) => s.id))),
      activeBookCount: mySubs.filter((s) => s.status === "active").length,
      churnCount,
      earnings: commissionTotals(ds, (e) => e.profileId === tc.id),
      avgDaysToConvert,
      insufficientData: leadsAssigned < MIN_LEADS_FOR_RANKING,
    });
  }

  // Reward-lens default order: conversion quality, then revenue.
  return rows.sort((a, b) => {
    const va = rateValue(a.conversionRate) ?? -1;
    const vb = rateValue(b.conversionRate) ?? -1;
    return vb - va || b.revenueGeneratedPaise - a.revenueGeneratedPaise;
  });
}

// ─── Lens 2: AGENTS ──────────────────────────────────────────

export interface AgentPerfRow {
  agentId: string;
  name: string;
  hospitalsHeld: string[];
  leadsSupplied: number;
  leadsConverted: number;
  /** converted ÷ supplied — the reallocation signal */
  leadQualityRate: Rate;
  revenueAttributedPaise: number;
  earningsPaise: number;
  bestHospital: string | null;
  worstHospital: string | null;
  insufficientData: boolean;
}

export function rankAgents(ds: PerfDataset): AgentPerfRow[] {
  // Hospital→current-agent map (allotment covering today, [from,to) style:
  // allotted_to IS NULL = current).
  const currentHolder = new Map<string, string>();
  for (const a of ds.allotments) {
    if (a.allottedTo === null) currentHolder.set(a.hospitalId, a.agentId);
  }
  const hospitalName = new Map(ds.hospitals.map((h) => [h.id, h.name]));

  const rows: AgentPerfRow[] = [];
  for (const ag of ds.agents) {
    // [Pass-2 L12] same range discipline as the telecaller/hospital lenses.
    const supplied = ds.leads.filter(
      (l) => l.sourceAgentId === ag.id && inRangeIst(l.createdAt, ds.range.from, ds.range.to),
    );
    const convertedLeads = supplied.filter((l) => l.convertedAt !== null);

    const mySubs = ds.subs.filter((s) => s.salesAgentId === ag.id);
    const heldNames: string[] = [];
    for (const h of ds.hospitals) {
      if (currentHolder.get(h.id) === ag.id) heldNames.push(h.name);
    }

    // Best/worst hospital BY CONVERSION among leads she sourced.
    const perHospital = new Map<string, { total: number; conv: number }>();
    for (const l of supplied) {
      if (!l.hospitalId) continue;
      const b = perHospital.get(l.hospitalId) ?? { total: 0, conv: 0 };
      b.total += 1;
      if (l.convertedAt !== null) b.conv += 1;
      perHospital.set(l.hospitalId, b);
    }
    const rankedHospitals = [...perHospital.entries()]
      .filter(([, v]) => v.total >= MIN_LEADS_FOR_RANKING)
      .sort((a, b) => b[1].conv / b[1].total - a[1].conv / a[1].total)
      .map(([hid]) => hospitalName.get(hid) ?? hid);

    const leadsSupplied = supplied.length;
    rows.push({
      agentId: ag.id,
      name: ag.name,
      hospitalsHeld: heldNames,
      leadsSupplied,
      leadsConverted: convertedLeads.length,
      leadQualityRate: { n: convertedLeads.length, d: leadsSupplied },
      revenueAttributedPaise: capturedRevenue(ds, new Set(mySubs.map((s) => s.id))),
      earningsPaise: commissionTotals(ds, (e) => e.agentId === ag.id).totalPaise,
      bestHospital: rankedHospitals[0] ?? null,
      worstHospital:
        rankedHospitals.length > 1 ? rankedHospitals[rankedHospitals.length - 1] : null,
      insufficientData: leadsSupplied < MIN_LEADS_FOR_RANKING,
    });
  }
  return rows.sort((a, b) => {
    const va = rateValue(a.leadQualityRate) ?? -1;
    const vb = rateValue(b.leadQualityRate) ?? -1;
    return vb - va || b.revenueAttributedPaise - a.revenueAttributedPaise;
  });
}

// ─── Lens 3: HOSPITALS ───────────────────────────────────────

export interface HospitalPerfRow {
  hospitalId: string;
  name: string;
  allottedAgentName: string | null;
  leadsProduced: number;
  converted: number;
  conversionRate: Rate;
  revenuePaise: number;
  insufficientData: boolean;
}

export function rankHospitals(ds: PerfDataset): HospitalPerfRow[] {
  const agentName = new Map(ds.agents.map((a) => [a.id, a.name]));
  const currentHolder = new Map<string, string>();
  for (const a of ds.allotments) {
    if (a.allottedTo === null) currentHolder.set(a.hospitalId, a.agentId);
  }

  const rows: HospitalPerfRow[] = [];
  for (const h of ds.hospitals) {
    const produced = ds.leads.filter(
      (l) => l.hospitalId === h.id && inRangeIst(l.createdAt, ds.range.from, ds.range.to),
    );
    const converted = produced.filter((l) => l.convertedAt !== null);
    const subIds = new Set(produced.map((l) => l.subscriptionId).filter((s): s is string => !!s));
    const holderId = currentHolder.get(h.id) ?? null;

    rows.push({
      hospitalId: h.id,
      name: h.name,
      allottedAgentName: holderId ? (agentName.get(holderId) ?? null) : null,
      leadsProduced: produced.length,
      converted: converted.length,
      conversionRate: { n: converted.length, d: produced.length },
      revenuePaise: capturedRevenue(ds, subIds),
      insufficientData: produced.length < MIN_LEADS_FOR_RANKING,
    });
  }
  return rows.sort((a, b) => {
    const va = rateValue(a.conversionRate) ?? -1;
    const vb = rateValue(b.conversionRate) ?? -1;
    return vb - va || b.revenuePaise - a.revenuePaise;
  });
}
