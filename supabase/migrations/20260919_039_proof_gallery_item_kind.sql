-- ─────────────────────────────────────────────────────────────────────────
-- Proof gallery items — split "photo" proofs (event photography: ghat,
-- havan, gau seva) from "whatsapp" proofs (screenshots of the proof message
-- sent to a family's WhatsApp). They were previously mixed into one square-
-- cropped grid, which force-cropped tall WhatsApp screenshots like a profile
-- picture. The Reviews page now renders them in two separate sections — see
-- src/components/ProofGallery.tsx (PhotoProofGallery vs WhatsAppProofGallery).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.proof_gallery_items
    ADD COLUMN kind text NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'whatsapp'));
