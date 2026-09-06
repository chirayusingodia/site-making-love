// ─────────────────────────────────────────────────────────────
// PUNYATA — WhatsApp inbound webhook processing (Gupshup)
//
// §5 of SESSION_WHATSAPP_FUNNEL_PROMPT.md. Modelled on
// razorpay-webhook.server.ts: all logic here, the route
// (api/whatsapp/webhook.ts) stays a thin dispatcher.
//
// ⚠️ TWO OPEN ITEMS, NOT GUESSED PAST — confirm before go-live:
//
// 1. AUTHENTICATION. Gupshup's own docs (console-docs.gupshup.io/
//    docs/webhooks, docs.gupshup.io/docs/set-webhookcallback-url) do
//    NOT document a request-signing header or HMAC scheme — only IP
//    allowlisting is mentioned. This file therefore authenticates via
//    an unguessable shared-secret PATH SEGMENT
//    (/api/whatsapp/webhook/$secret, compared timing-safely against
//    GUPSHUP_WEBHOOK_SECRET) rather than a signature check, per §5
//    step 1's own fallback instruction. FILE A GUPSHUP SUPPORT TICKET
//    asking whether a native signing header exists before go-live —
//    if one does, switch to verifying it instead (strictly stronger
//    than a URL-embedded secret, which can leak via proxy/access
//    logs).
//
// 2. FLOW SUBMISSION ENVELOPE. Gupshup's docs confirm the inbound
//    envelope for text/status events (`{app,timestamp,version,type,
//    payload:{...,sender:{phone}}}`) but do NOT confirm, for an
//    `nfm_reply` (Flow submission), whether the interactive payload
//    keeps Meta's native field names (`interactive.nfm_reply.
//    response_json`) or is renamed (one secondary, unverified source
//    claims `extraInfo.interactive.nfmReply.responseJson`).
//    extractFlowResponseJson() below tries both; if NEITHER matches,
//    it throws with the raw payload preserved in wa_messages so the
//    first real Flow submission in Gupshup's sandbox tells us which
//    shape to keep. Capture one live test submission before go-live.
// ─────────────────────────────────────────────────────────────

import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeWaId, resolveWhatsAppIdentity } from "@/lib/whatsapp-identity.server";

export function verifyWebhookSecret(providedRaw: string | null, secret: string): boolean {
  if (!providedRaw || !secret) return false;
  const a = Buffer.from(providedRaw, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface GupshupSender {
  phone: string;
  name?: string;
}

interface GupshupInboundPayload {
  app: string;
  timestamp: number;
  version: number;
  type: string; // 'message' | 'message-event'
  payload: {
    id?: string;
    gsId?: string;
    type?: string; // 'text' | 'image' | 'button_reply' | 'nfm_reply' | ... (message) | status string (message-event)
    payload?: Record<string, unknown>;
    sender?: GupshupSender;
    // message-event shape
    ["type"]?: string;
  };
}

/** Best-effort extraction across the two candidate envelope shapes
 *  described in the file header. Returns the parsed (JSON.parse'd)
 *  flow response object, or null if neither shape matched. */
function dig(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function extractFlowResponseJson(rawPayload: unknown): Record<string, unknown> | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;

  const candidates: unknown[] = [
    // Meta-native shape, potentially passed through verbatim inside
    // Gupshup's payload.payload wrapper.
    dig(rawPayload, ["payload", "payload", "interactive", "nfm_reply", "response_json"]),
    dig(rawPayload, ["payload", "interactive", "nfm_reply", "response_json"]),
    // Reported (unverified) Gupshup-flattened camelCase shape.
    dig(rawPayload, ["payload", "payload", "extraInfo", "interactive", "nfmReply", "responseJson"]),
    dig(rawPayload, ["extraInfo", "interactive", "nfmReply", "responseJson"]),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      try {
        return JSON.parse(candidate) as Record<string, unknown>;
      } catch {
        continue;
      }
    }
    if (candidate && typeof candidate === "object") {
      return candidate as Record<string, unknown>;
    }
  }
  return null;
}

export type InboundDispatch =
  | {
      case: "flow_reply";
      waId: string;
      profileId: string | null;
      leadId: string | null;
      response: Record<string, unknown>;
    }
  | { case: "button_reply"; waId: string; buttonId: string | null; buttonTitle: string | null }
  | { case: "message"; waId: string; text: string | null }
  | { case: "status"; waMessageId: string | null; gsId: string | null; status: string }
  | { case: "unhandled" };

/** Same envelope-shape uncertainty as extractFlowResponseJson (see
 *  file header, open item 2) — Gupshup's docs confirm `payload.type`
 *  discriminates message kinds and `payload.payload.text` holds text
 *  bodies, but do not show a concrete button_reply example. This
 *  mirrors that documented pattern (id/title under `payload.payload`)
 *  and should be confirmed against one live sandbox button tap before
 *  go-live, same as the Flow envelope. */
function extractButtonReply(body: GupshupInboundPayload): {
  id: string | null;
  title: string | null;
} {
  const p = body.payload?.payload as Record<string, unknown> | undefined;
  const id = typeof p?.id === "string" ? p.id : null;
  const title = typeof p?.title === "string" ? p.title : null;
  return { id, title };
}

const STATUS_VALUES = new Set(["enqueued", "sent", "delivered", "read", "failed", "deleted"]);

/**
 * §5 step 3-4. Inserts the raw inbound event into wa_messages
 * (idempotent on wa_message_id) and classifies it. Returns null if
 * this delivery is a redelivery already recorded — the caller must
 * stop, not process twice.
 */
export async function recordAndClassifyInbound(
  db: SupabaseClient,
  body: GupshupInboundPayload,
): Promise<InboundDispatch | null> {
  const providerMessageId = body.payload?.id ?? body.payload?.gsId ?? null;
  const isStatusEvent = body.type === "message-event";
  const senderPhoneRaw = body.payload?.sender?.phone ?? null;
  const waId = senderPhoneRaw ? normalizeWaId(senderPhoneRaw) : null;

  if (!isStatusEvent) {
    // Inbound message (text / button / image / nfm_reply). Needs a
    // resolvable sender to record meaningfully.
    if (!waId) {
      throw new Error(`Inbound event with unresolvable sender phone: ${senderPhoneRaw}`);
    }

    const text =
      typeof body.payload?.payload?.text === "string"
        ? (body.payload.payload.text as string)
        : null;

    const { error: insertErr } = await db.from("wa_messages").insert({
      direction: "in",
      wa_message_id: providerMessageId,
      phone: waId,
      kind: body.payload?.type === "nfm_reply" ? "flow_reply" : (body.payload?.type ?? "text"),
      body: text,
      payload: body as unknown as Record<string, unknown>,
      status: "received",
    });
    if (insertErr) {
      if (insertErr.code === "23505") return null; // unique violation → redelivery, stop
      throw new Error(`wa_messages insert failed: ${insertErr.message}`);
    }

    if (body.payload?.type === "nfm_reply") {
      const response = extractFlowResponseJson(body);
      if (!response) {
        throw new Error(
          "nfm_reply received but response_json could not be located in either candidate envelope shape — capture this raw payload and update extractFlowResponseJson()",
        );
      }
      return { case: "flow_reply", waId, profileId: null, leadId: null, response };
    }
    if (body.payload?.type === "button_reply") {
      const { id, title } = extractButtonReply(body);
      return { case: "button_reply", waId, buttonId: id, buttonTitle: title };
    }
    return { case: "message", waId, text };
  }

  // Delivery-status event.
  const status = String(body.payload?.type ?? "").toLowerCase();
  if (!STATUS_VALUES.has(status)) {
    return { case: "unhandled" };
  }
  const mappedStatus = status === "enqueued" || status === "deleted" ? "queued" : status;
  return {
    case: "status",
    waMessageId: providerMessageId,
    gsId: body.payload?.gsId ?? null,
    status: mappedStatus,
  };
}

/** Applies a delivery-status event onto the matching outbound row. */
export async function applyStatusUpdate(
  db: SupabaseClient,
  dispatch: Extract<InboundDispatch, { case: "status" }>,
): Promise<void> {
  const idToMatch = dispatch.waMessageId ?? dispatch.gsId;
  if (!idToMatch) return;
  await db
    .from("wa_messages")
    .update({ status: dispatch.status, updated_at: new Date().toISOString() })
    .eq("wa_message_id", idToMatch)
    .eq("direction", "out");
}

// Re-export for the identity path, so the route doesn't need to know
// which module owns identity resolution.
export { resolveWhatsAppIdentity };
