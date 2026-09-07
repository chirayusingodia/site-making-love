// ─────────────────────────────────────────────────────────────
// PUNYATA — scheduled-seva date helpers (presentation only)
//
// The LOCKED sankalp cadence is calendar-derived, not stored per
// subscriber: every plan runs on the **2nd Tuesday** of each month,
// and hawan-bearing tiers (Premium / Premium Annual) ALSO run on the
// **last Saturday**. Admin creates the actual sankalp_batches rows;
// subscribers cannot read that table (no RLS grant), so the customer
// UI derives the NEXT scheduled date from the calendar instead. This
// is a cadence hint for display — never a claim that a batch row
// already exists.
//
// All arithmetic is anchored to IST so a viewer's local timezone can
// never shift the shown weekday/date (mirrors fmtDate in
// my-subscription.tsx).
// ─────────────────────────────────────────────────────────────

/** "now" as a Date whose Y/M/D fields read in IST. */
function istToday(): Date {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
  return new Date(`${s}T00:00:00`);
}

/** Nth (1-based) occurrence of a given weekday in a month. weekday: 0=Sun … 6=Sat. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const shift = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + shift + (n - 1) * 7);
}

/** Last occurrence of a given weekday in a month. */
function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0); // last day of month
  const shift = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - shift);
}

/** Translation keys for the two cadence labels — resolved by the caller via t(). */
export type SevaLabelKey = "sd_2nd_tuesday" | "sd_last_saturday";

export interface SevaDate {
  date: Date;
  /** i18n key for the cadence label — caller resolves with t(labelKey) */
  labelKey: SevaLabelKey;
}

/**
 * The next scheduled seva date at/after today for a plan.
 *
 * @param hasLastSaturday true for hawan-bearing tiers that also run on
 *        the month's last Saturday (Premium / Premium Annual).
 */
export function nextSevaDate(hasLastSaturday: boolean): SevaDate {
  const today = istToday();
  const y = today.getFullYear();
  const m = today.getMonth();

  const candidates: SevaDate[] = [];
  for (const [yy, mm] of [
    [y, m],
    [y, m + 1],
  ] as const) {
    candidates.push({ date: nthWeekday(yy, mm, 2 /* Tue */, 2), labelKey: "sd_2nd_tuesday" });
    if (hasLastSaturday) {
      candidates.push({ date: lastWeekday(yy, mm, 6 /* Sat */), labelKey: "sd_last_saturday" });
    }
  }

  const future = candidates
    .filter((c) => c.date.getTime() >= today.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Always resolves — next-month candidates guarantee a future date.
  return future[0] ?? candidates.sort((a, b) => a.date.getTime() - b.date.getTime())[0];
}

/** Whole calendar days from today (IST) until a date; 0 if today, never negative. */
export function daysUntil(d: Date): number {
  const today = istToday();
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  return Math.max(0, diff);
}

/** Whole months a subscription has been active, from its start date to today (min 0). */
export function monthsActive(startISO: string | null): number {
  if (!startISO) return 0;
  const iso = startISO.length === 10 ? `${startISO}T00:00:00+05:30` : startISO;
  const start = new Date(iso);
  if (isNaN(start.getTime())) return 0;
  const now = istToday();
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  return Math.max(0, months);
}

/** e.g. "मंगल, 13 अक्टूबर" / "Tue, 13 October" — IST-anchored, per language. */
export function fmtSevaDate(d: Date, lang: "hindi" | "english" = "hindi"): string {
  return d.toLocaleDateString(lang === "english" ? "en-IN" : "hi-IN", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  });
}
