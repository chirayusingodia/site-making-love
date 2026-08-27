import { createFileRoute } from "@tanstack/react-router";
import { json, requireAgent } from "@/lib/supabase-admin.server";

// POST /api/agent/my-leads
// Gate: requireAgent. Body: { status?: string } (optional filter)
//
// The agent's OWN uploaded numbers with where each one stands —
// 'assigned' means a telecaller is calling it, 'converted' means the
// family joined. Phones are returned in full: she collected these
// numbers herself on paper; hiding them would break her follow-up.
// READ-ONLY — like every other panel read, never audited; only
// mutations write to audit_logs in this codebase.
export const Route = createFileRoute("/api/agent/my-leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAgent(request);
        if (!auth) return json({ error: "Agent login required" }, 401);
        if (!auth.salesAgentId) {
          return json(
            { error: "Aapki agent ID linked nahi hai — Chirayu se contact karein." },
            403,
          );
        }

        let body: { status?: unknown } = {};
        try {
          body = await request.json();
        } catch {
          /* optional */
        }
        const ALLOWED = new Set([
          "new",
          "assigned",
          "in_progress",
          "link_sent",
          "converted",
          "not_interested",
          "unreachable",
          "wrong_number",
          "duplicate",
          "expired",
        ]);
        const status =
          typeof body.status === "string" && ALLOWED.has(body.status) ? body.status : null;

        try {
          let q = auth.db
            .from("leads")
            .select("id,full_name,phone,city,status,family_names,assigned_on,created_at")
            .eq("source_agent_id", auth.salesAgentId)
            .order("created_at", { ascending: false })
            .limit(100);
          if (status) q = q.eq("status", status);

          const { data, error } = await q;
          if (error) return json({ error: error.message }, 500);

          return json({ ok: true, rows: data ?? [] });
        } catch (err) {
          console.error("agent/my-leads error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
