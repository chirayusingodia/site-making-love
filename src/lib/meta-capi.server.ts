import process from "node:process";
import { normalizePhoneE164 } from "@/lib/phone";

// Server-side Meta Conversions API sender. Plain fetch, no SDK; .server.ts
// keeps it (and the token) out of the client bundle. Env is read per request
// (Workers-safe). Deliberately separate from meta.server.ts (Instagram Graph
// token for Content Studio) — CAPI uses its own token and endpoint.
//
//   META_PIXEL_ID              — server copy of the pixel id
//   META_CAPI_ACCESS_TOKEN     — Events Manager → Pixel → Settings → CAPI
//   META_CAPI_TEST_EVENT_CODE  — optional; routes events to Test Events
//   META_GRAPH_VERSION         — optional, default v21.0
//
// Never throws into the caller; never logs raw PII or the token.

const DEFAULT_VERSION = "v21.0";
const DEFAULT_TIMEOUT_MS = 5000;

let warnedMissingConfig = false;

export async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Meta phone format: E.164 digits only, country code included, no "+". */
export function metaPhoneDigits(raw: string): string | null {
  const e164 = normalizePhoneE164(raw);
  return e164 ? e164.replace(/\D/g, "") : null;
}

export async function hashPhone(raw: string): Promise<string | null> {
  const d = metaPhoneDigits(raw);
  return d ? sha256Hex(d) : null;
}

export async function hashText(raw: string): Promise<string | null> {
  const v = raw.trim().toLowerCase();
  return v ? sha256Hex(v) : null;
}

export interface MetaEventUser {
  phone?: string | null;
  email?: string | null;
  firstName?: string | null;
  externalId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  clientUserAgent?: string | null;
}

export interface SendMetaEventInput {
  eventName: string;
  eventId: string;
  /** Unix seconds. */
  eventTime: number;
  eventSourceUrl?: string | null;
  actionSource?: "website";
  user: MetaEventUser;
  custom?: Record<string, unknown>;
  /** Per-attempt timeout; default 5000. */
  timeoutMs?: number;
  /** Total attempts (1 = no retry). Default 2: one retry on 5xx/network error. */
  maxAttempts?: number;
}

export type SendMetaEventResult =
  | { skipped: true; reason: string }
  | { ok: true; fbtraceId?: string }
  | { ok: false; error: string; fbtraceId?: string };

export interface MetaCapiConfig {
  pixelId: string;
  token: string;
  version: string;
  testEventCode: string | null;
}

export function getMetaCapiConfig(): MetaCapiConfig | null {
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !token) return null;
  return {
    pixelId,
    token,
    version: process.env.META_GRAPH_VERSION || DEFAULT_VERSION,
    testEventCode: process.env.META_CAPI_TEST_EVENT_CODE || null,
  };
}

/** Build the exact event object sent to Meta (exported for tests / curl dump). */
export async function buildMetaEvent(input: SendMetaEventInput): Promise<Record<string, unknown>> {
  const u = input.user;
  const userData: Record<string, unknown> = {};
  const ph = u.phone ? await hashPhone(u.phone) : null;
  if (ph) userData.ph = [ph];
  const em = u.email ? await hashText(u.email) : null;
  if (em) userData.em = [em];
  const fn = u.firstName ? await hashText(u.firstName) : null;
  if (fn) userData.fn = [fn];
  const ext = u.externalId ? await hashText(u.externalId) : null;
  if (ext) userData.external_id = [ext];
  // Sent raw, never hashed.
  if (u.fbp) userData.fbp = u.fbp;
  if (u.fbc) userData.fbc = u.fbc;
  if (u.clientIp) userData.client_ip_address = u.clientIp;
  if (u.clientUserAgent) userData.client_user_agent = u.clientUserAgent;

  return {
    event_name: input.eventName,
    event_time: input.eventTime,
    event_id: input.eventId,
    action_source: input.actionSource ?? "website",
    ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
    user_data: userData,
    custom_data: input.custom ?? {},
  };
}

async function postOnce(
  url: string,
  body: string,
  timeoutMs: number,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: ctrl.signal,
    });
    let json: Record<string, unknown> | null = null;
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendMetaEvent(input: SendMetaEventInput): Promise<SendMetaEventResult> {
  try {
    const cfg = getMetaCapiConfig();
    if (!cfg) {
      if (!warnedMissingConfig) {
        warnedMissingConfig = true;
        console.warn("meta-capi: META_PIXEL_ID / META_CAPI_ACCESS_TOKEN not set — events skipped");
      }
      return { skipped: true, reason: "not_configured" };
    }

    const event = await buildMetaEvent(input);
    const payload = {
      data: [event],
      ...(cfg.testEventCode ? { test_event_code: cfg.testEventCode } : {}),
    };
    const url = `https://graph.facebook.com/${cfg.version}/${cfg.pixelId}/events?access_token=${encodeURIComponent(cfg.token)}`;
    const body = JSON.stringify(payload);
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let lastErr = "unknown";
    let fbtraceId: string | undefined;
    const maxAttempts = Math.max(1, input.maxAttempts ?? 2);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const { status, json } = await postOnce(url, body, timeoutMs);
        const err = json?.error as { fbtrace_id?: string; message?: string } | undefined;
        fbtraceId = err?.fbtrace_id ?? (json?.fbtrace_id as string | undefined);
        if (status >= 200 && status < 300) return { ok: true, fbtraceId };
        lastErr = `http_${status}`;
        if (status < 500) break; // 4xx: retrying cannot help
      } catch (e) {
        lastErr = e instanceof Error && e.name === "AbortError" ? "timeout" : "network_error";
      }
    }
    console.error(
      `meta-capi: send failed event=${input.eventName} id=${input.eventId} err=${lastErr} fbtrace_id=${fbtraceId ?? "n/a"}`,
    );
    return { ok: false, error: lastErr, fbtraceId };
  } catch (e) {
    console.error("meta-capi: unexpected error", e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "unexpected" };
  }
}
