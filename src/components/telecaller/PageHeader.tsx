import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The one page-title layout every telecaller screen should use
 * (Phase 2 UI pass — before this, each page reinvented its own
 * header markup with slightly different spacing/type scale).
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
          <Icon className="w-5 h-5 text-indigo-700 flex-none" />
          {title}
        </h1>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-none">{actions}</div>}
    </div>
  );
}
