import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { parsePnlRequest } from "@/lib/finance-requests";
import { fetchPnlData } from "@/lib/finance-data.server";

// POST /api/admin/finance/pnl        (OWNER ONLY)
// Body: { fromYm, toYm, basis: 'cash' | 'normalised',
//         compare?: { fromYm, toYm } }
//
// Returns the monthly P&L for [fromYm, toYm]. When `compare` is given
// it is the BASE period to compare against: compare.rows have
// a = the compare period, b = the primary period, delta = b − a, so the
// Overview tab sends "the previous equal-length period" and the Compare
// tab sends its A picker here and B as the primary range.
//
// All ₹ rows are read with the service role and returned only to an
// owner (admin → 403): "ADMIN = ZERO financial visibility".

export const Route = createFileRoute("/api/admin/finance/pnl")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const parsed = parsePnlRequest(body);
        if (!parsed.ok) return json({ error: parsed.error }, 400);

        try {
          const { ledger: _ledger, ...result } = await fetchPnlData(gate.auth.db, parsed.value);
          return json(result);
        } catch (err) {
          console.error("finance/pnl error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
