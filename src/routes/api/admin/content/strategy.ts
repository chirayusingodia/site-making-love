import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin } from "@/lib/supabase-admin.server";
import { generateText } from "@/lib/gemini.server";
import { PLAYBOOK_SYSTEM_PROMPT } from "@/lib/content-playbook";

// POST /api/admin/content/strategy
// Auth: staff (admin or owner). Body: none.
//
// Reads the most recent cached snapshot per account (from
// social_snapshots), ranks each account's posts by likes, and asks
// Gemini for a data-driven strategy: which topics/formats earn the most
// engagement and what Punyata should post more of. Returns markdown.
//
// Requires /analyze to have run at least once (so snapshots exist) and
// GEMINI_API_KEY to be set.

interface SnapRow {
  account: string;
  ig_username: string | null;
  followers: number | null;
  fetched_at: string;
  media: Array<{
    caption: string | null;
    media_type: string | null;
    like_count: number;
    comments_count: number;
    permalink: string | null;
    timestamp: string | null;
  }>;
}

export const Route = createFileRoute("/api/admin/content/strategy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);

        // Latest 20 snapshots; keep the newest per account.
        const { data, error } = await auth.db
          .from("social_snapshots")
          .select("account,ig_username,followers,fetched_at,media")
          .order("fetched_at", { ascending: false })
          .limit(20);
        if (error) {
          return json({ error: error.message }, 500);
        }

        const latest = new Map<string, SnapRow>();
        for (const row of (data ?? []) as SnapRow[]) {
          if (!latest.has(row.account)) latest.set(row.account, row);
        }
        if (latest.size === 0) {
          return json({ error: "No analysis yet — run Analyze first." }, 400);
        }

        // Compact each account: top 10 posts by likes, trimmed captions.
        const digest = [...latest.values()].map((snap) => {
          const ranked = [...snap.media]
            .sort((a, b) => b.like_count - a.like_count)
            .slice(0, 10)
            .map((m) => ({
              type: m.media_type,
              likes: m.like_count,
              comments: m.comments_count,
              caption: (m.caption ?? "").replace(/\s+/g, " ").slice(0, 180),
            }));
          return {
            account: snap.account,
            followers: snap.followers,
            top_posts: ranked,
          };
        });

        const userPrompt = [
          "Here is public Instagram performance data (posts ranked by likes).",
          "'self' is Punyata's own account; the others are reference accounts we model.",
          "",
          JSON.stringify(digest, null, 2),
          "",
          "As Punyata's strategist, give a concise, actionable strategy in markdown:",
          "1. Which TOPICS/themes earn the most likes (with evidence from the data).",
          "2. Which FORMATS (reel/image/carousel) perform best.",
          "3. What Punyata should post MORE of, and what to drop.",
          "4. 5 concrete next post ideas (topic + format) aligned to the winners.",
          "Keep it tight and specific — no fluff.",
        ].join("\n");

        try {
          const { text, model } = await generateText({
            systemPrompt: PLAYBOOK_SYSTEM_PROMPT,
            userPrompt,
          });
          return json({ strategy: text, model, accounts: [...latest.keys()] });
        } catch (err) {
          console.error("content/strategy error:", err);
          return json({ error: err instanceof Error ? err.message : "Strategy failed" }, 500);
        }
      },
    },
  },
});
