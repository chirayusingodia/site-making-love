import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { fetchAllRows, supabase } from "@/lib/supabase";
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

interface PaymentRow {
  id: string;
  subscription_id: string;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  amount_paise: number;
  status: string; // captured | failed | refunded | pending
  method: string | null;
  cycle_number: number | null;
  paid_at: string | null;
  failure_reason: string | null;
  created_at: string;
  subscription: {
    id: string;
    plan_id: string;
    plans: { name: string; billing_period: string } | null;
  } | null;
}

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

// ─── Server-side query builder (list + count + aggregates + CSV
//     all apply identical filters) ─────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, f: FilterState): any {
  if (f.status !== "all") q = q.eq("status", f.status);
  if (f.planId !== "all") q = q.eq("subscription.plan_id", f.planId);
  // Date range filters on created_at (ledger write time) — paid_at
  // is NULL for failed rows, so filtering paid_at would silently
  // hide every failure from a date-filtered view.
  if (f.dateFrom) q = q.gte("created_at", `${f.dateFrom}T00:00:00+05:30`);
  if (f.dateTo) q = q.lte("created_at", `${f.dateTo}T23:59:59.999+05:30`);
  if (f.search.trim()) q = q.ilike("razorpay_payment_id", `%${f.search.trim()}%`);
  return q;
}

const SELECT_COLS = `
  id, subscription_id, razorpay_payment_id, razorpay_order_id,
  amount_paise, status, method, cycle_number, paid_at, failure_reason, created_at,
  subscription:subscriptions!inner(
    id, plan_id,
    plans(name, billing_period)
  )
`;

// ─── CSV export (full filtered fetch, not the visible page) ──

async function exportCSV(
  filters: FilterState,
  nameMap: Map<string, string>,
  setExporting: (v: boolean) => void,
) {
  setExporting(true);
  try {
    const { data: rows, error } = await fetchAllRows<PaymentRow>((from, to) =>
      applyFilters(
        supabase
          .from("payments")
          .select(SELECT_COLS)
          .order("created_at", { ascending: false })
          .range(from, to),
        filters,
      ),
    );
    if (error) {
      alert(`Export failed: ${error}`);
      return;
    }
    if (rows.length === 0) {
      alert("No matching payments to export.");
      return;
    }

    const headers = [
      "created_at_ist",
      "paid_at_ist",
      "subscriber",
      "plan",
      "amount_inr",
      "status",
      "method",
      "cycle_number",
      "failure_reason",
      "razorpay_payment_id",
      "razorpay_order_id",
      "subscription_id",
    ];
    const csvRows = rows.map((r) =>
      [
        fmtDateTime(r.created_at),
        r.paid_at ? fmtDateTime(r.paid_at) : "",
        nameMap.get(r.subscription_id) ?? "",
        r.subscription?.plans?.name ?? "",
        (r.amount_paise / 100).toFixed(2),
        r.status,
        r.method ?? "",
        r.cycle_number ?? "",
        r.failure_reason ?? "",
        r.razorpay_payment_id ?? "",
        r.razorpay_order_id ?? "",
        r.subscription_id,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );

    const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `punyata_payments_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    setExporting(false);
  }
}

// ─── Main Page ───────────────────────────────────────────────

function AdminPaymentsPage() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [totalCount, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setError] = useState<string | null>(null);

  const [planOptions, setPlanOptions] = useState<{ id: string; name: string }[]>([]);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());

  // Aggregates across the ENTIRE filtered set (not just the page).
  const [agg, setAgg] = useState<{ captured: number; failed: number; refunded: number } | null>(
    null,
  );

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

  const fetchPage = useCallback(async (pageIndex: number, f: FilterState) => {
    setLoading(true);
    setError(null);
    try {
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const q = applyFilters(
        supabase
          .from("payments")
          .select(SELECT_COLS, { count: "exact" })
          .order("created_at", { ascending: false })
          .range(from, to),
        f,
      );
      const { data, error, count } = await q;
      if (error) {
        setError(`Could not load payments: ${error.message}`);
        setRows([]);
        setTotal(0);
        setAgg(null);
        return;
      }
      const pageRows = (data || []) as unknown as PaymentRow[];
      setRows(pageRows);
      setTotal(count ?? 0);

      // Primary member names for this page's subscriptions.
      const subIds = [...new Set(pageRows.map((r) => r.subscription_id))];
      if (subIds.length > 0) {
        const { data: names } = await supabase
          .from("subscriber_list_view")
          .select("subscription_id, primary_member_name")
          .in("subscription_id", subIds);
        setNameMap((prev) => {
          const next = new Map(prev);
          for (const n of names || []) next.set(n.subscription_id, n.primary_member_name || "");
          return next;
        });
      }

      // Aggregates over the whole filtered set (amount + status only).
      // The !inner embed is REQUIRED here even though we don't display
      // it — PostgREST rejects a filter on "subscription.plan_id"
      // unless the embedded resource is present in the select.
      const { data: allAgg } = await fetchAllRows<{ amount_paise: number; status: string }>(
        (a, b) =>
          applyFilters(
            supabase
              .from("payments")
              .select("amount_paise, status, subscription:subscriptions!inner(plan_id)")
              .range(a, b),
            f,
          ),
      );
      const sums = { captured: 0, failed: 0, refunded: 0 };
      for (const r of allAgg) {
        if (r.status === "captured") sums.captured += r.amount_paise;
        else if (r.status === "failed") sums.failed += r.amount_paise;
        else if (r.status === "refunded") sums.refunded += r.amount_paise;
      }
      setAgg(sums);
    } catch (err) {
      console.error(err);
      setError("Unexpected error loading payments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(page, filters);
  }, [page, filters, fetchPage]);

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
            onClick={() => exportCSV(filters, nameMap, setExporting)}
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

      {/* Aggregate strip (whole filtered set) */}
      {agg && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-emerald-200 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/70">
              Captured (filtered)
            </div>
            <div className="text-xl font-bold text-emerald-800 mt-1">{fmtINR(agg.captured)}</div>
          </div>
          <div className="bg-white rounded-xl border border-rose-200 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700/70">
              Failed — opportunity loss
            </div>
            <div className="text-xl font-bold text-rose-800 mt-1">{fmtINR(agg.failed)}</div>
          </div>
          <div className="bg-white rounded-xl border border-sky-200 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700/70">
              Refunded
            </div>
            <div className="text-xl font-bold text-sky-800 mt-1">{fmtINR(agg.refunded)}</div>
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
                      <span
                        className={`font-semibold ${p.status === "failed" ? "text-rose-700" : p.status === "refunded" ? "text-sky-700" : "text-slate-900"}`}
                      >
                        {fmtINR(p.amount_paise)}
                      </span>
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
                      {p.razorpay_payment_id || "—"}
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
