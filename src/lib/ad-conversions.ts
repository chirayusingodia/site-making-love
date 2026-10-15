// Fires the one conversion event ad platforms actually optimize toward —
// a completed subscription. No-ops if the corresponding pixel/tag was
// never loaded (no env var set — see __root.tsx), so this is always safe
// to call regardless of whether ads are running yet.

import { CONVERSION_EVENT_NAME } from "@/lib/meta-ids";
import { hasMarketingConsent } from "@/lib/meta-pixel";

interface FbqFn {
  (
    command: "track",
    event: string,
    params?: Record<string, unknown>,
    options?: { eventID?: string },
  ): void;
}
interface GtagFn {
  (command: "event", eventName: string, params?: Record<string, unknown>): void;
}
declare global {
  interface Window {
    fbq?: FbqFn;
    gtag?: GtagFn;
  }
}

/**
 * `eventId` MUST be subscribeEventId(subscriptionId) (meta-ids.ts) — the same
 * string the webhook sends to Meta CAPI — so Meta deduplicates the pair.
 */
export function fireSubscribeConversion(params: {
  valuePaise: number;
  planName?: string;
  eventId: string;
}): void {
  if (typeof window === "undefined") return;
  const value = Math.round(params.valuePaise) / 100;
  try {
    // Consent-gated: the Pixel is only loaded after the visitor accepts, so
    // window.fbq is absent otherwise. Guard anyway in case a stub exists.
    if (hasMarketingConsent()) {
      window.fbq?.(
        "track",
        CONVERSION_EVENT_NAME,
        { value, currency: "INR" },
        { eventID: params.eventId },
      );
    }
  } catch {
    // never let a blocked/missing pixel break the success page
  }
  try {
    window.gtag?.("event", "subscribe", {
      value,
      currency: "INR",
      ...(params.planName ? { plan_name: params.planName } : {}),
    });
  } catch {
    // same — analytics failures must stay silent to the user
  }
}
