// ─────────────────────────────────────────────────────────────
// PUNYATA — Expenses, other income & P&L (PURE, OWNER-ONLY data)
//
// Every ₹ figure here is owner-only; the routes that feed these
// functions are gated by requireOwner. No imports from server code.
//
// REVENUE RECOGNITION (also shown as a UI tooltip):
//   • Collected  = amount of payments with status captured OR refunded,
//                  keyed by paid_at (IST month). Label it "Collected
//                  (incl. later-refunded)" — this intentionally differs
//                  from the Reports page "gross" (captured only).
//   • Refunds    = refund_amount_paise (or the full amount when
//                  status='refunded' and no refund amount is recorded),
//                  keyed by refunded_at, ALWAYS on a cash basis.
//   • Net revenue = autopay + QR collected − refunds. Other income
//                  (donations, one-time pooja) is its own line and is
//                  NOT part of net revenue / gross profit.
//   • Normalised basis spreads yearly autopay payments over 12 months
//                  and offline (QR) prepayments over the months they
//                  cover; expenses spread over amortize_months.
//   • Gross profit = net revenue − direct costs.
//     Net profit   = gross profit + other income − operating expenses.
// ─────────────────────────────────────────────────────────────

export type PnlBasis = "cash" | "normalised";

export interface PaymentLite {
  id: string;
  subscription_id: string;
  amount_paise: number | null;
  status: string;
  paid_at: string | null;
  refunded_at: string | null;
  refund_amount_paise: number | null;
  gateway: string | null;
  plan_billing_period: string | null;
  offline_period_start: string | null;
  offline_months: number | null;
}

export interface EntryLite {
  entry_date: string;
  amount_paise: number;
  amortize_months: number;
  category_id: string;
}

export interface CategoryLite {
  id: string;
  name: string;
  entry_type: "expense" | "income";
  pnl_group: "direct" | "operating" | "other_income";
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// ─── Month keys ──────────────────────────────────────────────

/** 'YYYY-MM' in IST. A bare YYYY-MM-DD is taken as an IST calendar
 *  date; a timestamp is shifted to IST first (23:59 IST on the 31st
 *  stays in its own month, 00:01 IST on the 1st is the next). */
export function monthKeyIST(isoTsOrDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoTsOrDate)) return isoTsOrDate.slice(0, 7);
  return new Date(Date.parse(isoTsOrDate) + IST_OFFSET_MS).toISOString().slice(0, 7);
}

export function addMonthsYm(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Inclusive list of months. Empty when to < from. */
export function monthRange(fromYm: string, toYm: string): string[] {
  const out: string[] = [];
  for (let ym = fromYm; ym <= toYm && out.length < 600; ym = addMonthsYm(ym, 1)) out.push(ym);
  return out;
}

/** Indian financial year (Apr–Mar): '2026-10-05' → 'FY 2026-27'. */
export function fyOf(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `FY ${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function fyStartYear(today: string): number {
  const [y, m] = today.split("-").map(Number);
  return m >= 4 ? y : y - 1;
}

export type PresetKey =
  "this_month" | "last_month" | "last_3" | "last_6" | "last_12" | "this_fy" | "last_fy";

export function presetRange(key: PresetKey, today: string): { fromYm: string; toYm: string } {
  const cur = today.slice(0, 7);
  switch (key) {
    case "this_month":
      return { fromYm: cur, toYm: cur };
    case "last_month": {
      const p = addMonthsYm(cur, -1);
      return { fromYm: p, toYm: p };
    }
    case "last_3":
      return { fromYm: addMonthsYm(cur, -2), toYm: cur };
    case "last_6":
      return { fromYm: addMonthsYm(cur, -5), toYm: cur };
    case "last_12":
      return { fromYm: addMonthsYm(cur, -11), toYm: cur };
    case "this_fy":
      return { fromYm: `${fyStartYear(today)}-04`, toYm: cur };
    case "last_fy": {
      const s = fyStartYear(today) - 1;
      return { fromYm: `${s}-04`, toYm: `${s + 1}-03` };
    }
  }
}

// ─── Spreading ───────────────────────────────────────────────

/** Splits integer paise across n months from startYm. Each month gets
 *  floor(amount/n); month 1 also takes the remainder, so the parts
 *  ALWAYS sum to the input exactly. */
export function spread(
  amount: number,
  startYm: string,
  n: number,
): { ym: string; amount: number }[] {
  const count = Math.max(1, Math.floor(n));
  const base = Math.floor(amount / count);
  const rem = amount - base * count;
  return Array.from({ length: count }, (_, i) => ({
    ym: addMonthsYm(startYm, i),
    amount: base + (i === 0 ? rem : 0),
  }));
}

// ─── Fetch window ────────────────────────────────────────────

/** Payments that STARTED covering before `fromYm` still land in the
 *  window (a yearly plan = 12 months, a QR prepay up to 24), so the
 *  API must read that far back. Payments need it on EVERY basis
 *  because paying-subscriber counts use coverage even on cash. Entries
 *  only need it when amortised (normalised basis, up to 36 months). */
export const PAYMENT_LOOKBACK_MONTHS = 24;
export const ENTRY_LOOKBACK_MONTHS = 36;

export function fetchWindow(
  fromYm: string,
  basis: PnlBasis,
): { paymentsFromYm: string; entriesFromYm: string } {
  return {
    paymentsFromYm: addMonthsYm(fromYm, -PAYMENT_LOOKBACK_MONTHS),
    entriesFromYm: basis === "normalised" ? addMonthsYm(fromYm, -ENTRY_LOOKBACK_MONTHS) : fromYm,
  };
}

// ─── Statement shape ─────────────────────────────────────────

export interface MonthPnl {
  month: string; // 'YYYY-MM' or 'total'
  revenueAutopay: number;
  revenueQr: number;
  otherIncome: number;
  refunds: number;
  netRevenue: number;
  byCategory: Record<string, number>;
  directCosts: number;
  grossProfit: number;
  grossMarginPct: number | null;
  operatingExpenses: number;
  netProfit: number;
  netMarginPct: number | null;
  payingSubscribers: number;
  arpuPaise: number | null;
  costPerSubscriberPaise: number | null;
}

function emptyMonth(month: string): MonthPnl {
  return {
    month,
    revenueAutopay: 0,
    revenueQr: 0,
    otherIncome: 0,
    refunds: 0,
    netRevenue: 0,
    byCategory: {},
    directCosts: 0,
    grossProfit: 0,
    grossMarginPct: null,
    operatingExpenses: 0,
    netProfit: 0,
    netMarginPct: null,
    payingSubscribers: 0,
    arpuPaise: null,
    costPerSubscriberPaise: null,
  };
}

/** Months a payment COVERS, as (startYm, count). Same rule for the
 *  normalised basis and for paying-subscriber counting. */
function coverageOf(p: PaymentLite): { startYm: string; n: number } | null {
  if (!p.paid_at) return null;
  if (p.gateway === "offline_qr" && p.offline_period_start && p.offline_months) {
    return { startYm: monthKeyIST(p.offline_period_start), n: p.offline_months };
  }
  const paidYm = monthKeyIST(p.paid_at);
  if (p.plan_billing_period === "yearly") return { startYm: paidYm, n: 12 };
  return { startYm: paidYm, n: 1 };
}

/**
 * Distinct subscriptions with a non-refunded payment COVERING each month
 * (yearly autopay = 12 months, QR prepay = its months, otherwise the paid
 * month). A partially-refunded payment still counts; a fully refunded one
 * does not. Shared by the P&L and the subscriber trend so "paying
 * subscribers" can never mean two things.
 */
export function payingSubscribersByMonth(
  payments: PaymentLite[],
  fromYm: string,
  toYm: string,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>(monthRange(fromYm, toYm).map((k) => [k, new Set()]));
  for (const p of payments) {
    if (p.status !== "captured") continue;
    const cov = coverageOf(p);
    if (!cov) continue;
    for (let i = 0; i < cov.n; i++) out.get(addMonthsYm(cov.startYm, i))?.add(p.subscription_id);
  }
  return out;
}

function pct(num: number, den: number): number | null {
  if (den === 0) return null;
  const v = (num / den) * 100;
  return Number.isFinite(v) ? v : null;
}

export function buildPnl(input: {
  payments: PaymentLite[];
  entries: EntryLite[];
  categories: CategoryLite[];
  fromYm: string;
  toYm: string;
  basis: PnlBasis;
}): { months: MonthPnl[]; total: MonthPnl } {
  const { payments, entries, categories, fromYm, toYm, basis } = input;
  const keys = monthRange(fromYm, toYm);
  const byMonth = new Map<string, MonthPnl>(keys.map((k) => [k, emptyMonth(k)]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const subsByMonth = payingSubscribersByMonth(payments, fromYm, toYm);

  // ── Revenue + refunds + paying subscribers ──
  for (const p of payments) {
    const amount = p.amount_paise ?? 0;
    const isQr = p.gateway === "offline_qr";

    if ((p.status === "captured" || p.status === "refunded") && p.paid_at) {
      const parts =
        basis === "normalised"
          ? (() => {
              const cov = coverageOf(p);
              return cov ? spread(amount, cov.startYm, cov.n) : [];
            })()
          : [{ ym: monthKeyIST(p.paid_at), amount }];
      for (const part of parts) {
        const row = byMonth.get(part.ym);
        if (!row) continue;
        if (isQr) row.revenueQr += part.amount;
        else row.revenueAutopay += part.amount;
      }
    }

    const refund =
      p.refund_amount_paise && p.refund_amount_paise > 0
        ? p.refund_amount_paise
        : p.status === "refunded"
          ? amount
          : 0;
    if (refund > 0) {
      const when = p.refunded_at ?? p.paid_at;
      if (when) {
        const row = byMonth.get(monthKeyIST(when));
        if (row) row.refunds += refund;
      }
    }
  }

  // ── Expenses + other income ──
  for (const e of entries) {
    const cat = catById.get(e.category_id);
    const parts =
      basis === "normalised"
        ? spread(e.amount_paise, monthKeyIST(e.entry_date), e.amortize_months)
        : [{ ym: monthKeyIST(e.entry_date), amount: e.amount_paise }];
    for (const part of parts) {
      const row = byMonth.get(part.ym);
      if (!row) continue;
      row.byCategory[e.category_id] = (row.byCategory[e.category_id] ?? 0) + part.amount;
      if (cat?.entry_type === "income") row.otherIncome += part.amount;
      else if (cat?.pnl_group === "direct") row.directCosts += part.amount;
      else row.operatingExpenses += part.amount; // unknown category: never silently drop a cost
    }
  }

  // ── Derived lines ──
  const finish = (row: MonthPnl, subscriberMonths: number) => {
    row.netRevenue = row.revenueAutopay + row.revenueQr - row.refunds;
    row.grossProfit = row.netRevenue - row.directCosts;
    row.netProfit = row.grossProfit + row.otherIncome - row.operatingExpenses;
    row.grossMarginPct = pct(row.grossProfit, row.netRevenue);
    row.netMarginPct = pct(row.netProfit, row.netRevenue);
    row.arpuPaise = subscriberMonths > 0 ? Math.round(row.netRevenue / subscriberMonths) : null;
    row.costPerSubscriberPaise =
      subscriberMonths > 0
        ? Math.round((row.directCosts + row.operatingExpenses) / subscriberMonths)
        : null;
  };

  const months = keys.map((k) => {
    const row = byMonth.get(k)!;
    row.payingSubscribers = subsByMonth.get(k)!.size;
    finish(row, row.payingSubscribers);
    return row;
  });

  // Total: per-subscriber metrics are per subscriber-MONTH so a 12-month
  // total ARPU reads on the same scale as a single month's.
  const total = emptyMonth("total");
  const allSubs = new Set<string>();
  let subscriberMonths = 0;
  for (const k of keys) {
    const row = byMonth.get(k)!;
    total.revenueAutopay += row.revenueAutopay;
    total.revenueQr += row.revenueQr;
    total.otherIncome += row.otherIncome;
    total.refunds += row.refunds;
    total.directCosts += row.directCosts;
    total.operatingExpenses += row.operatingExpenses;
    for (const [cid, v] of Object.entries(row.byCategory)) {
      total.byCategory[cid] = (total.byCategory[cid] ?? 0) + v;
    }
    subscriberMonths += row.payingSubscribers;
    for (const s of subsByMonth.get(k)!) allSubs.add(s);
  }
  total.payingSubscribers = allSubs.size;
  finish(total, subscriberMonths);

  return { months, total };
}

// ─── Compare ─────────────────────────────────────────────────

export type CompareGroup = "revenue" | "other_income" | "direct" | "operating" | "profit";

export interface CompareRow {
  key: string;
  label: string;
  group: CompareGroup;
  /** a = BASE period, b = the period being compared; delta = b − a. */
  a: number;
  b: number;
  delta: number;
  /** null when the base is 0 — never Infinity/NaN. */
  deltaPct: number | null;
  goodWhen: "up" | "down";
  isSubtotal: boolean;
}

function row(
  key: string,
  label: string,
  group: CompareGroup,
  a: number,
  b: number,
  goodWhen: "up" | "down",
  isSubtotal: boolean,
): CompareRow {
  const delta = b - a;
  return {
    key,
    label,
    group,
    a,
    b,
    delta,
    deltaPct: a === 0 ? null : (delta / Math.abs(a)) * 100,
    goodWhen,
    isSubtotal,
  };
}

export function comparePeriods(a: MonthPnl, b: MonthPnl, categories: CategoryLite[]): CompareRow[] {
  const out: CompareRow[] = [];
  out.push(
    row(
      "revenueAutopay",
      "Autopay revenue",
      "revenue",
      a.revenueAutopay,
      b.revenueAutopay,
      "up",
      false,
    ),
  );
  out.push(
    row("revenueQr", "QR / offline revenue", "revenue", a.revenueQr, b.revenueQr, "up", false),
  );
  out.push(row("refunds", "Refunds", "revenue", a.refunds, b.refunds, "down", false));
  out.push(row("netRevenue", "Net revenue", "revenue", a.netRevenue, b.netRevenue, "up", true));

  const catRows = (group: "direct" | "operating" | "other_income") =>
    categories
      .filter((c) => c.pnl_group === group)
      .map((c) => ({ c, av: a.byCategory[c.id] ?? 0, bv: b.byCategory[c.id] ?? 0 }))
      .filter((x) => x.av !== 0 || x.bv !== 0);

  for (const { c, av, bv } of catRows("direct")) {
    out.push(row(`cat:${c.id}`, c.name, "direct", av, bv, "down", false));
  }
  out.push(
    row("directCosts", "Direct costs", "direct", a.directCosts, b.directCosts, "down", true),
  );
  out.push(row("grossProfit", "Gross profit", "profit", a.grossProfit, b.grossProfit, "up", true));

  for (const { c, av, bv } of catRows("operating")) {
    out.push(row(`cat:${c.id}`, c.name, "operating", av, bv, "down", false));
  }
  out.push(
    row(
      "operatingExpenses",
      "Operating expenses",
      "operating",
      a.operatingExpenses,
      b.operatingExpenses,
      "down",
      true,
    ),
  );

  for (const { c, av, bv } of catRows("other_income")) {
    out.push(row(`cat:${c.id}`, c.name, "other_income", av, bv, "up", false));
  }
  out.push(
    row("otherIncome", "Other income", "other_income", a.otherIncome, b.otherIncome, "up", true),
  );
  out.push(row("netProfit", "Net profit", "profit", a.netProfit, b.netProfit, "up", true));
  return out;
}

/** The n largest absolute movers, subtotals excluded, zero-change out. */
export function topMovers(rows: CompareRow[], n = 3): CompareRow[] {
  return rows
    .filter((r) => !r.isSubtotal && r.delta !== 0)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, n);
}

/** "Meta ads ₹12,000 → ₹31,500 (+163%)" */
export function moverSentence(r: CompareRow, fmt: (paise: number) => string): string {
  const pctText =
    r.deltaPct === null ? "new" : `${r.deltaPct >= 0 ? "+" : ""}${Math.round(r.deltaPct)}%`;
  return `${r.label} ${fmt(r.a)} → ${fmt(r.b)} (${pctText})`;
}

// ─── Sheet builders (feed xlsx-write.ts) ─────────────────────

export type SheetCell = string | number | null;

const rupees = (paise: number) => Math.round(paise) / 100;

export function toPnlSheet(
  pnl: { months: MonthPnl[]; total: MonthPnl },
  categories: CategoryLite[],
): SheetCell[][] {
  const cols = [...pnl.months, pnl.total];
  const header: SheetCell[] = ["Line (₹)", ...pnl.months.map((m) => m.month), "Total"];
  const line = (label: string, pick: (m: MonthPnl) => number): SheetCell[] => [
    label,
    ...cols.map((m) => rupees(pick(m))),
  ];
  const catLines = (group: CategoryLite["pnl_group"]): SheetCell[][] =>
    categories
      .filter((c) => c.pnl_group === group && cols.some((m) => (m.byCategory[c.id] ?? 0) !== 0))
      .map((c) => line(`  ${c.name}`, (m) => m.byCategory[c.id] ?? 0));

  return [
    header,
    line("Autopay revenue", (m) => m.revenueAutopay),
    line("QR / offline revenue", (m) => m.revenueQr),
    line("Refunds", (m) => -m.refunds),
    line("NET REVENUE", (m) => m.netRevenue),
    ...catLines("direct"),
    line("Direct costs", (m) => m.directCosts),
    line("GROSS PROFIT", (m) => m.grossProfit),
    ...catLines("operating"),
    line("Operating expenses", (m) => m.operatingExpenses),
    ...catLines("other_income"),
    line("Other income", (m) => m.otherIncome),
    line("NET PROFIT", (m) => m.netProfit),
    [
      "Gross margin %",
      ...cols.map((m) => (m.grossMarginPct === null ? "" : Math.round(m.grossMarginPct * 10) / 10)),
    ],
    [
      "Net margin %",
      ...cols.map((m) => (m.netMarginPct === null ? "" : Math.round(m.netMarginPct * 10) / 10)),
    ],
    ["Paying subscribers", ...cols.map((m) => m.payingSubscribers)],
  ];
}

export interface LedgerRowLite {
  entry_date: string;
  category_name: string;
  entry_type: string;
  amount_paise: number;
  description: string;
  counterparty: string | null;
  payment_method: string;
  reference_no: string | null;
  amortize_months: number;
}

export function toLedgerSheet(rows: LedgerRowLite[]): SheetCell[][] {
  return [
    [
      "Date",
      "Type",
      "Category",
      "Amount (₹)",
      "Description",
      "Paid to / received from",
      "Method",
      "Reference",
      "Spread (months)",
    ],
    ...rows.map((r): SheetCell[] => [
      r.entry_date,
      r.entry_type === "income" ? "Income" : "Expense",
      r.category_name,
      rupees(r.amount_paise),
      r.description,
      r.counterparty,
      r.payment_method,
      r.reference_no,
      r.amortize_months,
    ]),
  ];
}
