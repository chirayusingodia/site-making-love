import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callAdminApi } from "@/lib/admin-api";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  SegmentedTabs,
  TableScroll,
} from "@/components/admin/admin-ui";

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
      className="px-3 py-2.5 font-medium cursor-pointer select-none hover:text-stone-800 first:pl-4 sm:first:pl-5"
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
    <div className="space-y-6">
      <PageHeader
        title="Performance"
        description="Reward · reallocate · coach · cut — sab lenses ek jagah, IST dates par."
        actions={
          <Button onClick={load} variant="outline" size="sm" disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      {/* Tabs + range */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedTabs<LensKey>
          value={lens}
          onChange={setLens}
          items={[
            { value: "telecallers", label: "Telecallers" },
            { value: "agents", label: "Agents" },
            { value: "hospitals", label: "Hospitals" },
          ]}
        />
        <span className="text-xs text-stone-500 tabular-nums">
          {range.from} → {range.to} (IST)
        </span>
      </div>

      {truncated.length > 0 && (
        <Notice tone="warn" icon={AlertTriangle}>
          Data capped for: {truncated.join(", ")} — range chhota karke retry karein.
        </Notice>
      )}
      {error && (
        <Notice tone="bad" icon={AlertTriangle}>
          <span className="break-words">{error}</span>
        </Notice>
      )}

      {loading && !data?.[lens] ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <>
          {lens === "telecallers" && (
            <Panel flush>
              <TableScroll>
                <table className="w-full text-sm whitespace-nowrap admin-table-fixed">
                  <thead>
                    <tr className="text-left text-xs text-stone-500 border-b border-stone-100">
                      <SortableTh label="Telecaller" field="name" sort={sort} onSort={onSort} />
                      <SortableTh label="Leads" field="leadsAssigned" sort={sort} onSort={onSort} />
                      <SortableTh label="Calls" field="callsMade" sort={sort} onSort={onSort} />
                      <SortableTh
                        label="Contact rate"
                        field="contactRateText"
                        sort={sort}
                        onSort={onSort}
                      />
                      <th className="px-3 py-2.5 font-medium">Poojas</th>
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
                      <th className="px-3 py-2.5 font-medium">Revenue (captured)</th>
                      <th className="px-3 py-2.5 font-medium">Book</th>
                      <th className="px-3 py-2.5 font-medium">Churn</th>
                      <th className="px-3 py-2.5 font-medium">Earned ₹</th>
                      <th className="px-3 py-2.5 font-medium">Avg days to convert</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-700">
                    {rows.map((r) => (
                      <tr
                        key={String(r.telecallerId)}
                        className={`${r.insufficientData ? "opacity-50 italic" : ""}`}
                      >
                        <td className="pl-4 sm:pl-5 pr-3 py-2.5 font-medium text-stone-900">
                          {String(r.name)}
                          {r.insufficientData && (
                            <span className="ml-1.5 text-xs font-normal not-italic px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">
                              insufficient data
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">{Number(r.leadsAssigned)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{Number(r.callsMade)}</td>
                        <td className="px-3 py-2.5 text-xs">{String(r.contactRateText)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{Number(r.freePoojas)}</td>
                        <td className="px-3 py-2.5 text-xs">{String(r.freePoojaToPaidRateText)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{Number(r.conversions)}</td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {inr(Number(r.revenueGeneratedPaise))}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">{Number(r.activeBookCount)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{Number(r.churnCount)}</td>
                        <td className="px-3 py-2.5 font-semibold tabular-nums text-stone-900">
                          {inr(Number((r.earnings as { totalPaise: number }).totalPaise))}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {r.avgDaysToConvert === null || r.avgDaysToConvert === undefined
                            ? "—"
                            : `${Number(r.avgDaysToConvert)}d`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </Panel>
          )}

          {lens === "agents" && (
            <Panel flush>
              <TableScroll>
                <table className="w-full text-sm whitespace-nowrap admin-table-fixed">
                  <thead>
                    <tr className="text-left text-xs text-stone-500 border-b border-stone-100">
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
                      <th className="px-3 py-2.5 font-medium">Revenue attributed</th>
                      <th className="px-3 py-2.5 font-medium">Earned ₹</th>
                      <th className="px-3 py-2.5 font-medium">Hospitals held</th>
                      <th className="px-3 py-2.5 font-medium">Best / worst hospital</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-700">
                    {rows.map((r) => (
                      <tr
                        key={String(r.agentId)}
                        className={`${r.insufficientData ? "opacity-50 italic" : ""}`}
                      >
                        <td className="pl-4 sm:pl-5 pr-3 py-2.5 font-medium text-stone-900">
                          {String(r.name)}
                          {r.insufficientData && (
                            <span className="ml-1.5 text-xs font-normal not-italic px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">
                              insufficient data
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">{Number(r.leadsSupplied)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{Number(r.leadsConverted)}</td>
                        <td className="px-3 py-2.5 text-xs">{String(r.leadQualityRateText)}</td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {inr(Number(r.revenueAttributedPaise))}
                        </td>
                        <td className="px-3 py-2.5 font-semibold tabular-nums text-stone-900">
                          {inr(Number(r.earningsPaise))}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {(r.hospitalsHeld as string[])?.join(", ") || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {r.bestHospital ? `↑ ${String(r.bestHospital)}` : "—"}{" "}
                          {r.worstHospital ? `↓ ${String(r.worstHospital)}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </Panel>
          )}

          {lens === "hospitals" && (
            <Panel flush>
              <TableScroll>
                <table className="w-full text-sm whitespace-nowrap admin-table-fixed">
                  <thead>
                    <tr className="text-left text-xs text-stone-500 border-b border-stone-100">
                      <SortableTh label="Hospital" field="name" sort={sort} onSort={onSort} />
                      <th className="px-3 py-2.5 font-medium">Allotted agent</th>
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
                      <th className="px-3 py-2.5 font-medium">Revenue (captured)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-700">
                    {rows.map((r) => (
                      <tr
                        key={String(r.hospitalId)}
                        className={`${r.insufficientData ? "opacity-50 italic" : ""}`}
                      >
                        <td className="pl-4 sm:pl-5 pr-3 py-2.5 font-medium text-stone-900">
                          {String(r.name)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {String(r.allottedAgentName ?? "— khali —")}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">{Number(r.leadsProduced)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{Number(r.converted)}</td>
                        <td className="px-3 py-2.5 text-xs">{String(r.conversionRateText)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{inr(Number(r.revenuePaise))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </Panel>
          )}

          {!loading && rows.length === 0 && !error && (
            <div className="admin-card">
              <EmptyState title="Is range mein koi data nahi." />
            </div>
          )}
          {loading && data?.[lens] && (
            <div className="flex items-center justify-center text-stone-400 text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Refresh ho raha hai…
            </div>
          )}
        </>
      )}
    </div>
  );
}
