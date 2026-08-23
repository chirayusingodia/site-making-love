// Tenure-fix census — answers "how many existing subscriptions carry
// the OLD short total_count (12 monthly / 5 yearly)?" so Chirayu can
// decide: contact Razorpay support vs let old mandates ride out.
//
// Run:
//   node --env-file=.env --import ./scratch/ts-aliases.mjs scratch/report_subscription_tenure.ts
//
// View A (always available): our DB — every subscriptions row with a
//   razorpay_sub_id created BEFORE the fix date has the old tenure
//   (the old code hardcoded it; there was no other path).
// View B (needs RAZORPAY_KEY_ID/SECRET in env): Razorpay's OWN entity
//   response grouped by actual total_count — ground truth.

import process from "node:process";
import { getServiceClient } from "../src/lib/supabase-admin.server.ts";

const TENURE_FIX_DATE = "2026-08-23"; // this session's fix date

interface SubRow {
  id: string;
  status: string;
  created_at: string;
  cancelled_at: string | null;
  razorpay_sub_id: string | null;
  plan_id: string | null;
}

async function main(): Promise<void> {
  const db = getServiceClient();
  const { data: plans } = await db.from("plans").select("id,billing_period");
  const periodOf = new Map((plans ?? []).map((p) => [p.id, p.billing_period]));

  const { data: subs, error } = await db
    .from("subscriptions")
    .select("id,status,created_at,cancelled_at,razorpay_sub_id,plan_id")
    .not("razorpay_sub_id", "is", null)
    .order("created_at");
  if (error) throw new Error(`subscriptions query failed: ${error.message}`);
  const rows = (subs ?? []) as SubRow[];

  console.log("=== VIEW A — Punyata DB census (linked Razorpay subscriptions) ===");
  console.log(`total linked: ${rows.length}`);
  if (rows.length === 0) {
    console.log("→ No existing subscriptions. Nothing carries the old short mandate.");
    return;
  }

  const preFix = rows.filter((r) => r.created_at < `${TENURE_FIX_DATE}T00:00:00Z`);
  const postFix = rows.filter((r) => r.created_at >= `${TENURE_FIX_DATE}T00:00:00Z`);
  const liveish = (r: SubRow) =>
    !["cancelled", "expired", "completed"].includes(r.status) && !r.cancelled_at;

  console.log(`created BEFORE ${TENURE_FIX_DATE} (old short total_count): ${preFix.length}`);
  console.log(
    `  of them still live (not cancelled/expired/completed): ${preFix.filter(liveish).length}`,
  );
  console.log(`created ON/AFTER ${TENURE_FIX_DATE}: ${postFix.length}`);

  const byPeriod = new Map<string, number>();
  for (const r of preFix.filter(liveish)) {
    const key = periodOf.get(r.plan_id ?? "") ?? "unknown-plan";
    byPeriod.set(key, (byPeriod.get(key) ?? 0) + 1);
  }
  for (const [k, v] of byPeriod) {
    const cycles = k === "yearly" ? 5 : 12;
    console.log(`  live ${k} mandates with OLD tenure (${cycles} cycles): ${v}`);
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret) {
    console.log("\n=== VIEW B skipped — RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not in env ===");
    console.log("Set them (test-mode keys are fine) and re-run to group by Razorpay's");
    console.log("actual entity-level total_count instead of the creation-date proxy.");
  } else {
    console.log("\n=== VIEW B — Razorpay entity truth (grouped by real total_count) ===");
    const auth = `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`;
    const counts = new Map<string, { n: number; statuses: Map<string, number> }>();
    for (let skip = 0; ; skip += 100) {
      const res = await fetch(`https://api.razorpay.com/v1/subscriptions?limit=100&skip=${skip}`, {
        headers: { authorization: auth },
      });
      const page = (await res.json()) as {
        items?: Array<{ id: string; total_count: number; status: string }>;
      };
      const items = page.items ?? [];
      for (const s of items) {
        const key = String(s.total_count);
        const bucket = counts.get(key) ?? { n: 0, statuses: new Map() };
        bucket.n++;
        bucket.statuses.set(s.status, (bucket.statuses.get(s.status) ?? 0) + 1);
        counts.set(key, bucket);
      }
      if (items.length < 100) break;
    }
    if (counts.size === 0) console.log("(no subscriptions found on this Razorpay account)");
    for (const [tc, b] of [...counts.entries()].sort((x, y) => Number(y[0]) - Number(x[0]))) {
      const st = [...b.statuses.entries()].map(([k, v]) => `${k}:${v}`).join(", ");
      console.log(`  total_count=${tc.padStart(5)}  →  ${b.n} subscription(s)  [${st}]`);
    }
    console.log("\n1200/100 buckets = fixed tenure. 12/5 buckets = old mandates.");
  }

  console.log(`
NEXT STEP (Chirayu): if any LIVE pre-fix mandates show up above, either
  a) ask Razorpay support to extend those specific subscriptions' tenure, or
  b) accept they end on their original date — affected subscribers get a
     fresh checkout link when it happens (admin reissue-link flow exists).
New signups are unaffected: createCheckoutForUser now derives 1200/100.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
