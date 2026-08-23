import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin } from "@/lib/supabase-admin.server";

// POST /api/admin/hospitals/list
// Auth: staff. Returns every hospital with its CURRENT allotting agent.
export const Route = createFileRoute("/api/admin/hospitals/list")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);

        try {
          const [hospitalsRes, allotmentsRes, agentsRes] = await Promise.all([
            auth.db.from("hospitals").select("id,name,city,notes,is_active").order("name"),
            auth.db
              .from("agent_hospital_allotments")
              .select("hospital_id,agent_id,allotted_from,allotted_to")
              .is("allotted_to", null),
            auth.db.from("sales_agents").select("id,full_name").eq("is_active", true),
          ]);
          for (const r of [hospitalsRes, allotmentsRes, agentsRes]) {
            if (r.error) return json({ error: r.error.message }, 500);
          }

          const agentNames = new Map(
            (agentsRes.data ?? []).map((a) => [a.id as string, a.full_name as string | null]),
          );
          const currentAgent = new Map(
            (allotmentsRes.data ?? []).map((a) => [
              a.hospital_id as string,
              {
                agentId: a.agent_id as string,
                agentName: agentNames.get(a.agent_id as string) ?? null,
                since: a.allotted_from as string,
              },
            ]),
          );

          return json({
            hospitals: (hospitalsRes.data ?? []).map((h) => ({
              ...(h as {
                id: string;
                name: string;
                city: string | null;
                notes: string | null;
                is_active: boolean;
              }),
              currentAgent: currentAgent.get((h as { id: string }).id) ?? null,
            })),
          });
        } catch (err) {
          console.error("admin/hospitals/list error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
