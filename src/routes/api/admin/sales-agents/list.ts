import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin } from "@/lib/supabase-admin.server";
import {
  AGENT_MASKED_FIELDS,
  maskAgentRowsForRole,
  type SalesAgentRow,
  type SalesAgentsListResponse,
} from "@/lib/sales-agents-logic";
import { fetchAllRows } from "@/lib/supabase";

// POST /api/admin/sales-agents/list
// Body: {} (no params — full active+inactive roster with counts)
//
// Staff-gated (admin OR owner), ROLE-SHAPED response:
//   owner → all columns incl. commission_percent
//   admin → commission_percent nulled SERVER-SIDE (Task 6) — name,
//           phone, agent_code, is_active and the attributed
//           subscription COUNT remain visible for operational
//           agent management.
//
// NOTE (Task 6 flag): no Sales Agents Manager UI exists yet
// (Session 5 unbuilt). This endpoint is the pre-gated data path
// that UI must consume when it lands — commission never travels
// to an admin-role caller, even via devtools.

export const Route = createFileRoute("/api/admin/sales-agents/list")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);
        const { role, db } = auth;

        try {
          // [Pass-2 P7] attribution counts page through the ~1000-row
          // PostgREST cap (fetchAllRows) — unpaged counts silently
          // freeze once attributed subscriptions pass a thousand.
          const [agentsRes, subsAll] = await Promise.all([
            db
              .from("sales_agents")
              .select("id, full_name, phone, agent_code, commission_percent, is_active, created_at")
              .order("full_name"),
            // Count of subscriptions attributed to each agent.
            // PostgREST can't GROUP BY, so aggregate in JS from the
            // leanest possible projection.
            fetchAllRows<{ sales_agent_id: string | null }>((from, to) =>
              db
                .from("subscriptions")
                .select("sales_agent_id")
                .not("sales_agent_id", "is", null)
                .range(from, to),
            ),
          ]);

          if (agentsRes.error) throw new Error(`sales_agents: ${agentsRes.error.message}`);
          if (subsAll.error) throw new Error(`subscriptions: ${subsAll.error}`);

          const counts = new Map<string, number>();
          for (const s of subsAll.data) {
            const id = s.sales_agent_id as string;
            counts.set(id, (counts.get(id) ?? 0) + 1);
          }

          const rows: SalesAgentRow[] = (agentsRes.data || []).map((a) => ({
            id: a.id,
            full_name: a.full_name,
            phone: a.phone,
            agent_code: a.agent_code,
            commission_percent: a.commission_percent,
            is_active: a.is_active,
            created_at: a.created_at,
            subscriptionCount: counts.get(a.id) ?? 0,
          }));

          const response: SalesAgentsListResponse = {
            viewerRole: role,
            maskedFields: role === "owner" ? [] : [...AGENT_MASKED_FIELDS],
            rows: maskAgentRowsForRole(rows, role),
          };
          return json(response);
        } catch (err) {
          console.error("sales-agents/list error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
