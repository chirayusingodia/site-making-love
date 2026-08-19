import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { fetchPendingSevasReportData } from "@/lib/reports-data.server";
import { isValidMonth } from "@/lib/reports-logic";

// POST /api/admin/reports/pending-sevas
// Body: { month: "YYYY-MM" }
//
// OWNER-ONLY. Serves the batch rows + membership behind the Pending
// Sevas report (Tuesday and Saturday batches stay SEPARATE — [BL-1]).
// Rejects 403 for any authenticated non-owner (including admin).
//
// Responses:
//   200 — { batches, membership: { [batch_id]: subscription_id[] } }
//   400 — invalid month
//   401 — no/invalid token, or not staff
//   403 — authenticated staff but not owner ("Owner access required")

export const Route = createFileRoute("/api/admin/reports/pending-sevas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);

        let month: unknown;
        try {
          month = (await request.json())?.month;
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        if (!isValidMonth(month)) {
          return json({ error: "month must be YYYY-MM" }, 400);
        }

        try {
          const data = await fetchPendingSevasReportData(gate.auth.db, month);
          return json(data);
        } catch (err) {
          console.error("reports/pending-sevas error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
