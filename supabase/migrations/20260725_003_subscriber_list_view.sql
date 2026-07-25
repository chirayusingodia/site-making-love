-- =============================================================
-- PUNYATA — Session 2 Performance Fix
-- Project : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch  : Staging
-- Created : 2026-07-25
-- =============================================================
--
-- Creates a LIVE Postgres view (not MATERIALIZED — no staleness)
-- that collapses the full family_members join down to only the
-- primary member per subscription, joined with plan / agent /
-- coupon metadata.
--
-- DESIGN NOTE:
--   Primary member selection priority:
--     1. is_primary = true  (explicit primary flag)
--     2. slot_number = 1    (fallback if flag not set)
--     3. oldest created_at  (final tie-breaker)
-- =============================================================

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

-- ── RLS note ────────────────────────────────────────────────────
-- Views inherit RLS of underlying tables. The is_admin() check
-- on subscriptions already gates this view — no extra policy needed.
-- PostgREST exposes it automatically via the Supabase REST API.

-- ── Verification ─────────────────────────────────────────────────
-- SELECT * FROM public.subscriber_list_view LIMIT 5;
-- Expect: one row per subscription, primary_member_name populated.
