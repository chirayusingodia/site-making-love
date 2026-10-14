// First-touch marketing attribution — captured once on a visitor's first
// landing hit, kept in localStorage, and read back at checkout time so a
// subscriber who converts days later still credits the channel that
// actually brought them in (a religious-subscription purchase is rarely
// an impulse click-through).
//
// This is deliberately separate from `leads.attribution_token` (§9),
// which credits a SALES AGENT/telecaller on a payment link — this module
// answers "which ad/platform" instead of "which staff member".

import { buildFbc } from "@/lib/meta-ids";
import { getMarketingConsent, hasMarketingConsent } from "@/lib/meta-pixel";

const STORAGE_KEY = "punyata_attribution_v1";

export interface StoredAttribution {
  channel: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
  landingPath: string;
  firstSeenAt: string;
  /** Meta browser ids — optional so records stored before this field
   *  existed still parse (missing = null/undefined). Only populated with
   *  marketing consent. */
  fbp?: string | null;
  fbc?: string | null;
}

function readCookie(name: string): string | null {
  try {
    for (const part of document.cookie.split(";")) {
      const eq = part.indexOf("=");
      if (eq > 0 && part.slice(0, eq).trim() === name) {
        return decodeURIComponent(part.slice(eq + 1).trim());
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Current Meta browser ids: `_fbp`/`_fbc` cookies, with `_fbc` rebuilt from
 * a `fbclid` in the URL (or the first-touch record) when the cookie is
 * absent. Returns nulls without marketing consent.
 */
export function readMetaBrowserIds(): { fbp: string | null; fbc: string | null } {
  if (typeof window === "undefined" || !hasMarketingConsent()) return { fbp: null, fbc: null };
  const fbp = readCookie("_fbp");
  let fbc = readCookie("_fbc");
  if (!fbc) {
    let fbclid: string | null = null;
    try {
      fbclid = new URLSearchParams(window.location.search).get("fbclid");
    } catch {
      fbclid = null;
    }
    if (fbclid) {
      fbc = buildFbc(fbclid, Date.now());
    } else {
      const stored = getStoredAttribution();
      if (stored?.fbc) fbc = stored.fbc;
      else if (stored?.fbclid) fbc = buildFbc(stored.fbclid, Date.parse(stored.firstSeenAt) || Date.now());
    }
  }
  return { fbp, fbc };
}

/** Refresh fbp/fbc on the stored record (the Pixel may set them after first touch). */
export function refreshStoredMetaIds(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const rec = JSON.parse(raw) as StoredAttribution;
    const { fbp, fbc } = readMetaBrowserIds();
    if (!fbp && !fbc) return;
    rec.fbp = fbp ?? rec.fbp ?? null;
    rec.fbc = fbc ?? rec.fbc ?? null;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
  } catch {
    /* nice-to-have */
  }
}

/** Matching context sent to create-checkout (server validates + adds IP). */
export function getMetaCheckoutContext(): {
  fbp: string | null;
  fbc: string | null;
  eventSourceUrl: string;
  userAgent: string;
  consent: "granted" | "declined" | "unset";
} {
  refreshStoredMetaIds();
  const { fbp, fbc } = readMetaBrowserIds();
  return {
    fbp,
    fbc,
    eventSourceUrl: typeof window !== "undefined" ? window.location.href.split("#")[0] : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    // Effective state, so opt_out-mode visitors who never chose still read as granted.
    consent: hasMarketingConsent() ? "granted" : getMarketingConsent(),
  };
}

function resolveChannel(params: {
  utmSource: string | null;
  gclid: string | null;
  fbclid: string | null;
  referrerHost: string | null;
}): string {
  const { utmSource, gclid, fbclid, referrerHost } = params;
  if (utmSource) return utmSource.toLowerCase();
  if (gclid) return "google_ads";
  if (fbclid) return "facebook_ads";
  if (referrerHost) {
    const host = referrerHost.toLowerCase();
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("facebook.com") || host === "l.facebook.com") return "facebook";
    if (host.includes("whatsapp.com") || host === "wa.me") return "whatsapp";
    if (host.includes("google.")) return "google_organic";
    if (host.includes("youtube.com")) return "youtube";
    return `referral:${host}`;
  }
  return "direct";
}

/** Call once per app boot (client-only). No-op if attribution is already stored. */
export function captureAttributionOnce(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(STORAGE_KEY)) return; // first-touch: never overwrite

    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get("utm_source");
    const gclid = params.get("gclid");
    const fbclid = params.get("fbclid");
    let referrerHost: string | null = null;
    try {
      referrerHost = document.referrer ? new URL(document.referrer).hostname : null;
    } catch {
      referrerHost = null;
    }

    const attribution: StoredAttribution = {
      channel: resolveChannel({ utmSource, gclid, fbclid, referrerHost }),
      utmSource,
      utmMedium: params.get("utm_medium"),
      utmCampaign: params.get("utm_campaign"),
      utmContent: params.get("utm_content"),
      utmTerm: params.get("utm_term"),
      gclid,
      fbclid,
      landingPath: window.location.pathname,
      firstSeenAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // localStorage unavailable (private mode, disabled storage) — attribution
    // is a nice-to-have, never worth breaking navigation over.
  }
}

/** Read back at checkout time. Null if never captured (e.g. storage was blocked). */
export function getStoredAttribution(): StoredAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAttribution) : null;
  } catch {
    return null;
  }
}
