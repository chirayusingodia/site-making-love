import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
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
import { AlertCircle, CalendarDays, Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  Notice,
  PageHeader,
  SegmentedTabs,
  StatCard,
  StatusPill,
  TableScroll,
  type Tone,
} from "@/components/admin/admin-ui";
import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";

type ReportsTab = "trends" | "monthly";

// OWNER-ONLY route (financial data — Session 6.5 two-tier roles):
//   1. beforeLoad redirects any non-owner (incl. admin) to Overview.
//   2. All data comes from /api/admin/reports/* handlers that reject
//      non-owners with 403 — no direct Supabase queries from this
//      page, so there is nothing financial to inspect in devtools.
export const Route = createFileRoute("/admin/reports")({
  // Analytics (trend charts) and the monthly exportable reports used to be
  // two separate nav items; they are now two tabs of this one page.
  validateSearch: (search: Record<string, unknown>): { tab?: ReportsTab } => ({
    tab: search.tab === "monthly" ? "monthly" : search.tab === "trends" ? "trends" : undefined,
  }),
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
  printKey,
  exporting,
  onCsv,
  onPrint,
  children,
}: {
  id: Exclude<PrintKey, null>;
  title: string;
  subtitle: string;
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
      className={`admin-card overflow-hidden ${hideOnPrint ? "print:hidden" : ""}`}
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between px-4 sm:px-5 pt-4 pb-3 border-b border-stone-100">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-stone-900">{title}</h2>
          <p className="mt-0.5 text-xs text-stone-500 leading-relaxed">{subtitle}</p>
        </div>
        <div className="flex gap-2 shrink-0 print:hidden">
          <Button
            onClick={onCsv}
            disabled={exporting}
            variant="outline"
            size="sm"
            className="h-9 sm:h-8 gap-1.5"
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
            className="h-9 sm:h-8 gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" /> PDF
          </Button>
        </div>
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** Report KPI tile — the shared StatCard with a value size that fits half a phone width. */
function ReportStat({
  label,
  value,
  sub,
  status,
}: {
  label: string;
  value: string;
  sub?: string;
  status?: { tone: Tone; text: string };
}) {
  return (
    <StatCard
      label={label}
      value={<span className="text-xl sm:text-2xl break-words">{value}</span>}
      hint={sub}
      status={status}
      className="p-3.5 sm:p-4"
    />
  );
}

const BATCH_TONE: Record<string, Tone> = {
  Done: "good",
  Pending: "warn",
  Missed: "bad",
};

function BatchStatusCell({ cell }: { cell: import("@/lib/reports-logic").BatchCell }) {
  return (
    <div>
      <StatusPill tone={BATCH_TONE[cell.label] ?? "neutral"}>{cell.label}</StatusPill>
      <div className="text-xs text-stone-400 mt-1">{cell.note}</div>
    </div>
  );
}

const thCls = "py-2.5 px-4 text-xs font-medium text-stone-500";

// ─── Main Page ───────────────────────────────────────────────

function AdminReportsPage() {
  const { tab = "trends" } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/reports" });
  return (
    <div className="space-y-6">
      <div className="space-y-4 print:hidden">
        <PageHeader
          title="Reports & Analytics"
          description="Owner only. Trends compares revenue, expenses, profit and subscribers month on month; Monthly reports are the exportable CSV / PDF statements."
        />
        <SegmentedTabs
          value={tab}
          onChange={(t) => navigate({ search: { tab: t }, replace: true })}
          items={[
            { value: "trends", label: "Trends" },
            { value: "monthly", label: "Monthly reports" },
          ]}
        />
      </div>
      {tab === "trends" ? <AnalyticsDashboard /> : <MonthlyReports />}
    </div>
  );
}

function MonthlyReports() {
  // [Pass-2 F12] default month on an IST calendar — the viewer-local
  // Date preselected the previous month for owners abroad on the 1st.
  const istToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).format(new Date()); // YYYY-MM
  const [month, setMonth] = useState(istToday);
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
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
        <p className="text-sm text-stone-500">
          Subscriber, revenue, seva completion and pending-seva statements. PDF export uses the
          browser's print → Save as PDF.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex-1 sm:flex-none">
            <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              id="reports-month"
              type="month"
              aria-label="Report month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="h-9 w-full sm:w-44 rounded-md border border-stone-300 bg-white pl-8 pr-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-orange-600/30"
            />
          </div>
          <Button
            onClick={() => load(month)}
            disabled={loading}
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {errorMsg && (
        <Notice tone="bad" icon={AlertCircle} className="print:hidden">
          {errorMsg}
        </Notice>
      )}

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full bg-stone-100 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* ── 1. Subscriber Status Report ── */}
          <ReportShell
            id="subscribers"
            title="Subscriber Status Report"
            subtitle={`${monthLabel(month)} · New = activated this month (start_date) · Reactivated = pause → active (webhook resumed events)`}
            printKey={printKey}
            exporting={exporting === "subscribers"}
            onCsv={() => exportCsv("subscribers")}
            onPrint={doPrint}
          >
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <ReportStat label="Active now" value={String(subscriberReport.activeNow)} />
              <ReportStat label="New this month" value={String(subscriberReport.newThisMonth)} />
              <ReportStat
                label="Paused this month"
                value={String(subscriberReport.pausedThisMonth)}
              />
              <ReportStat
                label="Cancelled this month"
                value={String(subscriberReport.cancelledThisMonth)}
              />
              <ReportStat
                label="Reactivated this month"
                value={String(subscriberReport.reactivatedThisMonth)}
              />
              <ReportStat
                label="Failed payments"
                value={String(subscriberReport.failedPaymentCount)}
                sub={`${subscriberReport.failedSubs} subscription(s) affected`}
                status={
                  subscriberReport.failedPaymentCount > 0
                    ? { tone: "bad", text: "Follow up" }
                    : undefined
                }
              />
            </div>
          </ReportShell>

          {/* ── 2. Revenue Report ── */}
          <ReportShell
            id="revenue"
            title="Revenue Report"
            subtitle={`${monthLabel(month)} · MRR = active plans, yearly normalised to monthly-equivalent (price ÷ 12) · Churn = cancelled ÷ active base at month start`}
            printKey={printKey}
            exporting={exporting === "revenue"}
            onCsv={() => exportCsv("revenue")}
            onPrint={doPrint}
          >
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              <ReportStat
                label="Gross revenue (captured, incl. QR)"
                value={fmtINR(revenueReport.gross)}
              />
              <ReportStat
                label="Failed revenue — opportunity loss"
                value={fmtINR(revenueReport.failed)}
                sub="failed charge attempts this month"
              />
              <ReportStat label="Refunded" value={fmtINR(revenueReport.refunded)} />
              <ReportStat
                label="MRR"
                value={fmtINR(Math.round(revenueReport.mrr))}
                sub="yearly plans ÷ 12"
              />
              <ReportStat
                label="Churn rate"
                value={`${(revenueReport.churn * 100).toFixed(1)}%`}
                sub={`base: ${revenueReport.churnBase} active at month start`}
              />
            </div>
          </ReportShell>

          {/* ── 3. Seva Completion Report ── */}
          <ReportShell
            id="seva"
            title="Seva Completion Report"
            subtitle={`${monthLabel(month)} · seva_proofs joined to sankalp_batches · Note: seva_proofs is deprecated for new uploads (rev 005) — new proof videos live in name_segments`}
            printKey={printKey}
            exporting={exporting === "seva"}
            onCsv={() => exportCsv("seva")}
            onPrint={doPrint}
          >
            {sevaReport.length === 0 ? (
              <EmptyState
                title={`No seva proofs recorded for ${monthLabel(month)}.`}
                className="py-8"
              />
            ) : (
              <div className="-mx-4 sm:-mx-5 -mb-4 sm:-mb-5 border-t border-stone-100">
                <TableScroll>
                  <table className="admin-table-fixed w-full min-w-[480px] text-sm tabular-nums">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50">
                        <th className={`${thCls} text-left`}>Seva</th>
                        <th className={`${thCls} text-right`}>Proofs uploaded</th>
                        <th className={`${thCls} text-right`}>Delivered</th>
                        <th className={`${thCls} text-right`}>Pending delivery</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {sevaReport.map((r) => (
                        <tr key={r.name}>
                          <td className="py-2.5 px-4 font-medium text-stone-900">{r.name}</td>
                          <td className="py-2.5 px-4 text-right font-medium text-stone-900">
                            {r.uploaded}
                          </td>
                          <td className="py-2.5 px-4 text-right font-medium text-emerald-700">
                            {r.delivered}
                          </td>
                          <td
                            className={`py-2.5 px-4 text-right font-medium ${r.pending > 0 ? "text-amber-700" : "text-stone-400"}`}
                          >
                            {r.pending}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-stone-50 font-semibold">
                        <td className="py-2.5 px-4 text-stone-900">Total</td>
                        <td className="py-2.5 px-4 text-right text-stone-900">
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
                </TableScroll>
              </div>
            )}
          </ReportShell>

          {/* ── 4. Pending Sevas Report ── */}
          <ReportShell
            id="pending"
            title="Pending Sevas Report"
            subtitle={`${monthLabel(month)} · 2nd Tuesday batch ${fmtDate(tueDate)} and Last Saturday batch ${fmtDate(satDate)} are SEPARATE columns — statuses are never merged · Join date/time shown so a genuine miss is distinguishable from a subscriber still in the normal wait window`}
            printKey={printKey}
            exporting={exporting === "pending"}
            onCsv={() => exportCsv("pending")}
            onPrint={doPrint}
          >
            <div className="mb-4 print:hidden">
              <Input
                id="pending-sevas-search"
                type="text"
                placeholder="Filter by subscriber or plan…"
                aria-label="Filter by subscriber or plan"
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
                className="h-9 w-full sm:max-w-xs text-sm"
              />
            </div>
            {filteredPendingSevas.length === 0 ? (
              <EmptyState title="No active subscriptions to report on." className="py-8" />
            ) : (
              <div className="-mx-4 sm:-mx-5 -mb-4 sm:-mb-5 border-t border-stone-100">
                {/* Phone: stacked cards (never printed — print always uses the table) */}
                <ul className="md:hidden print:hidden divide-y divide-stone-100">
                  {filteredPendingSevas.map((r) => (
                    <li key={r.id} className="px-4 py-3 space-y-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-stone-900 break-words">
                          {r.name}
                        </div>
                        <div className="text-xs text-stone-500">
                          {r.plan} · joined {fmtDate(r.joinedDate)}{" "}
                          <span className="text-stone-400">· {r.joinedTime}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-stone-500 mb-1">
                            2nd Tue · {fmtDate(tueDate)}
                          </div>
                          <BatchStatusCell cell={r.tue} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-stone-500 mb-1">
                            Sat · {fmtDate(satDate)}
                          </div>
                          <BatchStatusCell cell={r.sat} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Tablet / desktop / print: table */}
                <div className="hidden md:block print:block">
                  <TableScroll>
                    <table className="admin-table-fixed w-full min-w-[760px] text-sm">
                      <thead>
                        <tr className="border-b border-stone-200 bg-stone-50">
                          <th className={`${thCls} text-left`}>Subscriber</th>
                          <th className={`${thCls} text-left`}>Plan</th>
                          <th className={`${thCls} text-left`}>Joined (date · time IST)</th>
                          <th className={`${thCls} text-left`}>
                            2nd Tuesday batch — {fmtDate(tueDate)}
                          </th>
                          <th className={`${thCls} text-left`}>
                            Saturday batch — {fmtDate(satDate)}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {filteredPendingSevas.map((r) => (
                          <tr key={r.id} className="hover:bg-stone-50/60 align-top">
                            <td className="py-3 px-4 font-medium text-stone-900">{r.name}</td>
                            <td className="py-3 px-4 text-[13px] text-stone-600">{r.plan}</td>
                            <td className="py-3 px-4 text-[13px] text-stone-600 whitespace-nowrap">
                              {fmtDate(r.joinedDate)}{" "}
                              <span className="text-stone-400">· {r.joinedTime}</span>
                            </td>
                            <td className="py-3 px-4">
                              <BatchStatusCell cell={r.tue} />
                            </td>
                            <td className="py-3 px-4">
                              <BatchStatusCell cell={r.sat} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                </div>
              </div>
            )}
          </ReportShell>
        </>
      )}
    </div>
  );
}
