import type { SupabaseClient } from "@supabase/supabase-js";
import { getMetaConfig, publishImagePost } from "@/lib/meta.server";
import type { GeneratedContent, PostFormat } from "@/lib/content-playbook";

// Shared server logic for publishing a Content Studio post to
// Instagram — used by both the manual publish route and the scheduled
// cron. Only the "card" (single image) path is auto-publishable today:
// Instagram's API needs a hosted image_url, which we have from the
// rendered card. Reels (video) and carousels need hosted video /
// multiple containers and stay manual for now.

export interface PublishablePost {
  id: string;
  format: PostFormat;
  status: string;
  image_url: string | null;
  content: GeneratedContent;
}

function buildCaption(content: GeneratedContent, lang: "en" | "hi"): string {
  const caption = content.caption?.[lang] ?? "";
  const cta = content.cta?.[lang] ?? "";
  const tags = (content.hashtags?.[lang] ?? []).join(" ");
  return [caption, cta, tags].filter(Boolean).join("\n\n").slice(0, 2200);
}

/**
 * Publishes one card post. Validates it is a card with an image, builds
 * the caption in the chosen language, calls the Graph API, and stamps
 * the row posted with the returned media id + permalink. Throws on any
 * precondition or API failure; callers map to a 4xx/5xx or per-row skip.
 */
export async function publishCardPost(
  db: SupabaseClient,
  post: PublishablePost,
  lang: "en" | "hi",
): Promise<{ mediaId: string; permalink: string | null }> {
  if (post.format !== "card") {
    throw new Error("Only card posts can be auto-published (reels/carousels are manual).");
  }
  if (!post.image_url) {
    throw new Error("Post has no rendered card image — render & upload it first.");
  }

  const cfg = getMetaConfig();
  const caption = buildCaption(post.content, lang);
  const result = await publishImagePost(cfg, { imageUrl: post.image_url, caption });

  const { error } = await db
    .from("content_posts")
    .update({
      status: "posted",
      posted_at: new Date().toISOString(),
      ig_media_id: result.mediaId,
      ig_permalink: result.permalink,
    })
    .eq("id", post.id);
  if (error) throw new Error(`Post published but DB update failed: ${error.message}`);

  return result;
}
