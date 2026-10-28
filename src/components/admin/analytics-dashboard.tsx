// Owner-only revenue / expense / subscriber trends. Rendered as the
// "Trends" tab of /admin/reports (the old /admin/analytics redirects there).
// The page title + tab bar come from admin.reports.tsx — no title here.
import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { callAdminApi } from "@/lib/admin-api";
import { todayIST } from "@/lib/offline-subscriptions-logic";
import {
  addMonthsYm,
  comparePeriods,
  topMovers,
  moverSentence,
  type CategoryLite,
  type MonthPnl,
  type PnlBasis,
} from "@/lib/finance-logic";
import {
  CHART_COLORS,
  TONE_CLS,
  inr,
  inrAxis,
  pctText,
  toneOf,
  ymLabel,
  ymShort,
} from "@/lib/finance-ui";
import { EmptyState, Notice, Panel, StatCard, type Tone } from "@/components/admin/admin-ui";

interface PnlResponse {
  categories: CategoryLite[];
  pnl: { months: MonthPnl[]; total: MonthPnl };
}
interface TrendResponse {
  activeNow: number;
  months: { ym: string; paying: number; newSubs: number; cancelled: number; lapsed: number }[];
}

const rupeeTip = (v: unknown) => inr(Math.round(Number(v) * 100));
const intTip = (v: unknown) => String(v);
const PREV = "#a8a29e"; // neutral grey (stone-400) for "previous month"; "this month" uses the accent

// Chart text sizing shared by every chart in this tab.
const TICK = { fontSize: 11, fill: "#78716c" };
const LEGEND_STYLE = { fontSize: 12 };
const GRID_STROKE = "#e7e5e4";

/** Shorten long category names on the narrow Y-axis of the phone layout. */
const shortLabel = (max: number) => (v: string) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);

// finance-ui tone → shared StatCard status tone.
const STATUS_TONE: Record<ReturnType<typeof toneOf>, Tone> = {
  good: "good",
  bad: "bad",
  flat: "neutral",
};

function Card({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Panel title={title} description={note}>
      <div className="h-64 sm:h-72">{children}</div>
    </Panel>
  );
}

// One plain sentence per number, so the owner never has to decode a chart first.
function Headline({
  month,
  earned,
  spent,
  profit,
  subs,
}: {
  month: string;
  earned: [number, number];
  spent: [number, number];
  profit: [number, number];
  subs: [number, number];
}) {
  const change = (cur: number, prev: number, goodWhen: "up" | "down", money: boolean) => {
    const d = cur - prev;
    if (d === 0) return { text: "pichle mahine jitna hi", cls: TONE_CLS.flat };
    const amt = money ? inr(Math.abs(d)) : String(Math.abs(d));
    const word = d > 0 ? "zyada" : "kam";
    return { text: `pichle mahine se ${amt} ${word}`, cls: TONE_CLS[toneOf(d, goodWhen)] };
  };
  const lines = [
    { k: "Kamai (revenue)", v: inr(earned[0]), c: change(earned[0], earned[1], "up", true) },
    { k: "Kharcha (expenses)", v: inr(spent[0]), c: change(spent[0], spent[1], "down", true) },
    {
      k: profit[0] >= 0 ? "Bachat (profit)" : "Ghata (loss)",
      v: inr(Math.abs(profit[0])),
      c: change(profit[0], profit[1], "up", true),
    },
    { k: "Paying subscribers", v: String(subs[0]), c: change(subs[0], subs[1], "up", false) },
  ];
  return (
    <Panel
      title={`${ymLabel(month)} ka saar`}
      description="Green = achhi khabar, red = dhyaan dene wali baat. Kharcha kam hona green hai."
    >
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
        {lines.map((l) => (
          <li key={l.k} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-stone-500">{l.k}:</span>
            <b className="font-semibold text-stone-900 tabular-nums">{l.v}</b>
            <span className={`text-xs font-medium ${l.c.cls}`}>({l.c.text})</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Compare({
  label,
  cur,
  prev,
  goodWhen,
  money = true,
}: {
  label: string;
  cur: number;
  prev: number;
  goodWhen: "up" | "down";
  money?: boolean;
}) {
  const delta = cur - prev;
  const tone = toneOf(delta, goodWhen);
  const pct = prev === 0 ? null : (delta / Math.abs(prev)) * 100;
  const f = (n: number) => (money ? inr(n) : String(n));
  return (
    <StatCard
      label={label}
      value={<span className="text-xl sm:text-2xl break-words">{f(cur)}</span>}
      status={{
        tone: STATUS_TONE[tone],
        text:
          delta === 0
            ? "No change"
            : `${delta > 0 ? "▲" : "▼"} ${f(Math.abs(delta))} (${pctText(pct)})`,
      }}
      hint={`Previous month: ${f(prev)}`}
    />
  );
}

export function AnalyticsDashboard() {
  const isMobile = useIsMobile();
  const nowYm = todayIST(new Date()).slice(0, 7);
  const [ym, setYm] = useState(nowYm);
  const [basis, setBasis] = useState<PnlBasis>("cash");
  const [pnl, setPnl] = useState<PnlResponse | null>(null);
  const [subs, setSubs] = useState<TrendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    Promise.all([
      callAdminApi<PnlResponse>("/api/admin/finance/pnl", {
        fromYm: addMonthsYm(ym, -11),
        toYm: ym,
        basis,
      }),
      callAdminApi<TrendResponse>("/api/admin/subscribers/trend", { months: 12, toYm: ym }),
    ])
      .then(([p, s]) => {
        if (!live) return;
        setPnl(p);
        setSubs(s);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Analytics load nahi hui"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [ym, basis]);

  const view = useMemo(() => {
    if (!pnl || !subs) return null;
    const months = pnl.pnl.months;
    const cur = months[months.length - 1];
    const prev = months[months.length - 2];
    const sCur = subs.months[subs.months.length - 1];
    const sPrev = subs.months[subs.months.length - 2];
    const expenses = (m: MonthPnl) => m.directCosts + m.operatingExpenses;
    const rows = comparePeriods(prev, cur, pnl.categories);
    const catName = new Map(pnl.categories.map((c) => [c.id, c]));
    const ids = new Set([...Object.keys(cur.byCategory), ...Object.keys(prev.byCategory)]);
    const byCategory = [...ids]
      .map((id) => ({
        id,
        name: catName.get(id)?.name ?? "Other",
        type: catName.get(id)?.entry_type,
        Previous: (prev.byCategory[id] ?? 0) / 100,
        "This month": (cur.byCategory[id] ?? 0) / 100,
      }))
      .filter((x) => x.type === "expense" && (x.Previous > 0 || x["This month"] > 0))
      .sort((a, b) => Math.max(b.Previous, b["This month"]) - Math.max(a.Previous, a["This month"]))
      .slice(0, 8);
    return {
      cur,
      prev,
      sCur,
      sPrev,
      expenses,
      movers: topMovers(rows, 3).map((r) => moverSentence(r, inr)),
      overall: [
        {
          name: "Net revenue",
          Previous: prev.netRevenue / 100,
          "This month": cur.netRevenue / 100,
        },
        {
          name: "Direct costs",
          Previous: prev.directCosts / 100,
          "This month": cur.directCosts / 100,
        },
        {
          name: "Operating",
          Previous: prev.operatingExpenses / 100,
          "This month": cur.operatingExpenses / 100,
        },
        {
          name: "Other income",
          Previous: prev.otherIncome / 100,
          "This month": cur.otherIncome / 100,
        },
        { name: "Net profit", Previous: prev.netProfit / 100, "This month": cur.netProfit / 100 },
      ],
      byCategory,
      trend: months.map((m) => ({
        name: ymShort(m.month),
        "Net revenue": m.netRevenue / 100,
        Expenses: expenses(m) / 100,
        "Net profit": m.netProfit / 100,
      })),
      subsTrend: subs.months.map((m) => ({
        name: ymShort(m.ym),
        Paying: m.paying,
        New: m.newSubs,
        Cancelled: m.cancelled,
      })),
    };
  }, [pnl, subs]);

  const yW = isMobile ? 46 : 58;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="space-y-2">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-stone-500">
            {ymLabel(ym)} against {ymLabel(addMonthsYm(ym, -1))} — revenue, expenses, profit and
            subscribers.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="month"
              max={nowYm}
              value={ym}
              onChange={(e) => e.target.value && setYm(e.target.value)}
              className="h-9 w-full sm:w-40 text-sm"
              aria-label="Month"
            />
            <div
              className="inline-flex max-w-full gap-1 rounded-lg bg-stone-100 p-1"
              role="group"
              aria-label="Basis"
            >
              {(["cash", "normalised"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  aria-pressed={basis === b}
                  onClick={() => setBasis(b)}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${basis === b ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                >
                  {b === "cash" ? "Jab paisa aaya" : "Mahine ke hisaab se"}
                </button>
              ))}
            </div>
          </div>
        </div>
        {ym === nowYm && (
          <p className="text-xs text-stone-400">
            The current month is still in progress, so its figures will grow until month-end.
          </p>
        )}
      </div>

      {error && (
        <Notice tone="bad" icon={AlertCircle}>
          {error}
        </Notice>
      )}
      {!view && !error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 bg-stone-100 rounded-xl" />
          ))}
        </div>
      )}

      {view && (
        <div className={loading ? "opacity-60 transition-opacity space-y-6" : "space-y-6"}>
          <Headline
            month={ym}
            earned={[view.cur.netRevenue, view.prev.netRevenue]}
            spent={[view.expenses(view.cur), view.expenses(view.prev)]}
            profit={[view.cur.netProfit, view.prev.netProfit]}
            subs={[view.sCur.paying, view.sPrev.paying]}
          />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-stone-900">Month on month</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <Compare
                label="Net revenue"
                cur={view.cur.netRevenue}
                prev={view.prev.netRevenue}
                goodWhen="up"
              />
              <Compare
                label="Total expenses"
                cur={view.expenses(view.cur)}
                prev={view.expenses(view.prev)}
                goodWhen="down"
              />
              <Compare
                label="Net profit"
                cur={view.cur.netProfit}
                prev={view.prev.netProfit}
                goodWhen="up"
              />
              <Compare
                label="Paying subscribers"
                cur={view.sCur.paying}
                prev={view.sPrev.paying}
                goodWhen="up"
                money={false}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-stone-900">Subscriber movement</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <Compare
                label="New subscribers"
                cur={view.sCur.newSubs}
                prev={view.sPrev.newSubs}
                goodWhen="up"
                money={false}
              />
              <Compare
                label="Cancelled"
                cur={view.sCur.cancelled}
                prev={view.sPrev.cancelled}
                goodWhen="down"
                money={false}
              />
              <Compare
                label="Lapsed (halted)"
                cur={view.sCur.lapsed}
                prev={view.sPrev.lapsed}
                goodWhen="down"
                money={false}
              />
              <StatCard
                label="Active right now"
                value={<span className="text-xl sm:text-2xl">{subs?.activeNow ?? "—"}</span>}
                hint="live status, not a month figure"
              />
            </div>
          </section>

          {view.movers.length > 0 && (
            <Panel title="Biggest changes vs previous month">
              <ul className="space-y-1.5 text-sm text-stone-700 list-disc pl-5">
                {view.movers.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </Panel>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
            <Card
              title="Is mahine vs pichla mahina"
              note="Kaise padhein: grey = pichla mahina, blue = is mahine. Jo bar upar hai wo zyada hai."
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={view.overall} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
                  <XAxis
                    dataKey="name"
                    tick={TICK}
                    interval={0}
                    tickFormatter={isMobile ? shortLabel(8) : undefined}
                  />
                  <YAxis tickFormatter={inrAxis} tick={TICK} width={yW} />
                  <Tooltip formatter={rupeeTip} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  <Bar dataKey="Previous" fill={PREV} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="This month" fill={CHART_COLORS.revenue} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card
              title="Kharcha kahan gaya"
              note="Kaise padhein: sabse bade 8 kharche. Grey = pichla mahina, orange = is mahine."
            >
              {view.byCategory.length === 0 ? (
                <EmptyState title="Is period mein koi expense nahi." className="h-full py-0" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={view.byCategory}
                    layout="vertical"
                    margin={{ top: 4, right: isMobile ? 8 : 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_STROKE} />
                    <XAxis type="number" tickFormatter={inrAxis} tick={TICK} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={isMobile ? 84 : 140}
                      tick={TICK}
                      tickFormatter={shortLabel(isMobile ? 12 : 22)}
                    />
                    <Tooltip formatter={rupeeTip} />
                    <Legend wrapperStyle={LEGEND_STYLE} />
                    <Bar dataKey="Previous" fill={PREV} radius={[0, 3, 3, 0]} />
                    <Bar dataKey="This month" fill={CHART_COLORS.expenses} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card
              title="Pichle 12 mahine: kamai, kharcha, bachat"
              note="Kaise padhein: blue bar = kamai, orange bar = kharcha. Hari line upar ho to bachat, neeche ho to ghata."
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={view.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis tickFormatter={inrAxis} tick={TICK} width={yW} />
                  <Tooltip formatter={rupeeTip} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  <Bar dataKey="Net revenue" fill={CHART_COLORS.revenue} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Expenses" fill={CHART_COLORS.expenses} radius={[3, 3, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="Net profit"
                    stroke={CHART_COLORS.profit}
                    strokeWidth={2.5}
                    dot={{ r: isMobile ? 2 : 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <Card
              title="Pichle 12 mahine: subscribers"
              note="Kaise padhein: hari line = kitne log pay kar rahe hain. Blue bar = naye jude, orange bar = chhod gaye."
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={view.subsTrend}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis allowDecimals={false} tick={TICK} width={isMobile ? 32 : 40} />
                  <Tooltip formatter={intTip} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  <Bar dataKey="New" fill={CHART_COLORS.revenue} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Cancelled" fill={CHART_COLORS.expenses} radius={[3, 3, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="Paying"
                    stroke={CHART_COLORS.profit}
                    strokeWidth={2.5}
                    dot={{ r: isMobile ? 2 : 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
