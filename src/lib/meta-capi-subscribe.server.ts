import process from "node:process";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONVERSION_EVENT_NAME, subscribeEventId, buildFbc } from "@/lib/meta-ids";
import { getMetaCapiConfig, sendMetaEvent } from "@/lib/meta-capi.server";
import { normalizePhoneE164 } from "@/lib/phone";
import type { MarketingContext } from "@/lib/meta-capi-context";

// Reports a self-serve subscription's FIRST successful payment to Meta CAPI.
//
// Two callers, one core (`sendSubscribeConversion`):
//   • the Razorpay webhook  → reportSubscribeConversion(): ONE attempt,
//     ≤2s, so Meta can never hold up or fail the webhook;
//   • the retry cron        → retryPendingSubscribeConversions(): up to 2
//     attempts per run, sweeping anything the webhook couldn't deliver, so
//     delivery never depends on a later webhook arriving.
//
// Delivery state lives on `subscriptions` (migration 041):
//   meta_capi_claimed_at  taken before sending; stale after 10 min
//   meta_capi_sent_at     set ONLY after Meta confirmed — never pre-set, so
//                         a failed send is never silently lost
//   meta_capi_attempts    cron gives up at META_CAPI_MAX_ATTEMPTS
//
// Never throws. Inert (no DB access) when META_* env is unset.

export const META_CAPI_STALE_CLAIM_MS = 10 * 60_000;
export const META_CAPI_MAX_ATTEMPTS = 5;
/** Meta rejects events older than 7 days; stop one day short of that. */
export const META_CAPI_MAX_EVENT_AGE_MS = 6 * 24 * 60 * 60_000;
/** Matching context older than this has its client_ip scrubbed. */
export const META_CAPI_IP_RETENTION_MS = 30 * 24 * 60 * 60_000;

const WEBHOOK_TIMEOUT_MS = 2000;
const CRON_TIMEOUT_MS = 5000;

export type SubscribeConversionOutcome =
  | "skipped_not_configured"
  | "skipped_not_first_payment"
  | "skipped_no_amount"
  | "skipped_too_old"
  | "skipped_not_self_serve"
  | "skipped_staff_or_test"
  | "skipped_consent_declined"
  | "skipped_already_sent"
  | "skipped_claim_in_flight"
  | "skipped_max_attempts"
  | "skipped_no_columns"
  | "sent"
  | "send_failed"
  | "error";

// ─── Pure eligibility ────────────────────────────────────────

export interface EligibilityInput {
  role: string | null | undefined;
  phone: string | null | undefined;
  telecallerId: string | null | undefined;
  salesAgentId: string | null | undefined;
  acquisitionChannel: string | null | undefined;
  context: Partial<MarketingContext> | null | undefined;
  /** E.164 numbers that must never be reported (WHATSAPP_TEST_NUMBERS). */
  testNumbers: string[];
}

/**
 * Returns the skip reason, or null when the subscription may be reported.
 *
 * Self-serve only: a telecaller / field-agent sale has no real customer
 * browser behind it, so Meta would optimise on the wrong signal. Telecaller
 * guest links land on the public /checkout?att=… and so carry telecaller_id
 * — covered by the same check. A row without a recorded user agent was not
 * created by a real browser checkout (and Meta requires a user agent on
 * `website` events anyway).
 */
export function evaluateEligibility(i: EligibilityInput): SubscribeConversionOutcome | null {
  if (
    i.telecallerId ||
    i.salesAgentId ||
    (i.acquisitionChannel ?? "").toLowerCase() === "telecall" ||
    !i.context?.client_user_agent
  ) {
    return "skipped_not_self_serve";
  }
  const e164 = i.phone ? normalizePhoneE164(i.phone) : null;
  if ((i.role ?? "user") !== "user" || (e164 && i.testNumbers.includes(e164))) {
    return "skipped_staff_or_test";
  }
  if (i.context.consent === "declined") return "skipped_consent_declined";
  return null;
}

function testNumbersFromEnv(): string[] {
  return (process.env.WHATSAPP_TEST_NUMBERS ?? "")
    .split(",")
    .map((p) => normalizePhoneE164(p.trim()))
    .filter((p): p is string => !!p);
}

// ─── Core ────────────────────────────────────────────────────

interface SendArgs {
  subscriptionId: string;
  userId: string;
  /** Amount actually charged, paise (from the payment). */
  amountPaise: number | null | undefined;
  /** Razorpay paid_count — 1 on the first successful charge. */
  paidCount: number | null | undefined;
  /** Payment time, unix seconds (event_time + age check). */
  paymentTimeUnix?: number | null;
  /** Send attempts inside this call (webhook 1, cron 2). */
  sendAttempts: number;
  timeoutMs: number;
  nowMs?: number;
}

/** claimed-and-confirmed bookkeeping + the actual send. */
export async function sendSubscribeConversion(
  db: SupabaseClient,
  args: SendArgs,
): Promise<SubscribeConversionOutcome> {
  try {
    if (!getMetaCapiConfig()) return "skipped_not_configured";
    if (typeof args.paidCount === "number" && args.paidCount > 1) {
      return "skipped_not_first_payment";
    }
    if (typeof args.amountPaise !== "number" || !(args.amountPaise > 0)) {
      return "skipped_no_amount";
    }
    const nowMs = args.nowMs ?? Date.now();
    const eventTimeUnix =
      typeof args.paymentTimeUnix === "number" && args.paymentTimeUnix > 0
        ? args.paymentTimeUnix
        : Math.floor(nowMs / 1000);
    if (nowMs - eventTimeUnix * 1000 > META_CAPI_MAX_EVENT_AGE_MS) return "skipped_too_old";

    const [{ data: profile }, { data: sub, error: subErr }] = await Promise.all([
      db.from("profiles").select("id,full_name,phone,email,role").eq("id", args.userId).maybeSingle(),
      db
        .from("subscriptions")
        .select(
          "id,plan_id,created_at,fbclid,marketing_context,telecaller_id,sales_agent_id,acquisition_channel,meta_capi_claimed_at,meta_capi_sent_at,meta_capi_attempts",
        )
        .eq("id", args.subscriptionId)
        .maybeSingle(),
    ]);
    if (subErr) {
      // Migration 041 not applied — marketing only, never a webhook concern.
      return /column .* does not exist/i.test(subErr.message) ? "skipped_no_columns" : "error";
    }
    if (!sub) return "error";
    const s = sub as {
      plan_id?: string;
      created_at?: string;
      fbclid?: string | null;
      marketing_context?: Partial<MarketingContext> | null;
      telecaller_id?: string | null;
      sales_agent_id?: string | null;
      acquisition_channel?: string | null;
      meta_capi_claimed_at?: string | null;
      meta_capi_sent_at?: string | null;
      meta_capi_attempts?: number | null;
    };
    const p = profile as {
      id: string;
      full_name?: string | null;
      phone?: string | null;
      email?: string | null;
      role?: string | null;
    } | null;

    if (s.meta_capi_sent_at) return "skipped_already_sent";

    const skip = evaluateEligibility({
      role: p?.role,
      phone: p?.phone,
      telecallerId: s.telecaller_id,
      salesAgentId: s.sales_agent_id,
      acquisitionChannel: s.acquisition_channel,
      context: s.marketing_context,
      testNumbers: testNumbersFromEnv(),
    });
    if (skip) return skip;

    const attempts = s.meta_capi_attempts ?? 0;
    if (attempts >= META_CAPI_MAX_ATTEMPTS) return "skipped_max_attempts";
    const prevClaim = s.meta_capi_claimed_at ?? null;
    if (prevClaim && nowMs - Date.parse(prevClaim) < META_CAPI_STALE_CLAIM_MS) {
      return "skipped_claim_in_flight"; // another worker is sending right now
    }

    // Compare-and-set claim on the claim state we just read: of two racing
    // workers exactly one gets a row back. A stale claim (crashed worker)
    // is taken over here instead of blocking the event forever.
    const claimAt = new Date(nowMs).toISOString();
    let claim = db
      .from("subscriptions")
      .update({ meta_capi_claimed_at: claimAt, meta_capi_attempts: attempts + 1 })
      .eq("id", args.subscriptionId)
      .is("meta_capi_sent_at", null);
    claim = prevClaim ? claim.eq("meta_capi_claimed_at", prevClaim) : claim.is("meta_capi_claimed_at", null);
    const { data: claimed, error: claimErr } = await claim.select("id");
    if (claimErr) return "error";
    if (!claimed || claimed.length === 0) return "skipped_claim_in_flight";

    const ctx = s.marketing_context ?? {};
    const createdMs = Date.parse(s.created_at ?? "") || nowMs;
    const fbc = ctx.fbc ?? (s.fbclid && ctx.consent === "granted" ? buildFbc(s.fbclid, createdMs) : null);

    const result = await sendMetaEvent({
      eventName: CONVERSION_EVENT_NAME,
      eventId: subscribeEventId(args.subscriptionId),
      eventTime: eventTimeUnix,
      eventSourceUrl: ctx.event_source_url ?? "https://www.punyata.com/subscription-success",
      user: {
        phone: p?.phone ?? null,
        email: p?.email ?? null,
        firstName: p?.full_name?.trim().split(/\s+/)[0] ?? null,
        externalId: p?.id ?? args.userId,
        fbp: ctx.fbp ?? null,
        fbc,
        clientIp: ctx.client_ip ?? null,
        clientUserAgent: ctx.client_user_agent ?? null,
      },
      custom: {
        value: Math.round(args.amountPaise) / 100,
        currency: "INR",
        content_ids: [s.plan_id].filter(Boolean),
      },
      timeoutMs: args.timeoutMs,
      maxAttempts: args.sendAttempts,
    });

    if ("ok" in result && result.ok) {
      // Confirmed: record it, and drop the IP — it was only needed to send.
      const { client_ip: _ip, ...ctxWithoutIp } = ctx;
      void _ip;
      await db
        .from("subscriptions")
        .update({
          meta_capi_sent_at: new Date().toISOString(),
          marketing_context: ctxWithoutIp,
        })
        .eq("id", args.subscriptionId);
      return "sent";
    }
    // Not delivered: free the claim so the cron retries on its next run
    // (Meta dedups on event_id, so a re-send can never double-count).
    await db
      .from("subscriptions")
      .update({ meta_capi_claimed_at: null })
      .eq("id", args.subscriptionId)
      .eq("meta_capi_claimed_at", claimAt);
    return "send_failed";
  } catch (e) {
    console.error("meta-capi: subscribe core error", e instanceof Error ? e.name : "unknown");
    return "error";
  }
}

// ─── Webhook entry ───────────────────────────────────────────

/** Webhook hook: ONE attempt, ≤2s. A failure is picked up by the cron. */
export async function reportSubscribeConversion(
  db: SupabaseClient,
  args: {
    subscriptionId: string;
    userId: string;
    amountPaise: number | null | undefined;
    paidCount: number | null | undefined;
    paymentTimeUnix?: number | null;
  },
): Promise<SubscribeConversionOutcome> {
  return sendSubscribeConversion(db, {
    ...args,
    sendAttempts: 1,
    timeoutMs: WEBHOOK_TIMEOUT_MS,
  });
}

// ─── Cron entry ──────────────────────────────────────────────

export interface RetrySweepResult {
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
  retired: number;
  ipsScrubbed: number;
}

/**
 * Sweep for self-serve first payments that never got confirmed and resend
 * them; retire ones too old for Meta; scrub stale client IPs. Bounded by
 * `limit` so one run fits the function's time budget.
 */
export async function retryPendingSubscribeConversions(
  db: SupabaseClient,
  opts: { limit?: number; nowMs?: number } = {},
): Promise<RetrySweepResult> {
  const result: RetrySweepResult = { scanned: 0, sent: 0, failed: 0, skipped: 0, retired: 0, ipsScrubbed: 0 };
  if (!getMetaCapiConfig()) return result;
  const nowMs = opts.nowMs ?? Date.now();
  const limit = opts.limit ?? 50;

  try {
    const { data: rows, error } = await db
      .from("subscriptions")
      .select("id,user_id")
      .eq("status", "active")
      .is("meta_capi_sent_at", null)
      .is("telecaller_id", null)
      .is("sales_agent_id", null)
      .lt("meta_capi_attempts", META_CAPI_MAX_ATTEMPTS)
      .not("marketing_context->>client_user_agent", "is", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) {
      console.error("meta-capi retry: candidate query failed:", error.message);
    }

    for (const row of (rows ?? []) as { id: string; user_id: string }[]) {
      result.scanned++;
      // The FIRST captured payment is the conversion (renewals are not).
      const { data: pay } = await db
        .from("payments")
        .select("amount_paise,paid_at")
        .eq("subscription_id", row.id)
        .eq("status", "captured")
        .order("paid_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const paidAt = (pay as { paid_at?: string | null } | null)?.paid_at ?? null;
      const amount = (pay as { amount_paise?: number } | null)?.amount_paise;
      if (!paidAt || !amount) {
        result.skipped++;
        continue;
      }
      if (nowMs - Date.parse(paidAt) > META_CAPI_MAX_EVENT_AGE_MS) {
        // Past Meta's window — retire so it isn't rescanned forever.
        await db.from("subscriptions").update({ meta_capi_attempts: META_CAPI_MAX_ATTEMPTS }).eq("id", row.id);
        result.retired++;
        continue;
      }
      const outcome = await sendSubscribeConversion(db, {
        subscriptionId: row.id,
        userId: row.user_id,
        amountPaise: amount,
        paidCount: 1,
        paymentTimeUnix: Math.floor(Date.parse(paidAt) / 1000),
        sendAttempts: 2,
        timeoutMs: CRON_TIMEOUT_MS,
        nowMs,
      });
      if (outcome === "sent") result.sent++;
      else if (outcome === "send_failed") result.failed++;
      else result.skipped++;
    }

    // Data minimisation: client_ip is only needed to send. Anything still
    // holding one after 30 days (never sent / retired) loses it here.
    const cutoff = new Date(nowMs - META_CAPI_IP_RETENTION_MS).toISOString();
    const { data: old } = await db
      .from("subscriptions")
      .select("id,marketing_context")
      .lt("created_at", cutoff)
      .not("marketing_context->>client_ip", "is", null)
      .limit(200);
    for (const r of (old ?? []) as { id: string; marketing_context: Record<string, unknown> }[]) {
      const { client_ip: _ip, ...rest } = r.marketing_context ?? {};
      void _ip;
      await db.from("subscriptions").update({ marketing_context: rest }).eq("id", r.id);
      result.ipsScrubbed++;
    }
  } catch (e) {
    console.error("meta-capi retry sweep error:", e instanceof Error ? e.message : "unknown");
  }
  return result;
}
