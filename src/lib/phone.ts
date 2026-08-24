// ─────────────────────────────────────────────────────────────
// PUNYATA — India phone helpers (shared client + server)
//
// ONE copy of normalisation and ONE of display formatting so the
// login/verify paths (server route + browser verifyOtp) and every
// page that shows a phone can never drift apart [Bug 1.3 / 3.6].
// Pure functions only.
// ─────────────────────────────────────────────────────────────

/**
 * Normalise any India-shaped input to Supabase's required E.164:
 * '9876543210' | '09876543210' | '919876543210' | '+91-98765 43210'
 * → '+919876543210'. Returns null for anything unusable.
 *
 * EVERY branch enforces the 6-9 leading digit (valid Indian mobile
 * prefix) — landline-shaped or junk numbers are rejected no matter
 * how they were typed [Bug 1.3].
 */
export function normalizePhoneE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0") && /^[6-9]/.test(digits.slice(1)))
    return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2)))
    return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("091") && /^[6-9]/.test(digits.slice(3)))
    return `+${digits.slice(1)}`;
  return null;
}

/**
 * Display formatter for stored E.164 values: "+919876543210" →
 * "+91 98765 43210". Also repairs bare "919876543210" and bare
 * 10-digit values that predate strict normalisation, so the same
 * number renders identically on every page [Bug 3.6].
 */
export function formatPhoneDisplay(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  return e164;
}
