-- =============================================================
-- PUNYATA — Session: Halted Subscription Detection + Recovery
-- Project : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch  : Staging
-- Created : 2026-08-23
-- =============================================================
--
-- Razorpay moves a subscription to 'halted' on its side after its
-- own retry window (~3 days) is exhausted and fires the
-- subscription.halted webhook. Until now that event was acked and
-- thrown away: our status CHECK had no 'halted' value, so our DB
-- could sit at 'pending'/'active' while Razorpay considered the
-- mandate dead.
--
-- This migration:
--   1. Widens subscriptions.status CHECK with 'halted'.
--   2. Adds halted_at timestamptz (mirrors paused_at/cancelled_at).
--   3. Recreates subscriber_list_view exposing halted_at so the
--      admin subscriber list + 360 view can show it.
--
-- RLS: NO CHANGE. No policy enumerates statuses except the INSERT
-- policy ("subscriptions: user inserts pending only", migration 001)
-- which gates on status='pending' and is unaffected by the new
-- value; 'halted' can only ever arrive via the service-role webhook
-- path, never from a client write.
--
-- Idempotent: safe to re-run (guarded DO block + IF NOT EXISTS).
-- =============================================================

-- ── 1. Widen the status CHECK ─────────────────────────────────
-- The original CHECK was declared INLINE in 20260725_001_core_schema.sql
-- (no explicit name), so Postgres auto-named it. Resolve the real
-- name from pg_constraint instead of guessing, then re-add under an
-- explicit, stable name.
--
-- All DDL lives INSIDE the DO block, after the already-widened
-- early-exit: a re-run against a migrated DB executes NOTHING here.

DO $$
DECLARE
    old_name text;
BEGIN
    -- Already widened? Skip entirely (idempotent re-run).
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.subscriptions'::regclass
          AND conname  = 'subscriptions_status_check'
          AND pg_get_constraintdef(oid) LIKE '%halted%'
    ) THEN
        RAISE NOTICE 'subscriptions_status_check already includes halted — skipping';
        RETURN;
    END IF;

    -- Find the existing single-column CHECK on subscriptions.status.
    SELECT c.conname INTO old_name
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.subscriptions'::regclass
      AND c.contype  = 'c'
      AND a.attname  = 'status'
    ORDER BY c.oid
    LIMIT 1;

    IF old_name IS NULL THEN
        RAISE EXCEPTION 'No CHECK constraint found on public.subscriptions.status';
    END IF;

    -- Drop the old constraint under its actual (auto-generated) name,
    -- then re-add under an explicit, stable name including 'halted'.
    EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT %I', old_name);
    EXECUTE
        'ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check ' ||
        'CHECK (status IN (''pending'',''active'',''paused'',''cancelled'',''expired'',''halted''))';
END $$;

-- ── 2. halted_at timestamp ─────────────────────────────────────

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS halted_at timestamptz;

COMMENT ON COLUMN public.subscriptions.halted_at IS
    'When Razorpay moved this subscription to halted (subscription.halted webhook). Cleared when resumed/charged/activated events arrive.';

-- ── 3. subscriber_list_view gains halted_at ────────────────────
-- Same definition as 20260725_003_subscriber_list_view.sql plus
-- s.halted_at next to paused_at/cancelled_at.

CREATE OR REPLACE VIEW public.subscriber_list_view AS
SELECT
    -- ── Subscription fields ──────────────────────────────────
    s.id                      AS subscription_id,
    s.user_id,
    s.status,
    s.start_date,
    s.next_billing_date,
    s.paused_at,
    s.cancelled_at,
    s.halted_at,
    s.cancel_reason,
    s.acquisition_channel,
    s.razorpay_sub_id,
    s.created_at              AS sub_created_at,
    s.updated_at              AS sub_updated_at,

    -- ── Plan ─────────────────────────────────────────────────
    p.id                      AS plan_id,
    p.name                    AS plan_name,
    p.price_paise             AS plan_price_paise,
    p.billing_period          AS plan_billing_period,

    -- ── Sales agent ──────────────────────────────────────────
    sa.id                     AS agent_id,
    sa.full_name              AS agent_full_name,
    sa.agent_code,

    -- ── Coupon ───────────────────────────────────────────────
    c.id                      AS coupon_id,
    c.code                    AS coupon_code,
    c.discount_type           AS coupon_discount_type,
    c.discount_value          AS coupon_discount_value,

    -- ── Primary family member (LATERAL — one row per sub) ────
    fm.id                     AS primary_member_id,
    fm.full_name              AS primary_member_name,
    fm.gotra                  AS primary_member_gotra,
    fm.relation               AS primary_member_relation,
    fm.slot_number            AS primary_member_slot,
    fm.is_primary             AS primary_member_is_primary,
    fm.dob                    AS primary_member_dob,

    -- ── Total family member count (cheap indexed count) ──────
    (
        SELECT COUNT(*)::int
        FROM public.family_members fm2
        WHERE fm2.subscription_id = s.id
    )                         AS family_member_count

FROM public.subscriptions s

LEFT JOIN public.plans        p  ON p.id  = s.plan_id
LEFT JOIN public.sales_agents sa ON sa.id = s.sales_agent_id
LEFT JOIN public.coupons      c  ON c.id  = s.coupon_id

-- LATERAL picks exactly one primary member per subscription.
LEFT JOIN LATERAL (
    SELECT *
    FROM public.family_members fm_inner
    WHERE fm_inner.subscription_id = s.id
    ORDER BY
        fm_inner.is_primary DESC,   -- true (1) before false (0)
        fm_inner.slot_number ASC,   -- slot 1 before 2,3,4
        fm_inner.created_at  ASC    -- tie-breaker
    LIMIT 1
) fm ON true;

-- ── Verification ───────────────────────────────────────────────
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.subscriptions'::regclass AND contype='c';
-- Expect: subscriptions_status_check listing all six statuses.
-- SELECT halted_at FROM public.subscriber_list_view LIMIT 1;
-- Expect: null column present, no error.
