import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { fetchMonthlyReportData } from "@/lib/reports-data.server";
import { isValidMonth } from "@/lib/reports-logic";

// POST /api/admin/reports/monthly
// Body: { month: "YYYY-MM" }
//
// OWNER-ONLY. Serves the raw datasets behind the Subscriber Status,
// Revenue, and Seva Completion reports. Rejects 403 for any
// authenticated non-owner (including admin) — admin has ZERO
// financial visibility, and these datasets include payment amounts.
//
// Responses:
//   200 — { subs, monthPayments, resumedCount, proofs }
//   400 — invalid month
//   401 — no/invalid token, or not staff
//   403 — authenticated staff but not owner ("Owner access required")

export const Route = createFileRoute("/api/admin/reports/monthly")({
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
          const data = await fetchMonthlyReportData(gate.auth.db, month);
          return json(data);
        } catch (err) {
          console.error("reports/monthly error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
