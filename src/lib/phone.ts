// ─────────────────────────────────────────────────────────────
// PUNYATA — phone helpers (shared client + server)
//
// ONE copy of normalisation and ONE of display formatting so the
// login/verify paths (server route + browser verifyOtp) and every
// page that shows a phone can never drift apart [Bug 1.3 / 3.6].
// Pure functions only.
//
// International (migration 044): Indian numbers behave EXACTLY as
// before (byte-identical output — see scratch/phone_legacy_snapshot.ts).
// Non-Indian numbers are accepted only as explicit E.164 (`+…` / `00…`)
// or when the caller names the country (the picker on checkout).
// Bare foreign digits with default country IN are rejected: they are
// ambiguous with a typo'd Indian number (2026-08-30 bug class).
//
// KEEP IN STEP with SQL public.normalize_phone_e164() in migration 044.
// ─────────────────────────────────────────────────────────────

import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import type { CountryCode } from "libphonenumber-js/min";

export type { CountryCode };
export type PhoneParse = { e164: string; country: CountryCode; national: string } | null;

/** The four legacy India branches, verbatim from migration 026. */
function indiaLegacy(digits: string): string | null {
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
 * TS mirror of SQL normalize_phone_e164() (migration 044). Test-only
 * export: asserts that nothing parsePhone returns is rewritten or
 * rejected by the DB trigger.
 */
export function sqlMirrorNormalize(raw: string | null): string | null {
  if (raw === null) return null;
  const s = raw.trim();
  const intl = s.startsWith("+") || s.startsWith("00");
  let digits = s.replace(/\D/g, "");
  if (s.startsWith("00")) digits = digits.slice(2);
  if (!intl) return indiaLegacy(digits);
  if (/^91[6-9][0-9]{9}$/.test(digits)) return `+${digits}`;
  if (digits.startsWith("91")) return null;
  if (/^[1-9][0-9]{7,14}$/.test(digits)) return `+${digits}`;
  return null;
}

/**
 * THE parser. `defaultCountry` is what the user picked in the country
 * selector (IN when nothing was picked).
 */
export function parsePhone(raw: string, defaultCountry: CountryCode = "IN"): PhoneParse {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const intl = s.startsWith("+") || s.startsWith("00");

  // India fast path — identical to the legacy parser.
  if (!intl && defaultCountry === "IN") {
    const e164 = indiaLegacy(s.replace(/\D/g, ""));
    return e164 ? { e164, country: "IN", national: e164.slice(3) } : null;
  }

  // `00` international prefix → `+`
  const input = s.startsWith("00") ? `+${s.slice(2)}` : s;
  const p = parsePhoneNumberFromString(input, defaultCountry);
  if (!p || !p.isValid()) return null;
  const e164 = p.number as string;
  // Indian numbers: enforce the 6-9 mobile prefix like every other path.
  if (p.countryCallingCode === "91" && !/^\+91[6-9]\d{9}$/.test(e164)) return null;
  // Never emit something the DB trigger would reject or rewrite.
  if (sqlMirrorNormalize(e164) !== e164) return null;
  const country = (p.country ?? (p.countryCallingCode === "91" ? "IN" : undefined)) as
    | CountryCode
    | undefined;
  if (!country) return null;
  return { e164, country, national: String(p.nationalNumber) };
}

/**
 * Back-compat wrapper — every existing call site keeps working.
 * '9876543210' | '09876543210' | '919876543210' | '+91-98765 43210'
 * → '+919876543210'. Returns null for anything unusable.
 */
export function normalizePhoneE164(raw: string, defaultCountry: CountryCode = "IN"): string | null {
  return parsePhone(raw, defaultCountry)?.e164 ?? null;
}

/** Country of a stored/typed phone, "IN" when unparseable. */
export function phoneCountry(raw: string | null | undefined): CountryCode {
  if (!raw) return "IN";
  return parsePhone(raw)?.country ?? "IN";
}

/** True when the phone parses to a non-Indian country. */
export function isInternationalPhone(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const p = parsePhone(raw);
  return !!p && p.country !== "IN";
}

/**
 * E.164 without the '+' (for wa.me links and Meta CAPI hashing).
 * The ONLY helper allowed to strip the '+'.
 */
export function waDigits(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const n = normalizePhoneE164(e164);
  return n ? n.slice(1) : null;
}

/** ISO alpha-2 → flag emoji. */
export function flagEmoji(country: string | null | undefined): string {
  if (!country || !/^[A-Za-z]{2}$/.test(country)) return "";
  return String.fromCodePoint(
    ...country
      .toUpperCase()
      .split("")
      .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

/**
 * Display formatter for stored E.164 values: "+919876543210" →
 * "+91 98765 43210". Also repairs bare "919876543210" and bare
 * 10-digit values that predate strict normalisation, so the same
 * number renders identically on every page [Bug 3.6]. Other countries
 * use libphonenumber's international format.
 */
export function formatPhoneDisplay(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  if (e164.trim().startsWith("+") && !d.startsWith("91")) {
    const p = parsePhoneNumberFromString(e164.trim());
    if (p && p.isValid()) return p.formatInternational();
    return e164;
  }
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  return e164;
}
