import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase";
import {
  todayIst,
  type PerfAllotmentRow,
  type PerfCallRow,
  type PerfCommissionEntry,
  type PerfDataset,
  type PerfLeadRow,
  type PerfPaymentRow,
  type PerfPersonRef,
  type PerfSubRow,
} from "@/lib/performance-logic";

/** One day in ms — used for the inclusive-IST-day upper bound. */
const DAY_MS = 24 * 3_600_000;

// Server-only data assembly for the OWNER performance leaderboard.
// Watermarked by the IST date range (every table is filtered on its
// timestamp column BEFORE paging) and hard-capped with an explicit
// truncation flag — the review's "no silent caps" rule. The pure
// module re-filters by IST range anyway; this layer just keeps the
// payload bounded.

/** Per-table row cap. Beyond it the response says `truncatedTables`. */
const TABLE_CAP = 50_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

interface Capped<T> {
  rows: T[];
  truncated: boolean;
}

async function cappedFetch<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  makeQuery: (from: number, to: number) => any,

  map: (raw: AnyRow) => T,
): Promise<Capped<T>> {
  const res = await fetchAllRows<AnyRow>((from, to) => makeQuery(from, to));
  if (res.error) throw new Error(res.error);
  const truncated = res.data.length >= TABLE_CAP;
  return { rows: res.data.slice(0, TABLE_CAP).map(map), truncated };
}

export interface PerformanceDataResult extends PerfDataset {
  rangeFrom: string;
  rangeTo: string;
  truncatedTables: string[];
}

/**
 * Loads every lens input for an inclusive IST date range. The three
 * timestamps bucketed in Asia/Kolkata are leads.created_at, calls /
 * subscriptions / payments created_at, and commission payout_period
 * (already a period).
 */
export async function loadPerformanceData(
  db: SupabaseClient,
  fromIsoDate: string,
  toIsoDateIso?: string,
): Promise<PerformanceDataResult> {
  const rangeTo = toIsoDateIso ?? todayIst(Date.now());
  const rangeFrom = fromIsoDate;
  // IST-aware bounds as UTC instants for server-side filtering:
  //   IST day D spans [D 00:00 IST, D+1 00:00 IST)
  //   = UTC [parse(D) − 5.5h, parse(D+1) − 5.5h)
  const gte = new Date(Date.parse(`${rangeFrom}T00:00:00Z`) - 5.5 * 3_600_000).toISOString();
  const lte = new Date(
    Date.parse(`${rangeTo}T00:00:00Z`) - 5.5 * 3_600_000 + DAY_MS - 1,
  ).toISOString();

  const [tcRes, hospRes, agentsRes, leads, calls, subs, payments, commissions, allotments] =
    await Promise.all([
      db.from("profiles").select("id,full_name").eq("role", "telecaller").range(0, 4999),
      db.from("hospitals").select("id,name").order("name").range(0, 4999),
      db.from("sales_agents").select("id,full_name").eq("is_active", true).range(0, 4999),
      cappedFetch(
        (f, t) =>
          db
            .from("leads")
            .select(
              "id,assigned_to,source_agent_id,hospital_id,free_pooja_by," +
                "status,created_at,converted_at,subscription_id",
            )
            .gte("created_at", gte)
            .lte("created_at", lte)
            .range(f, t),
        (raw: AnyRow): PerfLeadRow => ({
          id: raw.id,
          assignedTo: raw.assigned_to ?? null,
          sourceAgentId: raw.source_agent_id ?? null,
          hospitalId: raw.hospital_id ?? null,
          freePoojaBy: raw.free_pooja_by ?? null,
          status: raw.status,
          createdAt: raw.created_at,
          convertedAt: raw.converted_at ?? null,
          subscriptionId: raw.subscription_id ?? null,
        }),
      ),
      cappedFetch(
        (f, t) =>
          db
            .from("call_logs")
            .select("called_by,lead_id,outcome,created_at")
            .gte("created_at", gte)
            .lte("created_at", lte)
            .range(f, t),
        (raw: AnyRow): PerfCallRow => ({
          calledBy: raw.called_by,
          leadId: raw.lead_id ?? null,
          outcome: raw.outcome,
          createdAt: raw.created_at,
        }),
      ),
      cappedFetch(
        (f, t) =>
          db
            .from("subscriptions")
            .select(
              "id,telecaller_id,sales_agent_id,status,start_date,created_at,paused_at,cancelled_at,halted_at",
            )
            .gte("created_at", gte)
            .lte("created_at", lte)
            .range(f, t),
        (raw: AnyRow): PerfSubRow => ({
          id: raw.id,
          telecallerId: raw.telecaller_id ?? null,
          salesAgentId: raw.sales_agent_id ?? null,
          status: raw.status,
          startDate: raw.start_date ?? null,
          createdAt: raw.created_at,
          pausedAt: raw.paused_at ?? null,
          cancelledAt: raw.cancelled_at ?? null,
          haltedAt: raw.halted_at ?? null,
        }),
      ),
      cappedFetch(
        (f, t) =>
          db
            .from("payments")
            .select("subscription_id,amount_paise,status,created_at")
            .gte("created_at", gte)
            .lte("created_at", lte)
            .range(f, t),
        (raw: AnyRow): PerfPaymentRow => ({
          subscriptionId: raw.subscription_id,
          amountPaise: raw.amount_paise,
          status: raw.status,
          createdAt: raw.created_at,
        }),
      ),
      cappedFetch(
        (f, t) =>
          db
            .from("commission_entries")
            .select("agent_id,profile_id,kind,amount_paise,payout_period")
            .range(f, t),
        (raw: AnyRow): PerfCommissionEntry => ({
          agentId: raw.agent_id ?? null,
          profileId: raw.profile_id ?? null,
          kind: raw.kind,
          amountPaise: raw.amount_paise,
          payoutPeriod: raw.payout_period,
        }),
      ),
      cappedFetch(
        (f, t) =>
          db
            .from("agent_hospital_allotments")
            .select("hospital_id,agent_id,allotted_from,allotted_to")
            .range(f, t),
        (raw: AnyRow): PerfAllotmentRow => ({
          hospitalId: raw.hospital_id,
          agentId: raw.agent_id,
          allottedFrom: raw.allotted_from,
          allottedTo: raw.allotted_to ?? null,
        }),
      ),
    ]);

  const truncatedTables: string[] = [];
  if (leads.truncated) truncatedTables.push("leads");
  if (calls.truncated) truncatedTables.push("call_logs");
  if (subs.truncated) truncatedTables.push("subscriptions");
  if (payments.truncated) truncatedTables.push("payments");
  if (commissions.truncated) truncatedTables.push("commission_entries");
  if (allotments.truncated) truncatedTables.push("agent_hospital_allotments");

  const telecallers: PerfPersonRef[] = (
    (tcRes.data ?? []) as { id: string; full_name: string | null }[]
  ).map((p) => ({ id: p.id, name: p.full_name ?? p.id }));

  return {
    telecallers,
    agents: ((agentsRes.data ?? []) as { id: string; full_name: string | null }[]).map((a) => ({
      id: a.id,
      name: a.full_name ?? a.id,
    })),
    hospitals: ((hospRes.data ?? []) as { id: string; name: string }[]).map((h) => ({
      id: h.id,
      name: h.name,
    })),
    leads: leads.rows,
    calls: calls.rows,
    subs: subs.rows,
    payments: payments.rows,
    commissions: commissions.rows,
    allotments: allotments.rows,
    range: { from: rangeFrom, to: rangeTo },
    rangeFrom,
    rangeTo,
    truncatedTables,
  };
}
