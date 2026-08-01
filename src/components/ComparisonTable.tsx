import React from "react";
import { Check, X, AlertTriangle, RefreshCw } from "lucide-react";
import { usePublicPlans, type ComparisonValue } from "@/lib/plans";

// Non-seva platform rows (universal facts, not tier composition).
// Seva rows are rendered live from the DB above these.
const PLATFORM_ROWS = [
  { key: "proof", label: "WhatsApp Photo/Video Proof" },
  { key: "family", label: "Family Members Included" },
  { key: "prasad", label: "Prasad & Certificate" },
  { key: "billing", label: "Billing Cycle" },
] as const;

export function ComparisonTable() {
  const { data, isLoading, isError, refetch, isRefetching } = usePublicPlans();

  return (
    <div className="space-y-6 pt-4 max-w-3xl mx-auto w-full px-4">
      <div className="text-center">
        <h2 className="text-2xl font-black text-foreground">
          Sankalp Comparison
        </h2>
        <p className="text-sm text-muted-foreground mt-1.5">
          Complete comparison of all sankalp packs
        </p>
      </div>

      {isLoading ? (
        <ComparisonSkeleton />
      ) : isError || !data ? (
        <ComparisonError onRetry={() => refetch()} retrying={isRefetching} />
      ) : (
        <LiveTable plans={data.plans} sevas={data.sevas} />
      )}
    </div>
  );
}

function LiveTable({
  plans,
  sevas,
}: {
  plans: import("@/lib/plans").Plan[];
  sevas: import("@/lib/plans").LiveSeva[];
}) {
  const visiblePlans = plans.filter((p) => p.isVisible !== false);
  const yearlyPlan = visiblePlans.find((p) => p.billingPeriod === "yearly");

  const rows: { key: string; label: string }[] = [
    ...sevas.map((s) => ({ key: s.slug, label: s.name })),
    ...PLATFORM_ROWS.map((r) => ({ key: r.key, label: r.label })),
  ];

  return (
    <div className="card-soft overflow-hidden animate-fade-up border border-[#F0DFC8]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#FDF3EB]">
            <tr className="border-b border-[#F0DFC8]">
              <th className="text-left px-4 py-3 font-bold text-foreground min-w-[180px]">
                Seva / Benefit Details
              </th>
              {visiblePlans.map((p) => (
                <th
                  key={p.id}
                  className="px-3 py-3 font-bold text-foreground text-center"
                >
                  <div className="text-xs md:text-sm font-extrabold leading-snug">
                    {p.name}
                  </div>
                  <div className="text-xs font-bold text-brand mt-1">{p.price}{p.cycle}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.key} className={i % 2 === 0 ? "bg-white" : "bg-[#FDF3EB]/30"}>
                <td className="px-4 py-3 text-foreground text-xs font-semibold">{row.label}</td>
                {visiblePlans.map((p) => {
                  const feat = p.comparison?.[row.key];
                  return (
                    <td key={p.id} className="px-3 py-3 text-center">
                      <ComparisonCell value={feat} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {yearlyPlan && (
        <div className="bg-[#3FAE55] text-white text-center px-4 py-3 text-xs md:text-sm font-bold">
          {yearlyPlan.name} = equivalent to just ₹{Math.round(yearlyPlan.priceNumeric / 12).toLocaleString("en-IN")}/Month — worry-free for the entire year!
        </div>
      )}
    </div>
  );
}

function ComparisonSkeleton() {
  return (
    <div className="card-soft overflow-hidden border border-[#F0DFC8] animate-pulse">
      <div className="bg-[#FDF3EB] px-4 py-3 flex gap-4">
        <div className="h-4 w-40 bg-black/10 rounded" />
        <div className="h-4 flex-1 bg-black/5 rounded" />
        <div className="h-4 flex-1 bg-black/5 rounded" />
        <div className="h-4 flex-1 bg-black/5 rounded" />
      </div>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="px-4 py-3.5 flex gap-4 border-t border-black/5">
          <div className="h-3.5 w-44 bg-black/10 rounded" />
          <div className="h-3.5 flex-1 bg-black/5 rounded" />
          <div className="h-3.5 flex-1 bg-black/5 rounded" />
          <div className="h-3.5 flex-1 bg-black/5 rounded" />
        </div>
      ))}
    </div>
  );
}

function ComparisonError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div className="card-soft border border-destructive/30 p-6 text-center space-y-3">
      <AlertTriangle size={28} className="text-destructive mx-auto" />
      <p className="text-sm font-semibold text-foreground">
        Plan comparison abhi load nahi ho paya.
      </p>
      <p className="text-xs text-muted-foreground">
        Live seva data fetch karne mein samasya aayi. Kripya punah prayas karein.
      </p>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="inline-flex items-center gap-2 bg-brand text-white text-xs font-bold px-4 py-2 rounded-full disabled:opacity-60"
      >
        <RefreshCw size={14} className={retrying ? "animate-spin" : ""} />
        {retrying ? "Retrying..." : "Retry"}
      </button>
    </div>
  );
}

function ComparisonCell({ value }: { value: ComparisonValue | undefined }) {
  if (!value) return <X size={18} className="text-destructive/70 mx-auto" />;
  if (value.label !== undefined) {
    return <span className="text-xs font-bold text-foreground">{value.label}</span>;
  }
  return (
    <div className="flex flex-col items-center justify-center min-h-[32px]">
      {value.has ? (
        <Check size={18} className="text-[#3FAE55] mx-auto stroke-[3]" />
      ) : (
        <X size={18} className="text-destructive/70 mx-auto" />
      )}
      {value.has && value.frequency && (
        <span className="text-[9px] text-muted-foreground mt-0.5 leading-tight font-semibold">
          {value.frequency}
        </span>
      )}
    </div>
  );
}
