import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const TONE_CLS: Record<"default" | "warning" | "danger" | "success", string> = {
  default: "text-slate-900",
  warning: "text-amber-700",
  danger: "text-red-700",
  success: "text-emerald-700",
};

/**
 * The one stat-card layout every telecaller screen should use
 * (Phase 2 UI pass). Dense on purpose — this panel is worked at
 * high volume, not browsed leisurely.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  tone = "default",
  loading,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: "default" | "warning" | "danger" | "success";
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-2xs px-3.5 py-3">
      {loading ? (
        <Skeleton className="h-6 w-12" />
      ) : (
        <div className={`text-xl font-extrabold flex items-center gap-1.5 ${TONE_CLS[tone]}`}>
          {Icon && <Icon className="w-4 h-4 flex-none" />}
          {value}
        </div>
      )}
      <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
