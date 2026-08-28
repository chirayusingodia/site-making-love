// Pure-logic verification for the OTP abuse-protection gate.
// Run:
//   node --import ./scratch/ts-aliases.mjs scratch/verify_otp_abuse.ts
//
// ─────────────────────────────────────────────────────────────
// WHY THIS FILE WAS REWRITTEN (2026-08-28)
//
// It reported 11 failures against perfectly correct production code.
// The harness — not auth.server.ts — was stale.
//
// [Bug 1.7] moved the limiter from a client-side count-then-insert to
// ONE atomic Postgres call, public.otp_check_and_log (migration 018
// §16), which does the counting AND the ledger insert under
// transaction advisory locks so racing requests can't both slip under
// the cap. The old mock still modelled the pre-refactor design:
//
//   • db.rpc() returned a NUMBER (the old distinct-phone count). The
//     new code reads a VERDICT STRING, so `typeof data === "string"`
//     failed and every request normalised to "allowed" — no limit
//     could ever trip. (9 failures.)
//   • The mock asserted on client-side .insert() into otp_send_log.
//     That insert now happens INSIDE the SQL function, so nothing was
//     ever recorded. (1 failure.)
//   • The broken-ledger case injected its error on from("otp_send_log")
//     only, but errors now arrive from db.rpc(). Nothing threw.
//     (1 failure.)
//
// Worse, "migration-not-applied degrades OPEN" was PASSING for the
// wrong reason: the mock's rpc returned no error at all, so
// isLedgerNotDeployed() was never even reached. A false green.
//
// WHAT MOVED OUT OF SCOPE. The numeric thresholds now live in SQL and
// cannot be exercised from TypeScript. So this file asserts the TS
// side's real contract — verdict → exception mapping, fail-open vs
// fail-closed, ordering, argument threading — plus a DRIFT GUARD that
// parses the migration and proves the TS constants still mirror the
// SQL, which is exactly what otp_check_and_log's own comment warns to
// keep in sync ("tune BOTH together").
// ─────────────────────────────────────────────────────────────

import process from "node:process";
import { readFileSync } from "node:fs";
import { requestOtpForPhone, OtpRateLimitError, OTP_RATE_LIMITS } from "../src/lib/auth.server.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
  if (!cond) failures++;
}

const PHONE_DIGITS = "9876543210";
const PHONE_E164 = "+919876543210";
const IP = "203.0.113.7";

type Verdict = "allowed" | "phone_burst_10m" | "phone_daily" | "ip_distinct_phones";

interface MockOpts {
  /** ALLOWED sends for this phone in the last 10 minutes. */
  burstCount?: number;
  /** ALLOWED sends for this phone in the last 24 hours. */
  dailyCount?: number;
  /** Distinct phones this IP has sent to in the last hour. */
  distinctPhones?: number;
  ledger?: "ok" | "missing" | "broken";
  /** Whether a profiles row already exists for the number. */
  profileExists?: boolean;
}

interface LedgerRow {
  phone: string;
  ip: string | null;
  allowed: boolean;
  reason: string | null;
}

interface MockState {
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  /** Rows otp_check_and_log would have inserted (server-side). */
  ledger: LedgerRow[];
  otpCalls: Array<Record<string, unknown>>;
  profileReads: number;
  profileInserts: Array<Record<string, unknown>>;
  createdUsers: number;
}

/**
 * Mirrors public.otp_check_and_log's precedence EXACTLY (migration 018
 * §16): burst first, then daily, then — only if the phone limits
 * passed and an IP was supplied — the per-IP distinct-phone limit.
 * Thresholds are read from OTP_RATE_LIMITS, which the drift guard
 * below proves still matches the SQL.
 */
function computeVerdict(opts: MockOpts, ip: string | null): Verdict {
  const burst = opts.burstCount ?? 0;
  const daily = opts.dailyCount ?? 0;
  const distinct = opts.distinctPhones ?? 0;

  if (burst >= OTP_RATE_LIMITS.PHONE_MAX_PER_10_MIN) return "phone_burst_10m";
  if (daily >= OTP_RATE_LIMITS.PHONE_MAX_PER_24_H) return "phone_daily";
  if (ip !== null && distinct >= OTP_RATE_LIMITS.IP_MAX_DISTINCT_PHONES_PER_HOUR) {
    return "ip_distinct_phones";
  }
  return "allowed";
}

function makeDb(opts: MockOpts = {}): { db: SupabaseClient; state: MockState } {
  const state: MockState = {
    rpcCalls: [],
    ledger: [],
    otpCalls: [],
    profileReads: 0,
    profileInserts: [],
    createdUsers: 0,
  };

  const ledgerError = () => {
    if (opts.ledger === "missing") {
      return { code: "42P01", message: "relation public.otp_send_log does not exist" };
    }
    if (opts.ledger === "broken") return { code: "XX000", message: "backend boom" };
    return null;
  };

  const profilesChain = () => {
    const c = {
      select: () => c,
      eq: () => c,
      maybeSingle: () => {
        state.profileReads++;
        return Promise.resolve({
          data: opts.profileExists ? { id: "existing-profile" } : null,
          error: null,
        });
      },
      insert: (row: Record<string, unknown>) => {
        state.profileInserts.push(row);
        return Promise.resolve({ data: null, error: null });
      },
    };
    return c;
  };

  const db = {
    from: (table: string) => {
      if (table === "profiles") return profilesChain();
      // The gate must reach the ledger ONLY through the RPC. If
      // production ever regresses to client-side counting, this throws
      // instead of silently passing — the exact drift that rotted the
      // previous version of this harness.
      throw new Error(
        `unexpected direct table access: ${table} (the OTP gate must go through otp_check_and_log)`,
      );
    },

    rpc: (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      if (fn !== "otp_check_and_log") {
        throw new Error(`unexpected rpc ${fn}`);
      }
      const err = ledgerError();
      if (err) return Promise.resolve({ data: null, error: err });

      const ip = (args.p_ip as string | null) ?? null;
      const verdict = computeVerdict(opts, ip);
      // The SQL logs EVERY attempt, allowed or blocked, before
      // returning its verdict — model that here so the "attempt is
      // recorded" assertions stay meaningful post-refactor.
      state.ledger.push({
        phone: args.p_phone as string,
        ip,
        allowed: verdict === "allowed",
        reason: verdict === "allowed" ? null : verdict,
      });
      return Promise.resolve({ data: verdict, error: null });
    },

    auth: {
      signInWithOtp: async (args: Record<string, unknown>) => {
        state.otpCalls.push(args);
        return { error: null };
      },
      admin: {
        createUser: async () => {
          state.createdUsers++;
          return {
            data: { user: { id: "11111111-1111-1111-1111-111111111111" } },
            error: null,
          };
        },
      },
    },
  } as unknown as SupabaseClient;

  return { db, state };
}

async function expectLimited(
  name: string,
  opts: MockOpts,
  reason: Verdict,
  clientIp: string | null = null,
): Promise<void> {
  const { db, state } = makeDb(opts);
  let threw: unknown = null;
  try {
    await requestOtpForPhone(db, "Test Bhakt", PHONE_DIGITS, { clientIp });
  } catch (err) {
    threw = err;
  }

  const limited = threw instanceof OtpRateLimitError;
  check(`${name}: throws OtpRateLimitError`, limited, limited ? "" : String(threw));
  if (limited) {
    check(`${name}: reason=${reason}`, (threw as OtpRateLimitError).reason === reason);
  }
  check(
    `${name}: blocked attempt recorded in the ledger`,
    state.ledger.length === 1 &&
      state.ledger[0].allowed === false &&
      state.ledger[0].reason === reason &&
      state.ledger[0].phone === PHONE_E164,
  );
  check(`${name}: no SMS attempted`, state.otpCalls.length === 0);
  // The gate is the FIRST thing that runs — a blocked script must cost
  // us nothing beyond one RPC: no profile read, no auth user, no SMS.
  check(
    `${name}: no auth/profile work done before the block`,
    state.profileReads === 0 && state.profileInserts.length === 0 && state.createdUsers === 0,
  );
}

async function main(): Promise<void> {
  // ── 0. Drift guard: TS constants vs the SQL that enforces them ──
  // otp_check_and_log hardcodes its thresholds, and its own COMMENT
  // says to tune both together. Nothing but this check would notice
  // if one side moved.
  {
    const sql = readFileSync(
      new URL("../supabase/migrations/20260824_018_bugfix_hardening.sql", import.meta.url),
      "utf8",
    );
    const fn = sql.slice(sql.indexOf("FUNCTION public.otp_check_and_log"));
    const grab = (re: RegExp): number | null => {
      const m = fn.match(re);
      return m ? Number(m[1]) : null;
    };
    const sqlBurst = grab(/v_burst\s*>=\s*(\d+)/);
    const sqlDaily = grab(/v_daily\s*>=\s*(\d+)/);
    const sqlDistinct = grab(/v_distinct\s*>=\s*(\d+)/);

    check(
      "SQL thresholds parsed from migration 018",
      sqlBurst !== null && sqlDaily !== null && sqlDistinct !== null,
      `burst=${sqlBurst} daily=${sqlDaily} distinct=${sqlDistinct}`,
    );
    check(
      "TS OTP_RATE_LIMITS mirror the SQL thresholds (tune BOTH together)",
      sqlBurst === OTP_RATE_LIMITS.PHONE_MAX_PER_10_MIN &&
        sqlDaily === OTP_RATE_LIMITS.PHONE_MAX_PER_24_H &&
        sqlDistinct === OTP_RATE_LIMITS.IP_MAX_DISTINCT_PHONES_PER_HOUR,
      `TS ${OTP_RATE_LIMITS.PHONE_MAX_PER_10_MIN}/${OTP_RATE_LIMITS.PHONE_MAX_PER_24_H}/${OTP_RATE_LIMITS.IP_MAX_DISTINCT_PHONES_PER_HOUR} vs SQL ${sqlBurst}/${sqlDaily}/${sqlDistinct}`,
    );
  }

  // ── 1. Each verdict maps to the right exception ────────────────
  await expectLimited(
    "burst (3 in 10 min)",
    { burstCount: OTP_RATE_LIMITS.PHONE_MAX_PER_10_MIN },
    "phone_burst_10m",
  );
  await expectLimited(
    "daily (8 in 24 h)",
    { dailyCount: OTP_RATE_LIMITS.PHONE_MAX_PER_24_H },
    "phone_daily",
  );
  await expectLimited(
    "ip distinct (5 phones/hour)",
    { distinctPhones: OTP_RATE_LIMITS.IP_MAX_DISTINCT_PHONES_PER_HOUR },
    "ip_distinct_phones",
    IP,
  );

  // ── 2. Precedence matches the SQL's branch order ───────────────
  await expectLimited(
    "burst outranks daily when both are over",
    { burstCount: 99, dailyCount: 99 },
    "phone_burst_10m",
  );
  await expectLimited(
    "phone limits outrank the IP limit",
    { burstCount: 99, distinctPhones: 99 },
    "phone_burst_10m",
    IP,
  );

  // ── 3. Allowed path: logged, sent, arguments threaded ──────────
  {
    const { db, state } = makeDb({ profileExists: true });
    const res = await requestOtpForPhone(db, "Test Bhakt", PHONE_DIGITS, {
      clientIp: IP,
      captchaToken: "tsr-token-abc",
    });
    check("allowed request proceeds", res.isNewUser === false);
    check(
      "allowed attempt recorded (allowed=true, reason null)",
      state.ledger.length === 1 &&
        state.ledger[0].allowed === true &&
        state.ledger[0].reason === null &&
        state.ledger[0].ip === IP,
    );
    check(
      "phone is normalised to E.164 before the RPC",
      state.rpcCalls.length === 1 && state.rpcCalls[0].args.p_phone === PHONE_E164,
      String(state.rpcCalls[0]?.args.p_phone),
    );
    check("client IP is threaded into the RPC", state.rpcCalls[0].args.p_ip === IP);
    check(
      "captcha token forwarded into signInWithOtp",
      (state.otpCalls[0] as { options?: { captchaToken?: string } }).options?.captchaToken ===
        "tsr-token-abc",
    );
    check("exactly one SMS sent", state.otpCalls.length === 1);
  }

  // ── 4. New number → user + profile created, isNewUser true ─────
  {
    const { db, state } = makeDb({ profileExists: false });
    const res = await requestOtpForPhone(db, "Naya Bhakt", PHONE_DIGITS, { clientIp: IP });
    check("brand-new number reports isNewUser", res.isNewUser === true);
    check(
      "brand-new number creates auth user + profile row",
      state.createdUsers === 1 &&
        state.profileInserts.length === 1 &&
        state.profileInserts[0].phone === PHONE_E164 &&
        state.profileInserts[0].full_name === "Naya Bhakt",
    );
  }

  // ── 5. No IP header → IP check skipped, phone limits still on ──
  {
    const { db, state } = makeDb({ distinctPhones: 99, profileExists: true });
    const res = await requestOtpForPhone(db, "", PHONE_DIGITS);
    check(
      "unattributable IP skips ONLY the IP check",
      state.otpCalls.length === 1 && res.isNewUser === false,
    );
    check("null IP is passed to the RPC as null", state.rpcCalls[0].args.p_ip === null);
  }
  {
    // ...but a phone limit still bites with no IP attributed.
    await expectLimited(
      "no IP attributed: phone limit still enforced",
      { burstCount: 99, distinctPhones: 0 },
      "phone_burst_10m",
      null,
    );
  }

  // ── 6. Ledger MISSING → fail OPEN, loudly (deploy safety valve) ─
  {
    const { db, state } = makeDb({
      burstCount: 99,
      dailyCount: 99,
      distinctPhones: 99,
      ledger: "missing",
      profileExists: true,
    });
    const warnings: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    let res;
    try {
      res = await requestOtpForPhone(db, "Test", PHONE_DIGITS, { clientIp: IP });
    } finally {
      console.error = originalError;
    }
    check(
      "migration-not-applied degrades OPEN (send proceeds despite counts over every cap)",
      state.otpCalls.length === 1 && !!res,
    );
    check(
      "...and says so loudly, naming the migrations to apply",
      warnings.some((w) => /otp_check_and_log missing/.test(w) && /20260823_016/.test(w)),
      warnings[0] ?? "no console.error captured",
    );
  }

  // ── 7. Ledger BROKEN → fail CLOSED ────────────────────────────
  // The security-critical half: a limiter that is erroring must never
  // silently become an unlimited SMS tap.
  {
    const { db, state } = makeDb({ ledger: "broken", profileExists: true });
    let msg = "";
    let wasRateLimitError = false;
    try {
      await requestOtpForPhone(db, "Test", PHONE_DIGITS, { clientIp: IP });
    } catch (err) {
      msg = (err as Error).message;
      wasRateLimitError = err instanceof OtpRateLimitError;
    }
    check("broken ledger throws", /otp_send_log check failed/.test(msg), msg || "did not throw");
    check("broken ledger sends NO SMS (fails closed)", state.otpCalls.length === 0);
    check(
      "broken ledger is a hard error, not a 429 the client would retry past",
      !wasRateLimitError,
    );
    check(
      "broken ledger does no auth/profile work",
      state.profileReads === 0 && state.createdUsers === 0,
    );
  }

  // ── 8. Invalid phone is rejected before the gate ───────────────
  {
    const { db, state } = makeDb();
    let msg = "";
    try {
      await requestOtpForPhone(db, "Test", "12345");
    } catch (err) {
      msg = (err as Error).message;
    }
    check("invalid number rejected", /Invalid Indian mobile number/.test(msg), msg);
    check(
      "invalid number costs no RPC and no SMS",
      state.rpcCalls.length === 0 && state.otpCalls.length === 0,
    );
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
