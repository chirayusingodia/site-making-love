// Browser Meta Pixel wrapper — consent-gated, never throws, inert when
// VITE_META_PIXEL_ID is unset or the visitor has not accepted marketing
// cookies. The Pixel is NOT loaded from the HTML shell any more: it is
// injected here only after consent (see __root.tsx + MarketingConsentBanner).
//
// Deduplication: every call takes an `eventId`. For the conversion event it
// must be subscribeEventId(subscriptionId) — the same string the server sends
// as CAPI `event_id` (see meta-ids.ts).

import { CONVERSION_EVENT_NAME, newEventId } from "@/lib/meta-ids";

export const CONSENT_KEY = "punyata_marketing_consent_v1";
export const CONSENT_EVENT = "punyata:marketing-consent-change";

export type MarketingConsentState = "granted" | "declined" | "unset";

interface FbqFn {
  (command: "init", pixelId: string): void;
  (
    command: "track" | "trackCustom",
    event: string,
    params?: Record<string, unknown>,
    options?: { eventID?: string },
  ): void;
}

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;

export function isMetaPixelConfigured(): boolean {
  return !!PIXEL_ID;
}

export function getMarketingConsent(): MarketingConsentState {
  if (typeof window === "undefined") return "unset";
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "declined" ? v : "unset";
  } catch {
    return "unset";
  }
}

/**
 * Owner-controlled consent policy (VITE_META_CONSENT_MODE):
 *   "opt_in"            — Pixel/fbp/fbc stay off until the visitor accepts.
 *   "opt_out" (default) — on until the visitor declines (maximises ad
 *                         measurement; whether this is lawful for your
 *                         audience under India's DPDP Act is a legal call).
 * The banner shows in both modes while the visitor has not chosen.
 */
export const CONSENT_MODE: "opt_in" | "opt_out" =
  import.meta.env.VITE_META_CONSENT_MODE === "opt_in" ? "opt_in" : "opt_out";

/** Effective permission to run the Pixel / forward fbp+fbc. */
export function hasMarketingConsent(): boolean {
  const state = getMarketingConsent();
  return state === "granted" || (CONSENT_MODE === "opt_out" && state === "unset");
}

export function setMarketingConsent(value: "granted" | "declined"): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* storage blocked — choice just lasts for this page view */
  }
  if (value === "granted") loadMetaPixel();
  else {
    // Declined after the Pixel already loaded (opt_out mode): tell it to stop.
    try {
      (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq?.("consent", "revoke");
    } catch {
      /* ignore */
    }
  }
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
  } catch {
    /* ignore */
  }
}

let loaded = false;

/** Inject the Pixel base code + first PageView. Idempotent; no-op without id/consent. */
export function loadMetaPixel(): void {
  if (typeof window === "undefined" || loaded) return;
  if (!PIXEL_ID || !hasMarketingConsent()) return;
  try {
    // Standard Meta base snippet, unminified.
    /* eslint-disable @typescript-eslint/no-explicit-any -- Meta's stub shape is untyped */
    const w = window as unknown as Record<string, unknown> & { fbq?: any; _fbq?: unknown };
    if (!w.fbq) {
      const n: any = function (...args: unknown[]) {
        if (n.callMethod) n.callMethod(...args);
        else n.queue.push(args);
      };
      w.fbq = n;
      if (!w._fbq) w._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(s);
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    loaded = true;
    (w.fbq as FbqFn)("init", PIXEL_ID);
    trackPageView();
  } catch {
    /* never break the app over a tracker */
  }
}

function fire(event: string, params: Record<string, unknown> | undefined, eventId?: string): void {
  if (typeof window === "undefined" || !PIXEL_ID || !hasMarketingConsent()) return;
  try {
    const fbq = (window as unknown as { fbq?: FbqFn }).fbq;
    if (!fbq) return;
    fbq("track", event, params ?? {}, { eventID: eventId ?? newEventId() });
  } catch {
    /* swallow */
  }
}

export function trackPageView(eventId?: string): void {
  fire("PageView", undefined, eventId);
}

export function trackViewContent(
  params: { contentId?: string; contentName?: string; value?: number },
  eventId?: string,
): void {
  fire(
    "ViewContent",
    {
      ...(params.contentId ? { content_ids: [params.contentId], content_type: "product" } : {}),
      ...(params.contentName ? { content_name: params.contentName } : {}),
      ...(typeof params.value === "number" ? { value: params.value, currency: "INR" } : {}),
    },
    eventId,
  );
}

export function trackInitiateCheckout(
  params: { contentId?: string; contentName?: string; value?: number },
  eventId?: string,
): void {
  fire(
    "InitiateCheckout",
    {
      ...(params.contentId ? { content_ids: [params.contentId], content_type: "product" } : {}),
      ...(params.contentName ? { content_name: params.contentName } : {}),
      ...(typeof params.value === "number" ? { value: params.value, currency: "INR" } : {}),
    },
    eventId,
  );
}

export function trackLead(params?: Record<string, unknown>, eventId?: string): void {
  fire("Lead", params, eventId);
}

export function trackSubscribe(
  params: { value: number; currency?: string },
  eventId: string,
): void {
  fire(CONVERSION_EVENT_NAME, { value: params.value, currency: params.currency ?? "INR" }, eventId);
}
