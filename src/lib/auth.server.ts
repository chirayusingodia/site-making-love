import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneE164 } from "@/lib/phone";

// ─────────────────────────────────────────────────────────────
// PUNYATA — Signup-first checkout: phone OTP auth (server-only)
//
// One combined login/signup form (matched by phone number):
//   new number  → create auth user + profiles row, then send OTP
//   known number → just send OTP (typed name is IGNORED — never
//                  overwrite an existing profile's name from the
//                  login form; no duplicate profiles, ever)
//
// OTP channel: Supabase Auth native phone OTP (SMS/voice via the
// provider configured on the project). NO WhatsApp-OTP vendor.
//
// VERIFY happens client-side (supabase.auth.verifyOtp) — that is
// the ONLY way the 30-day session lands in the caller's browser
// storage where it is used. A server "verify" route would burn the
// single-use code and leave the browser sessionless. Deliberate,
// documented deviation from the session prompt §5.
// ─────────────────────────────────────────────────────────────

/**
 * Normalise any India-shaped input to Supabase's required E.164.
 * The single shared implementation lives in lib/phone.ts (the
 * browser verifyOtp path must normalise identically) [Bug 1.3].
 */
export { normalizePhoneE164 };

export interface RequestOtpResult {
  isNewUser: boolean;
}

// ─── OTP abuse protection (Layer 3): Postgres-backed limits ───
// /api/auth/request-otp is public by design, which makes it an
// OTP-bombing / SMS-pumping target. Every send decision is gated by
// and logged to public.otp_send_log (migration 20260823_016):
//
//   phone : ≤ 3 sends / 10 min   AND  ≤ 8 sends / 24 h
//   ip    : ≤ 5 DISTINCT phones / hour  (catches one attacker,
//           many victim numbers — invisible to per-phone limits)
//
// Tunables live HERE and nowhere else — loosen/tighten after real
// traffic, never inline magic numbers at the query sites.
export const OTP_RATE_LIMITS = {
  /** Max OTPs per phone number in any rolling 10-minute window. */
  PHONE_MAX_PER_10_MIN: 3,
  /** Max OTPs per phone number in any rolling 24-hour window. */
  PHONE_MAX_PER_24_H: 8,
  /** Max distinct phone numbers one IP may request in an hour. */
  IP_MAX_DISTINCT_PHONES_PER_HOUR: 5,
} as const;

// Window lengths now live in public.otp_check_and_log's SQL
// (migration 018 §16) — tune BOTH together when loosening/tightening.

/** Rejections MUST map to one generic client-facing message (429) —
 *  never reveal WHICH limit tripped; that distinction is itself
 *  reconnaissance for an attacker tuning their script. */
export class OtpRateLimitError extends Error {
  reason: "phone_burst_10m" | "phone_daily" | "ip_distinct_phones";
  constructor(reason: "phone_burst_10m" | "phone_daily" | "ip_distinct_phones") {
    super(`OTP rate limited (${reason})`);
    this.name = "OtpRateLimitError";
    this.reason = reason;
  }
}

type LedgerError = { code?: string; message?: string } | null | undefined;

/** True only for "relation does not exist" shapes — i.e. migration
 *  016 has not been applied yet. Any OTHER ledger failure fails
 *  CLOSED (throw): a broken limiter must never silently become an
 *  unlimited SMS tap. */
function isLedgerNotDeployed(err: LedgerError): boolean {
  const code = err?.code ?? "";
  const msg = err?.message ?? "";
  return code === "42P01" || code === "PGRST205" || /does not exist|schema cache/i.test(msg);
}

let warnedLedgerMissing = false;

/**
 * Enforces the OTP_RATE_LIMITS for this (phone, ip) against
 * otp_send_log and RECORDS the attempt (allowed or blocked).
 * Throws OtpRateLimitError when blocked. Runs BEFORE anything
 * touches auth users or Supabase's SMS send.
 *
 * [Bug 1.7] The check + ledger write run ATOMICALLY inside
 * public.otp_check_and_log (migration 018) under transaction
 * advisory locks — the old count-then-insert let two concurrent
 * requests both slip under the cap.
 */
async function enforceAndLogOtpSend(
  db: SupabaseClient,
  phone: string,
  ip: string | null,
): Promise<void> {
  const { data, error } = await db.rpc("otp_check_and_log", {
    p_phone: phone,
    p_ip: ip,
  });
  if (error) {
    if (isLedgerNotDeployed((error as LedgerError) ?? null)) {
      // Migration 016/018 not applied yet: deploy-safety valve — checks
      // degrade OPEN until Chirayu applies them. Loud, once per process.
      if (!warnedLedgerMissing) {
        warnedLedgerMissing = true;
        console.error(
          "⚠️ otp_check_and_log missing — apply supabase/migrations/20260823_016_otp_rate_limit.sql " +
            "and 20260824_018_bugfix_hardening.sql. OTP rate limiting is INACTIVE until then.",
        );
      }
      return;
    }
    throw new Error(`otp_send_log check failed: ${error.message}`);
  }

  const verdict = typeof data === "string" ? data : "allowed";
  if (verdict !== "allowed") {
    throw new OtpRateLimitError(verdict as OtpRateLimitError["reason"]);
  }
}

/**
 * Idempotently ensures an auth user + profiles row exist for this
 * phone, then sends the OTP. `name` is applied ONLY when creating a
 * brand-new profile; for existing numbers it is ignored so a login
 * attempt can never rename someone else's account.
 *
 * db must be a SERVICE-ROLE client (auth.admin is not reachable
 * with the anon key).
 */
export async function requestOtpForPhone(
  db: SupabaseClient,
  rawName: string,
  rawPhone: string,
  opts?: {
    /** Caller IP (route extracts it from proxy headers). Powers the
     *  per-IP distinct-phone limit + attempt logging. Nullable. */
    clientIp?: string | null;
    /** Turnstile token from the browser, forwarded to Supabase's OTP
     *  call when the app-level secret is NOT configured (Supabase
     *  dashboard captcha path). Consumed tokens are never forwarded
     *  — see turnstile.server.ts. */
    captchaToken?: string | null;
  },
): Promise<RequestOtpResult> {
  const phone = normalizePhoneE164(rawPhone);
  if (!phone) {
    throw new Error("Invalid Indian mobile number");
  }
  const name = rawName.trim().slice(0, 120);
  const ip =
    typeof opts?.clientIp === "string" && opts.clientIp.trim() ? opts.clientIp.trim() : null;

  // Abuse gate FIRST — cheapest check, before any auth/profile work,
  // so a blocked script costs us one indexed count instead of an SMS.
  await enforceAndLogOtpSend(db, phone, ip);

  // Profiles is the source of truth for "is this number known"
  // (unique phone column mirrors auth.users for our flows).
  const { data: existing, error: lookupErr } = await db
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (lookupErr) throw new Error(`profiles lookup failed: ${lookupErr.message}`);

  let isNewUser = false;

  if (!existing) {
    // Brand-new number: create the auth user first (phone unconfirmed —
    // the OTP below IS the confirmation), then its profile row.
    // If the auth user already exists but the profile row was lost
    // (partial legacy state), createUser fails and we recover below.
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      phone,
      phone_confirm: false,
      user_metadata: name ? { full_name: name } : {},
    });

    if (createErr || !created?.user) {
      const msg = createErr?.message ?? "";
      if (!/already|registered|exists/i.test(msg)) {
        throw new Error(`user create failed: ${msg}`);
      }
      // Auth user exists without a profile row. We cannot cheaply
      // resolve their uuid by phone server-side; after the client
      // verifies the OTP, ensureMyProfile() upserts the missing row
      // under their own RLS grant. Treat as returning user.
      await sendSmsOtp(db, phone, opts?.captchaToken);
      return { isNewUser: false };
    }

    const { error: profErr } = await db.from("profiles").insert({
      id: created.user.id,
      full_name: name || null,
      phone,
    });
    if (profErr) {
      // Race (unique phone) → someone else created it first; fine.
      if (!/duplicate key|unique/i.test(profErr.message)) {
        throw new Error(`profile insert failed: ${profErr.message}`);
      }
    }
    isNewUser = true;
  }

  await sendSmsOtp(db, phone, opts?.captchaToken);
  return { isNewUser };
}

async function sendSmsOtp(
  db: SupabaseClient,
  phone: string,
  captchaToken?: string | null,
): Promise<void> {
  // Installed supabase-js exposes no admin.signInWithSms; the standard
  // client method covers both cases we need:
  //   • known number  → passwordless login OTP
  //   • brand-new     → would also self-signup, but we pre-created the
  //                     user above precisely to attach full_name first.
  //
  // captchaToken rides through per Supabase's documented CAPTCHA
  // integration (gotrue_meta_security): when Chirayu enables CAPTCHA
  // protection in Supabase Auth with the Turnstile secret, GoTrue
  // enforces it here; while disabled the field is ignored — harmless.
  const { error } = await db.auth.signInWithOtp({
    phone,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  });
  if (error) {
    // Rate-limit / provider errors surface verbatim — the UI shows
    // them and the user retries; nothing is silently swallowed.
    throw new Error(`OTP send failed: ${error.message}`);
  }
}
