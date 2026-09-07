import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, requireAdmin } from "@/lib/supabase-admin.server";

// POST /api/admin/content/list
// Auth: staff (admin or owner).
// Body: { status?: 'draft'|'approved'|'posted' }
//
// Returns saved content_posts, newest first. Optional status filter
// powers the Library tab's Draft / Approved / Posted views.

const BodySchema = z.object({
  status: z.enum(["draft", "approved", "posted"]).optional(),
});

export const Route = createFileRoute("/api/admin/content/list")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);

        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse((await request.json().catch(() => ({}))) ?? {});
        } catch {
          return json({ error: "Invalid request body" }, 400);
        }

        try {
          let q = auth.db
            .from("content_posts")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(200);
          if (body.status) q = q.eq("status", body.status);

          const { data, error } = await q;
          if (error) throw error;
          return json({ posts: data ?? [] });
        } catch (err) {
          console.error("content/list error:", err);
          return json({ error: err instanceof Error ? err.message : "List failed" }, 500);
        }
      },
    },
  },
});
