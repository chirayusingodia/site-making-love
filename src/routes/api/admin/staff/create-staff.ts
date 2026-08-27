import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner, writeTelecallerAudit } from "@/lib/supabase-admin.server";

// POST /api/admin/staff/create-staff
// Auth: OWNER only. Body:
//   { role: 'telecaller' | 'agent' | 'admin',
//     fullName, email,
//     salesAgentId?: uuid   // REQUIRED for role='agent'
//   }
//
// Closes the last manual-SQL gap (migration 012/013 conventions):
// the owner creates a staff LOGIN from the Staff Roles page.
//
//  1. auth.admin.createUser with email_confirm:true — the person
//     then signs in on /login via the normal email-OTP flow. No
//     password is issued or stored; there is nothing to leak.
//  2. The profiles row is inserted server-side with the target
//     role. Service-role insert carries no user JWT, so the
//     profiles_role_write_guard trigger (migration 018) lets it
//     through — exactly how legitimate promotions happen.
//  3. role='agent' additionally requires a sales_agents row link;
//     the portal endpoints refuse to serve an unlinked agent.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_ROLES = new Set(["telecaller", "agent", "admin"]);

export const Route = createFileRoute("/api/admin/staff/create-staff")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);

        let body: { role?: unknown; fullName?: unknown; email?: unknown; salesAgentId?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const role = typeof body.role === "string" && ALLOWED_ROLES.has(body.role) ? body.role : "";
        if (!role) return json({ error: "role must be telecaller | agent | admin" }, 400);

        const fullName =
          typeof body.fullName === "string" && body.fullName.trim()
            ? body.fullName.trim().slice(0, 120)
            : null;
        if (!fullName) return json({ error: "Naam zaroori hai" }, 400);

        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (!EMAIL_RE.test(email)) return json({ error: "Email sahi nahi hai" }, 400);

        const salesAgentId =
          typeof body.salesAgentId === "string" && UUID_RE.test(body.salesAgentId)
            ? body.salesAgentId
            : null;
        if (role === "agent" && !salesAgentId) {
          return json({ error: "Agent login ke liye sales_agents row chunna zaroori hai" }, 400);
        }

        const { db, staffId } = gate.auth;

        try {
          if (salesAgentId) {
            const { data: agentRow } = await db
              .from("sales_agents")
              .select("id,is_active")
              .eq("id", salesAgentId)
              .maybeSingle();
            if (!agentRow) return json({ error: "Sales agent not found" }, 404);

            // One login per agents roster row — a second would split
            // attribution across two accounts silently.
            const { data: taken } = await db
              .from("profiles")
              .select("id")
              .eq("sales_agent_id", salesAgentId)
              .maybeSingle();
            if (taken) {
              return json({ error: "Is agent ka login pehle se bana hua hai" }, 409);
            }
          }

          // Email already registered? createUser errors otherwise.
          const { data: created, error: createErr } = await db.auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          });
          if (createErr || !created?.user) {
            const msg = createErr?.message ?? "User create fail";
            const friendly = /already|exists|duplicate/i.test(msg)
              ? "Is email ka account pehle se hai — Staff Roles list mein dhoondein."
              : msg;
            return json({ error: friendly }, createErr?.status === 422 ? 409 : 500);
          }
          const userId = created.user.id;

          const { error: profErr } = await db.from("profiles").insert({
            id: userId,
            full_name: fullName,
            email,
            role,
            ...(salesAgentId ? { sales_agent_id: salesAgentId } : {}),
          });
          if (profErr) {
            // Orphan auth user without a profile is worse than no
            // user at all — roll the auth row back before failing.
            await db.auth.admin.deleteUser(userId);
            return json({ error: `Profile bani nahi: ${profErr.message}` }, 500);
          }

          await writeTelecallerAudit(db, staffId, "admin.staff.created_login", "profiles", userId, {
            role,
            email,
            full_name: fullName,
            sales_agent_id: salesAgentId,
          });

          return json({
            ok: true,
            userId,
            role,
            note: `${fullName} ab /login par apne email se OTP login kar sakte hain.`,
          });
        } catch (err) {
          console.error("staff/create-staff error:", err);
          return json({ error: err instanceof Error ? err.message : "Create failed" }, 500);
        }
      },
    },
  },
});
