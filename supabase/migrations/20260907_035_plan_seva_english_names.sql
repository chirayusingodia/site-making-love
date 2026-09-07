-- =============================================================
-- PUNYATA — English display names for plans & sevas
-- Project  : Punyata (Supabase)
-- Branch   : Staging
-- Created  : 2026-09-07
-- =============================================================
--
-- WHY THIS MIGRATION EXISTS:
--
-- The customer UI is bilingual (Hindi/English toggle, see
-- src/lib/translations.ts), but plan and seva NAMES are stored once
-- and rendered as-is in both languages — so an English viewer still
-- saw the Devanagari ritual names. This adds an OPTIONAL English
-- display name to each; the UI falls back to `name` whenever
-- `name_en` is null, so nothing breaks for rows an admin hasn't
-- filled in yet.
--
-- No RLS change: both tables are read via SELECT * by the public
-- fetch (fetchPublicPlansData) and the admin editor, so the new
-- column is picked up automatically. Nullable + IF NOT EXISTS keeps
-- this safe to re-run.
-- =============================================================

ALTER TABLE public.plans
    ADD COLUMN IF NOT EXISTS name_en text;

ALTER TABLE public.sevas
    ADD COLUMN IF NOT EXISTS name_en text;

COMMENT ON COLUMN public.plans.name_en IS
    'Optional English display name. UI falls back to plans.name when null.';

COMMENT ON COLUMN public.sevas.name_en IS
    'Optional English display name. UI falls back to sevas.name when null.';

-- ═════════════════════════════════════════════════════════════
-- END OF MIGRATION 20260907_035_plan_seva_english_names
-- ═════════════════════════════════════════════════════════════
