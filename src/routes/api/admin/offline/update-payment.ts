import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { mapOfflineRpcError, parsePaymentEditBody } from "@/lib/offline-subscriptions-logic";

// POST /api/admin/offline/update-payment        (OWNER ONLY)
// Body: { paymentId, method, referenceNo?, proofUrl?, notes? }
//
// Corrects HOW an offline payment was made (UPI QR / cash / bank transfer)
// and its UTR / screenshot / note after the fact. Amount, date and coverage
// are intentionally not editable — those move due dates, so they go through
// Void + re-record. The RPC audits a before/after diff.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/admin/offline/update-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);
        const { db, staffId } = gate.auth;

        let body: Record<string, unknown>;
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
        const parsed = parsePaymentEditBody(body);
        if (!parsed.ok) return json({ error: parsed.error }, 400);
        const v = parsed.value;

        try {
          const { data, error } = await db.rpc("update_offline_payment_details", {
            p_payment_id: paymentId,
            p_actor: staffId,
            p_method: v.method,
            p_reference_no: v.referenceNo,
            p_proof_url: v.proofUrl,
            p_notes: v.notes,
          });
          if (error) {
            const mapped = mapOfflineRpcError(error);
            if (mapped.status === 500) console.error("offline/update-payment rpc error:", error);
            return json({ error: mapped.message }, mapped.status);
          }
          return json({ ok: true, ...(data as Record<string, unknown>) });
        } catch (err) {
          console.error("offline/update-payment error:", err);
          return json({ error: err instanceof Error ? err.message : "Update failed" }, 500);
        }
      },
    },
  },
});
