import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { callAdminApi } from "@/lib/admin-api";
import { inr, inrAxis, CHART_COLORS } from "@/lib/finance-ui";
import { todayIST } from "@/lib/offline-subscriptions-logic";
import { Panel, TableScroll } from "@/components/admin/admin-ui";
import { Skeleton } from "@/components/ui/skeleton";

interface Entry {
  entry_date: string;
  amount_paise: number;
  counterparty: string | null;
  finance_categories:
    | { name: string; entry_type: string }
    | { name: string; entry_type: string }[];
}

const WEEKS = 12;
const DAY = 86400000;

function toUtc(d: string): number {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
}
function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
/** Monday of the week containing date `d` (YYYY-MM-DD). */
function weekStart(d: string): string {
  const ms = toUtc(d);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // Mon=0
  return iso(ms - dow * DAY);
}
function weekLabel(ws: string): string {
  return new Date(toUtc(ws)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function FinanceWeekly() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const thisWeek = weekStart(todayIST(new Date()));
  const firstWeek = iso(toUtc(thisWeek) - (WEEKS - 1) * 7 * DAY);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all: Entry[] = [];
      for (let page = 1; page <= 20; page++) {
        const r = await callAdminApi<{ entries: Entry[]; total: number }>(
          "/api/admin/finance/entries-list",
          { from: firstWeek, to: iso(toUtc(thisWeek) + 6 * DAY), entryType: "expense", page, pageSize: 100 },
        );
        all.push(...r.entries);
        if (all.length >= r.total || r.entries.length === 0) break;
      }
      setEntries(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Weekly data load nahi hua");
    } finally {
      setLoading(false);
    }
  }, [firstWeek, thisWeek]);

  useEffect(() => {
    void load();
  }, [load]);

  const { weeks, cats, topParties, tableRows } = useMemo(() => {
    const catName = (e: Entry) =>
      (Array.isArray(e.finance_categories) ? e.finance_categories[0] : e.finance_categories)?.name ??
      "Other";
    const weekKeys: string[] = [];
    for (let i = 0; i < WEEKS; i++) weekKeys.push(iso(toUtc(firstWeek) + i * 7 * DAY));
    const byWeek = new Map<string, Record<string, number>>(weekKeys.map((k) => [k, {}]));
    const catTotals = new Map<string, number>();
    const parties = new Map<string, number>();
    for (const e of entries) {
      const w = byWeek.get(weekStart(e.entry_date));
      if (!w) continue;
      const c = catName(e);
      w[c] = (w[c] ?? 0) + e.amount_paise;
      catTotals.set(c, (catTotals.get(c) ?? 0) + e.amount_paise);
      const p = e.counterparty?.trim();
      if (p) parties.set(p, (parties.get(p) ?? 0) + e.amount_paise);
    }
    const catList = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
    const top = catList.slice(0, 6);
    const rows = weekKeys.map((k) => {
      const w = byWeek.get(k)!;
      const row: Record<string, number | string> = { name: weekLabel(k), ws: k };
      let total = 0;
      let rest = 0;
      for (const [c, v] of Object.entries(w)) {
        total += v;
        if (top.includes(c)) row[c] = v / 100;
        else rest += v;
      }
      if (rest) row["Other categories"] = rest / 100;
      row.total = total;
      return row;
    });
    return {
      weeks: rows,
      cats: rest(top, rows),
      topParties: [...parties.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      tableRows: rows,
    };
  }, [entries, firstWeek]);

  const palette = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#999999"];
  const totalAll = tableRows.reduce((s, r) => s + (r.total as number), 0);
  const cur = (tableRows[tableRows.length - 1]?.total as number) ?? 0;
  const prev = (tableRows[tableRows.length - 2]?.total as number) ?? 0;

  if (loading) return <Skeleton className="h-72 w-full" />;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Panel title="This week">
          <p className="text-2xl font-semibold tabular-nums">{inr(cur)}</p>
        </Panel>
        <Panel title="Last week">
          <p className="text-2xl font-semibold tabular-nums">{inr(prev)}</p>
          <p className="text-xs text-stone-500 mt-1">
            {prev > 0 ? `${cur >= prev ? "+" : ""}${Math.round(((cur - prev) / prev) * 100)}% this week` : "—"}
          </p>
        </Panel>
        <Panel title={`Last ${WEEKS} weeks`}>
          <p className="text-2xl font-semibold tabular-nums">{inr(totalAll)}</p>
          <p className="text-xs text-stone-500 mt-1">avg {inr(Math.round(totalAll / WEEKS))} / week</p>
        </Panel>
      </div>

      <Panel title="Weekly spend by category (weeks start Monday)">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeks} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#78716c" }} />
              <YAxis tick={{ fontSize: 11, fill: "#78716c" }} tickFormatter={inrAxis} />
              <Tooltip formatter={(v: number) => inr(Math.round(v * 100))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {cats.map((c, i) => (
                <Bar key={c} dataKey={c} stackId="w" fill={palette[i % palette.length] ?? CHART_COLORS.bar} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Where the money went (top payees)" flush>
          <TableScroll>
            <table className="w-full text-[13px] tabular-nums">
              <tbody>
                {topParties.length === 0 && (
                  <tr>
                    <td className="p-3 text-stone-500">
                      Entries mein "Paid to" (counterparty) bharo to yahan dikhega.
                    </td>
                  </tr>
                )}
                {topParties.map(([n, v]) => (
                  <tr key={n} className="border-t border-stone-100">
                    <td className="p-3">{n}</td>
                    <td className="p-3 text-right">{inr(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Panel>
        <Panel title="Week by week" flush>
          <TableScroll>
            <table className="w-full text-[13px] tabular-nums">
              <tbody>
                {[...tableRows].reverse().map((r) => (
                  <tr key={r.ws as string} className="border-t border-stone-100">
                    <td className="p-3">Week of {weekLabel(r.ws as string)}</td>
                    <td className="p-3 text-right">{inr(r.total as number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Panel>
      </div>
    </div>
  );
}

function rest(top: string[], rows: Record<string, number | string>[]): string[] {
  return rows.some((r) => "Other categories" in r) ? [...top, "Other categories"] : top;
}
