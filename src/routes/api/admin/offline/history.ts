import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";

// POST /api/admin/offline/history        (OWNER ONLY)
// Body: { subscriptionId }
// The full QR/cash/bank payment history of one offline subscription,
// newest first, with the owner-only detail (UTR, screenshot, note).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/admin/offline/history")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);
        const { db } = gate.auth;

        let body: { subscriptionId?: unknown };
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

        try {
          const { data, error } = await db
            .from("offline_payment_details")
            .select(
              "payment_id,months_covered,period_start,period_end,reference_no,proof_url,notes,recorded_by,created_at," +
                "payments!inner(amount_paise,paid_at,method,cycle_number,status)",
            )
            .eq("subscription_id", subscriptionId)
            .order("created_at", { ascending: false });
          if (error) return json({ error: error.message }, 500);
          return json({ subscriptionId, payments: data ?? [] });
        } catch (err) {
          console.error("offline/history error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
