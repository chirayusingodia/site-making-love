import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin, writeTelecallerAudit } from "@/lib/supabase-admin.server";

// POST /api/admin/hospitals/create
// Auth: staff. Body: { name, city?, notes? }
export const Route = createFileRoute("/api/admin/hospitals/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);

        let body: { name?: unknown; city?: unknown; notes?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const name = typeof body.name === "string" ? body.name.trim().slice(0, 160) : "";
        if (name.length < 2) return json({ error: "Hospital ka naam zaroori hai" }, 400);

        try {
          const { data, error } = await auth.db
            .from("hospitals")
            .insert({
              name,
              city:
                typeof body.city === "string" && body.city.trim()
                  ? body.city.trim().slice(0, 80)
                  : null,
              notes:
                typeof body.notes === "string" && body.notes.trim()
                  ? body.notes.trim().slice(0, 1000)
                  : null,
              created_by: auth.staffId,
            })
            .select("id")
            .single();
          if (error) return json({ error: error.message }, 500);

          await writeTelecallerAudit(
            auth.db,
            auth.staffId,
            "admin.hospital.created",
            "hospitals",
            data.id as string,
            { name },
          );

          return json({ ok: true, id: data.id });
        } catch (err) {
          console.error("admin/hospitals/create error:", err);
          return json({ error: err instanceof Error ? err.message : "Create failed" }, 500);
        }
      },
    },
  },
});
