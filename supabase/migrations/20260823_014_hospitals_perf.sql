-- =============================================================
-- PUNYATA — Session: Hospitals, No-Coupon Attribution & Owner Perf
-- Project  : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch   : Staging
-- Depends  : 20260822_013_leads_and_commissions.sql
-- Created  : 2026-08-23
-- =============================================================
--
-- PURPOSE (SESSION_HOSPITALS_ATTRIBUTION_PERFORMANCE_PROMPT.md):
--   The real funnel: hospital allotted to a field agent → numbers
--   collected at that hospital → telecaller calls and asks "kaunse
--   agent ne number diya?" → one FREE POOJA as the hook → WhatsApp
--   payment link (attribution token) → both agents earn from their
--   separate pools. This migration adds the missing entities:
--
--   1. public.hospitals + public.agent_hospital_allotments — the
--      allotment unit; one ACTIVE agent per hospital at a time.
--   2. leads.hospital_id / free_pooja_at / free_pooja_by /
--      named_agent_id — where the number came from and the two
--      human moments (verbal agent answer, free pooja).
--   3. coupons.visibility='agent' DEPRECATED — there are no agent
--      or telecaller coupon codes in this flow and never will be;
--      attribution is token + verbal backup.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--   - Does NOT drop the coupons table or the 'agent' enum value.
--     Existing rows stay valid; only NEW usage is dead (the code
--     paths were removed in the same session). Leftover active
--     agent coupons are deactivated below, idempotently.
--   - Does NOT change subscriptions, payments, call_logs outcomes,
--     commission_entries, or staff_commission_rates. The commission
--     engine is untouched — this session only feeds it the CORRECT
--     sourcing agent.
--   - Does NOT touch public.is_admin() (stays admin ∪ owner).
--   - Does NOT add any performance tables — the leaderboard (§6) is
--     pure aggregation over EXISTING timestamped data; no new flags,
--     no rollup tables that could drift.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. §2.4 — deprecate agent coupons (deprecate, don't destroy)
-- ─────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.coupons.visibility IS
    '''public'' | ''private'' | ''agent''. ''agent'' is DEPRECATED AND UNUSED as of 2026-08-23 (migration 014): attribution in the field-agent/telecaller flow rides on the payment-link token plus the lead''s source_agent_id, NEVER a coupon. No telecaller or agent holds or issues any discount code. Public customer-facing website coupons remain a separate, valid feature.';

UPDATE public.coupons SET is_active = false
 WHERE visibility = 'agent' AND is_active = true;


-- ─────────────────────────────────────────────────────────────
-- 2. §3.1 — public.hospitals
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hospitals (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    city       text,
    notes      text,
    is_active  boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hospitals: admin full access"
    ON public.hospitals FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_hospitals_active ON public.hospitals (is_active);

COMMENT ON TABLE public.hospitals IS
    'The allotment unit (§3.1): a company allots a specific hospital to a field sales agent; the agent collects name+phone there. One ACTIVE agent per hospital at a time (see agent_hospital_allotments).';


-- ─────────────────────────────────────────────────────────────
-- 3. §3.2 — public.agent_hospital_allotments (history table)
-- ─────────────────────────────────────────────────────────────
-- One hospital → one active agent at a time, enforced by a btree_gist
-- exclusion over overlapping dateranges (same technique as
-- staff_commission_rates in 013). An agent may hold MANY hospitals —
-- no constraint touches the agent dimension.

CREATE TABLE IF NOT EXISTS public.agent_hospital_allotments (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id   uuid NOT NULL REFERENCES public.hospitals(id)    ON DELETE CASCADE,
    agent_id      uuid NOT NULL REFERENCES public.sales_agents(id) ON DELETE CASCADE,
    allotted_from date NOT NULL DEFAULT CURRENT_DATE,
    allotted_to   date,                       -- NULL = current
    set_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    reason        text,                        -- 'allotment' | 'reallotment' | 'correction'
    created_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ahs_no_overlap EXCLUDE USING gist (
        hospital_id WITH =,
        daterange(allotted_from, allotted_to, '[)') WITH &&
    )
);

ALTER TABLE public.agent_hospital_allotments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_hospital_allotments: admin full access"
    ON public.agent_hospital_allotments FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_ahs_hospital ON public.agent_hospital_allotments (hospital_id, allotted_from);
CREATE INDEX IF NOT EXISTS idx_ahs_agent    ON public.agent_hospital_allotments (agent_id, allotted_from);

COMMENT ON TABLE public.agent_hospital_allotments IS
    'Allotment HISTORY (§3.2): every hospital→agent assignment past and present. Ranges are [from, to): allotted_to IS NULL = current. Re-allotment closes the old row and opens a new one inside reallot_hospital(); the exclusion constraint is the safety net against double-allotment.';


-- ─────────────────────────────────────────────────────────────
-- 4. §3.3 — new columns on public.leads
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS hospital_id    uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS free_pooja_at  timestamptz,
    ADD COLUMN IF NOT EXISTS free_pooja_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS named_agent_id uuid REFERENCES public.sales_agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_hospital     ON public.leads (hospital_id);
CREATE INDEX IF NOT EXISTS idx_leads_source_agent ON public.leads (source_agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_free_pooja   ON public.leads (free_pooja_at) WHERE free_pooja_at IS NOT NULL;

COMMENT ON COLUMN public.leads.hospital_id IS
    'Which hospital this number came from (§3.3) — set at upload alongside the derived source_agent_id.';
COMMENT ON COLUMN public.leads.free_pooja_at IS
    'The "1 free pooja" hook (§5): when the telecaller performed it. Stamped ONCE via /api/telecaller/log-call; repeats are no-ops. NULL = not yet done.';
COMMENT ON COLUMN public.leads.free_pooja_by IS
    'Which telecaller performed the free pooja (§5).';
COMMENT ON COLUMN public.leads.named_agent_id IS
    'The agent the customer VERBALLY named when asked "kaunse agent ne number diya?" (§5) — the human-confirmed backup attribution path. Normally equals source_agent_id; a mismatch is an owner investigation signal. First answer wins; later answers never overwrite.';


-- ─────────────────────────────────────────────────────────────
-- 5. SECURITY DEFINER helpers — C1 rule: EVERY one gets an
--    explicit REVOKE EXECUTE FROM public, anon, authenticated.
-- ─────────────────────────────────────────────────────────────

-- §3.2: the agent whose allotment covers TODAY for one hospital.
CREATE OR REPLACE FUNCTION public.current_hospital_agent(p_hospital uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT a.agent_id
      FROM public.agent_hospital_allotments a
     WHERE a.hospital_id = p_hospital
       AND daterange(a.allotted_from, a.allotted_to, '[)') @> CURRENT_DATE
     LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.current_hospital_agent(uuid)
    FROM public, anon, authenticated;

COMMENT ON FUNCTION public.current_hospital_agent(uuid) IS
    'Current allotting agent for a hospital (§3.2), NULL when none covers today. EXECUTE revoked (C1): called by the service role during lead upload only.';

-- §4.4: re-allot a hospital in ONE atomic step — close the current
-- row, open a new one. Ranges are [from, to), so closing with
-- allotted_to = CURRENT_DATE covers through YESTERDAY and the new row
-- starts TODAY: contiguous, no gap, no double-coverage (and the
-- exclusion constraint is the hard safety net either way).
--
-- §4 (REVIEW_HOSPITALS_SESSION.md): p_set_by carries the ACTING
-- admin/owner. Under the service-role connection auth.uid() is NULL,
-- which left every reallotment row and its audit entry unattributed —
-- the endpoint now passes auth.staffId explicitly.
CREATE OR REPLACE FUNCTION public.reallot_hospital(
    p_hospital uuid,
    p_agent    uuid,
    p_reason   text DEFAULT 'reallotment',
    p_set_by   uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor uuid := COALESCE(p_set_by, auth.uid());
BEGIN
    -- Close whatever is currently open for this hospital (0 or 1 row —
    -- the exclusion constraint guarantees at most one).
    UPDATE public.agent_hospital_allotments
       SET allotted_to = CURRENT_DATE
     WHERE hospital_id = p_hospital
       AND allotted_to IS NULL;

    INSERT INTO public.agent_hospital_allotments
        (hospital_id, agent_id, allotted_from, set_by, reason)
    VALUES
        (p_hospital, p_agent, CURRENT_DATE, v_actor,
         NULLIF(p_reason, ''));

    INSERT INTO public.audit_logs (admin_id, action, entity, entity_id, meta)
    VALUES (
        v_actor,
        'hospital_reallotted',
        'agent_hospital_allotments',
        p_hospital,
        jsonb_build_object('hospital_id', p_hospital, 'new_agent_id', p_agent,
                           'reason', NULLIF(p_reason, ''))
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reallot_hospital(uuid, uuid, text, uuid)
    FROM public, anon, authenticated;

COMMENT ON FUNCTION public.reallot_hospital(uuid, uuid, text, uuid) IS
    'Atomically closes the current allotment and opens a new one (§4.4). EXECUTE revoked (C1): owner/admin only via /api/admin/hospitals/reallot. Writes its own audit_logs row.';


-- ─────────────────────────────────────────────────────────────
-- 6. Verification queries (run manually after applying)
-- ─────────────────────────────────────────────────────────────
-- New objects:
--   \d public.hospitals
--   \d public.agent_hospital_allotments
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='leads'
--      AND column_name IN ('hospital_id','free_pooja_at','free_pooja_by','named_agent_id');
--   Expect 4 rows.
--
-- Exclusion fires on double-allotment (expect an exclusion violation):
--   BEGIN;
--   SELECT public.reallot_hospital('<hospital>', '<agent-A>', 'allotment');
--   SELECT public.reallot_hospital('<hospital>', '<agent-B>', 'reallotment');  -- ok
--   INSERT INTO public.agent_hospital_allotments (hospital_id, agent_id)
--     VALUES ('<hospital>', '<agent-C>');                                       -- VIOLATES
--   ROLLBACK;
--
-- current_hospital_agent returns exactly one agent:
--   SELECT public.current_hospital_agent('<hospital>');
--
-- Agent coupons deactivated:
--   SELECT count(*) FROM public.coupons WHERE visibility='agent' AND is_active;
--   Expect 0.
--
-- C1 sweep — every SECURITY DEFINER function has a matching REVOKE:
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.prosecdef ORDER BY 1;
--   Expect each of: assign_leads, roll_over_stale_leads, expire_stale_leads,
--   commission_entries_guard, is_admin (deliberately granted — see 013),
--   is_telecaller, current_hospital_agent, reallot_hospital.

-- ═════════════════════════════════════════════════════════════
-- END OF MIGRATION 20260823_014_hospitals_perf
-- ═════════════════════════════════════════════════════════════