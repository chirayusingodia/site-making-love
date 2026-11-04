import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase";
import {
  buildPayroll,
  type PayoutRow,
  type PayrollEntry,
  type PayrollRow,
  type PayrollTelecaller,
  type PayrollTotals,
} from "@/lib/telecaller-payroll-logic";

// Server-side loader shared by the payroll view and the xlsx export, so
// the file can never drift from the on-screen numbers.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asRows<T>(
  builder: any,
): PromiseLike<{ data: T[] | null; error: { message: string } | null }> {
  return builder;
}

export interface PayrollLineView {
  entryId: string;
  subscriptionId: string;
  subscriberName: string;
  subscriberPhone: string | null;
  kind: "first_deal" | "trail";
  status: string;
  amountPaise: number;
}

export interface PayrollRowView extends Omit<PayrollRow, "lines"> {
  lines: PayrollLineView[];
}

export interface PayoutView extends PayoutRow {
  telecallerName: string;
}

export interface PayrollData {
  period: string;
  rows: PayrollRowView[];
  totals: PayrollTotals;
  payouts: PayoutView[];
  periodLocked: boolean;
}

export async function fetchPayrollData(db: SupabaseClient, period: string): Promise<PayrollData> {
  const [entriesRes, tcRes, payoutsRes, lockRes] = await Promise.all([
    fetchAllRows<PayrollEntry>((from, to) =>
      asRows<PayrollEntry>(
        db
          .from("commission_entries")
          .select(
            "id,profile_id,subscription_id,kind,status,amount_paise,payout_period,created_at,paid_at,payout_id",
          )
          .not("profile_id", "is", null)
          .eq("payout_period", period)
          .range(from, to),
      ),
    ),
    db.from("profiles").select("id,full_name,phone").eq("role", "telecaller"),
    db
      .from("telecaller_payouts")
      .select("id,profile_id,payout_period,amount_paise,entry_count,method,reference_no,note,paid_at")
      .order("paid_at", { ascending: false })
      .limit(500),
    db.from("commission_payout_periods").select("locked_at").eq("period", period).maybeSingle(),
  ]);
  if (entriesRes.error) throw new Error(String(entriesRes.error));
  if (tcRes.error) throw new Error(tcRes.error.message);
  if (payoutsRes.error) throw new Error(payoutsRes.error.message);

  const entries = entriesRes.data as PayrollEntry[];
  const telecallers = (tcRes.data ?? []) as PayrollTelecaller[];

  // Names for people who earned but are no longer role=telecaller.
  const known = new Set(telecallers.map((t) => t.id));
  const missing = [...new Set(entries.map((e) => e.profile_id!).filter((id) => !known.has(id)))];
  if (missing.length > 0) {
    const { data } = await db.from("profiles").select("id,full_name,phone").in("id", missing);
    for (const p of (data ?? []) as PayrollTelecaller[]) telecallers.push(p);
  }
  const payoutPeople = new Map(telecallers.map((t) => [t.id, t.full_name ?? "Unnamed telecaller"]));
  const payoutProfileIds = [
    ...new Set(((payoutsRes.data ?? []) as PayoutRow[]).map((p) => p.profile_id)),
  ].filter((id) => !payoutPeople.has(id));
  if (payoutProfileIds.length > 0) {
    const { data } = await db.from("profiles").select("id,full_name").in("id", payoutProfileIds);
    for (const p of (data ?? []) as { id: string; full_name: string | null }[])
      payoutPeople.set(p.id, p.full_name ?? "Unnamed telecaller");
  }

  const { rows, totals } = buildPayroll({ period, entries, telecallers });

  // Subscriber names for the drill-down lines.
  const subIds = [...new Set(entries.map((e) => e.subscription_id))];
  const subName = new Map<string, { name: string; phone: string | null }>();
  for (let i = 0; i < subIds.length; i += 150) {
    const { data: subs } = await db
      .from("subscriptions")
      .select("id,user_id")
      .in("id", subIds.slice(i, i + 150));
    const userIds = [...new Set(((subs ?? []) as { user_id: string }[]).map((s) => s.user_id))];
    const { data: profs } = userIds.length
      ? await db.from("profiles").select("id,full_name,phone").in("id", userIds)
      : { data: [] };
    const pById = new Map(
      ((profs ?? []) as { id: string; full_name: string | null; phone: string | null }[]).map(
        (p) => [p.id, p],
      ),
    );
    for (const s of (subs ?? []) as { id: string; user_id: string }[]) {
      const p = pById.get(s.user_id);
      subName.set(s.id, { name: p?.full_name?.trim() || "Subscriber", phone: p?.phone ?? null });
    }
  }

  return {
    period,
    totals,
    periodLocked: Boolean(lockRes.data?.locked_at),
    rows: rows.map((r) => ({
      ...r,
      lines: r.lines.map((l) => ({
        ...l,
        subscriberName: subName.get(l.subscriptionId)?.name ?? "Subscriber",
        subscriberPhone: subName.get(l.subscriptionId)?.phone ?? null,
      })),
    })),
    payouts: ((payoutsRes.data ?? []) as PayoutRow[]).map((p) => ({
      ...p,
      telecallerName: payoutPeople.get(p.profile_id) ?? "Unnamed telecaller",
    })),
  };
}
