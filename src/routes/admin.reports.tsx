import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAllRows, supabase } from "@/lib/supabase";
import { daysInMonth, firstTuesdayOf, lastSaturdayOf, toISODate } from "@/lib/sankalp-logic";
import {
  AlertCircle,
  BadgeIndianRupee,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Flame,
  Loader2,
  RefreshCw,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/reports")({
  component: AdminReportsPage,
});

// ─── Types ───────────────────────────────────────────────────

interface ViewRow {
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

interface MonthPayment {
  subscription_id: string;
  amount_paise: number;
  status: string;
  created_at: string;
}

interface ProofRow {
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

interface BatchRow {
  id: string;
  batch_type: string;
  batch_date: string;
  sankalp_variant: string | null;
  status: "pending" | "done" | "missed";
}

type BatchStatusLabel = "Done" | "Pending" | "Missed";

interface BatchCell {
  label: BatchStatusLabel | "—";
  note: string;
  batchDate: string;
}

// ─── Helpers ─────────────────────────────────────────────────

function fmtINR(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function fmtDate(d: string | null) {
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

function fmtTimeIST(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}

function monthLabel(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const blob = new Blob(
    [[headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n")],
    { type: "text/csv" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const BATCH_LABEL: Record<string, BatchStatusLabel> = {
  done: "Done",
  pending: "Pending",
  missed: "Missed",
};

// ─── Print (PDF) plumbing ────────────────────────────────────
// PDF export = browser print → Save as PDF. No new dependency —
// the admin shell already hides chrome via print:hidden. Clicking
// a report's PDF button marks THAT report as the only printable
// section, then calls window.print().

type PrintKey = "subscribers" | "revenue" | "seva" | "pending" | null;

// ─── Report shell ────────────────────────────────────────────

function ReportShell({
  id,
  title,
  subtitle,
  icon: Icon,
  printKey,
  onCsv,
  onPrint,
  children,
}: {
  id: Exclude<PrintKey, null>;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  printKey: PrintKey;
  onCsv: () => void;
  onPrint: (k: Exclude<PrintKey, null>) => void;
  children: React.ReactNode;
}) {
  const hideOnPrint = printKey !== null && printKey !== id;
  return (
    <section
      data-report={id}
      className={`bg-white rounded-2xl border border-amber-900/10 shadow-2xs ${hideOnPrint ? "print:hidden" : ""}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3 border-b border-amber-100">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Icon className="w-4 h-4 text-amber-700" />
            {title}
          </h2>
          <p className="text-[11px] text-amber-900/60 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button
            onClick={onCsv}
            variant="outline"
            size="sm"
            className="border-amber-900/15 bg-amber-50/50 text-amber-900 gap-1.5 text-xs h-7"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button
            onClick={() => onPrint(id)}
            variant="outline"
            size="sm"
            className="border-amber-900/15 bg-amber-50/50 text-amber-900 gap-1.5 text-xs h-7"
          >
            <FileText className="w-3.5 h-3.5" /> PDF
          </Button>
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "rose" | "emerald" | "amber" | "sky";
}) {
  const toneCls =
    tone === "rose"
      ? "border-rose-200 text-rose-800"
      : tone === "emerald"
        ? "border-emerald-200 text-emerald-800"
        : tone === "sky"
          ? "border-sky-200 text-sky-800"
          : tone === "amber"
            ? "border-amber-200 text-amber-800"
            : "border-amber-900/10 text-slate-900";
  return (
    <div className={`bg-white rounded-xl border p-4 ${toneCls}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] opacity-70 mt-0.5">{sub}</div>}
    </div>
  );
}

function BatchStatusCell({ cell }: { cell: BatchCell }) {
  const cls =
    cell.label === "Done"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : cell.label === "Pending"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : cell.label === "Missed"
          ? "bg-rose-50 text-rose-800 border-rose-200"
          : "bg-slate-50 text-slate-400 border-slate-200";
  const CellIcon = cell.label === "Done" ? CheckCircle2 : cell.label === "Missed" ? XCircle : Clock;
  return (
    <div>
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}
      >
        <CellIcon className="w-3 h-3" />
        {cell.label}
      </span>
      <div className="text-[10px] text-slate-400 mt-1">{cell.note}</div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────

function AdminReportsPage() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setError] = useState<string | null>(null);
  const [printKey, setPrintKey] = useState<PrintKey>(null);
  const [pendingSearch, setPendingSearch] = useState("");

  // Raw data
  const [subs, setSubs] = useState<ViewRow[]>([]);
  const [monthPayments, setMonthPayments] = useState<MonthPayment[]>([]);
  const [resumedCount, setResumedCount] = useState(0);
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [membership, setMembership] = useState<Map<string, Set<string>>>(new Map());

  const load = useCallback(async (yyyyMm: string) => {
    setLoading(true);
    setError(null);
    try {
      const [y, m] = yyyyMm.split("-").map(Number);
      const lastDay = daysInMonth(y, m);
      const monthStart = `${toISODate(y, m, 1)}T00:00:00+05:30`;
      const monthEnd = `${toISODate(y, m, lastDay)}T23:59:59.999+05:30`;
      const tueDate = firstTuesdayOf(y, m);
      const satDate = lastSaturdayOf(y, m);

      const [subsRes, paysRes, resumedRes, proofsRes, batchesRes] = await Promise.all([
        fetchAllRows<ViewRow>((from, to) =>
          supabase
            .from("subscriber_list_view")
            .select(
              "subscription_id, status, start_date, paused_at, cancelled_at, sub_created_at, plan_name, plan_price_paise, plan_billing_period, primary_member_name",
            )
            .range(from, to),
        ),
        fetchAllRows<MonthPayment>((from, to) =>
          supabase
            .from("payments")
            .select("subscription_id, amount_paise, status, created_at")
            .gte("created_at", monthStart)
            .lte("created_at", monthEnd)
            .range(from, to),
        ),
        // Reactivations = webhook 'resumed' events (pause → active).
        supabase
          .from("audit_logs")
          .select("id", { count: "exact", head: true })
          .eq("action", "razorpay.subscription.resumed")
          .gte("created_at", monthStart)
          .lte("created_at", monthEnd),
        supabase
          .from("seva_proofs")
          .select(
            "id, seva_id, media_type, is_delivered, delivered_at, month, year, sevas(name), sankalp_batches(batch_type, batch_date)",
          )
          .eq("month", m)
          .eq("year", y),
        supabase
          .from("sankalp_batches")
          .select("id, batch_type, batch_date, sankalp_variant, status")
          .in("batch_date", [tueDate, satDate]),
      ]);

      if (subsRes.error) throw new Error(`subscriptions: ${subsRes.error}`);
      if (paysRes.error) throw new Error(`payments: ${paysRes.error}`);
      if (resumedRes.error) throw new Error(`audit_logs: ${resumedRes.error.message}`);
      if (proofsRes.error) throw new Error(`seva_proofs: ${proofsRes.error.message}`);
      if (batchesRes.error) throw new Error(`sankalp_batches: ${batchesRes.error.message}`);

      const batchRows = (batchesRes.data || []) as BatchRow[];
      setSubs(subsRes.data);
      setMonthPayments(paysRes.data);
      setResumedCount(resumedRes.count ?? 0);
      setProofs((proofsRes.data || []) as unknown as ProofRow[]);
      setBatches(batchRows);

      if (batchRows.length > 0) {
        const ids = batchRows.map((b) => b.id);
        const { data: members, error: memErr } = await supabase
          .from("sankalp_batch_subscriptions")
          .select("batch_id, subscription_id")
          .in("batch_id", ids);
        if (memErr) throw new Error(`batch membership: ${memErr.message}`);
        const map = new Map<string, Set<string>>();
        for (const row of members || []) {
          if (!map.has(row.batch_id)) map.set(row.batch_id, new Set());
          map.get(row.batch_id)!.add(row.subscription_id);
        }
        setMembership(map);
      } else {
        setMembership(new Map());
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(month);
  }, [month, load]);

  const doPrint = useCallback((key: Exclude<PrintKey, null>) => {
    setPrintKey(key);
    setTimeout(() => {
      window.print();
      setPrintKey(null);
    }, 80);
  }, []);

  // ── Derived: Subscriber Status Report ──
  const subscriberReport = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = toISODate(y, m, 1);
    const last = toISODate(y, m, daysInMonth(y, m));
    // Timestamptz comparisons MUST go through Date — lexicographic
    // string compare across differing UTC offsets is wrong.
    const startMs = new Date(`${first}T00:00:00+05:30`).getTime();
    const endMs = new Date(`${last}T23:59:59.999+05:30`).getTime();
    const inMonthTs = (ts: string | null) => {
      if (ts == null) return false;
      const t = new Date(ts).getTime();
      return !isNaN(t) && t >= startMs && t <= endMs;
    };

    const activeNow = subs.filter((s) => s.status === "active").length;
    const newThisMonth = subs.filter(
      (s) => s.start_date != null && s.start_date >= first && s.start_date <= last,
    ).length;
    const pausedThisMonth = subs.filter((s) => inMonthTs(s.paused_at)).length;
    const cancelledThisMonth = subs.filter((s) => inMonthTs(s.cancelled_at)).length;
    const failedPayments = monthPayments.filter((p) => p.status === "failed");
    const failedSubs = new Set(failedPayments.map((p) => p.subscription_id)).size;

    return {
      activeNow,
      newThisMonth,
      pausedThisMonth,
      cancelledThisMonth,
      reactivatedThisMonth: resumedCount,
      failedPaymentCount: failedPayments.length,
      failedSubs,
    };
  }, [subs, monthPayments, resumedCount, month]);

  // ── Derived: Revenue Report ──
  const revenueReport = useMemo(() => {
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
    const base = Math.max(
      0,
      subscriberReport.activeNow +
        subscriberReport.cancelledThisMonth -
        subscriberReport.newThisMonth,
    );
    const churn = base > 0 ? subscriberReport.cancelledThisMonth / base : 0;
    return { gross, failed, refunded, mrr, churn, churnBase: base };
  }, [monthPayments, subs, subscriberReport]);

  // ── Derived: Seva Completion Report ──
  const sevaReport = useMemo(() => {
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
  }, [proofs]);

  // ── Derived: Pending Sevas Report ──
  const pendingSevas = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const tueDate = firstTuesdayOf(y, m);
    const satDate = lastSaturdayOf(y, m);
    const tueBatch = batches.find(
      (b) => b.batch_type === "first_tuesday" && b.batch_date === tueDate,
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
  }, [subs, batches, membership, month]);

  const filteredPendingSevas = useMemo(() => {
    const q = pendingSearch.trim().toLowerCase();
    if (!q) return pendingSevas;
    return pendingSevas.filter(
      (r) => r.name.toLowerCase().includes(q) || r.plan.toLowerCase().includes(q),
    );
  }, [pendingSevas, pendingSearch]);

  // ── CSV exporters (from already-computed report data) ──
  const csvName = (key: string) => `punyata_${key}_report_${month}.csv`;

  const exportSubscribersCSV = () =>
    downloadCSV(
      csvName("subscriber_status"),
      ["metric", "value"],
      [
        ["month", monthLabel(month)],
        ["active_now", subscriberReport.activeNow],
        ["new_this_month", subscriberReport.newThisMonth],
        ["paused_this_month", subscriberReport.pausedThisMonth],
        ["cancelled_this_month", subscriberReport.cancelledThisMonth],
        ["reactivated_this_month", subscriberReport.reactivatedThisMonth],
        ["failed_payment_attempts_this_month", subscriberReport.failedPaymentCount],
        ["subscriptions_with_failures_this_month", subscriberReport.failedSubs],
      ],
    );

  const exportRevenueCSV = () =>
    downloadCSV(
      csvName("revenue"),
      ["metric", "value"],
      [
        ["month", monthLabel(month)],
        ["gross_revenue_inr", (revenueReport.gross / 100).toFixed(2)],
        ["failed_revenue_opportunity_loss_inr", (revenueReport.failed / 100).toFixed(2)],
        ["refunded_inr", (revenueReport.refunded / 100).toFixed(2)],
        ["mrr_inr_yearly_normalised", (revenueReport.mrr / 100).toFixed(2)],
        ["churn_rate_pct", (revenueReport.churn * 100).toFixed(2)],
        ["churn_base_active_at_month_start", revenueReport.churnBase],
      ],
    );

  const exportSevaCSV = () =>
    downloadCSV(
      csvName("seva_completion"),
      ["seva_name", "month", "proofs_uploaded", "delivered", "pending_delivery"],
      sevaReport.map((r) => [r.name, monthLabel(month), r.uploaded, r.delivered, r.pending]),
    );

  const exportPendingCSV = () =>
    downloadCSV(
      csvName("pending_sevas"),
      [
        "subscriber",
        "plan",
        "joined_date",
        "joined_time_ist",
        `tuesday_batch (${pendingSevas[0]?.tue.batchDate ?? "—"})`,
        "tuesday_status_note",
        `saturday_batch (${pendingSevas[0]?.sat.batchDate ?? "—"})`,
        "saturday_status_note",
      ],
      filteredPendingSevas.map((r) => [
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

  const [y, m] = month.split("-").map(Number);
  const tueDate = firstTuesdayOf(y, m);
  const satDate = lastSaturdayOf(y, m);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-5 rounded-2xl border border-amber-900/10 shadow-2xs print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-amber-700" />
            Reports
          </h1>
          <p className="text-xs text-amber-900/60 mt-0.5">
            Subscriber, revenue, seva completion and pending-seva reporting. PDF export uses the
            browser's print → Save as PDF.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4 text-amber-700" />
            <input
              id="reports-month"
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="text-xs border border-amber-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white text-slate-700"
            />
          </div>
          <Button
            onClick={() => load(month)}
            disabled={loading}
            variant="outline"
            size="sm"
            className="border-amber-900/15 bg-amber-50/50 text-amber-900 gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs flex items-center gap-2 print:hidden">
          <AlertCircle className="w-4 h-4 flex-none" />
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full bg-amber-50 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* ── 1. Subscriber Status Report ── */}
          <ReportShell
            id="subscribers"
            title="Subscriber Status Report"
            subtitle={`${monthLabel(month)} · New = activated this month (start_date) · Reactivated = pause → active (webhook resumed events)`}
            icon={Users}
            printKey={printKey}
            onCsv={exportSubscribersCSV}
            onPrint={doPrint}
          >
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <StatCard
                label="Active now"
                value={String(subscriberReport.activeNow)}
                tone="emerald"
              />
              <StatCard
                label="New this month"
                value={String(subscriberReport.newThisMonth)}
                tone="sky"
              />
              <StatCard
                label="Paused this month"
                value={String(subscriberReport.pausedThisMonth)}
                tone="amber"
              />
              <StatCard
                label="Cancelled this month"
                value={String(subscriberReport.cancelledThisMonth)}
                tone="rose"
              />
              <StatCard
                label="Reactivated this month"
                value={String(subscriberReport.reactivatedThisMonth)}
                tone="emerald"
              />
              <StatCard
                label="Failed payments"
                value={String(subscriberReport.failedPaymentCount)}
                sub={`${subscriberReport.failedSubs} subscription(s) affected`}
                tone="rose"
              />
            </div>
          </ReportShell>

          {/* ── 2. Revenue Report ── */}
          <ReportShell
            id="revenue"
            title="Revenue Report"
            subtitle={`${monthLabel(month)} · MRR = active plans, yearly normalised to monthly-equivalent (price ÷ 12) · Churn = cancelled ÷ active base at month start`}
            icon={BadgeIndianRupee}
            printKey={printKey}
            onCsv={exportRevenueCSV}
            onPrint={doPrint}
          >
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              <StatCard
                label="Gross revenue (captured)"
                value={fmtINR(revenueReport.gross)}
                tone="emerald"
              />
              <StatCard
                label="Failed revenue — opportunity loss"
                value={fmtINR(revenueReport.failed)}
                sub="failed charge attempts this month"
                tone="rose"
              />
              <StatCard label="Refunded" value={fmtINR(revenueReport.refunded)} tone="sky" />
              <StatCard
                label="MRR"
                value={fmtINR(Math.round(revenueReport.mrr))}
                sub="yearly plans ÷ 12"
                tone="amber"
              />
              <StatCard
                label="Churn rate"
                value={`${(revenueReport.churn * 100).toFixed(1)}%`}
                sub={`base: ${revenueReport.churnBase} active at month start`}
                tone="rose"
              />
            </div>
          </ReportShell>

          {/* ── 3. Seva Completion Report ── */}
          <ReportShell
            id="seva"
            title="Seva Completion Report"
            subtitle={`${monthLabel(month)} · seva_proofs joined to sankalp_batches · Note: seva_proofs is deprecated for new uploads (rev 005) — new proof videos live in name_segments`}
            icon={Flame}
            printKey={printKey}
            onCsv={exportSevaCSV}
            onPrint={doPrint}
          >
            {sevaReport.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">
                No seva proofs recorded for {monthLabel(month)}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-amber-100 bg-amber-50/60">
                      <th className="text-left py-2.5 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                        Seva
                      </th>
                      <th className="text-right py-2.5 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                        Proofs uploaded
                      </th>
                      <th className="text-right py-2.5 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                        Delivered
                      </th>
                      <th className="text-right py-2.5 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                        Pending delivery
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sevaReport.map((r) => (
                      <tr key={r.name} className="border-b border-amber-50">
                        <td className="py-2.5 px-4 font-medium text-slate-800">{r.name}</td>
                        <td className="py-2.5 px-4 text-right font-semibold text-slate-900">
                          {r.uploaded}
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-emerald-700">
                          {r.delivered}
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-semibold ${r.pending > 0 ? "text-amber-700" : "text-slate-400"}`}
                        >
                          {r.pending}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-amber-50/40 font-bold">
                      <td className="py-2.5 px-4 text-slate-900">Total</td>
                      <td className="py-2.5 px-4 text-right text-slate-900">
                        {sevaReport.reduce((s, r) => s + r.uploaded, 0)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-emerald-700">
                        {sevaReport.reduce((s, r) => s + r.delivered, 0)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-amber-700">
                        {sevaReport.reduce((s, r) => s + r.pending, 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </ReportShell>

          {/* ── 4. Pending Sevas Report ── */}
          <ReportShell
            id="pending"
            title="Pending Sevas Report"
            subtitle={`${monthLabel(month)} · Tuesday batch ${fmtDate(tueDate)} and Saturday batch ${fmtDate(satDate)} are SEPARATE columns — statuses are never merged · Join date/time shown so a genuine miss is distinguishable from a subscriber still in the normal wait window`}
            icon={Clock}
            printKey={printKey}
            onCsv={exportPendingCSV}
            onPrint={doPrint}
          >
            <div className="mb-3 print:hidden">
              <input
                id="pending-sevas-search"
                type="text"
                placeholder="Filter by subscriber or plan…"
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
                className="w-full max-w-xs px-3 py-2 text-xs border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white placeholder-slate-400"
              />
            </div>
            {filteredPendingSevas.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">
                No active subscriptions to report on.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-amber-100 bg-amber-50/60">
                      <th className="text-left py-2.5 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                        Subscriber
                      </th>
                      <th className="text-left py-2.5 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                        Plan
                      </th>
                      <th className="text-left py-2.5 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                        Joined (date · time IST)
                      </th>
                      <th className="text-left py-2.5 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                        Tuesday batch — {fmtDate(tueDate)}
                      </th>
                      <th className="text-left py-2.5 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                        Saturday batch — {fmtDate(satDate)}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPendingSevas.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-amber-50 hover:bg-amber-50/30 align-top"
                      >
                        <td className="py-2.5 px-4 font-semibold text-slate-900">{r.name}</td>
                        <td className="py-2.5 px-4 text-xs text-slate-600">{r.plan}</td>
                        <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                          {fmtDate(r.joinedDate)}{" "}
                          <span className="text-slate-400">· {r.joinedTime}</span>
                        </td>
                        <td className="py-2.5 px-4">
                          <BatchStatusCell cell={r.tue} />
                        </td>
                        <td className="py-2.5 px-4">
                          <BatchStatusCell cell={r.sat} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReportShell>
        </>
      )}
    </div>
  );
}
