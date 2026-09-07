import process from "node:process";

// Server-only Meta Graph API wrapper for Content Studio — Phase 2/3.
// Plain fetch, no SDK. .server.ts keeps it out of the client bundle.
// Env is read per-request (Workers-safe).
//
// Auth / env:
//   META_ACCESS_TOKEN   — long-lived Page/IG access token
//   META_IG_USER_ID     — our Instagram Business account id
//   META_GRAPH_VERSION  — default "v21.0"
//
// What Meta allows (the honest boundary):
//   • OUR OWN account: media + like/comment counts, and per-media
//     insights (saved, reach, impressions) via /{media}/insights.
//   • ANOTHER public business/creator account: media + like_count +
//     comments_count via business_discovery. Saves/reach/shares are
//     NOT available for other accounts — Meta blocks it. So competitor
//     ranking is by likes+comments only, which is exactly what
//     "post more of what earns more likes" needs.

const DEFAULT_VERSION = "v21.0";

export interface MetaConfig {
  token: string;
  igUserId: string;
  version: string;
}

export function getMetaConfig(): MetaConfig {
  const token = process.env.META_ACCESS_TOKEN;
  const igUserId = process.env.META_IG_USER_ID;
  if (!token || !igUserId) {
    throw new Error(
      "Missing META_ACCESS_TOKEN / META_IG_USER_ID env vars. See CONTENT_STUDIO_PLAN.md for setup.",
    );
  }
  return { token, igUserId, version: process.env.META_GRAPH_VERSION || DEFAULT_VERSION };
}

export interface MediaItem {
  id: string;
  caption: string | null;
  media_type: string | null; // IMAGE | VIDEO | CAROUSEL_ALBUM
  like_count: number;
  comments_count: number;
  permalink: string | null;
  timestamp: string | null;
  saved?: number | null; // own account only
  reach?: number | null; // own account only
}

export interface AccountSnapshot {
  account: string; // 'self' | competitor username
  ig_username: string | null;
  followers: number | null;
  media: MediaItem[];
}

async function graphGet<T>(
  cfg: MetaConfig,
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${cfg.version}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", cfg.token);

  const res = await fetch(url.toString());
  const data = (await res.json().catch(() => null)) as
    (T & { error?: { message?: string } }) | null;
  if (!res.ok || !data || (data as { error?: unknown }).error) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ?? `Graph API ${res.status}`;
    throw new Error(`Meta: ${msg}`);
  }
  return data as T;
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Our own account: media list with like/comment counts, then a
 * best-effort per-media insights pass for saved + reach. Insights that
 * fail (metric unsupported for a media type) are simply left null —
 * they never fail the whole call.
 */
export async function fetchSelfSnapshot(cfg: MetaConfig, limit = 25): Promise<AccountSnapshot> {
  const account = await graphGet<{ username?: string; followers_count?: number }>(
    cfg,
    cfg.igUserId,
    { fields: "username,followers_count" },
  );

  const mediaRes = await graphGet<{
    data?: Array<Record<string, unknown>>;
  }>(cfg, `${cfg.igUserId}/media`, {
    fields: "id,caption,media_type,like_count,comments_count,permalink,timestamp",
    limit: String(limit),
  });

  const media: MediaItem[] = (mediaRes.data ?? []).map((m) => ({
    id: String(m.id),
    caption: (m.caption as string) ?? null,
    media_type: (m.media_type as string) ?? null,
    like_count: toNum(m.like_count),
    comments_count: toNum(m.comments_count),
    permalink: (m.permalink as string) ?? null,
    timestamp: (m.timestamp as string) ?? null,
    saved: null,
    reach: null,
  }));

  // Best-effort insights (saved, reach). Capped and fault-tolerant.
  await Promise.all(
    media.slice(0, limit).map(async (item) => {
      try {
        const ins = await graphGet<{
          data?: Array<{ name: string; values?: { value: number }[] }>;
        }>(cfg, `${item.id}/insights`, { metric: "saved,reach" });
        for (const row of ins.data ?? []) {
          const val = row.values?.[0]?.value ?? null;
          if (row.name === "saved") item.saved = val;
          if (row.name === "reach") item.reach = val;
        }
      } catch {
        // metric unavailable for this media type — leave null
      }
    }),
  );

  return {
    account: "self",
    ig_username: account.username ?? null,
    followers: account.followers_count ?? null,
    media,
  };
}

/**
 * A public competitor via Business Discovery — public likes/comments
 * only (Meta blocks saves/reach for other accounts).
 */
export async function fetchCompetitorSnapshot(
  cfg: MetaConfig,
  username: string,
  limit = 25,
): Promise<AccountSnapshot> {
  const clean = username.replace(/^@/, "").trim();
  const field = `business_discovery.username(${clean}){followers_count,media_count,media.limit(${limit}){id,caption,media_type,like_count,comments_count,permalink,timestamp}}`;

  const res = await graphGet<{
    business_discovery?: {
      followers_count?: number;
      media?: { data?: Array<Record<string, unknown>> };
    };
  }>(cfg, cfg.igUserId, { fields: field });

  const bd = res.business_discovery;
  const media: MediaItem[] = (bd?.media?.data ?? []).map((m) => ({
    id: String(m.id),
    caption: (m.caption as string) ?? null,
    media_type: (m.media_type as string) ?? null,
    like_count: toNum(m.like_count),
    comments_count: toNum(m.comments_count),
    permalink: (m.permalink as string) ?? null,
    timestamp: (m.timestamp as string) ?? null,
  }));

  return {
    account: clean,
    ig_username: clean,
    followers: bd?.followers_count ?? null,
    media,
  };
}

// ─── Phase 3: publishing ─────────────────────────────────────────────

/**
 * Publishes a single-image post (a rendered quote card) to Instagram.
 * Two-step Content Publishing flow: create a media container from a
 * public image_url + caption, then publish the container. Returns the
 * new media id + permalink.
 *
 * Reels (video) and carousels need extra containers/hosted video and
 * are handled separately; this covers the card path end-to-end.
 */
export async function publishImagePost(
  cfg: MetaConfig,
  opts: { imageUrl: string; caption: string },
): Promise<{ mediaId: string; permalink: string | null }> {
  // 1. Create container
  const container = await graphGet<{ id?: string }>(cfg, `${cfg.igUserId}/media`, {
    image_url: opts.imageUrl,
    caption: opts.caption,
  });
  const creationId = container.id;
  if (!creationId) throw new Error("Meta: container creation returned no id");

  // 2. Publish
  const published = await graphGet<{ id?: string }>(cfg, `${cfg.igUserId}/media_publish`, {
    creation_id: creationId,
  });
  const mediaId = published.id;
  if (!mediaId) throw new Error("Meta: publish returned no media id");

  // 3. Best-effort permalink
  let permalink: string | null = null;
  try {
    const info = await graphGet<{ permalink?: string }>(cfg, mediaId, { fields: "permalink" });
    permalink = info.permalink ?? null;
  } catch {
    /* non-fatal */
  }

  return { mediaId, permalink };
}
