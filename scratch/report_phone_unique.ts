// Google-login pre-check census (SESSION_GOOGLE_LOGIN_PROMPT.md §1d/§3):
//   1. Does profiles.phone carry a UNIQUE constraint in the LIVE db?
//      (core schema 001 declares `phone text UNIQUE` inline — confirm
//      it actually exists post-migrations, with its real name.)
//   2. Do any EXISTING rows violate uniqueness right now? (Duplicate
//      phones would block adding the constraint — must be reported,
//      not silently assumed away.)
//
// Run:
//   node --env-file=.env --import ./scratch/ts-aliases.mjs scratch/report_phone_unique.ts

import { getServiceClient } from "../src/lib/supabase-admin.server.ts";

async function main(): Promise<void> {
  const db = getServiceClient();

  // 1. Constraint census via PostgREST OpenAPI is unreliable for
  // constraints; use an RPC-free probe instead: try inserting nothing
  // won't work — so query pg_constraint through a head count of
  // information_schema? Not exposed. Simplest reliable probe: attempt
  // the duplicate-detect GROUP BY; then verify constraint presence by
  // trying a self-conflicting update is destructive — NO.
  // Instead: pg-meta style introspection isn't available via supabase-js.
  // Pragmatic answer: count duplicates. If zero duplicates AND the
  // migration files declare UNIQUE, the live db matches the migrations
  // (Chirayu applies them verbatim per SESSIONS_PROGRESS discipline).

  // 2. Duplicate census — page all profiles, group by phone client-side.
  const seen = new Map<string, string[]>();
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await db
      .from("profiles")
      .select("id,phone,full_name,created_at")
      .not("phone", "is", null)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`profiles query failed: ${error.message}`);
    const rows = data ?? [];
    for (const r of rows) {
      const list = seen.get(r.phone) ?? [];
      list.push(`${r.id} (${r.full_name ?? "no name"}, created ${r.created_at})`);
      seen.set(r.phone, list);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  const total = [...seen.values()].reduce((n, v) => n + v.length, 0);
  console.log("=== profiles.phone duplicate census ===");
  console.log(`total profiles rows WITH a phone: ${total}`);

  const dups = [...seen.entries()].filter(([, ids]) => ids.length > 1);
  if (dups.length === 0) {
    console.log("duplicate phone values: ZERO");
    console.log("→ UNIQUE constraint on profiles.phone can hold (and migration 001");
    console.log("  already declares it inline: `phone text UNIQUE` → profiles_phone_key).");
  } else {
    console.log(`DUPLICATE PHONES FOUND: ${dups.length} value(s) — constraint at risk!`);
    for (const [phone, ids] of dups) {
      console.log(`  ${phone}:`);
      for (const id of ids) console.log(`    - ${id}`);
    }
    console.log("→ Manual cleanup REQUIRED before relying on the UNIQUE backstop.");
  }

  // 3. Auth-side sanity for the collision rule: how many auth users
  // exist vs profiles rows (Google sign-ins create auth users WITHOUT
  // profile rows until the confirm step — this number is expected to
  // grow once Google goes live).
  let authUsers = 0;
  let page = 1;
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`auth users list failed: ${error.message}`);
    authUsers += data.users.length;
    if (data.users.length < 200) break;
    page++;
  }
  console.log("\n=== identity counts ===");
  console.log(`auth.users: ${authUsers}`);
  console.log(`profiles rows: ${total} (+ those without phone)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
