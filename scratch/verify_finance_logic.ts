// Verification harness — expenses / P&L: IST month keys, spreading,
// revenue recognition (cash vs normalised), refunds, margins, coverage-
// based subscriber counts, compare + movers, FY presets, fetch window.
// Run: npm run test:finance
//   (= node --import ./scratch/ts-aliases.mjs scratch/verify_finance_logic.ts)

import process from "node:process";
import {
  buildPnl,
  comparePeriods,
  fetchWindow,
  fyOf,
  monthKeyIST,
  monthRange,
  moverSentence,
  payingSubscribersByMonth,
  presetRange,
  spread,
  toLedgerSheet,
  toPnlSheet,
  topMovers,
  type CategoryLite,
  type EntryLite,
  type PaymentLite,
} from "../src/lib/finance-logic.ts";
import {
  parseCategoryBody,
  parseEntryBody,
  parsePnlRequest,
  parseReason,
} from "../src/lib/finance-requests.ts";
import { buildSubscriberTrend } from "../src/lib/subscriber-trend-logic.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  check(ok ? label : `${label} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`, ok);
};

const cats: CategoryLite[] = [
  { id: "pandit", name: "Pandit dakshina", entry_type: "expense", pnl_group: "direct" },
  { id: "ads", name: "Meta / Google ads", entry_type: "expense", pnl_group: "operating" },
  { id: "sw", name: "Software & hosting", entry_type: "expense", pnl_group: "operating" },
  { id: "don", name: "Donations received", entry_type: "income", pnl_group: "other_income" },
];

let seq = 0;
function pay(p: Partial<PaymentLite>): PaymentLite {
  return {
    id: `p${++seq}`,
    subscription_id: `s${seq}`,
    amount_paise: 19900,
    status: "captured",
    paid_at: "2026-10-10T06:00:00Z",
    refunded_at: null,
    refund_amount_paise: null,
    gateway: "razorpay",
    plan_billing_period: "monthly",
    offline_period_start: null,
    offline_months: null,
    ...p,
  };
}

// ── month keys ──
eq("23:59 IST on 31st stays in October", monthKeyIST("2026-10-31T18:29:00Z"), "2026-10");
eq("00:01 IST on 1st is November", monthKeyIST("2026-10-31T18:31:00Z"), "2026-11");
eq("bare date uses its own month", monthKeyIST("2026-10-31"), "2026-10");
eq("monthRange spans year", monthRange("2026-11", "2027-02"), [
  "2026-11",
  "2026-12",
  "2027-01",
  "2027-02",
]);
eq("monthRange empty when reversed", monthRange("2026-05", "2026-04"), []);

// ── FY + presets ──
eq("fyOf 31 Mar", fyOf("2027-03-31"), "FY 2026-27");
eq("fyOf 1 Apr", fyOf("2027-04-01"), "FY 2027-28");
eq("fyOf Oct", fyOf("2026-10-05"), "FY 2026-27");
eq("this_fy on 31 Mar", presetRange("this_fy", "2027-03-31"), {
  fromYm: "2026-04",
  toYm: "2027-03",
});
eq("this_fy on 1 Apr", presetRange("this_fy", "2027-04-01"), {
  fromYm: "2027-04",
  toYm: "2027-04",
});
eq("last_fy on 1 Apr", presetRange("last_fy", "2027-04-01"), {
  fromYm: "2026-04",
  toYm: "2027-03",
});
eq("last_fy on 31 Mar", presetRange("last_fy", "2027-03-31"), {
  fromYm: "2025-04",
  toYm: "2026-03",
});
eq("last_3 includes current month", presetRange("last_3", "2026-10-25"), {
  fromYm: "2026-08",
  toYm: "2026-10",
});
eq("last_12 crosses year", presetRange("last_12", "2026-02-10"), {
  fromYm: "2025-03",
  toYm: "2026-02",
});
eq("last_month across January", presetRange("last_month", "2027-01-15"), {
  fromYm: "2026-12",
  toYm: "2026-12",
});

// ── spread ──
const s3 = spread(1000, "2026-11", 3);
eq(
  "spread(1000,3) sums to input",
  s3.reduce((a, b) => a + b.amount, 0),
  1000,
);
eq(
  "remainder lands in month 1",
  s3.map((x) => x.amount),
  [334, 333, 333],
);
eq(
  "spread months advance across year",
  spread(12, "2026-12", 2).map((x) => x.ym),
  ["2026-12", "2027-01"],
);
eq("spread n=1 is identity", spread(777, "2026-01", 1), [{ ym: "2026-01", amount: 777 }]);

// ── yearly autopay: cash vs normalised ──
const yearly = pay({
  amount_paise: 238800,
  plan_billing_period: "yearly",
  paid_at: "2026-10-10T06:00:00Z",
});
const yCash = buildPnl({
  payments: [yearly],
  entries: [],
  categories: cats,
  fromYm: "2026-10",
  toYm: "2027-09",
  basis: "cash",
});
eq("yearly cash: full amount in paid month", yCash.months[0].revenueAutopay, 238800);
eq("yearly cash: nothing in later months", yCash.months[1].revenueAutopay, 0);
const yNorm = buildPnl({
  payments: [yearly],
  entries: [],
  categories: cats,
  fromYm: "2026-10",
  toYm: "2027-09",
  basis: "normalised",
});
check(
  "yearly normalised: 12 x 19900",
  yNorm.months.every((m) => m.revenueAutopay === 19900),
);
eq(
  "yearly normalised total equals cash total",
  yNorm.total.revenueAutopay,
  yCash.total.revenueAutopay,
);

// ── offline QR prepay: spread + subscribers in all months ──
const qr3 = pay({
  gateway: "offline_qr",
  amount_paise: 59700,
  paid_at: "2026-10-12T06:30:00Z",
  offline_period_start: "2026-10-12",
  offline_months: 3,
});
const qrN = buildPnl({
  payments: [qr3],
  entries: [],
  categories: cats,
  fromYm: "2026-10",
  toYm: "2026-12",
  basis: "normalised",
});
eq(
  "QR 3-month prepay spreads over 3 months",
  qrN.months.map((m) => m.revenueQr),
  [19900, 19900, 19900],
);
eq("QR revenue is not counted as autopay", qrN.total.revenueAutopay, 0);
eq(
  "payingSubscribers counts a 3-month QR prepay in all 3 months",
  qrN.months.map((m) => m.payingSubscribers),
  [1, 1, 1],
);
const qrC = buildPnl({
  payments: [qr3],
  entries: [],
  categories: cats,
  fromYm: "2026-10",
  toYm: "2026-12",
  basis: "cash",
});
eq(
  "cash basis still counts coverage for subscribers",
  qrC.months.map((m) => m.payingSubscribers),
  [1, 1, 1],
);
eq(
  "cash basis books QR money in the paid month",
  qrC.months.map((m) => m.revenueQr),
  [59700, 0, 0],
);

// ── refunds ──
const partial = pay({
  amount_paise: 19900,
  status: "captured",
  refund_amount_paise: 5000,
  refunded_at: "2026-11-02T06:00:00Z",
});
const full = pay({
  amount_paise: 19900,
  status: "refunded",
  refund_amount_paise: null,
  refunded_at: "2026-11-03T06:00:00Z",
});
const rf = buildPnl({
  payments: [partial, full],
  entries: [],
  categories: cats,
  fromYm: "2026-10",
  toYm: "2026-11",
  basis: "cash",
});
eq("collected includes later-refunded payment", rf.months[0].revenueAutopay, 39800);
eq("refunds keyed by refunded_at month", rf.months[1].refunds, 5000 + 19900);
eq("net revenue = collected - refunds (total)", rf.total.netRevenue, 39800 - 24900);
eq(
  "partial refund still counts as paying; full refund does not",
  rf.months[0].payingSubscribers,
  1,
);

// ── margins + ARPU null-safety ──
const empty = buildPnl({
  payments: [],
  entries: [],
  categories: cats,
  fromYm: "2026-10",
  toYm: "2026-10",
  basis: "cash",
});
eq(
  "margins null at zero revenue",
  [empty.total.grossMarginPct, empty.total.netMarginPct],
  [null, null],
);
eq(
  "ARPU / cost per subscriber null at zero subscribers",
  [empty.total.arpuPaise, empty.total.costPerSubscriberPaise],
  [null, null],
);
const costOnly = buildPnl({
  payments: [],
  entries: [
    { entry_date: "2026-10-05", amount_paise: 500000, amortize_months: 1, category_id: "pandit" },
  ],
  categories: cats,
  fromYm: "2026-10",
  toYm: "2026-10",
  basis: "cash",
});
check(
  "no NaN/Infinity anywhere with cost but no revenue",
  JSON.stringify(costOnly).indexOf("null") >= 0 && !/NaN|Infinity/.test(JSON.stringify(costOnly)),
);

// ── QA step 6 shape: gross profit, software amortisation, other income ──
const entries: EntryLite[] = [
  { entry_date: "2026-10-05", amount_paise: 500000, amortize_months: 1, category_id: "pandit" },
  { entry_date: "2026-10-06", amount_paise: 300000, amortize_months: 1, category_id: "ads" },
  { entry_date: "2026-10-07", amount_paise: 1200000, amortize_months: 12, category_id: "sw" },
  { entry_date: "2026-10-08", amount_paise: 110000, amortize_months: 1, category_id: "don" },
];
const sub = pay({ amount_paise: 1000000, paid_at: "2026-10-09T06:00:00Z" });
const pnlN = buildPnl({
  payments: [sub],
  entries,
  categories: cats,
  fromYm: "2026-10",
  toYm: "2026-12",
  basis: "normalised",
});
eq(
  "gross profit = net revenue - direct costs (donation excluded)",
  pnlN.months[0].grossProfit,
  1000000 - 500000,
);
eq(
  "normalised: software Rs 1,000 per month",
  pnlN.months.map((m) => m.byCategory["sw"] ?? 0),
  [100000, 100000, 100000],
);
eq(
  "net profit = gross + other income - operating",
  pnlN.months[0].netProfit,
  500000 + 110000 - (300000 + 100000),
);
const pnlC = buildPnl({
  payments: [sub],
  entries,
  categories: cats,
  fromYm: "2026-10",
  toYm: "2026-12",
  basis: "cash",
});
eq("cash: full software cost in entry month", pnlC.months[0].byCategory["sw"], 1200000);
eq(
  "normalised and cash totals match for a fully-covered window",
  pnlN.total.directCosts,
  pnlC.total.directCosts,
);
eq("margin is a finite percent", Math.round(pnlN.months[0].grossMarginPct ?? -1), 50);
const nrow = pnlN.months[0];
check("ARPU = net revenue / paying subscribers", nrow.arpuPaise === 1000000);

// ── lookback: spreads that begin before the window ──
const old = pay({
  amount_paise: 238800,
  plan_billing_period: "yearly",
  paid_at: "2026-05-10T06:00:00Z",
});
const win = { fromYm: "2026-10", toYm: "2026-12" };
const without = buildPnl({
  payments: [],
  entries: [],
  categories: cats,
  ...win,
  basis: "normalised",
});
const withOld = buildPnl({
  payments: [old],
  entries: [],
  categories: cats,
  ...win,
  basis: "normalised",
});
eq(
  "yearly payment from 5 months earlier is invisible without lookback",
  without.total.revenueAutopay,
  0,
);
eq(
  "…and contributes 3 x 19900 once the lookback rows are supplied",
  withOld.total.revenueAutopay,
  3 * 19900,
);
const oldEntry: EntryLite = {
  entry_date: "2026-03-15",
  amount_paise: 3600000,
  amortize_months: 36,
  category_id: "sw",
};
const oe = buildPnl({
  payments: [],
  entries: [oldEntry],
  categories: cats,
  ...win,
  basis: "normalised",
});
eq(
  "36-month amortised entry from 7 months earlier lands in window",
  oe.total.operatingExpenses,
  3 * 100000,
);
const fw = fetchWindow("2026-10", "normalised");
eq("fetchWindow payments reach 24 months back", fw.paymentsFromYm, "2024-10");
eq("fetchWindow entries reach 36 months back when normalised", fw.entriesFromYm, "2023-10");
eq(
  "fetchWindow entries stay in-window on cash",
  fetchWindow("2026-10", "cash").entriesFromYm,
  "2026-10",
);
check(
  "fetchWindow covers the longest possible spread (24-month QR prepay)",
  fw.paymentsFromYm <= "2024-10",
);

// ── compare + movers ──
const a = buildPnl({
  payments: [pay({ amount_paise: 100000, paid_at: "2026-09-10T06:00:00Z" })],
  entries: [
    { entry_date: "2026-09-05", amount_paise: 1200000, amortize_months: 1, category_id: "ads" },
  ],
  categories: cats,
  fromYm: "2026-09",
  toYm: "2026-09",
  basis: "cash",
}).total;
const b = buildPnl({
  payments: [pay({ amount_paise: 300000, paid_at: "2026-10-10T06:00:00Z" })],
  entries: [
    { entry_date: "2026-10-05", amount_paise: 3150000, amortize_months: 1, category_id: "ads" },
    { entry_date: "2026-10-06", amount_paise: 400000, amortize_months: 1, category_id: "pandit" },
  ],
  categories: cats,
  fromYm: "2026-10",
  toYm: "2026-10",
  basis: "cash",
}).total;
const rows = comparePeriods(a, b, cats);
const ads = rows.find((r) => r.key === "cat:ads")!;
eq("delta = b - a", ads.delta, 3150000 - 1200000);
check("deltaPct for ads is +162.5%", Math.abs((ads.deltaPct ?? 0) - 162.5) < 1e-9);
const pandit = rows.find((r) => r.key === "cat:pandit")!;
eq("deltaPct is null when base is 0", pandit.deltaPct, null);
check(
  "costs are good when down",
  ads.goodWhen === "down" && rows.find((r) => r.key === "netProfit")!.goodWhen === "up",
);
const movers = topMovers(rows, 3);
check(
  "topMovers excludes subtotals",
  movers.every((m) => !m.isSubtotal),
);
eq("topMovers ranks by |delta|", movers[0].key, "cat:ads");
check("topMovers returns at most 3", movers.length <= 3);
const sentence = moverSentence(ads, (p) => `R${p / 100}`);
eq("mover sentence", sentence, "Meta / Google ads R12000 → R31500 (+163%)");
check(
  "mover sentence says 'new' when base is 0",
  moverSentence(pandit, (p) => `R${p / 100}`).includes("(new)"),
);
check("compare rows have no NaN/Infinity", !/NaN|Infinity/.test(JSON.stringify(rows)));

// ── request validators ──
const UUID = "0b9f0f1e-1c2d-4e3f-8a4b-5c6d7e8f9a0b";
const goodEntry = {
  entryDate: "2026-10-20",
  categoryId: UUID,
  amountPaise: 500000,
  description: " Pandit ",
  paymentMethod: "cash",
};
const entryOk = (p: Record<string, unknown>) =>
  parseEntryBody({ ...goodEntry, ...p }, "2026-10-25").ok;
check(
  "entry: good body parses + trims",
  (() => {
    const r = parseEntryBody(goodEntry, "2026-10-25");
    return r.ok && r.value.description === "Pandit" && r.value.amortizeMonths === 1;
  })(),
);
check("entry: rejects future date", !entryOk({ entryDate: "2026-10-26" }));
check("entry: rejects impossible date", !entryOk({ entryDate: "2026-02-30" }));
check(
  "entry: rejects zero / float / > Rs 1 crore",
  !entryOk({ amountPaise: 0 }) &&
    !entryOk({ amountPaise: 10.5 }) &&
    !entryOk({ amountPaise: 1_000_000_001 }),
);
check("entry: accepts exactly Rs 1 crore", entryOk({ amountPaise: 1_000_000_000 }));
check("entry: rejects blank description", !entryOk({ description: "   " }));
check("entry: rejects unknown method", !entryOk({ paymentMethod: "bitcoin" }));
check(
  "entry: rejects spread 0 and 37",
  !entryOk({ amortizeMonths: 0 }) && !entryOk({ amortizeMonths: 37 }),
);
check("entry: accepts spread 36", entryOk({ amortizeMonths: 36 }));
check(
  "entry: rejects non-Cloudinary receipt",
  !entryOk({ receiptUrl: "https://evil.example/r.jpg" }),
);
check("entry: rejects bad category id", !entryOk({ categoryId: "nope" }));
check(
  "category: income must be other_income",
  !parseCategoryBody({ name: "X", entryType: "income", pnlGroup: "direct" }).ok,
);
check(
  "category: expense cannot be other_income",
  !parseCategoryBody({ name: "X", entryType: "expense", pnlGroup: "other_income" }).ok,
);
check(
  "category: valid parses",
  parseCategoryBody({ name: " Rent ", entryType: "expense", pnlGroup: "operating", sortOrder: 5 })
    .ok,
);
check("reason: needs 3+ chars", !parseReason("ab").ok && parseReason("typo").ok);
check(
  "pnl request: defaults basis to cash",
  (() => {
    const r = parsePnlRequest({ fromYm: "2026-01", toYm: "2026-03" });
    return r.ok && r.value.basis === "cash" && r.value.compare === null;
  })(),
);
check(
  "pnl request: rejects reversed range",
  !parsePnlRequest({ fromYm: "2026-05", toYm: "2026-03" }).ok,
);
check(
  "pnl request: rejects > 36 months",
  !parsePnlRequest({ fromYm: "2023-01", toYm: "2026-02" }).ok,
);
check(
  "pnl request: rejects bad basis",
  !parsePnlRequest({ fromYm: "2026-01", toYm: "2026-03", basis: "accrual" }).ok,
);
check(
  "pnl request: validates compare range",
  !parsePnlRequest({
    fromYm: "2026-01",
    toYm: "2026-03",
    compare: { fromYm: "2026-13", toYm: "2026-03" },
  }).ok,
);

// ── payingSubscribersByMonth + subscriber trend ──
const pq = [
  pay({ subscription_id: "A", paid_at: "2026-09-10T06:00:00Z" }),
  pay({ subscription_id: "A", paid_at: "2026-10-10T06:00:00Z" }),
  pay({ subscription_id: "B", paid_at: "2026-09-12T06:00:00Z", status: "refunded" }),
  pay({
    subscription_id: "C",
    paid_at: "2026-09-15T06:00:00Z",
    gateway: "offline_qr",
    offline_period_start: "2026-09-15",
    offline_months: 3,
  }),
];
const psm = payingSubscribersByMonth(pq, "2026-09", "2026-11");
eq("paying: Sep = A + C (refunded B excluded)", [...psm.get("2026-09")!].sort(), ["A", "C"]);
eq("paying: Oct = A + C (QR prepay still covers)", [...psm.get("2026-10")!].sort(), ["A", "C"]);
eq("paying: Nov = C only", [...psm.get("2026-11")!], ["C"]);
const trend = buildSubscriberTrend({
  subs: [
    { id: "A", status: "active", start_date: "2026-09-01", cancelled_at: null, halted_at: null },
    {
      id: "C",
      status: "cancelled",
      start_date: "2026-09-15",
      cancelled_at: "2026-10-31T18:31:00Z",
      halted_at: null,
    },
    {
      id: "D",
      status: "halted",
      start_date: "2026-08-01",
      cancelled_at: null,
      halted_at: "2026-10-05T00:00:00Z",
    },
  ],
  payments: pq,
  fromYm: "2026-09",
  toYm: "2026-11",
});
eq(
  "trend: new subscribers by start month",
  trend.months.map((m) => m.newSubs),
  [2, 0, 0],
);
eq(
  "trend: cancelled uses IST month (18:31Z on 31 Oct = 1 Nov)",
  trend.months.map((m) => m.cancelled),
  [0, 0, 1],
);
eq(
  "trend: lapsed by halted_at month",
  trend.months.map((m) => m.lapsed),
  [0, 1, 0],
);
eq(
  "trend: paying per month",
  trend.months.map((m) => m.paying),
  [2, 2, 1],
);
eq("trend: active now counts live status only", trend.activeNow, 1);

// ── sheets ──
const sheet = toPnlSheet({ months: [a], total: a }, cats);
eq("pnl sheet header", sheet[0], ["Line (₹)", "total", "Total"]);
const ledger = toLedgerSheet([
  {
    entry_date: "2026-10-05",
    category_name: "Pandit dakshina",
    entry_type: "expense",
    amount_paise: 500000,
    description: "x",
    counterparty: null,
    payment_method: "upi",
    reference_no: null,
    amortize_months: 1,
  },
]);
eq("ledger converts paise to rupees", ledger[1][3], 5000);

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll finance-logic checks passed.");
