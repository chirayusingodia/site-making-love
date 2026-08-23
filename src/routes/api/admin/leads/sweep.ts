import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { LEAD_ROLLOVER_DAYS, LEAD_EXPIRY_DAYS } from "@/lib/telecaller-logic";

// POST /api/admin/leads/sweep
// Auth: staff. Body: none.
//
// §8.2 hygiene — safe to run on a schedule or by hand:
//   • rollover — 'assigned'/'in_progress' with ZERO call_logs older
//     than LEAD_ROLLOVER_DAYS returns to the pool ('new'), so leads
//     never die in one person's tray.
//   • expiry — 'new' leads older than LEAD_EXPIRY_DAYS expire.
// Both SQL functions write their own audit_logs rows (migration 013);
// this endpoint additionally audits that the sweep RAN.
export const Route = createFileRoute("/api/admin/leads/sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);

        try {
          const { data: rolled, error: rollErr } = await auth.db.rpc("roll_over_stale_leads", {
            p_days: LEAD_ROLLOVER_DAYS,
          });
          if (rollErr) return json({ error: `rollover: ${rollErr.message}` }, 500);
          const { data: expired, error: expErr } = await auth.db.rpc("expire_stale_leads", {
            p_days: LEAD_EXPIRY_DAYS,
          });
          if (expErr) return json({ error: `expiry: ${expErr.message}` }, 500);

          await writeTelecallerAudit(auth.db, auth.staffId, "admin.leads.swept", "leads", null, {
            rollover_days: LEAD_ROLLOVER_DAYS,
            expiry_days: LEAD_EXPIRY_DAYS,
            returned_to_pool: rolled ?? 0,
            expired: expired ?? 0,
          });

          return json({ ok: true, returnedToPool: rolled ?? 0, expired: expired ?? 0 });
        } catch (err) {
          console.error("admin/leads/sweep error:", err);
          return json({ error: err instanceof Error ? err.message : "Sweep failed" }, 500);
        }
      },
    },
  },
});
