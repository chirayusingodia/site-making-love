// ─────────────────────────────────────────────────────────────
// PUNYATA — Cloudflare Turnstile client (Layer 2, browser half)
//
// Dependency-free loader/renderer for the Turnstile widget on
// /login. Active ONLY when VITE_TURNSTILE_SITE_KEY is configured —
// without it every function is a no-op and /login behaves exactly
// as before.
//
// Tokens are SINGLE-USE: after each request the widget must be
// reset() so the next send has a fresh token. The host container
// must stay MOUNTED (off-screen, not display:none) between the
// form step and the OTP step so a resend can still pull a fresh
// token without remounting the iframe.
// ─────────────────────────────────────────────────────────────

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const turnstileSiteKey = (
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || ""
).trim();

export function turnstileEnabled(): boolean {
  return turnstileSiteKey.length > 0;
}

interface TurnstileWidgetApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => boolean;
      theme?: string;
      appearance?: string;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileWidgetApi;
  }
}

let scriptPromise: Promise<TurnstileWidgetApi> | null = null;

/** Injects the Turnstile script once; resolves with the widget API. */
export function loadTurnstile(): Promise<TurnstileWidgetApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile loaded but API missing"));
    };
    script.onerror = () => {
      scriptPromise = null; // allow a later retry
      reject(new Error("Turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface RenderedTurnstile {
  widgetId: string;
  reset: () => void;
}

/** Renders into `host`; token state flows through the callbacks —
 *  expired/error clear it so a stale token is never sent. */
export async function renderTurnstile(
  host: HTMLElement,
  onToken: (token: string) => void,
  onUnavailable: () => void,
): Promise<RenderedTurnstile> {
  const ts = await loadTurnstile();
  const widgetId = ts.render(host, {
    sitekey: turnstileSiteKey,
    callback: onToken,
    "expired-callback": onUnavailable,
    // Returning true tells Turnstile the error was handled; the
    // cleared-token state makes the UI gate on a fresh solve.
    "error-callback": () => {
      onUnavailable();
      return true;
    },
    theme: "light",
    // Invisible for solved-by-browser challenges; only shows an
    // interactive box when Cloudflare actually needs one.
    appearance: "interaction-only",
  });
  return {
    widgetId,
    reset: () => ts.reset(widgetId),
  };
}
