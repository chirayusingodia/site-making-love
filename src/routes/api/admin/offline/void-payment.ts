import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { mapOfflineRpcError } from "@/lib/offline-subscriptions-logic";

// POST /api/admin/offline/void-payment        (OWNER ONLY)
// Body: { paymentId, reason }   reason: 3-300 chars, required
//
// Undoes the LATEST offline payment of a subscription (a mistaken
// entry). The RPC restores the pre-payment snapshot; voiding the very
// first payment cancels the subscription. The deleted rows are kept in
// the audit log.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/admin/offline/void-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);
        const { db, staffId } = gate.auth;

        let body: { paymentId?: unknown; reason?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const paymentId =
          typeof body.paymentId === "string" && UUID_RE.test(body.paymentId)
            ? body.paymentId
            : null;
        if (!paymentId) return json({ error: "paymentId zaroori hai" }, 400);
        const reason = typeof body.reason === "string" ? body.reason.trim() : "";
        if (reason.length < 3 || reason.length > 300) {
          return json({ error: "Reason 3 se 300 akshar ka hona chahiye" }, 400);
        }

        try {
          const { data, error } = await db.rpc("void_offline_payment", {
            p_payment_id: paymentId,
            p_actor: staffId,
            p_reason: reason,
          });
          if (error) {
            const mapped = mapOfflineRpcError(error);
            if (mapped.status === 500) console.error("offline/void-payment rpc error:", error);
            return json({ error: mapped.message }, mapped.status);
          }
          return json({ ok: true, ...(data as Record<string, unknown>) });
        } catch (err) {
          console.error("offline/void-payment error:", err);
          return json({ error: err instanceof Error ? err.message : "Void failed" }, 500);
        }
      },
    },
  },
});
