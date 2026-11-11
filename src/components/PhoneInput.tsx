import { useMemo, useState } from "react";
import { getCountries, getCountryCallingCode } from "libphonenumber-js/min";
import {
  flagEmoji,
  parsePhone,
  type CountryCode,
} from "@/lib/phone";

// ─────────────────────────────────────────────────────────────
// PUNYATA — country-aware phone input (ONE component, used on
// checkout, complete-profile and anywhere a phone is collected so
// they can never drift apart).
//
// 🇮🇳 India is the default and behaves exactly as before (10 digits,
// 6-9 prefix, numeric keypad). Other countries: no 10-digit cap;
// validity comes from the one shared parser (parsePhone). The caller
// always sends the resulting +E.164 to the server.
// ─────────────────────────────────────────────────────────────

/** NRI-heavy short list shown right after India. */
const PRIORITY: CountryCode[] = [
  "US", "GB", "AE", "CA", "AU", "SG", "SA", "QA", "KW", "OM", "BH", "NZ", "DE", "NL", "MY", "HK",
];

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

function optionLabel(code: CountryCode): string {
  return `${flagEmoji(code)} ${countryName(code)} (+${getCountryCallingCode(code)})`;
}

/** Split a stored E.164 into the picker's country + national digits. */
export function splitE164(e164: string | null | undefined): {
  country: CountryCode;
  national: string;
} {
  if (!e164) return { country: "IN", national: "" };
  const p = parsePhone(e164);
  if (!p) return { country: "IN", national: e164.replace(/\D/g, "").slice(-10) };
  return { country: p.country, national: p.national };
}

export interface PhoneFieldState {
  country: CountryCode;
  national: string;
  setCountry: (c: CountryCode) => void;
  setNational: (n: string) => void;
  /** Canonical +E.164, or null while the typed number isn't valid. */
  e164: string | null;
  /** Re-seed from a stored E.164 (e.g. loaded profile). */
  seed: (e164: string | null | undefined) => void;
}

/** State holder for one PhoneInput. */
export function usePhoneField(initialE164?: string | null): PhoneFieldState {
  const init = splitE164(initialE164);
  const [country, setCountryRaw] = useState<CountryCode>(init.country);
  const [national, setNationalRaw] = useState(init.national);
  const sanitize = (c: CountryCode, n: string) =>
    c === "IN" ? n.replace(/\D/g, "").slice(0, 10) : n.replace(/[^\d\s\-().]/g, "").slice(0, 20);
  return {
    country,
    national,
    setCountry: (c) => {
      setCountryRaw(c);
      setNationalRaw((n) => sanitize(c, n));
    },
    setNational: (n) => setNationalRaw(sanitize(country, n)),
    e164: parsePhone(national, country)?.e164 ?? null,
    seed: (e164) => {
      const s = splitE164(e164);
      setCountryRaw(s.country);
      setNationalRaw(s.national);
    },
  };
}

interface Props {
  field: PhoneFieldState;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  className?: string;
  /** Called on any edit (country or digits) — e.g. to clear errors. */
  onEdit?: () => void;
  onBlur?: () => void;
}

export function PhoneInput({ field, disabled, id, placeholder, className, onEdit, onBlur }: Props) {
  const [showAll, setShowAll] = useState(false);
  const all = useMemo(() => getCountries() as CountryCode[], []);
  const rest = useMemo(
    () =>
      all
        .filter((c) => c !== "IN" && !PRIORITY.includes(c))
        .sort((a, b) => countryName(a).localeCompare(countryName(b))),
    [all],
  );
  const isIN = field.country === "IN";
  // Keep the currently-selected country selectable even when it lives
  // in the collapsed "other" group.
  const selectedInRest = !isIN && !PRIORITY.includes(field.country);
  const expanded = showAll || selectedInRest;

  return (
    <div className={`flex items-stretch ${className ?? ""}`}>
      <select
        aria-label="Country code"
        value={field.country}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === "__more") {
            setShowAll(true);
            return;
          }
          field.setCountry(e.target.value as CountryCode);
          onEdit?.();
        }}
        className="max-w-[9.5rem] px-2 py-3 rounded-l-xl border border-r-0 border-black/10 bg-secondary font-semibold text-foreground text-sm outline-none focus:border-brand disabled:text-muted-foreground"
      >
        <option value="IN">{optionLabel("IN")}</option>
        {PRIORITY.map((c) => (
          <option key={c} value={c}>
            {optionLabel(c)}
          </option>
        ))}
        {expanded ? (
          <optgroup label="Other countries">
            {rest.map((c) => (
              <option key={c} value={c}>
                {optionLabel(c)}
              </option>
            ))}
          </optgroup>
        ) : (
          <option value="__more">Other countries…</option>
        )}
      </select>
      <input
        id={id}
        type="tel"
        inputMode={isIN ? "numeric" : "tel"}
        placeholder={placeholder ?? (isIN ? "9876543210" : "Mobile number")}
        value={field.national}
        autoComplete="tel-national"
        maxLength={isIN ? 10 : 20}
        disabled={disabled}
        onBlur={onBlur}
        onChange={(e) => {
          field.setNational(e.target.value);
          onEdit?.();
        }}
        className="w-full min-w-0 px-4 py-3 rounded-r-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground disabled:bg-secondary disabled:text-muted-foreground"
      />
    </div>
  );
}
