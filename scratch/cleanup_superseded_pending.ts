// One-time backfill — retire LEFTOVER `pending` checkout rows for
// subscribers who already went live.
//
// Companion to the source fix in razorpay-webhook.server.ts
// (expireSupersededPendingSiblings). The webhook now expires a user's
// stray same-plan `pending` rows the moment one of their subscriptions
// activates — but rows that were already orphaned BEFORE that fix (e.g.
// Chirayu, Shrawan: active subscribers still showing in the telecaller
// "Abandoned Checkout" queue) need this backfill once.
//
// A `pending` row is "superseded" when the SAME user has ANOTHER
// subscription FOR THE SAME PLAN that is currently live (active/paused).
// Scope mirrors the webhook and the checkout reuse-lookup exactly
// (user_id + plan_id). A pending row for a different plan, or a user
// with no live sibling, is a genuine open checkout and is left alone.
//
// Marked `expired` (an unpaid checkout that lapsed) — NOT cancelled
// (which would drop a paid subscriber into Recently-Cancelled) and NOT
// deleted (payments.subscription_id is ON DELETE RESTRICT).
//
// Run (DRY-RUN, reports only — safe, no writes):
//   node --env-file=.env --import ./scratch/ts-aliases.mjs scratch/cleanup_superseded_pending.ts
// Run (APPLY the change):
//   node --env-file=.env --import ./scratch/ts-aliases.mjs scratch/cleanup_superseded_pending.ts --apply

import process from "node:process";
import { getServiceClient } from "../src/lib/supabase-admin.server.ts";

interface SubRow {
  id: string;
  user_id: string;
  plan_id: string | null;
  status: string;
  created_at: string;
}

const LIVE_STATUSES = new Set(["active", "paused"]);

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const db = getServiceClient();

  const { data, error } = await db
    .from("subscriptions")
    .select("id,user_id,plan_id,status,created_at")
    .order("created_at");
  if (error) throw new Error(`subscriptions query failed: ${error.message}`);
  const rows = (data ?? []) as SubRow[];

  // Index live subscriptions by user_id + plan_id.
  const liveKeys = new Set<string>();
  for (const r of rows) {
    if (r.plan_id && LIVE_STATUSES.has(r.status)) liveKeys.add(`${r.user_id}::${r.plan_id}`);
  }

  const superseded = rows.filter(
    (r) => r.status === "pending" && r.plan_id && liveKeys.has(`${r.user_id}::${r.plan_id}`),
  );

  console.log(`total subscriptions:        ${rows.length}`);
  console.log(`pending rows:               ${rows.filter((r) => r.status === "pending").length}`);
  console.log(`superseded pending (target): ${superseded.length}`);

  if (superseded.length === 0) {
    console.log("\n→ Nothing to retire. Clean.");
    return;
  }

  console.log("\nRows to mark expired (user already live on the same plan):");
  for (const r of superseded) {
    console.log(`  ${r.id}  user=${r.user_id}  plan=${r.plan_id}  created=${r.created_at}`);
  }

  if (!apply) {
    console.log("\nDRY-RUN — no writes. Re-run with --apply to retire these rows.");
    return;
  }

  const ids = superseded.map((r) => r.id);
  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await db
    .from("subscriptions")
    .update({ status: "expired", updated_at: nowIso })
    .in("id", ids)
    .eq("status", "pending") // guard: skip any that changed since the read
    .select("id");
  if (updErr) throw new Error(`update failed: ${updErr.message}`);

  console.log(`\nAPPLIED — retired ${updated?.length ?? 0} row(s) to status='expired'.`);

  // Audit paper trail, one row per retired subscription.
  const auditRows = (updated ?? []).map((u) => ({
    admin_id: null,
    action: "subscriptions.expire_superseded_pending",
    entity: "subscriptions",
    entity_id: (u as { id: string }).id,
    meta: { reason: "backfill: user already live on same plan", script: "cleanup_superseded_pending" },
  }));
  if (auditRows.length > 0) {
    const { error: auditErr } = await db.from("audit_logs").insert(auditRows);
    if (auditErr) console.error("audit log insert failed (rows already retired):", auditErr.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
