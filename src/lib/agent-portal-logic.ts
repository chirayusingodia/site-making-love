// Pure logic for the agent portal + lead routing (migration 020).
// NO server imports, NO db — everything here is unit-tested in
// scratch/verify_agent_portal.ts.

// ─── Upload row sanitising ─────────────────────────────────────

export const AGENT_MAX_FAMILY_NAMES = 8;
export const AGENT_MAX_NAME_LEN = 80;
export const AGENT_MAX_CITY_LEN = 80;
export const AGENT_MAX_NOTES_LEN = 1000;
export const AGENT_MAX_BATCH = 200;

/** E.164 Indian mobile, same shape the admin upload stores. */
const PHONE_RE = /^(?:\+91|0)?([6-9]\d{9})$/;

export function normalizePhoneE164Agent(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[\s()-]/g, "");
  const m = PHONE_RE.exec(digits);
  return m ? `+91${m[1]}` : null;
}

/**
 * Family names as scribbled by the field agent: trim, drop empties,
 * dedupe case-insensitively, hard-cap count × length. Returns null
 * when the input itself is not an array.
 */
export function sanitizeFamilyNames(input: unknown): string[] | null {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const name = item.trim().slice(0, AGENT_MAX_NAME_LEN);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= AGENT_MAX_FAMILY_NAMES) break;
  }
  return out;
}

export interface AgentLeadRowInput {
  fullName?: unknown;
  phone?: unknown;
  city?: unknown;
  notes?: unknown;
  familyNames?: unknown;
}

export interface SanitizedLeadRow {
  full_name: string | null;
  phone: string;
  city: string | null;
  notes: string | null;
  family_names: string[];
}

export type SanitizeRowResult = { ok: true; row: SanitizedLeadRow } | { ok: false; reason: string };

/** Per-row validation with Hinglish reasons, mirroring the admin upload UX. */
export function sanitizeAgentLeadRow(raw: AgentLeadRowInput): SanitizeRowResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: "Row galat format mein hai" };
  }
  const fullName =
    typeof raw.fullName === "string" && raw.fullName.trim()
      ? raw.fullName.trim().slice(0, AGENT_MAX_NAME_LEN)
      : null;
  const phoneRaw = typeof raw.phone === "string" ? raw.phone : "";
  const phone = normalizePhoneE164Agent(phoneRaw);
  if (!phone) {
    return { ok: false, reason: `Phone "${phoneRaw}" sahi Indian number nahi hai` };
  }
  const city =
    typeof raw.city === "string" && raw.city.trim()
      ? raw.city.trim().slice(0, AGENT_MAX_CITY_LEN)
      : null;
  const notes =
    typeof raw.notes === "string" && raw.notes.trim()
      ? raw.notes.trim().slice(0, AGENT_MAX_NOTES_LEN)
      : null;
  const familyNames = sanitizeFamilyNames(raw.familyNames);
  if (familyNames === null) {
    return { ok: false, reason: "Family names list format mein hone chahiye" };
  }
  return {
    ok: true,
    row: { full_name: fullName, phone, city, notes, family_names: familyNames },
  };
}

// ─── Routing stamp (auto-assignment at upload time) ────────────

/**
 * IST today as YYYY-MM-DD — matches loadTodaysLeads' day filter so a
 * routed lead shows up in her Aaj Ke Leads queue immediately.
 */
export function istToday(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * The assignment stamp applied to freshly inserted leads when their
 * sourcing agent has an ACTIVE route. Null → stay in the 'new' pool.
 */
export function routingStamp(
  route: { telecallerId: string; isActive: boolean } | null,
): { assigned_to: string; assigned_on: string; status: "assigned" } | null {
  if (!route || !route.isActive || !route.telecallerId) return null;
  return { assigned_to: route.telecallerId, assigned_on: istToday(), status: "assigned" };
}
