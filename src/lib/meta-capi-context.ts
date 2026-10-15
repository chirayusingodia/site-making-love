// Validation of the browser-supplied Meta matching context. Pure — shared by
// the create-checkout route and tests. The body is UNTRUSTED: every string is
// length-capped, unknown keys are dropped, and client IP is never accepted
// from the body (the route stamps it from request headers).

export type MarketingConsent = "granted" | "declined" | "unset";

export interface MarketingContext {
  fbp?: string;
  fbc?: string;
  client_ip?: string;
  client_user_agent?: string;
  event_source_url?: string;
  consent: MarketingConsent;
}

function str(v: unknown, max: number): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
}

/** First hop of x-forwarded-for / cf-connecting-ip; null if absent. */
export function clientIpFromHeaders(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf.slice(0, 64);
  const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff ? xff.slice(0, 64) : null;
}

export function sanitizeMarketingContext(
  raw: unknown,
  opts: { clientIp: string | null; headerUserAgent: string | null },
): MarketingContext {
  const m = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const consent: MarketingConsent =
    m.consent === "granted" || m.consent === "declined" ? m.consent : "unset";
  const ctx: MarketingContext = { consent };
  // fbp/fbc are only honoured when the visitor accepted marketing consent.
  if (consent === "granted") {
    const fbp = str(m.fbp, 100);
    const fbc = str(m.fbc, 300);
    if (fbp && /^fb\.\d+\.\d+\.\d+$/.test(fbp)) ctx.fbp = fbp;
    if (fbc && /^fb\.\d+\.\d+\..+$/.test(fbc)) ctx.fbc = fbc;
  }
  const url = str(m.eventSourceUrl, 500);
  if (url && /^https?:\/\//i.test(url)) ctx.event_source_url = url;
  // User-agent: prefer the real request header over the body value.
  const ua = str(opts.headerUserAgent, 400) ?? str(m.userAgent, 400);
  if (ua) ctx.client_user_agent = ua;
  if (opts.clientIp) ctx.client_ip = opts.clientIp;
  return ctx;
}
