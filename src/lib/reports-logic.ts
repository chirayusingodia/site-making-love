// Shared report derivations + CSV builders for /admin/reports.
// Pure functions only — no Supabase client, no React. Used by:
//   - src/routes/admin.reports.tsx           (render)
//   - src/routes/api/admin/reports/export.ts (server-side CSV)
// Keeping one implementation means the CSV can never drift from
// what the owner sees on screen. Unit-tested in scratch/.

// NOTE: relative import with explicit .ts extension (not "@/…") so
// this module is also loadable by the plain-Node verification
// harness in scratch/ (no alias/extension resolution outside Vite).
import { daysInMonth, lastSaturdayOf, secondTuesdayOf, toISODate } from "./sankalp-logic.ts";

// ─── Types ───────────────────────────────────────────────────

export interface ViewRow {
  subscription_id: string;
  status: string;
  start_date: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  sub_created_at: string;
  plan_name: string | null;
  plan_price_paise: number | null;
  plan_billing_period: string | null;
  primary_member_name: string | null;
}

export interface MonthPayment {
  subscription_id: string;
  amount_paise: number;
  status: string;
  created_at: string;
}

export interface ProofRow {
  id: string;
  seva_id: string | null;
  media_type: string;
  is_delivered: boolean;
  delivered_at: string | null;
  month: number;
  year: number;
  sevas: { name: string } | null;
  sankalp_batches: { batch_type: string; batch_date: string } | null;
}

export interface BatchRow {
  id: string;
  batch_type: string;
  batch_date: string;
  sankalp_variant: string | null;
  status: "pending" | "done" | "missed";
}

export type BatchStatusLabel = "Done" | "Pending" | "Missed";

export interface BatchCell {
  label: BatchStatusLabel | "—";
  note: string;
  batchDate: string;
}

export interface SubscriberReport {
  activeNow: number;
  newThisMonth: number;
  pausedThisMonth: number;
  cancelledThisMonth: number;
  reactivatedThisMonth: number;
  failedPaymentCount: number;
  failedSubs: number;
}

export interface RevenueReport {
  gross: number;
  failed: number;
  refunded: number;
  mrr: number;
  churn: number;
  churnBase: number;
}

export interface SevaReportRow {
  name: string;
  uploaded: number;
  delivered: number;
  pending: number;
}

export interface PendingSevaRow {
  id: string;
  name: string;
  plan: string;
  joinedDate: string;
  joinedTime: string;
  tue: BatchCell;
  sat: BatchCell;
}

// ─── Formatters (pure) ───────────────────────────────────────

export function fmtINR(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d.length === 10 ? `${d}T00:00:00+05:30` : d);
  return isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      });
}

export function fmtTimeIST(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}

export function monthLabel(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ─── Month window (IST) ──────────────────────────────────────
// All ledger-month boundaries are IST wall-clock, matching how the
// business reports a "month". monthStart/monthEnd are ISO strings
// with explicit +05:30 offsets, safe for timestamptz comparisons.

export function monthWindow(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const lastDay = daysInMonth(y, m);
  return {
    y,
    m,
    first: toISODate(y, m, 1),
    last: toISODate(y, m, lastDay),
    monthStart: `${toISODate(y, m, 1)}T00:00:00+05:30`,
    monthEnd: `${toISODate(y, m, lastDay)}T23:59:59.999+05:30`,
    // List A seva day = SECOND Tuesday of the month.
    tueDate: secondTuesdayOf(y, m),
    satDate: lastSaturdayOf(y, m),
  };
}

export function isValidMonth(yyyyMm: unknown): yyyyMm is string {
  if (typeof yyyyMm !== "string" || !/^\d{4}-\d{2}$/.test(yyyyMm)) return false;
  const m = Number(yyyyMm.split("-")[1]);
  return m >= 1 && m <= 12;
}

// ─── Derivations ─────────────────────────────────────────────

export function computeSubscriberReport(
  subs: ViewRow[],
  monthPayments: MonthPayment[],
  resumedCount: number,
  month: string,
): SubscriberReport {
  const { first, last } = monthWindow(month);
  // Timestamptz comparisons MUST go through Date — lexicographic
  // string compare across differing UTC offsets is wrong.
  const startMs = new Date(`${first}T00:00:00+05:30`).getTime();
  const endMs = new Date(`${last}T23:59:59.999+05:30`).getTime();
  const inMonthTs = (ts: string | null) => {
    if (ts == null) return false;
    const t = new Date(ts).getTime();
    return !isNaN(t) && t >= startMs && t <= endMs;
  };

  const failedPayments = monthPayments.filter((p) => p.status === "failed");

  return {
    activeNow: subs.filter((s) => s.status === "active").length,
    newThisMonth: subs.filter(
      (s) => s.start_date != null && s.start_date >= first && s.start_date <= last,
    ).length,
    pausedThisMonth: subs.filter((s) => inMonthTs(s.paused_at)).length,
    cancelledThisMonth: subs.filter((s) => inMonthTs(s.cancelled_at)).length,
    reactivatedThisMonth: resumedCount,
    failedPaymentCount: failedPayments.length,
    failedSubs: new Set(failedPayments.map((p) => p.subscription_id)).size,
  };
}

export function computeRevenueReport(
  monthPayments: MonthPayment[],
  subs: ViewRow[],
  subscriberReport: SubscriberReport,
): RevenueReport {
  const gross = monthPayments
    .filter((p) => p.status === "captured")
    .reduce((s, p) => s + p.amount_paise, 0);
  const failed = monthPayments
    .filter((p) => p.status === "failed")
    .reduce((s, p) => s + p.amount_paise, 0);
  const refunded = monthPayments
    .filter((p) => p.status === "refunded")
    .reduce((s, p) => s + p.amount_paise, 0);
  // MRR: yearly plans normalised to monthly-equivalent (price / 12).
  const mrr = subs
    .filter((s) => s.status === "active")
    .reduce((s, sub) => {
      const price = sub.plan_price_paise ?? 0;
      return s + (sub.plan_billing_period === "yearly" ? price / 12 : price);
    }, 0);
  // Churn: cancelled this month ÷ active base at month start
  // (approximated as active now + cancelled this month − new this month).
  const churnBase = Math.max(
    0,
    subscriberReport.activeNow +
      subscriberReport.cancelledThisMonth -
      subscriberReport.newThisMonth,
  );
  const churn = churnBase > 0 ? subscriberReport.cancelledThisMonth / churnBase : 0;
  return { gross, failed, refunded, mrr, churn, churnBase };
}

export function computeSevaReport(proofs: ProofRow[]): SevaReportRow[] {
  const bySeva = new Map<string, { uploaded: number; delivered: number }>();
  for (const p of proofs) {
    const name = p.sevas?.name ?? "(seva removed)";
    if (!bySeva.has(name)) bySeva.set(name, { uploaded: 0, delivered: 0 });
    const g = bySeva.get(name)!;
    g.uploaded++;
    if (p.is_delivered) g.delivered++;
  }
  return [...bySeva.entries()]
    .map(([name, g]) => ({ name, ...g, pending: g.uploaded - g.delivered }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const BATCH_LABEL: Record<string, BatchStatusLabel> = {
  done: "Done",
  pending: "Pending",
  missed: "Missed",
};

export function computePendingSevas(
  subs: ViewRow[],
  batches: BatchRow[],
  membership: Map<string, Set<string>>,
  month: string,
): PendingSevaRow[] {
  const { tueDate, satDate } = monthWindow(month);
  const tueBatch = batches.find(
    (b) => b.batch_type === "second_tuesday" && b.batch_date === tueDate,
  );
  // Saturday: a subscriber belongs to BOTH variant batches (same member
  // set by construction) — full_package is their primary Saturday seva.
  const satFull = batches.find(
    (b) =>
      b.batch_type === "last_saturday" &&
      b.batch_date === satDate &&
      b.sankalp_variant === "full_package",
  );
  const satHawan = batches.find(
    (b) =>
      b.batch_type === "last_saturday" &&
      b.batch_date === satDate &&
      b.sankalp_variant === "hawan_only",
  );

  const cellFor = (
    sub: ViewRow,
    batch: BatchRow | undefined,
    batchDate: string,
    fallback?: BatchRow | undefined,
  ): BatchCell => {
    const joined = (sub.start_date ?? sub.sub_created_at).slice(0, 10);
    if (!batch) {
      return { label: "—", note: "Batch not generated", batchDate };
    }
    const inBatch = membership.get(batch.id)?.has(sub.subscription_id);
    const inFallback = fallback ? membership.get(fallback.id)?.has(sub.subscription_id) : false;
    const effective = inBatch ? batch : inFallback ? fallback : null;
    if (effective) {
      return {
        label: BATCH_LABEL[effective.status] ?? "Pending",
        note: `Batch ${fmtDate(effective.batch_date)}`,
        batchDate: effective.batch_date,
      };
    }
    // Not a member — the join date decides whether this is a genuine
    // concern or just the normal wait window.
    return {
      label: "—",
      note: joined > batchDate ? "Joined after batch — normal wait" : "Not in this batch's list",
      batchDate,
    };
  };

  return subs
    .filter((s) => s.status === "active")
    .map((s) => ({
      id: s.subscription_id,
      name: s.primary_member_name || "(no name)",
      plan: s.plan_name || "—",
      joinedDate: (s.start_date ?? s.sub_created_at).slice(0, 10),
      joinedTime: fmtTimeIST(s.sub_created_at),
      tue: cellFor(s, tueBatch, tueDate),
      sat: cellFor(s, satFull ?? satHawan, satDate, satFull ? satHawan : undefined),
    }))
    .sort((a, b) => a.joinedDate.localeCompare(b.joinedDate) || a.name.localeCompare(b.name));
}

// ─── CSV builders ────────────────────────────────────────────
// Identical wire format to the page's original exporters: every
// cell double-quoted, embedded quotes doubled, \n row separators.

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

export function buildSubscribersCsv(month: string, r: SubscriberReport): string {
  return toCsv(
    ["metric", "value"],
    [
      ["month", monthLabel(month)],
      ["active_now", r.activeNow],
      ["new_this_month", r.newThisMonth],
      ["paused_this_month", r.pausedThisMonth],
      ["cancelled_this_month", r.cancelledThisMonth],
      ["reactivated_this_month", r.reactivatedThisMonth],
      ["failed_payment_attempts_this_month", r.failedPaymentCount],
      ["subscriptions_with_failures_this_month", r.failedSubs],
    ],
  );
}

export function buildRevenueCsv(month: string, r: RevenueReport): string {
  return toCsv(
    ["metric", "value"],
    [
      ["month", monthLabel(month)],
      ["gross_revenue_inr", (r.gross / 100).toFixed(2)],
      ["failed_revenue_opportunity_loss_inr", (r.failed / 100).toFixed(2)],
      ["refunded_inr", (r.refunded / 100).toFixed(2)],
      ["mrr_inr_yearly_normalised", (r.mrr / 100).toFixed(2)],
      ["churn_rate_pct", (r.churn * 100).toFixed(2)],
      ["churn_base_active_at_month_start", r.churnBase],
    ],
  );
}

export function buildSevaCsv(month: string, rows: SevaReportRow[]): string {
  return toCsv(
    ["seva_name", "month", "proofs_uploaded", "delivered", "pending_delivery"],
    rows.map((r) => [r.name, monthLabel(month), r.uploaded, r.delivered, r.pending]),
  );
}

export function buildPendingSevasCsv(month: string, rows: PendingSevaRow[]): string {
  return toCsv(
    [
      "subscriber",
      "plan",
      "joined_date",
      "joined_time_ist",
      `tuesday_batch (${rows[0]?.tue.batchDate ?? "—"})`,
      "tuesday_status_note",
      `saturday_batch (${rows[0]?.sat.batchDate ?? "—"})`,
      "saturday_status_note",
    ],
    rows.map((r) => [
      r.name,
      r.plan,
      r.joinedDate,
      r.joinedTime,
      r.tue.label,
      r.tue.note,
      r.sat.label,
      r.sat.note,
    ]),
  );
}

// ─── API response shapes (shared with the client) ────────────
// Defined here (not in reports-data.server.ts) because the browser
// bundle cannot import from .server.ts modules, even for types.

export interface MonthlyReportData {
  subs: ViewRow[];
  monthPayments: MonthPayment[];
  resumedCount: number;
  proofs: ProofRow[];
}

export interface PendingSevasReportData {
  batches: BatchRow[];
  /** batch_id → subscription_ids (JSON-safe: arrays, not Sets) */
  membership: Record<string, string[]>;
}

export type ReportKey = "subscribers" | "revenue" | "seva" | "pending";

export function isReportKey(v: unknown): v is ReportKey {
  return v === "subscribers" || v === "revenue" || v === "seva" || v === "pending";
}

export function csvFilename(key: ReportKey, month: string): string {
  const name =
    key === "subscribers"
      ? "subscriber_status"
      : key === "seva"
        ? "seva_completion"
        : key === "pending"
          ? "pending_sevas"
          : "revenue";
  return `punyata_${name}_report_${month}.csv`;
}
