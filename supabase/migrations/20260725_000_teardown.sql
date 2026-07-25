-- =============================================================
-- PUNYATA — Session 0  STEP 1: TEARDOWN (run this first)
-- Drop all tables in reverse dependency order so the next
-- migration runs on a clean slate.
-- Safe to run on a fresh project — IF EXISTS prevents errors.
-- =============================================================

DROP TABLE IF EXISTS public.audit_logs          CASCADE;
DROP TABLE IF EXISTS public.notifications       CASCADE;
DROP TABLE IF EXISTS public.prasad_shipments    CASCADE;
DROP TABLE IF EXISTS public.seva_proofs         CASCADE;
DROP TABLE IF EXISTS public.payments            CASCADE;
DROP TABLE IF EXISTS public.family_members      CASCADE;
DROP TABLE IF EXISTS public.subscriptions       CASCADE;
DROP TABLE IF EXISTS public.coupons             CASCADE;
DROP TABLE IF EXISTS public.profiles            CASCADE;
DROP TABLE IF EXISTS public.plan_addons         CASCADE;
DROP TABLE IF EXISTS public.plan_sevas          CASCADE;
DROP TABLE IF EXISTS public.plans               CASCADE;
DROP TABLE IF EXISTS public.seva_schedule_rules CASCADE;
DROP TABLE IF EXISTS public.sevas               CASCADE;
DROP TABLE IF EXISTS public.sales_agents        CASCADE;
DROP TABLE IF EXISTS public.blog_posts          CASCADE;
DROP TABLE IF EXISTS public.page_seo            CASCADE;
DROP TABLE IF EXISTS public.teams               CASCADE;
DROP TABLE IF EXISTS public.locations           CASCADE;

DROP FUNCTION IF EXISTS public.is_admin() CASCADE;

-- Confirm clean state
SELECT 'Teardown complete — ready for fresh migration' AS status;
