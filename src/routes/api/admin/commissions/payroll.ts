import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { fetchPayrollData } from "@/lib/telecaller-payroll.server";

// POST /api/admin/commissions/payroll      (OWNER ONLY)
// Body: { period: 'YYYY-MM' }
// Per-telecaller salary for the month + the payout history.
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const Route = createFileRoute("/api/admin/commissions/payroll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);

        let body: { period?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const period = typeof body.period === "string" && PERIOD_RE.test(body.period) ? body.period : "";
        if (!period) return json({ error: "period must be YYYY-MM" }, 400);

        try {
          return json(await fetchPayrollData(gate.auth.db, period));
        } catch (err) {
          console.error("commissions/payroll error:", err);
          return json({ error: err instanceof Error ? err.message : "Payroll failed" }, 500);
        }
      },
    },
  },
});
