import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner, writeTelecallerAudit } from "@/lib/supabase-admin.server";

// POST /api/admin/sales-agents/create
// Auth: OWNER only. Body: { fullName, phone? }
//
// Closes the other manual-SQL gap (sales_agents had a LIST endpoint
// and nothing else): the owner adds a new field agent to the roster
// from the Staff Roles page. Portal LOGIN is a separate, explicit
// step via /api/admin/staff/create-staff {role:'agent', salesAgentId}
// so attribution linkage stays visible and audited on its own.

export const Route = createFileRoute("/api/admin/sales-agents/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);

        let body: { fullName?: unknown; phone?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const fullName =
          typeof body.fullName === "string" && body.fullName.trim()
            ? body.fullName.trim().slice(0, 120)
            : null;
        if (!fullName) return json({ error: "Agent ka naam zaroori hai" }, 400);

        const phoneRaw = typeof body.phone === "string" ? body.phone.replace(/[\s()-]/g, "") : "";
        const phoneMatch = /^(?:\+91|0)?([6-9]\d{9})$/.exec(phoneRaw);
        if (body.phone && !phoneMatch) {
          return json({ error: `Phone "${body.phone}" sahi Indian number nahi hai` }, 400);
        }
        const phoneE164 = phoneMatch ? `+91${phoneMatch[1]}` : null;

        const { db, staffId } = gate.auth;

        try {
          // agent_code is NOT NULL UNIQUE with no default — generate
          // BEFORE insert. Name-derived prefix + random tail keeps it
          // readable (FM_RAHUL01-style convention) and collision-free.
          const codeBase = fullName
            .toUpperCase()
            .replace(/[^A-Z]/g, "")
            .slice(0, 6)
            .padEnd(3, "X");
          const agentCode = `${codeBase}_${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

          const { data: agentRow, error: insErr } = await db
            .from("sales_agents")
            .insert({
              full_name: fullName,
              agent_code: agentCode,
              ...(phoneE164 ? { phone: phoneE164 } : {}),
            })
            .select("id,full_name,phone,agent_code,is_active")
            .single();
          if (insErr || !agentRow) return json({ error: insErr?.message ?? "Insert failed" }, 500);

          await writeTelecallerAudit(
            db,
            staffId,
            "admin.sales_agents.created",
            "sales_agents",
            agentRow.id,
            {
              full_name: fullName,
              phone: phoneE164,
            },
          );

          return json({
            ok: true,
            agent: agentRow,
            note: "Roster mein add ho gaya. Login chahiye to 'Add Agent Login' use karein.",
          });
        } catch (err) {
          console.error("sales-agents/create error:", err);
          return json({ error: err instanceof Error ? err.message : "Create failed" }, 500);
        }
      },
    },
  },
});
