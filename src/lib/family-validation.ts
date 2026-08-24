// ─────────────────────────────────────────────────────────────
// PUNYATA — Shared profile/family form validators
//
// ONE copy of each rule, used by BOTH surfaces that write these
// fields:
//   • /api/profile/family-members  (end user, own subscription)
//   • /api/telecaller/family-members  (telecaller, on behalf)
//   • /api/profile/address  (end user)
//   • /api/telecaller/profile  (telecaller, allowlisted subset)
//
// Two copies of "slot 1–4, name ≥ 2 chars, dob YYYY-MM-DD" WILL
// drift; this module exists so they cannot. Hinglish error copy is
// deliberately identical across surfaces — the caller and the
// customer speak the same language.
// Pure functions only — unit-tested in scratch/.
// ─────────────────────────────────────────────────────────────

export interface FamilyMemberInputRow {
  slot_number: number;
  full_name: string;
  gotra: string | null;
  relation: string | null;
  dob: string | null;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * [Bug 4.7] The old regex accepted shape only — "2024-02-30",
 * "2024-13-05" and future dates all passed. This adds real calendar
 * validity plus sane bounds: must be a real date, in the past, and
 * after 1900.
 */
function isValidDob(value: string): boolean {
  if (!DOB_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y < 1900) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return false;
  }
  return dt.getTime() < Date.now(); // not in the future
}

/**
 * Validates + normalises a family-members submission.
 * Extracted verbatim from the original route logic (same rules,
 * same Hinglish copy): 1–4 members, unique slots 1–4, name ≥ 2
 * chars, optional gotra ≤60 / relation ≤40 / dob YYYY-MM-DD.
 */
export function validateFamilyMembers(members: unknown): ValidationResult<FamilyMemberInputRow[]> {
  if (!Array.isArray(members) || members.length === 0 || members.length > 4) {
    return { ok: false, error: "1 se 4 members required" };
  }

  const seen = new Set<number>();
  const rows: FamilyMemberInputRow[] = [];
  for (const raw of members as unknown[]) {
    // [Pass-2 L5] the old cast let null/primitive elements reach
    // property access and throw a TypeError — the contract is a clean
    // {ok:false}, never an exception.
    if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "Har member ek object hona chahiye" };
    }
    const rec = raw as Record<string, unknown>;
    const slot = typeof rec.slot_number === "number" ? Math.trunc(rec.slot_number) : NaN;
    const name = typeof rec.full_name === "string" ? rec.full_name.trim() : "";
    if (!(slot >= 1 && slot <= 4)) {
      return { ok: false, error: "slot_number 1-4 hona chahiye" };
    }
    if (seen.has(slot)) return { ok: false, error: `slot ${slot} duplicate hai` };
    seen.add(slot);
    if (!name || name.length < 2) return { ok: false, error: `Slot ${slot}: naam zaroori hai` };

    const gotra =
      typeof rec.gotra === "string" && rec.gotra.trim() ? rec.gotra.trim().slice(0, 60) : null;
    const relation =
      typeof rec.relation === "string" && rec.relation.trim()
        ? rec.relation.trim().slice(0, 40)
        : null;
    let dob: string | null = null;
    if (typeof rec.dob === "string" && rec.dob.trim()) {
      const candidate = rec.dob.trim();
      if (!DOB_RE.test(candidate)) {
        return { ok: false, error: `Slot ${slot}: dob YYYY-MM-DD format mein ho` };
      }
      if (!isValidDob(candidate)) {
        return { ok: false, error: `Slot ${slot}: dob ek sahi, past ki date ho` };
      }
      dob = candidate;
    }

    rows.push({
      slot_number: slot,
      full_name: name.slice(0, 120),
      gotra,
      relation,
      dob,
    });
  }
  return { ok: true, value: rows };
}

export interface ProfileAddressFields {
  address_line1: string;
  address_line2: string | null;
  state: string;
  pincode: string;
}

/**
 * Prasad shipping-address validation. Extracted from
 * /api/profile/address (same thresholds, same copy):
 * address ≥5 chars, state required, pincode exactly 6 digits.
 */
export function validateProfileAddress(
  body: Record<string, unknown>,
): ValidationResult<ProfileAddressFields> {
  const line1 = typeof body.address_line1 === "string" ? body.address_line1.trim() : "";
  const line2 = typeof body.address_line2 === "string" ? body.address_line2.trim() : "";
  const state = typeof body.state === "string" ? body.state.trim() : "";
  const pincode = typeof body.pincode === "string" ? body.pincode.replace(/\D/g, "") : "";

  if (line1.length < 5) return { ok: false, error: "Address kam se kam 5 akshar ka ho" };
  if (!state) return { ok: false, error: "State zaroori hai" };
  if (!/^\d{6}$/.test(pincode)) return { ok: false, error: "Pincode 6 anko ka hona chahiye" };

  return {
    ok: true,
    value: {
      address_line1: line1.slice(0, 240),
      address_line2: line2.slice(0, 240) || null,
      state: state.slice(0, 80),
      pincode,
    },
  };
}

/** Languages the telecaller may record for preferred_language. */
export const ALLOWED_LANGUAGES = ["hi", "en", "mr", "gu", "pa", "bn", "ta", "te", "kn", "ml"];

export interface TelecallerProfileEditFields {
  full_name?: string;
  city?: string;
  state?: string;
  address_line1?: string;
  address_line2?: string | null;
  pincode?: string;
  preferred_language?: string | null;
}

/**
 * The on-behalf profile edit allowlist (§5.3). NOTE: `phone` is
 * NOT in it and never will be — phone IS the identity key
 * (profiles.phone UNIQUE mirrors auth.users); changing it is an
 * account takeover. A wrong number becomes a wrong_number call
 * outcome and an owner escalation, never an inline edit. This
 * validator rejects any attempt to smuggle one in.
 *
 * [Bug 4.4] The state+pincode completeness rule used to check only
 * the request body, so fixing a one-field typo ("address_line1")
 * was falsely rejected even when the DB already held a valid
 * state/pincode for that customer. Pass the persisted row as
 * `persisted` to have the rule satisfied by saved values too.
 */
export function validateTelecallerProfileEdit(
  body: Record<string, unknown>,
  opts?: {
    persisted?: {
      state?: string | null;
      pincode?: string | null;
    } | null;
  },
): ValidationResult<TelecallerProfileEditFields> {
  if ("phone" in body) {
    return { ok: false, error: "Phone yahan badla nahi ja sakta — owner ko bataayein" };
  }

  const out: TelecallerProfileEditFields = {};
  let touched = false;

  if ("full_name" in body) {
    const v = typeof body.full_name === "string" ? body.full_name.trim() : "";
    if (v.length < 2 || v.length > 120) {
      return { ok: false, error: "Naam 2 se 120 akshar ke beech hona chahiye" };
    }
    out.full_name = v;
    touched = true;
  }
  if ("city" in body) {
    const v = typeof body.city === "string" ? body.city.trim().slice(0, 80) : "";
    out.city = v || undefined;
    touched = true;
  }
  if ("state" in body) {
    const v = typeof body.state === "string" ? body.state.trim().slice(0, 80) : "";
    out.state = v || undefined;
    touched = true;
  }
  if ("address_line1" in body) {
    const v = typeof body.address_line1 === "string" ? body.address_line1.trim() : "";
    if (v.length < 5) return { ok: false, error: "Address kam se kam 5 akshar ka ho" };
    out.address_line1 = v.slice(0, 240);
    touched = true;
  }
  if ("address_line2" in body) {
    const v = typeof body.address_line2 === "string" ? body.address_line2.trim() : "";
    out.address_line2 = v ? v.slice(0, 240) : null;
    touched = true;
  }
  if ("pincode" in body) {
    const v = typeof body.pincode === "string" ? body.pincode.replace(/\D/g, "") : "";
    if (!/^\d{6}$/.test(v)) return { ok: false, error: "Pincode 6 anko ka hona chahiye" };
    out.pincode = v;
    touched = true;
  }
  if ("preferred_language" in body) {
    const v = body.preferred_language;
    if (v === null || v === "") {
      out.preferred_language = null;
    } else if (typeof v === "string") {
      if (!ALLOWED_LANGUAGES.includes(v)) {
        return { ok: false, error: "Language list mein se chunein" };
      }
      out.preferred_language = v;
    } else {
      return { ok: false, error: "Language list mein se chunein" };
    }
    touched = true;
  }

  if (!touched) return { ok: false, error: "Kuch badalne ki zaroorat nahi thi" };

  // A street address without its state/pincode can never ship —
  // mirror the /api/profile/address rule at the subset level too.
  // Satisfied by THIS request OR the already-persisted DB values
  // [Bug 4.4].
  const effectiveState = out.state ?? opts?.persisted?.state ?? null;
  const effectivePincode = out.pincode ?? opts?.persisted?.pincode ?? null;
  if (out.address_line1 && (!effectiveState || !/^\d{6}$/.test(effectivePincode ?? ""))) {
    return { ok: false, error: "Address ke saath state aur pincode zaroori hain" };
  }
  return { ok: true, value: out };
}
