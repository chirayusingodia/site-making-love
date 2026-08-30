-- =============================================================
-- PUNYATA — Separate calling number (when different from WhatsApp)
-- Created : 2026-08-30
-- =============================================================
--
-- profiles.phone doubles as the WhatsApp number (seva proof delivery
-- rides on it) AND the number telecallers dial. Those are often the
-- same, but not always — e.g. the WhatsApp number is a family member's,
-- while the subscriber's own number is what should actually be called.
--
-- /complete-profile now asks "kya aapka WhatsApp number aur calling
-- number same hai?" — if no, this column holds the separate calling
-- number. NULL means "same as phone" (the common case).
-- =============================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS alt_phone text;

COMMENT ON COLUMN public.profiles.alt_phone IS
    'Calling number, only set when different from phone (the WhatsApp number). NULL = same as phone.';

-- ── Verification ─────────────────────────────────────────────────
-- SELECT id, phone, alt_phone FROM public.profiles WHERE alt_phone IS NOT NULL LIMIT 5;
