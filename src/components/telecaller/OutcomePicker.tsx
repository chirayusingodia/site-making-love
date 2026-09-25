import {
  CALL_OUTCOMES,
  OUTCOME_LABELS,
  QUICK_OUTCOME_SHORTCUTS,
  type CallOutcome,
} from "@/lib/telecaller-logic";

const RARE_OUTCOMES = CALL_OUTCOMES.filter((o) => !QUICK_OUTCOME_SHORTCUTS.includes(o));

/**
 * Chip-row outcome picker (Phase 2 UI pass) — replaces the plain
 * <select>. Each quick outcome carries its keyboard-shortcut number
 * so the number row on screen teaches the shortcut instead of hiding
 * it. The three rare/sensitive outcomes (DND, language barrier,
 * complaint) stay unnumbered on a second row — mouse-only by design,
 * see QUICK_OUTCOME_SHORTCUTS's own comment.
 */
export function OutcomePicker({
  value,
  onChange,
}: {
  value: CallOutcome | "";
  onChange: (o: CallOutcome) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {QUICK_OUTCOME_SHORTCUTS.map((o, i) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              value === o
                ? "bg-indigo-700 border-indigo-700 text-white"
                : "bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/60"
            }`}
          >
            <span
              className={`text-[9px] font-mono w-3.5 h-3.5 rounded-full flex items-center justify-center flex-none ${
                value === o ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
              }`}
            >
              {i + 1}
            </span>
            {OUTCOME_LABELS[o]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {RARE_OUTCOMES.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              value === o
                ? "bg-red-700 border-red-700 text-white"
                : "bg-white border-slate-200 text-slate-500 hover:border-red-300 hover:bg-red-50/60"
            }`}
          >
            {OUTCOME_LABELS[o]}
          </button>
        ))}
      </div>
    </div>
  );
}
