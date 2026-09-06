// ─────────────────────────────────────────────────────────────
// PUNYATA — WhatsApp identity resolution (§8 of
// SESSION_WHATSAPP_FUNNEL_PROMPT.md)
//
// THE RULE: Meta/Gupshup hands us a VERIFIED phone number (`wa_id`)
// on every inbound message/Flow submission. That number is the key:
//
//   normalizePhoneE164(wa_id) → look up profiles.phone (UNIQUE, 001)
//     found     → RETURNING customer, adopt that profile
//     not found → NEW customer, create auth.users + profiles
//
// ⚠️ THIS PROJECT HAS BEEN BURNED TWICE BY PHONE-STRING IDENTITY BUGS
// (2026-08-23: profiles.phone NULL created a duplicate; 2026-08-30: a
// bare 10-digit stored value didn't match a later +91-normalised OTP
// login, producing a second row for the same person — two live owner
// rows resulted). A WhatsApp funnel that writes phone numbers at
// customer scale is the same hazard. So, non-negotiably:
//   - ONE phone parser: normalizePhoneE164 (src/lib/phone.ts). Never a
//     second parser for the wa_id shape.
//   - Every lookup and every write goes through the NORMALISED value.
//     Never the raw wa_id (arrives without '+'), never NULL.
//   - The auth user is created WITH its phone set (phone_confirm:
//     true — WhatsApp/Meta already verified this number; contrast
//     the OTP flow's phone_confirm:false, where our own OTP is the
//     verification).
//   - Before creating anything, look up by the normalised value. If
//     a row exists, adopt it — never insert alongside it.
//
// Does NOT mint sessions/tokens/magic links (§8.4) — this module only
// resolves WHO is messaging and creates the account row if needed.
// The customer still logs in on the website with phone-OTP or Google,
// once. Forwarding a WhatsApp message is normal in this customer base,
// so a one-tap login link would be an account-takeover vector.
// ─────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneE164 } from "@/lib/phone";

export interface FamilyMemberSnapshot {
  slot_number: number;
  full_name: string;
  gotra: string | null;
  relation: string | null;
  dob: string | null;
  is_primary: boolean;
}

export type WhatsAppIdentity =
  | {
      kind: "returning";
      profileId: string;
      phone: string;
      priorFamilyMembers: FamilyMemberSnapshot[];
    }
  | { kind: "new"; phone: string };

/**
 * Pure: turns a raw wa_id (Meta/Gupshup deliver it WITHOUT a leading
 * '+', e.g. "918005828548") into our canonical E.164 form. Delegates
 * entirely to the one existing phone parser — do not special-case
 * wa_id's shape here, it is already one of normalizePhoneE164's
 * accepted input shapes (12-digit, leading "91").
 */
export function normalizeWaId(waIdRaw: string): string | null {
  return normalizePhoneE164(waIdRaw);
}

/**
 * §8.1/§8.2 — resolve new vs returning, and for returning customers,
 * the family_members of their most recent subscription (so the Flow
 * dispatch layer can render punyata_returning_confirm without ever
 * asking the customer to retype).
 */
export async function resolveWhatsAppIdentity(
  db: SupabaseClient,
  waIdRaw: string,
): Promise<WhatsAppIdentity> {
  const phone = normalizeWaId(waIdRaw);
  if (!phone) {
    throw new Error(`wa_id did not normalise to a valid Indian mobile number: ${waIdRaw}`);
  }

  const { data: profile, error: profileErr } = await db
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (profileErr) throw new Error(`profiles lookup failed: ${profileErr.message}`);

  if (!profile) {
    return { kind: "new", phone };
  }

  const { data: priorSub, error: subErr } = await db
    .from("subscriptions")
    .select("id")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subErr) throw new Error(`subscriptions lookup failed: ${subErr.message}`);

  let priorFamilyMembers: FamilyMemberSnapshot[] = [];
  if (priorSub) {
    const { data: members, error: fmErr } = await db
      .from("family_members")
      .select("slot_number,full_name,gotra,relation,dob,is_primary")
      .eq("subscription_id", priorSub.id)
      .order("slot_number");
    if (fmErr) throw new Error(`family_members lookup failed: ${fmErr.message}`);
    priorFamilyMembers = (members ?? []) as FamilyMemberSnapshot[];
  }

  return { kind: "returning", profileId: profile.id, phone, priorFamilyMembers };
}

/**
 * §8.4 — create the auth.users + profiles row for a brand-new
 * WhatsApp customer. Re-checks by NORMALISED phone immediately before
 * creating (belt-and-suspenders against a race with another inbound
 * event for the same number) and ADOPTS instead of inserting a
 * second row if one turns up.
 *
 * `phone_confirm: true` is deliberate and differs from the OTP flow:
 * WhatsApp/Meta has already verified this number belongs to whoever
 * is messaging us, so there is no second verification to perform.
 */
export async function createOrAdoptWhatsAppProfile(
  db: SupabaseClient,
  phone: string,
  fullName: string,
): Promise<string> {
  const { data: existing, error: lookupErr } = await db
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (lookupErr) throw new Error(`profiles lookup failed: ${lookupErr.message}`);
  if (existing) return existing.id;

  const { data: created, error: createErr } = await db.auth.admin.createUser({
    phone,
    phone_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : {},
  });

  if (createErr || !created?.user) {
    const msg = createErr?.message ?? "";
    if (!/already|registered|exists/i.test(msg)) {
      throw new Error(`auth user create failed: ${msg}`);
    }
    // auth.users already has this phone but profiles doesn't (partial
    // legacy state) — re-look-up by phone is impossible from here
    // without the uuid, so surface loudly rather than guess. This
    // mirrors requestOtpForPhone's own recovery branch in
    // auth.server.ts, which resolves it once the person logs in.
    throw new Error(
      `auth user for ${phone} exists without a profiles row — needs manual reconciliation`,
    );
  }

  const userId = created.user.id;
  const { error: profErr } = await db.from("profiles").insert({
    id: userId,
    phone,
    full_name: fullName || null,
  });
  if (profErr) throw new Error(`profiles insert failed: ${profErr.message}`);

  return userId;
}

/** §8.2 "Haan, yahi rakhein" — copy a prior subscription's
 *  family_members onto a new subscription verbatim. */
export async function copyFamilyMembers(
  db: SupabaseClient,
  members: FamilyMemberSnapshot[],
  toSubscriptionId: string,
): Promise<void> {
  if (members.length === 0) return;
  const rows = members.map((m) => ({
    subscription_id: toSubscriptionId,
    slot_number: m.slot_number,
    full_name: m.full_name,
    gotra: m.gotra,
    relation: m.relation,
    is_primary: m.is_primary,
    ...(m.dob ? { dob: m.dob } : {}),
  }));
  const { error } = await db
    .from("family_members")
    .upsert(rows, { onConflict: "subscription_id,slot_number" });
  if (error) throw new Error(`family_members copy failed: ${error.message}`);
}
