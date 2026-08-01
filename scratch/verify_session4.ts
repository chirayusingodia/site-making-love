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
  firstTuesdayOf,
  groupForPandit,
  lastSaturdayOf,
  normalizePhoneForWa,
  saturdayHawanSevaIds,
  sevasForMember,
  tierKeyForMember,
  toISODate,
  variantsForKind,
  SEGMENT_SIZE_SUBSCRIPTIONS,
  SEGMENT_MAX_NAMES,
} from "../src/lib/sankalp-logic.ts";

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
  { seva_id: "s1", weekday: "TUE", occurrence: "first" },
  { seva_id: "s2", weekday: "TUE", occurrence: "first" },
  { seva_id: "s3", weekday: "TUE", occurrence: "first" },
  { seva_id: "s4", weekday: "TUE", occurrence: "first" },
  { seva_id: "s4", weekday: "SAT", occurrence: "last" },
  { seva_id: "s5", weekday: "TUE", occurrence: "first" },
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
    const ft = firstTuesdayOf(y, m);
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
    if (ft !== tuesdays[0]) dateMathOk = false;
    if (ls !== saturdays[saturdays.length - 1]) dateMathOk = false;
    if (batchKindForDate(ft) !== "first_tuesday") dateMathOk = false;
    if (batchKindForDate(ls) !== "last_saturday") dateMathOk = false;
    for (const t of tuesdays.slice(1)) if (batchKindForDate(t) !== null) dateMathOk = false;
    for (const s of saturdays.slice(0, -1)) if (batchKindForDate(s) !== null) dateMathOk = false;
  }
}
check("first/last day calc + kind detection, 24 months brute-forced", dateMathOk);
check("Aug 2026: first Tuesday = 2026-08-04", firstTuesdayOf(2026, 8) === "2026-08-04");
check("Aug 2026: last Saturday = 2026-08-29", lastSaturdayOf(2026, 8) === "2026-08-29");
check("random Wednesday rejected", batchKindForDate("2026-08-05") === null);
check("hawan detection from live schedule rules = Sarv Rog only",
  hawanIds.length === 1 && hawanIds[0] === "s6");

// ── 2. Membership — August 2026 (Tue 4th, Sat 29th) ───────────
console.log("\n— Membership (Aug 2026: Tue 04, Sat 29) —");
const subs = [
  { id: "sub-basic-old", plan_id: "p-basic", status: "active", start_date: "2026-07-10", created_at: "2026-07-10" },
  { id: "sub-basic-late", plan_id: "p-basic", status: "active", start_date: "2026-08-10", created_at: "2026-08-10" }, // after Tue 4 → catch-up
  { id: "sub-basic-ontue", plan_id: "p-basic", status: "active", start_date: "2026-08-04", created_at: "2026-08-04" }, // joined ON first Tuesday
  { id: "sub-prem-old", plan_id: "p-premium", status: "active", start_date: "2026-07-05", created_at: "2026-07-05" },
  { id: "sub-prem-late", plan_id: "p-premium", status: "active", start_date: "2026-08-15", created_at: "2026-08-15" }, // mid-month premium
  { id: "sub-annual", plan_id: "p-annual", status: "active", start_date: null, created_at: "2026-08-01T09:00:00Z" }, // created_at fallback
  { id: "sub-paused", plan_id: "p-premium", status: "paused", start_date: "2026-07-01", created_at: "2026-07-01" },
  { id: "sub-cancelled", plan_id: "p-basic", status: "cancelled", start_date: "2026-07-01", created_at: "2026-07-01" },
  { id: "sub-future", plan_id: "p-premium", status: "active", start_date: "2026-09-01", created_at: "2026-09-01" }, // joins after batch day
  { id: "sub-basic-verylate", plan_id: "p-basic", status: "active", start_date: "2026-08-30", created_at: "2026-08-30" }, // after last Sat
];

const tueMembers = computeBatchMembership({
  kind: "first_tuesday", batchDate: "2026-08-04",
  subscriptions: subs, planSevas, hawanSevaIds: hawanIds,
});
const tueIds = tueMembers.map((m) => m.subscription_id);
check("List A = ALL active subscribers joined by batch day (4)",
  tueIds.length === 4 &&
  ["sub-basic-old", "sub-basic-ontue", "sub-prem-old", "sub-annual"].every((id) => tueIds.includes(id)));
check("List A excludes paused/cancelled", !tueIds.includes("sub-paused") && !tueIds.includes("sub-cancelled"));
check("List A excludes future joiner + after-Tuesday joiners",
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
check("Tuesday yields exactly ONE variant row (null)",
  variantsForKind("first_tuesday").length === 1 && variantsForKind("first_tuesday")[0] === null);
check("Saturday yields TWO separate rows (hawan_only + full_package)",
  JSON.stringify(variantsForKind("last_saturday")) === JSON.stringify(["hawan_only", "full_package"]));
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
  sevasForMember({ variant: null, planId: "p-premium", planSevas, sevas, saturdayHawanSevaIds: hawanIds }),
);
const assigned12 = assignSegmentsTierPure(
  Array.from({ length: 12 }, (_, i) => ({ subscription_id: `prem-${i}`, tierKey: premKey })),
);
const sizes12 = [1, 2, 3].map((n) => assigned12.filter((a) => a.segment_number === n).length);
check("12 same-tier subs → 3 segments of 5, 5, 2",
  assigned12.length === 12 && sizes12.join(",") === "5,5,2");

// Tier purity: Basic and Premium subscribers must NEVER share a segment
const basicKey = tierKeyForMember(
  sevasForMember({ variant: null, planId: "p-basic", planSevas, sevas, saturdayHawanSevaIds: hawanIds }),
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
  sevasForMember({ variant: null, planId: "p-annual", planSevas, sevas, saturdayHawanSevaIds: hawanIds }),
);
check("Premium and Premium Annual share a tier key (identical live composition)",
  annualKey === premKey);

// Catch-up Basic in a full_package batch gets a DIFFERENT tier key
// than full-package Premium — can never land in the same segment
const catchupKey = tierKeyForMember(
  sevasForMember({ variant: "full_package", planId: "p-basic", planSevas, sevas, saturdayHawanSevaIds: hawanIds, isCatchup: true }),
);
const fullPremKey = tierKeyForMember(
  sevasForMember({ variant: "full_package", planId: "p-premium", planSevas, sevas, saturdayHawanSevaIds: hawanIds }),
);
check("catch-up Basic tier key ≠ full-package Premium tier key (hawan excluded)",
  catchupKey !== fullPremKey);

// ── 5. Per-member seva resolution ─────────────────────────────
console.log("\n— Seva resolution per member —");
const namesOf = (list: { name: string }[]) => list.map((s) => s.name).join(",");
check("Tuesday Basic → 3 non-hawan sevas",
  namesOf(sevasForMember({ variant: null, planId: "p-basic", planSevas, sevas, saturdayHawanSevaIds: hawanIds }))
    === "Sundarkand Path,Gau Seva,Vanar Seva");
check("Tuesday Premium → all 6 (incl. Griha Shanti Hawan)",
  sevasForMember({ variant: null, planId: "p-premium", planSevas, sevas, saturdayHawanSevaIds: hawanIds }).length === 6);
check("hawan_only → ONLY Sarv Rog Nivaran Hawan",
  namesOf(sevasForMember({ variant: "hawan_only", planId: "p-premium", planSevas, sevas, saturdayHawanSevaIds: hawanIds }))
    === "Sarv Rog Nivaran Hawan");
check("full_package premium → all 6 sevas",
  sevasForMember({ variant: "full_package", planId: "p-premium", planSevas, sevas, saturdayHawanSevaIds: hawanIds }).length === 6);
check("full_package CATCH-UP Basic → 3 sevas, NO hawan added",
  namesOf(sevasForMember({ variant: "full_package", planId: "p-basic", planSevas, sevas, saturdayHawanSevaIds: hawanIds, isCatchup: true }))
    === "Sundarkand Path,Gau Seva,Vanar Seva");

// ── 6. Pandit grouping + PII firewall ─────────────────────────
console.log("\n— Pandit grouping —");
const panditGroups = groupForPandit([
  { subscription_id: "sub-prem-old", is_catchup: false,
    sevas: sevasForMember({ variant: "full_package", planId: "p-premium", planSevas, sevas, saturdayHawanSevaIds: hawanIds }),
    names: [{ name: "Mohan Verma", gotra: "Vashisht" }] },
  { subscription_id: "sub-basic-late", is_catchup: true,
    sevas: sevasForMember({ variant: "full_package", planId: "p-basic", planSevas, sevas, saturdayHawanSevaIds: hawanIds, isCatchup: true }),
    names: [{ name: "Ramesh Sharma", gotra: "Bharadwaj" }, { name: "Sita Sharma", gotra: null }] },
]);
check("catch-up Basic family lands in its OWN group (never mixed into full-package)",
  panditGroups.length === 2);
check("catch-up group has 3 sevas, premium group has 6",
  panditGroups.some((g) => g.sevas.length === 3 && g.catchupCount === 1) &&
  panditGroups.some((g) => g.sevas.length === 6 && g.catchupCount === 0));
check("names carry ONLY name + gotra (no phone/plan/price fields exist)",
  panditGroups.every((g) => g.names.every((n) => Object.keys(n).sort().join(",") === "gotra,name")));

// ── 7. WhatsApp stub ──────────────────────────────────────────
console.log("\n— WhatsApp stub —");
check("10-digit phone → 91 prefix", normalizePhoneForWa("98765 43210") === "919876543210");
check("+91 formatted phone preserved", normalizePhoneForWa("+91-9876543210") === "919876543210");
const link = buildWaLink("9876543210", "Namaste 🙏 test");
check("wa.me link is well-formed + encoded",
  link.startsWith("https://wa.me/919876543210?text=") && link.includes("Namaste"));
const msg = buildDeliveryMessage({ sevaNames: ["Sundarkand Path"], batchLabelText: "First Tuesday Sankalp — 4 August 2026", videoUrl: "https://res.cloudinary.com/x/video.mp4" });
check("ONE message: references sevas + combined video, no plan/price",
  msg.includes("Sundarkand Path") && msg.includes("video.mp4") && !/₹|Basic|Premium/.test(msg));
check("message mentions combined seva+naam video (single-asset model)",
  msg.includes("naam-sankalp ka video"));

// ── Result ────────────────────────────────────────────────────
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
