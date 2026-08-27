-- =============================================================
-- PUNYATA — Agent Portal + Lead Routing (owner request)
-- Project  : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch   : Staging
-- Depends  : 20260822_013_leads_and_commissions.sql
-- Created  : 2026-08-26
-- =============================================================
-- PURPOSE:
--   1. Sales agents get a LOGIN and their own portal page (/agent)
--      where they upload the numbers they collect — including the
--      family-member names the field agent scribbled down.
--   2. Owner routes an agent's leads to a fixed telecaller
--      (lead_routing) so uploads land in HER tray immediately,
--      instead of waiting for the daily manual assignment.
--   3. Telecaller panel shows the family names on the lead card.
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   - Does NOT touch is_admin(), existing policies, or any grant.
--   - No auto-creation of auth users here — logins are created by
--     the owner via POST /api/admin/staff/create-staff (audited).
-- =============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. leads.family_names — what the field agent collected
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS family_names text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.leads.family_names IS
    'Optional family-member names captured with the lead (agent portal / admin paste). Sanitised app-side: trimmed, deduped, max 8 × 80 chars. Shown to the assigned telecaller on her Aaj Ke Leads card.';

-- ─────────────────────────────────────────────────────────────
-- 2. profiles.sales_agent_id — links an agent LOGIN to the
--    offline sales_agents roster row (role='agent' profiles).
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS sales_agent_id uuid
        REFERENCES public.sales_agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_sales_agent
    ON public.profiles (sales_agent_id);

COMMENT ON COLUMN public.profiles.sales_agent_id IS
    'Agent-login link (migration 020). Exactly one sales_agents row per agent-role profile; every /api/agent/* upload stamps this as source_agent_id. NULL for every other role.';

-- ─────────────────────────────────────────────────────────────
-- 3. leads.source_agent_id index — routing lookup on upload
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_source_agent
    ON public.leads (source_agent_id);

-- ─────────────────────────────────────────────────────────────
-- 4. lead_routing — owner sets: THIS agent's leads → THAT telecaller
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_routing (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_agent_id  uuid NOT NULL UNIQUE REFERENCES public.sales_agents(id) ON DELETE CASCADE,
    telecaller_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_active       boolean NOT NULL DEFAULT true,
    set_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_routing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_routing: admin full access"
    ON public.lead_routing FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.lead_routing IS
    'Owner-managed routing (migration 020): one ACTIVE row per sales agent names the telecaller whose tray receives that agent''s uploaded leads instantly. Applied at upload time by the server; the daily SKIP LOCKED assignment stays available for unrouted agents.';

CREATE INDEX IF NOT EXISTS idx_lead_routing_active
    ON public.lead_routing (sales_agent_id) WHERE is_active;

COMMIT;

-- ═════════════════════════════════════════════════════════════
-- VERIFY (run manually after applying):
--   \d public.leads            -- family_names present
--   \d public.profiles         -- sales_agent_id present
--   SELECT * FROM public.lead_routing;
--   As service role: insert a route, confirm unique rejects a second.
-- ═════════════════════════════════════════════════════════════
