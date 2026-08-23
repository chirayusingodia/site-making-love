import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller } from "@/lib/supabase-admin.server";
import { stripMaskedFieldsDeep, TC_PLAN_COLS } from "@/lib/telecaller-logic";

// POST /api/telecaller/plans
// Gate: requireTelecaller.
//
// The sellable catalogue for the payment-link panel: name + slug +
// cadence ONLY. price_paise is not fetched — if she needs to quote
// a price she reads it off the public /plans page like any
// customer would (§4/§5.5).
export const Route = createFileRoute("/api/telecaller/plans")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        try {
          const { data, error } = await auth.db
            .from("plans")
            .select(`slug,${TC_PLAN_COLS}`)
            .eq("is_active", true)
            .order("sort_order");
          if (error) return json({ error: error.message }, 500);
          return json(stripMaskedFieldsDeep({ plans: data ?? [] }));
        } catch (err) {
          console.error("telecaller/plans error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
