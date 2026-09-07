import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, requireAdmin } from "@/lib/supabase-admin.server";

// POST /api/admin/content/set-image
// Auth: staff (admin or owner). Body: { id, image_url }
//
// Records the rendered quote-card PNG's Cloudinary URL on a post. The
// card is rendered + uploaded client-side (canvas → signed Cloudinary
// upload); this just persists the resulting public URL so the publish
// flow / cron can find it. Only accepts https Cloudinary URLs.

const BodySchema = z.object({
  id: z.string().uuid(),
  image_url: z.string().url().max(1000),
});

export const Route = createFileRoute("/api/admin/content/set-image")({
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

        if (!/^https:\/\/res\.cloudinary\.com\//.test(body.image_url)) {
          return json({ error: "image_url must be a Cloudinary https URL" }, 400);
        }

        try {
          const { data, error } = await auth.db
            .from("content_posts")
            .update({ image_url: body.image_url })
            .eq("id", body.id)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          if (!data) return json({ error: "Post not found" }, 404);
          return json({ ok: true });
        } catch (err) {
          console.error("content/set-image error:", err);
          return json({ error: err instanceof Error ? err.message : "Update failed" }, 500);
        }
      },
    },
  },
});
