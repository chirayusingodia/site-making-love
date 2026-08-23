import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { stripMaskedFieldsDeep } from "@/lib/telecaller-logic";

// POST /api/telecaller/lead/update
// Gate: requireTelecaller. Body: { lead_id, status }
//
// The ONLY lead-status transitions a telecaller may make — the
// outcomes of her own work. 'converted' is set by the system when a
// subscription actually activates against the lead's profile;
// 'duplicate'/'expired' are admin/sweep decisions. Attribution is
// NEVER editable here (§5.7).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED = new Set([
  "in_progress",
  "link_sent",
  "not_interested",
  "unreachable",
  "wrong_number",
]);

export const Route = createFileRoute("/api/telecaller/lead/update")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        let body: { lead_id?: unknown; status?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const leadId =
          typeof body.lead_id === "string" && UUID_RE.test(body.lead_id) ? body.lead_id : "";
        if (!leadId) return json({ error: "lead_id must be a uuid" }, 400);
        const nextStatus =
          typeof body.status === "string" && ALLOWED.has(body.status) ? body.status : "";
        if (!nextStatus) return json({ error: "Status allowed nahi hai" }, 400);

        try {
          const { data: lead, error: lErr } = await auth.db
            .from("leads")
            .select("id,status,assigned_to,created_by")
            .eq("id", leadId)
            .maybeSingle();
          if (lErr) return json({ error: lErr.message }, 500);
          if (!lead) return json({ error: "Lead not found" }, 404);

          const hers = lead.assigned_to === auth.callerId || lead.created_by === auth.callerId;
          const privilegedSeat = auth.role === "admin" || auth.role === "owner";
          if (!hers && !privilegedSeat) {
            return json({ error: "Yeh lead aapko assign nahi hui" }, 403);
          }

          const { error: uErr } = await auth.db
            .from("leads")
            .update({ status: nextStatus, updated_at: new Date().toISOString() })
            .eq("id", leadId);
          if (uErr) return json({ error: uErr.message }, 500);

          await writeTelecallerAudit(
            auth.db,
            auth.callerId,
            "telecaller.lead.status",
            "leads",
            leadId,
            {
              before: lead.status,
              after: nextStatus,
            },
          );

          return json(stripMaskedFieldsDeep({ ok: true }));
        } catch (err) {
          console.error("telecaller/lead/update error:", err);
          return json({ error: err instanceof Error ? err.message : "Update failed" }, 500);
        }
      },
    },
  },
});
