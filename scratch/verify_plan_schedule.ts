// Exercises the REAL derivation in src/lib/plans-schedule.ts (not a copy of it)
// against the live seed data, post-migrations 008/009.
import {
  buildLiveSeva,
  buildSevaComparison,
  scheduleForPlan,
  sevaFeatureLines,
  type LiveSeva,
  type SevaRowLite,
  type ScheduleRuleLite,
} from "../src/lib/plans-schedule.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

// ── Fixtures: mirror supabase/migrations/20260725_001 seed + 008 shift ──
const sevas: SevaRowLite[] = [
  { id: "c1", name: "Sundarkand Path", slug: "sundarkand-path", description: null },
  { id: "c2", name: "Gau Seva", slug: "gau-seva", description: null },
  { id: "c3", name: "Vanar Seva", slug: "vanar-seva", description: null },
  { id: "c4", name: "Saadhu Santo Ko Bhojan", slug: "saadhu-santo-ko-bhojan", description: null },
  { id: "c5", name: "Griha Shanti Hawan", slug: "griha-shanti-hawan", description: null },
  { id: "c6", name: "Sarv Rog Nivaran Hawan", slug: "sarv-rog-nivaran-hawan", description: null },
];
const rules: ScheduleRuleLite[] = [
  { seva_id: "c1", weekday: "TUE", occurrence: "second" },
  { seva_id: "c2", weekday: "TUE", occurrence: "second" },
  { seva_id: "c3", weekday: "TUE", occurrence: "second" },
  { seva_id: "c4", weekday: "TUE", occurrence: "second" },
  { seva_id: "c4", weekday: "SAT", occurrence: "last" },
  { seva_id: "c5", weekday: "TUE", occurrence: "second" },
  { seva_id: "c6", weekday: "SAT", occurrence: "last" },
];
const PLANS: Record<string, string[]> = {
  "Basic (Rs 251)": ["c1", "c2", "c3"],
  "Premium (Rs 399)": ["c1", "c2", "c3", "c4", "c5", "c6"],
  "Premium Annual (Rs 4101)": ["c1", "c2", "c3", "c4", "c5", "c6"],
};

const liveSevas: LiveSeva[] = sevas.map((s) => buildLiveSeva(s, rules));
const scoped = (ids: string[]) => scheduleForPlan(liveSevas.filter((s) => ids.includes(s.id)));

// ── 1. Day labels on the plan page card ──────────────────────
console.log("— Plan page: per-seva day labels —");
const EXPECT_DAYS: Record<string, Record<string, string>> = {
  "Basic (Rs 251)": {
    "Sundarkand Path": "2nd Tuesday",
    "Gau Seva": "2nd Tuesday",
    "Vanar Seva": "2nd Tuesday",
  },
  "Premium (Rs 399)": {
    "Sundarkand Path": "2nd Tuesday & Last Saturday",
    "Gau Seva": "2nd Tuesday & Last Saturday",
    "Vanar Seva": "2nd Tuesday & Last Saturday",
    "Saadhu Santo Ko Bhojan": "2nd Tuesday & Last Saturday",
    "Griha Shanti Hawan": "2nd Tuesday",
    "Sarv Rog Nivaran Hawan": "Last Saturday",
  },
};
EXPECT_DAYS["Premium Annual (Rs 4101)"] = EXPECT_DAYS["Premium (Rs 399)"];

for (const [plan, ids] of Object.entries(PLANS)) {
  for (const s of scoped(ids)) {
    check(`${plan} — ${s.name}: ${EXPECT_DAYS[plan][s.name]}`,
      s.days.join(" & ") === EXPECT_DAYS[plan][s.name]);
  }
}

// ── 2. Comparison table frequencies (the ✓ + "N times a month") ──
console.log("\n— Comparison table: frequency per plan column —");
const EXPECT_FREQ: Record<string, Record<string, string | false>> = {
  "Basic (Rs 251)": {
    "sundarkand-path": "1 time a month",
    "gau-seva": "1 time a month",
    "vanar-seva": "1 time a month",
    "saadhu-santo-ko-bhojan": false,
    "griha-shanti-hawan": false,
    "sarv-rog-nivaran-hawan": false,
  },
  "Premium (Rs 399)": {
    "sundarkand-path": "2 times a month",
    "gau-seva": "2 times a month",
    "vanar-seva": "2 times a month",
    "saadhu-santo-ko-bhojan": "2 times a month",
    "griha-shanti-hawan": "1 time a month",
    "sarv-rog-nivaran-hawan": "1 time a month",
  },
};
EXPECT_FREQ["Premium Annual (Rs 4101)"] = EXPECT_FREQ["Premium (Rs 399)"];

for (const [plan, ids] of Object.entries(PLANS)) {
  const cmp = buildSevaComparison(liveSevas, scoped(ids));
  for (const [slug, want] of Object.entries(EXPECT_FREQ[plan])) {
    const cell = cmp[slug];
    const got = cell.has ? (cell.frequency ?? "(no frequency)") : false;
    check(`${plan} — ${slug}: ${want === false ? "✗ not included" : want}`, got === want);
  }
}

// ── 3. Cross-check: the two views can never disagree ─────────
console.log("\n— Consistency —");
for (const [plan, ids] of Object.entries(PLANS)) {
  const sc = scoped(ids);
  const cmp = buildSevaComparison(liveSevas, sc);
  check(`${plan}: every seva's day count matches its comparison frequency`,
    sc.every((s) => {
      const n = s.days.length;
      const want = n === 1 ? "1 time a month" : `${n} times a month`;
      return cmp[s.slug].frequency === want;
    }));
  check(`${plan}: feature bullets list the same days as the seva card`,
    sevaFeatureLines(sc).length === sc.length &&
      sc.every((s, i) => s.days.every((d) => sevaFeatureLines(sc)[i].includes(d))));
}

// ── 4. No hawan is ever twice a month ────────────────────────
const premScoped = scoped(PLANS["Premium (Rs 399)"]);
check("no hawan is ever billed as twice a month",
  premScoped.filter((s) => /hawan/i.test(s.name)).every((s) => s.days.length === 1));
check("all four non-hawan Premium sevas are twice a month",
  premScoped.filter((s) => !/hawan/i.test(s.name)).every((s) => s.days.length === 2));

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
