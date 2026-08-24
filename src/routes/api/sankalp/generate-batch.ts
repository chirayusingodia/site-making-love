import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin } from "@/lib/supabase-admin.server";
import { fetchAllRows } from "@/lib/supabase";
import {
  allHawanSevaIds,
  batchKindForDate,
  computeBatchMembership,
  type BatchKind,
} from "@/lib/sankalp-logic";

// POST /api/sankalp/generate-batch
// Body: { date: "YYYY-MM-DD" }
//
// Given a date, validates it is THE Second Tuesday or THE Last
// Saturday of its month, then generates the batch row(s) +
// sankalp_batch_subscriptions rows LIVE from current active
// subscriptions + current plan_sevas. Nothing is cached or
// pre-materialized ahead of this call.
//
// Idempotent: re-running for the same date while a batch is still
// 'pending' refreshes its membership (so mid-day new activations
// are picked up). A batch already marked 'done' is NEVER touched.

export const Route = createFileRoute("/api/sankalp/generate-batch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);
        const { staffId, db } = auth;

        let date: string | undefined;
        try {
          const body = await request.json();
          date = typeof body?.date === "string" ? body.date : undefined;
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return json({ error: "date must be YYYY-MM-DD" }, 400);
        }

        const kind: BatchKind | null = batchKindForDate(date);
        if (!kind) {
          return json(
            {
              error:
                "Not a seva day. Batches exist only for the Second Tuesday or Last Saturday of a month.",
            },
            400,
          );
        }

        // ── Live reads: active subs + live composition, right now ──
        // Subscriber-scale tables are PAGED — PostgREST caps a single
        // response at ~1000 rows; a silent cap here would corrupt
        // batch membership.
        const [subsAll, psAll, sevasRes] = await Promise.all([
          fetchAllRows<{
            id: string;
            plan_id: string;
            status: string;
            start_date: string | null;
            created_at: string;
          }>((from, to) =>
            db
              .from("subscriptions")
              .select("id,plan_id,status,start_date,created_at")
              .eq("status", "active")
              .order("id")
              .range(from, to),
          ),
          fetchAllRows<{ plan_id: string; seva_id: string }>((from, to) =>
            db.from("plan_sevas").select("plan_id,seva_id").range(from, to),
          ),
          db.from("sevas").select("id,name,slug,sort_order,is_active"),
        ]);
        const firstErr =
          (subsAll.error ? { message: subsAll.error } : null) ??
          (psAll.error ? { message: psAll.error } : null) ??
          sevasRes.error;
        if (firstErr) return json({ error: firstErr.message }, 500);

        // [Bug 4.5] Membership ELIGIBILITY uses every hawan seva — a
        // plan whose hawan is Tuesday-scheduled is still a hawan plan
        // and belongs in List B permanently. Day-scoped resolution for
        // the Pandit list stays with saturdayHawanSevaIds.
        const hawanSevaIds = allHawanSevaIds(sevasRes.data ?? []);
        const membership = computeBatchMembership({
          kind,
          batchDate: date,
          subscriptions: subsAll.data,
          planSevas: psAll.data,
          hawanSevaIds,
        });
        const catchupCount = membership.filter((m) => m.is_catchup).length;

        // ── EXACTLY ONE batch row per (kind, date), atomically ──
        // [Bugs 4.1 / 4.2] Create-or-refresh used to be four separate
        // round trips (read → check → delete → chunked insert) with no
        // transaction: concurrent triggers raced the read, and a
        // mid-refresh chunk failure left the batch partially or fully
        // EMPTY with no rollback.
        //
        // generate_sankalp_batch() (migration 018) now does everything
        // in ONE transaction: racers serialize on the (batch_date,
        // batch_type) UNIQUE via ON CONFLICT, and a failed member
        // insert rolls back the whole refresh including the batch row
        // on first creation. 'done' batches are never touched.
        const { data: rpcResult, error: rpcErr } = await db.rpc("generate_sankalp_batch", {
          p_date: date,
          p_kind: kind,
          p_membership: membership.map((m) => ({
            subscription_id: m.subscription_id,
            is_catchup: m.is_catchup,
          })),
        });
        if (rpcErr) return json({ error: rpcErr.message }, 500);

        const result = rpcResult as unknown as {
          batch_id: string;
          action: "created" | "refreshed" | "skipped_done";
          subscriber_count?: number;
        };

        const results: {
          batch_id: string;
          batch_type: BatchKind;
          action: "created" | "refreshed" | "skipped_done";
          subscriber_count: number;
        }[] = [
          {
            batch_id: result.batch_id,
            batch_type: kind,
            action: result.action,
            subscriber_count:
              result.action === "skipped_done" ? membership.length : (result.subscriber_count ?? 0),
          },
        ];

        await db.from("audit_logs").insert({
          admin_id: staffId,
          action: "sankalp_batch_generated",
          entity: "sankalp_batches",
          entity_id: result.batch_id,
          meta: { date, kind, catchup_count: catchupCount, results },
        });

        return json({
          date,
          batch_type: kind,
          subscriber_count:
            result.action === "skipped_done" ? membership.length : (result.subscriber_count ?? 0),
          catchup_count: catchupCount,
          batches: results,
        });
      },
    },
  },
});
