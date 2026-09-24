-- =============================================================
-- PUNYATA — Telecaller self-serve referral links
-- Depends  : 20260822_013_leads_and_commissions.sql
-- Created  : 2026-09-24
-- =============================================================
--
-- PURPOSE:
--   Today a telecaller only gets an attribution link tied to ONE
--   assigned lead (leads.attribution_token, via
--   /api/telecaller/send-payment-link). This adds a SECOND, simpler
--   attribution surface: a telecaller can pick any active plan on
--   her own dashboard and get one stable, reusable link for that
--   plan — no lead required. Whoever signs up through it gets
--   stamped with her telecaller_id at checkout (subscriptions
--   .telecaller_id / attribution_source='token'), same commission
--   pipeline as the lead-based flow (§9/§10 of migration 013).
--
--   Deliberately separate from `leads`: this row is NOT a pipeline
--   work item, must never show up in her call queues (which filter
--   leads by assigned_to + status), and carries no field-agent
--   sourcing credit (no source_agent_id — this is a telecaller-only
--   channel).
--
--   One row per (telecaller, plan) — generating twice for the same
--   plan returns the SAME token/link, not a new one.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.telecaller_referral_links (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    telecaller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id       uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    token         text NOT NULL UNIQUE,
    created_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT telecaller_referral_links_person_plan_unique UNIQUE (telecaller_id, plan_id)
);

ALTER TABLE public.telecaller_referral_links ENABLE ROW LEVEL SECURITY;

-- Same discipline as `leads` (migration 013): no telecaller RLS
-- policy — she reaches this ONLY through /api/telecaller/* on the
-- service-role connection, which scopes every query to her own
-- callerId in application code.
CREATE POLICY "telecaller_referral_links: admin full access"
    ON public.telecaller_referral_links FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_telecaller_referral_links_telecaller
    ON public.telecaller_referral_links (telecaller_id);
CREATE INDEX IF NOT EXISTS idx_telecaller_referral_links_token
    ON public.telecaller_referral_links (token);

COMMENT ON TABLE public.telecaller_referral_links IS
    'Self-serve (telecaller, plan) -> attribution token. Rides the SAME ?att= param and subscriptions.telecaller_id stamping as leads.attribution_token (see create-checkout.ts), but is looked up independently and never joins the leads/call-queue tables.';

-- ═════════════════════════════════════════════════════════════
-- END OF MIGRATION 20260924_040_telecaller_referral_links
-- ═════════════════════════════════════════════════════════════
