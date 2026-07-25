-- =============================================================
-- PUNYATA — Session 0.5: Sankalp Batch Tracking Schema
-- Project  : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch   : Staging
-- Depends  : 20260725_001_core_schema.sql (Session 0 must exist)
-- Created  : 2026-07-25
-- =============================================================
--
-- BUSINESS LOGIC ENCODED AS PERMANENT COMMENTS (enforcement via
-- Session 4 / API layer, not application code here):
--
-- [BL-1] First-Tuesday and Last-Saturday batches are ALWAYS
--        independent rows in sankalp_batches. Completing one
--        row MUST NEVER cascade, trigger, or otherwise affect
--        any other row. No trigger or FK rule may tie them.
--
-- [BL-2] Status values are strictly 'pending' | 'done' | 'missed'.
--        The word "Covered" MUST NEVER appear in any label,
--        display value, migration comment, or seed data.
--        Enforced here by CHECK constraint.
--
-- [BL-3] Batches are generated live at query time (Session 4).
--        Do NOT add materialized views, summary tables, or any
--        caching layer for batch membership. This file contains
--        none and no future migration should add one without
--        explicit architectural approval.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. sankalp_batches
-- ─────────────────────────────────────────────────────────────
--
-- One row = one real-world seva event (either 1st Tuesday or
-- Last Saturday of a given month).
--
-- batch_type: 'first_tuesday' | 'last_saturday'
--   - These are always independent. [BL-1]
--
-- sankalp_variant: only meaningful for last_saturday rows.
--   - 'hawan_only'    → Sarv Rog Nivaran Hawan only
--   - 'full_package'  → Hawan + Saadhu Santo Ko Bhojan + all premium sevas
--   - NULL            → first_tuesday rows (variant not applicable)
--
-- status: 'pending' | 'done' | 'missed'  — never 'covered'. [BL-2]
--
-- subscriber_count: denormalised snapshot taken at batch-generation
--   time. Source of truth remains sankalp_batch_subscriptions.
--   This column is for fast reporting only.

CREATE TABLE IF NOT EXISTS public.sankalp_batches (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- [BL-1] batch_type drives independence — never use this
    -- column to infer a relationship between rows of different types.
    batch_type        text NOT NULL
                          CHECK (batch_type IN ('first_tuesday', 'last_saturday')),

    batch_date        date NOT NULL,

    -- [BL-1] sankalp_variant is NULL for first_tuesday rows.
    -- Only last_saturday rows carry a variant.
    sankalp_variant   text
                          CHECK (
                              sankalp_variant IS NULL
                              OR sankalp_variant IN ('hawan_only', 'full_package')
                          ),

    -- [BL-2] Status vocabulary: pending / done / missed only.
    -- "Covered" is not a valid status — enforced by this constraint.
    status            text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'done', 'missed')),

    completed_at      timestamptz,         -- set when status → 'done'

    -- Denormalised count for fast admin reporting.
    -- Source of truth is sankalp_batch_subscriptions. [BL-3]
    subscriber_count  int NOT NULL DEFAULT 0
                          CHECK (subscriber_count >= 0),

    created_at        timestamptz NOT NULL DEFAULT now(),

    -- Ensure each (date, type) combination is unique — you cannot
    -- have two first-tuesday batches on the same date.
    UNIQUE (batch_date, batch_type)
);

-- ─────────────────────────────────────────────────────────────
-- 2. sankalp_batch_subscriptions
-- ─────────────────────────────────────────────────────────────
--
-- Junction: which subscriptions are included in a given batch.
--
-- is_catchup: true if this subscription was added after the
--   batch's natural cutoff (mid-month join catch-up logic).
--   Driven by Session 4 batch-generation function, not here.
--
-- One subscription can appear in multiple batches (one per month
-- per batch_type). The composite UNIQUE prevents double-booking
-- a subscription into the same batch.

CREATE TABLE IF NOT EXISTS public.sankalp_batch_subscriptions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id         uuid NOT NULL
                         REFERENCES public.sankalp_batches(id) ON DELETE CASCADE,
    subscription_id  uuid NOT NULL
                         REFERENCES public.subscriptions(id) ON DELETE CASCADE,

    -- is_catchup: true when the subscriber joined after the month's
    -- first-tuesday cutoff and is being included in the same month's
    -- last-saturday batch as a grace catch-up.
    is_catchup       boolean NOT NULL DEFAULT false,

    created_at       timestamptz NOT NULL DEFAULT now(),

    -- Prevent a subscription from appearing twice in the same batch.
    UNIQUE (batch_id, subscription_id)
);

-- ─────────────────────────────────────────────────────────────
-- 3. name_segments
-- ─────────────────────────────────────────────────────────────
--
-- Stores the video URLs for each named segment within a batch.
-- A "segment" is the portion of the sankalp recording where a
-- specific set of subscriber names is read aloud.
--
-- segment_number: 1-based ordering within the batch (used by
--   the WhatsApp delivery function in Session 4 to send the
--   correct clip to each subscriber).

CREATE TABLE IF NOT EXISTS public.name_segments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        uuid NOT NULL
                        REFERENCES public.sankalp_batches(id) ON DELETE CASCADE,
    segment_number  int NOT NULL CHECK (segment_number >= 1),
    video_url       text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),

    -- Each segment number must be unique within a batch.
    UNIQUE (batch_id, segment_number)
);

-- ─────────────────────────────────────────────────────────────
-- 4. plan_history
-- ─────────────────────────────────────────────────────────────
--
-- Immutable append-only audit log of plan changes per subscription.
-- changed_by references profiles (not auth.users directly) so we
-- capture the admin/agent who actioned the change, with their role.

CREATE TABLE IF NOT EXISTS public.plan_history (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id  uuid NOT NULL
                         REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    old_plan_id      uuid NOT NULL
                         REFERENCES public.plans(id) ON DELETE RESTRICT,
    new_plan_id      uuid NOT NULL
                         REFERENCES public.plans(id) ON DELETE RESTRICT,
    changed_at       timestamptz NOT NULL DEFAULT now(),
    changed_by       uuid
                         REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────────────────────────
-- 5. ALTER family_members — add dob column
-- ─────────────────────────────────────────────────────────────
--
-- dob: date of birth, nullable. Used by the birthday pooja
-- add-on feature (planned for a future session). Not enforced
-- here beyond accepting a valid date.

ALTER TABLE public.family_members
    ADD COLUMN IF NOT EXISTS dob date;

-- ─────────────────────────────────────────────────────────────
-- 6. Wire seva_proofs.batch_id FK (deferred from Session 0)
-- ─────────────────────────────────────────────────────────────
--
-- Session 0 left batch_id as a plain uuid with no FK because
-- sankalp_batches didn't exist yet. Now that it does, we add
-- the FK constraint. We use ADD CONSTRAINT … IF NOT EXISTS
-- (PG 9.x+ supports IF NOT EXISTS on constraints via DO block).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'seva_proofs_batch_id_fkey'
          AND table_schema    = 'public'
          AND table_name      = 'seva_proofs'
    ) THEN
        ALTER TABLE public.seva_proofs
            ADD CONSTRAINT seva_proofs_batch_id_fkey
            FOREIGN KEY (batch_id)
            REFERENCES public.sankalp_batches(id)
            ON DELETE SET NULL;
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 7. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────
-- Pattern mirrors Session 0:
--   sankalp_batches            → public read, admin write
--   sankalp_batch_subscriptions→ user reads own (via subscription),
--                                admin full access
--   name_segments              → public read (delivered content),
--                                admin write
--   plan_history               → user reads own, admin full access

ALTER TABLE public.sankalp_batches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sankalp_batch_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.name_segments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_history                 ENABLE ROW LEVEL SECURITY;

-- sankalp_batches: public read (schedule transparency), admin write
CREATE POLICY "sankalp_batches: public read"
    ON public.sankalp_batches FOR SELECT USING (true);
CREATE POLICY "sankalp_batches: admin write"
    ON public.sankalp_batches FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- sankalp_batch_subscriptions: user reads rows linked to their subscriptions
CREATE POLICY "sankalp_batch_subs: user reads own"
    ON public.sankalp_batch_subscriptions FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.subscriptions s
            WHERE s.id = subscription_id
              AND s.user_id = auth.uid()
        )
        OR public.is_admin()
    );
CREATE POLICY "sankalp_batch_subs: admin full access"
    ON public.sankalp_batch_subscriptions FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- name_segments: public read (video clips delivered to subscribers)
CREATE POLICY "name_segments: public read"
    ON public.name_segments FOR SELECT USING (true);
CREATE POLICY "name_segments: admin write"
    ON public.name_segments FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- plan_history: user reads own subscription history; admin sees all
CREATE POLICY "plan_history: user reads own"
    ON public.plan_history FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.subscriptions s
            WHERE s.id = subscription_id
              AND s.user_id = auth.uid()
        )
        OR public.is_admin()
    );
CREATE POLICY "plan_history: admin full access"
    ON public.plan_history FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- 8. PERFORMANCE INDEXES
-- ─────────────────────────────────────────────────────────────

-- Frequent query: "get all batches for a given month/type"
CREATE INDEX IF NOT EXISTS idx_sankalp_batches_date_type
    ON public.sankalp_batches(batch_date, batch_type);

CREATE INDEX IF NOT EXISTS idx_sankalp_batches_status
    ON public.sankalp_batches(status);

-- Frequent query: "which batch does this subscription belong to"
CREATE INDEX IF NOT EXISTS idx_sbs_subscription_id
    ON public.sankalp_batch_subscriptions(subscription_id);

CREATE INDEX IF NOT EXISTS idx_sbs_batch_id
    ON public.sankalp_batch_subscriptions(batch_id);

-- Delivery lookup: "get all name_segments for a batch, ordered"
CREATE INDEX IF NOT EXISTS idx_name_segments_batch_id
    ON public.name_segments(batch_id, segment_number);

CREATE INDEX IF NOT EXISTS idx_plan_history_subscription_id
    ON public.plan_history(subscription_id);

-- ═════════════════════════════════════════════════════════════
-- END OF MIGRATION 20260725_002_batch_tracking
-- ═════════════════════════════════════════════════════════════
