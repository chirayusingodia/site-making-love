import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";
import { timingSafeEqual } from "node:crypto";
import { json, getServiceClient } from "@/lib/supabase-admin.server";
import { publishCardPost, type PublishablePost } from "@/lib/content-publish.server";

// POST (or GET) /api/cron/publish-content
//
// Scheduled auto-publish sweep for Content Studio. Picks APPROVED card
// posts that have a rendered image and whose scheduled_for is today or
// earlier, and publishes each to Instagram. Modelled on
// send-notifications.ts: same CRON_SECRET gate, a small per-run cap, and
// "log and move on" per-row error handling so one bad post can't stall
// the batch.
//
// Auth: CRON_SECRET as `Authorization: Bearer <secret>` or
// `x-cron-secret`. Without the env var the route refuses to run.
//
// Language: posts are published with the English caption by default
// (DEFAULT_LANG). Hindi-first scheduling can be added per-post later.

const MAX_PER_RUN = 10;
const DEFAULT_LANG: "en" | "hi" = "en";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  const provided = bearer ?? request.headers.get("x-cron-secret");
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(request: Request): Promise<Response> {
  if (!process.env.CRON_SECRET) return json({ error: "CRON_SECRET not configured" }, 500);
  if (!isAuthorized(request)) return json({ error: "Unauthorized" }, 401);

  const db = getServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await db
    .from("content_posts")
    .select("id,format,status,image_url,content")
    .eq("status", "approved")
    .eq("format", "card")
    .not("image_url", "is", null)
    .lte("scheduled_for", today)
    .order("scheduled_for", { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) return json({ error: error.message }, 500);

  const posts = (data ?? []) as PublishablePost[];
  let published = 0;
  const failures: { id: string; error: string }[] = [];

  for (const post of posts) {
    try {
      await publishCardPost(db, post, DEFAULT_LANG);
      published++;
    } catch (err) {
      console.error(`publish-content: post ${post.id} failed:`, err);
      failures.push({ id: post.id, error: err instanceof Error ? err.message : "failed" });
    }
  }

  return json({ scanned: posts.length, published, failures });
}

export const Route = createFileRoute("/api/cron/publish-content")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
