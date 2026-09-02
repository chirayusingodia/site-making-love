-- ─────────────────────────────────────────────────────────────────────────
-- Site image overrides — lets an admin/owner swap any hardcoded marketing
-- photo (SITE_IMAGES manifest keys + review avatars) from the admin panel,
-- without a code deploy. `slot_key` matches either a SiteImageKey (see
-- src/lib/site-images.ts) or a `review-N` testimonial avatar slot (see
-- src/lib/plans.ts). Plan card thumbnails are NOT here — they already have
-- their own column, `plans.card_image_url`.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE public.site_image_overrides (
    slot_key text PRIMARY KEY,
    cloudinary_public_id text NOT NULL,
    image_url text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.site_image_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_image_overrides: public read"
    ON public.site_image_overrides FOR SELECT USING (true);
CREATE POLICY "site_image_overrides: admin write"
    ON public.site_image_overrides FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
