import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller } from "@/lib/supabase-admin.server";
import { stripMaskedFieldsDeep } from "@/lib/telecaller-logic";

// POST /api/telecaller/agents
// Gate: requireTelecaller.
//
// §5 (Hospitals session): when the telecaller asks "kaunse agent ne
// number diya?", she needs the roster to pick from — NAMES ONLY.
// No phone, no commission_percent, no attribution data ever leaves
// here; this list feeds one <select> and nothing else.
export const Route = createFileRoute("/api/telecaller/agents")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        try {
          const { data, error } = await auth.db
            .from("sales_agents")
            .select("id,full_name")
            .eq("is_active", true)
            .order("full_name");
          if (error) return json({ error: error.message }, 500);
          return json(stripMaskedFieldsDeep({ agents: data ?? [] }));
        } catch (err) {
          console.error("telecaller/agents error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
