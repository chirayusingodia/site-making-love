import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { callAdminApi } from "@/lib/admin-api";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
  if (!hasContent) return <span className="text-slate-300">—</span>;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {open ? "Hide" : "View"} JSON
      </button>
      {open && (
        <pre className="mt-1.5 max-w-md overflow-auto rounded-lg bg-slate-900 text-slate-100 text-[11px] p-2.5 whitespace-pre-wrap break-all">
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-amber-700" />
            Audit Log
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-white">
              OWNER
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Read-only trail of every admin mutation — append-only, no edit/delete.
          </p>
        </div>
        <Button onClick={() => load(page)} variant="outline" size="sm" disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full h-9 mt-1 rounded-md border border-slate-300 px-2 text-sm focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full h-9 mt-1 rounded-md border border-slate-300 px-2 text-sm focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Action</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full h-9 mt-1 rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-amber-500 focus:outline-none"
          >
            <option value="">All</option>
            {(filtersData?.actions ?? []).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Entity</label>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="w-full h-9 mt-1 rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-amber-500 focus:outline-none"
          >
            <option value="">All</option>
            {(filtersData?.entities ?? []).map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div>
          {/* admin_logs.admin_id holds ANY actor's id, not just staff —
              e.g. agent.leads.uploaded is logged with the sales agent's
              own id (agent/leads/upload.ts) so uploads stay attributable.
              "Admin" as a label reads as staff-only and is misleading. */}
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Performed By</label>
          <select
            value={adminId}
            onChange={(e) => setAdminId(e.target.value)}
            className="w-full h-9 mt-1 rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-amber-500 focus:outline-none"
          >
            <option value="">All</option>
            {(filtersData?.admins ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.full_name ?? a.id}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Search</label>
          <form
            className="relative mt-1"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
            }}
          >
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="entity_id / meta…"
              className="w-full h-9 pl-8 pr-2 rounded-md border border-slate-300 text-sm focus:border-amber-500 focus:outline-none"
            />
          </form>
        </div>
      </section>

      {loading && !rows ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5 overflow-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2">Time (IST)</th>
                <th className="pb-2">Action</th>
                <th className="pb-2">Entity</th>
                <th className="pb-2">Entity ID</th>
                <th className="pb-2">By</th>
                <th className="pb-2">Meta</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="py-2 text-xs whitespace-nowrap">{formatIST(r.created_at)}</td>
                  <td className="py-2 font-mono text-xs">{r.action}</td>
                  <td className="py-2 text-xs">{r.entity}</td>
                  <td className="py-2 text-xs font-mono text-slate-500">
                    {r.entity_id ? r.entity_id.slice(0, 8) + "…" : "—"}
                  </td>
                  <td className="py-2 text-xs">{r.admin_name}</td>
                  <td className="py-2 whitespace-normal">
                    <MetaCell meta={r.meta} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && rows?.length === 0 && !error && (
            <div className="text-slate-400 text-sm px-2 py-6 text-center">Koi audit row nahi mila.</div>
          )}

          {!loading && total > 0 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
              <span>
                {total.toLocaleString("en-IN")} rows · page {page} of {totalPages}
              </span>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1 || loading}
                  onClick={() => load(page - 1)}
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Prev"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages || loading}
                  onClick={() => load(page + 1)}
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Next"}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
          {error}
        </div>
      )}
    </div>
  );
}
