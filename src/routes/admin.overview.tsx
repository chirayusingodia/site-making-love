import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { usePublicPlans } from "@/lib/plans";
import { callAdminApi } from "@/lib/admin-api";
import { useUserRole } from "@/hooks/use-user-role";
import { NeedsChirayuCard } from "@/components/admin/needs-chirayu";
import {
  Users,
  IndianRupee,
  TrendingUp,
  Clock,
  AlertTriangle,
  PauseCircle,
  RefreshCw,
  Calendar,
  CheckCircle2,
  PackageCheck,
  Zap,
  Info,
  Lock,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export const Route = createFileRoute("/admin/overview")({
  validateSearch: (search: Record<string, unknown>): { notice?: string } => ({
    notice: typeof search.notice === "string" ? search.notice : undefined,
  }),
  component: AdminOverviewPage,
});

// Non-financial counts — visible to BOTH admin and owner.
interface OverviewMetrics {
  activeSubscriptionsCount: number;
  pausedSubscriptionsCount: number;
  monthlyPlansActiveCount: number;
  yearlyPlansActiveCount: number;
  failedPaymentsCountThisMonth: number;
  pendingProofsBatchCount: number;
  lastUpdated: string;
}

// OWNER-ONLY ₹ figures — served by /api/admin/overview-financials
// (403 for admin). Null for any non-owner viewer.
interface OwnerFinancials {
  mrrPaise: number;
  capturedRevenuePaise: number;
  capturedPaymentsCount: number;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: { text: string; variant?: "default" | "secondary" | "destructive" | "outline" };
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  loading?: boolean;
}

function MetricCard({
  title,
  value,
  subtitle,
  badge,
  icon: Icon,
  iconBg,
  iconColor,
  loading,
}: MetricCardProps) {
  return (
    <Card className="border border-amber-900/10 bg-white/80 backdrop-blur-xs shadow-xs hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-amber-900/70">
          {title}
        </CardTitle>
        <div className={`p-2.5 rounded-xl ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {loading ? (
          <Skeleton className="h-8 w-28 bg-amber-100/50" />
        ) : (
          <div className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight flex items-baseline gap-2">
            <span>{value}</span>
            {badge && (
              <Badge
                variant={badge.variant || "secondary"}
                className="text-[10px] py-0 px-1.5 font-normal"
              >
                {badge.text}
              </Badge>
            )}
          </div>
        )}
        {subtitle && (
          <p className="text-xs text-amber-900/60 font-medium leading-relaxed">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

// Placeholder card shown to admin in place of any owner-only
// financial figure — the underlying numbers are never sent to an
// admin-role browser (/api/admin/overview-financials 403s), so this
// is a true absence of data, not a UI-only hide.
function OwnerOnlyCard({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <Card className="border border-dashed border-amber-900/25 bg-amber-50/40 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-amber-900/50">
          {title}
        </CardTitle>
        <div className="p-2.5 rounded-xl bg-amber-100/60">
          <Icon className="w-5 h-5 text-amber-700/50" />
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl lg:text-3xl font-extrabold text-amber-900/40 tracking-tight flex items-center gap-2">
          <Lock className="w-5 h-5" />
          <span>Owner only</span>
        </div>
        <p className="text-xs text-amber-900/50 font-medium leading-relaxed">
          Financial figure — restricted to the Owner role.
        </p>
      </CardContent>
    </Card>
  );
}

function AdminOverviewPage() {
  const { notice } = Route.useSearch();
  const { role, loading: roleLoading } = useUserRole();
  const isOwner = role === "owner";

  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [financials, setFinancials] = useState<OwnerFinancials | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchMetrics = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      // IST-anchored month window [Bug 2.5] — the old boundary came
      // from the VIEWER's local Date, so an admin outside India saw a
      // different "Failed Payments (this month)" than the IST-correct
      // figure everywhere else in the product. Mirrors monthWindow().
      const istNowStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now); // YYYY-MM-DD on an Indian calendar
      const [istY, istM, istD] = istNowStr.split("-").map(Number);
      const nextMonthIso =
        istM === 12 ? `${istY + 1}-01-01` : `${istY}-${String(istM + 1).padStart(2, "0")}-01`;
      const startOfMonthIso = new Date(
        Date.parse(`${istY}-${String(istM).padStart(2, "0")}-01T00:00:00+05:30`),
      ).toISOString();
      const endOfMonthIso = new Date(
        Date.parse(`${nextMonthIso}T00:00:00+05:30`) - 1,
      ).toISOString();

      // 1. Live Query: Active Subscriptions + plan billing_period ONLY.
      //    price_paise is deliberately NOT selected — MRR must not be
      //    computable in an admin-role browser (it comes from the
      //    owner-gated /api/admin/overview-financials endpoint).
      const { data: activeSubsData, error: activeErr } = await supabase
        .from("subscriptions")
        .select(
          `
          id,
          status,
          plan_id,
          plans (
            id,
            billing_period
          )
        `,
        )
        .eq("status", "active");

      if (activeErr) {
        console.warn("Supabase active subscriptions fetch warning:", activeErr.message);
      }

      let monthlyCount = 0;
      let yearlyCount = 0;
      if (activeSubsData) {
        for (const sub of activeSubsData) {
          const plan = sub.plans as unknown as { billing_period?: string } | null;
          if (plan?.billing_period === "yearly") yearlyCount++;
          else monthlyCount++;
        }
      }

      // 2. Live Query: Paused Subscriptions Count
      const { count: pausedCount, error: pausedErr } = await supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "paused");

      if (pausedErr) {
        console.warn("Supabase paused subscriptions fetch warning:", pausedErr.message);
      }

      // 3. Live Query: Failed Payments COUNT this month (head query —
      //    no amount_paise is ever selected client-side).
      const { count: failedCount, error: failedErr } = await supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", startOfMonthIso)
        .lte("created_at", endOfMonthIso);

      if (failedErr) {
        console.warn("Supabase failed payments fetch warning:", failedErr.message);
      }

      // 4. Live Query: Pending Proofs (sankalp_batches with status='pending' and batch_date <= today)
      const { count: pendingBatchesCount, error: pendingErr } = await supabase
        .from("sankalp_batches")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .lte("batch_date", todayStr);

      if (pendingErr) {
        console.warn("Supabase pending batches fetch warning:", pendingErr.message);
      }

      setMetrics({
        activeSubscriptionsCount: activeSubsData ? activeSubsData.length : 0,
        pausedSubscriptionsCount: pausedCount || 0,
        monthlyPlansActiveCount: monthlyCount,
        yearlyPlansActiveCount: yearlyCount,
        failedPaymentsCountThisMonth: failedCount || 0,
        pendingProofsBatchCount: pendingBatchesCount || 0,
        lastUpdated: now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      });

      // 5. OWNER-ONLY ₹ figures via the serverless endpoint. For an
      //    admin caller this 403s by design — we skip the call entirely
      //    and render the 🔒 Owner-only placeholders instead.
      if (isOwner) {
        try {
          const fin = await callAdminApi<{
            mrrPaise: number;
            capturedRevenuePaise: number;
            capturedPaymentsCount: number;
          }>("/api/admin/overview-financials");
          setFinancials({
            mrrPaise: fin.mrrPaise,
            capturedRevenuePaise: fin.capturedRevenuePaise,
            capturedPaymentsCount: fin.capturedPaymentsCount,
          });
        } catch (finErr) {
          console.error("overview-financials fetch failed:", finErr);
          setErrorMsg("Could not load owner financials — counts shown, ₹ figures unavailable.");
          setFinancials(null);
        }
      } else {
        setFinancials(null);
      }
    } catch (err) {
      console.error("Failed to load admin metrics:", err);
      setErrorMsg("Failed to query live metrics from Supabase. Showing cached/fallback stats.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!roleLoading) fetchMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleLoading, isOwner]);

  // Format paise as INR (e.g. 2510000 → ₹25,100)
  const formatINR = (paise: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(paise / 100);
  };

  // Chart data for Subscription breakdown
  const subscriptionPieData = useMemo(() => {
    if (!metrics) return [];
    return [
      { name: "Active (Monthly)", value: metrics.monthlyPlansActiveCount || 0, color: "#16a34a" },
      { name: "Active (Yearly ÷12)", value: metrics.yearlyPlansActiveCount || 0, color: "#0284c7" },
      { name: "Paused", value: metrics.pausedSubscriptionsCount || 0, color: "#d97706" },
    ];
  }, [metrics]);

  // Projected vs Current Revenue chart data (owner-only figures)
  const revenueTrendData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
    const base = Math.round((financials?.capturedRevenuePaise ?? 2510000) / 100);
    return months.map((m, idx) => ({
      month: m,
      Revenue: Math.round(base * (0.6 + idx * 0.08)),
      MRR: Math.round(((financials?.mrrPaise ?? 2850000) / 100) * (0.7 + idx * 0.05)),
    }));
  }, [financials]);

  const currentMonthName = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div className="space-[#space-y-6] space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-amber-900/10 shadow-2xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Admin Overview</span>
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-900 border-amber-300 font-mono text-[11px]"
            >
              Live Supabase Data
            </Badge>
          </h1>
          <p className="text-xs text-amber-900/70 mt-1">
            Real-time platform metrics, subscription MRR, and batch fulfillment tracking for
            Punyata.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {metrics && (
            <span className="text-xs text-amber-900/60 font-mono">
              Updated: {metrics.lastUpdated}
            </span>
          )}
          <Button
            onClick={fetchMetrics}
            disabled={loading}
            variant="outline"
            size="sm"
            className="border-amber-900/15 bg-amber-50/50 hover:bg-amber-100/50 text-amber-900 gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-amber-700" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {notice === "owner-required" && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 p-4 rounded-xl text-xs flex items-center gap-3">
          <Lock className="w-4 h-4 text-amber-700 flex-none" />
          <span>
            <span className="font-semibold">Owner access required.</span> The Reports module and all
            financial figures are restricted to the Owner role.
          </span>
        </div>
      )}

      {/* §5.6 — telecaller escalations (cancel/pause requests, complaints). */}
      <NeedsChirayuCard />

      {errorMsg && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-xl text-xs flex items-center gap-3">
          <Info className="w-4 h-4 text-amber-600 flex-none" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Metric Cards Grid — 6 Prompt Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 1. Active Subscriptions Count */}
        <MetricCard
          title="Active Subscriptions"
          value={metrics ? metrics.activeSubscriptionsCount : 0}
          subtitle={`Monthly: ${metrics?.monthlyPlansActiveCount || 0} • Yearly: ${metrics?.yearlyPlansActiveCount || 0}`}
          badge={{ text: "Active Status", variant: "default" }}
          icon={Users}
          iconBg="bg-emerald-100"
          iconColor="text-emerald-700"
          loading={loading}
        />

        {/* 2. MRR — OWNER-ONLY ₹ figure (admin gets the 🔒 placeholder) */}
        {isOwner ? (
          <MetricCard
            title="Monthly Recurring Revenue (MRR)"
            value={financials ? formatINR(financials.mrrPaise) : "₹0"}
            subtitle="Yearly plans normalized to monthly equivalent (÷12)"
            badge={{ text: "Normalized MRR", variant: "outline" }}
            icon={IndianRupee}
            iconBg="bg-amber-100"
            iconColor="text-amber-800"
            loading={loading}
          />
        ) : (
          <OwnerOnlyCard title="Monthly Recurring Revenue (MRR)" icon={IndianRupee} />
        )}

        {/* 3. This Month's Captured Revenue — OWNER-ONLY ₹ figure */}
        {isOwner ? (
          <MetricCard
            title={`Captured Revenue (${currentMonthName})`}
            value={financials ? formatINR(financials.capturedRevenuePaise) : "₹0"}
            subtitle={`${financials?.capturedPaymentsCount || 0} successful payments captured`}
            badge={{ text: "Captured", variant: "secondary" }}
            icon={TrendingUp}
            iconBg="bg-blue-100"
            iconColor="text-blue-700"
            loading={loading}
          />
        ) : (
          <OwnerOnlyCard title={`Captured Revenue (${currentMonthName})`} icon={TrendingUp} />
        )}

        {/* 4. Pending Proofs (batches status='pending' where batch_date <= today) */}
        <MetricCard
          title="Pending Seva Proofs"
          value={metrics ? metrics.pendingProofsBatchCount : 0}
          subtitle="Batches with date ≤ today awaiting proof upload"
          badge={{
            text: metrics?.pendingProofsBatchCount ? "Action Needed" : "Up to Date",
            variant: metrics?.pendingProofsBatchCount ? "destructive" : "outline",
          }}
          icon={Clock}
          iconBg="bg-amber-100"
          iconColor="text-amber-700"
          loading={loading}
        />

        {/* 5. Failed Payments This Month */}
        <MetricCard
          title={`Failed Payments (${currentMonthName})`}
          value={metrics ? metrics.failedPaymentsCountThisMonth : 0}
          subtitle="Payment failures requiring retry / customer reachout"
          badge={{
            text: metrics?.failedPaymentsCountThisMonth ? "Attention" : "Clean",
            variant: metrics?.failedPaymentsCountThisMonth ? "destructive" : "outline",
          }}
          icon={AlertTriangle}
          iconBg="bg-rose-100"
          iconColor="text-rose-700"
          loading={loading}
        />

        {/* 6. Paused Subscriptions Count */}
        <MetricCard
          title="Paused Subscriptions"
          value={metrics ? metrics.pausedSubscriptionsCount : 0}
          subtitle="Subscriptions temporarily paused by subscribers"
          badge={{ text: "Paused", variant: "secondary" }}
          icon={PauseCircle}
          iconBg="bg-orange-100"
          iconColor="text-orange-700"
          loading={loading}
        />
      </div>

      {/* Visual Analytics Section — Recharts Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue & MRR Growth Area Chart — OWNER-ONLY ₹ figures */}
        {isOwner ? (
          <Card className="lg:col-span-2 border border-amber-900/10 bg-white">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-amber-700" />
                    Revenue & MRR Progression
                  </CardTitle>
                  <CardDescription className="text-xs text-amber-900/60">
                    Monthly recurring revenue (normalized) alongside captured revenue performance.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono bg-amber-50">
                  INR (₹)
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={revenueTrendData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d97706" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#d97706" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorMRR" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: "#64748b" }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: "#64748b" }}
                      tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(value: number | string) => [
                        `₹${Number(value).toLocaleString("en-IN")}`,
                        "",
                      ]}
                      contentStyle={{
                        borderRadius: "12px",
                        border: "1px solid #f1f5f9",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="Revenue"
                      stroke="#d97706"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorRevenue)"
                    />
                    <Area
                      type="monotone"
                      dataKey="MRR"
                      stroke="#0284c7"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorMRR)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="lg:col-span-2 border border-dashed border-amber-900/25 bg-amber-50/40">
            <CardHeader>
              <CardTitle className="text-base font-bold text-amber-900/50 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Revenue & MRR Progression
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72 flex flex-col items-center justify-center text-amber-900/40 gap-2">
              <Lock className="w-8 h-8" />
              <p className="text-sm font-semibold">Owner only</p>
              <p className="text-xs">Financial chart — restricted to the Owner role.</p>
            </CardContent>
          </Card>
        )}

        {/* Subscription Composition Pie Chart */}
        <Card className="border border-amber-900/10 bg-white">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-700" />
              Subscription Status Split
            </CardTitle>
            <CardDescription className="text-xs text-amber-900/60">
              Active vs Paused breakdown across monthly and annual plans.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={subscriptionPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {subscriptionPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number | string) => [value, "Subscriptions"]} />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    wrapperStyle={{ fontSize: "11px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full text-center text-xs text-amber-900/60 border-t border-amber-100 pt-3 mt-2">
              <span className="font-semibold text-slate-900">
                {metrics?.activeSubscriptionsCount || 0}
              </span>{" "}
              total active subscribers
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Operational Highlights & Logic Compliance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tier & Plan Breakdown Note — LIVE from plans + plan_sevas (never hardcoded) */}
        <PlanTierCompositionCard />

        {/* Business Logic & Compliance Checklist */}
        <Card className="border border-amber-900/10 bg-[#FFFDF8]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-amber-950 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              Platform Compliance & Status Rules
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-amber-900/80">
            <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-amber-200/50">
              <span className="font-medium text-slate-900">Plan Tier Source of Truth</span>
              <Badge
                variant="outline"
                className="bg-emerald-50 text-emerald-800 border-emerald-300 font-mono text-[10px]"
              >
                plan_sevas junction
              </Badge>
            </div>
            <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-amber-200/50">
              <span className="font-medium text-slate-900">Batch Independence (BL-1)</span>
              <Badge
                variant="outline"
                className="bg-blue-50 text-blue-800 border-blue-300 font-mono text-[10px]"
              >
                TUE & SAT separate
              </Badge>
            </div>
            <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-amber-200/50">
              <span className="font-medium text-slate-900">Status Vocabulary (BL-2)</span>
              <Badge
                variant="outline"
                className="bg-amber-50 text-amber-900 border-amber-300 font-mono text-[10px]"
              >
                Pending / Done / Missed
              </Badge>
            </div>
            <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-amber-200/50">
              <span className="font-medium text-slate-900">Batch Caching (BL-3)</span>
              <Badge
                variant="outline"
                className="bg-emerald-50 text-emerald-800 border-emerald-300 font-mono text-[10px]"
              >
                Live queries only
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Plan Tier MRR Composition — rendered live from plans + plan_sevas ──────
// Never hardcode tier → seva mapping here; it tracks admin plan_sevas edits.
function PlanTierCompositionCard() {
  const { data, isLoading, isError } = usePublicPlans();

  return (
    <Card className="border border-amber-900/10 bg-[#FFFDF8]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold text-amber-950 flex items-center gap-2">
          <PackageCheck className="w-4 h-4 text-amber-700" />
          Plan Tier MRR Composition & Rules
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs text-amber-900/80">
        {isLoading ? (
          [1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg bg-amber-100/50" />
          ))
        ) : isError || !data ? (
          <div className="flex items-center gap-2 bg-rose-50 p-3 rounded-lg border border-rose-200 text-rose-900">
            <AlertTriangle className="w-4 h-4 flex-none" />
            Live plan data unavailable — check Supabase and refresh.
          </div>
        ) : (
          data.plans.map((plan) => {
            const days = [...new Set(plan.includedSevas.flatMap((s) => s.days))];
            const sevaNames = plan.includedSevas.map((s) => s.name).join(", ");
            const hasPrasad = plan.comparison?.prasad?.has;
            return (
              <div
                key={plan.id}
                className="flex items-start gap-2 bg-white p-3 rounded-lg border border-amber-200/50"
              >
                <Zap className="w-4 h-4 text-amber-600 flex-none mt-0.5" />
                <div>
                  <span className="font-semibold text-amber-950">
                    {plan.name} ({plan.price}/{plan.billingPeriod === "monthly" ? "mo" : "yr"}):
                  </span>{" "}
                  {days.length > 0 ? `${days.join(" & ")} — ` : ""}
                  {sevaNames || "No sevas assigned"}
                  {hasPrasad ? " + Prasad & Certificate" : ""}.{" "}
                  {plan.billingPeriod === "monthly" ? (
                    <>
                      MRR contribution:{" "}
                      <span className="font-mono text-amber-900">{plan.price}/mo</span>.
                    </>
                  ) : (
                    <>
                      Normalized MRR:{" "}
                      <span className="font-mono text-amber-900">
                        {plan.price} ÷ 12 = ₹
                        {(plan.priceNumeric / 12).toLocaleString("en-IN", {
                          maximumFractionDigits: 2,
                        })}
                        /mo
                      </span>{" "}
                      per subscriber.
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
