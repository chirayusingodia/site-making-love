import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller } from "@/lib/supabase-admin.server";
import { computeQueuesResponse } from "@/lib/telecaller-data.server";
import { stripMaskedFieldsDeep } from "@/lib/telecaller-logic";

// POST /api/telecaller/queues
// Gate: requireTelecaller (telecaller | admin | owner).
// Returns the twelve work queues with LIVE counts + the next
// Sankalp batch cutoff countdown (§3 — the home page IS this
// stack, not a dashboard). No ₹ figures exist anywhere in this
// payload by construction; stripMaskedFieldsDeep runs anyway as
// the wire-format guarantee.
export const Route = createFileRoute("/api/telecaller/queues")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        try {
          const payload = await computeQueuesResponse(
            auth.db,
            auth.callerId,
            auth.role !== "telecaller",
          );
          return json(stripMaskedFieldsDeep(payload));
        } catch (err) {
          console.error("telecaller/queues error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
