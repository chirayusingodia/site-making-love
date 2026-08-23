// Google sign-in confirm-step verification (SESSION_GOOGLE_LOGIN_PROMPT
// §7 checklist items 2–3, API level):
//
//   1. no token            → 401
//   2. bad phone           → 400
//   3. first-ever confirm  → { ok:true }, profiles row created with the
//                            given phone (+ verified email), NO otp_send_log row
//   4. repeat (idempotent) → { ok:true, alreadyLinked:true }
//   5. OTHER user, same #  → 409 code=phone_taken (no second profile)
//   6. race backstop       → direct conflicting insert hits the LIVE
//                            UNIQUE constraint (23505) underneath the app check
//
// Run (needs the built site served locally):
//   npx.cmd vite preview          # separate terminal, note the port
//   node --env-file=.env --import ./scratch/ts-aliases.mjs scratch/verify_google_profile.ts [baseUrl]
//
// Cleans up after itself: deletes BOTH disposable auth users (profiles
// rows cascade away). Test emails are @example.com, phones are the
// fake +91-90000-000xx series.

import process from "node:process";
import { getServiceClient } from "../src/lib/supabase-admin.server.ts";

const BASE = process.argv[2] ?? "http://localhost:3000";
const STAMP = Date.now().toString(36);
const EMAIL_A = `punyata-verify-a-${STAMP}@example.com`;
const EMAIL_B = `punyata-verify-b-${STAMP}@example.com`;
const PHONE_A = "+919000000101"; // fake series, never delivered to, deleted below

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
}

async function main(): Promise<void> {
  const db = getServiceClient();
  const created: string[] = [];

  // ── Setup: two disposable auth users shaped like Google identities
  // (no phone credential, verified email, full_name metadata).
  async function makeUser(email: string): Promise<{ id: string; token: string }> {
    const password = `pv-${STAMP}-${Math.random().toString(36).slice(2)}-!Aa`;
    const { data, error } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
      user_metadata: { full_name: "Verify Kumar", name: "Verify Kumar" },
    });
    if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
    created.push(data.user.id);

    const url = process.env.VITE_SUPABASE_URL ?? "https://omjivlmfsikeqwndtlcn.supabase.co";
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "",
      },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`password sign-in failed: ${res.status}`);
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) throw new Error("no access_token from sign-in");
    return { id: data.user.id, token: body.access_token };
  }

  const userA = await makeUser(EMAIL_A);
  const userB = await makeUser(EMAIL_B);

  const post = (token: string | null, body: Record<string, unknown>): Promise<Response> =>
    fetch(`${BASE}/api/auth/complete-google-profile`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  const getProfile = async (userId: string): Promise<ProfileRow | null> => {
    const { data } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
    return (data as ProfileRow | null) ?? null;
  };

  try {
    console.log("=== /api/auth/complete-google-profile ===");

    // 1. No token → 401
    const r1 = await post(null, { phone: PHONE_A });
    check("no token → 401", r1.status === 401, `got ${r1.status}`);

    // 2. Invalid phone → 400
    const r2 = await post(userA.token, { phone: "12345" });
    check("invalid phone → 400", r2.status === 400, `got ${r2.status}`);

    // 3. First-ever confirm → ok; row has phone + verified email; NO OTP side effects
    const r3 = await post(userA.token, { phone: "9000000101", full_name: "Google Wala" });
    const b3 = (await r3.json()) as { ok?: boolean };
    const profA = await getProfile(userA.id);
    check("first confirm → 200 ok", r3.ok && b3.ok === true, `status ${r3.status}`);
    check(
      "profiles row: phone stored E.164",
      profA?.phone === PHONE_A,
      `got ${profA?.phone ?? "null"}`,
    );
    check(
      "profiles row: verified email copied from token identity",
      profA?.email === EMAIL_A,
      `got ${profA?.email ?? "null"}`,
    );
    check(
      "profiles row: editable name applied",
      profA?.full_name === "Google Wala",
      `got ${profA?.full_name ?? "null"}`,
    );
    const { count: otpRows } = await db
      .from("otp_send_log")
      .select("id", { count: "exact", head: true })
      .eq("phone", PHONE_A);
    check(
      "NO OTP sent/logged for this number",
      (otpRows ?? 0) === 0,
      `otp_send_log rows ${otpRows}`,
    );
    check("auth user B untouched so far", (await getProfile(userB.id)) === null);

    // 4. Idempotent repeat
    const r4 = await post(userA.token, { phone: PHONE_A });
    const b4 = (await r4.json()) as { ok?: boolean; alreadyLinked?: boolean };
    check("repeat by same user → alreadyLinked", r4.ok && b4.alreadyLinked === true);

    // 5. Collision: other user claims the same number → 409 phone_taken
    const r5 = await post(userB.token, { phone: "+91 90000 00101" }); // messy format on purpose
    const b5 = (await r5.json()) as { error?: string; code?: string };
    check("collision → 409", r5.status === 409, `got ${r5.status}`);
    check("collision → code=phone_taken", b5.code === "phone_taken");
    check("collision → Hinglish 'registered' message", /registered hai/.test(b5.error ?? ""));
    check("collision created NO second profile row", (await getProfile(userB.id)) === null);

    // 6. DB-level backstop: raw conflicting insert must hit UNIQUE (23505)
    const { error: rawErr } = await db.from("profiles").insert({
      id: userB.id,
      phone: PHONE_A,
    });
    check(
      "UNIQUE(profiles.phone) fires on raw insert (23505)",
      rawErr?.code === "23505",
      `got ${(rawErr as { code?: string } | null)?.code ?? "no error"}`,
    );
    check("backstop left no partial row", (await getProfile(userB.id)) === null);
  } finally {
    // ── Cleanup: auth users go; profiles cascade with them.
    for (const id of [...created].reverse()) {
      await db.auth.admin.deleteUser(id);
    }
    const leftover = await Promise.all(created.map((id) => getProfile(id)));
    check(
      "cleanup: all test auth users + profile rows removed",
      leftover.every((p) => p === null),
    );
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
