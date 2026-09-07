import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, requireAdmin } from "@/lib/supabase-admin.server";
import { publishCardPost, type PublishablePost } from "@/lib/content-publish.server";

// POST /api/admin/content/publish
// Auth: staff (admin or owner). Body: { id, language: 'en'|'hi' }
//
// Publishes a rendered card post to Instagram immediately. Reads the
// post, publishes via the shared helper (caption in the chosen
// language), and returns the new media id + permalink. Reels and
// carousels are rejected here — they stay manual.

const BodySchema = z.object({
  id: z.string().uuid(),
  language: z.enum(["en", "hi"]).default("en"),
});

export const Route = createFileRoute("/api/admin/content/publish")({
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

        const { data, error } = await auth.db
          .from("content_posts")
          .select("id,format,status,image_url,content")
          .eq("id", body.id)
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "Post not found" }, 404);

        try {
          const result = await publishCardPost(auth.db, data as PublishablePost, body.language);
          return json({ ok: true, media_id: result.mediaId, permalink: result.permalink });
        } catch (err) {
          console.error("content/publish error:", err);
          return json({ error: err instanceof Error ? err.message : "Publish failed" }, 500);
        }
      },
    },
  },
});
