import React from "react";
import { Check, X } from "lucide-react";
import { plans } from "@/lib/plans";

export function ComparisonTable() {
  const visiblePlans = plans.filter((p) => p.isVisible !== false);

  const COMPARISON_ROWS = [
    { key: "sundarkand", label: "Sundarkand Path (Sankalp)" },
    { key: "sadhuBhojan", label: "Saadhu Santo Ko Bhojan" },
    { key: "gauSeva", label: "Gau Mata Seva" },
    { key: "vanarSeva", label: "Vanar Seva" },
    { key: "grihaShantiHawan", label: "Griha Shanti Hawan" },
    { key: "sarvRogNivaranHawan", label: "Sarv Rog Nivaran Hawan" },
    { key: "cholaSeva", label: "Hanuman Ji Chola Seva" },
    { key: "aarti", label: "Aarti" },
    { key: "proof", label: "WhatsApp Photo/Video Proof" },
    { key: "family", label: "Family Members Included" },
    { key: "prasadBox", label: "Prasad & Certificate" },
    { key: "billing", label: "Billing Cycle" },
  ];

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
              {COMPARISON_ROWS.map((row, i) => (
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
        <div className="bg-[#3FAE55] text-white text-center px-4 py-3 text-xs md:text-sm font-bold">
          Annual Plan = equivalent to just ₹342/Month — worry-free for the entire year!
        </div>
      </div>
    </div>
  );
}

function ComparisonCell({ value }: { value: any }) {
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
