// ─────────────────────────────────────────────────────────────
// PUNYATA — Offline (QR / cash) subscribers: business logic (PURE)
//
// Offline subscribers are FULL subscribers who pay each month by
// scanning Punyata's UPI QR (or cash / bank transfer) instead of a
// Razorpay mandate. Everything date- and money-shaped lives HERE and
// nowhere else: the API routes call these functions and the SQL RPCs
// (migration 042) only VALIDATE + APPLY the result atomically. A
// second copy of the date math in SQL is exactly the drift bug the
// commission session paid for.
//
// Zero imports from server code, no hidden Date.now(): callers pass
// `now` / `today` in, so every rule is unit-testable
// (scratch/verify_offline_logic.ts).
// ─────────────────────────────────────────────────────────────

import { buildWaLink, daysInMonth, toISODate } from "./sankalp-logic.ts";

export const OFFLINE_GRACE_DAYS = 7;
export const DUE_SOON_DAYS = 3;
export const OFFLINE_METHODS = ["upi_qr", "cash", "bank_transfer"] as const;
export type OfflineMethod = (typeof OFFLINE_METHODS)[number];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Date primitives (all YYYY-MM-DD, calendar arithmetic) ───

/** IST calendar date (YYYY-MM-DD) of an instant. Shifts first, then
 *  reads the ISO string — never mixes getUTC*() with a local zone. */
export function todayIST(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

export function addDaysIso(iso: string, days: number): string {
  const { y, m, d } = parseIso(iso);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole calendar days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  const pa = parseIso(a);
  const pb = parseIso(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / DAY_MS);
}

/**
 * Adds calendar months while holding the billing ANCHOR day, so a
 * 31st-of-month subscriber doesn't drift: anchor 31 gives
 * Jan 31 → Feb 28 → Mar 31 (not Mar 28). The day becomes
 * min(anchorDay, daysInMonth) every time.
 */
export function addMonthsAnchored(isoDate: string, months: number, anchorDay: number): string {
  const { y, m } = parseIso(isoDate);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return toISODate(ny, nm, Math.min(anchorDay, daysInMonth(ny, nm)));
}

// ─── Coverage ────────────────────────────────────────────────

export interface CoverageInput {
  /** null / 'pending' = brand-new subscription (no cover yet). */
  status: string | null;
  nextBillingDate: string | null;
  anchorDay: number | null;
  paidOn: string;
  monthsCovered: number;
}

export interface Coverage {
  periodStart: string;
  periodEnd: string;
  anchorDay: number;
  /** true when this payment lifts a halted (lapsed) subscription. */
  reactivate: boolean;
}

/**
 * Which stretch of time does a payment buy?
 *  - new subscription, or `halted` (lapsed): cover restarts from the
 *    day the money was paid; the anchor becomes that day-of-month.
 *  - `active` (late-within-grace OR early): cover continues from the
 *    existing due date and the anchor is unchanged — a late payer gets
 *    no free days, an early payer extends their cover.
 */
export function computeCoverage(input: CoverageInput): Coverage {
  const { status, nextBillingDate, anchorDay, paidOn, monthsCovered } = input;
  const isNew = status === null || status === "pending";
  const isHalted = status === "halted";

  if (isNew || isHalted || !nextBillingDate) {
    const anchor = parseIso(paidOn).d;
    return {
      periodStart: paidOn,
      periodEnd: addMonthsAnchored(paidOn, monthsCovered, anchor),
      anchorDay: anchor,
      reactivate: isHalted,
    };
  }
  const anchor = anchorDay ?? parseIso(nextBillingDate).d;
  return {
    periodStart: nextBillingDate,
    periodEnd: addMonthsAnchored(nextBillingDate, monthsCovered, anchor),
    anchorDay: anchor,
    reactivate: false,
  };
}

// ─── Due state ───────────────────────────────────────────────

export type DueState =
  "paid" | "due_soon" | "overdue_grace" | "lapsed" | "cancelled" | "not_offline";

/** A sub lapses when next_billing_date < lapseCutoff(today). */
export function lapseCutoff(today: string, graceDays: number = OFFLINE_GRACE_DAYS): string {
  return addDaysIso(today, -graceDays);
}

export function dueState(input: {
  status: string;
  paymentMode: string | null | undefined;
  nextBillingDate: string | null;
  today: string;
}): DueState {
  const { status, paymentMode, nextBillingDate, today } = input;
  if (paymentMode !== "offline_qr") return "not_offline";
  if (status === "cancelled" || status === "expired") return "cancelled";
  // halted = already lapsed. Anything else that isn't active (pending /
  // paused) never carries QR cover, so it reads as lapsed too.
  if (status !== "active") return "lapsed";
  if (!nextBillingDate) return "paid";
  // Same predicate the nightly cron applies, so the register can never
  // disagree with the sweep about who is about to drop out.
  if (nextBillingDate < lapseCutoff(today)) return "lapsed";
  const daysUntil = daysBetween(today, nextBillingDate);
  if (daysUntil < 0) return "overdue_grace";
  if (daysUntil <= DUE_SOON_DAYS) return "due_soon";
  return "paid";
}

// ─── Money ───────────────────────────────────────────────────

/** PREFILL only — the owner types what was actually received. */
export function defaultAmountPaise(
  planPricePaise: number,
  billingPeriod: string | null,
  monthsCovered: number,
): number {
  if (billingPeriod === "yearly") return Math.round((planPricePaise * monthsCovered) / 12);
  return planPricePaise * monthsCovered;
}

// ─── Request validation ──────────────────────────────────────

export const MIN_QR_PAYMENT_PAISE = 100; // ₹1
export const MAX_QR_PAYMENT_PAISE = 10_000_000; // ₹1 lakh
export const MAX_BACKDATE_DAYS = 400;
export const CLOUDINARY_PROOF_PREFIX = "https://res.cloudinary.com/";

export interface RecordPaymentFields {
  amountPaise: number;
  paidOn: string;
  monthsCovered: number;
  method: OfflineMethod;
  referenceNo: string | null;
  proofUrl: string | null;
  notes: string | null;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealIsoDate(s: string): boolean {
  if (!ISO_RE.test(s)) return false;
  const { y, m, d } = parseIso(s);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

/** The ONE validator for a QR payment — create + record-payment routes
 *  both call this. No inline validation in any route. */
export interface PaymentEditFields {
  method: OfflineMethod;
  referenceNo: string | null;
  proofUrl: string | null;
  notes: string | null;
}

/** Validator for editing method / UTR / screenshot / note of a recorded
 *  payment. Amount and dates are NOT editable (they move due dates). */
export function parsePaymentEditBody(body: unknown): ParseResult<PaymentEditFields> {
  if (!body || typeof body !== "object") return { ok: false, error: "Details zaroori hain" };
  const b = body as Record<string, unknown>;
  // Reuse the one record-payment validator with harmless stand-ins for the
  // fields an edit doesn't carry, so the rules can never drift apart.
  const r = parseRecordPaymentBody(
    {
      amountPaise: MIN_QR_PAYMENT_PAISE,
      paidOn: "2000-01-01",
      monthsCovered: 1,
      method: b.method,
      referenceNo: b.referenceNo,
      proofUrl: b.proofUrl,
      notes: b.notes,
    },
    "2000-01-02",
  );
  if (!r.ok) return r;
  return {
    ok: true,
    value: {
      method: r.value.method,
      referenceNo: r.value.referenceNo,
      proofUrl: r.value.proofUrl,
      notes: r.value.notes,
    },
  };
}

export function parseRecordPaymentBody(
  body: unknown,
  today: string = todayIST(new Date()),
): ParseResult<RecordPaymentFields> {
  if (!body || typeof body !== "object")
    return { ok: false, error: "Payment details zaroori hain" };
  const b = body as Record<string, unknown>;

  const amount = b.amountPaise;
  if (
    typeof amount !== "number" ||
    !Number.isInteger(amount) ||
    amount < MIN_QR_PAYMENT_PAISE ||
    amount > MAX_QR_PAYMENT_PAISE
  ) {
    return {
      ok: false,
      error: "Amount ₹1 se ₹1,00,000 ke beech ek poori paise value honi chahiye",
    };
  }

  const paidOn = b.paidOn;
  if (typeof paidOn !== "string" || !isRealIsoDate(paidOn)) {
    return { ok: false, error: "Payment ki tareekh (YYYY-MM-DD) sahi nahi hai" };
  }
  if (paidOn > today) return { ok: false, error: "Payment ki tareekh aage ki nahi ho sakti" };
  if (daysBetween(paidOn, today) > MAX_BACKDATE_DAYS) {
    return { ok: false, error: "Payment ki tareekh 400 din se purani nahi ho sakti" };
  }

  const months = b.monthsCovered;
  if (typeof months !== "number" || !Number.isInteger(months) || months < 1 || months > 24) {
    return { ok: false, error: "Months covered 1 se 24 ke beech hona chahiye" };
  }

  const method = b.method;
  if (typeof method !== "string" || !(OFFLINE_METHODS as readonly string[]).includes(method)) {
    return { ok: false, error: "Payment method upi_qr, cash ya bank_transfer hona chahiye" };
  }

  let referenceNo: string | null = null;
  if (b.referenceNo !== undefined && b.referenceNo !== null && b.referenceNo !== "") {
    if (typeof b.referenceNo !== "string") return { ok: false, error: "UTR sahi nahi hai" };
    const ref = b.referenceNo.trim().toUpperCase();
    if (ref.length > 64) return { ok: false, error: "UTR 64 characters se chhota hona chahiye" };
    referenceNo = ref.length > 0 ? ref : null;
  }

  let notes: string | null = null;
  if (b.notes !== undefined && b.notes !== null && b.notes !== "") {
    if (typeof b.notes !== "string") return { ok: false, error: "Note sahi nahi hai" };
    const n = b.notes.trim();
    if (n.length > 1000) return { ok: false, error: "Note 1000 characters se chhota hona chahiye" };
    notes = n.length > 0 ? n : null;
  }

  let proofUrl: string | null = null;
  if (b.proofUrl !== undefined && b.proofUrl !== null && b.proofUrl !== "") {
    if (typeof b.proofUrl !== "string" || !b.proofUrl.startsWith(CLOUDINARY_PROOF_PREFIX)) {
      return { ok: false, error: "Screenshot ka link Cloudinary se hona chahiye" };
    }
    proofUrl = b.proofUrl;
  }

  return {
    ok: true,
    value: {
      amountPaise: amount,
      paidOn,
      monthsCovered: months,
      method: method as OfflineMethod,
      referenceNo,
      proofUrl,
      notes,
    },
  };
}

/** Noon IST keeps a payment inside its IST month on every reader. */
export function paidAtFromDate(paidOn: string): string {
  return `${paidOn}T12:00:00+05:30`;
}

// ─── Reminder copy ───────────────────────────────────────────

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function fmtDueDate(iso: string): string {
  const { y, m, d } = parseIso(iso);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** Hinglish reminder WITHOUT an amount — safe for telecaller surfaces. */
export function buildQrReminderText(input: { name: string; dueDate: string }): string {
  const name = input.name.trim() || "Bhakt";
  return (
    `🙏 Jai Shri Ram ${name} ji,\n` +
    `Aapki Punyata seva ka agla monthly payment ${fmtDueDate(input.dueDate)} ko due hai. ` +
    `Seva nirantar chalti rahe, isliye kripya payment kar dein aur screenshot yahin bhej dein. 🕉️`
  );
}

/** OWNER-ONLY screen: may carry the amount and the UPI VPA. */
export function buildOwnerReminderLink(input: {
  name: string;
  phone: string;
  dueDate: string;
  amountPaise: number;
  vpa?: string | null;
}): string {
  const rupees = (input.amountPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  let text = buildQrReminderText({ name: input.name, dueDate: input.dueDate });
  text += `\nAmount: ₹${rupees}`;
  if (input.vpa) text += `\nUPI: ${input.vpa}`;
  return buildWaLink(input.phone, text);
}

// ─── RPC error mapping (migration 042 RAISE messages) ────────

export interface MappedRpcError {
  status: 400 | 403 | 409 | 500;
  message: string;
}

/** Maps a Postgres/PostgREST error from the offline RPCs onto an HTTP
 *  status + house-style Hinglish copy. One place, so create /
 *  record-payment / void / cancel can never disagree. */
export function mapOfflineRpcError(
  err: { message?: string; code?: string } | null,
): MappedRpcError {
  const msg = err?.message ?? "";
  if (/\bstale\b/.test(msg)) {
    return { status: 409, message: "Kisi aur ne abhi update kiya — refresh karein" };
  }
  if (/conflict: already subscribed/.test(msg)) {
    return { status: 409, message: "Is number par pehle se subscription chal rahi hai" };
  }
  if (err?.code === "23505" || /uq_offline_payment_reference|duplicate key/i.test(msg)) {
    return { status: 409, message: "Yeh UTR pehle se record hai" };
  }
  if (/conflict: only the latest payment/.test(msg)) {
    return { status: 409, message: "Sirf sabse latest payment void ho sakti hai" };
  }
  if (/conflict: subscription has moved on/.test(msg)) {
    return {
      status: 409,
      message: "Is payment ke baad subscription aage badh chuki hai — void nahi ho sakti",
    };
  }
  if (/conflict: commission/.test(msg)) {
    return { status: 409, message: "Is payment par commission ban chuka hai — void nahi ho sakti" };
  }
  if (/^conflict:/.test(msg) || /conflict: subscription is/.test(msg)) {
    return {
      status: 409,
      message: `Yeh action abhi nahi ho sakta (${msg.replace(/^.*conflict:\s*/, "")})`,
    };
  }
  if (/forbidden/.test(msg)) return { status: 403, message: "Owner access required" };
  if (/^invalid:/.test(msg)) return { status: 400, message: msg.replace(/^invalid:\s*/, "") };
  return { status: 500, message: msg || "Request fail ho gayi" };
}
