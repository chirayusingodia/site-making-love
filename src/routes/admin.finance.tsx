import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Download, Info, Loader2, RefreshCw } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { callAdminApi } from "@/lib/admin-api";
import { todayIST } from "@/lib/offline-subscriptions-logic";
import {
  monthRange,
  presetRange,
  type CategoryLite,
  type CompareRow,
  type MonthPnl,
  type PnlBasis,
  type PresetKey,
} from "@/lib/finance-logic";
import {
  CHART_COLORS,
  TONE_CLS,
  inr,
  inrAxis,
  marginText,
  pctText,
  previousPeriod,
  toneOf,
  ymLabel,
  ymShort,
} from "@/lib/finance-ui";
import { FinanceLedger, type FinanceCategory } from "@/components/admin/finance-ledger";
import { FinanceCategories } from "@/components/admin/finance-categories";
import {
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatCard,
  TableScroll,
} from "@/components/admin/admin-ui";

export const Route = createFileRoute("/admin/finance")({
  // OWNER-ONLY (every figure here is ₹ — same gate discipline as /admin/commissions).
  beforeLoad: async () => {
    const { fetchMyRole } = await import("@/lib/admin-api");
    const role = await fetchMyRole();
    if (role !== "owner")
      throw redirect({ to: "/admin/overview", search: { notice: "owner-required" } });
  },
  component: FinancePage,
});

// ─── Types ───────────────────────────────────────────────────

interface Range {
  fromYm: string;
  toYm: string;
}

interface PnlResponse {
  basis: PnlBasis;
  fromYm: string;
  toYm: string;
  categories: CategoryLite[];
  pnl: { months: MonthPnl[]; total: MonthPnl };
  compare: {
    fromYm: string;
    toYm: string;
    pnl: { months: MonthPnl[]; total: MonthPnl };
    rows: CompareRow[];
    movers: { key: string; label: string; sentence: string }[];
  } | null;
}

type Preset = PresetKey | "custom";
type FinanceTab = "overview" | "compare" | "ledger" | "categories";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_3", label: "Last 3 months" },
  { key: "last_6", label: "Last 6 months" },
  { key: "last_12", label: "Last 12 months" },
  { key: "this_fy", label: "This FY (Apr–Mar)" },
  { key: "last_fy", label: "Last FY" },
  { key: "custom", label: "Custom range" },
];

const selectCls =
  "h-9 w-full sm:w-auto rounded-md border border-stone-300 bg-white px-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-orange-600/30";

const thCls = "py-2.5 px-3 text-xs font-medium text-stone-500 whitespace-nowrap";

// Chart text sizing shared by every chart on this page.
const TICK = { fontSize: 11, fill: "#78716c" };
const LEGEND_STYLE = { fontSize: 12 };
const GRID_STROKE = "#e7e5e4";

/** Shorten long category names on the narrow Y-axis of the phone layout. */
const shortLabel = (max: number) => (v: string) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);

// ─── Small pieces ────────────────────────────────────────────

function Delta({
  cur,
  prev,
  goodWhen,
}: {
  cur: number;
  prev: number | undefined;
  goodWhen: "up" | "down";
}) {
  if (prev === undefined) return null;
  const delta = cur - prev;
  const tone = toneOf(delta, goodWhen);
  const pct = prev === 0 ? null : (delta / Math.abs(prev)) * 100;
  return (
    <span className={`block text-xs font-medium ${TONE_CLS[tone]}`}>
      {delta === 0
        ? "No change"
        : `${delta > 0 ? "▲" : "▼"} ${pct === null ? "new" : `${Math.abs(Math.round(pct))}%`}`}
      <span className="font-normal text-stone-400"> vs prev period</span>
    </span>
  );
}

function Kpi({
  label,
  value,
  sub,
  delta,
  title,
  valueCls,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: React.ReactNode;
  title?: string;
  valueCls?: string;
}) {
  return (
    <div title={title} className="h-full">
      <StatCard
        label={label}
        // Rupee figures can run to 9+ characters; a step smaller than the
        // default tile size keeps them inside a half-width phone tile.
        value={<span className={`text-xl sm:text-2xl break-words ${valueCls ?? ""}`}>{value}</span>}
        hint={
          sub || delta ? (
            <>
              {sub && <span className="block">{sub}</span>}
              {delta}
            </>
          ) : undefined
        }
      />
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel title={title}>
      <div className="h-60 sm:h-64">{children}</div>
    </Panel>
  );
}

function PeriodPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Range;
  onChange: (r: Range) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <span className="text-[13px] font-medium text-stone-600 sm:w-16 shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <Input
          type="month"
          aria-label={`${label} from`}
          value={value.fromYm}
          onChange={(e) =>
            e.target.value &&
            onChange({
              fromYm: e.target.value,
              toYm: e.target.value > value.toYm ? e.target.value : value.toYm,
            })
          }
          className="h-9 text-sm min-w-0 flex-1 sm:w-40 sm:flex-none"
        />
        <span className="text-xs text-stone-400 shrink-0">to</span>
        <Input
          type="month"
          aria-label={`${label} to`}
          value={value.toYm}
          onChange={(e) =>
            e.target.value &&
            onChange({
              fromYm: e.target.value < value.fromYm ? e.target.value : value.fromYm,
              toYm: e.target.value,
            })
          }
          className="h-9 text-sm min-w-0 flex-1 sm:w-40 sm:flex-none"
        />
      </div>
    </div>
  );
}

// ─── P&L statement table ─────────────────────────────────────

function PnlTable({ pnl, categories }: { pnl: PnlResponse["pnl"]; categories: CategoryLite[] }) {
  const cols = [...pnl.months, pnl.total];
  type R = {
    label: string;
    pick: (m: MonthPnl) => number;
    bold?: boolean;
    indent?: boolean;
    neg?: boolean;
  };
  const catRows = (group: CategoryLite["pnl_group"]): R[] =>
    categories
      .filter((c) => c.pnl_group === group && cols.some((m) => (m.byCategory[c.id] ?? 0) !== 0))
      .map((c) => ({
        label: c.name,
        pick: (m: MonthPnl) => m.byCategory[c.id] ?? 0,
        indent: true,
      }));
  const rows: R[] = [
    { label: "Autopay revenue", pick: (m) => m.revenueAutopay, indent: true },
    { label: "QR / offline revenue", pick: (m) => m.revenueQr, indent: true },
    { label: "Refunds", pick: (m) => -m.refunds, indent: true },
    { label: "Net revenue", pick: (m) => m.netRevenue, bold: true },
    ...catRows("direct"),
    { label: "Direct costs", pick: (m) => m.directCosts, bold: true },
    { label: "Gross profit", pick: (m) => m.grossProfit, bold: true },
    ...catRows("operating"),
    { label: "Operating expenses", pick: (m) => m.operatingExpenses, bold: true },
    ...catRows("other_income"),
    { label: "Other income", pick: (m) => m.otherIncome, bold: true },
    { label: "Net profit", pick: (m) => m.netProfit, bold: true },
  ];
  const stickyCls =
    "sticky left-0 z-[1] min-w-36 sm:min-w-44 max-w-[11rem] sm:max-w-none border-r border-stone-100";
  return (
    <TableScroll>
      <table className="admin-table-fixed w-full text-[13px] tabular-nums">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50">
            <th className={`${thCls} ${stickyCls} text-left bg-stone-50`}>Line</th>
            {pnl.months.map((m) => (
              <th key={m.month} className={`${thCls} text-right`}>
                {ymShort(m.month)}
              </th>
            ))}
            <th className={`${thCls} text-right text-stone-900`}>Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((r) => (
            <tr key={r.label} className={r.bold ? "bg-stone-50 font-semibold" : ""}>
              <td
                className={`py-2 px-3 ${stickyCls} ${r.bold ? "bg-stone-50 text-stone-900" : "bg-white"} ${r.indent ? "pl-6 text-stone-600" : "text-stone-900"}`}
              >
                <span className="block truncate sm:whitespace-normal">{r.label}</span>
              </td>
              {cols.map((m, i) => {
                const v = r.pick(m);
                return (
                  <td
                    key={m.month}
                    className={`py-2 px-3 text-right whitespace-nowrap ${i === cols.length - 1 ? "font-semibold" : ""} ${v < 0 ? "text-rose-700" : "text-stone-800"}`}
                  >
                    {v === 0 ? "—" : inr(v)}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-t border-stone-200 text-stone-600">
            <td className={`py-2 px-3 bg-white ${stickyCls}`}>Gross margin</td>
            {cols.map((m) => (
              <td key={m.month} className="py-2 px-3 text-right whitespace-nowrap">
                {marginText(m.grossMarginPct)}
              </td>
            ))}
          </tr>
          <tr className="text-stone-600">
            <td className={`py-2 px-3 bg-white ${stickyCls}`}>Net margin</td>
            {cols.map((m) => (
              <td key={m.month} className="py-2 px-3 text-right whitespace-nowrap">
                {marginText(m.netMarginPct)}
              </td>
            ))}
          </tr>
          <tr className="text-stone-600">
            <td className={`py-2 px-3 bg-white ${stickyCls}`}>Paying subscribers</td>
            {cols.map((m) => (
              <td key={m.month} className="py-2 px-3 text-right whitespace-nowrap">
                {m.payingSubscribers}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </TableScroll>
  );
}

// ─── Page ────────────────────────────────────────────────────

function FinancePage() {
  const today = todayIST(new Date());
  const [preset, setPreset] = useState<Preset>("last_6");
  const [range, setRange] = useState<Range>(() => presetRange("last_6", today));
  const [basis, setBasis] = useState<PnlBasis>("cash");
  const [showBasisInfo, setShowBasisInfo] = useState(false);
  const [tab, setTab] = useState<FinanceTab>("overview");

  const [data, setData] = useState<PnlResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const reqId = useRef(0);

  const [cats, setCats] = useState<FinanceCategory[]>([]);
  const [catsLoading, setCatsLoading] = useState(true);

  const monthCount = monthRange(range.fromYm, range.toYm).length;

  const loadPnl = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const r = await callAdminApi<PnlResponse>("/api/admin/finance/pnl", {
        ...range,
        basis,
        compare: previousPeriod(range.fromYm, monthCount),
      });
      if (id === reqId.current) setData(r);
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : "P&L load nahi hua");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [range, basis, monthCount]);

  const loadCats = useCallback(async () => {
    setCatsLoading(true);
    try {
      const r = await callAdminApi<{ categories: FinanceCategory[] }>(
        "/api/admin/finance/categories",
        { action: "list" },
      );
      setCats(r.categories);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Categories load nahi hui");
    } finally {
      setCatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPnl();
  }, [loadPnl]);
  useEffect(() => {
    void loadCats();
  }, [loadCats]);

  const changed = () => {
    void loadPnl();
    void loadCats();
  };

  function pickPreset(key: Preset) {
    setPreset(key);
    if (key !== "custom") setRange(presetRange(key, today));
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      const r = await callAdminApi<{ filename: string; base64: string }>(
        "/api/admin/finance/export",
        { ...range, basis },
      );
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export fail ho gaya");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance & P&L"
        description="Expenses, other income aur profit — sirf owner ko dikhta hai."
        meta={`${ymLabel(range.fromYm)}${range.fromYm !== range.toYm ? ` – ${ymLabel(range.toYm)}` : ""}`}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void loadPnl()}
              disabled={loading}
              className="h-9 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => void exportXlsx()}
              disabled={exporting}
              className="h-9 gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
            >
              {exporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}{" "}
              Export .xlsx
            </Button>
          </>
        }
      />

      {/* Period + basis toolbar */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <select
            className={selectCls}
            value={preset}
            onChange={(e) => pickPreset(e.target.value as Preset)}
            aria-label="Period preset"
          >
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          {preset === "custom" && (
            <div className="flex items-center gap-2 min-w-0">
              <Input
                type="month"
                aria-label="From month"
                value={range.fromYm}
                onChange={(e) =>
                  e.target.value &&
                  setRange((r) => ({
                    fromYm: e.target.value,
                    toYm: e.target.value > r.toYm ? e.target.value : r.toYm,
                  }))
                }
                className="h-9 text-sm min-w-0 flex-1 sm:w-40 sm:flex-none"
              />
              <span className="text-xs text-stone-400 shrink-0">to</span>
              <Input
                type="month"
                aria-label="To month"
                value={range.toYm}
                onChange={(e) =>
                  e.target.value &&
                  setRange((r) => ({
                    fromYm: e.target.value < r.fromYm ? e.target.value : r.fromYm,
                    toYm: e.target.value,
                  }))
                }
                className="h-9 text-sm min-w-0 flex-1 sm:w-40 sm:flex-none"
              />
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <div
              className="inline-flex gap-1 rounded-lg bg-stone-100 p-1"
              role="group"
              aria-label="Basis"
            >
              {(["cash", "normalised"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBasis(b)}
                  aria-pressed={basis === b}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${basis === b ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                >
                  {b === "cash" ? "Cash" : "Normalised"}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label="What do Cash and Normalised mean?"
              aria-expanded={showBasisInfo}
              onClick={() => setShowBasisInfo((s) => !s)}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-stone-100 ${showBasisInfo ? "text-orange-700" : "text-stone-400"}`}
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>
        {showBasisInfo && (
          <Notice tone="info" icon={Info}>
            <div className="space-y-1.5 text-[13px]">
              <p>
                <b>Cash</b> — paisa jis mahine mein aaya/gaya, usi mahine mein. Yearly plan ya
                multi-month QR prepayment poora ek mahine mein dikhta hai.
              </p>
              <p>
                <b>Normalised</b> — yearly plans aur multi-month QR prepayments un mahino mein baant
                diye jaate hain jin ke liye payment hui; &quot;spread over N months&quot; wale
                expenses bhi. Mahine-ba-mahine tulna ke liye behtar.
              </p>
              <p>
                <b>Collected (incl. later-refunded)</b> — revenue mein wo payments bhi hain jo baad
                mein refund hui; refunds apni alag line mein, refund ke mahine mein. Isliye yeh
                Reports ke &quot;gross (captured)&quot; se alag ho sakta hai.
              </p>
            </div>
          </Notice>
        )}
      </div>

      {error && (
        <Notice tone="bad" icon={AlertCircle}>
          {error}
        </Notice>
      )}

      <div className="space-y-4">
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "overview", label: "Overview" },
            { value: "compare", label: "Compare" },
            { value: "ledger", label: "Ledger" },
            { value: "categories", label: "Categories" },
          ]}
        />

        {tab === "overview" && <Overview data={data} loading={loading} />}
        {tab === "compare" && <ComparePanel basis={basis} today={today} />}
        {tab === "ledger" && (
          <FinanceLedger
            fromYm={range.fromYm}
            toYm={range.toYm}
            categories={cats}
            onChanged={changed}
          />
        )}
        {tab === "categories" && (
          <FinanceCategories categories={cats} loading={catsLoading} onChanged={changed} />
        )}
      </div>
    </div>
  );
}

// ─── Overview tab ────────────────────────────────────────────

function Overview({ data, loading }: { data: PnlResponse | null; loading: boolean }) {
  const isMobile = useIsMobile();
  const catName = useMemo(() => new Map((data?.categories ?? []).map((c) => [c.id, c])), [data]);

  if (!data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-28 bg-stone-100 rounded-xl" />
        ))}
      </div>
    );
  }

  const t = data.pnl.total;
  const p = data.compare?.pnl.total;
  const monthly = data.pnl.months.map((m) => ({
    name: ymShort(m.month),
    "Net revenue": Math.round(m.netRevenue) / 100,
    "Total expenses": Math.round(m.directCosts + m.operatingExpenses) / 100,
    "Net profit": Math.round(m.netProfit) / 100,
    Autopay: Math.round(m.revenueAutopay) / 100,
    "QR / offline": Math.round(m.revenueQr) / 100,
  }));
  const byCategory = Object.entries(t.byCategory)
    .map(([id, paise]) => ({ id, paise, cat: catName.get(id) }))
    .filter((x) => x.cat && x.cat.entry_type === "expense" && x.paise > 0)
    .sort((a, b) => b.paise - a.paise)
    .slice(0, 10)
    .map((x) => ({ name: x.cat!.name, Amount: Math.round(x.paise) / 100 }));

  const rupeeTip = (v: unknown) => inr(Math.round(Number(v) * 100));
  const subscribersUnit = t.payingSubscribers === 1 ? "subscriber" : "subscribers";
  const yW = isMobile ? 46 : 58;

  return (
    <div className={loading ? "opacity-60 transition-opacity space-y-6" : "space-y-6"}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi
          label="Net revenue"
          value={inr(t.netRevenue)}
          sub={`Autopay ${inr(t.revenueAutopay)} | QR ${inr(t.revenueQr)}`}
          title="Collected (incl. later-refunded) minus refunds. Other income is shown separately."
          delta={<Delta cur={t.netRevenue} prev={p?.netRevenue} goodWhen="up" />}
        />
        <Kpi
          label="Direct costs"
          value={inr(t.directCosts)}
          sub="Cost of seva"
          delta={<Delta cur={t.directCosts} prev={p?.directCosts} goodWhen="down" />}
        />
        <Kpi
          label="Gross profit"
          value={inr(t.grossProfit)}
          sub={`Margin ${marginText(t.grossMarginPct)}`}
          valueCls={t.grossProfit < 0 ? "text-rose-700" : undefined}
          delta={<Delta cur={t.grossProfit} prev={p?.grossProfit} goodWhen="up" />}
        />
        <Kpi
          label="Operating expenses"
          value={inr(t.operatingExpenses)}
          delta={<Delta cur={t.operatingExpenses} prev={p?.operatingExpenses} goodWhen="down" />}
        />
        <Kpi
          label="Net profit"
          value={inr(t.netProfit)}
          sub={`Margin ${marginText(t.netMarginPct)}${t.otherIncome ? ` · incl. other income ${inr(t.otherIncome)}` : ""}`}
          valueCls={t.netProfit < 0 ? "text-rose-700" : "text-emerald-700"}
          delta={<Delta cur={t.netProfit} prev={p?.netProfit} goodWhen="up" />}
        />
        <Kpi
          label="Paying subscribers"
          value={String(t.payingSubscribers)}
          sub={`distinct ${subscribersUnit} in period`}
          delta={<Delta cur={t.payingSubscribers} prev={p?.payingSubscribers} goodWhen="up" />}
        />
        <Kpi
          label="ARPU / month"
          value={t.arpuPaise === null ? "—" : inr(t.arpuPaise)}
          sub="net revenue ÷ subscriber-months"
          delta={
            t.arpuPaise !== null && p?.arpuPaise != null ? (
              <Delta cur={t.arpuPaise} prev={p.arpuPaise} goodWhen="up" />
            ) : null
          }
        />
        <Kpi
          label="Cost / subscriber / month"
          value={t.costPerSubscriberPaise === null ? "—" : inr(t.costPerSubscriberPaise)}
          sub="all costs ÷ subscriber-months"
          delta={
            t.costPerSubscriberPaise !== null && p?.costPerSubscriberPaise != null ? (
              <Delta
                cur={t.costPerSubscriberPaise}
                prev={p.costPerSubscriberPaise}
                goodWhen="down"
              />
            ) : null
          }
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        <ChartCard title="Monthly: revenue vs expenses, with net profit">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="name" tick={TICK} />
              <YAxis tickFormatter={inrAxis} tick={TICK} width={yW} />
              <Tooltip formatter={rupeeTip} />
              <Legend wrapperStyle={LEGEND_STYLE} />
              <Bar dataKey="Net revenue" fill={CHART_COLORS.revenue} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Total expenses" fill={CHART_COLORS.expenses} radius={[3, 3, 0, 0]} />
              <Line
                type="monotone"
                dataKey="Net profit"
                stroke={CHART_COLORS.profit}
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue per month: Autopay vs QR / offline">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="name" tick={TICK} />
              <YAxis tickFormatter={inrAxis} tick={TICK} width={yW} />
              <Tooltip formatter={rupeeTip} />
              <Legend wrapperStyle={LEGEND_STYLE} />
              <Bar dataKey="Autopay" stackId="rev" fill={CHART_COLORS.autopay} />
              <Bar
                dataKey="QR / offline"
                stackId="rev"
                fill={CHART_COLORS.qr}
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Expenses by category (period total, top 10)">
        {byCategory.length === 0 ? (
          <EmptyState title="Is period mein koi expense nahi." className="h-full py-0" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={byCategory}
              layout="vertical"
              margin={{ top: 4, right: isMobile ? 8 : 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_STROKE} />
              <XAxis type="number" tickFormatter={inrAxis} tick={TICK} />
              <YAxis
                type="category"
                dataKey="name"
                width={isMobile ? 92 : 150}
                tick={TICK}
                tickFormatter={shortLabel(isMobile ? 13 : 24)}
              />
              <Tooltip formatter={rupeeTip} />
              <Bar dataKey="Amount" fill={CHART_COLORS.bar} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <Panel title="P&L statement" description="Month by month, with the period total." flush>
        <PnlTable pnl={data.pnl} categories={data.categories} />
      </Panel>
    </div>
  );
}

// ─── Compare tab ─────────────────────────────────────────────

function ComparePanel({ basis, today }: { basis: PnlBasis; today: string }) {
  const thisMonth = presetRange("this_month", today);
  const [a, setA] = useState<Range>(presetRange("last_month", today)); // base
  const [b, setB] = useState<Range>(thisMonth); // compared
  const [data, setData] = useState<PnlResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    callAdminApi<PnlResponse>("/api/admin/finance/pnl", { ...b, basis, compare: a })
      .then((r) => id === reqId.current && setData(r))
      .catch(
        (e) =>
          id === reqId.current &&
          setError(e instanceof Error ? e.message : "Compare load nahi hua"),
      )
      .finally(() => id === reqId.current && setLoading(false));
  }, [a, b, basis]);

  const [ty, tm] = today.split("-").map(Number);
  const shortcuts: { label: string; apply: () => void }[] = [
    {
      label: "This month vs last month",
      apply: () => {
        setB(presetRange("this_month", today));
        setA(presetRange("last_month", today));
      },
    },
    {
      label: "This FY vs last FY",
      apply: () => {
        setB(presetRange("this_fy", today));
        setA(presetRange("last_fy", today));
      },
    },
    {
      label: "Same month last year",
      apply: () => {
        const cur = `${ty}-${String(tm).padStart(2, "0")}`;
        setB({ fromYm: cur, toYm: cur });
        setA({
          fromYm: `${ty - 1}-${String(tm).padStart(2, "0")}`,
          toYm: `${ty - 1}-${String(tm).padStart(2, "0")}`,
        });
      },
    },
  ];

  const cmp = data?.compare;
  const group: Record<CompareRow["group"], string> = {
    revenue: "Revenue",
    direct: "Direct costs",
    profit: "Profit",
    operating: "Operating",
    other_income: "Other income",
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Panel
        title="Periods"
        description="Δ = B − A. Costs are shown green when they go down."
        bodyClassName="space-y-3"
      >
        <div className="flex flex-wrap gap-2">
          {shortcuts.map((s) => (
            <Button
              key={s.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={s.apply}
              className="h-9 rounded-full text-xs"
            >
              {s.label}
            </Button>
          ))}
        </div>
        <PeriodPicker label="A (base)" value={a} onChange={setA} />
        <PeriodPicker label="B" value={b} onChange={setB} />
      </Panel>

      {error && (
        <Notice tone="bad" icon={AlertCircle}>
          {error}
        </Notice>
      )}
      {!cmp && !error && <Skeleton className="h-64 bg-stone-100 rounded-xl" />}

      {cmp && (
        <div className={loading ? "opacity-60 transition-opacity space-y-4" : "space-y-4"}>
          {cmp.movers.length > 0 && (
            <Panel title="Top movers" description="Arrow reads A → B.">
              <ul className="space-y-1.5 text-sm text-stone-700 list-disc pl-5">
                {cmp.movers.map((m) => (
                  <li key={m.key}>{m.sentence}</li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Line by line" flush>
            <TableScroll>
              <table className="admin-table-fixed w-full min-w-[560px] text-[13px] tabular-nums">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    <th className={`${thCls} text-left`}>Line</th>
                    <th className={`${thCls} text-right`}>
                      A ({ymLabel(a.fromYm)}
                      {a.fromYm !== a.toYm ? `–${ymShort(a.toYm)}` : ""})
                    </th>
                    <th className={`${thCls} text-right`}>
                      B ({ymLabel(b.fromYm)}
                      {b.fromYm !== b.toYm ? `–${ymShort(b.toYm)}` : ""})
                    </th>
                    <th className={`${thCls} text-right`}>Δ</th>
                    <th className={`${thCls} text-right`}>Δ%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {cmp.rows.map((r) => {
                    // rows were computed as a = compare period (A), b = primary (B)
                    const tone = toneOf(r.delta, r.goodWhen);
                    return (
                      <tr key={r.key} className={r.isSubtotal ? "bg-stone-50 font-semibold" : ""}>
                        <td
                          className={`py-2 px-3 ${r.isSubtotal ? "text-stone-900" : "pl-6 text-stone-600"}`}
                        >
                          {r.label}
                          {r.isSubtotal && (
                            <span className="ml-2 text-xs font-normal text-stone-400">
                              {group[r.group]}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap text-stone-800">
                          {r.a === 0 ? "—" : inr(r.a)}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap text-stone-800">
                          {r.b === 0 ? "—" : inr(r.b)}
                        </td>
                        <td
                          className={`py-2 px-3 text-right whitespace-nowrap font-semibold ${TONE_CLS[tone]}`}
                        >
                          {r.delta === 0
                            ? "—"
                            : `${r.delta > 0 ? "▲ +" : "▼ −"}${inr(Math.abs(r.delta))}`}
                        </td>
                        <td className={`py-2 px-3 text-right whitespace-nowrap ${TONE_CLS[tone]}`}>
                          {pctText(r.deltaPct)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          </Panel>
        </div>
      )}
    </div>
  );
}
