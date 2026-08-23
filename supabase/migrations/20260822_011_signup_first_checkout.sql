-- =============================================================
-- PUNYATA — Session: Signup-First Checkout
-- Project  : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch   : Staging
-- Created  : 2026-08-22
-- =============================================================
-- PURPOSE:
--   Funnel change: login happens FIRST (phone OTP), plan purchase is
--   one click post-login, and family/address details move to AFTER
--   payment (/profile + /subscription-success). Subscriptions with
--   ZERO family_members rows are now a valid, expected state — the
--   sales team calls such subscribers to complete their sankalp.
--
-- WHAT THIS MIGRATION DOES:
--   1. Adds shipping-address columns to profiles. The profile-
--      completion form (POST /api/profile/address) upserts these for
--      Premium Annual prasad delivery. They are all optional — no
--      backfill needed, existing rows keep NULLs.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO (verified, not guessed):
--   - NO change to family_members. Pre-flight audit of migration 001
--     confirms there is NO constraint/policy requiring >=1 family
--     member per subscription: the table only enforces
--     slot_number BETWEEN 1 AND 4 and UNIQUE(subscription_id,
--     slot_number). A subscription with zero rows was already valid
--     at the DB level; it just never happened before this session.
--     "Profile incomplete" is DERIVED as (family_members count == 0)
--     wherever needed — no stored boolean flag that could drift.
--   - NO change to subscriptions / plans / payments schemas.
--     subscriptions.status='pending' INSERT under RLS was already
--     allowed ("subscriptions: user inserts pending only"); activation
--     remains webhook-only via the service-role webhook handler.
-- =============================================================

-- 1. Shipping address on profiles (all optional)
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS address_line1 text,
    ADD COLUMN IF NOT EXISTS address_line2 text,
    ADD COLUMN IF NOT EXISTS state         text,
    ADD COLUMN IF NOT EXISTS pincode       text;

COMMENT ON COLUMN public.profiles.address_line1 IS 'Prasad delivery address line 1 (house/street) — optional, captured post-purchase on /profile';
COMMENT ON COLUMN public.profiles.address_line2 IS 'Prasad delivery address line 2 (landmark/area) — optional';
COMMENT ON COLUMN public.profiles.state IS 'Prasad delivery state — optional';
COMMENT ON COLUMN public.profiles.pincode IS 'Prasad delivery pincode (6 digits) — optional';

-- ─────────────────────────────────────────────────────────────
-- END OF MIGRATION 20260822_011_signup_first_checkout
-- ─────────────────────────────────────────────────────────────
