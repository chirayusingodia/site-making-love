-- ─────────────────────────────────────────────────────────────────────────
-- Proof gallery — extra items. The 4 core Proof Gallery thumbnails
-- (proofGhat/proofHavan/proofWhatsapp/proofGau in site_image_overrides /
-- src/lib/site-images.ts) stay fixed, swappable slots. This table lets an
-- admin ADD an unlimited number of additional photos to the same gallery
-- (Reviews page + homepage strip), and remove/reorder them — see
-- src/lib/proof-gallery-items.ts and the "Location व Proof Gallery"
-- section of /admin/images.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE public.proof_gallery_items (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url             text NOT NULL,
    cloudinary_public_id  text NOT NULL,
    alt_text              text NOT NULL DEFAULT 'सेवा का प्रमाण',
    sort_order            integer NOT NULL DEFAULT 0,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_by            uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_proof_gallery_items_sort ON public.proof_gallery_items (sort_order, created_at);

ALTER TABLE public.proof_gallery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proof_gallery_items: public read"
    ON public.proof_gallery_items FOR SELECT USING (true);
CREATE POLICY "proof_gallery_items: admin write"
    ON public.proof_gallery_items FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
