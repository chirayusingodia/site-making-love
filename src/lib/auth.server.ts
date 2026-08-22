import type { SupabaseClient } from "@supabase/supabase-js";

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
 * Normalise any India-shaped input to Supabase's required E.164:
 * '9876543210' | '09876543210' | '919876543210' | '+91-98765 43210'
 * → '+919876543210'. Returns null for anything unusable.
 */
export function normalizePhoneE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("091")) return `+${digits.slice(1)}`;
  return null;
}

export interface RequestOtpResult {
  isNewUser: boolean;
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
): Promise<RequestOtpResult> {
  const phone = normalizePhoneE164(rawPhone);
  if (!phone) {
    throw new Error("Invalid Indian mobile number");
  }
  const name = rawName.trim().slice(0, 120);

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
      await sendSmsOtp(db, phone);
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

  await sendSmsOtp(db, phone);
  return { isNewUser };
}

async function sendSmsOtp(db: SupabaseClient, phone: string): Promise<void> {
  // Installed supabase-js exposes no admin.signInWithSms; the standard
  // client method covers both cases we need:
  //   • known number  → passwordless login OTP
  //   • brand-new     → would also self-signup, but we pre-created the
  //                     user above precisely to attach full_name first.
  const { error } = await db.auth.signInWithOtp({ phone });
  if (error) {
    // Rate-limit / provider errors surface verbatim — the UI shows
    // them and the user retries; nothing is silently swallowed.
    throw new Error(`OTP send failed: ${error.message}`);
  }
}
