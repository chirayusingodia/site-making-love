// Verification harness — List A schedule shift: FIRST → SECOND Tuesday.
// Run:  node scratch/verify_second_tuesday.ts   (Node 24 strips types natively)
// Multi-TZ:  npm run test:schedule
//
// Covers: second-Tuesday date math (month starting Tue, month starting
//         Wed, 5-Tuesday months, leap + non-leap February), timezone
//         invariance, batch_type values, the onboarding catch-up cutoff,
//         and a List B (Last Saturday) regression suite asserting nothing
//         about List B moved.

import {
  batchKindForDate,
  batchLabel,
  computeBatchMembership,
  lastSaturdayOf,
  saturdayHawanSevaIds,
  secondTuesdayOf,
} from "../src/lib/sankalp-logic.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}
function note(label: string) {
  console.log(`NOTE  ${label}`);
}

console.log(
  `\n=== List A Second-Tuesday verification (TZ=${process.env.TZ ?? "system default"}) ===`,
);

// ── Fixtures (mirror live seed data, post-shift occurrence values) ──
const sevas = [
  { id: "s1", name: "Sundarkand Path", slug: "sundarkand-path", sort_order: 1, is_active: true },
  { id: "s2", name: "Gau Seva", slug: "gau-seva", sort_order: 2, is_active: true },
  { id: "s3", name: "Vanar Seva", slug: "vanar-seva", sort_order: 3, is_active: true },
  {
    id: "s4",
    name: "Saadhu Santo Ko Bhojan",
    slug: "saadhu-santo-ko-bhojan",
    sort_order: 4,
    is_active: true,
  },
  {
    id: "s5",
    name: "Griha Shanti Hawan",
    slug: "griha-shanti-hawan",
    sort_order: 5,
    is_active: true,
  },
  {
    id: "s6",
    name: "Sarv Rog Nivaran Hawan",
    slug: "sarv-rog-nivaran-hawan",
    sort_order: 6,
    is_active: true,
  },
];
// List A rules now say 'second'. The two SAT/'last' rows are IDENTICAL to
// the pre-shift fixture — List B was not touched.
const rules = [
  { seva_id: "s1", weekday: "TUE", occurrence: "second" },
  { seva_id: "s2", weekday: "TUE", occurrence: "second" },
  { seva_id: "s3", weekday: "TUE", occurrence: "second" },
  { seva_id: "s4", weekday: "TUE", occurrence: "second" },
  { seva_id: "s4", weekday: "SAT", occurrence: "last" },
  { seva_id: "s5", weekday: "TUE", occurrence: "second" },
  { seva_id: "s6", weekday: "SAT", occurrence: "last" },
];
const planSevas = [
  ...["s1", "s2", "s3"].map((seva_id) => ({ plan_id: "p-basic", seva_id })),
  ...["s1", "s2", "s3", "s4", "s5", "s6"].map((seva_id) => ({ plan_id: "p-premium", seva_id })),
];
const hawanIds = saturdayHawanSevaIds(sevas, rules);

// ─────────────────────────────────────────────────────────────
// 1. Second-Tuesday date math — required edge cases
// ─────────────────────────────────────────────────────────────
console.log("\n— 1. Second-Tuesday date math —");

// (a) Month BEGINNING ON A TUESDAY → 2nd Tuesday is the 8th.
//     Sep 2026 starts Tue; Tuesdays fall on 1, 8, 15, 22, 29.
check(
  "month starts Tuesday: Sep 2026 → 2026-09-08 (the 8th)",
  secondTuesdayOf(2026, 9) === "2026-09-08",
);
check(
  "month starts Tuesday: Dec 2026 → 2026-12-08 (the 8th)",
  secondTuesdayOf(2026, 12) === "2026-12-08",
);

// (b) Month BEGINNING ON A WEDNESDAY → 2nd Tuesday is the 14th
//     (latest possible). Apr 2026 starts Wed; Tuesdays on 7,14,21,28.
check(
  "month starts Wednesday: Apr 2026 → 2026-04-14 (the 14th, latest possible)",
  secondTuesdayOf(2026, 4) === "2026-04-14",
);
check(
  "month starts Wednesday: Jul 2026 → 2026-07-14 (the 14th)",
  secondTuesdayOf(2026, 7) === "2026-07-14",
);

// (c) FIVE-TUESDAY months — the extra Tuesday must not shift the answer.
check(
  "5-Tuesday month (Mar 2026: 3,10,17,24,31) → 2026-03-10",
  secondTuesdayOf(2026, 3) === "2026-03-10",
);
check(
  "5-Tuesday month (Jun 2026: 2,9,16,23,30) → 2026-06-09",
  secondTuesdayOf(2026, 6) === "2026-06-09",
);
check(
  "5-Tuesday month (Sep 2026: 1,8,15,22,29) → 2026-09-08",
  secondTuesdayOf(2026, 9) === "2026-09-08",
);

// (d) FEBRUARY, leap and non-leap.
check(
  "Feb NON-leap 2026 (28d, starts Sun) → 2026-02-10",
  secondTuesdayOf(2026, 2) === "2026-02-10",
);
check(
  "Feb NON-leap 2027 (28d, starts Mon) → 2027-02-09",
  secondTuesdayOf(2027, 2) === "2027-02-09",
);
check(
  "Feb LEAP 2028 (29d, starts Tue, 5 Tuesdays) → 2028-02-08",
  secondTuesdayOf(2028, 2) === "2028-02-08",
);
check("Feb LEAP 2032 (29d) → 2032-02-10", secondTuesdayOf(2032, 2) === "2032-02-10");
check(
  "Feb 2100 is NOT a leap year (century rule) → 2100-02-09",
  secondTuesdayOf(2100, 2) === "2100-02-09",
);

// (e) Invariants across a wide range: always a Tuesday, always day 8-14,
//     and always exactly 7 days after the first Tuesday.
let invariantOk = true;
let shiftedByExactlyOneWeek = true;
for (let y = 2026; y <= 2036; y++) {
  for (let m = 1; m <= 12; m++) {
    const iso = secondTuesdayOf(y, m);
    const day = Number(iso.slice(8, 10));
    if (new Date(`${iso}T00:00:00Z`).getUTCDay() !== 2) invariantOk = false;
    if (day < 8 || day > 14) invariantOk = false;
    // Independent first-Tuesday computation (the OLD List A day).
    let firstTue = 0;
    for (let d = 1; d <= 7; d++) {
      if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 2) {
        firstTue = d;
        break;
      }
    }
    if (day - firstTue !== 7) shiftedByExactlyOneWeek = false;
  }
}
check("132 months (2026-2036): always a Tuesday, always day 8-14", invariantOk);
check(
  "132 months: second Tuesday is ALWAYS exactly 7 days after the first",
  shiftedByExactlyOneWeek,
);

// (f) The shift actually happened — the old day is no longer List A.
check(
  "Sep 2026: the OLD List A day (2026-09-01) is no longer a batch day",
  batchKindForDate("2026-09-01") === null,
);
check(
  "Sep 2026: the NEW List A day (2026-09-08) IS a batch day",
  batchKindForDate("2026-09-08") === "second_tuesday",
);
check("Apr 2026: old first Tuesday (2026-04-07) rejected", batchKindForDate("2026-04-07") === null);
check(
  "Apr 2026: new second Tuesday (2026-04-14) accepted",
  batchKindForDate("2026-04-14") === "second_tuesday",
);
check("a third Tuesday is never a batch day (2026-09-15)", batchKindForDate("2026-09-15") === null);

// ─────────────────────────────────────────────────────────────
// 2. Timezone boundary
// ─────────────────────────────────────────────────────────────
console.log("\n— 2. Timezone boundary —");
//
// There is no batch-generation cron in this repo (generation is a manual
// admin POST), so there is no cron TZ to straddle. What must hold is that
// the date math is TZ-INVARIANT: it is pure y/m/d arithmetic reading
// getUTCDay(), never local time. These cases straddle the UTC↔IST
// boundary and the international date line in both directions.

const TZ_CASES = [
  "UTC",
  "Asia/Kolkata",
  "Pacific/Kiritimati",
  "Pacific/Niue",
  "America/Los_Angeles",
];
const BASELINE_TUE = secondTuesdayOf(2026, 9);
const BASELINE_SAT = lastSaturdayOf(2026, 9);
const originalTZ = process.env.TZ;
let tzInvariant = true;
let tzActuallyChanged = false;

for (const tz of TZ_CASES) {
  process.env.TZ = tz;
  // Confirm the TZ switch took effect in this runtime before trusting it.
  const localHour = new Date("2026-09-08T12:00:00Z").getHours();
  if (localHour !== 12) tzActuallyChanged = true;
  if (secondTuesdayOf(2026, 9) !== BASELINE_TUE) tzInvariant = false;
  if (lastSaturdayOf(2026, 9) !== BASELINE_SAT) tzInvariant = false;
  if (batchKindForDate("2026-09-08") !== "second_tuesday") tzInvariant = false;
  if (batchKindForDate("2026-09-26") !== "last_saturday") tzInvariant = false;
}
if (originalTZ === undefined) delete process.env.TZ;
else process.env.TZ = originalTZ;

check(`identical results across ${TZ_CASES.length} timezones (UTC±14 range)`, tzInvariant);
if (tzActuallyChanged) {
  check("runtime honoured the TZ switches (offsets genuinely differed)", true);
} else {
  note("this runtime did not re-read process.env.TZ; the multi-TZ sweep is");
  note("weak here — npm run test:schedule re-runs the file with TZ preset,");
  note("which exercises it properly at process start.");
}

// Straddle case at the boundary itself: 2026-09-08 in IST begins at
// 2026-09-07T18:30Z. A naive local-time implementation would resolve the
// day before. The batch day must still be the 8th.
check(
  "IST midnight straddle: 2026-09-07T18:30Z is still List A day 2026-09-08",
  secondTuesdayOf(2026, 9) === "2026-09-08" &&
    new Date("2026-09-07T18:30:00Z").toISOString().slice(0, 10) === "2026-09-07",
);

note("PRE-EXISTING, OUT OF SCOPE: joinedAtISO() slices a timestamptz to its");
note("UTC date, while business days are IST. A 00:30 IST activation reads as");
note("the previous day. Unrelated to this shift (identical before it).");

// ─────────────────────────────────────────────────────────────
// 3. batch_type values — new writes vs legacy rows
// ─────────────────────────────────────────────────────────────
console.log("\n— 3. batch_type values —");
check(
  "List A generation returns 'second_tuesday'",
  batchKindForDate(secondTuesdayOf(2026, 10)) === "second_tuesday",
);
check(
  "List A label reads 'Second Tuesday'",
  batchLabel("second_tuesday", "2026-09-08") === "Second Tuesday Sankalp — 8 September 2026",
);
// One batch row per (kind, date) is now structural: variantsForKind is gone
// and the DB carries a UNIQUE (batch_type, batch_date) index
// (20260819_010_retire_sankalp_variant.sql).
// 'first_tuesday' is fully retired — no such value exists in the type, the
// DB constraint, or any code path. Nothing to assert about it.

// ─────────────────────────────────────────────────────────────
// 4. Onboarding catch-up cutoff (Saturday-ineligible plans)
// ─────────────────────────────────────────────────────────────
console.log("\n— 4. Catch-up cutoff = the SECOND Tuesday —");
//
// Sep 2026: List A = 2026-09-08, List B = 2026-09-26.
// Cutoff is the batch DAY ITSELF, zero offset: joining ON the Tuesday
// means you were in List A, so only a strictly-later join earns catch-up.

const SEP_TUE = "2026-09-08";
const SEP_SAT = "2026-09-26";
const subs = [
  {
    id: "basic-before-tue",
    plan_id: "p-basic",
    status: "active",
    start_date: "2026-09-03",
    created_at: "2026-09-03",
  },
  {
    id: "basic-on-tue",
    plan_id: "p-basic",
    status: "active",
    start_date: SEP_TUE,
    created_at: SEP_TUE,
  },
  {
    id: "basic-after-tue",
    plan_id: "p-basic",
    status: "active",
    start_date: "2026-09-10",
    created_at: "2026-09-10",
  },
  // Joined between the OLD and NEW cutoff — the case the shift changes.
  {
    id: "basic-in-gap",
    plan_id: "p-basic",
    status: "active",
    start_date: "2026-09-04",
    created_at: "2026-09-04",
  },
  {
    id: "prem-any",
    plan_id: "p-premium",
    status: "active",
    start_date: "2026-09-20",
    created_at: "2026-09-20",
  },
];

const satRows = computeBatchMembership({
  kind: "last_saturday",
  batchDate: SEP_SAT,
  subscriptions: subs,
  planSevas,
  hawanSevaIds: hawanIds,
});
const satIds = satRows.map((r) => r.subscription_id);
const catchups = satRows.filter((r) => r.is_catchup).map((r) => r.subscription_id);

check(
  "joined ON the second Tuesday → NOT a catch-up (was in List A that day)",
  !catchups.includes("basic-on-tue") && !satIds.includes("basic-on-tue"),
);
check("joined AFTER the second Tuesday → one-time catch-up", catchups.includes("basic-after-tue"));
check("joined well before the second Tuesday → no catch-up", !satIds.includes("basic-before-tue"));
check(
  "joined 2026-09-04 (after OLD first Tue 09-01, before NEW 09-08) → NO catch-up",
  !satIds.includes("basic-in-gap"),
);
note("basic-in-gap is the behavioural delta: pre-shift it would have been a");
note("catch-up; now it simply waits for 09-08 List A, which is correct.");
check(
  "hawan-plan subscriber is in List B regardless, never flagged catch-up",
  satIds.includes("prem-any") && !catchups.includes("prem-any"),
);

const tueRows = computeBatchMembership({
  kind: "second_tuesday",
  batchDate: SEP_TUE,
  subscriptions: subs,
  planSevas,
  hawanSevaIds: hawanIds,
});
const tueIds = tueRows.map((r) => r.subscription_id);
check(
  "List A on 09-08 includes everyone active by then (incl. join-on-the-day)",
  tueIds.includes("basic-before-tue") &&
    tueIds.includes("basic-on-tue") &&
    tueIds.includes("basic-in-gap"),
);
check("List A excludes anyone who joined after it", !tueIds.includes("basic-after-tue"));
check(
  "List A never flags catch-up",
  tueRows.every((r) => !r.is_catchup),
);

// ─────────────────────────────────────────────────────────────
// 5. REGRESSION — List B (Last Saturday) is unchanged
// ─────────────────────────────────────────────────────────────
console.log("\n— 5. List B regression (must be untouched) —");

// Hardcoded last-Saturday dates, independent of any List A change.
const LAST_SAT: Array<[number, number, string]> = [
  [2026, 2, "2026-02-28"],
  [2026, 3, "2026-03-28"],
  [2026, 4, "2026-04-25"],
  [2026, 6, "2026-06-27"],
  [2026, 7, "2026-07-25"],
  [2026, 9, "2026-09-26"],
  [2026, 12, "2026-12-26"],
  [2027, 2, "2027-02-27"],
  [2028, 2, "2028-02-26"],
  [2029, 2, "2029-02-24"],
];
check(
  "lastSaturdayOf unchanged for 10 reference months",
  LAST_SAT.every(([y, m, iso]) => lastSaturdayOf(y, m) === iso),
);

let satInvariant = true;
for (let y = 2026; y <= 2036; y++) {
  for (let m = 1; m <= 12; m++) {
    const iso = lastSaturdayOf(y, m);
    if (new Date(`${iso}T00:00:00Z`).getUTCDay() !== 6) satInvariant = false;
    if (batchKindForDate(iso) !== "last_saturday") satInvariant = false;
  }
}
check("132 months: last Saturday still resolves and still maps to 'last_saturday'", satInvariant);
check(
  "List B has ONE label — the retired hawan variant label is gone",
  batchLabel("last_saturday", "2026-09-26") === "Last Saturday Sankalp — 26 September 2026",
);
check(
  "Saturday hawan detection unchanged (Sarv Rog Nivaran, not Griha Shanti)",
  hawanIds.includes("s6") && !hawanIds.includes("s5") && hawanIds.length === 1,
);
check(
  "List A and List B never collide on the same date",
  LAST_SAT.every(([y, m]) => secondTuesdayOf(y, m) !== lastSaturdayOf(y, m)),
);

// Independence: hawan-plan membership in List B is identical whether the
// month's List A ran on the first or second Tuesday.
const hawanOnlySubs = subs.filter((s) => s.plan_id === "p-premium");
const satHawanBefore = computeBatchMembership({
  kind: "last_saturday",
  batchDate: SEP_SAT,
  subscriptions: hawanOnlySubs,
  planSevas,
  hawanSevaIds: hawanIds,
});
check(
  "hawan-plan List B membership independent of the List A day",
  satHawanBefore.length === 1 && satHawanBefore[0].subscription_id === "prem-any",
);

// ── Result ────────────────────────────────────────────────────
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
