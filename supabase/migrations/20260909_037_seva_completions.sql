-- =============================================================
-- PUNYATA — Session: Manual Seva Completion Marking
-- Project  : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch   : Staging
-- Depends  : 20260725_001_core_schema.sql
-- Created  : 2026-09-09
-- =============================================================
--
-- WHY THIS MIGRATION EXISTS:
--
-- The "Completed Sevas" counter on /my-subscription only ever
-- moved via the batch WhatsApp-proof pipeline (proof_deliveries
-- .is_delivered, itself downstream of a sankalp_batches row +
-- segment assignment + delivery confirm-tap). That pipeline is
-- correct for the monthly cohort batches, but there was no way
-- for a telecaller/admin to mark ONE subscriber's seva done on
-- the spot (a courtesy/welcome seva performed off the normal
-- batch cadence) and have it show up on her card immediately.
--
-- seva_completions is a lightweight, batch-independent record of
-- exactly that: "this subscriber's seva was done, marked by this
-- staff member, at this time." /my-subscription adds this count
-- to the existing proof_deliveries-derived count.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.seva_completions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id  uuid NOT NULL
                         REFERENCES public.subscriptions(id) ON DELETE CASCADE,

    completed_at     timestamptz NOT NULL DEFAULT now(),

    -- Staff member who marked it (telecaller/admin/owner). No FK to
    -- auth.users here — profiles.id mirrors auth.users.id already.
    marked_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

    note             text,

    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seva_completions_subscription
    ON public.seva_completions (subscription_id, completed_at DESC);

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY — mirrors proof_deliveries / ashirwad_patras:
-- user reads rows tied to their own subscriptions; admin full.
-- The telecaller panel writes through the service-role client
-- (requireTelecaller), so no telecaller-specific policy is needed.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.seva_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seva_completions: user reads own"
    ON public.seva_completions FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.subscriptions s
            WHERE s.id = subscription_id
              AND s.user_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY "seva_completions: admin full access"
    ON public.seva_completions FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ═════════════════════════════════════════════════════════════
-- END OF MIGRATION 20260909_037_seva_completions
-- ═════════════════════════════════════════════════════════════
