// PURE verification of the mandate tenure arithmetic — no network, no
// DB, no Razorpay keys needed. Replaces the old
// scratch/verify_checkout_tenure.ts, which asserted the very constants
// (monthly→1200, yearly→100) that CAUSED the 2026-08-28 outage:
//
//   "end_time must be between 946684800 and 4765046400"
//
// The point of these cases is that tenure must be DERIVED from the
// remaining distance to the gateway's fixed calendar ceiling, so it can
// never drift out of range as the years pass. A test that pins an
// absolute cycle count would re-introduce exactly the bug it is meant
// to guard.
//
// Run:
//   node --import ./scratch/ts-aliases.mjs scratch/verify_tenure.ts

import process from "node:process";
import {
  CEILING_SAFETY_BUFFER_DAYS,
  MANDATE_TENURE_YEARS,
  MAX_CYCLE_SECONDS,
  expectedEndAt,
  tenureFitsGatewayCeiling,
  totalCountForTenure,
} from "../src/lib/gateways/tenure.ts";
import { RAZORPAY_MAX_END_TIME_SECONDS } from "../src/lib/gateways/razorpay.ts";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}

const RZP = RAZORPAY_MAX_END_TIME_SECONDS; // 2120-12-31
const DAY = 24 * 60 * 60;

// Fixed reference instants so these cases never depend on "today".
const AUG_2026 = Math.floor(Date.parse("2026-08-28T00:00:00Z") / 1000);
const YEAR_2100 = Math.floor(Date.parse("2100-01-01T00:00:00Z") / 1000);
const YEAR_2120 = Math.floor(Date.parse("2120-12-01T00:00:00Z") / 1000);

console.log(`policy tenure: ${MANDATE_TENURE_YEARS} years\n`);

// ── 1. The regression itself ─────────────────────────────────────
// A 50-year mandate raised in 2026 must land inside the ceiling. The
// OLD code asked for 100 years here and was rejected outright.
for (const period of ["monthly", "yearly"] as const) {
  const totalCount = totalCountForTenure({
    period,
    maxEndTimeSeconds: RZP,
    nowSeconds: AUG_2026,
  });
  const endTime = AUG_2026 + totalCount * MAX_CYCLE_SECONDS[period];
  check(
    `2026 ${period}: derived tenure lands inside the ceiling`,
    endTime <= RZP,
    `total_count=${totalCount}, end_time=${new Date(endTime * 1000).toISOString().slice(0, 10)}`,
  );
  check(
    `2026 ${period}: full ${MANDATE_TENURE_YEARS}y policy tenure is available`,
    totalCount === MANDATE_TENURE_YEARS * (period === "monthly" ? 12 : 1),
    `total_count=${totalCount}`,
  );
}

// Proof the old constant really was out of range — i.e. this suite
// would have caught the incident.
check(
  "100-year tenure in 2026 would OVERSHOOT the ceiling (the original bug)",
  AUG_2026 + 100 * MAX_CYCLE_SECONDS.yearly > RZP,
);

// ── 2. Self-correction as the calendar advances ──────────────────
// Well before the ceiling, the policy tenure is no longer available
// and the derivation must silently SHRINK rather than ask for the
// impossible — while every result it does return stays legal.
for (const period of ["monthly", "yearly"] as const) {
  const totalCount = totalCountForTenure({
    period,
    maxEndTimeSeconds: RZP,
    nowSeconds: YEAR_2100,
  });
  const endTime = YEAR_2100 + totalCount * MAX_CYCLE_SECONDS[period];
  check(`2100 ${period}: still inside the ceiling`, endTime <= RZP, `total_count=${totalCount}`);
  check(`2100 ${period}: a legal tenure still exists`, totalCount >= 1);
  check(
    `2100 ${period}: shrunk below the ${MANDATE_TENURE_YEARS}y policy`,
    totalCount < MANDATE_TENURE_YEARS * (period === "monthly" ? 12 : 1),
    `total_count=${totalCount}`,
  );
}

// ── 2b. Under one cycle of headroom → 0, meaning "not this gateway"
// This is the case an earlier draft got wrong by clamping to 1: at
// 2120-12-01 a single monthly cycle (31d) already overshoots the
// 2120-12-31 ceiling, so a 1-cycle mandate would be REJECTED. Returning
// 0 lets the registry fail over to a provider that can serve it instead
// of sending a request guaranteed to fail.
for (const period of ["monthly", "yearly"] as const) {
  const totalCount = totalCountForTenure({
    period,
    maxEndTimeSeconds: RZP,
    nowSeconds: YEAR_2120,
  });
  check(
    `2120 ${period}: returns 0 (no legal tenure) rather than a doomed 1`,
    totalCount === 0,
    `total_count=${totalCount}`,
  );
  check(
    `2120 ${period}: the guard also refuses a forced 1-cycle mandate`,
    !tenureFitsGatewayCeiling({
      period,
      totalCount: 1,
      maxEndTimeSeconds: RZP,
      nowSeconds: YEAR_2120,
    }),
  );
}

// Past the ceiling entirely — still 0, never a negative count.
const pastCeiling = totalCountForTenure({
  period: "monthly",
  maxEndTimeSeconds: RZP,
  nowSeconds: RZP + 5 * 365 * DAY,
});
check("beyond the ceiling: 0, never negative", pastCeiling === 0);

// Every non-zero result, sampled across two centuries, must be legal.
// This is the invariant that actually matters: no date can produce a
// tenure that the gateway would reject.
let illegal = 0;
for (let year = 2026; year <= 2125; year++) {
  const now = Math.floor(Date.parse(`${year}-06-15T00:00:00Z`) / 1000);
  for (const period of ["monthly", "yearly"] as const) {
    const tc = totalCountForTenure({ period, maxEndTimeSeconds: RZP, nowSeconds: now });
    if (tc < 1) continue; // correctly reported as impossible
    if (now + tc * MAX_CYCLE_SECONDS[period] > RZP) illegal++;
  }
}
check("2026→2125, every cadence: no year yields an out-of-range tenure", illegal === 0, `${illegal} violations`);

// ── 3. The safety buffer is real ─────────────────────────────────
const bufferProbe = totalCountForTenure({
  period: "yearly",
  maxEndTimeSeconds: RZP,
  nowSeconds: AUG_2026,
});
const bufferEnd = AUG_2026 + bufferProbe * MAX_CYCLE_SECONDS.yearly;
check(
  `keeps at least the ${CEILING_SAFETY_BUFFER_DAYS}-day buffer clear of the ceiling`,
  RZP - bufferEnd >= 0,
  `slack=${Math.round((RZP - bufferEnd) / DAY)}d`,
);

// ── 4. Gateways with no calendar ceiling ─────────────────────────
check(
  "null ceiling (card-network gateway): policy tenure applies unclamped",
  totalCountForTenure({ period: "monthly", maxEndTimeSeconds: null, nowSeconds: YEAR_2120 }) ===
    MANDATE_TENURE_YEARS * 12,
);

// ── 5. The guard that refuses a hand-rolled bad tenure ───────────
check(
  "guard accepts a derived tenure",
  tenureFitsGatewayCeiling({
    period: "yearly",
    totalCount: totalCountForTenure({
      period: "yearly",
      maxEndTimeSeconds: RZP,
      nowSeconds: AUG_2026,
    }),
    maxEndTimeSeconds: RZP,
    nowSeconds: AUG_2026,
  }),
);
check(
  "guard REJECTS the old hardcoded 100-year tenure",
  !tenureFitsGatewayCeiling({
    period: "yearly",
    totalCount: 100,
    maxEndTimeSeconds: RZP,
    nowSeconds: AUG_2026,
  }),
);
check(
  "guard rejects zero / negative / non-integer counts",
  !tenureFitsGatewayCeiling({
    period: "monthly",
    totalCount: 0,
    maxEndTimeSeconds: RZP,
    nowSeconds: AUG_2026,
  }) &&
    !tenureFitsGatewayCeiling({
      period: "monthly",
      totalCount: -5,
      maxEndTimeSeconds: RZP,
      nowSeconds: AUG_2026,
    }) &&
    !tenureFitsGatewayCeiling({
      period: "monthly",
      totalCount: 12.5,
      maxEndTimeSeconds: RZP,
      nowSeconds: AUG_2026,
    }),
);

// ── 6. expected_end_at drives the renewal sweep ─────────────────
const end = expectedEndAt("yearly", 50, AUG_2026 * 1000);
check(
  "expectedEndAt('yearly', 50) is ~50 years out",
  end.getUTCFullYear() >= 2075 && end.getUTCFullYear() <= 2077,
  end.toISOString().slice(0, 10),
);
check(
  "expectedEndAt is monotonic in total_count",
  expectedEndAt("monthly", 24, AUG_2026 * 1000) > expectedEndAt("monthly", 12, AUG_2026 * 1000),
);

// ── 7. The UPI relative ceiling (2026-08-28, second incident) ────
// A 50-year policy tenure lands comfortably inside the 2120 end_time
// wall (checked in section 1), but Razorpay's SEPARATE UPI Autopay
// rule caps mandate validity at 30 years from CREATION. This must bind
// even though the calendar wall has ~94 years of headroom in 2026 —
// that is precisely what let the bug through the end_time fix.
import { RAZORPAY_UPI_MAX_TENURE_YEARS } from "../src/lib/gateways/razorpay.ts";

for (const period of ["monthly", "yearly"] as const) {
  const totalCount = totalCountForTenure({
    period,
    maxEndTimeSeconds: RZP,
    maxRelativeTenureYears: RAZORPAY_UPI_MAX_TENURE_YEARS,
    nowSeconds: AUG_2026,
  });
  check(
    `2026 ${period}: UPI's ${RAZORPAY_UPI_MAX_TENURE_YEARS}y relative cap overrides the far looser end_time wall`,
    totalCount < MANDATE_TENURE_YEARS * (period === "monthly" ? 12 : 1),
    `total_count=${totalCount}`,
  );
  check(
    `2026 ${period}: derived tenure still satisfies the guard with the relative cap applied`,
    tenureFitsGatewayCeiling({
      period,
      totalCount,
      maxEndTimeSeconds: RZP,
      maxRelativeTenureYears: RAZORPAY_UPI_MAX_TENURE_YEARS,
      nowSeconds: AUG_2026,
    }),
  );
}

// The exact regression: the OLD 50-year request, unclamped by the
// relative cap, must be REJECTED by the guard once the cap is passed —
// proving this suite would have caught the incident.
check(
  "guard REJECTS the un-clamped 50-year tenure once the UPI relative cap is passed",
  !tenureFitsGatewayCeiling({
    period: "yearly",
    totalCount: MANDATE_TENURE_YEARS,
    maxEndTimeSeconds: RZP,
    maxRelativeTenureYears: RAZORPAY_UPI_MAX_TENURE_YEARS,
    nowSeconds: AUG_2026,
  }),
);

// The relative cap must keep working as the calendar advances — it is
// RELATIVE, so unlike the end_time wall it never needs to "catch up".
// (2120 is deliberately excluded here: by then the ABSOLUTE end_time
// wall itself has under a cycle of headroom left — see section 2b —
// so it saturates to 0 for a reason unrelated to this cap.)
for (const now of [YEAR_2100]) {
  const totalCount = totalCountForTenure({
    period: "yearly",
    maxEndTimeSeconds: RZP,
    maxRelativeTenureYears: RAZORPAY_UPI_MAX_TENURE_YEARS,
    nowSeconds: now,
  });
  check(
    `at ${new Date(now * 1000).toISOString().slice(0, 4)}: relative cap still yields a legal, non-zero tenure`,
    totalCount >= 1 &&
      tenureFitsGatewayCeiling({
        period: "yearly",
        totalCount,
        maxEndTimeSeconds: RZP,
        maxRelativeTenureYears: RAZORPAY_UPI_MAX_TENURE_YEARS,
        nowSeconds: now,
      }),
    `total_count=${totalCount}`,
  );
}

// null maxRelativeTenureYears (a hypothetical gateway with no such
// rule) must leave behaviour identical to before this field existed.
check(
  "maxRelativeTenureYears omitted: behaves exactly like the pre-fix derivation",
  totalCountForTenure({ period: "yearly", maxEndTimeSeconds: RZP, nowSeconds: AUG_2026 }) ===
    totalCountForTenure({
      period: "yearly",
      maxEndTimeSeconds: RZP,
      maxRelativeTenureYears: null,
      nowSeconds: AUG_2026,
    }),
);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
if (failures > 0) process.exit(1);
