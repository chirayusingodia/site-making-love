import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { callAdminApi } from "@/lib/admin-api";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatCard,
  TableScroll,
} from "@/components/admin/admin-ui";
import type { TelecallerReview, WeekStats } from "@/lib/telecaller-review-logic";

export const Route = createFileRoute("/admin/telecaller-review")({
  // OWNER-ONLY: earnings data.
  beforeLoad: async () => {
    const { fetchMyRole } = await import("@/lib/admin-api");
    const role = await fetchMyRole();
    if (role !== "owner")
      throw redirect({ to: "/admin/overview", search: { notice: "owner-required" } });
  },
  component: TelecallerReviewPage,
});

const inr = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function delta(now: number, prev: number): { tone: "good" | "bad" | "neutral"; text: string } {
  const d = now - prev;
  if (d === 0) return { tone: "neutral", text: "pichle 7 din ke barabar" };
  return {
    tone: d > 0 ? "good" : "bad",
    text: `${d > 0 ? "+" : "−"}${Math.abs(d)} vs pichle 7 din`,
  };
}

/** Tiny conversions-per-week bar strip. */
function Trend({ weeks }: { weeks: WeekStats[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.conversions));
  return (
    <div className="flex items-end gap-0.5 h-6" aria-label="weekly conversions trend">
      {weeks.map((w, i) => (
        <div
          key={i}
          title={`${w.conversions} conversions`}
          className="w-1.5 rounded-sm bg-orange-400/80"
          style={{ height: `${Math.max(8, (w.conversions / max) * 100)}%`, opacity: w.conversions ? 1 : 0.25 }}
        />
      ))}
    </div>
  );
}

type WeeksOpt = "4" | "8" | "12" | "26";

function TelecallerReviewPage() {
  const [weeks, setWeeks] = useState<WeeksOpt>("8");
  const [data, setData] = useState<TelecallerReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // index into data.weeks, or "all" for the whole period
  const [selected, setSelected] = useState<number | "all" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      const r = await callAdminApi<TelecallerReview>("/api/admin/commissions/telecaller-review", {
        weeks: Number(weeks),
      });
      setData(r);
      setSelected(r.weeks.length - 1); // current week
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review load nahi hua");
    }
  }, [weeks]);

  useEffect(() => {
    load();
  }, [load]);

  const cur = data?.weeks[data.weeks.length - 1];
  const rate =
    data && data.totals.connected > 0
      ? Math.round((data.totals.conversions / data.totals.connected) * 1000) / 10
      : null;

  const statOf = (p: TelecallerReview["people"][number]): WeekStats => {
    if (selected === "all" || selected === null) {
      return {
        conversions: p.totalConversions,
        trailPayments: p.weeks.reduce((s, w) => s + w.trailPayments, 0),
        earnedPaise: p.totalEarnedPaise,
        calls: p.totalCalls,
        connected: p.totalConnected,
      };
    }
    return p.weeks[selected];
  };

  const board = data
    ? [...data.people].sort(
        (a, b) =>
          statOf(b).earnedPaise - statOf(a).earnedPaise ||
          statOf(b).conversions - statOf(a).conversions,
      )
    : [];
  const selLabel =
    !data || selected === null
      ? ""
      : selected === "all"
        ? `Poore ${weeks} hafte`
        : `${fmtDay(data.weeks[selected].weekStart)} – ${fmtDay(data.weeks[selected].weekEnd)}${
            data.weeks[selected].current ? " (is hafte)" : ""
          }`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Telecaller review"
        description="Kaun kitna convert kar raha hai, kitna kama raha hai aur hafte-dar-hafte trend. Conversion = ₹80 wali first deal; earnings = ₹80 + ₹20 trail (clawback minus)."
        actions={
          <SegmentedTabs<WeeksOpt>
            value={weeks}
            onChange={setWeeks}
            items={[
              { value: "4", label: "4 hafte" },
              { value: "8", label: "8 hafte" },
              { value: "12", label: "12 hafte" },
              { value: "26", label: "26 hafte" },
            ]}
          />
        }
      />

      {error && (
        <Notice tone="bad" icon={AlertTriangle}>
          <span className="break-words">{error}</span>
        </Notice>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Pichle 7 din ke conversions"
          value={data ? data.team.last7Conversions : "—"}
          loading={!data}
          status={data ? delta(data.team.last7Conversions, data.team.prev7Conversions) : undefined}
        />
        <StatCard
          label="Pichle 7 din ki kamai"
          value={data ? inr(data.team.last7EarnedPaise) : "—"}
          loading={!data}
          hint={data ? `pehle 7 din: ${inr(data.team.prev7EarnedPaise)}` : undefined}
        />
        <StatCard
          label={`Is hafte (${cur ? `${fmtDay(cur.weekStart)} se` : "—"})`}
          value={cur ? `${cur.conversions} conv · ${inr(cur.earnedPaise)}` : "—"}
          loading={!data}
          hint="Somvaar se aaj tak"
        />
        <StatCard
          label={`Poore ${weeks} hafte`}
          value={data ? `${data.totals.conversions} conv · ${inr(data.totals.earnedPaise)}` : "—"}
          loading={!data}
          hint={
            rate !== null
              ? `${rate} conversion / 100 connected calls`
              : data
                ? "Connected call data nahi"
                : undefined
          }
        />
      </div>

      <Panel
        title="Hafte-dar-hafte (team)"
        description="Row dabaiye — neeche leaderboard usi hafte ka dikhega."
        flush
      >
        {!data ? (
          <div className="p-4 sm:p-5">
            <Skeleton className="h-28 w-full" />
          </div>
        ) : (
          <TableScroll>
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-stone-500 border-b border-stone-100">
                  <th className="font-medium px-4 sm:px-5 py-2.5">Hafta (Mon–Sun)</th>
                  <th className="font-medium px-3 py-2.5 text-right">Conversions</th>
                  <th className="font-medium px-3 py-2.5 text-right">Trail payments</th>
                  <th className="font-medium px-3 py-2.5 text-right">Kamai</th>
                  <th className="font-medium px-3 py-2.5 text-right">Calls</th>
                  <th className="font-medium px-4 sm:px-5 py-2.5 text-right">Connected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {[...data.weeks]
                  .map((w, i) => ({ w, i }))
                  .reverse()
                  .map(({ w, i }) => (
                    <tr
                      key={w.weekStart}
                      onClick={() => setSelected(i)}
                      className={`cursor-pointer hover:bg-stone-50 ${selected === i ? "bg-orange-50/60" : ""}`}
                    >
                      <td className="px-4 sm:px-5 py-2.5 text-stone-800">
                        {fmtDay(w.weekStart)} – {fmtDay(w.weekEnd)}
                        {w.current && <span className="ml-2 text-[11px] text-orange-700">is hafte</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{w.conversions}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{w.trailPayments}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{inr(w.earnedPaise)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-stone-600">{w.calls}</td>
                      <td className="px-4 sm:px-5 py-2.5 text-right tabular-nums text-stone-600">{w.connected}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>

      <Panel
        title={`Telecaller leaderboard${selLabel ? ` — ${selLabel}` : ""}`}
        description="Kamai ke hisaab se. Trend bars = har hafte ke conversions (purana → naya)."
        actions={
          data && (
            <button
              type="button"
              className="text-xs text-orange-700 hover:underline"
              onClick={() => setSelected(selected === "all" ? data.weeks.length - 1 : "all")}
            >
              {selected === "all" ? "Is hafte par wapas" : `Poore ${weeks} hafte dekhein`}
            </button>
          )
        }
        flush
      >
        {!data ? (
          <div className="p-4 sm:p-5">
            <Skeleton className="h-28 w-full" />
          </div>
        ) : board.length === 0 ? (
          <EmptyState title="Koi telecaller nahi mila." />
        ) : (
          <TableScroll>
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="text-left text-xs text-stone-500 border-b border-stone-100">
                  <th className="font-medium px-4 sm:px-5 py-2.5">Telecaller</th>
                  <th className="font-medium px-3 py-2.5 text-right">Conversions</th>
                  <th className="font-medium px-3 py-2.5 text-right">Kamai</th>
                  <th className="font-medium px-3 py-2.5 text-right">Calls</th>
                  <th className="font-medium px-3 py-2.5 text-right">Connected</th>
                  <th className="font-medium px-3 py-2.5 text-right">Conv / 100 connected</th>
                  <th className="font-medium px-3 py-2.5 text-right">7 din vs pehle 7</th>
                  <th className="font-medium px-4 sm:px-5 py-2.5">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {board.map((p) => {
                  const s = statOf(p);
                  const per100 =
                    s.connected > 0 ? Math.round((s.conversions / s.connected) * 1000) / 10 : null;
                  const d = p.last7Conversions - p.prev7Conversions;
                  return (
                    <tr key={p.profileId}>
                      <td className="px-4 sm:px-5 py-2.5">
                        <div className="font-medium text-stone-900">{p.name}</div>
                        {p.phone && <div className="text-xs text-stone-400">{p.phone}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{s.conversions}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{inr(s.earnedPaise)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-stone-600">{s.calls}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-stone-600">{s.connected}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-stone-600">
                        {per100 === null ? "—" : per100}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                        <span className="text-stone-700">{p.last7Conversions}</span>
                        <span className="text-stone-400"> vs {p.prev7Conversions} </span>
                        {d !== 0 && (
                          <span className={d > 0 ? "text-emerald-700" : "text-rose-700"}>
                            ({d > 0 ? "+" : "−"}{Math.abs(d)})
                          </span>
                        )}
                      </td>
                      <td className="px-4 sm:px-5 py-2.5">
                        <Trend weeks={p.weeks} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>
    </div>
  );
}
