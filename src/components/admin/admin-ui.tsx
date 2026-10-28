// Shared building blocks for every /admin page, so the whole panel reads as
// one product: same page header, same KPI tile, same panel chrome, same
// tab bar, same empty state. Visual tokens live in styles.css (.admin-ui).
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Page title row: title + one-line description on the left, actions on the right. Stacks on mobile. */
export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Small trailing text under the description, e.g. "Updated 09:48". */
  meta?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-stone-500 max-w-3xl">{description}</p>}
        {meta && <p className="mt-1 text-xs text-stone-400">{meta}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export type Tone = "neutral" | "good" | "warn" | "bad" | "info";

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-stone-300",
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-rose-500",
  info: "bg-sky-500",
};
const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-stone-500",
  good: "text-emerald-700",
  warn: "text-amber-700",
  bad: "text-rose-700",
  info: "text-sky-700",
};

/** Compact KPI tile. `status` renders as a coloured dot + short text, never a loud badge. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  status,
  loading,
  to,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  status?: { tone: Tone; text: string };
  loading?: boolean;
  /** Makes the whole tile a link. */
  to?: string;
  className?: string;
}) {
  const body = (
    <div
      className={cn(
        "admin-card h-full p-4 sm:p-5 flex flex-col gap-3",
        to && "transition-colors hover:border-stone-300 hover:bg-stone-50/60",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-medium text-stone-500 leading-snug">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" aria-hidden />}
      </div>
      {loading ? (
        <div className="h-8 w-24 rounded-md bg-stone-100 animate-pulse" />
      ) : (
        <div className="text-2xl sm:text-[28px] font-semibold tracking-tight text-stone-900 tabular-nums leading-none">
          {value}
        </div>
      )}
      {(hint || status) && (
        <div className="mt-auto flex flex-col gap-1.5">
          {status && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium",
                TONE_TEXT[status.tone],
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full", TONE_DOT[status.tone])} />
              {status.text}
            </span>
          )}
          {hint && <span className="text-xs text-stone-500 leading-relaxed">{hint}</span>}
        </div>
      )}
    </div>
  );
  return to ? (
    <Link to={to} className="block h-full rounded-[var(--admin-radius)]">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Card with an optional title row. Use for every grouped block of content. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  flush,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** No body padding — for tables that should run edge to edge. */
  flush?: boolean;
}) {
  return (
    <section className={cn("admin-card overflow-hidden", className)}>
      {(title || actions) && (
        <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between px-4 sm:px-5 pt-4 pb-3 border-b border-stone-100">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-stone-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-stone-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cn(flush ? "" : "p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Horizontal-scroll wrapper for wide tables so they never break the page on a phone. */
export function TableScroll({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto overscroll-x-contain", className)}>{children}</div>
  );
}

/** Segmented tab bar (pill style). Scrolls horizontally on narrow screens. */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cn("max-w-full overflow-x-auto", className)}>
      <div role="tablist" className="inline-flex gap-1 rounded-lg bg-stone-100 p-1">
        {items.map((it) => {
          const active = it.value === value;
          return (
            <button
              key={it.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(it.value)}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-800",
              )}
            >
              {it.label}
              {it.count !== undefined && (
                <span
                  className={cn(
                    "ml-1.5 text-xs tabular-nums",
                    active ? "text-stone-500" : "text-stone-400",
                  )}
                >
                  {it.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Centered empty / locked state inside a panel. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-10 px-4 gap-2",
        className,
      )}
    >
      {Icon && (
        <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center mb-1">
          <Icon className="w-5 h-5 text-stone-400" />
        </div>
      )}
      <p className="text-sm font-medium text-stone-700">{title}</p>
      {description && <p className="text-xs text-stone-500 max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Inline notice banner (info / warning / error / success). */
export function Notice({
  tone = "info",
  icon: Icon,
  children,
  className,
}: {
  tone?: "info" | "warn" | "bad" | "good";
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  const cls = {
    info: "bg-sky-50 border-sky-200 text-sky-900",
    warn: "bg-amber-50 border-amber-200 text-amber-900",
    bad: "bg-rose-50 border-rose-200 text-rose-900",
    good: "bg-emerald-50 border-emerald-200 text-emerald-900",
  }[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
        cls,
        className,
      )}
    >
      {Icon && <Icon className="w-4 h-4 mt-0.5 shrink-0 opacity-80" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Small status pill for table cells. */
export function StatusPill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const cls = {
    neutral: "bg-stone-100 text-stone-700",
    good: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-800",
    bad: "bg-rose-50 text-rose-700",
    info: "bg-sky-50 text-sky-700",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        cls,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", TONE_DOT[tone])} />
      {children}
    </span>
  );
}
