-- =============================================================
-- PUNYATA — TEARDOWN (run this first for a clean slate)
-- Drop every project object in reverse dependency order so the
-- next migration run starts clean.
-- Safe to run on a fresh project — IF EXISTS prevents errors.
--
-- [Bug 5.5] The original version only knew migration-001 tables;
-- running it against a fully-migrated DB left sankalp_batches,
-- hospitals, leads, commission_*, call_logs, otp_send_log, the
-- subscriber_list_view and 8 functions orphaned with stale RLS.
-- This list must be extended whenever a migration adds objects.
-- =============================================================

-- ── Tables (reverse dependency order) ────────────────────────
DROP TABLE IF EXISTS public.otp_send_log               CASCADE;
DROP TABLE IF EXISTS public.call_logs                  CASCADE;
DROP TABLE IF EXISTS public.commission_entries         CASCADE;
DROP TABLE IF EXISTS public.commission_payout_periods  CASCADE;
DROP TABLE IF EXISTS public.staff_commission_rates     CASCADE;
DROP TABLE IF EXISTS public.leads                      CASCADE;
DROP TABLE IF EXISTS public.agent_hospital_allotments  CASCADE;
DROP TABLE IF EXISTS public.hospitals                  CASCADE;
DROP TABLE IF EXISTS public.proof_deliveries           CASCADE;
DROP TABLE IF EXISTS public.name_segments              CASCADE;
DROP TABLE IF EXISTS public.plan_history               CASCADE;
DROP TABLE IF EXISTS public.sankalp_batch_subscriptions CASCADE;
DROP TABLE IF EXISTS public.sankalp_batches            CASCADE;
DROP TABLE IF EXISTS public.audit_logs                 CASCADE;
DROP TABLE IF EXISTS public.notifications              CASCADE;
DROP TABLE IF EXISTS public.prasad_shipments           CASCADE;
DROP TABLE IF EXISTS public.seva_proofs                CASCADE;
DROP TABLE IF EXISTS public.payments                   CASCADE;
DROP TABLE IF EXISTS public.family_members             CASCADE;
DROP TABLE IF EXISTS public.subscriptions              CASCADE;
DROP TABLE IF EXISTS public.coupons                    CASCADE;
DROP TABLE IF EXISTS public.profiles                   CASCADE;
DROP TABLE IF EXISTS public.plan_addons                CASCADE;
DROP TABLE IF EXISTS public.plan_sevas                 CASCADE;
DROP TABLE IF EXISTS public.plans                      CASCADE;
DROP TABLE IF EXISTS public.seva_schedule_rules        CASCADE;
DROP TABLE IF EXISTS public.sevas                      CASCADE;
DROP TABLE IF EXISTS public.sales_agents               CASCADE;
DROP TABLE IF EXISTS public.blog_posts                 CASCADE;
DROP TABLE IF EXISTS public.page_seo                   CASCADE;
DROP TABLE IF EXISTS public.teams                      CASCADE;
DROP TABLE IF EXISTS public.locations                  CASCADE;

-- ── Views ────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.subscriber_list_view;

-- ── Functions (SECURITY DEFINER + helpers) ───────────────────
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_owner() CASCADE;
DROP FUNCTION IF EXISTS public.is_telecaller() CASCADE;
DROP FUNCTION IF EXISTS public.profiles_role_write_guard() CASCADE;
DROP FUNCTION IF EXISTS public.call_logs_escalate_complaints() CASCADE;
DROP FUNCTION IF EXISTS public.leads_unassigned_reset() CASCADE;
DROP FUNCTION IF EXISTS public.commission_entries_guard() CASCADE;
DROP FUNCTION IF EXISTS public.assign_leads(uuid, int) CASCADE;
DROP FUNCTION IF EXISTS public.roll_over_stale_leads(int) CASCADE;
DROP FUNCTION IF EXISTS public.expire_stale_leads(int) CASCADE;
DROP FUNCTION IF EXISTS public.generate_sankalp_batch(date, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.redeem_coupon(text) CASCADE;
DROP FUNCTION IF EXISTS public.otp_check_and_log(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.otp_send_ip_phone_count(text, timestamptz) CASCADE;
-- [Pass-2 P10 residual fix] atomic call-log daily limit (migration 019 §6)
DROP FUNCTION IF EXISTS public.log_call_limited(uuid, uuid, uuid, uuid, text, text, text, timestamptz, boolean, boolean, int) CASCADE;
-- [Pass-2 S6 fix] hospitals-session functions (migration 014)
DROP FUNCTION IF EXISTS public.current_hospital_agent(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.reallot_hospital(uuid, uuid, text, uuid) CASCADE;

-- Confirm clean state
SELECT 'Teardown complete — ready for fresh migration' AS status;
