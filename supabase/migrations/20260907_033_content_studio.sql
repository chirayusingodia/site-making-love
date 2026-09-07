-- =============================================================
-- PUNYATA — Content Studio (AI social content generator)
-- Project  : Punyata
-- Branch   : Staging
-- Depends  : 20260725_001_core_schema.sql (profiles, is_admin())
--            20260801_007_owner_rls_superset.sql (is_admin() covers owner)
-- Created  : 2026-09-07
-- =============================================================
--
-- WHAT THIS IS:
--   Storage for the admin "Content Studio" — an in-panel tool that
--   uses Google Gemini + the immortaltalks-model playbook to draft
--   Instagram posts (captions, hooks, reel scripts, carousel
--   outlines, CTAs) in Hindi + English, and (Phase 2) caches Meta
--   Graph reads so the owner can analyze our own page vs a public
--   competitor and post more of what earns more likes.
--
--   Two tables:
--     content_posts    — every generated / drafted / scheduled post.
--     social_snapshots — cached Meta reads (self insights +
--                        competitor Business Discovery public data).
--
-- ACCESS: admin/owner only, entirely through the service-role client
--   behind requireAdmin(). RLS is enabled with an is_admin() policy
--   (same convention as the rest of the admin surface); no anon/user
--   grants exist.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. content_posts — generated / drafted content
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_posts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

    topic         text,
    pillar        text,                       -- mirror|mind|detachment|parable|stillness|custom
    format        text NOT NULL
                      CHECK (format IN ('reel', 'card', 'carousel')),
    status        text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'approved', 'posted')),
    scheduled_for date,
    posted_at     timestamptz,

    source        text NOT NULL DEFAULT 'gemini',  -- gemini | manual
    model         text,                            -- e.g. gemini-2.0-flash

    -- Full bilingual payload. Shape:
    --   { on_screen:{en,hi}, caption:{en,hi}, hooks:[...],
    --     reel_script:{en,hi}, carousel:{en:[...],hi:[...]},
    --     hashtags:{en:[...],hi:[...]}, cta:{en,hi} }
    content       jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_content_posts_status
    ON public.content_posts (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_content_posts_created
    ON public.content_posts (created_at DESC);


-- ─────────────────────────────────────────────────────────────
-- 2. social_snapshots — cached Meta Graph reads (Phase 2)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_snapshots (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fetched_at  timestamptz NOT NULL DEFAULT now(),

    account     text NOT NULL,   -- 'self' | competitor username (e.g. 'immortaltalks')
    ig_username text,
    followers   int,

    -- Array of media objects. For 'self': like/comment counts + saved
    -- + reach (private insights). For a competitor via Business
    -- Discovery: like_count + comments_count only (Meta blocks the rest).
    media       jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_social_snapshots_account
    ON public.social_snapshots (account, fetched_at DESC);


-- ─────────────────────────────────────────────────────────────
-- 3. updated_at trigger for content_posts
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_content_posts_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_posts_touch ON public.content_posts;
CREATE TRIGGER trg_content_posts_touch
    BEFORE UPDATE ON public.content_posts
    FOR EACH ROW EXECUTE FUNCTION public.touch_content_posts_updated_at();


-- ─────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY — admin/owner only
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.content_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_posts: admin full access"
    ON public.content_posts FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "social_snapshots: admin full access"
    ON public.social_snapshots FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ═════════════════════════════════════════════════════════════
-- END OF MIGRATION 20260907_033_content_studio
-- ═════════════════════════════════════════════════════════════
