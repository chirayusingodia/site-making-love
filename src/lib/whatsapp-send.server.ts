// ─────────────────────────────────────────────────────────────
// PUNYATA — WhatsApp send primitive (Gupshup self-serve tier)
//
// §4/§6 of SESSION_WHATSAPP_FUNNEL_PROMPT.md. Every Gupshup-specific
// detail (base URL, auth header, request shape) lives in THIS FILE
// ONLY, mirroring src/lib/gateways/ for payment providers. Nothing
// else in the codebase may know the provider's name — moving to Meta
// Cloud API direct should stay a two-file change (this one +
// whatsapp-webhook.server.ts), never a rewrite.
//
// Confirmed against Gupshup's own reference docs (2026-09-06):
//   POST https://api.gupshup.io/wa/api/v1/msg           (free-form/session text)
//   POST https://api.gupshup.io/wa/api/v1/template/msg   (template/HSM)
//   headers: apikey: <GUPSHUP_API_KEY>, content-type: application/x-www-form-urlencoded
//   body (form-encoded): channel=whatsapp, source, destination, src.name,
//     message='{"type":"text","text":"..."}' (free-form) OR
//     template='{"id":"<template id>","params":["v1","v2",...]}' (template)
//   response: 2xx + { messageId, status: "submitted" } — ACCEPTED, not
//     delivered; the real delivery status arrives later on the webhook
//     as a message-event (§ whatsapp-webhook.server.ts).
// ─────────────────────────────────────────────────────────────

import process from "node:process";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneForWa } from "@/lib/sankalp-logic";
import { isWithinSessionWindow } from "@/lib/whatsapp-window";
import { getConsentState } from "@/lib/whatsapp-consent.server";

const GUPSHUP_BASE_URL = "https://api.gupshup.io/wa/api/v1";

// §6.4 — sending policy: limits, safety, cost control. None of this
// was in the original spec; each item is a real failure mode at this
// project's actual scale (bursty proof-video batches, a pre-pay
// wallet, no staging WABA).

// A new WABA starts at Meta's bottom messaging tier (commonly
// 1,000 unique recipients/day). Default BELOW that so a bursty proof
// batch degrades gracefully (queued rows just wait for tomorrow's
// sweep — see §6.4's "spread across days") instead of two-thirds of
// it silently failing against Meta's own throttle. Override via env
// once the real tier is confirmed with Gupshup.
const DEFAULT_MAX_SENDS_PER_DAY = 800;
function maxSendsPerDay(): number {
  const raw = process.env.WHATSAPP_MAX_SENDS_PER_DAY;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_SENDS_PER_DAY;
}

async function sentTodayCount(db: SupabaseClient): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count, error } = await db
    .from("wa_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "out")
    .gte("created_at", startOfDay.toISOString());
  if (error) throw new Error(`wa_messages daily-count lookup failed: ${error.message}`);
  return count ?? 0;
}

/**
 * There is no staging WABA — a bug that messages real elderly
 * subscribers in development is not recoverable. Outside production,
 * only numbers in WHATSAPP_TEST_NUMBERS (comma-separated E.164) may
 * receive anything; everything else is logged and dropped. FAIL
 * CLOSED: an unset/empty allowlist in non-production sends nothing.
 */
function isAllowedInThisEnvironment(toPhone: string): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const allowlist = (process.env.WHATSAPP_TEST_NUMBERS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return allowlist.includes(toPhone);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Fail loudly at first use — never silently no-op a send, same
    // discipline as gateways/razorpay.ts's isConfigured() check.
    throw new Error(`${name} not configured — WhatsApp send refused`);
  }
  return value;
}

export interface SendWhatsAppInput {
  toPhone: string;
  /** Business-initiated send — REQUIRED outside the 24h window. */
  template?: { name: string; templateId: string; vars: string[] };
  /** Free-form; ONLY legal inside the 24h customer-service window. */
  text?: string;
  profileId?: string | null;
  leadId?: string | null;
}

export type SendWhatsAppResult = { ok: true; waMessageId: string } | { ok: false; error: string };

async function callGupshup(
  body: URLSearchParams,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const apiKey = requireEnv("GUPSHUP_API_KEY");
  const endpoint = body.has("template") ? "template/msg" : "msg";
  try {
    const res = await fetch(`${GUPSHUP_BASE_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const json = (await res.json().catch(() => null)) as { messageId?: string } | null;
    if (!res.ok || !json?.messageId) {
      return { ok: false, error: `Gupshup send failed (${res.status}): ${JSON.stringify(json)}` };
    }
    return { ok: true, messageId: json.messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

/**
 * The one send primitive. Writes the wa_messages row BEFORE the HTTP
 * call (so a crash mid-send leaves a trace) and patches it with the
 * outcome after.
 */
export async function sendWhatsApp(
  db: SupabaseClient,
  input: SendWhatsAppInput,
): Promise<SendWhatsAppResult> {
  const toPhone = normalizePhoneForWa(input.toPhone);
  if (!toPhone) {
    return { ok: false, error: `Invalid phone for WhatsApp send: ${input.toPhone}` };
  }
  if (!input.template && !input.text) {
    return { ok: false, error: "Either template or text is required" };
  }

  // §6.4 — test safety, fail closed. Checked before anything else:
  // there is no staging WABA, so a dev-environment bug must never be
  // able to reach a real number.
  if (!isAllowedInThisEnvironment(toPhone)) {
    return {
      ok: false,
      error: "Non-production environment: recipient not in WHATSAPP_TEST_NUMBERS — send dropped",
    };
  }

  // §3.4 — consent, enforced in this one gate rather than at every
  // call site. Opt-out suppresses EVERYTHING, template or free-form.
  // Opt-in is required only for templates — a free-form reply inside
  // the 24h window is legitimate because the customer started that
  // conversation (see the 24h check just below).
  const consent = await getConsentState(db, { profileId: input.profileId, phone: toPhone });
  if (consent.optedOut) {
    return { ok: false, error: "Customer has opted out of WhatsApp messaging (wa_opt_out_at set)" };
  }
  if (input.template && !consent.optedIn) {
    return {
      ok: false,
      error: "Customer has not consented to WhatsApp messaging (wa_opt_in_at is NULL)",
    };
  }

  // §6.1 — the 24h rule, enforced in code. A free-form send with no
  // recent inbound message is refused outright: never silently
  // downgrade to a template (we don't have one to downgrade to), and
  // never send anyway.
  if (input.text && !input.template) {
    const { data: lastInbound, error: lookupErr } = await db
      .from("wa_messages")
      .select("created_at")
      .eq("phone", toPhone)
      .eq("direction", "in")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lookupErr) return { ok: false, error: `wa_messages lookup failed: ${lookupErr.message}` };
    if (!isWithinSessionWindow(lastInbound?.created_at ?? null)) {
      return {
        ok: false,
        error: "24h customer-service window closed — a template is required for this send",
      };
    }
  }

  // §6.4 — spend/volume circuit breaker. A loop bug (a row that
  // fails, resets to pending, gets picked up again) can drain a
  // pre-pay wallet fast, and Meta throttles a WABA's daily
  // business-initiated volume regardless. Refuse rather than page
  // someone; the notifications queue already holds the row for
  // tomorrow's sweep.
  const sentToday = await sentTodayCount(db);
  if (sentToday >= maxSendsPerDay()) {
    return { ok: false, error: `Daily send cap reached (${sentToday}/${maxSendsPerDay()})` };
  }

  // requireEnv() throws (deliberately loud — a misconfiguration is
  // OUR bug). Caught here so this function keeps its own contract
  // (always a result object, never an uncaught throw): the worker
  // calls this inside a per-row loop, and one bad env var must fail
  // that row, not the whole batch mid-iteration.
  let appName: string;
  let sourceNumber: string;
  try {
    appName = requireEnv("GUPSHUP_APP_NAME");
    sourceNumber = requireEnv("GUPSHUP_SOURCE_NUMBER");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const { data: row, error: insertErr } = await db
    .from("wa_messages")
    .insert({
      direction: "out",
      phone: toPhone,
      profile_id: input.profileId ?? null,
      lead_id: input.leadId ?? null,
      kind: input.template ? "template" : "text",
      template_name: input.template?.name ?? null,
      body: input.text ?? null,
      status: "queued",
    })
    .select("id")
    .single();
  if (insertErr || !row) {
    return { ok: false, error: `wa_messages insert failed: ${insertErr?.message}` };
  }

  const body = new URLSearchParams({
    channel: "whatsapp",
    source: sourceNumber,
    destination: toPhone.replace("+", ""),
    "src.name": appName,
  });
  if (input.template) {
    body.set(
      "template",
      JSON.stringify({ id: input.template.templateId, params: input.template.vars }),
    );
  } else if (input.text) {
    body.set("message", JSON.stringify({ type: "text", text: input.text }));
  }

  const result = await callGupshup(body);

  if (result.ok) {
    await db
      .from("wa_messages")
      .update({
        wa_message_id: result.messageId,
        status: "sent",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return { ok: true, waMessageId: result.messageId };
  }

  await db
    .from("wa_messages")
    .update({ status: "failed", error: result.error, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  return { ok: false, error: result.error };
}
