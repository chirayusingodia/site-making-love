import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, requireAdmin } from "@/lib/supabase-admin.server";
import {
  getMetaConfig,
  fetchSelfSnapshot,
  fetchCompetitorSnapshot,
  type AccountSnapshot,
} from "@/lib/meta.server";

// POST /api/admin/content/analyze
// Auth: staff (admin or owner).
// Body: { competitors?: string[] }  (default ['immortaltalks'])
//
// Pulls our own page (media + like/comment + best-effort saved/reach)
// and each competitor's PUBLIC data via Business Discovery, caches each
// as a social_snapshots row, and returns them for the Analyze tab.
// Failures on a single competitor are reported per-account, not fatal —
// so one bad username can't sink the whole refresh.

const BodySchema = z.object({
  competitors: z.array(z.string().min(1).max(60)).max(5).optional(),
});

export const Route = createFileRoute("/api/admin/content/analyze")({
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

        let cfg;
        try {
          cfg = getMetaConfig();
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : "Meta not configured" }, 500);
        }

        const competitors = body.competitors ?? ["immortaltalks"];
        const errors: { account: string; error: string }[] = [];
        const snapshots: AccountSnapshot[] = [];

        // Self
        try {
          snapshots.push(await fetchSelfSnapshot(cfg));
        } catch (err) {
          errors.push({ account: "self", error: err instanceof Error ? err.message : "failed" });
        }

        // Competitors (independent, fault-isolated)
        for (const username of competitors) {
          try {
            snapshots.push(await fetchCompetitorSnapshot(cfg, username));
          } catch (err) {
            errors.push({
              account: username,
              error: err instanceof Error ? err.message : "failed",
            });
          }
        }

        // Cache each snapshot
        for (const snap of snapshots) {
          const { error } = await auth.db.from("social_snapshots").insert({
            account: snap.account,
            ig_username: snap.ig_username,
            followers: snap.followers,
            media: snap.media,
          });
          if (error) console.error("social_snapshots insert error:", error.message);
        }

        return json({ snapshots, errors });
      },
    },
  },
});
