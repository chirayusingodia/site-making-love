import { createFileRoute, Link } from "@tanstack/react-router";
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
  Info,
  Lock,
  PhoneCall,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import {
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  StatCard,
  TableScroll,
} from "@/components/admin/admin-ui";

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
  monthlyPlansActiveCount: number;
  yearlyPlansActiveCount: number;
  capturedRevenuePaise: number;
  capturedPaymentsCount: number;
  /** The offline QR/cash/bank slice of mrrPaise / capturedRevenuePaise. */
  qrMrrPaise: number;
  qrCapturedRevenuePaise: number;
}

// Maps raw acquisition_channel values (see src/lib/attribution.ts and
// send-payment-link.ts) to a readable label for the breakdown card.
function channelLabel(channel: string): string {
  const known: Record<string, string> = {
    telecall: "Telecaller (staff)",
    instagram: "Instagram",
    facebook: "Facebook",
    facebook_ads: "Facebook Ads",
    whatsapp: "WhatsApp",
    google_ads: "Google Ads",
    google_organic: "Google (organic)",
    youtube: "YouTube",
    organic: "Organic",
    direct: "Direct",
    "organic/direct": "Organic / Direct",
  };
  if (known[channel]) return known[channel];
  if (channel.startsWith("coupon:")) return `Coupon (${channel.slice(7)})`;
  if (channel.startsWith("referral:")) return `Referral (${channel.slice(9)})`;
  return channel;
}

function AdminOverviewPage() {
  const { notice } = Route.useSearch();
  const { role, loading: roleLoading } = useUserRole();
  const isOwner = role === "owner";

  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [financials, setFinancials] = useState<OwnerFinancials | null>(null);
  const [freeSewaPendingCount, setFreeSewaPendingCount] = useState<number | null>(null);
  const [loginCounts, setLoginCounts] = useState<{
    google: number;
    phone: number;
    other: number;
    total: number;
  } | null>(null);
  const [channelBreakdown, setChannelBreakdown] = useState<
    { channel: string; count: number }[] | null
  >(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchMetrics = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const now = new Date();
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
      // [Pass-2 F3] "today" for pending-batch comparisons is the same
      // IST calendar day — toISOString().split() kept using UTC, so a
      // batch dated today (IST) was excluded from "Pending Seva
      // Proofs" until 05:30 IST every morning.
      const todayStr = istNowStr;
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

      // 4b. Free Sewa Pending — agent-sourced leads awaiting the
      // telecaller's free-sewa confirmation call (§ Free Sewa gate).
      // `leads` is staff-only via RLS, so this goes through the
      // service-role admin endpoint rather than the anon client.
      try {
        const freeSewa = await callAdminApi<{ count: number }>(
          "/api/admin/leads/free-sewa-pending-count",
        );
        setFreeSewaPendingCount(freeSewa.count);
      } catch (freeSewaErr) {
        console.error("free-sewa-pending-count fetch failed:", freeSewaErr);
        setFreeSewaPendingCount(null);
      }

      // 4c. Logins by method — how many people have signed in via
      // Google vs Phone/OTP, regardless of subscription. auth.users is
      // not RLS-readable, so this goes through the service-role admin
      // endpoint. Non-financial, so admin-visible like the counts above.
      try {
        const counts = await callAdminApi<{
          google: number;
          phone: number;
          other: number;
          total: number;
        }>("/api/admin/login-method-counts");
        setLoginCounts(counts);
      } catch (loginErr) {
        console.error("login-method-counts fetch failed:", loginErr);
        setLoginCounts(null);
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
            monthlyPlansActiveCount: number;
            yearlyPlansActiveCount: number;
            capturedRevenuePaise: number;
            capturedPaymentsCount: number;
            qrMrrPaise: number;
            qrCapturedRevenuePaise: number;
          }>("/api/admin/overview-financials");
          setFinancials({
            mrrPaise: fin.mrrPaise,
            monthlyPlansActiveCount: fin.monthlyPlansActiveCount,
            yearlyPlansActiveCount: fin.yearlyPlansActiveCount,
            capturedRevenuePaise: fin.capturedRevenuePaise,
            capturedPaymentsCount: fin.capturedPaymentsCount,
            qrMrrPaise: fin.qrMrrPaise ?? 0,
            qrCapturedRevenuePaise: fin.qrCapturedRevenuePaise ?? 0,
          });
        } catch (finErr) {
          console.error("overview-financials fetch failed:", finErr);
          setErrorMsg("Could not load owner financials — counts shown, ₹ figures unavailable.");
          setFinancials(null);
        }

        try {
          const attr = await callAdminApi<{ channels: { channel: string; count: number }[] }>(
            "/api/admin/reports/subscribers-by-channel",
          );
          setChannelBreakdown(attr.channels);
        } catch (attrErr) {
          console.error("subscribers-by-channel fetch failed:", attrErr);
          setChannelBreakdown(null);
        }
      } else {
        setFinancials(null);
        setChannelBreakdown(null);
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
      { name: "Monthly", value: metrics.monthlyPlansActiveCount || 0, color: "#c2410c" },
      { name: "Yearly", value: metrics.yearlyPlansActiveCount || 0, color: "#0369a1" },
      { name: "Paused", value: metrics.pausedSubscriptionsCount || 0, color: "#d6d3d1" },
    ];
  }, [metrics]);

  // [Pass-2 F4] The old "Revenue & MRR Progression" chart fabricated a
  // 7-month trend from invented multipliers on ONE real number. Only
  // current-period figures exist in this endpoint, so they are shown as
  // KPI tiles; the real month-by-month series is /admin/reports (Trends).
  const currentMonthName = new Date().toLocaleString("en-IN", { month: "long" });
  const pendingProofs = metrics?.pendingProofsBatchCount ?? 0;
  const failedPayments = metrics?.failedPaymentsCountThisMonth ?? 0;
  const paused = metrics?.pausedSubscriptionsCount ?? 0;
  const ofWhichQr = (paise: number | undefined) =>
    paise && paise > 0 ? ` · ${formatINR(paise)} via QR` : "";

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Overview"
        description="Subscriptions, revenue and today's fulfilment work at a glance."
        meta={metrics ? `Updated ${metrics.lastUpdated}` : undefined}
        actions={
          <Button
            onClick={fetchMetrics}
            disabled={loading}
            variant="outline"
            size="sm"
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {notice === "owner-required" && (
        <Notice tone="warn" icon={Lock}>
          <span className="font-medium">Owner access required.</span> Reports and all financial
          figures are restricted to the Owner role.
        </Notice>
      )}
      {errorMsg && (
        <Notice tone="warn" icon={Info}>
          {errorMsg}
        </Notice>
      )}

      {/* §5.6 — telecaller escalations (cancel/pause requests, complaints). */}
      <NeedsChirayuCard />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-900">Business</h2>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            label="Active subscriptions"
            value={metrics?.activeSubscriptionsCount ?? 0}
            hint={`${metrics?.monthlyPlansActiveCount ?? 0} monthly · ${metrics?.yearlyPlansActiveCount ?? 0} yearly`}
            icon={Users}
            loading={loading}
            to="/admin/subscribers"
          />
          {/* MRR + captured revenue — OWNER-ONLY ₹ figures (admin gets the 🔒 tile) */}
          {isOwner ? (
            <StatCard
              label="Monthly recurring revenue"
              value={financials ? formatINR(financials.mrrPaise) : "—"}
              hint={`Yearly plans ÷ 12${ofWhichQr(financials?.qrMrrPaise)}`}
              icon={IndianRupee}
              loading={loading}
            />
          ) : (
            <OwnerOnlyTile label="Monthly recurring revenue" />
          )}
          {isOwner ? (
            <StatCard
              label={`Revenue in ${currentMonthName}`}
              value={financials ? formatINR(financials.capturedRevenuePaise) : "—"}
              hint={`${financials?.capturedPaymentsCount ?? 0} captured payments${ofWhichQr(financials?.qrCapturedRevenuePaise)}`}
              icon={TrendingUp}
              loading={loading}
              to="/admin/reports"
            />
          ) : (
            <OwnerOnlyTile label={`Revenue in ${currentMonthName}`} />
          )}
          {/* Logins by method — Google vs Phone/OTP, all registered users. */}
          <StatCard
            label="Registered users"
            value={loginCounts?.total ?? 0}
            hint={
              loginCounts
                ? `Google ${loginCounts.google} · Phone ${loginCounts.phone}` +
                  (loginCounts.other ? ` · Other ${loginCounts.other}` : "")
                : "By sign-in method"
            }
            icon={LogIn}
            loading={loading}
            to="/admin/signups"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-900">Needs attention</h2>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {/* Batches with batch_date ≤ today still status='pending'. */}
          <StatCard
            label="Seva proofs pending"
            value={pendingProofs}
            status={
              pendingProofs
                ? { tone: "bad", text: "Upload needed" }
                : { tone: "good", text: "Up to date" }
            }
            hint="Batches due today or earlier"
            icon={Clock}
            loading={loading}
            to="/admin/proof-upload"
          />
          {/* Agent leads awaiting the free-sewa confirmation call (§ Free Sewa gate). */}
          <StatCard
            label="Free sewa to confirm"
            value={freeSewaPendingCount ?? 0}
            status={
              freeSewaPendingCount
                ? { tone: "warn", text: "Needs calling" }
                : { tone: "good", text: "Up to date" }
            }
            hint="Agent leads awaiting call"
            icon={PhoneCall}
            loading={loading}
            to="/admin/leads"
          />
          <StatCard
            label={`Failed payments (${currentMonthName})`}
            value={failedPayments}
            status={
              failedPayments ? { tone: "bad", text: "Follow up" } : { tone: "good", text: "None" }
            }
            hint="Retry or reach out"
            icon={AlertTriangle}
            loading={loading}
            to="/admin/payments"
          />
          <StatCard
            label="Paused subscriptions"
            value={paused}
            status={
              paused
                ? { tone: "warn", text: "Paused by subscriber" }
                : { tone: "neutral", text: "None" }
            }
            hint="Temporarily on hold"
            icon={PauseCircle}
            loading={loading}
            to="/admin/subscribers"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
        <Panel
          title="Subscription mix"
          description="Active plans by billing period, plus paused."
          className="lg:col-span-2"
        >
          <div className="flex items-center gap-6">
            <div className="h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={subscriptionPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {subscriptionPieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number | string) => [value, "Subscriptions"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex-1 space-y-2.5 text-sm">
              {subscriptionPieData.map((d) => (
                <li key={d.name} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-stone-600">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-semibold tabular-nums text-stone-900">{d.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        {/* Subscribers by acquisition channel — OWNER-ONLY (marketing-spend-adjacent) */}
        <Panel
          title="Subscribers by channel"
          description={
            <>
              Every subscription that left "pending", by how it was acquired. Ad links need a{" "}
              <code className="font-mono">?utm_source=</code> tag.
            </>
          }
          className="lg:col-span-3"
        >
          {!isOwner ? (
            <EmptyState
              icon={Lock}
              title="Owner only"
              description="Channel attribution is restricted to the Owner role."
              className="py-6"
            />
          ) : !channelBreakdown || channelBreakdown.length === 0 ? (
            <EmptyState title={loading ? "Loading…" : "No data yet"} className="py-6" />
          ) : (
            <div className="space-y-3">
              {(() => {
                const max = Math.max(...channelBreakdown.map((c) => c.count), 1);
                return channelBreakdown.map((c) => (
                  <div
                    key={c.channel}
                    className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-sm"
                  >
                    <div className="truncate text-stone-600">{channelLabel(c.channel)}</div>
                    <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-orange-600"
                        style={{ width: `${Math.max((c.count / max) * 100, 3)}%` }}
                      />
                    </div>
                    <div className="text-right font-semibold tabular-nums text-stone-900">
                      {c.count}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </Panel>
      </div>

      <PlanTierCompositionCard />
    </div>
  );
}

function OwnerOnlyTile({ label }: { label: string }) {
  return (
    <div className="admin-card h-full p-4 sm:p-5 flex flex-col gap-3 border-dashed bg-stone-50/60">
      <span className="text-[13px] font-medium text-stone-500">{label}</span>
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-400">
        <Lock className="w-4 h-4" /> Owner only
      </span>
    </div>
  );
}

// ─── Plans — rendered live from plans + plan_sevas ──────
// Never hardcode tier → seva mapping here; it tracks admin plan_sevas edits.
function PlanTierCompositionCard() {
  const { data, isLoading, isError } = usePublicPlans();

  return (
    <Panel
      title="Plans on sale"
      description="Live from Plans & Sevas — what each plan includes and what it adds to MRR per subscriber."
      actions={
        <Link
          to="/admin/plans-sevas"
          className="text-xs font-medium text-orange-700 hover:underline"
        >
          Manage plans
        </Link>
      }
      flush
    >
      {isLoading ? (
        <div className="p-5 space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : isError || !data ? (
        <div className="p-5">
          <Notice tone="bad" icon={AlertTriangle}>
            Live plan data unavailable — check Supabase and refresh.
          </Notice>
        </div>
      ) : (
        <TableScroll>
          <table className="w-full text-sm admin-table-fixed min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-stone-500 border-b border-stone-100">
                <th className="font-medium px-5 py-2.5">Plan</th>
                <th className="font-medium px-3 py-2.5">Price</th>
                <th className="font-medium px-3 py-2.5">Days</th>
                <th className="font-medium px-3 py-2.5">Sevas</th>
                <th className="font-medium px-5 py-2.5 text-right">MRR / subscriber</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.plans.map((plan) => {
                const days = [...new Set(plan.includedSevas.flatMap((s) => s.days))];
                const sevaNames = plan.includedSevas.map((s) => s.name).join(", ");
                const hasPrasad = plan.comparison?.prasad?.has;
                const mrr =
                  plan.billingPeriod === "monthly"
                    ? plan.price
                    : `₹${(plan.priceNumeric / 12).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
                return (
                  <tr key={plan.id} className="align-top">
                    <td className="px-5 py-3 font-medium text-stone-900">{plan.name}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-stone-700">
                      {plan.price}
                      <span className="text-stone-400">
                        /{plan.billingPeriod === "monthly" ? "mo" : "yr"}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-stone-600">
                      {days.join(", ") || "—"}
                    </td>
                    <td className="px-3 py-3 text-stone-600">
                      {sevaNames || "No sevas assigned"}
                      {hasPrasad ? " + Prasad & certificate" : ""}
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-stone-900 whitespace-nowrap">
                      {mrr}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Panel>
  );
}
