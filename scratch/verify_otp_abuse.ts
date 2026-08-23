// Pure-logic verification for the OTP abuse-protection session.
// Run:
//   node --import ./scratch/ts-aliases.mjs scratch/verify_otp_abuse.ts
//
// Exercises requestOtpForPhone's rate-limit gate against a mock DB —
// no network, no real Supabase. Covers the three limits, attempt
// logging, fail-open-on-missing-migration vs fail-closed-on-broken,
// and captcha-token threading into signInWithOtp.

import { requestOtpForPhone, OtpRateLimitError, OTP_RATE_LIMITS } from "../src/lib/auth.server.ts";
import { totalCountForBillingPeriod } from "../src/lib/subscriptions-checkout.server.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

let failures = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}`);
  if (!cond) failures++;
}

interface MockOpts {
  burstCount: number;
  dailyCount: number;
  distinctPhones: number;
  ledger?: "ok" | "missing" | "broken";
}

interface MockState {
  inserted: Array<Record<string, unknown>>;
  otpCalls: Array<Record<string, unknown>>;
}

const PHONE = "+919876543210";

function makeDb(opts: MockOpts): { db: SupabaseClient; state: MockState } {
  const state: MockState = { inserted: [], otpCalls: [] };
  // Captures the gte() timestamp of the in-flight count query so the
  // mock can tell the 10-minute (burst) window from the 24-h one.
  let pendingWindowMs = 0;

  const ledgerErrFor = (table: string) => {
    // Ledger failures apply ONLY to otp_send_log — profiles must
    // behave normally even while the ledger is missing/broken.
    if (table !== "otp_send_log") return null;
    if (opts.ledger === "missing")
      return { code: "42P01", message: "relation public.otp_send_log does not exist" };
    if (opts.ledger === "broken") return { code: "XX000", message: "backend boom" };
    return null;
  };

  const chain = (table: string, computeResult: () => Record<string, unknown>) => {
    const c = {
      select: () => c,
      eq: () => c,
      gte: (_col: string, iso: string) => {
        pendingWindowMs = Date.now() - new Date(iso).getTime();
        return c;
      },
      not: () => c,
      order: () => c,
      maybeSingle: () => Promise.resolve({ data: null, error: null }), // phone always "brand new"
      single: () => Promise.resolve({ data: { id: "row-1" }, error: null }),
      insert: (rows: unknown) => {
        const arr = Array.isArray(rows) ? rows : [rows];
        if (table === "otp_send_log") state.inserted.push(...arr);
        const err = ledgerErrFor(table);
        return Promise.resolve({ data: null, error: err });
      },
      then: (res: (v: Record<string, unknown>) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(computeResult()).then(res, rej),
    };
    return c;
  };

  const db = {
    from: (table: string) => {
      if (table !== "otp_send_log" && table !== "profiles") {
        throw new Error(`unexpected table ${table}`);
      }
      if (table === "profiles") {
        return chain(table, () => ({ data: null, error: null }));
      }
      const err = ledgerErrFor(table);
      if (err) {
        // Count queries surface the ledger failure via {error}.
        return chain(table, () => ({ count: null, error: err }));
      }
      return chain(table, () => {
        // Window-aware: ≤~11 min ago → burst count; wider → daily.
        if (pendingWindowMs <= 11 * 60 * 1000) {
          return { count: opts.burstCount, error: null };
        }
        return { count: Math.max(opts.dailyCount, opts.burstCount), error: null };
      });
    },
    rpc: () => Promise.resolve({ data: opts.distinctPhones, error: null }),
    auth: {
      signInWithOtp: async (args: Record<string, unknown>) => {
        state.otpCalls.push(args);
        return { error: null };
      },
      admin: {
        createUser: async () => ({
          data: { user: { id: "11111111-1111-1111-1111-111111111111" } },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;

  return { db, state };
}

async function expectLimited(
  name: string,
  opts: MockOpts,
  reason: OtpRateLimitError["reason"],
  clientIp?: string,
): Promise<void> {
  const { db, state } = makeDb(opts);
  let threw: unknown = null;
  try {
    await requestOtpForPhone(db, "Test Bhakt", "9876543210", {
      clientIp: clientIp ?? null,
    });
  } catch (err) {
    threw = err;
  }
  const limited = threw instanceof OtpRateLimitError;
  check(`${name}: throws OtpRateLimitError`, limited);
  if (limited) {
    check(`${name}: reason=${reason}`, (threw as OtpRateLimitError).reason === reason);
  }
  check(
    `${name}: blocked attempt LOGGED`,
    state.inserted.length === 1 &&
      state.inserted[0].allowed === false &&
      state.inserted[0].reason === reason &&
      state.inserted[0].phone === PHONE,
  );
  check(`${name}: no SMS attempted`, state.otpCalls.length === 0);
}

async function main(): Promise<void> {
  // ── Constants sanity ──────────────────────────────────────────
  check(
    "limits are the session's tunables (3 / 8 / 5)",
    OTP_RATE_LIMITS.PHONE_MAX_PER_10_MIN === 3 &&
      OTP_RATE_LIMITS.PHONE_MAX_PER_24_H === 8 &&
      OTP_RATE_LIMITS.IP_MAX_DISTINCT_PHONES_PER_HOUR === 5,
  );
  check(
    "tenure derivation: monthly→1200, yearly→100",
    totalCountForBillingPeriod("monthly") === 1200 && totalCountForBillingPeriod("yearly") === 100,
  );

  // ── Layer 3: the three limits ────────────────────────────────
  await expectLimited(
    "burst (3 in 10 min)",
    { burstCount: 3, dailyCount: 0, distinctPhones: 0 },
    "phone_burst_10m",
  );
  await expectLimited(
    "daily (8 in 24 h)",
    { burstCount: 0, dailyCount: 8, distinctPhones: 0 },
    "phone_daily",
  );
  await expectLimited(
    "ip distinct (5 phones/hour)",
    { burstCount: 0, dailyCount: 0, distinctPhones: 5 },
    "ip_distinct_phones",
    "203.0.113.7",
  );

  // ── Allowed path logs + sends, token threads through ─────────
  {
    const { db, state } = makeDb({ burstCount: 0, dailyCount: 0, distinctPhones: 0 });
    const res = await requestOtpForPhone(db, "Test Bhakt", "9876543210", {
      clientIp: "203.0.113.7",
      captchaToken: "tsr-token-abc",
    });
    check("allowed request proceeds", typeof res.isNewUser === "boolean");
    check(
      "allowed attempt logged (allowed=true, no reason)",
      state.inserted.length === 1 &&
        state.inserted[0].allowed === true &&
        state.inserted[0].reason === undefined &&
        state.inserted[0].ip === "203.0.113.7",
    );
    check(
      "captcha token forwarded into signInWithOtp",
      (state.otpCalls[0] as { options?: { captchaToken?: string } }).options?.captchaToken ===
        "tsr-token-abc",
    );
  }

  // ── No IP header → IP check skipped, per-phone still enforced ─
  {
    const { db, state } = makeDb({ burstCount: 0, dailyCount: 0, distinctPhones: 99 });
    const res = await requestOtpForPhone(db, "", "9876501234");
    check(
      "unattributable IP skips only the IP check",
      state.otpCalls.length === 1 && typeof res.isNewUser === "boolean",
    );
  }

  // ── Ledger missing → deploy-safety fail OPEN (migration pending)
  {
    const { db, state } = makeDb({
      burstCount: 99,
      dailyCount: 99,
      distinctPhones: 99,
      ledger: "missing",
    });
    const res = await requestOtpForPhone(db, "Test", "9876543210");
    check(
      "migration-not-applied degrades OPEN with loud warning path",
      state.otpCalls.length === 1 && state.inserted.length === 0 && !!res,
    );
  }

  // ── Ledger BROKEN → fail CLOSED ───────────────────────────────
  {
    const { db, state } = makeDb({
      burstCount: 0,
      dailyCount: 0,
      distinctPhones: 0,
      ledger: "broken",
    });
    let msg = "";
    try {
      await requestOtpForPhone(db, "Test", "9876543210");
    } catch (err) {
      msg = (err as Error).message;
    }
    check(
      "broken ledger fails closed",
      /otp_send_log check failed/.test(msg) && state.otpCalls.length === 0,
    );
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
