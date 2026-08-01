import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase";
import { monthWindow } from "@/lib/reports-logic";
import type {
  BatchRow,
  MonthPayment,
  MonthlyReportData,
  PendingSevasReportData,
  ProofRow,
  ViewRow,
} from "@/lib/reports-logic";

// Server-only data fetchers backing the owner-gated
// /api/admin/reports/* handlers. All queries run with the
// service-role client (RLS bypassed) — authorization happens in
// the handler via requireOwner BEFORE any of this is called.

export async function fetchMonthlyReportData(
  db: SupabaseClient,
  month: string,
): Promise<MonthlyReportData> {
  const { y, m, monthStart, monthEnd } = monthWindow(month);

  const [subsRes, paysRes, resumedRes, proofsRes] = await Promise.all([
    fetchAllRows<ViewRow>((from, to) =>
      db
        .from("subscriber_list_view")
        .select(
          "subscription_id, status, start_date, paused_at, cancelled_at, sub_created_at, plan_name, plan_price_paise, plan_billing_period, primary_member_name",
        )
        .range(from, to),
    ),
    fetchAllRows<MonthPayment>((from, to) =>
      db
        .from("payments")
        .select("subscription_id, amount_paise, status, created_at")
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd)
        .range(from, to),
    ),
    // Reactivations = webhook 'resumed' events (pause → active).
    db
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "razorpay.subscription.resumed")
      .gte("created_at", monthStart)
      .lte("created_at", monthEnd),
    db
      .from("seva_proofs")
      .select(
        "id, seva_id, media_type, is_delivered, delivered_at, month, year, sevas(name), sankalp_batches(batch_type, batch_date)",
      )
      .eq("month", m)
      .eq("year", y),
  ]);

  if (subsRes.error) throw new Error(`subscriptions: ${subsRes.error}`);
  if (paysRes.error) throw new Error(`payments: ${paysRes.error}`);
  if (resumedRes.error) throw new Error(`audit_logs: ${resumedRes.error.message}`);
  if (proofsRes.error) throw new Error(`seva_proofs: ${proofsRes.error.message}`);

  return {
    subs: subsRes.data,
    monthPayments: paysRes.data,
    resumedCount: resumedRes.count ?? 0,
    proofs: (proofsRes.data || []) as unknown as ProofRow[],
  };
}

export async function fetchPendingSevasReportData(
  db: SupabaseClient,
  month: string,
): Promise<PendingSevasReportData> {
  const { tueDate, satDate } = monthWindow(month);

  const { data: batchRows, error: batchesErr } = await db
    .from("sankalp_batches")
    .select("id, batch_type, batch_date, sankalp_variant, status")
    .in("batch_date", [tueDate, satDate]);
  if (batchesErr) throw new Error(`sankalp_batches: ${batchesErr.message}`);

  const batches = (batchRows || []) as BatchRow[];
  const membership: Record<string, string[]> = {};

  if (batches.length > 0) {
    const ids = batches.map((b) => b.id);
    const { data: members, error: memErr } = await db
      .from("sankalp_batch_subscriptions")
      .select("batch_id, subscription_id")
      .in("batch_id", ids);
    if (memErr) throw new Error(`batch membership: ${memErr.message}`);
    for (const row of members || []) {
      (membership[row.batch_id] ??= []).push(row.subscription_id);
    }
  }

  return { batches, membership };
}
