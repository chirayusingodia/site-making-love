// ─────────────────────────────────────────────────────────────
// PUNYATA — Session 4: Sankalp batch business logic (PURE)
//
// Everything in this file is a pure function with zero imports.
// No Supabase client, no env, no Date.now() hidden inside —
// callers pass data in, results come out. This is what makes the
// Tuesday/Saturday independence and catch-up rules unit-testable
// (see scratch/verify_session4.ts).
//
// LOCKED RULES IMPLEMENTED HERE (do not deviate):
//  - Puja exactly twice a month: SECOND Tuesday (List A) + Last
//    Saturday (List B). Never weekly. (List A moved from the First
//    to the Second Tuesday; the twice-a-month cadence is unchanged.)
//  - List A = ALL active subscribers, sevas per live plan_sevas.
//  - List B = only hawan-plan subscribers. ONE batch, not two. The
//    former 'hawan_only' / 'full_package' split is retired: it created
//    two rows over the IDENTICAL member set, so every List B
//    subscriber was enrolled twice and counted twice. There is no
//    tier that receives a hawan without the rest of its sevas.
//  - The two hawans are day-specific, NOT interchangeable: Griha
//    Shanti Hawan on the Second Tuesday, Sarv Rog Nivaran Hawan on
//    the Last Saturday, per seva_schedule_rules. Non-hawan sevas run
//    on every batch day their plan is in. Basic has NO hawan at all.
//  - Catch-up: hawan-INELIGIBLE (e.g. Basic) subscriber who joins
//    after that month's Second Tuesday gets a ONE-TIME inclusion in
//    that month's Last Saturday batch, is_catchup=true.
//  - Tuesday and Saturday batches are ALWAYS independent records.
//  - Status labels: Done / Pending / Missed only. Never "Covered".
// ─────────────────────────────────────────────────────────────

// CONFIRMED (Session 4 revision): 5 SUBSCRIPTIONS (family units)
// per segment — NOT 20 subscriptions. Each subscription has up to
// 4 family members, so one segment's combined video covers at most
// 5 × 4 = 20 NAMES. The old SEGMENT_GROUP_SIZE = 20 counted
// subscriptions — wrong unit, corrected here.
export const SEGMENT_SIZE_SUBSCRIPTIONS = 5;
export const SEGMENT_MAX_NAMES = SEGMENT_SIZE_SUBSCRIPTIONS * 4; // 20

// ─── Shared minimal types (structural — no ORM coupling) ─────

export interface SevaLite {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
}

export interface PlanSevaRow {
  plan_id: string;
  seva_id: string;
}

export interface ScheduleRuleRow {
  seva_id: string;
  weekday: string; // 'TUE' | 'SAT' | ...
  occurrence: string; // 'second' (TUE) | 'last' (SAT)
}

export interface SubscriptionLite {
  id: string;
  plan_id: string;
  status: string;
  start_date: string | null; // ISO or null
  created_at: string; // ISO
}

/**
 * Every batch_type value that may exist in sankalp_batches.
 * List A is the SECOND Tuesday; List B is the LAST Saturday.
 */
export type BatchKind = "second_tuesday" | "last_saturday";

// ─── Date helpers (timezone-safe: pure y/m/d math, UTC DOW) ──

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toISODate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Day of week for a YYYY-MM-DD string. 0=Sun … 2=Tue … 6=Sat. */
export function dayOfWeek(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * SECOND Tuesday of the given month as YYYY-MM-DD — List A's seva day.
 * Always computed live for the target month; never a hardcoded date.
 * The second Tuesday always falls on day 8-14 inclusive.
 */
export function secondTuesdayOf(y: number, m: number): string {
  for (let d = 8; d <= 14; d++) {
    if (dayOfWeek(toISODate(y, m, d)) === 2) return toISODate(y, m, d);
  }
  throw new Error(`unreachable: no Tuesday in second week of ${y}-${m}`);
}

/** Last Saturday of the given month as YYYY-MM-DD. */
export function lastSaturdayOf(y: number, m: number): string {
  for (let d = daysInMonth(y, m); d > daysInMonth(y, m) - 7; d--) {
    if (dayOfWeek(toISODate(y, m, d)) === 6) return toISODate(y, m, d);
  }
  throw new Error(`unreachable: no Saturday in last week of ${y}-${m}`);
}

/**
 * Is this date a valid batch day? Returns the batch kind or null.
 * A date is a Second Tuesday ONLY of its own month, likewise Last
 * Saturday — never "a" Tuesday, THE second one.
 */
export function batchKindForDate(isoDate: string): BatchKind | null {
  const [y, m] = isoDate.split("-").map(Number);
  if (isoDate === secondTuesdayOf(y, m)) return "second_tuesday";
  if (isoDate === lastSaturdayOf(y, m)) return "last_saturday";
  return null;
}

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatDateEN(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d} ${MONTHS_EN[m - 1]} ${y}`;
}

/** Human label for a batch. Contains NO plan/price info — safe for Pandit view. */
export function batchLabel(kind: BatchKind, isoDate: string): string {
  const day = formatDateEN(isoDate);
  return kind === "second_tuesday"
    ? `Second Tuesday Sankalp — ${day}`
    : `Last Saturday Sankalp — ${day}`;
}

// ─── Hawan detection (live from sevas rows — never hardcoded IDs) ───

export function isHawanSeva(seva: Pick<SevaLite, "name" | "slug">): boolean {
  return /hawan/i.test(seva.name) || /hawan/i.test(seva.slug);
}

/**
 * Hawan sevas scheduled for Last Saturday (weekday SAT, occurrence 'last').
 * Fallback: if schedule rules name none, all hawan sevas — so the list is
 * never silently empty if rules are edited.
 */
export function saturdayHawanSevaIds(
  sevas: SevaLite[],
  rules: ScheduleRuleRow[],
): string[] {
  const ruled = new Set(
    rules
      .filter((r) => r.weekday === "SAT" && r.occurrence === "last")
      .map((r) => r.seva_id),
  );
  const hawans = sevas.filter((s) => s.is_active && isHawanSeva(s));
  const matched = hawans.filter((s) => ruled.has(s.id)).map((s) => s.id);
  return matched.length > 0 ? matched : hawans.map((s) => s.id);
}

/**
 * EVERY active hawan seva regardless of which day it is scheduled on.
 *
 * [Bug 4.5] Batch-membership ELIGIBILITY ("is this a hawan plan?") used
 * the Saturday-scoped list — so a plan whose only hawan was scheduled
 * for the Second Tuesday was treated as hawan-INELIGIBLE and its
 * subscribers fell through to the one-time catch-up path instead of
 * permanent List B membership. Eligibility is about the plan CONTAINING
 * a hawan; day-scoping stays with sevasForMember/saturdayHawanSevaIds.
 */
export function allHawanSevaIds(sevas: SevaLite[]): string[] {
  return sevas.filter((s) => s.is_active && isHawanSeva(s)).map((s) => s.id);
}

// ─── Membership computation (the locked List A / List B rules) ───

export interface BatchMembershipRow {
  subscription_id: string;
  is_catchup: boolean;
}

function joinedAtISO(sub: SubscriptionLite): string {
  // Activation is webhook-driven; start_date is the true join moment.
  // created_at is the fallback for legacy rows. Date part only.
  return (sub.start_date ?? sub.created_at).slice(0, 10);
}

function planHasHawan(planId: string, planSevas: PlanSevaRow[], hawanIds: Set<string>): boolean {
  return planSevas.some((ps) => ps.plan_id === planId && hawanIds.has(ps.seva_id));
}

/**
 * Compute who belongs in a batch, LIVE from the inputs given.
 * No caching anywhere upstream may store this result ahead of time.
 *
 * kind='second_tuesday':
 *   every active subscription joined on/before batch date. No catch-up.
 *
 * kind='last_saturday' (ONE batch — see the header note on the retired variants):
 *   - hawan-plan subscribers: always in, is_catchup=false.
 *   - hawan-ineligible subscribers: in ONLY if they joined after this
 *     month's Second Tuesday and on/before the batch date → one-time
 *     catch-up, is_catchup=true. From month 2 the window condition
 *     excludes them automatically (normal Tuesday-only cycle).
 *
 * The catch-up cutoff is the List A batch DAY ITSELF, with no offset —
 * joining ON the Second Tuesday means you were in List A that day, so
 * only a strictly-later join earns the one-time Saturday catch-up. That
 * zero-offset semantic is unchanged by the First → Second Tuesday shift;
 * only the day the cutoff lands on moved.
 */
export function computeBatchMembership(input: {
  kind: BatchKind;
  batchDate: string; // YYYY-MM-DD
  subscriptions: SubscriptionLite[];
  planSevas: PlanSevaRow[];
  hawanSevaIds: string[];
}): BatchMembershipRow[] {
  const { kind, batchDate, subscriptions, planSevas } = input;
  const hawanIds = new Set(input.hawanSevaIds);
  const actives = subscriptions.filter((s) => s.status === "active");

  const rows: BatchMembershipRow[] = [];
  for (const sub of actives) {
    const joined = joinedAtISO(sub);
    if (joined > batchDate) continue; // wasn't a subscriber yet on batch day

    // List A takes every active subscriber; no catch-up concept applies.
    if (kind === "second_tuesday") {
      rows.push({ subscription_id: sub.id, is_catchup: false });
      continue;
    }

    // last_saturday
    if (planHasHawan(sub.plan_id, planSevas, hawanIds)) {
      rows.push({ subscription_id: sub.id, is_catchup: false });
      continue;
    }

    const [y, m] = batchDate.split("-").map(Number);
    const secondTue = secondTuesdayOf(y, m);
    if (joined > secondTue && joined <= batchDate) {
      rows.push({ subscription_id: sub.id, is_catchup: true });
    }
    // else: hawan-ineligible long-time subscriber → Tuesday-only, excluded.
  }

  // Deterministic order: catch-ups last, then by subscription id.
  rows.sort((a, b) =>
    a.is_catchup === b.is_catchup
      ? a.subscription_id.localeCompare(b.subscription_id)
      : a.is_catchup
        ? 1
        : -1,
  );
  return rows;
}

// ─── Per-subscriber seva resolution (Pandit list + WhatsApp copy) ───

/** The (weekday, occurrence) that a batch kind's day falls on. */
function batchDayFor(kind: BatchKind): { weekday: string; occurrence: string } {
  return kind === "second_tuesday"
    ? { weekday: "TUE", occurrence: "second" }
    : { weekday: "SAT", occurrence: "last" };
}

/**
 * Is this HAWAN seva scheduled for the given batch day?
 *
 * Only hawans are day-scoped (see sevasForMember). A hawan with NO schedule
 * rule at all is treated as unscoped and kept — a missing rule must never
 * silently drop a seva an admin put in a plan, matching the same
 * never-silently-empty stance as saturdayHawanSevaIds().
 */
function hawanRuledForDay(
  sevaId: string,
  rules: ScheduleRuleRow[],
  day: { weekday: string; occurrence: string },
): boolean {
  const mine = rules.filter((r) => r.seva_id === sevaId);
  if (mine.length === 0) return true;
  return mine.some((r) => r.weekday === day.weekday && r.occurrence === day.occurrence);
}

/**
 * Which sevas are performed for ONE subscriber in ONE batch.
 *
 * NON-HAWAN sevas run on EVERY batch day their plan participates in — a
 * Premium subscriber is in both List A and List B, so their Sundarkand Path,
 * Gau Seva, Vanar Seva and Saadhu Santo Ko Bhojan each happen twice a month.
 * Basic has no hawan, so it never joins List B and its three sevas run once.
 *
 * HAWAN sevas are day-scoped by seva_schedule_rules, because the two hawans
 * are NOT interchangeable: Griha Shanti Hawan is the Second Tuesday hawan and
 * Sarv Rog Nivaran Hawan is the Last Saturday hawan. Without this scoping both
 * hawans would appear on both days (plan_sevas alone has no day dimension).
 * This keeps the Pandit list and WhatsApp copy in step with the plan page,
 * which derives the same thing in scheduleForPlan() in src/lib/plans.ts.
 *
 *  - second_tuesday: plan sevas, hawans limited to TUE/second.
 *  - last_saturday: (plan sevas ∪ Saturday hawans), hawans limited to SAT/last.
 *  - last_saturday + isCatchup: plan sevas ONLY — the one-time catch-up
 *    explicitly EXCLUDES hawan (Basic late-joiner rule), so day-scoping the
 *    hawans is moot but harmless.
 */
export function sevasForMember(input: {
  kind: BatchKind;
  planId: string;
  planSevas: PlanSevaRow[];
  sevas: SevaLite[];
  saturdayHawanSevaIds: string[];
  scheduleRules: ScheduleRuleRow[];
  isCatchup?: boolean;
}): SevaLite[] {
  const { kind, planId, planSevas, sevas, saturdayHawanSevaIds, scheduleRules } = input;
  const byId = new Map(sevas.map((s) => [s.id, s]));

  const ids = new Set(
    planSevas.filter((ps) => ps.plan_id === planId).map((ps) => ps.seva_id),
  );
  if (kind === "last_saturday" && !input.isCatchup) {
    for (const id of saturdayHawanSevaIds) ids.add(id);
  }
  const day = batchDayFor(kind);
  return [...ids]
    .map((id) => byId.get(id))
    .filter((s): s is SevaLite => !!s && s.is_active)
    .filter((s) => !isHawanSeva(s) || hawanRuledForDay(s.id, scheduleRules, day))
    .sort((a, b) => a.sort_order - b.sort_order);
}

// ─── Segment assignment (TIER-PURE — hard constraint) ───

/**
 * Chunk a batch's subscriptions into segments of
 * SEGMENT_SIZE_SUBSCRIPTIONS, NEVER mixing tiers in one segment.
 *
 * Each segment gets ONE combined proof video (sevas + name-reading),
 * and that video's seva content differs by tier — so a Basic family
 * and a Premium family can never share a segment.
 *
 * tierKey: the subscriber's resolved seva signature for THIS batch
 * kind (sorted seva ids from sevasForMember). Plans with identical
 * live composition (e.g. Premium + Premium Annual) share a tierKey
 * and MAY share a segment; catch-up subscribers (hawan excluded)
 * always land in their own tier bucket.
 *
 * Input order is preserved WITHIN each tier bucket (caller decides —
 * admin UI uses join-date order). Segment numbers are 1-based,
 * assigned tier-bucket by tier-bucket in order of first appearance.
 */
export function assignSegmentsTierPure(
  members: { subscription_id: string; tierKey: string }[],
): { subscription_id: string; segment_number: number }[] {
  const buckets = new Map<string, string[]>();
  for (const m of members) {
    if (!buckets.has(m.tierKey)) buckets.set(m.tierKey, []);
    buckets.get(m.tierKey)!.push(m.subscription_id);
  }
  const out: { subscription_id: string; segment_number: number }[] = [];
  let segmentNumber = 0;
  for (const ids of buckets.values()) {
    for (let i = 0; i < ids.length; i += SEGMENT_SIZE_SUBSCRIPTIONS) {
      segmentNumber++;
      for (const id of ids.slice(i, i + SEGMENT_SIZE_SUBSCRIPTIONS)) {
        out.push({ subscription_id: id, segment_number: segmentNumber });
      }
    }
  }
  return out;
}

/**
 * Seva-signature tier key for one subscriber in one batch.
 *
 * [Bug 4.8] The key used to be ONLY the seva-id signature, so two
 * genuinely different plans with identical composition were
 * indistinguishable in segment-level reporting. Pass `planId` to
 * scope the bucket per plan (stricter than "MAY share a segment",
 * never mixes tiers, and keeps every plan auditable on its own).
 */
export function tierKeyForMember(sevas: SevaLite[], planId?: string | null): string {
  const sig = sevas
    .map((s) => s.id)
    .sort()
    .join("|");
  return planId ? `${planId}::${sig}` : sig;
}

// ─── Pandit-facing grouping (seva name + name-gotra ONLY) ───

export interface PanditMember {
  subscription_id: string;
  sevas: SevaLite[];
  names: { name: string; gotra: string | null }[];
  is_catchup: boolean;
}

export interface PanditGroup {
  key: string; // seva signature (sorted ids)
  sevas: SevaLite[];
  names: { name: string; gotra: string | null }[];
  catchupCount: number;
}

/**
 * Groups a batch's members by their resolved seva composition, so the
 * Pandit list never mixes a catch-up Basic family (3 sevas) into the
 * full-package group (6 sevas). Output contains NO plan name, price,
 * or phone — only seva names + flat name-gotra rows.
 */
export function groupForPandit(members: PanditMember[]): PanditGroup[] {
  const map = new Map<string, PanditGroup>();
  for (const m of members) {
    const key = m.sevas
      .map((s) => s.id)
      .sort()
      .join("|");
    if (!map.has(key)) {
      map.set(key, { key, sevas: m.sevas, names: [], catchupCount: 0 });
    }
    const g = map.get(key)!;
    g.names.push(...m.names);
    if (m.is_catchup) g.catchupCount++;
  }
  const groups = [...map.values()];
  for (const g of groups) g.names.sort((a, b) => a.name.localeCompare(b.name));
  groups.sort((a, b) => (a.sevas[0]?.sort_order ?? 0) - (b.sevas[0]?.sort_order ?? 0));
  return groups;
}

// ─── WhatsApp wa.me stub (Meta API pending — no real API calls) ───

/** '98765 43210' → '919876543210'; '+91-9876543210' → '919876543210'. */
export function normalizePhoneForWa(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits; // already E.164-ish or unusual — pass through
}

export function buildWaLink(phoneRaw: string, message: string): string {
  const phone = normalizePhoneForWa(phoneRaw);
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/**
 * Delivery message copy. ONE message per subscriber — their
 * segment's single combined video (sevas + name-reading, edited
 * externally). whatsapp_msg_id stays NULL on the delivery row
 * until Meta API goes live.
 */
export function buildDeliveryMessage(input: {
  sevaNames: string[];
  batchLabelText: string;
  videoUrl: string | null;
}): string {
  const sevaLines = input.sevaNames.map((n) => `• ${n}`).join("\n");
  return `🙏 Punyata Seva Proof — ${input.batchLabelText}\n\nAapki nimitta sevayein sampann hui:\n${sevaLines}\n\nSeva aur parivaar ke naam-sankalp ka video:\n${input.videoUrl ?? "(video attach karein)"}\n\n— Punyata · Sewa Hamari, Punya Aapka`;
}

// ─── Batch completion payload (single-row update — independence) ───

/**
 * Builds the exact update payload for "Mark Seva Completed".
 * The caller MUST apply it with .eq('id', batchId) on ONE row.
 * There is deliberately no batch_type in the payload —
 * completion can never leak across batches because it is keyed
 * only by the target row's own primary key.
 */
export function buildCompletionUpdate(subscriberCount: number): {
  status: "done";
  completed_at: string;
  subscriber_count: number;
} {
  return {
    status: "done",
    completed_at: new Date().toISOString(),
    subscriber_count: subscriberCount,
  };
}
