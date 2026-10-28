import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callAdminApi } from "@/lib/admin-api";
import {
  buildPaymentsCsv,
  paymentSource,
  type PaymentListRow,
  type PaymentsListResponse,
} from "@/lib/payments-logic";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  StatCard,
  StatusPill,
  TableScroll,
  type Tone,
} from "@/components/admin/admin-ui";

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
  const map: Record<string, { label: string; tone: Tone }> = {
    captured: { label: "Captured", tone: "good" },
    failed: { label: "Failed", tone: "bad" },
    refunded: { label: "Refunded", tone: "info" },
    pending: { label: "Pending", tone: "neutral" },
  };
  const m = map[status] ?? { label: status, tone: "neutral" as Tone };
  return <StatusPill tone={m.tone}>{m.label}</StatusPill>;
}

const FIELD_CLS =
  "h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20";

// 🔒 placeholder for owner-only fields (amount / Razorpay IDs) —
// signals "restricted", not "missing". The real values were never
// sent to this browser (server-side strip in /api/admin/payments/list).
function MaskedCell() {
  return (
    <span
      className="inline-flex items-center gap-1 text-stone-400"
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

  const amountCls = (status: string) =>
    status === "failed"
      ? "text-rose-700"
      : status === "refunded"
        ? "text-sky-700"
        : "text-stone-900";

  const sourceCell = (p: PaymentListRow) => (
    <>
      {p.gateway === "offline_qr" ? (
        <StatusPill tone="neutral">{paymentSource(p)}</StatusPill>
      ) : (
        <span className="capitalize">{p.method || "—"}</span>
      )}
      {p.cycle_number != null && (
        <div className="text-xs text-stone-400">cycle {p.cycle_number}</div>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description={
          <>
            {loading
              ? "Loading…"
              : `Showing ${rows.length > 0 ? page * PAGE_SIZE + 1 : 0}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} of ${totalCount.toLocaleString()} transactions`}
            {!isOwner && " · Amounts restricted to Owner"}
          </>
        }
        actions={
          <>
            <Button
              onClick={() => fetchPage(page, filters)}
              disabled={loading}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              onClick={exportCSV}
              disabled={exporting || totalCount === 0}
              size="sm"
              className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5"
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
          </>
        }
      />

      {/* Aggregate strip (whole filtered set).
          Owner: ₹ sums. Admin: transaction counts (no ₹). */}
      {agg && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <StatCard
            label="Captured (filtered)"
            icon={CheckCircle2}
            value={
              agg.capturedPaise !== null ? (
                fmtINR(agg.capturedPaise)
              ) : (
                <>
                  {agg.capturedCount}{" "}
                  <span className="text-sm font-medium text-stone-500">payments</span>
                </>
              )
            }
            status={{ tone: "good", text: "Captured" }}
          />
          <StatCard
            label={agg.failedPaise !== null ? "Failed — opportunity loss" : "Failed (filtered)"}
            icon={XCircle}
            value={
              agg.failedPaise !== null ? (
                fmtINR(agg.failedPaise)
              ) : (
                <>
                  {agg.failedCount}{" "}
                  <span className="text-sm font-medium text-stone-500">payments</span>
                </>
              )
            }
            status={{ tone: "bad", text: "Failed" }}
          />
          <StatCard
            label="Refunded"
            icon={RotateCcw}
            value={
              agg.refundedPaise !== null ? (
                fmtINR(agg.refundedPaise)
              ) : (
                <>
                  {agg.refundedCount}{" "}
                  <span className="text-sm font-medium text-stone-500">payments</span>
                </>
              )
            }
            status={{ tone: "info", text: "Refunded" }}
          />
        </div>
      )}

      {errorMsg && (
        <Notice tone="bad" icon={AlertCircle}>
          {errorMsg}
        </Notice>
      )}

      {/* Filters */}
      <Panel
        title="Filters"
        description="Applied server-side; date range = ledger date, IST."
        actions={
          hasActiveFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="gap-1 text-orange-700"
            >
              <X className="w-3.5 h-3.5" /> Clear all
            </Button>
          ) : undefined
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
            <input
              id="pay-search"
              type="text"
              placeholder="Razorpay payment id…"
              value={pendingFilters.search}
              onChange={(e) => setPending((p) => ({ ...p, search: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && applyPendingFilters()}
              className={`${FIELD_CLS} pl-8 placeholder:text-stone-400`}
            />
          </div>
          <select
            id="pay-filter-status"
            value={pendingFilters.status}
            onChange={(e) => setPending((p) => ({ ...p, status: e.target.value }))}
            className={FIELD_CLS}
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
            className={FIELD_CLS}
          >
            <option value="all">All Plans</option>
            {planOptions.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              id="pay-filter-date-from"
              type="date"
              value={pendingFilters.dateFrom}
              onChange={(e) => setPending((p) => ({ ...p, dateFrom: e.target.value }))}
              title="Ledger date from"
              aria-label="Ledger date from"
              className={`${FIELD_CLS} min-w-0 px-2`}
            />
            <input
              id="pay-filter-date-to"
              type="date"
              value={pendingFilters.dateTo}
              onChange={(e) => setPending((p) => ({ ...p, dateTo: e.target.value }))}
              title="Ledger date to"
              aria-label="Ledger date to"
              className={`${FIELD_CLS} min-w-0 px-2`}
            />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <Button
            onClick={applyPendingFilters}
            size="sm"
            className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 text-white gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            Apply filters
          </Button>
        </div>
      </Panel>

      {/* Transactions */}
      <Panel title="Transactions" flush>
        {loading ? (
          <div className="p-4 sm:p-5 space-y-2">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title={
              hasActiveFilters ? "No payments match the current filters." : "No payment records yet"
            }
            description={
              hasActiveFilters
                ? undefined
                : "They appear once the Razorpay webhook starts processing events."
            }
          />
        ) : (
          <>
            {/* Phone: stacked cards */}
            <ul className="md:hidden divide-y divide-stone-100">
              {rows.map((p) => (
                <li key={p.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-stone-900 truncate">
                        {nameMap.get(p.subscription_id) || (
                          <span className="text-stone-400">—</span>
                        )}
                      </div>
                      <div className="text-xs text-stone-500 truncate">
                        {p.subscription?.plans?.name || "—"}
                        {p.subscription?.plans?.billing_period && (
                          <span className="capitalize">
                            {" "}
                            · {p.subscription.plans.billing_period}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {p.amount_paise === null ? (
                        <MaskedCell />
                      ) : (
                        <span className={`font-semibold tabular-nums ${amountCls(p.status)}`}>
                          {fmtINR(p.amount_paise)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                    <PayStatusBadge status={p.status} />
                    <span>
                      {fmtDateTime(p.paid_at ?? p.created_at)}
                      {p.status !== "captured" && p.paid_at === null && " (ledger date)"}
                    </span>
                    <div className="flex items-center gap-1.5">{sourceCell(p)}</div>
                  </div>
                  {p.status === "failed" && p.failure_reason && (
                    <div className="text-xs text-rose-600">{p.failure_reason}</div>
                  )}
                  <div className="text-xs font-mono text-stone-400 break-all">
                    {p.subscription_id.slice(0, 8)}… ·{" "}
                    {p.razorpay_payment_id === null ? <MaskedCell /> : p.razorpay_payment_id || "—"}
                  </div>
                </li>
              ))}
            </ul>

            {/* Tablet / desktop: table */}
            <TableScroll className="hidden md:block">
              <table className="w-full text-sm admin-table-fixed min-w-[900px]">
                <thead>
                  <tr className="text-left text-xs text-stone-500 border-b border-stone-100">
                    <th className="font-medium px-4 py-2.5">Date (IST)</th>
                    <th className="font-medium px-3 py-2.5">Subscriber</th>
                    <th className="font-medium px-3 py-2.5">Plan</th>
                    <th className="font-medium px-3 py-2.5 text-right">Amount</th>
                    <th className="font-medium px-3 py-2.5">Status</th>
                    <th className="font-medium px-3 py-2.5">Source / cycle</th>
                    <th className="font-medium px-4 py-2.5">Razorpay ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {rows.map((p) => (
                    <tr key={p.id} className="hover:bg-stone-50/60 transition-colors align-top">
                      <td className="px-4 py-3 text-xs text-stone-600 whitespace-nowrap">
                        {fmtDateTime(p.paid_at ?? p.created_at)}
                        {p.status !== "captured" && p.paid_at === null && (
                          <div className="text-xs text-stone-400">ledger date</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-stone-900">
                          {nameMap.get(p.subscription_id) || (
                            <span className="text-stone-400">—</span>
                          )}
                        </div>
                        <div className="text-xs text-stone-400 font-mono">
                          {p.subscription_id.slice(0, 8)}…
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-stone-800">{p.subscription?.plans?.name || "—"}</div>
                        <div className="text-xs text-stone-400 capitalize">
                          {p.subscription?.plans?.billing_period || ""}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {p.amount_paise === null ? (
                          <MaskedCell />
                        ) : (
                          <span className={`font-semibold tabular-nums ${amountCls(p.status)}`}>
                            {fmtINR(p.amount_paise)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <PayStatusBadge status={p.status} />
                        {p.status === "failed" && p.failure_reason && (
                          <div className="text-xs text-rose-600 mt-1 max-w-52">
                            {p.failure_reason}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-stone-600">{sourceCell(p)}</td>
                      <td className="px-4 py-3 text-xs font-mono text-stone-500 break-all">
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
            </TableScroll>
          </>
        )}

        {!loading && totalCount > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-stone-100">
            <p className="text-xs text-stone-500">
              Page {page + 1} of {totalPages} · {totalCount.toLocaleString()} total
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                variant="outline"
                size="sm"
                className="h-9 w-9 sm:h-8 sm:w-8 p-0"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
                variant="outline"
                size="sm"
                className="h-9 w-9 sm:h-8 sm:w-8 p-0"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
