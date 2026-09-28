import type { TelecallerQueueUrgency } from "@/lib/telecaller-logic";

const URGENCY_STYLE: Record<TelecallerQueueUrgency, { label: string; cls: string }> = {
  critical: { label: "Zaroori", cls: "bg-red-50 text-red-700 border-red-200" },
  high: { label: "Jaldi", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  normal: { label: "Normal", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

/** Visual priority tag for the queue stack (Phase 2 UI pass) —
 *  makes the ordering legible, not just implied by array position. */
export function UrgencyChip({ urgency }: { urgency: TelecallerQueueUrgency }) {
  const s = URGENCY_STYLE[urgency];
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border flex-none ${s.cls}`}>
      {s.label}
    </span>
  );
}
