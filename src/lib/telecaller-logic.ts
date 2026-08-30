// ─────────────────────────────────────────────────────────────
// PUNYATA — Telecaller Panel: PURE business logic
//
// Mirrors the house split used by sales-agents-logic.ts /
// reports-logic.ts / sankalp-logic.ts: every decision in this
// file is a named, exported, dependency-free function — no
// Supabase client, no env, no hidden Date.now(). Callers pass
// data in (nowMs included); results come out. This is what makes
// the thirteen work queues and the ₹ masking unit-testable
// (scratch/verify_telecaller_panel.ts).
//
// ONLY import allowed: ./sankalp-logic — itself zero-import — so
// this module stays runnable by a plain `node scratch/*.ts`.
//
// SECURITY POSTURE (SESSION_TELECALLER_PANEL_PROMPT.md §4):
//   The telecaller sees STATUS WORDS and DATES only — never a ₹
//   figure, never a Razorpay ID, never a discount value, never a
//   commission. Masking lives HERE and at the API allowlist, not
//   in RLS (Postgres RLS is row-level and cannot hide a column).
//
// UI CONSEQUENCE (state it once, loudly): telecaller pages may
// NEVER query Supabase directly from the browser the way
// admin.subscribers.tsx does. A direct client query would either
// be blocked by RLS or leak whatever columns RLS allows.
// Telecaller pages call /api/telecaller/* only.
// ─────────────────────────────────────────────────────────────

// NOTE: relative import WITH explicit .ts extension (same as
// reports-logic.ts) so this module loads under plain-node scratch
// verification harnesses — no alias/bundler resolution available there.
import { type BatchKind, lastSaturdayOf, secondTuesdayOf, toISODate } from "./sankalp-logic.ts";

// ─── Tunable constants — ONE place, never inline literals ────

/** Don't resurface a person who was logged in the last N hours. */
export const CALL_COOLDOWN_HOURS = 24;

/** "Batch cutoff at risk" window before the next Sankalp batch. */
export const CUTOFF_RISK_WINDOW_HOURS = 72;

/** subscriptions.status='pending' older than this = abandoned checkout. */
export const ABANDONED_CHECKOUT_MINUTES = 30;

/** Signup younger than this stays out of the never_bought queue. */
export const NEVER_BOUGHT_MIN_HOURS = 1;

/** Became-active window for the welcome-call queue. */
export const WELCOME_CALL_WINDOW_HOURS = 48;

/** Win-back window after cancellation. */
export const RECENT_CANCELLED_DAYS = 30;

/** Warn-before-the-debit window for yearly renewals. */
export const RENEWAL_AHEAD_DAYS = 14;

/** Max leads one telecaller may create per day (fraud/fat-finger brake). */
export const LEAD_CREATE_DAILY_LIMIT = 30;

/**
 * C2 (REVIEW): per-caller daily cap on logged calls. log-call is THE
 * attribution input — an unbounded scripted sweep of no_answer rows
 * used to farm the 30-day call window. Generous enough for a full
 * day's dialling, tight enough to make bulk abuse impossible.
 */
export const LOG_CALL_DAILY_LIMIT = 250;

/** Hard page cap for every queue list response. No skip-ahead. */
export const QUEUE_PAGE_CAP = 50;

/**
 * "Fewer members than the plan allows" — the family_members schema
 * hard-caps slots at 4 (CHECK slot_number BETWEEN 1 AND 4), so 4 is
 * the ceiling a complete sankalp can reach. Derived, never stored.
 */
export const TARGET_MEMBER_COUNT = 4;

/** Queue 0 daily target (§8.2) — shown as "6/10 worked" on my-day. */
export const DAILY_LEAD_TARGET = 10;

/** Assigned-with-no-contact leads return to the pool after N days. */
export const LEAD_ROLLOVER_DAYS = 3;

/** A 'new' lead older than N days expires. */
export const LEAD_EXPIRY_DAYS = 60;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const IST_OFFSET_MS = 5.5 * HOUR_MS;

// ─── Work queues (§3 — this is the product) ──────────────────

export const TELECALLER_QUEUE_KEYS = [
  "aaj_ke_leads",
  "sankalp_pending",
  "cutoff_risk",
  "payment_failed",
  "abandoned_checkout",
  "never_bought",
  "paused",
  "recently_cancelled",
  "callback_due",
  "incomplete_details",
  "missing_prasad_address",
  "welcome_call",
  "renewal_ahead",
] as const;

export type TelecallerQueueKey = (typeof TELECALLER_QUEUE_KEYS)[number];

/** Sidebar copy + the "why you're calling" rationale, one line each. */
export const QUEUE_META: Record<TelecallerQueueKey, { title: string; why: string }> = {
  aaj_ke_leads: {
    title: "Aaj Ke Leads",
    why: "Field agent ne aaj aapko jo numbers diye hain — yahi aapka asli kaam hai",
  },
  sankalp_pending: {
    title: "Sankalp Pending",
    why: "Paid kar diya, par aage ke batch mein kuch nahi milega — naam bharna zaroori hai",
  },
  cutoff_risk: {
    title: "Batch Cutoff At Risk",
    why: "Agla batch aa raha hai — naam abhi nahi bhare to is baar miss ho jayega",
  },
  payment_failed: {
    title: "Payment Failed",
    why: "Payment fail ho gaya hai — seva band hone se pehle baat karein",
  },
  abandoned_checkout: {
    title: "Abandoned Checkout",
    why: "Buy karna chahte the, beech mein ruk gaye — sabse interested lead",
  },
  never_bought: {
    title: "Signed Up, Never Bought",
    why: "Number khud diya hai — plan ke baare mein pooch sakte hain",
  },
  paused: {
    title: "Paused",
    why: "Subscription pause par hai — wapas shuru karne ki wajah jaanein",
  },
  recently_cancelled: {
    title: "Recently Cancelled",
    why: "Cancel kar diya — wapas laane ka window abhi khula hai",
  },
  callback_due: {
    title: "Callback Due",
    why: "Inhone callback maanga tha — vaada poora karna zaroori hai",
  },
  incomplete_details: {
    title: "Incomplete Details",
    why: "Naam list mein jayenge, par gotra/relation adhoora hai",
  },
  missing_prasad_address: {
    title: "Missing Prasad Address",
    why: "Prasad bhejna hai — pincode ke bina dispatch nahi hoga",
  },
  welcome_call: {
    title: "Welcome Call",
    why: "Naye subscriber hain — pehla impression hi sab kuch hai",
  },
  renewal_ahead: {
    title: "Renewal Ahead",
    why: "Renewal aa raha hai — pehle bata dein taaki surprise na ho",
  },
};

export function isTelecallerQueueKey(v: unknown): v is TelecallerQueueKey {
  return typeof v === "string" && (TELECALLER_QUEUE_KEYS as readonly string[]).includes(v);
}

// ─── Call outcomes (§2.3 vocabulary) ─────────────────────────

export const CALL_OUTCOMES = [
  "connected_interested",
  "connected_completed",
  "connected_partial",
  "connected_refused",
  "callback_requested",
  "no_answer",
  "busy",
  "switched_off",
  "wrong_number",
  "do_not_call",
  "language_barrier",
  "complaint",
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/** Hinglish labels — the caller and customer share a language. */
export const OUTCOME_LABELS: Record<CallOutcome, string> = {
  connected_interested: "Interested — link bhej diya",
  connected_completed: "Baathui — details mil gayi",
  connected_partial: "Baathui — kuch details adhoori",
  connected_refused: "Mana kar diya",
  callback_requested: "Callback maanga",
  no_answer: "Uthaya nahi",
  busy: "Busy tha",
  switched_off: "Switched off",
  wrong_number: "Galat number",
  do_not_call: "Call mat karein (DND)",
  language_barrier: "Bhasha ki dikkat",
  complaint: "Shikayat — Chirayu ko bhejein",
};

export function isCallOutcome(v: unknown): v is CallOutcome {
  return typeof v === "string" && (CALL_OUTCOMES as readonly string[]).includes(v);
}

/** Outcomes that auto-set the escalation flag (§5.6). */
export function outcomeAutoEscalates(outcome: CallOutcome): boolean {
  return outcome === "complaint";
}

// ─── Structural row shapes (no ORM coupling) ─────────────────

export interface TelecallerMemberLite {
  fullName: string | null;
  gotra: string | null;
  relation: string | null;
}

/**
 * One callable person. Subscription-less leads (queue #5) carry
 * subscriptionId = null; everything else rides a subscription.
 * Only ALLOWLISTED fields appear here — this shape is what the
 * API serialises, so a new financial column can never ride along
 * by accident (allowlist-first, never select("*")-then-strip).
 */
export interface TelecallerQueueRow {
  subscriptionId: string | null;
  profileId: string;
  fullName: string | null;
  phone: string | null;
  /** Separate calling number, only set when different from `phone`
   *  (which stays the WhatsApp number) — call this one first. */
  altPhone: string | null;
  city: string | null;
  state: string | null;
  preferredLanguage: string | null;
  doNotCall: boolean;
  addressLine1: string | null;
  addressLine2: string | null;
  pincode: string | null;
  lastCalledAt: string | null;
  profileCreatedAt: string;

  // Subscription (null for bare leads)
  subscriptionStatus: string | null;
  subscriptionCreatedAt: string | null;
  startDate: string | null;
  nextBillingDate: string | null;
  pausedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;

  // Plan: NAME + CADENCE ONLY — never price
  planName: string | null;
  planBillingPeriod: string | null;
  hasPrasadAddon: boolean;

  // Family completeness (derived — migration 011 discipline)
  familyMemberCount: number;
  members: TelecallerMemberLite[];

  // Latest payment: STATUS WORD only — never an amount
  latestPaymentStatus: "captured" | "failed" | "pending" | "refunded" | null;
  latestPaymentMethod: string | null;
  latestPaymentPaidAt: string | null;
  latestPaymentFailureReason: string | null;
}

/** Minimal log projection for cooldown / callback-due decisions. */
export interface TelecallerCallLogLite {
  subscriptionId: string | null;
  profileId: string | null;
  outcome: string;
  callbackAt: string | null;
  createdAt: string;
}

/**
 * One assigned lead (queue 0, §8). Leads are NOT subscriptions —
 * a person may not exist as a profile yet. Visible fields only:
 * the field agent's own scribbles, plan interest by NAME, and the
 * attribution token she needs to build §5.5 links. No commission
 * figures, ever.
 */
export interface TelecallerLeadRow {
  leadId: string;
  fullName: string | null;
  phone: string;
  city: string | null;
  notes: string | null;
  /** Migration 020 — family-member names the field agent collected. */
  familyNames: string[] | null;
  status: string;
  interestedPlanName: string | null;
  profileId: string | null;
  attributionToken: string | null;
  assignedOn: string | null;
  createdAt: string;
}

function ms(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

// ─── Per-person log helpers ──────────────────────────────────

/**
 * All logs belonging to one person, newest first. Logs attach via
 * profile_id primarily; subscription-only logs match through the
 * subscription id (the API always writes both when both exist).
 */
export function logsForPerson(
  logs: TelecallerCallLogLite[],
  row: Pick<TelecallerQueueRow, "profileId" | "subscriptionId">,
): TelecallerCallLogLite[] {
  return logs
    .filter(
      (l) =>
        (l.profileId !== null && l.profileId === row.profileId) ||
        (row.subscriptionId !== null &&
          l.subscriptionId !== null &&
          l.subscriptionId === row.subscriptionId),
    )
    .sort((a, b) => (ms(b.createdAt) ?? 0) - (ms(a.createdAt) ?? 0));
}

/** Cooldown: was ANY log recorded inside the last N hours? */
export function wasCalledWithinCooldown(
  logs: TelecallerCallLogLite[],
  row: Pick<TelecallerQueueRow, "profileId" | "subscriptionId">,
  nowMs: number,
): boolean {
  const cutoff = nowMs - CALL_COOLDOWN_HOURS * HOUR_MS;
  return logsForPerson(logs, row).some((l) => (ms(l.createdAt) ?? Infinity) >= cutoff);
}

/**
 * Queue #8 — a promised callback that hasn't fired yet: the
 * person's MOST RECENT log promised a callback whose time has
 * passed. Any later log supersedes the promise (they were called
 * again since).
 */
export function isCallbackDue(
  logs: TelecallerCallLogLite[],
  row: Pick<TelecallerQueueRow, "profileId" | "subscriptionId">,
  nowMs: number,
): boolean {
  const mine = logsForPerson(logs, row);
  if (mine.length === 0) return false;
  const latest = mine[0];
  if (latest.outcome !== "callback_requested") return false;
  const due = ms(latest.callbackAt);
  return due !== null && due <= nowMs;
}

// ─── Derived incompleteness (never a stored flag) ────────────

export function isSankalpPending(row: TelecallerQueueRow): boolean {
  return row.subscriptionStatus === "active" && row.familyMemberCount === 0;
}

export function hasGotraGap(row: TelecallerQueueRow): boolean {
  return (
    row.familyMemberCount > 0 && row.members.some((m) => m.gotra === null || m.gotra.trim() === "")
  );
}

export function hasRelationGap(row: TelecallerQueueRow): boolean {
  return (
    row.familyMemberCount > 0 &&
    row.members.some((m) => m.relation === null || m.relation.trim() === "")
  );
}

/** Queue #9 — active, ≥1 member, but visibly incomplete somewhere. */
export function isIncompleteDetails(row: TelecallerQueueRow): boolean {
  return (
    row.subscriptionStatus === "active" &&
    row.familyMemberCount >= 1 &&
    (hasGotraGap(row) || hasRelationGap(row) || row.familyMemberCount < TARGET_MEMBER_COUNT)
  );
}

// ─── The thirteen queue predicates (named, one per queue) ──────

export function matchesSankalpPending(row: TelecallerQueueRow): boolean {
  return !row.doNotCall && isSankalpPending(row);
}

export function matchesCutoffRisk(
  row: TelecallerQueueRow,
  nextBatchAtMs: number,
  nowMs: number,
): boolean {
  if (row.doNotCall) return false;
  if (!(isSankalpPending(row) || hasGotraGap(row))) return false;
  const remaining = nextBatchAtMs - nowMs;
  return remaining > 0 && remaining <= CUTOFF_RISK_WINDOW_HOURS * HOUR_MS;
}

export function matchesPaymentFailed(row: TelecallerQueueRow): boolean {
  return (
    !row.doNotCall &&
    row.latestPaymentStatus === "failed" &&
    row.subscriptionStatus !== "cancelled" &&
    row.subscriptionStatus !== null
  );
}

export function matchesAbandonedCheckout(row: TelecallerQueueRow, nowMs: number): boolean {
  if (row.doNotCall || row.subscriptionStatus !== "pending") return false;
  const created = ms(row.subscriptionCreatedAt);
  return created !== null && nowMs - created >= ABANDONED_CHECKOUT_MINUTES * 60_000;
}

export function matchesNeverBought(row: TelecallerQueueRow, nowMs: number): boolean {
  if (row.doNotCall || row.subscriptionId !== null) return false;
  if (row.subscriptionStatus !== null) return false;
  const created = ms(row.profileCreatedAt);
  return created !== null && nowMs - created >= NEVER_BOUGHT_MIN_HOURS * HOUR_MS;
}

export function matchesPaused(row: TelecallerQueueRow): boolean {
  return !row.doNotCall && row.subscriptionStatus === "paused";
}

export function matchesRecentlyCancelled(row: TelecallerQueueRow, nowMs: number): boolean {
  if (row.doNotCall || row.subscriptionStatus !== "cancelled") return false;
  const cancelled = ms(row.cancelledAt);
  return cancelled !== null && nowMs - cancelled <= RECENT_CANCELLED_DAYS * DAY_MS;
}

export function matchesIncompleteDetails(row: TelecallerQueueRow): boolean {
  return !row.doNotCall && isIncompleteDetails(row);
}

export function matchesMissingPrasadAddress(row: TelecallerQueueRow): boolean {
  return (
    !row.doNotCall &&
    row.subscriptionStatus === "active" &&
    row.hasPrasadAddon &&
    (row.pincode === null || row.pincode.trim() === "")
  );
}

export function matchesWelcomeCall(
  row: TelecallerQueueRow,
  logs: TelecallerCallLogLite[],
  nowMs: number,
): boolean {
  if (row.doNotCall || row.subscriptionStatus !== "active") return false;
  const started = ms(row.startDate);
  if (started === null || nowMs - started > WELCOME_CALL_WINDOW_HOURS * HOUR_MS) {
    return false;
  }
  // "Never called" — not even a no-answer.
  return logsForPerson(logs, row).length === 0 && row.lastCalledAt === null;
}

export function matchesRenewalAhead(row: TelecallerQueueRow, nowMs: number): boolean {
  if (row.doNotCall || row.subscriptionStatus !== "active") return false;
  if (row.planBillingPeriod !== "yearly") return false;
  const billing = ms(row.nextBillingDate);
  if (billing === null) return false;
  const delta = billing - nowMs;
  return delta > 0 && delta <= RENEWAL_AHEAD_DAYS * DAY_MS;
}

// ─── Sankalp batch calendar (REUSES sankalp-logic — §3 note) ─

export interface NextBatchInfo {
  kind: BatchKind;
  /** YYYY-MM-DD of the batch day. */
  isoDate: string;
  /** Epoch ms of IST midnight on the batch day — the cutoff moment. */
  cutoffAtMs: number;
}

/**
 * The next upcoming Sankalp batch day at/after today (IST day of
 * `now`). Reuses secondTuesdayOf()/lastSaturdayOf() from
 * sankalp-logic — the calendar is NEVER re-derived here, so the
 * Pandit's batches and the telecaller's countdown can never
 * disagree.
 *
 * [Pass-2 L2] "Today" is the IST calendar day, not the UTC one: the
 * old getUTC* read lagged a day between 00:00–05:30 IST, returning an
 * ALREADY-PAST Second Tuesday with negative remaining hours right
 * after it passed.
 */
export function nextBatchCutoff(now: Date): NextBatchInfo {
  const istShifted = new Date(now.getTime() + IST_OFFSET_MS);
  const todayIso = toISODate(
    istShifted.getUTCFullYear(),
    istShifted.getUTCMonth() + 1,
    istShifted.getUTCDate(),
  );

  for (let offset = 0; offset <= 62; offset++) {
    const d = new Date(istShifted.getTime() + offset * DAY_MS);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const candidates: { kind: BatchKind; isoDate: string }[] = [];
    const tueIso = secondTuesdayOf(y, m);
    const satIso = lastSaturdayOf(y, m);
    // Zero-padded ISO strings only — a naive join() would compare
    // "2026-8-5" against "2026-08-11" and silently never match.
    if (todayIso <= tueIso) candidates.push({ kind: "second_tuesday", isoDate: tueIso });
    if (todayIso <= satIso) candidates.push({ kind: "last_saturday", isoDate: satIso });
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
    const picked = candidates[0];
    const [by, bm, bd] = picked.isoDate.split("-").map(Number);
    return {
      kind: picked.kind,
      isoDate: picked.isoDate,
      // Names must be in BEFORE the batch day begins (IST midnight).
      cutoffAtMs: Date.UTC(by, bm - 1, bd) - IST_OFFSET_MS,
    };
  }
  throw new Error("unreachable: no batch day within 62 days");
}

// ─── Orchestrator: assign every row to its queues ────────────

export type QueueAssignment = Record<TelecallerQueueKey, TelecallerQueueRow[]>;

function ascendingBy(get: (r: TelecallerQueueRow) => number | null) {
  return (a: TelecallerQueueRow, b: TelecallerQueueRow) =>
    (get(a) ?? Infinity) - (get(b) ?? Infinity);
}
function descendingBy(get: (r: TelecallerQueueRow) => number | null) {
  return (a: TelecallerQueueRow, b: TelecallerQueueRow) =>
    (get(b) ?? -Infinity) - (get(a) ?? -Infinity);
}

/**
 * Runs every predicate over the merged dataset and returns the
 * thirteen queues, each already sorted work-order. A row MAY appear
 * in several queues — that is correct (a sankalp-pending person
 * whose batch is close belongs in both #1 and #2).
 *
 * DNC (`do_not_call`) removes a person from EVERY queue — enforced
 * inside each predicate, not here, so no future queue can forget.
 */
export function assignQueues(input: {
  rows: TelecallerQueueRow[];
  logs: TelecallerCallLogLite[];
  nowMs: number;
}): QueueAssignment {
  const { rows, logs, nowMs } = input;
  const batch = nextBatchCutoff(new Date(nowMs));

  const out = {} as QueueAssignment;
  for (const key of TELECALLER_QUEUE_KEYS) out[key] = [];

  for (const row of rows) {
    const cooled = wasCalledWithinCooldown(logs, row, nowMs);

    // Cooldown hides everyone logged in the last N hours — EXCEPT
    // callback-due (the promise itself is the reason to call again)
    // and welcome-call (which requires zero contact anyway).
    if (matchesSankalpPending(row) && !cooled) out.sankalp_pending.push(row);
    if (matchesCutoffRisk(row, batch.cutoffAtMs, nowMs) && !cooled) out.cutoff_risk.push(row);
    if (matchesPaymentFailed(row) && !cooled) out.payment_failed.push(row);
    if (matchesAbandonedCheckout(row, nowMs) && !cooled) out.abandoned_checkout.push(row);
    if (matchesNeverBought(row, nowMs) && !cooled) out.never_bought.push(row);
    if (matchesPaused(row) && !cooled) out.paused.push(row);
    if (matchesRecentlyCancelled(row, nowMs) && !cooled) out.recently_cancelled.push(row);
    // Callback-due deliberately IGNORES the cooldown.
    if (!row.doNotCall && isCallbackDue(logs, row, nowMs)) out.callback_due.push(row);
    if (matchesIncompleteDetails(row) && !cooled) out.incomplete_details.push(row);
    if (matchesMissingPrasadAddress(row) && !cooled) out.missing_prasad_address.push(row);
    // Welcome-call requires ZERO prior contact, so cooldown is moot.
    if (matchesWelcomeCall(row, logs, nowMs)) out.welcome_call.push(row);
    if (matchesRenewalAhead(row, nowMs) && !cooled) out.renewal_ahead.push(row);
  }

  out.sankalp_pending.sort(ascendingBy((r) => ms(r.startDate ?? r.subscriptionCreatedAt)));
  out.cutoff_risk.sort(ascendingBy((r) => ms(r.startDate ?? r.subscriptionCreatedAt)));
  // Money is silently leaking — longest-broken first.
  out.payment_failed.sort(ascendingBy((r) => ms(r.latestPaymentPaidAt ?? r.cancelledAt)));
  // Freshest intent first — abandonment goes cold in hours.
  out.abandoned_checkout.sort(descendingBy((r) => ms(r.subscriptionCreatedAt)));
  out.never_bought.sort(ascendingBy((r) => ms(r.profileCreatedAt)));
  // Longest-paused = closest to gone.
  out.paused.sort(ascendingBy((r) => ms(r.pausedAt)));
  // The win-back window is closing.
  out.recently_cancelled.sort(descendingBy((r) => ms(r.cancelledAt)));
  // Earliest promised callback first — a promise that fired hours
  // ago outranks one due tonight.
  out.callback_due.sort((a, b) => {
    const da = ms(logsForPerson(logs, a)[0]?.callbackAt ?? null) ?? Infinity;
    const db = ms(logsForPerson(logs, b)[0]?.callbackAt ?? null) ?? Infinity;
    return da - db;
  });
  out.incomplete_details.sort(ascendingBy((r) => ms(r.startDate ?? r.subscriptionCreatedAt)));
  out.missing_prasad_address.sort(ascendingBy((r) => ms(r.startDate ?? r.subscriptionCreatedAt)));
  out.welcome_call.sort(descendingBy((r) => ms(r.startDate)));
  // Soonest debit first.
  out.renewal_ahead.sort(ascendingBy((r) => ms(r.nextBillingDate)));

  return out;
}

/** Live counts payload shape returned by /api/telecaller/queues. */
export interface QueuesResponse {
  queues: { key: TelecallerQueueKey; title: string; why: string; count: number }[];
  nextBatch: NextBatchInfo | null;
  cutoffHoursRemaining: number | null;
}

// ─── Field allowlist + masking (§4 — the security core) ──────

/**
 * Fields that must NEVER leave any /api/telecaller/* handler.
 * Endpoints build their `.select()` from the allowlists below so
 * these columns are never fetched in the first place — this list
 * is defence-in-depth applied over the response body before it is
 * sent, because the NEXT schema addition would otherwise leak by
 * default. Never select("*").
 *
 * DELIBERATELY NOT MASKED (§1 decision #2, supersedes the earlier
 * "zero ₹" framing): plans.price_paise — prices are public on
 * /plans and she is selling them — and coupon codes, which she may
 * quote. What stays dark: payment AMOUNTS on other people's money,
 * gateway IDs, discount values/types, anyone else's commission,
 * and every company aggregate.
 *
 * The mandate_* entries cover the gateway-neutral columns introduced
 * by migration 022 (subscriber_list_view now surfaces the CURRENT
 * mandate's gateway + id there). The legacy razorpay_* names are kept
 * alongside them on purpose: this list is defence-in-depth, and a
 * stale-but-harmless entry costs nothing while a missing one leaks.
 */
export const TELECALLER_MASKED_FIELDS = [
  "amount_paise",
  "razorpay_sub_id",
  "razorpay_payment_id",
  "razorpay_order_id",
  "razorpay_customer_id",
  "gateway_mandate_id",
  "gateway_customer_id",
  "mandate_gateway_id",
  "discount_value",
  "discount_type",
  "commission_percent",
] as const;

export type TelecallerMaskedField = (typeof TELECALLER_MASKED_FIELDS)[number];

/**
 * Recursively deletes every masked key from an outgoing payload.
 * Applied LAST in every handler — after allowlisted selects, as a
 * wire-format guarantee. Mutates nothing; returns a new structure.
 */
export function stripMaskedFieldsDeep<T>(payload: T): T {
  if (Array.isArray(payload)) {
    return payload.map(stripMaskedFieldsDeep) as unknown as T;
  }
  if (payload !== null && typeof payload === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      if ((TELECALLER_MASKED_FIELDS as readonly string[]).includes(k)) continue;
      out[k] = stripMaskedFieldsDeep(v);
    }
    return out as unknown as T;
  }
  return payload;
}

/** Spec name for the same guarantee (§4: maskForTelecaller()). */
export const maskForTelecaller = stripMaskedFieldsDeep;

/** Person columns the panel may ever read — the .select() source. */
export const TC_PROFILE_COLS =
  "id,full_name,phone,alt_phone,city,state,address_line1,address_line2,pincode," +
  "preferred_language,do_not_call,last_called_at,created_at";

/** Subscription columns — status words and dates only. */
export const TC_SUBSCRIPTION_COLS =
  "id,user_id,status,start_date,next_billing_date,paused_at,cancelled_at," +
  "cancel_reason,created_at";

/** Plan columns — name, cadence, and the PUBLIC price (§1 #2). */
export const TC_PLAN_COLS = "name,billing_period,price_paise";

/** Payment columns — the status word set. Never amount_paise. */
export const TC_PAYMENT_COLS = "subscription_id,status,method,paid_at,failure_reason,created_at";

/** Family-member columns (all visible per §4). */
export const TC_FAMILY_COLS = "id,subscription_id,full_name,gotra,relation,slot_number,dob";

/** Her own call history columns. */
export const TC_CALLLOG_COLS =
  "id,subscription_id,profile_id,called_by,queue,outcome,notes,callback_at," +
  "identity_verified,escalated,created_at";

// ─── Cursor pagination — work the queue, don't browse it ─────

export interface CursorPage<T> {
  items: T[];
  /** Pass back verbatim for the next slice; null when exhausted. */
  nextCursor: string | null;
}

/**
 * Opaque continuation cursor over an ALREADY-ORDERED array. The
 * cursor encodes the LAST RETURNED ITEM'S IDENTITY — there is no
 * numeric page parameter to skip ahead with. An unrecognised
 * cursor (queue reshuffled underneath her) returns an empty page
 * rather than guessing a position.
 */
export function paginateByIdentity<T>(
  items: T[],
  cursor: string | null,
  limit: number,
  identity: (item: T) => string,
): CursorPage<T> {
  const capped = Math.max(1, Math.min(Math.floor(limit) || QUEUE_PAGE_CAP, QUEUE_PAGE_CAP));
  let start = 0;
  if (cursor) {
    let decoded: { last?: string };
    try {
      decoded = JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
    } catch {
      return { items: [], nextCursor: null };
    }
    const idx = decoded?.last ? items.findIndex((it) => identity(it) === decoded.last) : -1;
    if (idx === -1) return { items: [], nextCursor: null };
    start = idx + 1;
  }
  const items2 = items.slice(start, start + capped);
  const exhaustedOrMore = start + capped;
  const nextCursor =
    exhaustedOrMore < items.length && items2.length > 0
      ? Buffer.from(JSON.stringify({ last: identity(items2[items2.length - 1]) }), "utf8").toString(
          "base64",
        )
      : null;
  return { items: items2, nextCursor };
}

// ─── "Why you're calling" banner (§6.4, Hinglish) ────────────

export function bannerForQueue(key: TelecallerQueueKey, row: TelecallerQueueRow): string {
  switch (key) {
    case "aaj_ke_leads":
      return `Aaj ka lead — ${row.fullName ?? "naam nahi"} ko call karke plan samjhaein`;
    case "sankalp_pending":
      return `Sankalp adhoora hai — ${TARGET_MEMBER_COUNT} mein se ${row.familyMemberCount} naam bhare hain`;
    case "cutoff_risk":
      return "Agla batch nazdeek hai — naam abhi nahi bhare to is baar list mein nahi jayenge";
    case "payment_failed":
      return `Payment fail ho gaya hai${
        row.latestPaymentMethod ? ` (${row.latestPaymentMethod})` : ""
      }${row.latestPaymentFailureReason ? ` — karan: ${row.latestPaymentFailureReason}` : ""}`;
    case "abandoned_checkout":
      return "Aapne plan chuna tha par payment adhoora reh gaya — thodi madad chahiye?";
    case "never_bought":
      return "Aap Punyata par sign up hue hain — plan ke baare mein jaanna chahenge?";
    case "paused":
      return `Subscription pause par hai${row.pausedAt ? ` (${row.pausedAt.slice(0, 10)} se)` : ""}`;
    case "recently_cancelled":
      return `Cancel ho gaya${row.cancelReason ? ` — karan: ${row.cancelReason}` : ""} — wapas laane ki koshish`;
    case "callback_due":
      return "Aapne kaha tha baad mein call karein — wahi call hai";
    case "incomplete_details":
      return `Details adhoori hain — ${row.familyMemberCount} naam bhare hain, gotra/relation check karein`;
    case "missing_prasad_address":
      return "Prasad bhejna hai — poori address chahiye";
    case "welcome_call":
      return "Punyata par swagat hai — pehla call, taarif aur jaankari";
    case "renewal_ahead":
      return `Renewal ${
        row.nextBillingDate ? `${row.nextBillingDate} ko` : "jald"
      } hai — pehle soochit kar dena`;
  }
}
