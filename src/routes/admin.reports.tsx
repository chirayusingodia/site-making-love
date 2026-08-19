import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { callAdminApi, fetchMyRole } from "@/lib/admin-api";
import {
  computePendingSevas,
  computeRevenueReport,
  computeSevaReport,
  computeSubscriberReport,
  fmtDate,
  fmtINR,
  monthLabel,
  monthWindow,
  type BatchRow,
  type MonthPayment,
  type MonthlyReportData,
  type PendingSevasReportData,
  type ProofRow,
  type ReportKey,
  type ViewRow,
} from "@/lib/reports-logic";
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

// OWNER-ONLY route (financial data — Session 6.5 two-tier roles):
//   1. beforeLoad redirects any non-owner (incl. admin) to Overview.
//   2. All data comes from /api/admin/reports/* handlers that reject
//      non-owners with 403 — no direct Supabase queries from this
//      page, so there is nothing financial to inspect in devtools.
export const Route = createFileRoute("/admin/reports")({
  beforeLoad: async () => {
    const role = await fetchMyRole();
    if (role !== "owner") {
      throw redirect({
        to: "/admin/overview",
        search: { notice: "owner-required" },
      });
    }
  },
  component: AdminReportsPage,
});

// ─── Helpers ─────────────────────────────────────────────────

function downloadCsvText(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
  exporting,
  onCsv,
  onPrint,
  children,
}: {
  id: Exclude<PrintKey, null>;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  printKey: PrintKey;
  exporting: boolean;
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
            disabled={exporting}
            variant="outline"
            size="sm"
            className="border-amber-900/15 bg-amber-50/50 text-amber-900 gap-1.5 text-xs h-7"
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}{" "}
            CSV
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

function BatchStatusCell({ cell }: { cell: import("@/lib/reports-logic").BatchCell }) {
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
  const [exporting, setExporting] = useState<ReportKey | null>(null);

  // Raw data (from the owner-gated /api/admin/reports/* handlers)
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
      const [monthly, pending] = await Promise.all([
        callAdminApi<MonthlyReportData>("/api/admin/reports/monthly", { month: yyyyMm }),
        callAdminApi<PendingSevasReportData>("/api/admin/reports/pending-sevas", {
          month: yyyyMm,
        }),
      ]);

      setSubs(monthly.subs);
      setMonthPayments(monthly.monthPayments);
      setResumedCount(monthly.resumedCount);
      setProofs(monthly.proofs);
      setBatches(pending.batches);
      setMembership(new Map(Object.entries(pending.membership).map(([k, v]) => [k, new Set(v)])));
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

  // ── Derived reports (shared logic: same functions the
  //    /api/admin/reports/export handler builds CSVs from) ──
  const subscriberReport = useMemo(
    () => computeSubscriberReport(subs, monthPayments, resumedCount, month),
    [subs, monthPayments, resumedCount, month],
  );
  const revenueReport = useMemo(
    () => computeRevenueReport(monthPayments, subs, subscriberReport),
    [monthPayments, subs, subscriberReport],
  );
  const sevaReport = useMemo(() => computeSevaReport(proofs), [proofs]);
  const pendingSevas = useMemo(
    () => computePendingSevas(subs, batches, membership, month),
    [subs, batches, membership, month],
  );

  const filteredPendingSevas = useMemo(() => {
    const q = pendingSearch.trim().toLowerCase();
    if (!q) return pendingSevas;
    return pendingSevas.filter(
      (r) => r.name.toLowerCase().includes(q) || r.plan.toLowerCase().includes(q),
    );
  }, [pendingSevas, pendingSearch]);

  // ── CSV export: generated SERVER-SIDE by the owner-gated
  //    /api/admin/reports/export handler ──
  const exportCsv = useCallback(
    async (report: ReportKey) => {
      setExporting(report);
      try {
        const { filename, csv } = await callAdminApi<{ filename: string; csv: string }>(
          "/api/admin/reports/export",
          { month, report },
        );
        downloadCsvText(filename, csv);
      } catch (err) {
        alert(err instanceof Error ? `Export failed: ${err.message}` : "Export failed");
      } finally {
        setExporting(null);
      }
    },
    [month],
  );

  const { tueDate, satDate } = monthWindow(month);

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
            Owner-only · Subscriber, revenue, seva completion and pending-seva reporting. PDF export
            uses the browser's print → Save as PDF.
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
            exporting={exporting === "subscribers"}
            onCsv={() => exportCsv("subscribers")}
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
            exporting={exporting === "revenue"}
            onCsv={() => exportCsv("revenue")}
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
            exporting={exporting === "seva"}
            onCsv={() => exportCsv("seva")}
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
            subtitle={`${monthLabel(month)} · 2nd Tuesday batch ${fmtDate(tueDate)} and Last Saturday batch ${fmtDate(satDate)} are SEPARATE columns — statuses are never merged · Join date/time shown so a genuine miss is distinguishable from a subscriber still in the normal wait window`}
            icon={Clock}
            printKey={printKey}
            exporting={exporting === "pending"}
            onCsv={() => exportCsv("pending")}
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
                        2nd Tuesday batch — {fmtDate(tueDate)}
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
