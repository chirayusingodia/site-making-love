// One-time backfill — unify per-member `gotra` into ONE value per
// family, matching the product model (gotra is patrilineal, asked
// ONCE — components/profile-completion.tsx — not per member).
//
// Companion to the source fix in
// src/routes/telecaller.person.$subscriptionId.tsx (the telecaller
// call-card used to ask gotra per slot; a caller who only filled
// slot 1 left slots 2-4 with a null gotra on an otherwise-complete
// 4/4 family). That null gotra is exactly what hasGotraGap() checks
// (src/lib/telecaller-logic.ts), so those families kept surfacing in
// the `cutoff_risk` queue with no visible reason. The UI is fixed;
// this backfill cleans up the rows that were already mismatched.
//
// For each subscription's family_members:
//   - Collect the DISTINCT non-blank gotra values across its rows.
//   - 0 distinct values  → nothing to do (nobody has entered one).
//   - 1 distinct value   → UNAMBIGUOUS: every blank-gotra row in that
//                          family is set to that value.
//   - 2+ distinct values → CONFLICT: rows genuinely disagree (e.g. two
//                          different callers each typed something).
//                          Never guessed — reported only, left alone
//                          for a human to resolve on the call-card.
//
// Run (DRY-RUN, reports only — safe, no writes):
//   node --env-file=.env --import ./scratch/ts-aliases.mjs scratch/backfill_family_gotra.ts
// Run (APPLY the change):
//   node --env-file=.env --import ./scratch/ts-aliases.mjs scratch/backfill_family_gotra.ts --apply

import process from "node:process";
import { getServiceClient } from "../src/lib/supabase-admin.server.ts";

interface MemberRow {
  id: string;
  subscription_id: string;
  full_name: string;
  gotra: string | null;
  relation: string | null;
  slot_number: number;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const db = getServiceClient();

  const { data, error } = await db
    .from("family_members")
    .select("id,subscription_id,full_name,gotra,relation,slot_number")
    .order("subscription_id")
    .order("slot_number");
  if (error) throw new Error(`family_members query failed: ${error.message}`);
  const rows = (data ?? []) as MemberRow[];

  const bySub = new Map<string, MemberRow[]>();
  for (const r of rows) {
    const list = bySub.get(r.subscription_id) ?? [];
    list.push(r);
    bySub.set(r.subscription_id, list);
  }

  const toFix: { row: MemberRow; gotra: string }[] = [];
  const conflicts: { subscriptionId: string; values: string[]; rows: MemberRow[] }[] = [];

  for (const [subscriptionId, members] of bySub) {
    if (members.length < 2) continue; // nothing to reconcile with a single slot

    const distinct = [...new Set(members.map((m) => m.gotra?.trim()).filter((g): g is string => !!g))];

    if (distinct.length === 0) continue; // nobody has a gotra — leave as-is
    if (distinct.length > 1) {
      conflicts.push({ subscriptionId, values: distinct, rows: members });
      continue;
    }

    const gotra = distinct[0];
    for (const m of members) {
      if (!m.gotra || !m.gotra.trim()) toFix.push({ row: m, gotra });
    }
  }

  console.log(`total family_members rows:   ${rows.length}`);
  console.log(`subscriptions with >1 slot:  ${[...bySub.values()].filter((v) => v.length > 1).length}`);
  console.log(`rows to backfill (unambiguous): ${toFix.length}`);
  console.log(`subscriptions with CONFLICTING gotra (skipped): ${conflicts.length}`);

  if (conflicts.length > 0) {
    console.log("\nConflicts — needs a human call, NOT auto-fixed:");
    for (const c of conflicts) {
      console.log(`  subscription=${c.subscriptionId}  values=[${c.values.join(", ")}]`);
      for (const m of c.rows) {
        console.log(`    slot ${m.slot_number}: "${m.full_name}" gotra=${m.gotra ?? "(blank)"}`);
      }
    }
  }

  if (toFix.length === 0) {
    console.log("\n→ Nothing unambiguous to backfill.");
    return;
  }

  console.log("\nRows to set:");
  for (const { row, gotra } of toFix) {
    console.log(
      `  ${row.id}  subscription=${row.subscription_id}  slot=${row.slot_number}  "${row.full_name}"  → gotra="${gotra}"`,
    );
  }

  if (!apply) {
    console.log("\nDRY-RUN — no writes. Re-run with --apply to backfill these rows.");
    return;
  }

  let applied = 0;
  for (const { row, gotra } of toFix) {
    // Per-row update, guarded on the gotra still being blank — skips
    // anything a telecaller/customer filled in between the read above
    // and this write instead of clobbering a fresh edit.
    const { data: updated, error: updErr } = await db
      .from("family_members")
      .update({ gotra })
      .eq("id", row.id)
      .or("gotra.is.null,gotra.eq.")
      .select("id");
    if (updErr) {
      console.error(`  FAILED ${row.id}: ${updErr.message}`);
      continue;
    }
    if (updated && updated.length > 0) applied++;
  }

  console.log(`\nAPPLIED — backfilled ${applied}/${toFix.length} row(s).`);

  const auditRows = toFix.map(({ row, gotra }) => ({
    admin_id: null,
    action: "family_members.backfill_shared_gotra",
    entity: "family_members",
    entity_id: row.id,
    meta: {
      reason: "backfill: unify per-member gotra into one family value",
      script: "backfill_family_gotra",
      subscription_id: row.subscription_id,
      slot_number: row.slot_number,
      gotra,
    },
  }));
  const { error: auditErr } = await db.from("audit_logs").insert(auditRows);
  if (auditErr) console.error("audit log insert failed (rows already backfilled):", auditErr.message);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
