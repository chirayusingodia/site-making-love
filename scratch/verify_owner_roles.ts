// Verification harness — Session 6.5 owner/admin two-tier roles.
// Run:  node scratch/verify_owner_roles.ts   (Node 24 strips types natively)
//
// Covers:
//  1. Role gates (isStaffRole / isOwnerRole — the exact predicates
//     requireAdmin / requireOwner apply server-side)
//  2. Payments field-stripping: admin response never contains
//     amount_paise / razorpay ids; owner keeps everything
//  3. Payments aggregates: counts both roles, ₹ sums owner-only
//  4. Payments CSV: admin CSV omits amount + Razorpay columns
//  5. Sales agents: commission_percent stripped for admin
//  6. Overview financials math (MRR normalisation, captured sums)
//  7. Reports derivations + CSV builders (subscribers / revenue /
//     seva / pending) incl. IST month-window edge cases
//  8. Static SQL checks on migrations 006 + 007 (constraint text,
//     no auto-promote UPDATE executed, is_admin widened, agent kept)

import { readFileSync } from "node:fs";
import { isOwnerRole, isStaffRole } from "../src/lib/supabase-admin.server.ts";
import {
  buildPaymentsCsv,
  computePaymentAggregates,
  maskPaymentRowForRole,
  maskPaymentRowsForRole,
  PAYMENT_MASKED_FIELDS,
  type PaymentListRow,
} from "../src/lib/payments-logic.ts";
import {
  AGENT_MASKED_FIELDS,
  maskAgentRowsForRole,
  type SalesAgentRow,
} from "../src/lib/sales-agents-logic.ts";
import { computeMrr, sumCapturedPayments } from "../src/lib/financials-logic.ts";
import {
  buildPendingSevasCsv,
  buildRevenueCsv,
  buildSevaCsv,
  buildSubscribersCsv,
  computePendingSevas,
  computeRevenueReport,
  computeSevaReport,
  computeSubscriberReport,
  csvFilename,
  isReportKey,
  isValidMonth,
  monthWindow,
  type BatchRow,
  type ViewRow,
} from "../src/lib/reports-logic.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

// ─────────────────────────────────────────────────────────────
// 1. Role gates
// ─────────────────────────────────────────────────────────────
console.log("\n— Role gates (requireAdmin / requireOwner predicates) —");

check("admin is staff", isStaffRole("admin"));
check("owner is staff (superset)", isStaffRole("owner"));
check("user is NOT staff", !isStaffRole("user"));
check("agent is NOT staff", !isStaffRole("agent"));
check("null is NOT staff", !isStaffRole(null));
check("undefined is NOT staff", !isStaffRole(undefined));
check("garbage string is NOT staff", !isStaffRole("admin '; DROP TABLE--"));
check("owner passes owner gate", isOwnerRole("owner"));
check("admin FAILS owner gate (→ 403)", !isOwnerRole("admin"));
check("user FAILS owner gate", !isOwnerRole("user"));

// ─────────────────────────────────────────────────────────────
// 2. Payments field-stripping
// ─────────────────────────────────────────────────────────────
console.log("\n— Payments field-stripping (server-side, before response) —");

const rawPayment: PaymentListRow = {
  id: "pay_1",
  subscription_id: "sub_1",
  razorpay_payment_id: "pay_RzpABC123",
  razorpay_order_id: "order_RzpXYZ789",
  amount_paise: 39900,
  status: "captured",
  method: "upi",
  cycle_number: 3,
  paid_at: "2026-08-01T10:00:00+05:30",
  failure_reason: null,
  created_at: "2026-08-01T10:00:05+05:30",
  subscription: {
    id: "sub_1",
    plan_id: "plan_1",
    plans: { name: "Premium", billing_period: "monthly" },
  },
};

const adminRow = maskPaymentRowForRole(rawPayment, "admin");
check("admin: amount_paise nulled", adminRow.amount_paise === null);
check("admin: razorpay_payment_id nulled", adminRow.razorpay_payment_id === null);
check("admin: razorpay_order_id nulled", adminRow.razorpay_order_id === null);
check("admin: status still visible", adminRow.status === "captured");
check("admin: subscription_id still visible", adminRow.subscription_id === "sub_1");
check("admin: method still visible", adminRow.method === "upi");
check("admin: cycle_number still visible", adminRow.cycle_number === 3);
check("admin: paid_at still visible", adminRow.paid_at === rawPayment.paid_at);
check("admin: plan name still visible", adminRow.subscription?.plans?.name === "Premium");
check("admin: original row NOT mutated", rawPayment.amount_paise === 39900);
check(
  "admin: masked keys present-but-null (UI renders 🔒, not 'missing')",
  "amount_paise" in adminRow && adminRow.amount_paise === null,
);

const ownerRow = maskPaymentRowForRole(rawPayment, "owner");
check("owner: amount_paise intact", ownerRow.amount_paise === 39900);
check("owner: razorpay_payment_id intact", ownerRow.razorpay_payment_id === "pay_RzpABC123");
check("owner: razorpay_order_id intact", ownerRow.razorpay_order_id === "order_RzpXYZ789");

const batch = maskPaymentRowsForRole([rawPayment], "admin");
check("batch mask (admin): same behaviour", batch[0].amount_paise === null);
check(
  "masked field list is exactly the 3 owner-only fields",
  PAYMENT_MASKED_FIELDS.length === 3 &&
    PAYMENT_MASKED_FIELDS.includes("amount_paise") &&
    PAYMENT_MASKED_FIELDS.includes("razorpay_payment_id") &&
    PAYMENT_MASKED_FIELDS.includes("razorpay_order_id"),
);

// Simulated wire check: JSON an admin client would actually receive
const adminWire = JSON.parse(JSON.stringify(maskPaymentRowsForRole([rawPayment], "admin")[0]));
check(
  "admin wire JSON contains no real amount anywhere",
  !JSON.stringify(adminWire).includes("39900"),
);
check(
  "admin wire JSON contains no real Razorpay IDs anywhere",
  !JSON.stringify(adminWire).includes("pay_RzpABC123") &&
    !JSON.stringify(adminWire).includes("order_RzpXYZ789"),
);

// ─────────────────────────────────────────────────────────────
// 3. Payments aggregates
// ─────────────────────────────────────────────────────────────
console.log("\n— Payments aggregates —");

const aggRows = [
  { amount_paise: 39900, status: "captured" },
  { amount_paise: 25100, status: "captured" },
  { amount_paise: 39900, status: "failed" },
  { amount_paise: 39900, status: "refunded" },
  { amount_paise: 25100, status: "pending" },
];
const adminAgg = computePaymentAggregates(aggRows, "admin");
check("admin agg: captured count", adminAgg.capturedCount === 2);
check("admin agg: failed count", adminAgg.failedCount === 1);
check("admin agg: refunded count", adminAgg.refundedCount === 1);
check(
  "admin agg: ALL ₹ sums null",
  adminAgg.capturedPaise === null &&
    adminAgg.failedPaise === null &&
    adminAgg.refundedPaise === null,
);
const ownerAgg = computePaymentAggregates(aggRows, "owner");
check("owner agg: captured ₹ sum", ownerAgg.capturedPaise === 65000);
check("owner agg: failed ₹ sum", ownerAgg.failedPaise === 39900);
check("owner agg: refunded ₹ sum", ownerAgg.refundedPaise === 39900);
check("owner agg: counts match admin", ownerAgg.capturedCount === 2 && ownerAgg.failedCount === 1);

// ─────────────────────────────────────────────────────────────
// 4. Payments CSV
// ─────────────────────────────────────────────────────────────
console.log("\n— Payments CSV (role-shaped columns) —");

const nameMap = new Map([["sub_1", "Ramesh Sharma"]]);
const adminCsv = buildPaymentsCsv([rawPayment], "admin", nameMap);
const ownerCsv = buildPaymentsCsv([rawPayment], "owner", nameMap);
check("admin CSV: no amount_inr column", !adminCsv.split("\n")[0].includes("amount_inr"));
check("admin CSV: no razorpay columns", !adminCsv.split("\n")[0].includes("razorpay"));
check("admin CSV: no real amount value", !adminCsv.includes("399.00"));
check("admin CSV: no real razorpay ids", !adminCsv.includes("pay_RzpABC123"));
check(
  "admin CSV: keeps operational cols",
  adminCsv.split("\n")[0].includes("status") && adminCsv.split("\n")[0].includes("subscriber"),
);
check("owner CSV: has amount_inr column", ownerCsv.split("\n")[0].includes("amount_inr"));
check("owner CSV: has razorpay columns", ownerCsv.split("\n")[0].includes("razorpay_payment_id"));
check("owner CSV: includes real amount", ownerCsv.includes("399.00"));
check("owner CSV: includes real ids", ownerCsv.includes("pay_RzpABC123"));

// ─────────────────────────────────────────────────────────────
// 5. Sales agents masking (Task 6)
// ─────────────────────────────────────────────────────────────
console.log("\n— Sales agents masking (Task 6 — FLAGGED for review) —");

const agent: SalesAgentRow = {
  id: "agent_1",
  full_name: "Rahul Verma",
  phone: "+919876543210",
  agent_code: "FM_RAHUL01",
  commission_percent: 12.5,
  is_active: true,
  created_at: "2026-07-01T00:00:00+05:30",
  subscriptionCount: 17,
};
const adminAgent = maskAgentRowsForRole([agent], "admin")[0];
check("admin agent: commission nulled", adminAgent.commission_percent === null);
check("admin agent: name visible", adminAgent.full_name === "Rahul Verma");
check("admin agent: phone visible", adminAgent.phone === "+919876543210");
check("admin agent: agent_code visible", adminAgent.agent_code === "FM_RAHUL01");
check("admin agent: is_active visible", adminAgent.is_active === true);
check("admin agent: referral COUNT visible", adminAgent.subscriptionCount === 17);
check(
  "admin agent wire: no commission value anywhere",
  !JSON.stringify(adminAgent).includes("12.5"),
);
check(
  "owner agent: commission intact",
  maskAgentRowsForRole([agent], "owner")[0].commission_percent === 12.5,
);
check(
  "agent masked field list = commission only",
  AGENT_MASKED_FIELDS.length === 1 && AGENT_MASKED_FIELDS[0] === "commission_percent",
);

// ─────────────────────────────────────────────────────────────
// 6. Overview financials math
// ─────────────────────────────────────────────────────────────
console.log("\n— Overview financials math —");

const mrr = computeMrr([
  { plan_price_paise: 25100, plan_billing_period: "monthly" },
  { plan_price_paise: 39900, plan_billing_period: "monthly" },
  { plan_price_paise: 410100, plan_billing_period: "yearly" },
]);
check("MRR: monthly plans at face value", mrr.mrrPaise === 25100 + 39900 + Math.round(410100 / 12));
check("MRR: yearly normalised ÷12", mrr.mrrPaise === 65000 + 34175);
check("MRR: monthly count", mrr.monthlyPlansActiveCount === 2);
check("MRR: yearly count", mrr.yearlyPlansActiveCount === 1);
check(
  "MRR: null price tolerated",
  computeMrr([{ plan_price_paise: null, plan_billing_period: null }]).monthlyPlansActiveCount === 1,
);
check("MRR: empty → zero", computeMrr([]).mrrPaise === 0);

const cap = sumCapturedPayments([
  { amount_paise: 100 },
  { amount_paise: 250 },
  { amount_paise: null },
]);
check(
  "captured sum (null-tolerant)",
  cap.capturedRevenuePaise === 350 && cap.capturedPaymentsCount === 3,
);

// ─────────────────────────────────────────────────────────────
// 7. Reports derivations + CSV
// ─────────────────────────────────────────────────────────────
console.log("\n— Reports derivations + CSV builders —");

// Month window: IST boundaries
const win = monthWindow("2026-08");
check("monthWindow: IST start offset", win.monthStart === "2026-08-01T00:00:00+05:30");
check(
  "monthWindow: IST end offset (31-day month)",
  win.monthEnd === "2026-08-31T23:59:59.999+05:30",
);
check("monthWindow: second Tuesday Aug 2026 = 11 Aug", win.tueDate === "2026-08-11");
check("monthWindow: last Saturday Aug 2026 = 29 Aug", win.satDate === "2026-08-29");
check(
  "monthWindow: Feb 2026 has 28 days",
  monthWindow("2026-02").monthEnd.startsWith("2026-02-28"),
);
check("isValidMonth: accepts 2026-08", isValidMonth("2026-08"));
check("isValidMonth: rejects 2026-13", !isValidMonth("2026-13"));
check("isValidMonth: rejects 2026-8", !isValidMonth("2026-8"));
check("isValidMonth: rejects garbage", !isValidMonth("'; DROP--"));
check("isValidMonth: rejects non-string", !isValidMonth(8));
check(
  "isReportKey: all four accepted",
  ["subscribers", "revenue", "seva", "pending"].every(isReportKey),
);
check("isReportKey: rejects others", !isReportKey("financials"));

const subs: ViewRow[] = [
  {
    subscription_id: "s1",
    status: "active",
    start_date: "2026-08-03",
    paused_at: null,
    cancelled_at: null,
    sub_created_at: "2026-08-03T09:00:00+05:30",
    plan_name: "Basic",
    plan_price_paise: 25100,
    plan_billing_period: "monthly",
    primary_member_name: "Asha",
  },
  {
    subscription_id: "s2",
    status: "active",
    start_date: "2026-07-15",
    paused_at: null,
    cancelled_at: null,
    sub_created_at: "2026-07-15T09:00:00+05:30",
    plan_name: "Premium Annual",
    plan_price_paise: 410100,
    plan_billing_period: "yearly",
    primary_member_name: "Bharat",
  },
  {
    subscription_id: "s3",
    status: "paused",
    start_date: "2026-06-10",
    paused_at: "2026-08-12T10:00:00+05:30",
    cancelled_at: null,
    sub_created_at: "2026-06-10T09:00:00+05:30",
    plan_name: "Premium",
    plan_price_paise: 39900,
    plan_billing_period: "monthly",
    primary_member_name: "Charu",
  },
  {
    subscription_id: "s4",
    status: "cancelled",
    start_date: "2026-05-01",
    paused_at: null,
    cancelled_at: "2026-08-20T10:00:00+05:30",
    sub_created_at: "2026-05-01T09:00:00+05:30",
    plan_name: "Basic",
    plan_price_paise: 25100,
    plan_billing_period: "monthly",
    primary_member_name: "Dev",
  },
];
const payments = [
  {
    subscription_id: "s1",
    amount_paise: 25100,
    status: "captured",
    created_at: "2026-08-03T09:05:00+05:30",
  },
  {
    subscription_id: "s2",
    amount_paise: 410100,
    status: "captured",
    created_at: "2026-08-05T09:05:00+05:30",
  },
  {
    subscription_id: "s3",
    amount_paise: 39900,
    status: "failed",
    created_at: "2026-08-10T09:05:00+05:30",
  },
  {
    subscription_id: "s3",
    amount_paise: 39900,
    status: "failed",
    created_at: "2026-08-11T09:05:00+05:30",
  },
  {
    subscription_id: "s4",
    amount_paise: 25100,
    status: "refunded",
    created_at: "2026-08-15T09:05:00+05:30",
  },
];

const subReport = computeSubscriberReport(subs, payments, 2, "2026-08");
check("subscriber report: active now", subReport.activeNow === 2);
check("subscriber report: new this month (IST)", subReport.newThisMonth === 1);
check("subscriber report: paused this month", subReport.pausedThisMonth === 1);
check("subscriber report: cancelled this month", subReport.cancelledThisMonth === 1);
check("subscriber report: reactivated passthrough", subReport.reactivatedThisMonth === 2);
check("subscriber report: failed payment count", subReport.failedPaymentCount === 2);
check("subscriber report: distinct failed subs", subReport.failedSubs === 1);

const revReport = computeRevenueReport(payments, subs, subReport);
check("revenue: gross", revReport.gross === 435200);
check("revenue: failed", revReport.failed === 79800);
check("revenue: refunded", revReport.refunded === 25100);
check("revenue: MRR (yearly ÷12)", revReport.mrr === 25100 + Math.round(410100 / 12));
check("revenue: churn base", revReport.churnBase === 2 + 1 - 1);
check("revenue: churn rate", Math.abs(revReport.churn - 0.5) < 1e-9);

const subCsv = buildSubscribersCsv("2026-08", subReport);
// csvCell only adds RFC-4180 quotes when a cell actually needs them.
check("subscribers CSV: header", subCsv.split("\n")[0] === "metric,value");
check("subscribers CSV: month label", subCsv.includes("month,August 2026"));
check("subscribers CSV: active value", subCsv.includes("active_now,2"));

const revCsv = buildRevenueCsv("2026-08", revReport);
check("revenue CSV: gross in INR", revCsv.includes("gross_revenue_inr,4352.00"));
check("revenue CSV: churn pct", revCsv.includes("churn_rate_pct,50.00"));

const sevaCsv = buildSevaCsv(
  "2026-08",
  computeSevaReport([
    {
      id: "p1",
      seva_id: "x",
      media_type: "video",
      is_delivered: true,
      delivered_at: null,
      month: 8,
      year: 2026,
      sevas: { name: "Gau Seva" },
      sankalp_batches: null,
    },
    {
      id: "p2",
      seva_id: "x",
      media_type: "video",
      is_delivered: false,
      delivered_at: null,
      month: 8,
      year: 2026,
      sevas: { name: "Gau Seva" },
      sankalp_batches: null,
    },
    {
      id: "p3",
      seva_id: null,
      media_type: "video",
      is_delivered: false,
      delivered_at: null,
      month: 8,
      year: 2026,
      sevas: null,
      sankalp_batches: null,
    },
  ]),
);
check("seva CSV: aggregates per seva", sevaCsv.includes("Gau Seva,August 2026,2,1,1"));
check("seva CSV: removed-seva fallback label", sevaCsv.includes("(seva removed)"));

const batches: BatchRow[] = [
  {
    id: "b_tue",
    batch_type: "second_tuesday",
    batch_date: "2026-08-11",
    status: "done",
  },
  {
    id: "b_sat",
    batch_type: "last_saturday",
    batch_date: "2026-08-29",
    status: "pending",
  },
];
const membership = new Map<string, Set<string>>([
  ["b_tue", new Set(["s1", "s2"])],
  ["b_sat", new Set(["s2"])],
]);
const pending = computePendingSevas(subs, batches, membership, "2026-08");
check("pending: only ACTIVE subs listed", pending.length === 2);
check(
  "pending: s1 in tuesday batch → Done",
  pending.find((r) => r.id === "s1")?.tue.label === "Done",
);
check(
  "pending: s1 joined BEFORE sat batch but not a member → not-in-list note",
  pending.find((r) => r.id === "s1")?.sat.label === "—" &&
    pending.find((r) => r.id === "s1")?.sat.note === "Not in this batch's list",
);
check(
  "pending: s2 in the single Saturday batch → Pending",
  pending.find((r) => r.id === "s2")?.sat.label === "Pending",
);
check("pending: sorted by join date", pending[0].id === "s2" && pending[1].id === "s1");

// Joined AFTER the batch date → genuine "normal wait" note
const lateJoiner: ViewRow = {
  subscription_id: "s9",
  status: "active",
  start_date: "2026-08-30",
  paused_at: null,
  cancelled_at: null,
  sub_created_at: "2026-08-30T09:00:00+05:30",
  plan_name: "Premium",
  plan_price_paise: 39900,
  plan_billing_period: "monthly",
  primary_member_name: "Esha",
};
const latePending = computePendingSevas([lateJoiner], batches, membership, "2026-08");
check(
  "pending: joined after sat batch → normal wait",
  latePending[0].sat.label === "—" &&
    latePending[0].sat.note === "Joined after batch — normal wait",
);
check(
  "pending: joined after tue batch → normal wait",
  latePending[0].tue.label === "—" &&
    latePending[0].tue.note === "Joined after batch — normal wait",
);
check(
  "pending: batches NOT generated → explicit note",
  computePendingSevas(subs, [], new Map(), "2026-08")[0].tue.note === "Batch not generated",
);

const pendCsv = buildPendingSevasCsv("2026-08", pending);
check(
  "pending CSV: dynamic batch-date headers",
  pendCsv.split("\n")[0].includes("tuesday_batch (2026-08-11)"),
);
check(
  "pending CSV: saturday header",
  pendCsv.split("\n")[0].includes("saturday_batch (2026-08-29)"),
);

check(
  "csvFilename: subscribers",
  csvFilename("subscribers", "2026-08") === "punyata_subscriber_status_report_2026-08.csv",
);
check(
  "csvFilename: revenue",
  csvFilename("revenue", "2026-08") === "punyata_revenue_report_2026-08.csv",
);
check(
  "csvFilename: seva",
  csvFilename("seva", "2026-08") === "punyata_seva_completion_report_2026-08.csv",
);
check(
  "csvFilename: pending",
  csvFilename("pending", "2026-08") === "punyata_pending_sevas_report_2026-08.csv",
);

// ─────────────────────────────────────────────────────────────
// 8. Static SQL checks on migrations 006 + 007
// ─────────────────────────────────────────────────────────────
console.log("\n— Migration static checks —");

const m006 = readFileSync(
  new URL("../supabase/migrations/20260801_006_owner_role_check.sql", import.meta.url),
  "utf8",
);
const m007 = readFileSync(
  new URL("../supabase/migrations/20260801_007_owner_rls_superset.sql", import.meta.url),
  "utf8",
);

check(
  "006: final role set includes owner",
  m006.includes("CHECK (role IN ('user', 'admin', 'owner', 'agent'))"),
);
check("006: names the constraint explicitly", m006.includes("ADD CONSTRAINT profiles_role_check"));
check(
  "006: discovers old constraint via pg_constraint (no assumed name)",
  m006.includes("pg_constraint") && m006.includes("conname"),
);
check("006: DROP is dynamic (format %I)", m006.includes("DROP CONSTRAINT %I"));
check("006: agent role preserved in set", m006.includes("'agent'"));
check("006: contains manual UPDATE example", m006.includes("UPDATE public.profiles"));
check(
  "006: every UPDATE statement is commented out (no auto-promote)",
  m006
    .split("\n")
    .filter((l) => l.includes("UPDATE public.profiles"))
    .every((l) => l.trimStart().startsWith("--")),
);
check("006: no DELETE/TRUNCATE", !/DELETE FROM public\.profiles|TRUNCATE/i.test(m006));

check("007: is_admin widened to admin+owner", m007.includes("role IN ('admin', 'owner')"));
check(
  "007: uses CREATE OR REPLACE (no policy drop)",
  m007.includes("CREATE OR REPLACE FUNCTION public.is_admin()"),
);
check("007: drops NO policies", !m007.toUpperCase().includes("DROP POLICY"));
check("007: creates NO policies", !m007.toUpperCase().includes("CREATE POLICY"));
check("007: preserves SECURITY DEFINER", m007.includes("SECURITY DEFINER"));
check("007: preserves search_path pin", m007.includes("SET search_path = public"));

// Live constraint must NOT be assumed in 006 (no hardcoded drop by name)
check(
  "006: does NOT hardcode-drop 'profiles_role_check' before discovery",
  !/ALTER TABLE public\.profiles\s+DROP CONSTRAINT profiles_role_check/i.test(m006),
);

// ─────────────────────────────────────────────────────────────
// 9. Static SQL checks on migration 010 (retire sankalp_variant)
// ─────────────────────────────────────────────────────────────
const m010 = readFileSync(
  new URL("../supabase/migrations/20260819_010_retire_sankalp_variant.sql", import.meta.url),
  "utf8",
);
const m010Live = m010
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

check("010: drops the sankalp_variant column",
  /DROP COLUMN IF EXISTS sankalp_variant/.test(m010Live));
check("010: adds UNIQUE (batch_type, batch_date) so duplicates cannot recur",
  /CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]*\(batch_type, batch_date\)/.test(m010Live));
check("010: guards on duplicate (type, date) rows instead of deleting them",
  m010Live.includes("RAISE EXCEPTION") && m010Live.includes("HAVING count(*) > 1"));
check("010: no destructive statement against any table",
  !/(DELETE FROM|TRUNCATE|UPDATE) /i.test(m010Live));
check("010: does NOT touch seva_schedule_rules or plan_sevas",
  !/(seva_schedule_rules|plan_sevas)/.test(m010Live));
check("010: leaves batch_type values alone",
  !/batch_type_check/.test(m010Live));
check("010: wrapped in a transaction",
  m010Live.includes("BEGIN;") && m010Live.includes("COMMIT;"));
check("010: down migration is documented and fully commented out",
  m010.includes("DOWN MIGRATION") &&
    !/ADD COLUMN IF NOT EXISTS sankalp_variant/.test(m010Live));

// ─────────────────────────────────────────────────────────────
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
