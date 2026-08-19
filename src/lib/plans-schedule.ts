// ─────────────────────────────────────────────────────────────────────────────
// PLAN SCHEDULE DERIVATION — pure, dependency-free
//
// Split out of plans.ts so this logic can be exercised directly by
// scratch/verify_plan_schedule.ts. plans.ts imports asset PNGs and the Supabase
// client, which a plain `tsx` run cannot resolve; nothing in this file imports
// anything at all, so the REAL derivation is testable rather than a copy of it.
//
// The rule implemented here mirrors sevasForMember() in src/lib/sankalp-logic.ts.
// If one changes, change the other: the plan page and the Pandit list must never
// disagree about which sevas happen on which day.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Row shapes (structural subsets of the DB rows) ──────────────────────────
export interface SevaRowLite {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface ScheduleRuleLite {
  seva_id: string;
  weekday: string;
  occurrence: string;
}

/** A seva as rendered publicly — schedule derived live from seva_schedule_rules. */
export type LiveSeva = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** e.g. ["2nd Tuesday"] or ["2nd Tuesday", "Last Saturday"] */
  days: string[];
  /** e.g. "1 time a month" | "2 times a month" ("" when no schedule rules) */
  frequency: string;
};

export type ComparisonValue = { has: boolean; frequency?: string; label?: string };

// ─── Labels ──────────────────────────────────────────────────────────────────
export const WEEKDAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export const WEEKDAY_LABELS: Record<string, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

export const OCCURRENCE_LABELS: Record<string, string> = {
  first: "1st",
  second: "2nd",
  third: "3rd",
  fourth: "4th",
  last: "Last",
};

export function frequencyLabel(timesPerMonth: number): string {
  return timesPerMonth === 1 ? "1 time a month" : `${timesPerMonth} times a month`;
}

/** A hawan seva (Griha Shanti / Sarv Rog Nivaran) — matches isHawanSeva() in sankalp-logic.ts. */
export function isHawanSeva(s: { slug: string; name: string }): boolean {
  return /hawan|havan/i.test(`${s.slug} ${s.name}`);
}

/** One seva with its GLOBAL schedule rules resolved into day labels. */
export function buildLiveSeva(seva: SevaRowLite, rules: ScheduleRuleLite[]): LiveSeva {
  const myRules = rules
    .filter((r) => r.seva_id === seva.id)
    .sort((a, b) => WEEKDAY_ORDER.indexOf(a.weekday) - WEEKDAY_ORDER.indexOf(b.weekday));
  const days = myRules.map(
    (r) => `${OCCURRENCE_LABELS[r.occurrence] ?? r.occurrence} ${WEEKDAY_LABELS[r.weekday] ?? r.weekday}`
  );
  return {
    id: seva.id,
    slug: seva.slug,
    name: seva.name,
    description: seva.description,
    days,
    frequency: days.length > 0 ? frequencyLabel(days.length) : "",
  };
}

/**
 * Re-derive each seva's schedule for ONE plan.
 *
 * seva_schedule_rules has no plan dimension — a row is (seva, weekday,
 * occurrence) globally — but what a subscriber actually receives depends on
 * their plan, because plan tier decides batch membership. This mirrors
 * computeBatchMembership() + sevasForMember() in sankalp-logic.ts:
 *
 *   - Hawan-INELIGIBLE plan (Basic): List A only, so every seva keeps its own
 *     rule days verbatim (all 2nd Tuesday today).
 *   - Hawan-ELIGIBLE plan (Premium / Premium Annual): the subscriber sits in
 *     BOTH batches — List A (2nd Tuesday) and List B (Last Saturday) — so each
 *     non-hawan seva runs on both days. The two hawans stay day-specific:
 *     Griha Shanti on List A, Sarv Rog Nivaran on List B. Each already carries
 *     exactly that single rule, so hawan sevas are passed through untouched.
 *
 * The List B day label is read off the hawans' own Saturday rule rather than
 * hardcoded, so an admin moving List B in the schedule manager moves this too.
 */
export function scheduleForPlan(includedSevas: LiveSeva[]): LiveSeva[] {
  const listBDay = includedSevas
    .filter(isHawanSeva)
    .flatMap((s) => s.days)
    .find((d) => d.endsWith(WEEKDAY_LABELS.SAT));
  if (!listBDay) return includedSevas; // no hawan → hawan-ineligible plan, List A only

  return includedSevas.map((s) => {
    if (isHawanSeva(s) || s.days.includes(listBDay)) return s;
    const days = [...s.days, listBDay]; // rule days are TUE-first, so this stays ordered
    return { ...s, days, frequency: frequencyLabel(days.length) };
  });
}

/**
 * The seva rows of one plan's comparison column, keyed by seva slug.
 *
 * Frequency comes from the PLAN-SCOPED seva, never the global rule row —
 * Premium runs Sundarkand twice a month and Basic once, same underlying seva.
 * `allSevas` is the full active catalog so absent sevas still get a ✗ row.
 */
export function buildSevaComparison(
  allSevas: LiveSeva[],
  includedSevas: LiveSeva[],
): Record<string, ComparisonValue> {
  const scopedById = new Map(includedSevas.map((s) => [s.id, s]));
  const out: Record<string, ComparisonValue> = {};
  allSevas.forEach((s) => {
    const scoped = scopedById.get(s.id);
    out[s.slug] = scoped
      ? { has: true, ...(scoped.frequency ? { frequency: scoped.frequency } : {}) }
      : { has: false };
  });
  return out;
}

/** Hindi feature bullets for a plan's included sevas, with their day labels. */
export function sevaFeatureLines(includedSevas: LiveSeva[]): string[] {
  return includedSevas.map((s) =>
    s.days.length > 1
      ? `${s.name} — ${s.days.length}× हर माह (${s.days.join(" & ")})`
      : s.days.length === 1
        ? `${s.name} — हर माह (${s.days[0]})`
        : s.name
  );
}
