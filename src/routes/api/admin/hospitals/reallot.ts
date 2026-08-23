import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin } from "@/lib/supabase-admin.server";

// POST /api/admin/hospitals/reallot
// Auth: staff. Body: { hospital_id, agent_id, reason? }
//
// §4.4 — atomically closes the current allotment and opens a new one
// via reallot_hospital() (SECURITY DEFINER, C1-revoked; service role
// only). The exclusion constraint in migration 014 is the hard safety
// net against double-allotment.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/admin/hospitals/reallot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);

        let body: { hospital_id?: unknown; agent_id?: unknown; reason?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const hospitalId =
          typeof body.hospital_id === "string" && UUID_RE.test(body.hospital_id)
            ? body.hospital_id
            : "";
        const agentId =
          typeof body.agent_id === "string" && UUID_RE.test(body.agent_id) ? body.agent_id : "";
        if (!hospitalId || !agentId) {
          return json({ error: "hospital_id aur agent_id zaroori hain" }, 400);
        }
        const reason =
          typeof body.reason === "string" &&
          ["allotment", "reallotment", "correction"].includes(body.reason)
            ? body.reason
            : "reallotment";

        try {
          // Validate both sides exist before handing them to the RPC.
          const [hosp, agent] = await Promise.all([
            auth.db.from("hospitals").select("id,is_active").eq("id", hospitalId).maybeSingle(),
            auth.db.from("sales_agents").select("id,is_active").eq("id", agentId).maybeSingle(),
          ]);
          if (!hosp.data) return json({ error: "Hospital not found" }, 404);
          if (!agent.data) return json({ error: "Agent not found" }, 404);
          if (!agent.data.is_active) return json({ error: "Agent inactive hai" }, 422);

          const { error: rpcErr } = await auth.db.rpc("reallot_hospital", {
            p_hospital: hospitalId,
            p_agent: agentId,
            p_reason: reason,
            // §4 (REVIEW): service-role connections have auth.uid() =
            // NULL — pass the acting staff member so set_by and the
            // audit admin_id name a human.
            p_set_by: auth.staffId,
          });
          if (rpcErr) {
            // Exclusion violation or anything else — surface verbatim to
            // the admin UI; these are staff-facing operational errors.
            return json({ error: rpcErr.message }, 409);
          }

          return json({ ok: true });
        } catch (err) {
          console.error("admin/hospitals/reallot error:", err);
          return json({ error: err instanceof Error ? err.message : "Reallot failed" }, 500);
        }
      },
    },
  },
});
