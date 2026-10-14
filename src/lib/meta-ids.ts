// Shared (client + server) Meta identifiers. ONE definition of the
// conversion event_id so the browser Pixel `eventID` and the server CAPI
// `event_id` can never drift — that string equality is exactly what lets
// Meta deduplicate instead of double-counting.

/** Deterministic Subscribe event id for a subscription's first payment. */
export function subscribeEventId(subscriptionId: string): string {
  return `subscribe_${subscriptionId}`;
}

/** Meta's `_fbc` format: fb.<subdomainIndex>.<creationTimeMs>.<fbclid>. */
export function buildFbc(fbclid: string, timestampMs: number): string {
  return `fb.1.${timestampMs}.${fbclid}`;
}

/** Random per-event id for non-conversion pixel events. */
export function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The ONE conversion event name, used by the browser Pixel
 * (ad-conversions.ts / meta-pixel.ts) AND the server CAPI hook. Meta
 * deduplicates on (event_name, event_id), so both sides must send exactly
 * this. "Purchase" is the standard value-optimisable event for a first paid
 * subscription; switch to "Subscribe" here if you prefer — nowhere else.
 */
export const CONVERSION_EVENT_NAME = "Purchase";
