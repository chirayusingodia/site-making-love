-- =============================================================
-- PUNYATA — Subscriber contact fallback
-- Created : 2026-08-30
-- =============================================================
--
-- Bug: Pending-status subscribers show no name/phone anywhere in
-- admin.subscribers, making them uncontactable from the list.
--
-- Root cause: subscriber_list_view only sources contact info from
-- family_members, but that row is only created after checkout
-- completes (payment success / onboarding). A `pending` subscription
-- has zero family_members by definition, so primary_member_name is
-- always null for it.
--
-- The name + phone DO exist at pending-creation time though:
-- create-checkout.ts requires profiles.full_name and profiles.phone
-- before it will even create the pending row (§ "Pehle naam aur
-- mobile number bharein"). This view just never exposed them.
--
-- Fix: LEFT JOIN profiles on subscriptions.user_id and append the
-- fields as a fallback contact source, on top of the CURRENT view
-- shape from 20260828_022 (mandate-based columns, no razorpay_sub_id —
-- that column was dropped by 022, so this must NOT reintroduce it).
-- Appended at the end — CREATE OR REPLACE VIEW cannot reorder/retype
-- existing columns.
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
    s.halted_at,
    s.cancel_reason,
    s.acquisition_channel,
    s.created_at              AS sub_created_at,
    s.updated_at              AS sub_updated_at,

    -- ── Current mandate (gateway-neutral) ────────────────────
    cm.gateway                AS mandate_gateway,
    cm.gateway_mandate_id     AS mandate_gateway_id,
    cm.status                 AS mandate_status,
    cm.total_count            AS mandate_total_count,
    cm.cycles_paid            AS mandate_cycles_paid,
    cm.expected_end_at        AS mandate_expected_end_at,

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
    )                         AS family_member_count,

    -- ── Account profile (contact fallback) ───────────────────
    -- Populated from signup/checkout regardless of onboarding
    -- progress — the only reliable contact source for `pending`
    -- subscriptions, which never get a family_members row.
    pr.full_name              AS profile_full_name,
    pr.phone                  AS profile_phone,
    pr.email                  AS profile_email

FROM public.subscriptions s

LEFT JOIN public.plans        p  ON p.id  = s.plan_id
LEFT JOIN public.sales_agents sa ON sa.id = s.sales_agent_id
LEFT JOIN public.coupons      c  ON c.id  = s.coupon_id
LEFT JOIN public.profiles     pr ON pr.id = s.user_id

-- The one charging mandate (partial unique index guarantees ≤ 1).
LEFT JOIN public.subscription_mandates cm
       ON cm.subscription_id = s.id AND cm.is_current

LEFT JOIN LATERAL (
    SELECT *
    FROM public.family_members fm_inner
    WHERE fm_inner.subscription_id = s.id
    ORDER BY
        fm_inner.is_primary DESC,
        fm_inner.slot_number ASC,
        fm_inner.created_at  ASC
    LIMIT 1
) fm ON true;

-- ── RLS note ────────────────────────────────────────────────────
-- Views inherit RLS of underlying tables. The is_admin() check
-- on subscriptions already gates this view — no extra policy needed.
-- PostgREST exposes it automatically via the Supabase REST API.

-- ── Verification ─────────────────────────────────────────────────
-- SELECT subscription_id, status, primary_member_name, profile_full_name,
--        profile_phone
-- FROM public.subscriber_list_view WHERE status = 'pending' LIMIT 5;
-- Expect: profile_full_name / profile_phone populated even though
-- primary_member_name is null.
