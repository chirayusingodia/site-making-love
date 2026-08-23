-- =============================================================
-- PUNYATA — Session: Telecaller Panel
-- Project  : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch   : Staging
-- Depends  : 20260822_011_signup_first_checkout.sql
-- Created  : 2026-08-22
-- =============================================================
--
-- PURPOSE:
--   Adds a THIRD staff surface: the telecaller. A sibling of admin,
--   NOT a subset and NOT a superset:
--
--     owner       — admin superset + all financial visibility
--     admin       — full operational access, ZERO financial visibility
--     telecaller  — NEW. Call queues + on-behalf profile editing only.
--                   ZERO ₹ visibility. NO plans/sevas/proof/reports/
--                   CSV-export access. Sees subscription & payment
--                   STATUS words only.
--     agent       — existing sales-agent value, untouched
--
--   The telecaller reaches data ONLY through /api/telecaller/*
--   endpoints running on the service-role client behind a
--   requireTelecaller() gate with an explicit field allowlist.
--   She gets NO direct table grants of any kind.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO (do not "improve"):
--   - Does NOT modify public.is_admin() or ANY of the 40 policies
--     that call it. Adding 'telecaller' to is_admin() would hand a
--     telecaller the entire financial schema in one line
--     (payments write, sales_agents read, audit_logs, plans write).
--   - Does NOT add any RLS policy granting a telecaller access to
--     any table. Every byte she reads or writes goes through the
--     API layer, where column masking lives (Postgres RLS is
--     row-level and cannot hide a column).
--   - Does NOT add a profile_complete boolean. "Incomplete" stays
--     DERIVED (family_member_count = 0 / gotra IS NULL /
--     pincode IS NULL) exactly as migration 011 decided — no
--     stored flag that can drift from reality.
--   - Does NOT touch family_members / subscriptions / payments /
--     plans schemas in any way.
--   - Does NOT promote anyone to 'telecaller'. Promotion is a
--     manual, audited SQL statement Chirayu runs by hand (see the
--     commented example at the bottom).
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. Widen the role CHECK on public.profiles
-- ─────────────────────────────────────────────────────────────
-- Migration 006 named the replacement constraint
-- profiles_role_check, but we STILL discover it at runtime rather
-- than assuming the name (branch databases and restores drift).
-- Same discovery block as 006.

DO $$
DECLARE
    cname text;
BEGIN
    SELECT con.conname
      INTO cname
      FROM pg_constraint con
      JOIN pg_class rel       ON rel.oid = con.conrelid
      JOIN pg_namespace nsp   ON nsp.oid = rel.relnamespace
      JOIN pg_attribute att   ON att.attrelid = rel.oid
                             AND att.attnum = ANY (con.conkey)
     WHERE nsp.nspname  = 'public'
       AND rel.relname  = 'profiles'
       AND con.contype  = 'c'          -- CHECK constraint
       AND att.attname  = 'role'
     LIMIT 1;

    IF cname IS NOT NULL THEN
        RAISE NOTICE 'Dropping discovered CHECK constraint on profiles.role: %', cname;
        EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', cname);
    ELSE
        RAISE NOTICE 'No existing CHECK constraint found on profiles.role — nothing to drop.';
    END IF;
END;
$$;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('user', 'admin', 'owner', 'telecaller', 'agent'));

COMMENT ON COLUMN public.profiles.role IS
    'user = subscriber (default) | admin = operational staff, ZERO financial visibility | owner = admin superset + all financial data | telecaller = call-queue seat, ZERO ₹ visibility, NO direct table grants — data access only via /api/telecaller/* field allowlist | agent = sales agent (untouched). Staff promotions are manual-only (see migrations 006 and 012 bottoms).';


-- ─────────────────────────────────────────────────────────────
-- 2. is_telecaller() helper — PRIMITIVE ONLY, wired nowhere
-- ─────────────────────────────────────────────────────────────
-- Same shape as is_admin(): SECURITY DEFINER + STABLE + pinned
-- search_path. Deliberately NOT referenced by any policy in this
-- migration — the telecaller has no table grants. It exists so a
-- future session that genuinely needs a ROW-level telecaller rule
-- has the primitive and does not reach for is_admin() instead
-- (which would be a financial-data breach in one line).

CREATE OR REPLACE FUNCTION public.is_telecaller()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    -- Telecaller-seat check. PRIMITIVE ONLY — intentionally not
    -- used by any policy yet (migration 012). Do not widen
    -- is_admin() to include this role; do not wire this into any
    -- policy without an explicit financial-masking review.
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'telecaller'
    );
$$;

COMMENT ON FUNCTION public.is_telecaller() IS
    'Telecaller-seat check (migration 012). Primitive for FUTURE row-level policies; deliberately unused today — the telecaller role reaches data only via /api/telecaller/* service-role endpoints with field allowlists. NEVER add ''telecaller'' to is_admin(): that would expose payments/plans/sales_agents/audit_logs.';

-- C1 (REVIEW_TELECALLER_SESSION.md): Postgres grants EXECUTE to PUBLIC
-- by default and PostgREST exposes every public function at
-- /rest/v1/rpc/<name>. This one is an unwired primitive — nobody but
-- the service role may call it until a reviewed policy needs it.
REVOKE EXECUTE ON FUNCTION public.is_telecaller()
    FROM public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3. New columns on public.profiles
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS do_not_call        boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS preferred_language text,
    ADD COLUMN IF NOT EXISTS created_by_staff   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS last_called_at     timestamptz;

COMMENT ON COLUMN public.profiles.do_not_call IS
    'DPDP-hygiene DND flag. TRUE removes the person from EVERY telecaller queue permanently, no exceptions. Set via call outcome do_not_call; only the owner may clear it.';
COMMENT ON COLUMN public.profiles.preferred_language IS
    'ISO code of the language the subscriber prefers on calls (hi|en|mr|...). Captured by the telecaller panel; routes future calls.';
COMMENT ON COLUMN public.profiles.created_by_staff IS
    'Audit trail for staff-created leads (migration 012). NULL = self-signup, which is how every existing row stays.';
COMMENT ON COLUMN public.profiles.last_called_at IS
    'Denormalised last-contact timestamp written by POST /api/telecaller/log-call in the same request that inserts the call_logs row. Powers the 24h queue cooldown without a join on every page load.';

CREATE INDEX IF NOT EXISTS idx_profiles_do_not_call
    ON public.profiles (do_not_call);
CREATE INDEX IF NOT EXISTS idx_profiles_created_by_staff
    ON public.profiles (created_by_staff, created_at);


-- ─────────────────────────────────────────────────────────────
-- 4. New table public.call_logs
-- ─────────────────────────────────────────────────────────────
-- The disposition log. Without it the queues never drain — the
-- same people get called every day and nobody knows who said no.

CREATE TABLE IF NOT EXISTS public.call_logs (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id   uuid REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    profile_id        uuid REFERENCES public.profiles(id)      ON DELETE CASCADE,

    -- Lead context (Part B §8). Plain column here; the FK to
    -- leads(id) is added by migration 013 once the table exists.
    lead_id           uuid,

    -- Which telecaller/staff member made the call. RESTRICT so a
    -- departing caller's history is never silently erased.
    called_by         uuid NOT NULL REFERENCES auth.users(id)  ON DELETE RESTRICT,

    -- Which work queue this call came from (see SESSION_TELECALLER_
    -- PANEL_PROMPT.md §3): aaj_ke_leads | sankalp_pending |
    -- cutoff_risk | payment_failed | abandoned_checkout |
    -- never_bought | paused | recently_cancelled | callback_due |
    -- incomplete_details | missing_prasad_address | welcome_call |
    -- renewal_ahead
    queue             text,

    -- §5.1 identity gate: the telecaller ticked "identity verified"
    -- (two of name/plan/city/last-4-of-phone confirmed) before any
    -- edit form unlocked during this call.
    identity_verified boolean NOT NULL DEFAULT false,

    outcome           text NOT NULL CHECK (outcome IN (
                          'connected_interested',  -- wants it, link sent
                          'connected_completed',   -- got the details, profile now complete
                          'connected_partial',     -- got some, needs another call
                          'connected_refused',     -- said no / not interested
                          'callback_requested',
                          'no_answer',
                          'busy',
                          'switched_off',
                          'wrong_number',
                          'do_not_call',           -- sets the DND flag, see §7
                          'language_barrier',
                          'complaint'              -- auto-escalates to owner
                      )),

    notes             text,

    -- Required when outcome = 'callback_requested' (enforced below).
    callback_at       timestamptz,

    -- §5.6 escalation flag. Auto-set for outcome='complaint'; the
    -- UI may also set it explicitly (e.g. customer asked to cancel —
    -- retention decisions belong to the owner). Surfaces in the
    -- "Needs Chirayu" list on /admin/overview.
    escalated         boolean NOT NULL DEFAULT false,

    created_at        timestamptz NOT NULL DEFAULT now(),

    -- A log must attach to a person: subscription context, bare
    -- lead context, or both.
    CONSTRAINT call_logs_target_check CHECK (
        subscription_id IS NOT NULL OR profile_id IS NOT NULL OR lead_id IS NOT NULL
    ),

    -- A promised callback must carry its time...
    CONSTRAINT call_logs_callback_time_required CHECK (
        outcome <> 'callback_requested' OR callback_at IS NOT NULL
    ),
    -- ...and non-callback outcomes must not smuggle one in.
    CONSTRAINT call_logs_callback_time_forbidden CHECK (
        outcome = 'callback_requested' OR callback_at IS NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_call_logs_callback_due
    ON public.call_logs (callback_at)
    WHERE callback_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_logs_sub_time
    ON public.call_logs (subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_profile_time
    ON public.call_logs (profile_id, created_at DESC);CREATE INDEX IF NOT EXISTS idx_call_logs_caller_time
    ON public.call_logs (called_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_outcome_time
    ON public.call_logs (outcome, created_at DESC);
-- "Needs Chirayu" list on /admin/overview.
CREATE INDEX IF NOT EXISTS idx_call_logs_escalated
    ON public.call_logs (escalated, created_at DESC)
    WHERE escalated = true;

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- Exactly ONE policy: privileged staff can read everything through
-- their existing grants. There is NO auth.uid() = called_by
-- self-read policy ON PURPOSE — the telecaller reads her own
-- history through /api/telecaller/* (service role) too, so there
-- is exactly one code path to audit.
CREATE POLICY "call_logs: admin read"
    ON public.call_logs FOR SELECT USING (public.is_admin());

COMMENT ON TABLE public.call_logs IS
    'Telecaller disposition log (migration 012). Written ONLY by /api/telecaller/log-call behind requireTelecaller(); every insert also stamps profiles.last_called_at and writes an audit_logs row. Readable via RLS by admin/owner only; telecallers reach it exclusively through the API.';


-- ─────────────────────────────────────────────────────────────
-- 5. Verification queries (run manually after applying)
-- ─────────────────────────────────────────────────────────────
-- Role set widened, nothing promoted:
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.profiles'::regclass AND contype = 'c';
--   Expect: profiles_role_check | CHECK (role = ANY (ARRAY['user'::text,
--           'admin'::text, 'owner'::text, 'telecaller'::text, 'agent'::text]))
--
-- is_admin() UNCHANGED (must still exclude telecaller):
--   SELECT prosrc FROM pg_proc WHERE proname = 'is_admin';
--   Expect body: ... role IN ('admin', 'owner') ...
--   And as a telecaller-role JWT: SELECT public.is_admin(); → false
--
-- No policy references is_telecaller() yet:
--   SELECT policyname FROM pg_policies WHERE qual LIKE '%is_telecaller%';
--   Expect: 0 rows
--
-- New objects exist:
--   \d public.call_logs
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'profiles'
--      AND column_name IN ('do_not_call','preferred_language','created_by_staff','last_called_at');
--   Expect: 4 rows


-- ═════════════════════════════════════════════════════════════
-- MANUAL STEP — DO NOT UNCOMMENT AS PART OF THIS MIGRATION
-- ═════════════════════════════════════════════════════════════
-- Telecaller promotion is a deliberate, audited, one-account
-- action. After this migration is applied, Chirayu runs this BY
-- HAND in the Supabase SQL editor, substituting the new hire's
-- phone number (exactly as stored in profiles.phone):
--
-- UPDATE public.profiles
--    SET role       = 'telecaller',
--        updated_at = now()
--  WHERE phone = '+91XXXXXXXXXX';   -- ← test telecaller's phone
--
-- Verify afterwards:
-- SELECT id, full_name, phone, role FROM public.profiles WHERE role = 'telecaller';
--
-- Demotion (offboarding) is the same statement in reverse.
-- Only the OWNER clears do_not_call:
-- UPDATE public.profiles SET do_not_call = false WHERE id = '…uuid…';
-- ═════════════════════════════════════════════════════════════

-- ═════════════════════════════════════════════════════════════
-- END OF MIGRATION 20260822_012_telecaller_role
-- ═════════════════════════════════════════════════════════════
