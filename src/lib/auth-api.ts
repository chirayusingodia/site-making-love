import { supabase } from "@/lib/supabase";
import { getAccessToken } from "@/lib/admin-api";
import { normalizePhoneE164 } from "@/lib/phone";

// ─────────────────────────────────────────────────────────────
// PUNYATA — Signup-first checkout: auth client wrappers
//
// Thin browser-side wrappers around the new auth surface:
//   requestOtp → POST /api/auth/request-otp   (server route)
//   verifyOtp  → supabase.auth.verifyOtp      (client SDK)
//
// Verify deliberately runs in the BROWSER: the 30-day session must
// land in this device's storage where every RLS-scoped call uses
// it. A server verify route would burn the single-use OTP code and
// leave the browser sessionless (documented deviation from the
// session prompt §5 — same behaviour, correct layer).
//
// On-screen copy says only "OTP / कोड" — delivery is Supabase's
// configured SMS/voice provider; nothing here may promise WhatsApp.
// ─────────────────────────────────────────────────────────────

export class AuthApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Sends the OTP; creates profile for a brand-new number server-side.
 *  captchaToken (Turnstile) rides along when the widget is enabled —
 *  the server either verifies it itself or forwards it to Supabase. */
export async function requestOtp(
  name: string,
  phoneRaw: string,
  captchaToken?: string,
): Promise<{ isNewUser: boolean }> {
  const res = await fetch("/api/auth/request-otp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, phone: phoneRaw, ...(captchaToken ? { captchaToken } : {}) }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; isNewUser?: boolean };
  if (!res.ok) throw new AuthApiError(data.error ?? `Request failed (${res.status})`, res.status);
  return { isNewUser: data.isNewUser ?? false };
}

/**
 * Verifies the 6-digit OTP and establishes the session on this
 * device. Works identically for new signups and returning logins.
 */
export async function verifyOtp(phoneRaw: string, otp: string): Promise<void> {
  // The server normalised the number before sending; mirror that
  // through the SAME shared helper (lib/phone.ts) so Supabase sees
  // the exact E.164 identity the code was issued to [Bug 1.3].
  const e164 = normalizePhoneE164(phoneRaw);
  if (!e164) throw new AuthApiError("Invalid mobile number", 400);

  const { error } = await supabase.auth.verifyOtp({ phone: e164, token: otp, type: "sms" });
  if (error) throw new AuthApiError(error.message, 400);
}

export interface MyProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  state: string | null;
  pincode: string | null;
}

/** Own profile via RLS ("profiles: user reads own"). */
export async function fetchMyProfile(): Promise<MyProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id,full_name,phone,email,address_line1,address_line2,state,pincode")
    .eq("id", user.id)
    .maybeSingle();
  return (data as MyProfile | null) ?? null;
}

/**
 * First-ever Google sign-in confirm step (SESSION_GOOGLE_LOGIN_PROMPT
 * §4): attaches a real phone number to the just-authenticated Google
 * identity. No OTP by design — duplicates answer 409 code=phone_taken,
 * which complete-profile.tsx maps to the "OTP se login karein" route.
 * Runs under this browser's own session (callUserApi → Bearer token),
 * so the insert lands through the caller's own RLS grant.
 */
export async function completeGoogleProfile(fullName: string, phoneRaw: string): Promise<void> {
  await callUserApi<{ ok: boolean }>("/api/auth/complete-google-profile", {
    full_name: fullName,
    phone: phoneRaw,
  });
}

/**
 * Legacy-edge recovery: auth user exists but its profiles row was
 * lost before this session's server-side creation existed. Inserts
 * the missing own row under the caller's RLS grant. No-op when the
 * row already exists.
 */
export async function ensureMyProfile(fullName: string | null): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const existing = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (existing.data) return;

  const phone = (user.phone ?? "").trim() || null;
  await supabase.from("profiles").insert({
    id: user.id,
    full_name: fullName,
    ...(phone ? { phone } : {}),
  });
}

/** Authenticated POST helper for user-owned /api routes. */
export async function callUserApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new AuthApiError(data.error ?? `Request failed (${res.status})`, res.status);
  return data;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
