// Imports the owner's roster (plan JSON from gotra_roster_report.ts) as OFFLINE (QR)
// subscribers. DRY-RUN by default — pass --apply to write.
//
//   node --env-file=.env --import ./scratch/ts-aliases.mjs scratch/gotra_roster_import.ts \
//        <qr-import-plan.json> [--apply] [--plan-id <uuid>] [--owner-id <uuid>]
//
// REQUIRES migration 042 applied first (the script checks and refuses otherwise).
//
// Rules (owner's call: "I'll edit the payment method myself later"):
//   • method is always upi_qr — correct it later on QR Collections → payment history → Edit
//   • a person with no confirmed payment is skipped (a subscription can't exist without one)
//   • contiguous payments are replayed through record_offline_payment
//   • a person whose history has a lapse is created from their LATEST payment only
//   • someone already subscribed (same phone) is skipped — re-running is safe
// Each person is written by the same RPCs the app uses, so audit rows are written
// with the owner as actor. No amounts are invented: ₹ comes from the sheet.

import process from "node:process";
import { readFileSync } from "node:fs";
import { getServiceClient } from "../src/lib/supabase-admin.server.ts";
import {
  computeCoverage,
  mapOfflineRpcError,
  paidAtFromDate,
  todayIST,
} from "../src/lib/offline-subscriptions-logic.ts";

const args = process.argv.slice(2);
const planFile = args.find((a) => a.endsWith(".json"));
const apply = args.includes("--apply");
const flag = (n: string) => args[args.indexOf(n) + 1];
if (!planFile) {
  console.error(
    "usage: gotra_roster_import.ts <qr-import-plan.json> [--apply] [--plan-id uuid] [--owner-id uuid]",
  );
  process.exit(2);
}

interface PlanRow {
  no: number;
  naam: string;
  gotra: string;
  phone: string | null;
  payments: { paidOn: string; amountRupees: number; method: string }[];
  blocked: string | null;
  hasGap: boolean;
}
const rows: PlanRow[] = JSON.parse(readFileSync(planFile, "utf8"));
const today = todayIST(new Date());
const db = getServiceClient();

// ── preflight ──
// (not head:true — a HEAD request swallows PostgREST's "column missing" error body)
const mig = await db.from("subscriptions").select("payment_mode").limit(1);
if (mig.error) {
  console.error(
    `Migration 042 is not applied (${mig.error.message || mig.error.code || "payment_mode column missing"}).`,
  );
  if (apply) process.exit(1);
  console.error("(dry run continues — apply the migration before using --apply)");
}
let ownerId: string | undefined = args.includes("--owner-id") ? flag("--owner-id") : undefined;
if (!ownerId) {
  const { data } = await db.from("profiles").select("id").eq("role", "owner");
  if (!data || data.length !== 1) {
    console.error(
      `Expected exactly one owner profile, found ${data?.length ?? 0}. Pass --owner-id.`,
    );
    process.exit(1);
  }
  ownerId = data[0].id as string;
}
let planId: string | undefined = args.includes("--plan-id") ? flag("--plan-id") : undefined;
if (!planId) {
  const { data } = await db
    .from("plans")
    .select("id,name")
    .eq("is_active", true)
    .eq("price_paise", 39900)
    .eq("billing_period", "monthly");
  if (!data || data.length !== 1) {
    console.error(
      `Could not pick the ₹399 monthly plan automatically (${data?.length ?? 0} matches). Pass --plan-id.`,
    );
    process.exit(1);
  }
  planId = data[0].id as string;
  console.log(`plan: ${data[0].name}`);
}

console.log(
  apply
    ? "APPLY MODE — writing to the database"
    : "DRY RUN — nothing will be written (add --apply)",
);
const tally = { created: 0, skipped: 0, failed: 0, payments: 0 };

for (const r of rows) {
  const label = `#${r.no} ${r.naam}`;
  if (r.blocked || r.payments.length === 0) {
    console.log(`SKIP ${label}: ${r.blocked ?? "no payment"}`);
    tally.skipped++;
    continue;
  }
  if (!r.phone) {
    console.log(`SKIP ${label}: invalid phone`);
    tally.skipped++;
    continue;
  }
  // Which payments to write
  const pays = r.hasGap ? [r.payments[r.payments.length - 1]] : r.payments;
  console.log(
    `${apply ? "WRITE" : "PLAN "} ${label} (${r.phone}) — ${pays.map((p) => `${p.paidOn} ₹${p.amountRupees}`).join(", ")}${r.hasGap ? "  [lapse in history: latest payment only]" : ""}`,
  );
  if (!apply) continue;

  try {
    // find-or-create the login (same pattern as /api/admin/offline/create)
    const { data: existing, error: lookupErr } = await db
      .from("profiles")
      .select("id,role")
      .eq("phone", r.phone)
      .maybeSingle();
    if (lookupErr) throw new Error(lookupErr.message);
    let userId: string;
    let created = false;
    if (existing) {
      if (existing.role && existing.role !== "user")
        throw new Error("phone belongs to a staff account");
      userId = existing.id as string;
    } else {
      const { data: u, error: ue } = await db.auth.admin.createUser({
        phone: r.phone,
        phone_confirm: false,
        user_metadata: { full_name: r.naam },
      });
      if (ue || !u?.user) throw new Error(ue?.message ?? "createUser failed");
      userId = u.user.id;
      created = true;
      const { error: pe } = await db
        .from("profiles")
        .insert({ id: userId, full_name: r.naam, phone: r.phone });
      if (pe) {
        await db.auth.admin.deleteUser(userId);
        throw new Error(`profile: ${pe.message}`);
      }
    }

    const first = pays[0];
    const cov = computeCoverage({
      status: null,
      nextBillingDate: null,
      anchorDay: null,
      paidOn: first.paidOn,
      monthsCovered: 1,
    });
    const { data: made, error: me } = await db.rpc("create_offline_subscription", {
      p_user_id: userId,
      p_plan_id: planId,
      p_actor: ownerId,
      p_family: [
        {
          full_name: r.naam,
          gotra: r.gotra || null,
          relation: null,
          slot_number: 1,
          is_primary: true,
          dob: null,
        },
      ],
      p_amount_paise: Math.round(first.amountRupees * 100),
      p_paid_at: paidAtFromDate(first.paidOn),
      p_method: "upi_qr",
      p_months: 1,
      p_period_start: cov.periodStart,
      p_period_end: cov.periodEnd,
      p_anchor_day: cov.anchorDay,
      p_reference_no: null,
      p_proof_url: null,
      p_notes: "Imported from owner's manual roster; method assumed UPI QR — verify",
    });
    if (me) {
      if (created) {
        await db.from("profiles").delete().eq("id", userId);
        await db.auth.admin.deleteUser(userId);
      }
      const m = mapOfflineRpcError(me);
      console.log(`  SKIP: ${m.message}`);
      tally.skipped++;
      continue;
    }
    tally.created++;
    tally.payments++;
    const subId = (made as { subscription_id: string }).subscription_id;
    let nextDue = cov.periodEnd;
    for (const pay of pays.slice(1)) {
      const c = computeCoverage({
        status: "active",
        nextBillingDate: nextDue,
        anchorDay: cov.anchorDay,
        paidOn: pay.paidOn,
        monthsCovered: 1,
      });
      const { error: re } = await db.rpc("record_offline_payment", {
        p_subscription_id: subId,
        p_actor: ownerId,
        p_expected_status: "active",
        p_expected_next_billing_date: nextDue,
        p_amount_paise: Math.round(pay.amountRupees * 100),
        p_paid_at: paidAtFromDate(pay.paidOn),
        p_method: "upi_qr",
        p_months: 1,
        p_period_start: c.periodStart,
        p_period_end: c.periodEnd,
        p_anchor_day: c.anchorDay,
        p_reference_no: null,
        p_proof_url: null,
        p_notes: "Imported from owner's manual roster; method assumed UPI QR — verify",
        p_reactivate: false,
      });
      if (re) throw new Error(`replay ${pay.paidOn}: ${re.message}`);
      nextDue = c.periodEnd;
      tally.payments++;
    }
  } catch (e) {
    console.log(`  FAIL: ${e instanceof Error ? e.message : String(e)}`);
    tally.failed++;
  }
}
console.log(
  `\ntoday=${today} · ${apply ? "created" : "would create"}: ${apply ? tally.created : rows.filter((r) => !r.blocked && r.payments.length && r.phone).length} · skipped: ${tally.skipped} · failed: ${tally.failed}${apply ? ` · payments written: ${tally.payments}` : ""}`,
);
