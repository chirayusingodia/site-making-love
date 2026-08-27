import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner, writeTelecallerAudit } from "@/lib/supabase-admin.server";

// GET  /api/admin/leads/routing        — list every route with names
// POST /api/admin/leads/routing        — set/clear ONE agent's route
// Auth: OWNER only (staff assignment policy — admins see the leads
// page but routing decides whose tray fills, an owner decision).
//
// Body for POST: { salesAgentId: uuid, telecallerId?: uuid }
//   telecallerId present → upsert ACTIVE route (one per agent)
//   telecallerId absent  → clear the route (lead falls back to the
//                           daily manual assignment pool)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleList(request: Request) {
  const gate = await requireOwner(request);
  if (!gate.ok) return json({ error: gate.error }, gate.status);
  const { db } = gate.auth;

  // Two base lists + one join-free merge keeps PostgREST embeds out
  // of a table that has no FK to profiles (telecaller_id → auth.users
  // only). Names resolved in app code, capped at roster size.
  const [routesRes, agentsRes, callersRes] = await Promise.all([
    db.from("lead_routing").select("*").order("created_at", { ascending: true }),
    db.from("sales_agents").select("id,full_name"),
    db.from("profiles").select("id,full_name").in("role", ["telecaller", "admin", "owner"]),
  ]);
  if (routesRes.error) return json({ error: routesRes.error.message }, 500);

  const agentNames = new Map((agentsRes.data ?? []).map((a) => [a.id as string, a.full_name]));
  const callerNames = new Map((callersRes.data ?? []).map((p) => [p.id as string, p.full_name]));

  const routes = (routesRes.data ?? []).map((r) => ({
    id: r.id as string,
    salesAgentId: r.sales_agent_id as string,
    agentName: agentNames.get(r.sales_agent_id as string) ?? "(agent removed)",
    telecallerId: r.telecaller_id as string,
    telecallerName: callerNames.get(r.telecaller_id as string) ?? "(account removed)",
    isActive: r.is_active as boolean,
  }));
  // Full rosters so the UI can render both dropdowns from ONE fetch:
  // every agent that can be routed and every seat that can receive.
  return json({
    ok: true,
    routes,
    agents: (agentsRes.data ?? []).map((a) => ({ id: a.id, fullName: a.full_name })),
    telecallers: (callersRes.data ?? []).map((p) => ({ id: p.id, fullName: p.full_name })),
  });
}

export const Route = createFileRoute("/api/admin/leads/routing")({
  server: {
    handlers: {
      GET: ({ request }) => handleList(request),
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);
        if (new URL(request.url).searchParams.get("list") === "1") return handleList(request);

        const { db, staffId } = gate.auth;

        let body: { salesAgentId?: unknown; telecallerId?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const salesAgentId =
          typeof body.salesAgentId === "string" && UUID_RE.test(body.salesAgentId)
            ? body.salesAgentId
            : "";
        if (!salesAgentId) return json({ error: "salesAgentId must be a uuid" }, 400);

        const telecallerId =
          typeof body.telecallerId === "string" && UUID_RE.test(body.telecallerId)
            ? body.telecallerId
            : null;

        try {
          const { data: agentRow } = await db
            .from("sales_agents")
            .select("id,full_name")
            .eq("id", salesAgentId)
            .maybeSingle();
          if (!agentRow) return json({ error: "Sales agent not found" }, 404);

          if (!telecallerId) {
            const { error } = await db
              .from("lead_routing")
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq("sales_agent_id", salesAgentId);
            if (error) return json({ error: error.message }, 500);

            await writeTelecallerAudit(
              db,
              staffId,
              "admin.leads.routing_cleared",
              "lead_routing",
              null,
              {
                sales_agent_id: salesAgentId,
                agent_name: agentRow.full_name,
              },
            );
            return json({ ok: true, cleared: true });
          }

          // The target must actually be a callable seat.
          const { data: seat } = await db
            .from("profiles")
            .select("id,role")
            .eq("id", telecallerId)
            .maybeSingle();
          if (!seat || !["telecaller", "admin", "owner"].includes(seat.role as string)) {
            return json({ error: "Target telecaller account nahi hai" }, 400);
          }

          const { error } = await db.from("lead_routing").upsert(
            {
              sales_agent_id: salesAgentId,
              telecaller_id: telecallerId,
              is_active: true,
              set_by: staffId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "sales_agent_id" },
          );
          if (error) return json({ error: error.message }, 500);

          await writeTelecallerAudit(db, staffId, "admin.leads.routing_set", "lead_routing", null, {
            sales_agent_id: salesAgentId,
            agent_name: agentRow.full_name,
            telecaller_id: telecallerId,
          });

          return json({ ok: true, cleared: false });
        } catch (err) {
          console.error("admin/leads/routing error:", err);
          return json({ error: err instanceof Error ? err.message : "Routing failed" }, 500);
        }
      },
    },
  },
});
