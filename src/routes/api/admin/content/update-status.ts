import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, requireAdmin } from "@/lib/supabase-admin.server";

// POST /api/admin/content/update-status
// Auth: staff (admin or owner).
// Body: { id, status?, scheduled_for? }
//
// Moves a post through draft → approved → posted and/or sets its
// scheduled date. Setting status to 'posted' stamps posted_at; moving
// it back off 'posted' clears that stamp so the field stays truthful.

const BodySchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "approved", "posted"]).optional(),
  scheduled_for: z.string().nullish(),
});

export const Route = createFileRoute("/api/admin/content/update-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);

        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch {
          return json({ error: "Invalid request body" }, 400);
        }

        const patch: Record<string, unknown> = {};
        if (body.status) {
          patch.status = body.status;
          patch.posted_at = body.status === "posted" ? new Date().toISOString() : null;
        }
        if (body.scheduled_for !== undefined) {
          patch.scheduled_for = body.scheduled_for || null;
        }
        if (Object.keys(patch).length === 0) {
          return json({ error: "Nothing to update" }, 400);
        }

        try {
          const { data, error } = await auth.db
            .from("content_posts")
            .update(patch)
            .eq("id", body.id)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          if (!data) return json({ error: "Post not found" }, 404);
          return json({ ok: true });
        } catch (err) {
          console.error("content/update-status error:", err);
          return json({ error: err instanceof Error ? err.message : "Update failed" }, 500);
        }
      },
    },
  },
});
