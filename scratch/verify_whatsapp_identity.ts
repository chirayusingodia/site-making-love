// Verification harness — WhatsApp identity resolution (§12.1).
// Run: node --import ./scratch/ts-aliases.mjs scratch/verify_whatsapp_identity.ts
//
// Covers:
//  1. normalizeWaId across +91-prefixed / bare-10-digit / leading-zero
//     / bare-12-digit (wa_id shape) inputs.
//  2. THE CRITICAL CASE (§8.4): a wa_id of "918005828548" must resolve
//     to the SAME normalised phone that a website OTP login with
//     "8005828548" reaches — one row, not two. This project has
//     produced duplicate accounts from exactly this kind of mismatch
//     twice (2026-08-23, 2026-08-30).
//  3. resolveWhatsAppIdentity against a mock Supabase client: unknown
//     number → NEW; known number → RETURNING with prior family
//     members attached.

import { normalizeWaId, resolveWhatsAppIdentity } from "../src/lib/whatsapp-identity.server.ts";
import { normalizePhoneE164 } from "../src/lib/phone.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

console.log("— normalizeWaId shape coverage —");
check("+91-prefixed → +91XXXXXXXXXX", normalizeWaId("+918005828548") === "+918005828548");
check("bare 10-digit → +91XXXXXXXXXX", normalizeWaId("8005828548") === "+918005828548");
check("leading-zero 11-digit → +91XXXXXXXXXX", normalizeWaId("08005828548") === "+918005828548");
check(
  "bare wa_id shape (12-digit, no +) → +91XXXXXXXXXX",
  normalizeWaId("918005828548") === "+918005828548",
);
check("garbage input → null", normalizeWaId("not-a-phone") === null);

console.log("\n— §8.4 critical guard: wa_id vs OTP-login phone converge —");
const fromWa = normalizeWaId("918005828548");
const fromOtp = normalizePhoneE164("8005828548");
check("wa_id and OTP-login phone normalise identically", fromWa !== null && fromWa === fromOtp);

// ── Mock Supabase client for resolveWhatsAppIdentity ──
function mockDb(opts: {
  profileByPhone: Record<string, { id: string } | undefined>;
  latestSubForUser: Record<string, { id: string } | undefined>;
  familyMembersBySub: Record<string, unknown[]>;
}) {
  return {
    from(table: string) {
      const chain: any = {
        _table: table,
        _eq: {} as Record<string, unknown>,
        eq(col: string, val: unknown) {
          this._eq[col] = val;
          return this;
        },
        select() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        async maybeSingle() {
          if (table === "profiles") {
            return { data: opts.profileByPhone[this._eq.phone as string] ?? null, error: null };
          }
          if (table === "subscriptions") {
            return { data: opts.latestSubForUser[this._eq.user_id as string] ?? null, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve: (v: unknown) => void) {
          // family_members: awaited directly (no maybeSingle in resolveWhatsAppIdentity)
          if (table === "family_members") {
            resolve({
              data: opts.familyMembersBySub[this._eq.subscription_id as string] ?? [],
              error: null,
            });
          } else {
            resolve({ data: null, error: null });
          }
        },
      };
      return chain;
    },
  } as any;
}

console.log("\n— resolveWhatsAppIdentity —");
{
  const db = mockDb({ profileByPhone: {}, latestSubForUser: {}, familyMembersBySub: {} });
  const identity = await resolveWhatsAppIdentity(db, "919999999999");
  check("unknown number → NEW", identity.kind === "new");
}
{
  const db = mockDb({
    profileByPhone: { "+918005828548": { id: "profile-1" } },
    latestSubForUser: { "profile-1": { id: "sub-1" } },
    familyMembersBySub: {
      "sub-1": [
        {
          slot_number: 1,
          full_name: "Ramesh",
          gotra: "Kashyap",
          relation: null,
          dob: null,
          is_primary: true,
        },
      ],
    },
  });
  const identity = await resolveWhatsAppIdentity(db, "918005828548");
  check("known number → RETURNING", identity.kind === "returning");
  check(
    "returning identity carries prior family members",
    identity.kind === "returning" &&
      identity.priorFamilyMembers.length === 1 &&
      identity.priorFamilyMembers[0].full_name === "Ramesh",
  );
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
