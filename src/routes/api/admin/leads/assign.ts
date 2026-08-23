import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { DAILY_LEAD_TARGET } from "@/lib/telecaller-logic";

// POST /api/admin/leads/assign
// Auth: staff. Body: { telecallerId, count? (default DAILY_LEAD_TARGET) }
//
// §8.2 — claims the oldest unassigned leads via the SKIP LOCKED
// RPC (migration 013): transactional, and two admins clicking at
// once claim disjoint sets — the same lead can never land on two
// trays.
export const Route = createFileRoute("/api/admin/leads/assign")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);

        let body: { telecaller_id?: unknown; count?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const telecallerId =
          typeof body.telecaller_id === "string" && body.telecaller_id.length === 36
            ? body.telecaller_id
            : "";
        if (!telecallerId) return json({ error: "telecaller_id required" }, 400);
        const count =
          typeof body.count === "number" && Number.isFinite(body.count)
            ? Math.max(1, Math.min(200, Math.trunc(body.count)))
            : DAILY_LEAD_TARGET;

        try {
          // Verify target is actually a telecaller-seat profile before
          // handing them a tray of personal data.
          const { data: prof, error: pErr } = await auth.db
            .from("profiles")
            .select("role")
            .eq("id", telecallerId)
            .maybeSingle();
          if (pErr) return json({ error: pErr.message }, 500);
          if (
            !prof ||
            (prof.role !== "telecaller" && prof.role !== "admin" && prof.role !== "owner")
          ) {
            return json({ error: "Target is not a telecaller seat" }, 422);
          }

          const { data: claimed, error: rpcErr } = await auth.db.rpc("assign_leads", {
            p_telecaller: telecallerId,
            p_count: count,
          });
          if (rpcErr) return json({ error: rpcErr.message }, 500);

          await writeTelecallerAudit(auth.db, auth.staffId, "admin.leads.assigned", "leads", null, {
            telecaller_id: telecallerId,
            requested: count,
            claimed: claimed ?? 0,
          });

          return json({ ok: true, claimed: claimed ?? 0, requested: count });
        } catch (err) {
          console.error("admin/leads/assign error:", err);
          return json({ error: err instanceof Error ? err.message : "Assign failed" }, 500);
        }
      },
    },
  },
});
