import { createFileRoute } from "@tanstack/react-router";
import { json, getServiceClient } from "@/lib/supabase-admin.server";
import { requestOtpForPhone, OtpRateLimitError } from "@/lib/auth.server";
import { gateOtpCaptcha } from "@/lib/turnstile.server";

// POST /api/auth/request-otp
// Body: { name?: string, phone: string, captchaToken?: string }
//
// Combined login/signup gate. Creates the auth user + profiles row
// for a brand-new number, ignores `name` for known numbers, and
// sends the OTP via Supabase Auth phone provider (SMS/voice).
// Response never reveals whether the number existed beyond the
// isNewUser convenience flag (the OTP itself gates everything).
//
// Abuse protection (session 2026-08-23):
//   Layer 2 — Turnstile token gated here (see turnstile.server.ts).
//   Layer 3 — per-phone/per-IP limits + attempt ledger enforced in
//             requestOtpForPhone → otp_send_log; rejections answer
//             429 with ONE generic message regardless of which limit
//             tripped ("Thodi der baad try karein") — the specific
//             limit must never be revealed.

/** Client IP behind Vercel/Cloudflare proxies. First hop of
 *  x-forwarded-for is the original client; cf-connecting-ip is
 *  Cloudflare's authoritative value when present. */
function clientIpFromRequest(request: Request): string | null {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  return real ? real.trim() : null;
}

export const Route = createFileRoute("/api/auth/request-otp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { name?: unknown; phone?: unknown; captchaToken?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const name = typeof body?.name === "string" ? body.name : "";
        if (typeof body?.phone !== "string" || body.phone.trim().length < 10) {
          return json({ error: "Valid mobile number required" }, 400);
        }

        // ── Layer 2: CAPTCHA gate (mode decided by env) ──────────
        const ip = clientIpFromRequest(request);
        const captcha = await gateOtpCaptcha(body?.captchaToken, ip);
        if (!captcha.ok) {
          return json(
            { error: "Security check fail hui — page reload karke phir try karein." },
            400,
          );
        }

        try {
          const db = getServiceClient();
          const result = await requestOtpForPhone(db, name, body.phone, {
            clientIp: ip,
            captchaToken: captcha.forwardToken,
          });
          return json({ ok: true, ...result });
        } catch (err) {
          if (err instanceof OtpRateLimitError) {
            // Generic ON PURPOSE — never reveal which limit fired.
            console.warn(`request-otp rate limited: ${err.reason} ip=${ip ?? "?"}`);
            return json({ error: "Thodi der baad try karein." }, 429);
          }
          console.error("request-otp error:", err);
          const message = err instanceof Error ? err.message : "OTP request failed";
          // Normalisation errors are caller mistakes; everything else
          // is ours (config/provider) — still surfaced for the retry UI.
          return json(
            {
              error: /Invalid Indian mobile/.test(message)
                ? message
                : "OTP bhej nahi paye — thodi der baad try karein.",
            },
            /Invalid Indian mobile/.test(message) ? 400 : 500,
          );
        }
      },
    },
  },
});
