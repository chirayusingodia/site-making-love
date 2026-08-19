import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callAdminApi } from "@/lib/admin-api";
import {
  buildPaymentsCsv,
  type PaymentListRow,
  type PaymentsListResponse,
} from "@/lib/payments-logic";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  Filter,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/payments")({
  component: AdminPaymentsPage,
});

// ─── Constants ───────────────────────────────────────────────

const PAGE_SIZE = 50;

// ─── Types ───────────────────────────────────────────────────

interface FilterState {
  status: string;
  planId: string;
  dateFrom: string;
  dateTo: string;
  search: string; // razorpay_payment_id
}

const DEFAULT_FILTERS: FilterState = {
  status: "all",
  planId: "all",
  dateFrom: "",
  dateTo: "",
  search: "",
};

// ─── Helpers ─────────────────────────────────────────────────

function fmtINR(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Kolkata",
      });
}

function PayStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    captured: {
      label: "Captured",
      cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
      icon: CheckCircle2,
    },
    failed: { label: "Failed", cls: "bg-rose-50 text-rose-800 border-rose-200", icon: XCircle },
    refunded: { label: "Refunded", cls: "bg-sky-50 text-sky-800 border-sky-200", icon: RotateCcw },
    pending: { label: "Pending", cls: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  };
  const m = map[status] ?? {
    label: status,
    cls: "bg-slate-100 text-slate-700 border-slate-200",
    icon: AlertCircle,
  };
  const Icon = m.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${m.cls}`}
    >
      <Icon className="w-3 h-3" />
      {m.label}
    </span>
  );
}

// 🔒 placeholder for owner-only fields (amount / Razorpay IDs) —
// signals "restricted", not "missing". The real values were never
// sent to this browser (server-side strip in /api/admin/payments/list).
function MaskedCell() {
  return (
    <span
      className="inline-flex items-center gap-1 text-amber-900/40"
      title="Owner only — financial field restricted"
    >
      <Lock className="w-3.5 h-3.5" />
    </span>
  );
}

function downloadCsvText(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Page ───────────────────────────────────────────────

function AdminPaymentsPage() {
  const [rows, setRows] = useState<PaymentListRow[]>([]);
  const [totalCount, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setError] = useState<string | null>(null);
  // Role shape comes from the endpoint response — never trusted
  // from client-side state alone for the data itself.
  const [viewerRole, setViewerRole] = useState<"admin" | "owner">("admin");

  const [planOptions, setPlanOptions] = useState<{ id: string; name: string }[]>([]);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());

  // Aggregates across the ENTIRE filtered set: counts for both
  // roles; ₹ sums only when the endpoint returned them (owner).
  const [agg, setAgg] = useState<PaymentsListResponse["aggregates"] | null>(null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [pendingFilters, setPending] = useState<FilterState>(DEFAULT_FILTERS);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    supabase
      .from("plans")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setPlanOptions(data || []));
  }, []);

  // Primary member names for the page's subscriptions — operational
  // support-lookup data, readable by staff via RLS (unchanged).
  const fetchNames = useCallback(async (subIds: string[]) => {
    if (subIds.length === 0) return;
    const { data: names } = await supabase
      .from("subscriber_list_view")
      .select("subscription_id, primary_member_name")
      .in("subscription_id", subIds);
    setNameMap((prev) => {
      const next = new Map(prev);
      for (const n of names || []) next.set(n.subscription_id, n.primary_member_name || "");
      return next;
    });
  }, []);

  const fetchPage = useCallback(
    async (pageIndex: number, f: FilterState) => {
      setLoading(true);
      setError(null);
      try {
        const res = await callAdminApi<PaymentsListResponse>("/api/admin/payments/list", {
          page: pageIndex,
          pageSize: PAGE_SIZE,
          filters: f,
        });
        setRows(res.rows);
        setTotal(res.totalCount);
        setAgg(res.aggregates);
        setViewerRole(res.viewerRole);
        fetchNames([...new Set(res.rows.map((r) => r.subscription_id))]);
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error
            ? `Could not load payments: ${err.message}`
            : "Could not load payments.",
        );
        setRows([]);
        setTotal(0);
        setAgg(null);
      } finally {
        setLoading(false);
      }
    },
    [fetchNames],
  );

  useEffect(() => {
    fetchPage(page, filters);
  }, [page, filters, fetchPage]);

  // CSV export — full filtered set via the same role-shaped
  // endpoint; the CSV builder drops amount/ID columns for admin.
  const exportCSV = async () => {
    setExporting(true);
    try {
      const res = await callAdminApi<PaymentsListResponse>("/api/admin/payments/list", {
        all: true,
        filters,
      });
      if (res.rows.length === 0) {
        alert("No matching payments to export.");
        return;
      }
      const csv = buildPaymentsCsv(res.rows, res.viewerRole, nameMap);
      downloadCsvText(`punyata_payments_${new Date().toISOString().split("T")[0]}.csv`, csv);
    } catch (err) {
      alert(err instanceof Error ? `Export failed: ${err.message}` : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const applyPendingFilters = () => {
    setPage(0);
    setFilters(pendingFilters);
  };
  const clearFilters = () => {
    setPending(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setPage(0);
  };
  const hasActiveFilters =
    filters.status !== "all" ||
    filters.planId !== "all" ||
    !!filters.dateFrom ||
    !!filters.dateTo ||
    !!filters.search;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const isOwner = viewerRole === "owner";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-5 rounded-2xl border border-amber-900/10 shadow-2xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-amber-700" />
            Payments Log
          </h1>
          <p className="text-xs text-amber-900/60 mt-0.5">
            {loading
              ? "Loading…"
              : `Showing ${rows.length > 0 ? page * PAGE_SIZE + 1 : 0}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} of ${totalCount.toLocaleString()} transactions`}
            {!isOwner && " · Amounts restricted to Owner"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => fetchPage(page, filters)}
            disabled={loading}
            variant="outline"
            size="sm"
            className="border-amber-900/15 bg-amber-50/50 text-amber-900 gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={exportCSV}
            disabled={exporting || totalCount === 0}
            size="sm"
            className="bg-amber-700 hover:bg-amber-800 text-white gap-1.5 text-xs"
          >
            {exporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Exporting…
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" /> Export CSV
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Aggregate strip (whole filtered set).
          Owner: ₹ sums. Admin: transaction counts (no ₹). */}
      {agg && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-emerald-200 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/70">
              Captured (filtered)
            </div>
            {agg.capturedPaise !== null ? (
              <div className="text-xl font-bold text-emerald-800 mt-1">
                {fmtINR(agg.capturedPaise)}
              </div>
            ) : (
              <div className="text-xl font-bold text-emerald-800 mt-1">
                {agg.capturedCount}{" "}
                <span className="text-xs font-medium text-emerald-700/60">payments</span>
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-rose-200 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700/70">
              {agg.failedPaise !== null ? "Failed — opportunity loss" : "Failed (filtered)"}
            </div>
            {agg.failedPaise !== null ? (
              <div className="text-xl font-bold text-rose-800 mt-1">{fmtINR(agg.failedPaise)}</div>
            ) : (
              <div className="text-xl font-bold text-rose-800 mt-1">
                {agg.failedCount}{" "}
                <span className="text-xs font-medium text-rose-700/60">payments</span>
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-sky-200 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700/70">
              Refunded
            </div>
            {agg.refundedPaise !== null ? (
              <div className="text-xl font-bold text-sky-800 mt-1">{fmtINR(agg.refundedPaise)}</div>
            ) : (
              <div className="text-xl font-bold text-sky-800 mt-1">
                {agg.refundedCount}{" "}
                <span className="text-xs font-medium text-sky-700/60">payments</span>
              </div>
            )}
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-none" />
          {errorMsg}
        </div>
      )}

      {/* Filters */}
      <Card className="border border-amber-900/10 bg-white">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Filter className="w-4 h-4 text-amber-700" />
              Filters
              <span className="text-[10px] font-normal text-amber-900/50">
                (applied server-side; date range = ledger date, IST)
              </span>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-amber-700 hover:underline flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                id="pay-search"
                type="text"
                placeholder="Razorpay payment id…"
                value={pendingFilters.search}
                onChange={(e) => setPending((p) => ({ ...p, search: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && applyPendingFilters()}
                className="w-full pl-8 pr-3 py-2 text-xs border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white placeholder-slate-400"
              />
            </div>
            <select
              id="pay-filter-status"
              value={pendingFilters.status}
              onChange={(e) => setPending((p) => ({ ...p, status: e.target.value }))}
              className="text-xs border border-amber-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white text-slate-700"
            >
              <option value="all">All Statuses</option>
              <option value="captured">Captured</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
              <option value="pending">Pending</option>
            </select>
            <select
              id="pay-filter-plan"
              value={pendingFilters.planId}
              onChange={(e) => setPending((p) => ({ ...p, planId: e.target.value }))}
              className="text-xs border border-amber-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white text-slate-700"
            >
              <option value="all">All Plans</option>
              {planOptions.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                id="pay-filter-date-from"
                type="date"
                value={pendingFilters.dateFrom}
                onChange={(e) => setPending((p) => ({ ...p, dateFrom: e.target.value }))}
                title="Ledger date from"
                className="flex-1 text-xs border border-amber-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white text-slate-700"
              />
              <input
                id="pay-filter-date-to"
                type="date"
                value={pendingFilters.dateTo}
                onChange={(e) => setPending((p) => ({ ...p, dateTo: e.target.value }))}
                title="Ledger date to"
                className="flex-1 text-xs border border-amber-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white text-slate-700"
              />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <Button
              onClick={applyPendingFilters}
              size="sm"
              className="bg-amber-700 hover:bg-amber-800 text-white text-xs h-7 px-4 gap-1.5"
            >
              <Search className="w-3 h-3" />
              Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="rounded-xl border border-amber-900/10 overflow-hidden bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-amber-100 bg-amber-50/60">
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                  Date (IST)
                </th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                  Subscriber
                </th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                  Plan
                </th>
                <th className="text-right py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                  Amount
                </th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                  Method / Cycle
                </th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                  Razorpay ID
                </th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-amber-50">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="py-3 px-4">
                        <Skeleton className="h-4 w-full bg-amber-50" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-slate-400">
                    {hasActiveFilters
                      ? "No payments match the current filters."
                      : "No payment records yet — they appear once the Razorpay webhook starts processing events."}
                  </td>
                </tr>
              )}

              {!loading &&
                rows.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-amber-50 hover:bg-amber-50/30 transition-colors align-top"
                  >
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {fmtDateTime(p.paid_at ?? p.created_at)}
                      {p.status !== "captured" && p.paid_at === null && (
                        <div className="text-[10px] text-slate-400">ledger date</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {nameMap.get(p.subscription_id) || (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {p.subscription_id.slice(0, 8)}…
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">
                        {p.subscription?.plans?.name || "—"}
                      </div>
                      <div className="text-[11px] text-slate-400 capitalize">
                        {p.subscription?.plans?.billing_period || ""}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {p.amount_paise === null ? (
                        <MaskedCell />
                      ) : (
                        <span
                          className={`font-semibold ${p.status === "failed" ? "text-rose-700" : p.status === "refunded" ? "text-sky-700" : "text-slate-900"}`}
                        >
                          {fmtINR(p.amount_paise)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <PayStatusBadge status={p.status} />
                      {p.status === "failed" && p.failure_reason && (
                        <div className="text-[10px] text-rose-600 mt-1 max-w-52">
                          {p.failure_reason}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div className="capitalize">{p.method || "—"}</div>
                      {p.cycle_number != null && (
                        <div className="text-[10px] text-slate-400">cycle {p.cycle_number}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[11px] font-mono text-slate-500">
                      {p.razorpay_payment_id === null ? (
                        <MaskedCell />
                      ) : (
                        p.razorpay_payment_id || "—"
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {!loading && totalCount > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-amber-100 bg-amber-50/30">
            <p className="text-xs text-amber-900/60">
              Page {page + 1} of {totalPages} · {totalCount.toLocaleString()} total
            </p>
            <div className="flex items-center gap-1">
              <Button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0 border-amber-200"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0 border-amber-200"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
