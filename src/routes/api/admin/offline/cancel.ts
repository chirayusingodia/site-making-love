import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { mapOfflineRpcError } from "@/lib/offline-subscriptions-logic";

// POST /api/admin/offline/cancel        (OWNER ONLY)
// Body: { subscriptionId, reason }   reason: 3-300 chars, required
//
// Stops an offline subscription for good (active|halted -> cancelled).
// To resume service the person must be added again with a new payment.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/admin/offline/cancel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);
        const { db, staffId } = gate.auth;

        let body: { subscriptionId?: unknown; reason?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const subscriptionId =
          typeof body.subscriptionId === "string" && UUID_RE.test(body.subscriptionId)
            ? body.subscriptionId
            : null;
        if (!subscriptionId) return json({ error: "subscriptionId zaroori hai" }, 400);
        const reason = typeof body.reason === "string" ? body.reason.trim() : "";
        if (reason.length < 3 || reason.length > 300) {
          return json({ error: "Reason 3 se 300 akshar ka hona chahiye" }, 400);
        }

        try {
          const { data, error } = await db.rpc("cancel_offline_subscription", {
            p_subscription_id: subscriptionId,
            p_actor: staffId,
            p_reason: reason,
          });
          if (error) {
            const mapped = mapOfflineRpcError(error);
            if (mapped.status === 500) console.error("offline/cancel rpc error:", error);
            return json({ error: mapped.message }, mapped.status);
          }
          return json({ ok: true, ...(data as Record<string, unknown>) });
        } catch (err) {
          console.error("offline/cancel error:", err);
          return json({ error: err instanceof Error ? err.message : "Cancel failed" }, 500);
        }
      },
    },
  },
});
