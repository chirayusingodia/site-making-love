import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, requireAdmin } from "@/lib/supabase-admin.server";

// POST /api/admin/content/save
// Auth: staff (admin or owner).
// Body: { id?, topic?, pillar?, format, status?, scheduled_for?, content, model? }
//
// Upsert a drafted post. With `id` it updates the row (owner edited a
// preview then saved); without, it inserts a new draft. `content` is
// the full bilingual GeneratedContent object; it is stored verbatim as
// jsonb — treated as data, never executed.

const ContentSchema = z.object({
  on_screen: z.object({ en: z.string(), hi: z.string() }),
  caption: z.object({ en: z.string(), hi: z.string() }),
  hooks: z.array(z.string()),
  reel_script: z.object({ en: z.string(), hi: z.string() }),
  carousel: z.object({ en: z.array(z.string()), hi: z.array(z.string()) }),
  hashtags: z.object({ en: z.array(z.string()), hi: z.array(z.string()) }),
  cta: z.object({ en: z.string(), hi: z.string() }),
});

const BodySchema = z.object({
  id: z.string().uuid().optional(),
  topic: z.string().max(500).nullish(),
  pillar: z.enum(["mirror", "mind", "detachment", "parable", "stillness", "custom"]).nullish(),
  format: z.enum(["reel", "card", "carousel"]),
  status: z.enum(["draft", "approved", "posted"]).optional(),
  scheduled_for: z.string().nullish(),
  content: ContentSchema,
  model: z.string().nullish(),
});

export const Route = createFileRoute("/api/admin/content/save")({
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

        const row = {
          topic: body.topic ?? null,
          pillar: body.pillar ?? null,
          format: body.format,
          status: body.status ?? "draft",
          scheduled_for: body.scheduled_for || null,
          content: body.content,
          model: body.model ?? null,
          source: "gemini",
        };

        try {
          if (body.id) {
            const { data, error } = await auth.db
              .from("content_posts")
              .update(row)
              .eq("id", body.id)
              .select("id")
              .maybeSingle();
            if (error) throw error;
            if (!data) return json({ error: "Post not found" }, 404);
            return json({ id: data.id });
          }

          const { data, error } = await auth.db
            .from("content_posts")
            .insert({ ...row, created_by: auth.staffId })
            .select("id")
            .single();
          if (error) throw error;
          return json({ id: data.id });
        } catch (err) {
          console.error("content/save error:", err);
          return json({ error: err instanceof Error ? err.message : "Save failed" }, 500);
        }
      },
    },
  },
});
