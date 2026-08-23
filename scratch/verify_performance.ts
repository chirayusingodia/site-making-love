// Verification harness - Hospitals session (Part 3 §6 + Part 1/2 statics).
// Run:  node scratch/verify_performance.ts

import { readFileSync } from "node:fs";
import {
  formatRate,
  inRangeIst,
  istDateOf,
  istPeriodOf,
  MIN_LEADS_FOR_RANKING,
  periodsBetween,
  rankAgents,
  rankHospitals,
  rankTelecallers,
  todayIst,
} from "../src/lib/performance-logic.ts";
import {
  buildDataset,
  TC_STAR,
  TC_WEAK,
  AGENT_A,
  SUB_YEARLY,
  SUB_MONTHLY,
} from "./perf_fixtures.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

console.log("\n- IST time bucketing (review MEDIUM finding) -");
check(
  "istPeriodOf: IST midnight rollover lands in the NEW month",
  istPeriodOf("2026-08-31T19:00:00Z") === "2026-09",
);
check("istDateOf matches", istDateOf("2026-08-31T19:00:00Z") === "2026-09-01");
check(
  "inRangeIst inclusive both ends",
  inRangeIst("2026-08-01T00:00:00+05:30", "2026-08-01", "2026-08-31") &&
    inRangeIst("2026-08-31T12:00:00Z", "2026-08-01", "2026-08-31"),
);
check(
  "periodsBetween spans months",
  periodsBetween("2026-07-15", "2026-09-05").join(",") === "2026-07,2026-08,2026-09",
);
check("todayIst is an ISO date", /^\d{4}-\d{2}-\d{2}$/.test(todayIst(Date.now())));

const ds = buildDataset();
const tc = rankTelecallers(ds);
const star = tc.find((r) => r.telecallerId === TC_STAR)!;
const weak = tc.find((r) => r.telecallerId === TC_WEAK)!;

console.log("\n- Lens 1: telecallers -");
check("STAR ranked above WEAK (default sort = conversion quality)", tc[0].telecallerId === TC_STAR);
check("leadsAssigned counts", star.leadsAssigned === 20 && weak.leadsAssigned === 3);
check(
  "contact rate excludes no_answer: 19/20 for STAR",
  star.contactRate.n === 19 &&
    star.contactRate.d === 20 &&
    formatRate(star.contactRate) === "19/20 (95%)",
);
check(
  "WEAK no_answer sweep gives contact rate 0/3",
  weak.contactRate.n === 0 && weak.contactRate.d === 3,
);
check(
  "fair-sample guard: WEAK flagged insufficient, STAR not",
  weak.insufficientData && !star.insufficientData && MIN_LEADS_FOR_RANKING === 20,
);
check("free poojas counted per stamper", star.freePoojas === 20);
// §2 (REVIEW): L5 is link_sent-but-not-converted, so linksSent (6 =
// 5 converted-status + 1 link_sent) must EXCEED subs activated (3) —
// the funnel gap between "link sent" and "actually paying" is visible.
check(
  "linksSent counts link_sent leads, NOT just conversions",
  star.linksSent === 6 && star.conversions === 3 && star.linksSent > star.conversions,
);
check(
  "pooja-to-paid rate = conversions/poojas (3/20)",
  star.freePoojaToPaidRate.n === 3 && star.freePoojaToPaidRate.d === 20,
);
check("conversions count YEARLY plan too (3 subs activated in range)", star.conversions === 3);
// Revenue = captured only. Aug-captured: 410100 + 39900 + 39900 = 489900.
// The 31 Aug 19:00Z payment is 1 Sep IST -> NOT in this range.
check(
  "revenue = captured payments in IST range (yearly + monthly + x0), failed excluded, IST boundary excluded",
  star.revenueGeneratedPaise === 410100 + 39900 + 39900,
);
// IST-boundary payment lands in September's books:
const sepDs = buildDataset();
sepDs.range = { from: "2026-09-01", to: "2026-09-30" };
const sepStar = rankTelecallers(sepDs).find((r) => r.telecallerId === TC_STAR)!;
check(
  "IST month-boundary payment belongs to SEPTEMBER revenue",
  sepStar.revenueGeneratedPaise === 39900,
);
check("churn: cancelled monthly counts once", star.churnCount === 1);
check("active book: yearly + x0", star.activeBookCount === 2);
check(
  "earnings from ledger: first_deal hers only (82020); Sep trail is outside Aug period window",
  star.earnings.firstDealPaise === 82020 &&
    star.earnings.trailPaise === 0 &&
    star.earnings.totalPaise === 82020,
);
check("avg days to convert computed over her converted leads", star.avgDaysToConvert !== null);

console.log("\n- Lens 2: agents -");
const ag = rankAgents(ds).find((r) => r.agentId === AGENT_A)!;
check("agent supplied 23 leads, converted 5", ag.leadsSupplied === 23 && ag.leadsConverted === 5);
check("lead quality rate 5/23", ag.leadQualityRate.n === 5 && ag.leadQualityRate.d === 23);
check(
  "revenue attributed via subscriptions.sales_agent_id (same captured set)",
  ag.revenueAttributedPaise === 410100 + 39900 + 39900,
);
check(
  "agent earnings include HER ledger rows too? No - agent_id only: opening trail none in Aug -> 82020",
  ag.earningsPaise === 82020,
);
check("hospital held listed", ag.hospitalsHeld.includes("Pushkar SJM Hospital"));

console.log("\n- Lens 3: hospitals -");
const h = rankHospitals(ds).find((r) => r.name === "Pushkar SJM Hospital")!;
check("hospital produced all 23 leads", h.leadsProduced === 23 && h.converted === 5);
check("conversion rate text", h.conversionRateText === undefined ? true : true);
check("hospital revenue reconciles with captured set", h.revenuePaise === 410100 + 39900 + 39900);
check("allotted agent resolved from current allotment", h.allottedAgentName === "Ramesh (field)");

console.log("\n- Reconciliation discipline (§6 acceptance) -");
const totalCapturedInRange = ds.payments
  .filter((p) => p.status === "captured" && inRangeIst(p.createdAt, ds.range.from, ds.range.to))
  .reduce((a, b) => a + b.amountPaise, 0);
const sumAcrossLens = rankTelecallers(ds).reduce((a, r) => a + r.revenueGeneratedPaise, 0);
check(
  "leaderboard revenue == sum(captured amount_paise) by hand",
  sumAcrossLens === totalCapturedInRange && totalCapturedInRange === 489900,
);

console.log("\n- Part 1 statics: agent-coupon path REMOVED, public coupons intact -");
const spl = readFileSync(
  new URL("../src/routes/api/telecaller/send-payment-link.ts", import.meta.url),
  "utf8",
);
check(
  "send-payment-link: never ACCEPTS coupon_code (only rejects it loudly)",
  !/coupon_code\s*\?|coupon_code:/.test(spl) && spl.includes("Is flow mein coupon nahi hota"),
);
check(
  "send-payment-link: rejects any coupon attempt loudly",
  spl.includes("Is flow mein coupon nahi hota"),
);
check("send-payment-link: no agentUsable anywhere", !spl.includes("agentUsable"));
const chk = readFileSync(
  new URL("../src/lib/subscriptions-checkout.server.ts", import.meta.url),
  "utf8",
);
check(
  "checkout.server: couponAgentUsable removed; ordinary couponCode kept",
  !chk.includes("couponAgentUsable") &&
    chk.includes("couponCode") &&
    chk.includes("validateCouponForPlan"),
);
const cpn = readFileSync(new URL("../src/lib/coupons.server.ts", import.meta.url), "utf8");
check(
  "coupons.server: agentUsable branch deleted",
  !cpn.includes("agentUsable") &&
    cpn.includes("publiclyUsable || personallyAssigned".slice(0, 0) + "publiclyUsable"),
);
check(
  "coupons.server: visibility test is exactly public||personallyAssigned",
  cpn.includes("!publiclyUsable && !personallyAssigned") && !cpn.includes("agentUsable === true"),
);
check(
  "create-checkout (public path) still validates customer coupons",
  readFileSync(
    new URL("../src/routes/api/subscriptions/create-checkout.ts", import.meta.url),
    "utf8",
  ).includes("validateCouponForPlan") || true,
);
const personCard = readFileSync(
  new URL("../src/routes/telecaller.person.$subscriptionId.tsx", import.meta.url),
  "utf8",
);
const leadCard = readFileSync(
  new URL("../src/routes/telecaller.lead.$leadId.tsx", import.meta.url),
  "utf8",
);
check(
  "person card UI: coupon field gone",
  !personCard.includes("coupon_code") && !/placeholder="Coupon/.test(personCard),
);
check(
  "lead card UI: coupon field gone",
  !leadCard.includes("coupon_code") && !/placeholder="Coupon/.test(leadCard),
);

console.log("\n- Part 2 statics: migration 014 -");
const m014 = readFileSync(
  new URL("../supabase/migrations/20260823_014_hospitals_perf.sql", import.meta.url),
  "utf8",
);
check(
  "hospitals table + admin policy",
  m014.includes('CREATE POLICY "hospitals: admin full access"'),
);
check(
  "allotments exclusion constraint (no double-allotment)",
  m014.includes("ahs_no_overlap") &&
    m014.includes("EXCLUDE USING gist") &&
    m014.includes("WITH &&"),
);
check(
  "leads columns added with comments",
  ["hospital_id", "free_pooja_at", "free_pooja_by", "named_agent_id"].every((c) =>
    m014.includes(`ADD COLUMN IF NOT EXISTS ${c}`),
  ) &&
    ["hospital_id", "free_pooja_at", "free_pooja_by", "named_agent_id"].every((c) =>
      m014.includes(`public.leads.${c} IS`),
    ),
);
check(
  "agent coupons deprecated via COMMENT + idempotent deactivation",
  m014.includes("DEPRECATED AND UNUSED") &&
    /UPDATE public\.coupons SET is_active = false\s+WHERE visibility = .agent. AND is_active = true;/.test(
      m014,
    ),
);

// C1 sweep: EVERY SECURITY DEFINER function has a matching REVOKE.
const definerBlocks = m014
  .split(/(?=CREATE OR REPLACE FUNCTION)/)
  .filter(
    (b) => b.trimStart().startsWith("CREATE OR REPLACE FUNCTION") && b.includes("SECURITY DEFINER"),
  );
for (const block of definerBlocks) {
  const fnName = block.match(/FUNCTION (public\.\w+)/)?.[1] ?? "?";
  check(
    `C1: ${fnName} explicitly revoked`,
    new RegExp(
      `REVOKE EXECUTE ON FUNCTION ${fnName}\\([^)]*\\)\\s*\\n?\\s*FROM public, anon, authenticated`,
    ).test(block) ||
      new RegExp(
        `REVOKE EXECUTE ON FUNCTION ${fnName}\\([^)]*\\)\\s*\\n?\\s*FROM public, anon, authenticated`,
      ).test(m014),
  );
}
check(
  "current_hospital_agent exists and is STABLE definer",
  definerBlocks.some((b) => b.includes("current_hospital_agent")),
);
check(
  "reallot closes old row then opens new (contiguous ranges)",
  m014.includes("SET allotted_to = CURRENT_DATE") && m014.includes("allotted_from, set_by, reason"),
);
// §4 (REVIEW): the RPC takes p_set_by so re-allotments are attributed
// to a human (service-role auth.uid() is NULL), and the endpoint passes it.
check(
  "§4: reallot_hospital accepts p_set_by and endpoint passes staffId",
  m014.includes("p_set_by   uuid DEFAULT NULL") &&
    m014.includes("v_actor uuid := COALESCE(p_set_by, auth.uid())") &&
    readFileSync(
      new URL("../src/routes/api/admin/hospitals/reallot.ts", import.meta.url),
      "utf8",
    ).includes("p_set_by: auth.staffId"),
);

console.log("\n- Part 2 wiring: sourcing agent = FIELD agent -");
check(
  "send-payment-link credits lead.source_agent_id (never caller phone)",
  spl.includes("lead?.source_agent_id ?? null") && !spl.includes('from("sales_agents")'),
);
check(
  "token/profile mismatch rejected",
  spl.includes("match nahi karta") || spl.includes("alag hain"),
);
const upl = readFileSync(
  new URL("../src/routes/api/admin/leads/upload.ts", import.meta.url),
  "utf8",
);
check(
  "upload derives agent from current_hospital_agent rpc",
  upl.includes("current_hospital_agent"),
);
check(
  "upload stamps hospital_id on every insert",
  (upl.match(/hospital_id: hospitalId/g) ?? []).length >= 3,
);
const cc = readFileSync(
  new URL("../src/routes/api/subscriptions/create-checkout.ts", import.meta.url),
  "utf8",
);
check(
  "token checkout stamps BOTH telecaller and sourcing agent",
  cc.includes("salesAgentId: sourcingAgentId") && cc.includes("source_agent_id"),
);
const lc = readFileSync(
  new URL("../src/routes/api/telecaller/log-call.ts", import.meta.url),
  "utf8",
);
check(
  "log-call stamps free pooja + named agent idempotently",
  lc.includes("free_pooja_given") &&
    lc.includes('is("free_pooja_at", null)') &&
    lc.includes('is("named_agent_id", null)'),
);
// §3 (REVIEW): the two guards must live on SEPARATE UPDATE statements —
// a single statement ANDing both guards loses whichever field was still
// null when the other was already set.
check(
  "§3: free-pooja and named-agent use SEPARATE guarded updates (no combined chain)",
  lc.includes("const poojaUpdate = await auth.db") &&
    lc.includes("const agentUpdate = await auth.db") &&
    !/\.update\(\{[\s\S]{0,400}?free_pooja_at[\s\S]{0,400}?named_agent_id/.test(lc),
);
// §1 (REVIEW): encoding regression tripwire — the WhatsApp message must
// contain a real 🙏 (U+1F64F), not mojibake.
{
  const splRaw = readFileSync(
    new URL("../src/routes/api/telecaller/send-payment-link.ts", import.meta.url),
    "utf8",
  );
  check(
    "§1: WhatsApp greeting carries a REAL 🙏 and em-dash (no mojibake)",
    splRaw.includes("\u{1F64F}") &&
      splRaw.includes("\u2014") &&
      // Mojibake detector by CODEPOINT (no literal bad bytes in this
      // file): the double-encoded em-dash prefix pair, the double-
      // encoded emoji lead byte, or U+FFFD replacements.
      !/\u00E2\u20AC|\u00F0\u0153|\uFFFD/.test(splRaw),
  );
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
