import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────
// PUNYATA — Session 6: Razorpay webhook logic (server-only)
//
// This module is the ONLY code path in the entire product that
// ever sets subscriptions.status = 'active'. No client-side code
// can do it (RLS blocks it); no other server route does it.
//
// FINANCIAL CORRECTNESS RULES IMPLEMENTED HERE (do not deviate):
//  - HMAC-SHA256 of the RAW request body, keyed with
//    RAZORPAY_WEBHOOK_SECRET, must equal the X-Razorpay-Signature
//    header. Compared with timingSafeEqual — never ===.
//  - Payment rows are UPSERTED on razorpay_payment_id (UNIQUE) so
//    Razorpay's at-least-once delivery can never double-record.
//  - subscription.payment.failed NEVER touches subscription status
//    on the first failure. Only after 3 CONSECUTIVE failed payments
//    (most-recent-first count over payments history, any captured
//    payment breaks the chain) does status drop to 'pending'.
//  - Failed→pending transition only fires from 'active' — never
//    stomps 'paused' or 'cancelled'.
//  - Razorpay's OWN 'subscription.pending' fires on the very FIRST
//    failed charge attempt (T+0) — stricter than our deliberate
//    3-consecutive-failure grace buffer above. We do NOT let it
//    override that buffer (a single card blip should not visibly
//    demote a subscriber) — it is audit-logged only, so the
//    discrepancy between "Razorpay already flagged this" and "we're
//    still showing active" stays visible without changing behaviour.
//  - Every processed event writes an audit_logs row (admin_id NULL
//    = system actor) so reactivations/failures are reconstructable.
//  - refund.* events are a SEPARATE event family (fired off the
//    payment object, no subscription entity) — see
//    processRefundEvent below. A refund only ever mutates the
//    payments row it belongs to; it NEVER touches
//    subscriptions.status. Only 'refund.processed' (a CONFIRMED
//    refund) writes anything — 'refund.created'/'refund.failed' are
//    audit-logged only, since the money hasn't (or never) moved.
// ─────────────────────────────────────────────────────────────

// Razorpay → Punyata subscription status mapping.
// Razorpay 'completed' (all cycles charged, tenure over) maps to our
// 'expired' — the schema CHECK has no 'completed' value.
export const SUPPORTED_EVENTS = [
  "subscription.activated",
  "subscription.charged",
  "subscription.payment.failed",
  "subscription.pending",
  "subscription.paused",
  "subscription.halted",
  "subscription.resumed",
  "subscription.cancelled",
  "subscription.completed",
] as const;

export type SupportedEvent = (typeof SUPPORTED_EVENTS)[number];

// Refunds are a SEPARATE Razorpay event family — fired off the payment
// object, not the subscription. A refund never touches subscriptions.status
// or the mandate; it corrects a past payment. Handled below by
// processRefundEvent, dispatched to from processWebhookEvent by event prefix.
export const SUPPORTED_REFUND_EVENTS = [
  "refund.created",
  "refund.processed",
  "refund.failed",
  "refund.speed_changed",
] as const;

export type SupportedRefundEvent = (typeof SUPPORTED_REFUND_EVENTS)[number];

/** Every event this webhook module does anything with. Documentation/
 *  reference only — Razorpay Dashboard → Webhooks → Active Events should
 *  subscribe to exactly this list. */
export const ALL_SUPPORTED_EVENTS = [...SUPPORTED_EVENTS, ...SUPPORTED_REFUND_EVENTS] as const;

/** Consecutive failures required before a subscription is demoted. */
export const FAILURE_DEMOTE_THRESHOLD = 3;

// ─── Signature verification ──────────────────────────────────

/**
 * Verifies Razorpay's webhook signature.
 * expected = HMAC_SHA256(rawBody, secret), hex-encoded.
 * Returns false (never throws) on missing signature, length
 * mismatch, or digest mismatch.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ─── Payload normalisation ───────────────────────────────────

export interface RazorpaySubscriptionEntity {
  id?: string;
  plan_id?: string;
  customer_id?: string;
  status?: string;
  paid_count?: number;
  current_start?: number; // unix seconds
  current_end?: number; // unix seconds
  charge_at?: number; // unix seconds — next auto charge
  start_at?: number;
}

export interface RazorpayPaymentEntity {
  id?: string;
  amount?: number; // paise
  currency?: string;
  status?: string; // 'captured' | 'failed' | ...
  method?: string; // 'upi' | 'card' | ...
  created_at?: number; // unix seconds
  error_code?: string | null;
  error_description?: string | null;
  error_reason?: string | null;
  // Present on refund.* events' payload.payment.entity only.
  amount_refunded?: number; // paise, cumulative
  refund_status?: string | null; // 'partial' | 'full' | null
}

export interface WebhookContext {
  event: string;
  razorpaySubId: string | null;
  subscription: RazorpaySubscriptionEntity | null;
  payment: RazorpayPaymentEntity | null;
}

// ─── Refund payload normalisation ────────────────────────────
// Razorpay refund webhooks carry payload.refund.entity + payload.payment.entity
// — there is no subscription entity at all, so this is intentionally a
// separate context type rather than overloading WebhookContext.

export interface RazorpayRefundEntity {
  id?: string; // rfnd_...
  payment_id?: string; // pay_... — the payment this refund is against
  amount?: number; // paise, THIS refund's amount (not cumulative)
  status?: string; // 'processed' | 'failed'
  speed_requested?: string;
  speed_processed?: string;
  created_at?: number; // unix seconds
}

export interface RefundWebhookContext {
  event: string;
  refund: RazorpayRefundEntity | null;
  payment: RazorpayPaymentEntity | null;
}

/**
 * Pulls the refund + payment entities out of a Razorpay refund webhook
 * body. Same structural-typing discipline as extractContext: anything
 * absent degrades to null, never throws.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractRefundContext(body: any): RefundWebhookContext {
  const refund = body?.payload?.refund?.entity ?? null;
  const payment = body?.payload?.payment?.entity ?? null;
  return {
    event: typeof body?.event === "string" ? body.event : "",
    refund,
    payment,
  };
}

/**
 * Pulls the subscription + payment entities out of a Razorpay
 * webhook body. Structural typing throughout — Razorpay adds
 * fields over time; anything absent degrades to null, never throws.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractContext(body: any): WebhookContext {
  const sub = body?.payload?.subscription?.entity ?? null;
  const pay = body?.payload?.payment?.entity ?? null;
  return {
    event: typeof body?.event === "string" ? body.event : "",
    razorpaySubId: typeof sub?.id === "string" ? sub.id : null,
    subscription: sub,
    payment: pay,
  };
}

// ─── Pure date / money helpers ───────────────────────────────

/** Unix seconds → 'YYYY-MM-DD' as seen on an Indian calendar. */
export function toIstDateString(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}

/** Unix seconds → full ISO timestamptz string. */
export function unixToIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Next billing date for a subscription, from Razorpay's entity.
 * charge_at is the authoritative "next auto-debit" moment; fall
 * back to current_end (cycle end), else null (leave column as-is).
 */
export function nextBillingDateFrom(sub: RazorpaySubscriptionEntity | null): string | null {
  const ts = sub?.charge_at ?? sub?.current_end;
  return typeof ts === "number" && ts > 0 ? toIstDateString(ts) : null;
}

// ─── Pure decision functions ─────────────────────────────────

export interface SubscriptionPatch {
  status?: "pending" | "active" | "paused" | "cancelled" | "expired" | "halted";
  start_date?: string;
  next_billing_date?: string;
  paused_at?: string | null;
  cancelled_at?: string | null;
  halted_at?: string | null;
}

/**
 * The subscription-row patch for an event. Pure — no I/O.
 * activated/charged/resumed are the ONLY producers of
 * status:'active' anywhere in the product, and they only ever
 * run inside this webhook module.
 */
export function subscriptionPatchForEvent(
  event: string,
  ctx: WebhookContext,
  nowIso: string,
): SubscriptionPatch | null {
  const nextBilling = nextBillingDateFrom(ctx.subscription);
  switch (event) {
    case "subscription.activated": {
      const startTs = ctx.subscription?.start_at ?? ctx.subscription?.current_start;
      return {
        status: "active",
        ...(typeof startTs === "number" && startTs > 0
          ? { start_date: toIstDateString(startTs) }
          : {}),
        ...(nextBilling ? { next_billing_date: nextBilling } : {}),
        paused_at: null,
        cancelled_at: null,
        halted_at: null,
      };
    }
    case "subscription.charged":
    case "subscription.resumed":
      // resumed/charged also clear halted_at — a halt that Razorpay
      // recovers from must not leave a stale halt timestamp behind.
      return {
        status: "active",
        ...(nextBilling ? { next_billing_date: nextBilling } : {}),
        paused_at: null,
        cancelled_at: null,
        halted_at: null,
      };
    case "subscription.pending":
      // Deliberately a no-op. Razorpay considers the mandate "pending"
      // from the FIRST failed charge attempt — our own demotion policy
      // (FAILURE_DEMOTE_THRESHOLD = 3) is a intentionally more lenient
      // grace buffer so one transient card blip doesn't visibly demote
      // a subscriber. subscription.pending is still SUPPORTED (routed
      // through here, audit-logged by processWebhookEvent's unconditional
      // insert below) so the signal isn't silently dropped as
      // "unsupported" — just never applied to subscriptions.status.
      return null;
    case "subscription.paused":
      // Clearing halted_at mirrors charged/resumed: a halt that moved
      // on to a pause must not leave a stale halt timestamp behind
      // [Bug 1.8].
      return { status: "paused", paused_at: nowIso, halted_at: null };
    case "subscription.halted":
      // Razorpay's own retry schedule is exhausted (~3 days of
      // attempts). Authoritative signal — applies on top of any
      // status we guessed ourselves (e.g. our 3-failure 'pending'
      // demotion), no guard, unlike the demotion path.
      return { status: "halted", halted_at: nowIso };
    case "subscription.cancelled":
      return { status: "cancelled", cancelled_at: nowIso };
    case "subscription.completed":
      return { status: "expired" };
    default:
      return null;
  }
}

/**
 * Counts consecutive failed payments, most recent first.
 * Any non-'failed' row breaks the chain. Pass rows ordered
 * created_at DESC (this payment already inserted/upserted).
 */
export function countConsecutiveFailures(rowsDesc: { status: string }[]): number {
  let n = 0;
  for (const r of rowsDesc) {
    if (r.status !== "failed") break;
    n++;
  }
  return n;
}

/** Payment row to upsert for a successful charge / activation. */
export function capturedPaymentRow(
  subscriptionId: string,
  ctx: WebhookContext,
): Record<string, unknown> | null {
  const pay = ctx.payment;
  if (!pay?.id || typeof pay.amount !== "number") return null;
  return {
    subscription_id: subscriptionId,
    razorpay_payment_id: pay.id,
    amount_paise: pay.amount,
    status: "captured",
    method: pay.method ?? null,
    cycle_number: ctx.subscription?.paid_count ?? null,
    paid_at:
      typeof pay.created_at === "number" ? unixToIso(pay.created_at) : new Date().toISOString(),
    failure_reason: null,
  };
}

// ─── Refund pure decision function ───────────────────────────

export interface PaymentRefundPatch {
  status?: "refunded"; // only set on a FULL refund — partial keeps 'captured'
  razorpay_refund_id: string;
  refund_amount_paise: number;
  refund_status: "partial" | "full";
  refunded_at: string;
}

/**
 * The payments-row patch for a CONFIRMED refund. Pure — no I/O.
 * Deliberately only called for 'refund.processed': refund.created
 * fires when a refund is merely initiated (bank-routed refunds can
 * take days to actually complete) and refund.failed means the money
 * never moved — writing a patch for either would record a refund
 * that didn't (yet, or ever) happen. Those two events are still
 * audit-logged by processRefundEvent, just without a payments patch.
 */
export function refundPatchForEvent(
  ctx: RefundWebhookContext,
  nowIso: string,
): PaymentRefundPatch | null {
  if (ctx.event !== "refund.processed") return null;
  const refund = ctx.refund;
  if (!refund?.id || typeof refund.amount !== "number") return null;
  const isFull = ctx.payment?.refund_status === "full";
  return {
    ...(isFull ? { status: "refunded" as const } : {}),
    razorpay_refund_id: refund.id,
    refund_amount_paise: refund.amount,
    refund_status: isFull ? "full" : "partial",
    refunded_at: nowIso,
  };
}

/** Payment row to upsert for a failed charge attempt. */
export function failedPaymentRow(
  subscriptionId: string,
  ctx: WebhookContext,
): Record<string, unknown> | null {
  const pay = ctx.payment;
  if (!pay?.id) return null;
  const reason = pay.error_description || pay.error_reason || pay.error_code || null;
  return {
    subscription_id: subscriptionId,
    razorpay_payment_id: pay.id,
    amount_paise: typeof pay.amount === "number" ? pay.amount : 0,
    status: "failed",
    method: pay.method ?? null,
    cycle_number: ctx.subscription?.paid_count ?? null,
    paid_at: null,
    failure_reason: reason,
  };
}

// ─── Orchestration (db-touching) ─────────────────────────────

export interface ProcessResult {
  handled: boolean;
  action:
    | "activated"
    | "charged"
    | "payment_failed"
    | "paused"
    | "halted"
    | "resumed"
    | "cancelled"
    | "completed"
    | "demoted_pending"
    | "refund_created"
    | "refund_processed"
    | "refund_failed"
    | "refund_speed_changed"
    | "ignored_unsupported_event"
    | "ignored_missing_sub_id"
    | "ignored_missing_payment_id"
    | "ignored_unknown_subscription"
    | "ignored_unknown_payment"
    | "skipped_no_change";
  subscriptionId?: string;
  consecutiveFailures?: number;
  detail?: string;
}

/**
 * Processes one verified Razorpay REFUND event. Resolves the payments
 * row by razorpay_payment_id (refunds carry no subscription entity at
 * all), records the confirmed patch from refundPatchForEvent for
 * 'refund.processed', and audit-logs every refund.* event regardless —
 * 'created'/'failed'/'speed_changed' leave the payments row untouched
 * but still leave a paper trail (e.g. to explain a refund that never
 * completed). Never touches subscriptions.status: a refund is a
 * financial correction on a past payment, not a decision about whether
 * the subscriber keeps their service.
 */
export async function processRefundEvent(
  db: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
): Promise<ProcessResult> {
  const ctx = extractRefundContext(body);

  if (!SUPPORTED_REFUND_EVENTS.includes(ctx.event as SupportedRefundEvent)) {
    return { handled: false, action: "ignored_unsupported_event", detail: ctx.event };
  }

  const razorpayPaymentId = ctx.refund?.payment_id ?? ctx.payment?.id ?? null;
  if (!razorpayPaymentId) {
    return { handled: false, action: "ignored_missing_payment_id", detail: ctx.event };
  }

  const { data: pay, error: payErr } = await db
    .from("payments")
    .select("id,subscription_id,status")
    .eq("razorpay_payment_id", razorpayPaymentId)
    .maybeSingle();
  if (payErr) throw new Error(`payments lookup failed: ${payErr.message}`);
  if (!pay) {
    // Never 5xx here — Razorpay would retry forever for a payment we
    // simply don't have (e.g. refund on a payment predating this table).
    await db.from("audit_logs").insert({
      admin_id: null,
      action: `razorpay.${ctx.event}`,
      entity: "payments",
      entity_id: null,
      meta: {
        razorpay_payment_id: razorpayPaymentId,
        razorpay_refund_id: ctx.refund?.id ?? null,
        warning: "no matching payment row",
      },
    });
    return { handled: false, action: "ignored_unknown_payment", detail: razorpayPaymentId };
  }

  const nowIso = new Date().toISOString();
  let action: ProcessResult["action"];

  if (ctx.event === "refund.processed") {
    const patch = refundPatchForEvent(ctx, nowIso);
    if (patch) {
      const { error: updErr } = await db.from("payments").update(patch).eq("id", pay.id);
      if (updErr) throw new Error(`payment refund update failed: ${updErr.message}`);
    }
    action = "refund_processed";
  } else if (ctx.event === "refund.failed") {
    action = "refund_failed";
  } else if (ctx.event === "refund.created") {
    action = "refund_created";
  } else {
    action = "refund_speed_changed";
  }

  await db.from("audit_logs").insert({
    admin_id: null,
    action: `razorpay.${ctx.event}`,
    entity: "payments",
    entity_id: pay.id,
    meta: {
      razorpay_payment_id: razorpayPaymentId,
      razorpay_refund_id: ctx.refund?.id ?? null,
      refund_amount_paise: ctx.refund?.amount ?? null,
      subscription_id: pay.subscription_id,
      result: action,
      previous_status: pay.status,
    },
  });

  return { handled: true, action, subscriptionId: pay.subscription_id };
}

/**
 * Processes one verified Razorpay event against the database.
 * Idempotent: payment upserts key on razorpay_payment_id; status
 * patches are set-valued, so replays converge to the same state.
 * Audit rows are append-only — a replayed event yields a second
 * audit row, which is correct (it records the delivery).
 */
export async function processWebhookEvent(
  db: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
): Promise<ProcessResult> {
  // Refunds are a distinct event family (fired off the payment object,
  // no subscription entity at all) — dispatch by prefix before touching
  // any of the subscription-shaped extraction/lookup below.
  const rawEvent = typeof body?.event === "string" ? body.event : "";
  if (rawEvent.startsWith("refund.")) {
    return processRefundEvent(db, body);
  }

  const ctx = extractContext(body);

  if (!SUPPORTED_EVENTS.includes(ctx.event as SupportedEvent)) {
    return { handled: false, action: "ignored_unsupported_event", detail: ctx.event };
  }
  if (!ctx.razorpaySubId) {
    return { handled: false, action: "ignored_missing_sub_id", detail: ctx.event };
  }

  // Resolve our subscription row from Razorpay's sub id.
  const { data: sub, error: subErr } = await db
    .from("subscriptions")
    .select("id,status")
    .eq("razorpay_sub_id", ctx.razorpaySubId)
    .maybeSingle();
  if (subErr) throw new Error(`subscriptions lookup failed: ${subErr.message}`);
  if (!sub) {
    // Never 5xx here — Razorpay would retry forever. Log and ack.
    await db.from("audit_logs").insert({
      admin_id: null,
      action: `razorpay.${ctx.event}`,
      entity: "subscriptions",
      entity_id: null,
      meta: { razorpay_sub_id: ctx.razorpaySubId, warning: "no matching subscription row" },
    });
    return {
      handled: false,
      action: "ignored_unknown_subscription",
      detail: ctx.razorpaySubId,
    };
  }

  const nowIso = new Date().toISOString();
  let action: ProcessResult["action"] = "skipped_no_change";
  let consecutiveFailures: number | undefined;

  // ── Payment ledger writes ──
  if (ctx.event === "subscription.payment.failed") {
    const row = failedPaymentRow(sub.id, ctx);
    if (row) {
      const { error } = await db
        .from("payments")
        .upsert(row, { onConflict: "razorpay_payment_id" });
      if (error) throw new Error(`payment upsert failed: ${error.message}`);
    }
    action = "payment_failed";

    // ── 3-consecutive-failure demotion ──
    // Read recent history AFTER this failure is recorded. A single
    // captured payment anywhere above breaks the chain.
    const { data: recent, error: histErr } = await db
      .from("payments")
      .select("status")
      .eq("subscription_id", sub.id)
      .order("created_at", { ascending: false })
      .limit(FAILURE_DEMOTE_THRESHOLD);
    if (histErr) throw new Error(`payments history failed: ${histErr.message}`);
    consecutiveFailures = countConsecutiveFailures(recent ?? []);

    if (consecutiveFailures >= FAILURE_DEMOTE_THRESHOLD && sub.status === "active") {
      const { error: demErr } = await db
        .from("subscriptions")
        .update({ status: "pending", updated_at: nowIso })
        .eq("id", sub.id)
        .eq("status", "active"); // guard against concurrent transitions
      if (demErr) throw new Error(`demotion failed: ${demErr.message}`);
      action = "demoted_pending";
    }
  } else {
    // Status patch events (activated/charged/paused/halted/resumed/cancelled/completed)
    const patch = subscriptionPatchForEvent(ctx.event, ctx, nowIso);
    if (patch) {
      // [Bug 1.5] Razorpay does not guarantee webhook delivery order.
      // A delayed charged/resumed/activated event arriving AFTER a
      // cancellation (or natural expiry) must never silently revive
      // the subscription. Terminal states win, exactly like the
      // 3-failure demotion path guards with .eq("status","active").
      const terminalBlocked =
        patch.status === "active" && (sub.status === "cancelled" || sub.status === "expired");

      if (terminalBlocked) {
        action = "skipped_no_change";
      } else {
        const { error: updErr } = await db
          .from("subscriptions")
          .update({ ...patch, updated_at: nowIso })
          .eq("id", sub.id);
        if (updErr) throw new Error(`subscription update failed: ${updErr.message}`);
        action =
          ctx.event === "subscription.activated"
            ? "activated"
            : ctx.event === "subscription.charged"
              ? "charged"
              : ctx.event === "subscription.paused"
                ? "paused"
                : ctx.event === "subscription.halted"
                  ? "halted"
                  : ctx.event === "subscription.resumed"
                    ? "resumed"
                    : ctx.event === "subscription.cancelled"
                      ? "cancelled"
                      : "completed";
      }
    }
    // Successful-charge events also record the payment — money that
    // actually moved is recorded even when a stale activation event
    // loses to a terminal local state above.
    if (ctx.event === "subscription.activated" || ctx.event === "subscription.charged") {
      const row = capturedPaymentRow(sub.id, ctx);
      if (row) {
        const { error } = await db
          .from("payments")
          .upsert(row, { onConflict: "razorpay_payment_id" });
        if (error) throw new Error(`payment upsert failed: ${error.message}`);
      }
    }
  }

  await db.from("audit_logs").insert({
    admin_id: null, // system actor — webhook, not a human admin
    action: `razorpay.${ctx.event}`,
    entity: "subscriptions",
    entity_id: sub.id,
    meta: {
      razorpay_sub_id: ctx.razorpaySubId,
      razorpay_payment_id: ctx.payment?.id ?? null,
      result: action,
      consecutive_failures: consecutiveFailures ?? null,
      previous_status: sub.status,
    },
  });

  return { handled: true, action, subscriptionId: sub.id, consecutiveFailures };
}
