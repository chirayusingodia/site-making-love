-- =============================================================
-- PUNYATA — Content Studio Phase 3 (card image + IG publish)
-- Project  : Punyata
-- Branch   : Staging
-- Depends  : 20260907_033_content_studio.sql (content_posts)
-- Created  : 2026-09-07
-- =============================================================
--
-- Adds the columns Phase 3 needs on content_posts:
--   image_url    — rendered quote-card PNG (Cloudinary secure_url),
--                  the public URL Instagram's publish flow requires.
--   ig_media_id  — id returned by IG Content Publishing after publish.
--   ig_permalink — public URL of the published post.
-- posted_at already exists (migration 033); it is stamped on publish.
-- =============================================================

ALTER TABLE public.content_posts
    ADD COLUMN IF NOT EXISTS image_url    text,
    ADD COLUMN IF NOT EXISTS ig_media_id  text,
    ADD COLUMN IF NOT EXISTS ig_permalink text;

-- Approved + scheduled posts due for the auto-publish cron.
CREATE INDEX IF NOT EXISTS idx_content_posts_scheduled_publish
    ON public.content_posts (status, scheduled_for)
    WHERE status = 'approved' AND scheduled_for IS NOT NULL;

-- ═════════════════════════════════════════════════════════════
-- END OF MIGRATION 20260907_034_content_studio_publish
-- ═════════════════════════════════════════════════════════════
