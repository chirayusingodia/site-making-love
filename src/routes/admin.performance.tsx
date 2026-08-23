import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callAdminApi } from "@/lib/admin-api";
import { Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/performance")({
  // OWNER-ONLY both layers (§6.1) — same discipline as
  // /admin/commissions and /admin/reports. The API 403 is layer 3.
  beforeLoad: async () => {
    const { fetchMyRole } = await import("@/lib/admin-api");
    const role = await fetchMyRole();
    if (role !== "owner") {
      throw redirect({ to: "/admin/overview", search: { notice: "owner-required" } });
    }
  },
  component: AdminPerformancePage,
});

// §6 — three ranked lenses (telecallers / agents / hospitals) over an
// IST date range, so the owner can reward, reallocate, coach and cut.
// READ-ONLY by design: reallotment lives on /admin/leads.

type LensKey = "telecallers" | "agents" | "hospitals";

interface BaseRow {
  insufficientData: boolean;
}

function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Current IST month as [first-day, today]. */
function defaultRange(): { from: string; to: string } {
  const nowIst = new Date(Date.now() + 5.5 * 3_600_000).toISOString();
  return { from: `${nowIst.slice(0, 7)}-01`, to: nowIst.slice(0, 10) };
}

type SortDir = "asc" | "desc";

function SortableTh({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: string;
  sort: { field: string; dir: SortDir } | null;
  onSort: (f: string) => void;
}) {
  const active = sort?.field === field;
  return (
    <th
      className="pb-2 cursor-pointer select-none hover:text-slate-700"
      onClick={() => onSort(field)}
    >
      {label}
      {active && <span className="ml-0.5">{sort!.dir === "desc" ? "▾" : "▴"}</span>}
    </th>
  );
}

function AdminPerformancePage() {
  const [lens, setLens] = useState<LensKey>("telecallers");
  const [range] = useState(defaultRange);
  const [data, setData] = useState<
    Partial<Record<LensKey, { rows: (BaseRow & Record<string, unknown>)[] }>>
  >({});
  const [truncated, setTruncated] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Per-lens sort: field + direction.
  const [sort, setSort] = useState<{ field: string; dir: SortDir }>({ field: "", dir: "desc" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await callAdminApi<{
        rows: (BaseRow & Record<string, unknown>)[];
        truncatedTables?: string[];
      }>(`/api/admin/performance/${lens}`, { from: range.from, to: range.to });
      setData((prev) => ({ ...prev, [lens]: res }));
      setTruncated(res.truncatedTables ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Performance data nahi mili");
    } finally {
      setLoading(false);
    }
  }, [lens, range]);

  useEffect(() => {
    if (!data?.[lens]) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens]);

  function onSort(field: string) {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { field, dir: "desc" },
    );
  }

  function sortedRows(): (BaseRow & Record<string, unknown>)[] {
    const rows = [...(data?.[lens]?.rows ?? [])];
    if (!sort.field) return rows;
    rows.sort((a, b) => {
      const av = a[sort.field];
      const bv = b[sort.field];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av ?? "").localeCompare(String(bv ?? ""));
      return sort.dir === "desc" ? -cmp : cmp;
    });
    return rows;
  }

  const rows = sortedRows();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-700" />
            Performance
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-white">
              OWNER
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Reward · reallocate · coach · cut — sab lenses ek jagah, IST dates par.
          </p>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Tabs + range */}
      <div className="flex flex-wrap items-center gap-2">
        {(["telecallers", "agents", "hospitals"] as LensKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setLens(k)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${
              lens === k
                ? "bg-amber-700 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {k}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500 font-mono">
          {range.from} → {range.to} (IST)
        </span>
      </div>

      {truncated.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs px-4 py-2">
          Data capped for: {truncated.join(", ")} — range chhota karke retry karein.
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {loading && !data?.[lens] ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <>
          {lens === "telecallers" && (
            <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5 overflow-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <SortableTh label="Telecaller" field="name" sort={sort} onSort={onSort} />
                    <SortableTh label="Leads" field="leadsAssigned" sort={sort} onSort={onSort} />
                    <SortableTh label="Calls" field="callsMade" sort={sort} onSort={onSort} />
                    <SortableTh
                      label="Contact rate"
                      field="contactRateText"
                      sort={sort}
                      onSort={onSort}
                    />
                    <th className="pb-2">🪔 Poojas</th>
                    <SortableTh
                      label="Pooja→Paid"
                      field="freePoojaToPaidRateText"
                      sort={sort}
                      onSort={onSort}
                    />
                    <SortableTh
                      label="Conversions"
                      field="conversions"
                      sort={sort}
                      onSort={onSort}
                    />
                    <th className="pb-2">Revenue (captured)</th>
                    <th className="pb-2">Book</th>
                    <th className="pb-2">Churn</th>
                    <th className="pb-2">Earned ₹</th>
                    <th className="pb-2">Avg days to convert</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={String(r.telecallerId)}
                      className={`border-t border-slate-100 ${
                        r.insufficientData ? "opacity-50 italic" : ""
                      }`}
                    >
                      <td className="py-1.5 font-semibold">
                        {String(r.name)}
                        {r.insufficientData && (
                          <span className="ml-1.5 text-[10px] not-italic px-1 rounded bg-slate-100 text-slate-500">
                            insufficient data
                          </span>
                        )}
                      </td>
                      <td className="py-1.5">{Number(r.leadsAssigned)}</td>
                      <td className="py-1.5">{Number(r.callsMade)}</td>
                      <td className="py-1.5 text-xs">{String(r.contactRateText)}</td>
                      <td className="py-1.5">{Number(r.freePoojas)}</td>
                      <td className="py-1.5 text-xs">{String(r.freePoojaToPaidRateText)}</td>
                      <td className="py-1.5">{Number(r.conversions)}</td>
                      <td className="py-1.5">{inr(Number(r.revenueGeneratedPaise))}</td>
                      <td className="py-1.5">{Number(r.activeBookCount)}</td>
                      <td className="py-1.5">{Number(r.churnCount)}</td>
                      <td className="py-1.5 font-bold">
                        {inr(Number((r.earnings as { totalPaise: number }).totalPaise))}
                      </td>
                      <td className="py-1.5 text-xs">
                        {r.avgDaysToConvert === null || r.avgDaysToConvert === undefined
                          ? "—"
                          : `${Number(r.avgDaysToConvert)}d`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {lens === "agents" && (
            <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5 overflow-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <SortableTh label="Agent" field="name" sort={sort} onSort={onSort} />
                    <SortableTh
                      label="Leads supplied"
                      field="leadsSupplied"
                      sort={sort}
                      onSort={onSort}
                    />
                    <SortableTh
                      label="Converted"
                      field="leadsConverted"
                      sort={sort}
                      onSort={onSort}
                    />
                    <SortableTh
                      label="Lead quality"
                      field="leadQualityRateText"
                      sort={sort}
                      onSort={onSort}
                    />
                    <th className="pb-2">Revenue attributed</th>
                    <th className="pb-2">Earned ₹</th>
                    <th className="pb-2">Hospitals held</th>
                    <th className="pb-2">Best / worst hospital</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={String(r.agentId)}
                      className={`border-t border-slate-100 ${
                        r.insufficientData ? "opacity-50 italic" : ""
                      }`}
                    >
                      <td className="py-1.5 font-semibold">
                        {String(r.name)}
                        {r.insufficientData && (
                          <span className="ml-1.5 text-[10px] not-italic px-1 rounded bg-slate-100 text-slate-500">
                            insufficient data
                          </span>
                        )}
                      </td>
                      <td className="py-1.5">{Number(r.leadsSupplied)}</td>
                      <td className="py-1.5">{Number(r.leadsConverted)}</td>
                      <td className="py-1.5 text-xs">{String(r.leadQualityRateText)}</td>
                      <td className="py-1.5">{inr(Number(r.revenueAttributedPaise))}</td>
                      <td className="py-1.5 font-bold">{inr(Number(r.earningsPaise))}</td>
                      <td className="py-1.5 text-xs">
                        {(r.hospitalsHeld as string[])?.join(", ") || "—"}
                      </td>
                      <td className="py-1.5 text-xs">
                        {r.bestHospital ? `↑ ${String(r.bestHospital)}` : "—"}{" "}
                        {r.worstHospital ? `↓ ${String(r.worstHospital)}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {lens === "hospitals" && (
            <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5 overflow-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <SortableTh label="Hospital" field="name" sort={sort} onSort={onSort} />
                    <th className="pb-2">Allotted agent</th>
                    <SortableTh
                      label="Leads produced"
                      field="leadsProduced"
                      sort={sort}
                      onSort={onSort}
                    />
                    <SortableTh label="Converted" field="converted" sort={sort} onSort={onSort} />
                    <SortableTh
                      label="Conversion"
                      field="conversionRateText"
                      sort={sort}
                      onSort={onSort}
                    />
                    <th className="pb-2">Revenue (captured)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={String(r.hospitalId)}
                      className={`border-t border-slate-100 ${
                        r.insufficientData ? "opacity-50 italic" : ""
                      }`}
                    >
                      <td className="py-1.5 font-semibold">{String(r.name)}</td>
                      <td className="py-1.5">{String(r.allottedAgentName ?? "— khali —")}</td>
                      <td className="py-1.5">{Number(r.leadsProduced)}</td>
                      <td className="py-1.5">{Number(r.converted)}</td>
                      <td className="py-1.5 text-xs">{String(r.conversionRateText)}</td>
                      <td className="py-1.5">{inr(Number(r.revenuePaise))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {!loading && rows.length === 0 && !error && (
            <div className="rounded-2xl border border-slate-200 bg-white text-slate-400 text-sm px-4 py-6 text-center">
              Is range mein koi data nahi.
            </div>
          )}
          {loading && data?.[lens] && (
            <div className="flex items-center justify-center text-slate-400 text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Refresh ho raha hai…
            </div>
          )}
        </>
      )}
    </div>
  );
}
