import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin } from "@/lib/supabase-admin.server";
import { fetchAllRows } from "@/lib/supabase";
import {
  batchKindForDate,
  computeBatchMembership,
  saturdayHawanSevaIds,
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
        const [subsAll, psAll, sevasRes, rulesRes] = await Promise.all([
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
          db.from("seva_schedule_rules").select("seva_id,weekday,occurrence"),
        ]);
        const firstErr =
          (subsAll.error ? { message: subsAll.error } : null) ??
          (psAll.error ? { message: psAll.error } : null) ??
          sevasRes.error ??
          rulesRes.error;
        if (firstErr) return json({ error: firstErr.message }, 500);

        const hawanSevaIds = saturdayHawanSevaIds(sevasRes.data ?? [], rulesRes.data ?? []);
        const membership = computeBatchMembership({
          kind,
          batchDate: date,
          subscriptions: subsAll.data,
          planSevas: psAll.data,
          hawanSevaIds,
        });
        const catchupCount = membership.filter((m) => m.is_catchup).length;

        // ── EXACTLY ONE batch row per (kind, date) ──
        // The former 'hawan_only' / 'full_package' variant split created two
        // rows here and inserted this same `membership` into BOTH, enrolling
        // every List B subscriber twice. One kind, one date, one batch.
        const results: {
          batch_id: string;
          batch_type: BatchKind;
          action: "created" | "refreshed" | "skipped_done";
          subscriber_count: number;
        }[] = [];

        {
          const { data: existing, error: exErr } = await db
            .from("sankalp_batches")
            .select("id,status")
            .eq("batch_date", date)
            .eq("batch_type", kind)
            .maybeSingle();
          if (exErr) return json({ error: exErr.message }, 500);

          if (existing?.status === "done") {
            results.push({
              batch_id: existing.id,
              batch_type: kind,
              action: "skipped_done",
              subscriber_count: membership.length,
            });
          } else {
            let batchId: string;
            if (existing) {
              batchId = existing.id;
              // Refresh membership: wipe THIS batch's rows only.
              const { error: delErr } = await db
                .from("sankalp_batch_subscriptions")
                .delete()
                .eq("batch_id", batchId);
              if (delErr) return json({ error: delErr.message }, 500);
            } else {
              const { data: inserted, error: insErr } = await db
                .from("sankalp_batches")
                .insert({
                  batch_type: kind,
                  batch_date: date,
                  status: "pending",
                })
                .select("id")
                .single();
              if (insErr || !inserted) {
                return json({ error: insErr?.message ?? "insert failed" }, 500);
              }
              batchId = inserted.id;
            }

            if (membership.length > 0) {
              const rows = membership.map((m) => ({
                batch_id: batchId,
                subscription_id: m.subscription_id,
                is_catchup: m.is_catchup,
              }));
              for (let i = 0; i < rows.length; i += 500) {
                const { error: sbsErr } = await db
                  .from("sankalp_batch_subscriptions")
                  .insert(rows.slice(i, i + 500));
                if (sbsErr) return json({ error: sbsErr.message }, 500);
              }
            }

            // Snapshot count onto THIS batch row only.
            const { error: updErr } = await db
              .from("sankalp_batches")
              .update({ subscriber_count: membership.length })
              .eq("id", batchId);
            if (updErr) return json({ error: updErr.message }, 500);

            results.push({
              batch_id: batchId,
              batch_type: kind,
              action: existing ? "refreshed" : "created",
              subscriber_count: membership.length,
            });
          }
        }

        await db.from("audit_logs").insert({
          admin_id: staffId,
          action: "sankalp_batch_generated",
          entity: "sankalp_batches",
          entity_id: null,
          meta: { date, kind, catchup_count: catchupCount, results },
        });

        return json({
          date,
          batch_type: kind,
          subscriber_count: membership.length,
          catchup_count: catchupCount,
          batches: results,
        });
      },
    },
  },
});
