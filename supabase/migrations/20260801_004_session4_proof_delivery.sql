-- =============================================================
-- PUNYATA — Session 4: Proof Upload + Batch Delivery Support
-- Project  : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch   : Staging
-- Depends  : 20260725_002_batch_tracking.sql
-- Created  : 2026-08-01
-- =============================================================
--
-- WHY THIS MIGRATION EXISTS:
--
-- [FIX-1] Session 0.5 created UNIQUE(batch_date, batch_type) on
--         sankalp_batches. The LOCKED business rule for Last
--         Saturday requires TWO batch rows on the SAME date
--         (sankalp_variant 'hawan_only' + 'full_package').
--         The old constraint makes that physically impossible.
--         → Replaced with a variant-aware unique index.
--         Independence rule [BL-1] is unchanged: each row is
--         still fully independent; nothing here ties rows together.
--
-- [NEW-1] sankalp_batch_subscriptions.segment_number — links each
--         subscriber in a batch to their name-reading segment
--         (video in name_segments). NULL until admin auto-assigns.
--
-- [NEW-2] proof_deliveries — per-subscriber, per-message delivery
--         tracking for the wa.me stub period. Two rows per
--         subscriber per batch: 'common' footage + 'segment' video.
--         whatsapp_msg_id is present NOW so the Meta Cloud API can
--         populate it later WITHOUT a schema change.
--         seva_proofs.is_delivered stays batch-level and is set to
--         true only when every proof_deliveries row for that batch
--         is delivered (roll-up enforced by application code).
--
-- [BL-2] Status vocabulary unchanged: pending | done | missed.
--        The word "Covered" appears nowhere and never will.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. [FIX-1] Variant-aware uniqueness on sankalp_batches
-- ─────────────────────────────────────────────────────────────
--
-- Drop the Session 0.5 constraint that only allowed ONE row per
-- (batch_date, batch_type). Postgres treats NULLs as distinct in
-- regular UNIQUE constraints, so a plain 3-column UNIQUE would
-- allow duplicate first_tuesday rows (variant NULL). A partial
-- index pair avoids that trap:
--   a) first_tuesday rows (variant IS NULL): unique per date+type
--   b) last_saturday rows: unique per date+type+variant

ALTER TABLE public.sankalp_batches
    DROP CONSTRAINT IF EXISTS sankalp_batches_batch_date_batch_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sankalp_batches_date_type_nullvariant
    ON public.sankalp_batches (batch_date, batch_type)
    WHERE sankalp_variant IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sankalp_batches_date_type_variant
    ON public.sankalp_batches (batch_date, batch_type, sankalp_variant)
    WHERE sankalp_variant IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- 2. [NEW-1] Segment assignment on batch memberships
-- ─────────────────────────────────────────────────────────────
--
-- segment_number: 1-based, matches name_segments.segment_number
-- for the same batch_id. Assigned by the admin "auto-assign
-- segments" action (groups of SEGMENT_GROUP_SIZE = 20
-- subscriptions — see Session 4 notes; this size is a working
-- default pending Chirayu's confirmation).

ALTER TABLE public.sankalp_batch_subscriptions
    ADD COLUMN IF NOT EXISTS segment_number int
    CHECK (segment_number >= 1);

CREATE INDEX IF NOT EXISTS idx_sbs_batch_segment
    ON public.sankalp_batch_subscriptions (batch_id, segment_number);


-- ─────────────────────────────────────────────────────────────
-- 3. [NEW-2] proof_deliveries — per-message delivery tracking
-- ─────────────────────────────────────────────────────────────
--
-- One row = one WhatsApp message owed to one subscriber for one
-- batch. message_kind:
--   'common'  → the batch-wide seva footage (seva_proofs.media_url)
--   'segment' → the subscriber's name-reading clip (name_segments)
--
-- wa_link stores the pre-filled wa.me URL generated at "prepare
-- delivery" time so the admin UI is a pure confirm-tap queue.
-- whatsapp_msg_id stays NULL while the wa.me fallback is active;
-- Meta Cloud API will populate it in place — no schema change.

CREATE TABLE IF NOT EXISTS public.proof_deliveries (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id         uuid NOT NULL
                         REFERENCES public.sankalp_batches(id) ON DELETE CASCADE,
    subscription_id  uuid NOT NULL
                         REFERENCES public.subscriptions(id) ON DELETE CASCADE,

    message_kind     text NOT NULL
                         CHECK (message_kind IN ('common', 'segment')),

    -- Copied from sankalp_batch_subscriptions.segment_number at
    -- preparation time (NULL for 'common' rows).
    segment_number   int,

    wa_link          text,

    is_delivered     boolean NOT NULL DEFAULT false,
    delivered_at     timestamptz,

    -- NULL during wa.me stub period; Meta Cloud API writes here.
    whatsapp_msg_id  text,

    created_at       timestamptz NOT NULL DEFAULT now(),

    -- Exactly one 'common' and one 'segment' row per sub per batch.
    UNIQUE (batch_id, subscription_id, message_kind)
);

CREATE INDEX IF NOT EXISTS idx_proof_deliveries_batch
    ON public.proof_deliveries (batch_id, is_delivered);

CREATE INDEX IF NOT EXISTS idx_proof_deliveries_subscription
    ON public.proof_deliveries (subscription_id);

-- ─────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY — proof_deliveries
-- ─────────────────────────────────────────────────────────────
-- Pattern mirrors sankalp_batch_subscriptions:
--   user reads rows tied to their own subscriptions; admin full.

ALTER TABLE public.proof_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proof_deliveries: user reads own"
    ON public.proof_deliveries FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.subscriptions s
            WHERE s.id = subscription_id
              AND s.user_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY "proof_deliveries: admin full access"
    ON public.proof_deliveries FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());


-- ─────────────────────────────────────────────────────────────
-- 5. Supporting index for the admin-role RLS check
-- ─────────────────────────────────────────────────────────────
-- is_admin() runs profiles.role = 'admin' on nearly every
-- privileged query. profiles.id is the PK (already indexed) so
-- the lookup is by PK; no extra index needed. This comment is
-- here to record that the check was considered (Session 4 perf
-- review item) and is PK-backed, not a seq-scan risk.

-- ═════════════════════════════════════════════════════════════
-- END OF MIGRATION 20260801_004_session4_proof_delivery
-- ═════════════════════════════════════════════════════════════
