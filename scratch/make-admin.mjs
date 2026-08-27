// Staff promotion tool — sets profiles.role = 'admin' (or 'owner') for
// one email. Deliberate, audited, one-account action (same convention
// as migrations 006/012 manual steps). The service-role request carries
// no user JWT, so the trg_profiles_role_write_guard (migration 018)
// lets it through — exactly how legitimate promotions happen.
//
// The person MUST have signed up first so their auth.users + profiles
// rows exist (login once via /login OTP is enough).
//
// Run:
//   node scratch/make-admin.mjs someone@email.com           # promote to admin
//   node scratch/make-admin.mjs someone@email.com --role owner   # promote to owner
//   node scratch/make-admin.mjs someone@email.com --check   # just look, don't change

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const emailArg = args.find((a) => !a.startsWith("--"));
const roleFlagIdx = args.indexOf("--role");
const targetRole = roleFlagIdx !== -1 ? args[roleFlagIdx + 1] : "admin";
const checkOnly = args.includes("--check");

if (!emailArg) {
  console.error("Usage: node scratch/make-admin.mjs <email> [--role admin|owner] [--check]");
  process.exit(1);
}
if (!["admin", "owner"].includes(targetRole)) {
  console.error(`--role must be 'admin' or 'owner' (got '${targetRole}')`);
  process.exit(1);
}

function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // fall through — vars may already be set in the shell
  }
}
loadEnv();

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env)");
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const email = emailArg.trim().toLowerCase();
let exitCode = 0;

const { data: matches, error } = await db
  .from("profiles")
  .select("id, full_name, phone, email, role")
  .ilike("email", email);

if (error) {
  console.error(`Lookup failed: ${error.message}`);
  exitCode = 1;
} else if (!matches || matches.length === 0) {
  console.error(
    `No profile found for ${email}.\n` +
      `This person has NOT signed up yet — ask them to log in once on /login\n` +
      `(email OTP creates the account + profile row), then re-run this script.`,
  );
  exitCode = 2;
} else if (matches.length > 1) {
  console.error(
    `${matches.length} profiles match ${email} — refusing to guess. ` +
      `Promote by id in the Supabase SQL editor instead:\n` +
      matches.map((m) => `  ${m.id}  (${m.role})`).join("\n"),
  );
  exitCode = 1;
} else {
  const profile = matches[0];

  console.log("── Profile ─────────────────────────────────────");
  console.log(`  id        : ${profile.id}`);
  console.log(`  name      : ${profile.full_name ?? "(none)"}`);
  console.log(`  phone     : ${profile.phone ?? "(none)"}`);
  console.log(`  email     : ${profile.email}`);
  console.log(`  role now  : ${profile.role}`);

  if (profile.role === targetRole) {
    console.log(`Already '${targetRole}' — nothing to do.`);
  } else if (checkOnly) {
    console.log(
      `--check: would change role '${profile.role}' → '${targetRole}'. No write performed.`,
    );
  } else {
    const { error: updErr } = await db
      .from("profiles")
      .update({ role: targetRole, updated_at: new Date().toISOString() })
      .eq("id", profile.id);

    if (updErr) {
      console.error(`Update FAILED: ${updErr.message}`);
      exitCode = 1;
    } else {
      console.log(`  role now  : ${targetRole}  ✓`);
      console.log("\nVerify:");
      console.log(
        `  SELECT id, full_name, phone, email, role FROM public.profiles WHERE role IN ('admin','owner');`,
      );
      console.log(`They can now open /admin after logging in.`);
    }
  }
}

process.exitCode = exitCode;
