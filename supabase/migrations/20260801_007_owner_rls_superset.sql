-- =============================================================
-- PUNYATA — Session 6.5: Owner inherits every admin RLS grant
-- Project  : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch   : Staging
-- Depends  : 20260801_006_owner_role_check.sql
-- Created  : 2026-08-01
-- =============================================================
--
-- PURPOSE (SUPERSET, NOT REPLACEMENT):
--   Every "admin full access" grant in the database is expressed
--   through the single SECURITY DEFINER helper public.is_admin().
--   Pre-flight audit confirmed ALL 40 admin-referencing policies
--   (across migrations 001, 002, 004) call is_admin() — no policy
--   references profiles.role directly. Updating the function body
--   to role IN ('admin','owner') therefore extends EVERY existing
--   admin grant to owner in one atomic change:
--
--   MIGRATION 001 (30 policies):
--     locations/teams/sevas/seva_schedule_rules/plans/plan_sevas/
--       plan_addons/page_seo: "admin write" (7)
--     blog_posts: "public read published", "admin write" (2)
--     profiles: "user reads own", "user updates own",
--       "admin delete" (3)
--     coupons: "user reads assigned or customer-facing",
--       "admin write" (2)
--     sales_agents: "admin only" (1)
--     subscriptions: "user reads own", "admin full access" (2)
--     family_members: "user reads own", "user updates own",
--       "admin delete" (3)
--     payments: "user reads own", "admin write" (2)
--     seva_proofs: "delivered public read", "admin write" (2)
--     prasad_shipments: "user reads own", "admin write" (2)
--     notifications: "user reads own", "admin write" (2)
--     audit_logs: "admin only" (1)
--   MIGRATION 002 (6 policies):
--     sankalp_batches: "admin write"
--     sankalp_batch_subs: "user reads own", "admin full access"
--     name_segments: "admin write"
--     plan_history: "user reads own", "admin full access"
--   MIGRATION 004 (2 policies):
--     proof_deliveries: "user reads own", "admin full access"
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--   - Does NOT drop, recreate, or narrow ANY policy. Admin keeps
--     every grant it has today — the role check is only WIDENED
--     to also match 'owner'.
--   - Does NOT add column-level RLS. Financial masking of
--     payments.amount_paise / razorpay ids / commission_percent
--     for the admin role is enforced at the API/serverless layer
--     (/api/admin/payments/list, /api/admin/overview-financials,
--     /api/admin/sales-agents/list), not in the database.
--   - Does NOT touch the 'agent' role value or any agent grant.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. is_admin() — privileged-staff check (admin OR owner)
-- ─────────────────────────────────────────────────────────────
-- Semantics: "is the caller a privileged staff member". The name
-- is kept so all 40 dependent policies continue to resolve
-- unchanged (CREATE OR REPLACE preserves dependents — no policy
-- is dropped or rebound). SECURITY DEFINER + STABLE + pinned
-- search_path exactly as before; owner = superset of admin.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    -- Privileged-staff check: 'admin' (operational) OR 'owner'
    -- (admin superset incl. financial visibility). Extends every
    -- policy that calls this function to the owner role without
    -- removing any existing admin grant.
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'owner')
    );
$$;

COMMENT ON FUNCTION public.is_admin() IS
    'Privileged-staff RLS check: true when the caller''s profiles.role is ''admin'' OR ''owner'' (owner = superset, migration 007). Financial field masking for admin happens at the serverless API layer, not here.';


-- ─────────────────────────────────────────────────────────────
-- 2. Verification query (run manually after applying)
-- ─────────────────────────────────────────────────────────────
-- As an owner-role JWT:  SELECT public.is_admin();  -- expect true
-- As an admin-role JWT:  SELECT public.is_admin();  -- expect true
-- As a user-role JWT:    SELECT public.is_admin();  -- expect false
-- And confirm all 40 policies are intact:
--   SELECT schemaname, tablename, policyname FROM pg_policies
--    WHERE schemaname = 'public' ORDER BY tablename, policyname;

-- ═════════════════════════════════════════════════════════════
-- END OF MIGRATION 20260801_007_owner_rls_superset
-- ═════════════════════════════════════════════════════════════
