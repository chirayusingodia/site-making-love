// ─────────────────────────────────────────────────────────────
// Telecaller review — PURE weekly rollup for the owner's review page.
// Truth sources:
//   conversions = first_deal ledger rows (one per subscriber per telecaller)
//   earnings    = positive ledger rows (₹80 / ₹20), net of clawbacks
//   effort      = call_logs (all calls, and contact-establishing ones)
// Every row is dated by the PAYMENT date (when the subscriber paid), not
// by when the reconciler happened to run. Weeks are IST, Monday-start.
// ─────────────────────────────────────────────────────────────

import { isContactEstablishingOutcome } from "./commission-logic";

const IST_MS = 5.5 * 3_600_000;
const DAY_MS = 24 * 3_600_000;

/** Monday (IST) of the week containing the instant, as YYYY-MM-DD. */
export function weekStartIst(ms: number): string {
  const ist = new Date(ms + IST_MS);
  const dow = (ist.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - dow),
  )
    .toISOString()
    .slice(0, 10);
}

export function addDays(isoDate: string, n: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export interface ReviewEntry {
  profile_id: string;
  kind: "first_deal" | "trail";
  status: string;
  amount_paise: number;
  /** payments.created_at of the payment this row was earned on. */
  paid_at: string | null;
  /** Fallback when the payment date is unavailable. */
  created_at: string;
}

export interface ReviewCall {
  called_by: string;
  outcome: string;
  created_at: string;
}

export interface ReviewPerson {
  id: string;
  full_name: string | null;
  phone: string | null;
}

export interface WeekStats {
  conversions: number;
  trailPayments: number;
  earnedPaise: number;
  calls: number;
  connected: number;
}

export interface WeekRow extends WeekStats {
  weekStart: string; // Monday
  weekEnd: string; // Sunday
  current: boolean;
}

export interface PersonReview {
  profileId: string;
  name: string;
  phone: string | null;
  weeks: WeekStats[]; // aligned with `weeks` below, oldest → newest
  totalConversions: number;
  totalEarnedPaise: number;
  totalCalls: number;
  totalConnected: number;
  /** Conversions per 100 connected calls, null when no connected calls. */
  conversionPer100: number | null;
  last7Conversions: number;
  prev7Conversions: number;
}

export interface TeamRolling {
  last7Conversions: number;
  prev7Conversions: number;
  last7EarnedPaise: number;
  prev7EarnedPaise: number;
}

export interface TelecallerReview {
  weeks: WeekRow[];
  people: PersonReview[];
  team: TeamRolling;
  totals: { conversions: number; earnedPaise: number; calls: number; connected: number };
}

const blank = (): WeekStats => ({
  conversions: 0,
  trailPayments: 0,
  earnedPaise: 0,
  calls: 0,
  connected: 0,
});

export function buildTelecallerReview(input: {
  nowMs: number;
  weekCount: number;
  entries: ReviewEntry[];
  calls: ReviewCall[];
  telecallers: ReviewPerson[];
}): TelecallerReview {
  const { nowMs, entries, calls } = input;
  const weekCount = Math.max(1, Math.min(26, Math.trunc(input.weekCount)));
  const currentWeek = weekStartIst(nowMs);
  const weekStarts: string[] = [];
  for (let i = weekCount - 1; i >= 0; i--) weekStarts.push(addDays(currentWeek, -7 * i));
  const weekIndex = new Map(weekStarts.map((w, i) => [w, i]));

  const people = new Map<string, ReviewPerson>(input.telecallers.map((t) => [t.id, t]));
  const stats = new Map<string, WeekStats[]>();
  const statsFor = (id: string): WeekStats[] => {
    let s = stats.get(id);
    if (!s) {
      s = weekStarts.map(blank);
      stats.set(id, s);
    }
    if (!people.has(id)) people.set(id, { id, full_name: null, phone: null });
    return s;
  };

  const todayMs = nowMs;
  const d7 = 7 * DAY_MS;
  const perPerson7 = new Map<string, { last: number; prev: number }>();
  const team: TeamRolling = {
    last7Conversions: 0,
    prev7Conversions: 0,
    last7EarnedPaise: 0,
    prev7EarnedPaise: 0,
  };

  for (const e of entries) {
    if (e.status === "void" || e.status === "clawed_back") continue;
    const at = Date.parse(e.paid_at ?? e.created_at);
    if (!Number.isFinite(at)) continue;
    const idx = weekIndex.get(weekStartIst(at));
    const isLast7 = at > todayMs - d7 && at <= todayMs;
    const isPrev7 = at > todayMs - 2 * d7 && at <= todayMs - d7;
    if (idx !== undefined) {
      const w = statsFor(e.profile_id)[idx];
      w.earnedPaise += e.amount_paise; // negative clawbacks net off
      if (e.amount_paise > 0) {
        if (e.kind === "first_deal") w.conversions += 1;
        else w.trailPayments += 1;
      }
    }
    if (e.amount_paise > 0 && e.kind === "first_deal") {
      const r = perPerson7.get(e.profile_id) ?? { last: 0, prev: 0 };
      if (isLast7) {
        r.last += 1;
        team.last7Conversions += 1;
      }
      if (isPrev7) {
        r.prev += 1;
        team.prev7Conversions += 1;
      }
      perPerson7.set(e.profile_id, r);
    }
    if (isLast7) team.last7EarnedPaise += e.amount_paise;
    if (isPrev7) team.prev7EarnedPaise += e.amount_paise;
  }

  for (const c of calls) {
    const at = Date.parse(c.created_at);
    if (!Number.isFinite(at)) continue;
    const idx = weekIndex.get(weekStartIst(at));
    if (idx === undefined) continue;
    const w = statsFor(c.called_by)[idx];
    w.calls += 1;
    if (isContactEstablishingOutcome(c.outcome)) w.connected += 1;
  }

  // Everyone with the telecaller seat shows up, even with a quiet period.
  for (const id of people.keys()) statsFor(id);

  const rows: PersonReview[] = [];
  for (const [id, weeks] of stats) {
    const p = people.get(id)!;
    const totalConversions = weeks.reduce((s, w) => s + w.conversions, 0);
    const totalConnected = weeks.reduce((s, w) => s + w.connected, 0);
    const r7 = perPerson7.get(id) ?? { last: 0, prev: 0 };
    rows.push({
      profileId: id,
      name: p.full_name?.trim() || "Unnamed telecaller",
      phone: p.phone,
      weeks,
      totalConversions,
      totalEarnedPaise: weeks.reduce((s, w) => s + w.earnedPaise, 0),
      totalCalls: weeks.reduce((s, w) => s + w.calls, 0),
      totalConnected,
      conversionPer100:
        totalConnected > 0 ? Math.round((totalConversions / totalConnected) * 1000) / 10 : null,
      last7Conversions: r7.last,
      prev7Conversions: r7.prev,
    });
  }
  rows.sort(
    (a, b) =>
      b.totalEarnedPaise - a.totalEarnedPaise ||
      b.totalConversions - a.totalConversions ||
      a.name.localeCompare(b.name),
  );

  const weekRows: WeekRow[] = weekStarts.map((ws, i) => {
    const sum = blank();
    for (const w of stats.values()) {
      sum.conversions += w[i].conversions;
      sum.trailPayments += w[i].trailPayments;
      sum.earnedPaise += w[i].earnedPaise;
      sum.calls += w[i].calls;
      sum.connected += w[i].connected;
    }
    return { ...sum, weekStart: ws, weekEnd: addDays(ws, 6), current: ws === currentWeek };
  });

  return {
    weeks: weekRows,
    people: rows,
    team,
    totals: {
      conversions: weekRows.reduce((s, w) => s + w.conversions, 0),
      earnedPaise: weekRows.reduce((s, w) => s + w.earnedPaise, 0),
      calls: weekRows.reduce((s, w) => s + w.calls, 0),
      connected: weekRows.reduce((s, w) => s + w.connected, 0),
    },
  };
}
