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
        <h2 className="text-2xl font-black text-foreground">Sankalp Comparison</h2>
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

  // ONE table at every width — all plan columns stay side by side so the
  // comparison is never broken up or hidden behind a sideways scroll.
  //
  // `table-fixed` + `w-full` is what makes that work: the table is always
  // exactly the container width and the column percentages below divide it, so
  // cells can never sum to more than the screen. Long labels wrap instead of
  // widening the table. There is deliberately NO overflow-x wrapper here — the
  // old min-w-[180px] first column forced 498px into a 310px card, which is
  // what produced the cropping and the slide.
  return (
    <div className="card-soft overflow-hidden animate-fade-up border border-[#F0DFC8]">
      <table className="w-full table-fixed">
        <colgroup>
          <col className="w-[40%] sm:w-[37%] md:w-[34%]" />
          {visiblePlans.map((p) => (
            <col key={p.id} />
          ))}
        </colgroup>
        <thead className="bg-[#FDF3EB]">
          <tr className="border-b border-[#F0DFC8]">
            <th className="text-left px-2 sm:px-3 md:px-4 py-2.5 md:py-3 font-bold text-foreground text-[11px] sm:text-xs md:text-sm">
              Seva / Benefit Details
            </th>
            {visiblePlans.map((p) => (
              <th key={p.id} className="px-1 sm:px-2 md:px-3 py-2.5 md:py-3 text-center align-top">
                <div className="text-[10px] sm:text-xs md:text-sm font-extrabold leading-tight text-foreground break-words hyphens-auto">
                  {p.name}
                </div>
                {/* "₹251/Monthly" has no break opportunity, so on a ~62px phone
                    column it would be clipped. Stack the two halves instead. */}
                <div className="text-[9px] sm:text-[11px] md:text-xs font-bold text-brand mt-0.5 md:mt-1 leading-tight">
                  <span className="block md:inline">{p.price}</span>
                  <span className="block md:inline">{p.cycle}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.key} className={i % 2 === 0 ? "bg-white" : "bg-[#FDF3EB]/30"}>
              <td className="px-2 sm:px-3 md:px-4 py-2.5 md:py-3 text-foreground text-[10px] sm:text-xs font-semibold leading-tight break-words">
                {row.label}
              </td>
              {visiblePlans.map((p) => (
                <td key={p.id} className="px-1 sm:px-2 md:px-3 py-2.5 md:py-3 text-center">
                  <ComparisonCell value={p.comparison?.[row.key]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {yearlyPlan && (
        <div className="bg-[#3FAE55] text-white text-center px-3 py-2.5 md:py-3 text-[10px] sm:text-xs md:text-sm font-bold leading-snug">
          {/* [Pass-2 F15] keep the paisa remainder instead of rounding a
              ₹249.92 equivalent up to ₹250 — show 2 decimals only when
              the monthly-equivalent isn't a whole rupee. */}
          {yearlyPlan.name} = equivalent to just ₹
          {(yearlyPlan.priceNumeric / 12).toLocaleString("en-IN", {
            minimumFractionDigits: yearlyPlan.priceNumeric % 1200 !== 0 ? 2 : 0,
            maximumFractionDigits: 2,
          })}
          /Month — worry-free for the entire year!
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
  if (!value) return <X className="w-4 h-4 md:w-[18px] md:h-[18px] text-destructive/70 mx-auto" />;
  if (value.label !== undefined) {
    return (
      <span className="text-[10px] sm:text-xs font-bold text-foreground leading-tight break-words">
        {value.label}
      </span>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center min-h-[28px] md:min-h-[32px]">
      {value.has ? (
        <Check className="w-4 h-4 md:w-[18px] md:h-[18px] text-[#3FAE55] stroke-[3]" />
      ) : (
        <X className="w-4 h-4 md:w-[18px] md:h-[18px] text-destructive/70" />
      )}
      {value.has && value.frequency && (
        <span className="text-[8px] sm:text-[9px] text-muted-foreground mt-0.5 leading-tight font-semibold">
          {value.frequency}
        </span>
      )}
    </div>
  );
}
