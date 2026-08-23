import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller } from "@/lib/supabase-admin.server";
import { loadTelecallerDataset, loadTodaysLeads } from "@/lib/telecaller-data.server";
import {
  assignQueues,
  isTelecallerQueueKey,
  paginateByIdentity,
  QUEUE_PAGE_CAP,
  stripMaskedFieldsDeep,
  type TelecallerLeadRow,
  type TelecallerQueueRow,
} from "@/lib/telecaller-logic";

// POST /api/telecaller/queue/list
// Gate: requireTelecaller. Body: { queue, cursor?, limit? }
//
// The working list for ONE queue, work-order sorted by the pure
// engine, cursor-paginated with a HARD page cap and NO skip-ahead:
// the cursor encodes the last returned row's identity, so she
// works the queue — she does not browse the database (§4).
//
// Queue 0 (`aaj_ke_leads`) is LEAD-shaped, not subscriber-shaped —
// its items carry the field agent's notes and the attribution
// token she needs to build §5.5 links.
export const Route = createFileRoute("/api/telecaller/queue/list")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        let body: { queue?: unknown; cursor?: unknown; limit?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        if (!isTelecallerQueueKey(body.queue)) {
          return json({ error: "Unknown queue" }, 400);
        }

        try {
          if (body.queue === "aaj_ke_leads") {
            const { leads } = await loadTodaysLeads(auth.db, auth.callerId);
            const page = paginateByIdentity<TelecallerLeadRow>(
              leads,
              typeof body.cursor === "string" && body.cursor ? body.cursor : null,
              typeof body.limit === "number" ? body.limit : QUEUE_PAGE_CAP,
              (l) => l.leadId,
            );
            return json(
              stripMaskedFieldsDeep({
                queue: "aaj_ke_leads",
                total: leads.length,
                items: page.items,
                nextCursor: page.nextCursor,
              }),
            );
          }

          const dataset = await loadTelecallerDataset(auth.db);
          const assignment = assignQueues({
            rows: dataset.rows,
            logs: dataset.logs,
            nowMs: Date.now(),
          });
          const queueRows = assignment[body.queue as keyof typeof assignment];
          const page = paginateByIdentity<TelecallerQueueRow>(
            queueRows,
            typeof body.cursor === "string" && body.cursor ? body.cursor : null,
            typeof body.limit === "number" ? body.limit : QUEUE_PAGE_CAP,
            identityOf,
          );

          return json(
            stripMaskedFieldsDeep({
              queue: body.queue,
              total: queueRows.length,
              items: page.items,
              nextCursor: page.nextCursor,
            }),
          );
        } catch (err) {
          console.error("telecaller/queue/list error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});

/** Subscription-scoped rows key by subscription; bare leads by profile. */
function identityOf(r: TelecallerQueueRow): string {
  return r.subscriptionId ?? `lead:${r.profileId}`;
}
