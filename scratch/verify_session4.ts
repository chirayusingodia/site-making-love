// Verification harness — Session 4 batch logic.
// Run:  node scratch/verify_session4.ts   (Node 24 strips types natively)
// Covers: date math, List A/B membership, catch-up, independence,
//         segments, per-member seva resolution, wa.me links.

import {
  assignSegmentsTierPure,
  batchKindForDate,
  buildCompletionUpdate,
  buildDeliveryMessage,
  buildWaLink,
  computeBatchMembership,
  daysInMonth,
  secondTuesdayOf,
  groupForPandit,
  lastSaturdayOf,
  normalizePhoneForWa,
  saturdayHawanSevaIds,
  sevasForMember,
  tierKeyForMember,
  toISODate,
  SEGMENT_SIZE_SUBSCRIPTIONS,
  SEGMENT_MAX_NAMES,
} from "../src/lib/sankalp-logic.ts";
import * as sankalpLogic from "../src/lib/sankalp-logic.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

// ── Fixtures (mirror live seed data) ──────────────────────────
const sevas = [
  { id: "s1", name: "Sundarkand Path", slug: "sundarkand-path", sort_order: 1, is_active: true },
  { id: "s2", name: "Gau Seva", slug: "gau-seva", sort_order: 2, is_active: true },
  { id: "s3", name: "Vanar Seva", slug: "vanar-seva", sort_order: 3, is_active: true },
  { id: "s4", name: "Saadhu Santo Ko Bhojan", slug: "saadhu-santo-ko-bhojan", sort_order: 4, is_active: true },
  { id: "s5", name: "Griha Shanti Hawan", slug: "griha-shanti-hawan", sort_order: 5, is_active: true },
  { id: "s6", name: "Sarv Rog Nivaran Hawan", slug: "sarv-rog-nivaran-hawan", sort_order: 6, is_active: true },
];
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
  ...["s1", "s2", "s3", "s4", "s5", "s6"].map((seva_id) => ({ plan_id: "p-annual", seva_id })),
];
const hawanIds = saturdayHawanSevaIds(sevas, rules);

// ── 1. Date math ──────────────────────────────────────────────
console.log("\n— Date math —");
// Brute-force cross-check for all 12 months of 2026 + 2027
let dateMathOk = true;
for (const y of [2026, 2027]) {
  for (let m = 1; m <= 12; m++) {
    const st = secondTuesdayOf(y, m);
    const ls = lastSaturdayOf(y, m);
    // scan whole month for Tuesdays/Saturdays
    const tuesdays: string[] = [];
    const saturdays: string[] = [];
    for (let d = 1; d <= daysInMonth(y, m); d++) {
      const iso = toISODate(y, m, d);
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      if (dow === 2) tuesdays.push(iso);
      if (dow === 6) saturdays.push(iso);
    }
    if (st !== tuesdays[1]) dateMathOk = false;
    if (ls !== saturdays[saturdays.length - 1]) dateMathOk = false;
    if (batchKindForDate(st) !== "second_tuesday") dateMathOk = false;
    if (batchKindForDate(ls) !== "last_saturday") dateMathOk = false;
    // Every OTHER Tuesday — including the first — must be rejected.
    for (const t of tuesdays.filter((x) => x !== st)) {
      if (batchKindForDate(t) !== null) dateMathOk = false;
    }
    for (const s of saturdays.slice(0, -1)) if (batchKindForDate(s) !== null) dateMathOk = false;
  }
}
check("second-Tue/last-Sat calc + kind detection, 24 months brute-forced", dateMathOk);
check("Aug 2026: second Tuesday = 2026-08-11", secondTuesdayOf(2026, 8) === "2026-08-11");
check("Aug 2026: last Saturday = 2026-08-29", lastSaturdayOf(2026, 8) === "2026-08-29");
check("random Wednesday rejected", batchKindForDate("2026-08-05") === null);
check("hawan detection from live schedule rules = Sarv Rog only",
  hawanIds.length === 1 && hawanIds[0] === "s6");

// ── 2. Membership — August 2026 (2nd Tue 11th, Sat 29th) ───────────
console.log("\n— Membership (Aug 2026: 2nd Tue 11, Sat 29) —");
const subs = [
  { id: "sub-basic-old", plan_id: "p-basic", status: "active", start_date: "2026-07-10", created_at: "2026-07-10" },
  { id: "sub-basic-late", plan_id: "p-basic", status: "active", start_date: "2026-08-17", created_at: "2026-08-17" }, // after Tue 11 → catch-up
  { id: "sub-basic-ontue", plan_id: "p-basic", status: "active", start_date: "2026-08-11", created_at: "2026-08-11" }, // joined ON the second Tuesday
  { id: "sub-prem-old", plan_id: "p-premium", status: "active", start_date: "2026-07-05", created_at: "2026-07-05" },
  { id: "sub-prem-late", plan_id: "p-premium", status: "active", start_date: "2026-08-15", created_at: "2026-08-15" }, // mid-month premium
  { id: "sub-annual", plan_id: "p-annual", status: "active", start_date: null, created_at: "2026-08-01T09:00:00Z" }, // created_at fallback
  { id: "sub-paused", plan_id: "p-premium", status: "paused", start_date: "2026-07-01", created_at: "2026-07-01" },
  { id: "sub-cancelled", plan_id: "p-basic", status: "cancelled", start_date: "2026-07-01", created_at: "2026-07-01" },
  { id: "sub-future", plan_id: "p-premium", status: "active", start_date: "2026-09-01", created_at: "2026-09-01" }, // joins after batch day
  { id: "sub-basic-verylate", plan_id: "p-basic", status: "active", start_date: "2026-08-30", created_at: "2026-08-30" }, // after last Sat
];

const tueMembers = computeBatchMembership({
  kind: "second_tuesday", batchDate: "2026-08-11",
  subscriptions: subs, planSevas, hawanSevaIds: hawanIds,
});
const tueIds = tueMembers.map((m) => m.subscription_id);
check("List A = ALL active subscribers joined by batch day (4)",
  tueIds.length === 4 &&
  ["sub-basic-old", "sub-basic-ontue", "sub-prem-old", "sub-annual"].every((id) => tueIds.includes(id)));
check("List A excludes paused/cancelled", !tueIds.includes("sub-paused") && !tueIds.includes("sub-cancelled"));
check("List A excludes future joiner + after-second-Tuesday joiners",
  !tueIds.includes("sub-future") && !tueIds.includes("sub-basic-late") && !tueIds.includes("sub-prem-late"));
check("List A has NO catch-up rows", tueMembers.every((m) => !m.is_catchup));

const satMembers = computeBatchMembership({
  kind: "last_saturday", batchDate: "2026-08-29",
  subscriptions: subs, planSevas, hawanSevaIds: hawanIds,
});
const satIds = satMembers.map((m) => m.subscription_id);
const catchup = satMembers.filter((m) => m.is_catchup).map((m) => m.subscription_id);
check("List B = hawan plans (old + mid-month premium + annual)",
  ["sub-prem-old", "sub-prem-late", "sub-annual"].every((id) => satIds.includes(id)));
check("List B: Basic late joiner gets ONE-TIME catch-up",
  catchup.length === 1 && catchup[0] === "sub-basic-late");
check("List B: long-time Basic NOT included (Tuesday-only cycle)",
  !satIds.includes("sub-basic-old") && !satIds.includes("sub-basic-ontue"));
check("List B: Basic who joined after last Saturday NOT included",
  !satIds.includes("sub-basic-verylate"));
check("List B: premium mid-month joiner is normal member, not catch-up",
  satMembers.find((m) => m.subscription_id === "sub-prem-late")?.is_catchup === false);
check("List B excludes paused/cancelled/future",
  !satIds.includes("sub-paused") && !satIds.includes("sub-cancelled") && !satIds.includes("sub-future"));

// Month-2 scenario: the SAME catch-up subscriber next month → excluded
const satSep = computeBatchMembership({
  kind: "last_saturday", batchDate: "2026-09-26",
  subscriptions: subs, planSevas, hawanSevaIds: hawanIds,
});
check("Month 2: catch-up subscriber reverts to Tuesday-only (excluded from Sat)",
  !satSep.map((m) => m.subscription_id).includes("sub-basic-late"));

// ── 3. Independence ───────────────────────────────────────────
console.log("\n— Tuesday/Saturday independence —");
check("variantsForKind is GONE — the hawan_only/full_package split is retired",
  !("variantsForKind" in (sankalpLogic as Record<string, unknown>)));
check("SankalpVariant type is GONE (no runtime trace of a variant concept)",
  !Object.keys(sankalpLogic as Record<string, unknown>).some((k) => /variant/i.test(k)));
const completion = buildCompletionUpdate(42);
check("completion payload touches only status/completed_at/subscriber_count",
  JSON.stringify(Object.keys(completion).sort()) === JSON.stringify(["completed_at", "status", "subscriber_count"]) &&
  completion.status === "done" && completion.subscriber_count === 42);

// ── 4. Segments (TIER-PURE, 5 SUBSCRIPTIONS each) ─────────────
console.log("\n— Segments (revision: 5 subs, tier-pure) —");
check("SEGMENT_SIZE_SUBSCRIPTIONS = 5 (unit = subscriptions, NOT names)",
  SEGMENT_SIZE_SUBSCRIPTIONS === 5);
check("SEGMENT_MAX_NAMES = 20 derived (5 subs × up to 4 members)",
  SEGMENT_MAX_NAMES === 20);

// Unit check: a full segment of 5 subscriptions × 4 members = 20 names
const fullSegmentNames = Array.from({ length: 5 }, (_, s) =>
  Array.from({ length: 4 }, (_, m) => `sub${s}-member${m}`),
).flat();
check("5 subscriptions × 4 members = exactly 20 names (cap holds)",
  fullSegmentNames.length <= SEGMENT_MAX_NAMES && fullSegmentNames.length === 20);

// Same-tier split: 12 premium subs → 5, 5, 2
const premKey = tierKeyForMember(
  sevasForMember({ kind: "second_tuesday", planId: "p-premium", planSevas, sevas, saturdayHawanSevaIds: hawanIds, scheduleRules: rules }),
);
const assigned12 = assignSegmentsTierPure(
  Array.from({ length: 12 }, (_, i) => ({ subscription_id: `prem-${i}`, tierKey: premKey })),
);
const sizes12 = [1, 2, 3].map((n) => assigned12.filter((a) => a.segment_number === n).length);
check("12 same-tier subs → 3 segments of 5, 5, 2",
  assigned12.length === 12 && sizes12.join(",") === "5,5,2");

// Tier purity: Basic and Premium subscribers must NEVER share a segment
const basicKey = tierKeyForMember(
  sevasForMember({ kind: "second_tuesday", planId: "p-basic", planSevas, sevas, saturdayHawanSevaIds: hawanIds, scheduleRules: rules }),
);
const mixed = assignSegmentsTierPure([
  { subscription_id: "prem-0", tierKey: premKey },
  { subscription_id: "basic-0", tierKey: basicKey },
  { subscription_id: "prem-1", tierKey: premKey },
  { subscription_id: "basic-1", tierKey: basicKey },
  { subscription_id: "prem-2", tierKey: premKey },
]);
const segOf = new Map(mixed.map((m) => [m.subscription_id, m.segment_number]));
check("tier-pure: no segment mixes Basic and Premium",
  new Set([segOf.get("prem-0"), segOf.get("prem-1"), segOf.get("prem-2")]).size === 1 &&
  segOf.get("basic-0") !== segOf.get("prem-0") &&
  segOf.get("basic-0") === segOf.get("basic-1"));
check("tier-pure: order preserved within each tier bucket",
  mixed.filter((m) => m.subscription_id.startsWith("prem"))[0].subscription_id === "prem-0");

// Identical-composition plans (Premium vs Premium Annual) MAY share
const annualKey = tierKeyForMember(
  sevasForMember({ kind: "second_tuesday", planId: "p-annual", planSevas, sevas, saturdayHawanSevaIds: hawanIds, scheduleRules: rules }),
);
check("Premium and Premium Annual share a tier key (identical live composition)",
  annualKey === premKey);

// Catch-up Basic in the Last Saturday batch gets a DIFFERENT tier key
// than full-package Premium — can never land in the same segment
const catchupKey = tierKeyForMember(
  sevasForMember({ kind: "last_saturday", planId: "p-basic", planSevas, sevas, saturdayHawanSevaIds: hawanIds, scheduleRules: rules, isCatchup: true }),
);
const fullPremKey = tierKeyForMember(
  sevasForMember({ kind: "last_saturday", planId: "p-premium", planSevas, sevas, saturdayHawanSevaIds: hawanIds, scheduleRules: rules }),
);
check("catch-up Basic tier key ≠ Saturday Premium tier key (hawan excluded)",
  catchupKey !== fullPremKey);

// ── 5. Per-member seva resolution ─────────────────────────────
console.log("\n— Seva resolution per member —");
const namesOf = (list: { name: string }[]) => list.map((s) => s.name).join(",");
check("Tuesday Basic → 3 non-hawan sevas",
  namesOf(sevasForMember({ kind: "second_tuesday", planId: "p-basic", planSevas, sevas, saturdayHawanSevaIds: hawanIds, scheduleRules: rules }))
    === "Sundarkand Path,Gau Seva,Vanar Seva");
check("Tuesday Premium → 5: incl. Griha Shanti Hawan, EXCL. Sarv Rog (Saturday hawan)",
  namesOf(sevasForMember({ kind: "second_tuesday", planId: "p-premium", planSevas, sevas, saturdayHawanSevaIds: hawanIds, scheduleRules: rules }))
    === "Sundarkand Path,Gau Seva,Vanar Seva,Saadhu Santo Ko Bhojan,Griha Shanti Hawan");
check("Last Saturday Premium → 5: incl. Sarv Rog Nivaran, EXCL. Griha Shanti (Tuesday hawan)",
  namesOf(sevasForMember({ kind: "last_saturday", planId: "p-premium", planSevas, sevas, saturdayHawanSevaIds: hawanIds, scheduleRules: rules }))
    === "Sundarkand Path,Gau Seva,Vanar Seva,Saadhu Santo Ko Bhojan,Sarv Rog Nivaran Hawan");
check("Last Saturday CATCH-UP Basic → 3 sevas, NO hawan added",
  namesOf(sevasForMember({ kind: "last_saturday", planId: "p-basic", planSevas, sevas, saturdayHawanSevaIds: hawanIds, scheduleRules: rules, isCatchup: true }))
    === "Sundarkand Path,Gau Seva,Vanar Seva");

// Day-scoping of the two hawans — the rule the plan page also renders
// (scheduleForPlan in src/lib/plans.ts). Griha Shanti = Second Tuesday,
// Sarv Rog Nivaran = Last Saturday. Never both hawans on one day.
const tuePrem = namesOf(sevasForMember({ kind: "second_tuesday", planId: "p-premium", planSevas, sevas, saturdayHawanSevaIds: hawanIds, scheduleRules: rules }));
const satPrem = namesOf(sevasForMember({ kind: "last_saturday", planId: "p-premium", planSevas, sevas, saturdayHawanSevaIds: hawanIds, scheduleRules: rules }));
check("Griha Shanti Hawan on Tuesday ONLY",
  tuePrem.includes("Griha Shanti Hawan") && !satPrem.includes("Griha Shanti Hawan"));
check("Sarv Rog Nivaran Hawan on Saturday ONLY",
  satPrem.includes("Sarv Rog Nivaran Hawan") && !tuePrem.includes("Sarv Rog Nivaran Hawan"));
check("no batch day ever carries BOTH hawans",
  ![tuePrem, satPrem].some((d) => d.includes("Griha Shanti") && d.includes("Sarv Rog")));

// Premium non-hawan sevas run on BOTH days (twice a month) — the ₹399 promise.
for (const n of ["Sundarkand Path", "Gau Seva", "Vanar Seva", "Saadhu Santo Ko Bhojan"]) {
  check(`Premium: ${n} runs on BOTH Tuesday and Saturday`,
    tuePrem.includes(n) && satPrem.includes(n));
}

// Basic (Rs 251) has NO hawan anywhere, on any day, in any variant.
const basicEverywhere = [
  sevasForMember({ kind: "second_tuesday", planId: "p-basic", planSevas, sevas, saturdayHawanSevaIds: hawanIds, scheduleRules: rules }),
  sevasForMember({ kind: "last_saturday", planId: "p-basic", planSevas, sevas, saturdayHawanSevaIds: hawanIds, scheduleRules: rules, isCatchup: true }),
];
check("Basic never receives a hawan in ANY variant",
  basicEverywhere.every((list) => list.every((sv) => !/hawan/i.test(sv.name))));

// A seva with NO schedule rule must not silently vanish from a batch.
const unruledHawan = [...sevas, { id: "s7", name: "Test Hawan", slug: "test-hawan", sort_order: 7, is_active: true }];
const unruledPlanSevas = [...planSevas, { plan_id: "p-premium", seva_id: "s7" }];
check("hawan with NO schedule rule is kept (never silently dropped)",
  namesOf(sevasForMember({ kind: "second_tuesday", planId: "p-premium", planSevas: unruledPlanSevas, sevas: unruledHawan, saturdayHawanSevaIds: hawanIds, scheduleRules: rules }))
    .includes("Test Hawan"));

// ── 6. Pandit grouping + PII firewall ─────────────────────────
console.log("\n— Pandit grouping —");
const panditGroups = groupForPandit([
  { subscription_id: "sub-prem-old", is_catchup: false,
    sevas: sevasForMember({ kind: "last_saturday", planId: "p-premium", planSevas, sevas, saturdayHawanSevaIds: hawanIds, scheduleRules: rules }),
    names: [{ name: "Mohan Verma", gotra: "Vashisht" }] },
  { subscription_id: "sub-basic-late", is_catchup: true,
    sevas: sevasForMember({ kind: "last_saturday", planId: "p-basic", planSevas, sevas, saturdayHawanSevaIds: hawanIds, scheduleRules: rules, isCatchup: true }),
    names: [{ name: "Ramesh Sharma", gotra: "Bharadwaj" }, { name: "Sita Sharma", gotra: null }] },
]);
check("catch-up Basic family lands in its OWN group (never mixed with hawan members)",
  panditGroups.length === 2);
check("catch-up group has 3 sevas, Saturday premium group has 5 (one hawan, not both)",
  panditGroups.some((g) => g.sevas.length === 3 && g.catchupCount === 1) &&
  panditGroups.some((g) => g.sevas.length === 5 && g.catchupCount === 0));
check("names carry ONLY name + gotra (no phone/plan/price fields exist)",
  panditGroups.every((g) => g.names.every((n) => Object.keys(n).sort().join(",") === "gotra,name")));

// ── 7. WhatsApp stub ──────────────────────────────────────────
console.log("\n— WhatsApp stub —");
check("10-digit phone → 91 prefix", normalizePhoneForWa("98765 43210") === "919876543210");
check("+91 formatted phone preserved", normalizePhoneForWa("+91-9876543210") === "919876543210");
const link = buildWaLink("9876543210", "Namaste 🙏 test");
check("wa.me link is well-formed + encoded",
  link.startsWith("https://wa.me/919876543210?text=") && link.includes("Namaste"));
const msg = buildDeliveryMessage({ sevaNames: ["Sundarkand Path"], batchLabelText: "Second Tuesday Sankalp — 11 August 2026", videoUrl: "https://res.cloudinary.com/x/video.mp4" });
check("ONE message: references sevas + combined video, no plan/price",
  msg.includes("Sundarkand Path") && msg.includes("video.mp4") && !/₹|Basic|Premium/.test(msg));
check("message mentions combined seva+naam video (single-asset model)",
  msg.includes("naam-sankalp ka video"));

// ── Result ────────────────────────────────────────────────────
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
