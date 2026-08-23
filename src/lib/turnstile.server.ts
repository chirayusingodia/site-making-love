import process from "node:process";

// ─────────────────────────────────────────────────────────────
// PUNYATA — OTP-request CAPTCHA gate (Layer 2), server half
//
// Cloudflare Turnstile on /api/auth/request-otp. Exactly ONE
// verifier may consume a Turnstile token (siteverify marks them
// invalid after first use), so the mode is chosen by env — never
// both:
//
//   TURNSTILE_SECRET_KEY set  → APP-VERIFIED: this module calls
//     Cloudflare siteverify itself and REJECTS tokenless requests.
//     Works immediately, independent of any Supabase setting.
//     The token is CONSUMED here → it is NOT forwarded to Supabase.
//
//   secret absent             → PASSTHROUGH: the browser token
//     rides to Supabase inside signInWithOtp options.captchaToken
//     (Supabase's documented CAPTCHA integration). Enforces only
//     once Chirayu turns on CAPTCHA protection in the Supabase
//     dashboard with the same Turnstile secret; before that it is
//     ignored by GoTrue — harmless.
//
// Env is read PER CALL — module-scope reads break on request-scoped
// Workers env (see config.server.ts).
// ─────────────────────────────────────────────────────────────

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface CaptchaGateResult {
  ok: boolean;
  /** Token to forward into Supabase's OTP call (passthrough mode
   *  only; app-verified tokens are consumed and never forwarded). */
  forwardToken: string | null;
}

function turnstileSecret(): string | null {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  return secret && secret.trim() ? secret.trim() : null;
}

/**
 * Gates one OTP request. In app-verified mode a missing/invalid
 * token fails closed with ok=false (route answers 400 with a
 * retry hint — distinct from the rate-limit 429 on purpose).
 */
export async function gateOtpCaptcha(
  captchaToken: unknown,
  remoteIp: string | null,
): Promise<CaptchaGateResult> {
  const secret = turnstileSecret();

  if (!secret) {
    // Passthrough mode — Supabase-dashboard path.
    return { ok: true, forwardToken: typeof captchaToken === "string" ? captchaToken : null };
  }

  if (typeof captchaToken !== "string" || !captchaToken.trim()) {
    return { ok: false, forwardToken: null };
  }

  const body = new URLSearchParams({ secret, response: captchaToken.trim() });
  if (remoteIp) body.set("remoteip", remoteIp);

  let verdict: { success?: boolean } | null = null;
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    verdict = (await res.json().catch(() => null)) as { success?: boolean } | null;
  } catch {
    // Siteverify unreachable → fail closed; Turnstile outages are
    // rare and brief, and an OTP flood is exactly what this gates.
    return { ok: false, forwardToken: null };
  }

  return { ok: verdict?.success === true, forwardToken: null };
}
