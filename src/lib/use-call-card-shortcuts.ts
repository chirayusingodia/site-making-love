import { useEffect } from "react";
import { QUICK_OUTCOME_SHORTCUTS, type CallOutcome } from "@/lib/telecaller-logic";

/**
 * Keyboard-first outcome logging for the call cards (Phase 2 UI pass).
 * Digits 1-9 pick from QUICK_OUTCOME_SHORTCUTS in order; Enter fires
 * the primary "Log & Next" action once an outcome is chosen. Ignored
 * while focus sits in a text input/textarea/select so it never fights
 * typing in the notes field or a callback datetime picker.
 */
export function useCallCardShortcuts(opts: {
  enabled: boolean;
  onPickOutcome: (outcome: CallOutcome) => void;
  onSubmit: () => void;
  canSubmit: boolean;
}) {
  const { enabled, onPickOutcome, onSubmit, canSubmit } = opts;

  useEffect(() => {
    if (!enabled) return;

    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      if (e.key === "Enter" && canSubmit) {
        e.preventDefault();
        onSubmit();
        return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= QUICK_OUTCOME_SHORTCUTS.length) {
        e.preventDefault();
        onPickOutcome(QUICK_OUTCOME_SHORTCUTS[n - 1]);
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, onPickOutcome, onSubmit, canSubmit]);
}
