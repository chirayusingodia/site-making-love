import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner, writeTelecallerAudit } from "@/lib/supabase-admin.server";

// POST /api/admin/staff/set-role
// Auth: OWNER only. Body: { userId: uuid, role: 'admin' | 'user' }
//
// Owner UI staff management (complements the manual-SQL convention of
// migrations 006/012 — the UI handles the everyday user↔admin flips;
// owner promotion stays a deliberate hand-run action and is BLOCKED
// here so the last owner can never be locked out by accident).
//
// The write runs on the SERVICE-ROLE client: it carries no user JWT,
// so auth.uid() is null and trg_profiles_role_write_guard (migration
// 018) lets the change through. The caller's OWN authority was already
// proven by requireOwner() — never swap this for getUserClient(token),
// or RLS ("user updates own" row scope) would reject every target.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/admin/staff/set-role")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);

        let body: { userId?: unknown; role?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const userId =
          typeof body.userId === "string" && UUID_RE.test(body.userId) ? body.userId : "";
        if (!userId) return json({ error: "userId must be a uuid" }, 400);

        const role = typeof body.role === "string" ? body.role : "";
        if (role !== "admin" && role !== "user") {
          return json({ error: "role must be 'admin' or 'user'" }, 400);
        }

        const { db, staffId } = gate.auth;

        try {
          const { data: target, error: fetchErr } = await db
            .from("profiles")
            .select("id, full_name, email, role")
            .eq("id", userId)
            .maybeSingle();
          if (fetchErr) return json({ error: fetchErr.message }, 500);
          if (!target) return json({ error: "Profile not found" }, 404);

          if (target.id === staffId) {
            return json({ error: "You cannot change your own role here." }, 400);
          }
          // Owner rows are untouchable from the UI — promotion to owner
          // is the audited manual SQL step (migration 006), and no one
          // can demote the last owner into a lockout.
          if (target.role === "owner") {
            return json(
              { error: "Owner roles are managed manually via SQL (migration 006 convention)." },
              400,
            );
          }
          if (role === "user" && target.role !== "admin") {
            return json({ error: `Only admins can be removed (this user is '${target.role}').` }, 400);
          }
          if (target.role === role) {
            return json({ ok: true, unchanged: true, userId, role });
          }

          const { error: updErr } = await db
            .from("profiles")
            .update({ role, updated_at: new Date().toISOString() })
            .eq("id", userId);
          if (updErr) return json({ error: updErr.message }, 500);

          await writeTelecallerAudit(db, staffId, "admin.staff.role_change", "profiles", userId, {
            from_role: target.role,
            to_role: role,
            email: target.email,
            full_name: target.full_name,
          });

          return json({ ok: true, userId, fromRole: target.role, role });
        } catch (err) {
          console.error("staff/set-role error:", err);
          return json({ error: err instanceof Error ? err.message : "Update failed" }, 500);
        }
      },
    },
  },
});
