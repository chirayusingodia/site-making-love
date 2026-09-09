import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, requireAdmin } from "@/lib/supabase-admin.server";
import { generateContent } from "@/lib/gemini.server";
import { PLAYBOOK_SYSTEM_PROMPT, buildGenerationPrompt } from "@/lib/content-playbook";

// POST /api/admin/content/generate
// Auth: staff (admin or owner).
// Body: { format: 'reel'|'card'|'carousel', pillar?, topic? }
//
// Runs Gemini against the immortaltalks-model playbook and returns ONE
// structured bilingual content object. Nothing is persisted here — the
// UI previews it, the owner edits, then calls /save. Keeping generate
// stateless lets the owner regenerate freely without DB churn.

const BodySchema = z.object({
  format: z.enum(["reel", "card", "carousel"]),
  pillar: z.enum(["mirror", "mind", "detachment", "parable", "stillness", "custom"]).optional(),
  topic: z.string().max(500).optional(),
  // Verified against live immortaltalks posts (2026-09-09): wisdom posts
  // carry an EMPTY caption; only an explicit promo post gets one plain
  // line. Defaults to false so "Generate" always produces the normal,
  // caption-less wisdom post unless the owner opts into a promo.
  promo: z.boolean().optional(),
});

export const Route = createFileRoute("/api/admin/content/generate")({
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

        try {
          const userPrompt = buildGenerationPrompt({
            format: body.format,
            pillar: body.pillar,
            topic: body.topic,
            promo: body.promo,
          });
          const { content, model } = await generateContent({
            systemPrompt: PLAYBOOK_SYSTEM_PROMPT,
            userPrompt,
          });
          return json({ content, model });
        } catch (err) {
          console.error("content/generate error:", err);
          return json({ error: err instanceof Error ? err.message : "Generation failed" }, 500);
        }
      },
    },
  },
});
