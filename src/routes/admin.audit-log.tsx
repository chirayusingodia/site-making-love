import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { callAdminApi } from "@/lib/admin-api";
import { ChevronDown, ChevronRight, ClipboardList, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Notice, PageHeader, Panel, TableScroll } from "@/components/admin/admin-ui";

export const Route = createFileRoute("/admin/audit-log")({
  // OWNER-ONLY both layers — same discipline as /admin/staff,
  // /admin/commissions, /admin/reports. The API 403 (list.ts,
  // filters.ts) is the real enforcement layer; this is UI-hiding.
  beforeLoad: async () => {
    const { fetchMyRole } = await import("@/lib/admin-api");
    const role = await fetchMyRole();
    if (role !== "owner") {
      throw redirect({ to: "/admin/overview", search: { notice: "owner-required" } });
    }
  },
  component: AdminAuditLogPage,
});

interface AuditRow {
  id: string;
  created_at: string;
  action: string;
  entity: string;
  entity_id: string | null;
  admin_id: string | null;
  admin_name: string;
  meta: unknown;
}

interface FiltersData {
  actions: string[];
  entities: string[];
  admins: { id: string; full_name: string | null }[];
}

const PAGE_SIZE = 25;

const labelCls = "text-xs font-medium text-stone-500";
const fieldBase =
  "w-full h-9 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-800 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20";
const fieldCls = `mt-1 ${fieldBase}`;

function formatIST(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetaCell({ meta }: { meta: unknown }) {
  const [open, setOpen] = useState(false);
  const hasContent = meta !== null && meta !== undefined && Object.keys(meta as object).length > 0;
  if (!hasContent) return <span className="text-stone-300">—</span>;
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 py-1 text-xs font-medium text-orange-700 hover:text-orange-800"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {open ? "Hide" : "View"} JSON
      </button>
      {open && (
        <pre className="mt-1.5 max-w-full md:max-w-md max-h-80 overflow-auto rounded-lg bg-stone-900 text-stone-100 text-[11px] p-2.5 whitespace-pre-wrap break-all">
          {JSON.stringify(meta, null, 2)}
        </pre>
      )}
    </div>
  );
}

function AdminAuditLogPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filtersData, setFiltersData] = useState<FiltersData | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [adminId, setAdminId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    callAdminApi<FiltersData>("/api/admin/audit-log/filters", {})
      .then(setFiltersData)
      .catch(() => setFiltersData({ actions: [], entities: [], admins: [] }));
  }, []);

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await callAdminApi<{ rows: AuditRow[]; total: number }>(
          "/api/admin/audit-log/list",
          {
            page: p,
            pageSize: PAGE_SIZE,
            ...(dateFrom ? { dateFrom } : {}),
            ...(dateTo ? { dateTo } : {}),
            ...(action ? { action } : {}),
            ...(entity ? { entity } : {}),
            ...(adminId ? { adminId } : {}),
            ...(search ? { search } : {}),
          },
        );
        setRows(res.rows);
        setTotal(res.total);
        setPage(p);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Audit log load failed");
      } finally {
        setLoading(false);
      }
    },
    [dateFrom, dateTo, action, entity, adminId, search],
  );

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, action, entity, adminId, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Read-only trail of every admin mutation — append-only, no edit/delete."
        actions={
          <Button
            onClick={() => load(page)}
            variant="outline"
            size="sm"
            disabled={loading}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      {/* Filters */}
      <section className="admin-card p-4 sm:p-5 grid gap-3 grid-cols-2 lg:grid-cols-6">
        <div className="min-w-0">
          <label className={labelCls}>From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={fieldCls}
          />
        </div>
        <div className="min-w-0">
          <label className={labelCls}>To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={fieldCls}
          />
        </div>
        <div className="min-w-0">
          <label className={labelCls}>Action</label>
          <select value={action} onChange={(e) => setAction(e.target.value)} className={fieldCls}>
            <option value="">All</option>
            {(filtersData?.actions ?? []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className={labelCls}>Entity</label>
          <select value={entity} onChange={(e) => setEntity(e.target.value)} className={fieldCls}>
            <option value="">All</option>
            {(filtersData?.entities ?? []).map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 col-span-2 sm:col-span-1">
          {/* admin_logs.admin_id holds ANY actor's id, not just staff —
              e.g. agent.leads.uploaded is logged with the sales agent's
              own id (agent/leads/upload.ts) so uploads stay attributable.
              "Admin" as a label reads as staff-only and is misleading. */}
          <label className={labelCls}>Performed By</label>
          <select value={adminId} onChange={(e) => setAdminId(e.target.value)} className={fieldCls}>
            <option value="">All</option>
            {(filtersData?.admins ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name ?? a.id}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 col-span-2 sm:col-span-1">
          <label className={labelCls}>Search</label>
          <form
            className="relative mt-1"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
            }}
          >
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="entity_id / meta…"
              className={`${fieldBase} pl-8`}
            />
          </form>
        </div>
      </section>

      {loading && !rows ? (
        <Skeleton className="h-64 w-full rounded-xl bg-stone-100" />
      ) : (
        <Panel flush>
          {/* Mobile: stacked cards */}
          <ul className="md:hidden divide-y divide-stone-100">
            {(rows ?? []).map((r) => (
              <li key={r.id} className="px-4 py-3.5 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-mono text-xs font-medium text-stone-900 break-all">
                    {r.action}
                  </span>
                  <span className="shrink-0 text-xs text-stone-500 tabular-nums">
                    {formatIST(r.created_at)}
                  </span>
                </div>
                <div className="text-xs text-stone-600 break-words">
                  {r.entity}
                  {r.entity_id && (
                    <span className="font-mono text-stone-400"> · {r.entity_id.slice(0, 8)}…</span>
                  )}
                  <span className="text-stone-400"> · by </span>
                  {r.admin_name}
                </div>
                <MetaCell meta={r.meta} />
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block">
            <TableScroll>
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-stone-500 bg-stone-50/60 border-b border-stone-100">
                    <th className="px-4 sm:px-5 py-2.5 font-medium">Time (IST)</th>
                    <th className="px-3 py-2.5 font-medium">Action</th>
                    <th className="px-3 py-2.5 font-medium">Entity</th>
                    <th className="px-3 py-2.5 font-medium">Entity ID</th>
                    <th className="px-3 py-2.5 font-medium">By</th>
                    <th className="px-4 sm:px-5 py-2.5 font-medium">Meta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {(rows ?? []).map((r) => (
                    <tr key={r.id} className="align-top hover:bg-stone-50/60">
                      <td className="px-4 sm:px-5 py-2.5 text-xs text-stone-600 tabular-nums whitespace-nowrap">
                        {formatIST(r.created_at)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-stone-900 whitespace-nowrap">
                        {r.action}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-stone-700 whitespace-nowrap">
                        {r.entity}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-stone-500 whitespace-nowrap">
                        {r.entity_id ? r.entity_id.slice(0, 8) + "…" : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-stone-700 whitespace-nowrap">
                        {r.admin_name}
                      </td>
                      <td className="px-4 sm:px-5 py-2.5">
                        <MetaCell meta={r.meta} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </div>

          {!loading && rows?.length === 0 && !error && (
            <EmptyState icon={ClipboardList} title="Koi audit row nahi mila." />
          )}

          {!loading && total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-t border-stone-100 text-xs text-stone-500">
              <span className="tabular-nums">
                {total.toLocaleString("en-IN")} rows · page {page} of {totalPages}
              </span>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 sm:h-8 min-w-16"
                  disabled={page <= 1 || loading}
                  onClick={() => load(page - 1)}
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Prev"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 sm:h-8 min-w-16"
                  disabled={page >= totalPages || loading}
                  onClick={() => load(page + 1)}
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Next"}
                </Button>
              </div>
            </div>
          )}
        </Panel>
      )}

      {!loading && error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}
