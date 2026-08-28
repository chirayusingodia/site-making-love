-- =============================================================
-- PUNYATA — Gateway-agnostic mandates + renewable tenure
-- Project : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch  : Staging
-- Created : 2026-08-28
-- =============================================================
--
-- WHY THIS MIGRATION EXISTS
--
-- Two structural problems, one root cause: the SUBSCRIPTION and the
-- PAYMENT MANDATE were the same object, and that object was Razorpay's.
--
--  1. TENURE. Razorpay's Subscriptions API demands total_count at
--     creation (RBI/NPCI rule: every UPI Autopay / e-mandate carries a
--     fixed number of debits or a fixed validity) AND rejects any
--     computed end_time past 2120-12-31 (unix 4765046400). Modelling
--     "runs until cancelled" as one 100-year mandate broke EVERY
--     checkout on 2026-08-28 ("end_time must be between 946684800 and
--     4765046400") because now+100y already overshoots that fixed
--     calendar wall. No single mandate can be permanent; the mandate
--     must be a RENEWABLE resource under a permanent subscription.
--
--  2. GATEWAY LOCK-IN. subscriptions.razorpay_sub_id hardcoded one
--     provider into the subscription row itself. If the Razorpay
--     account is blocked, rate-limited, or simply down, there was no
--     way to sell anything — and no place to record a mandate that
--     lives somewhere else.
--
-- THE SHAPE (how Netflix/Amazon India actually run UPI Autopay):
--   subscriptions          = the customer relationship. Permanent.
--                            No gateway identifiers AT ALL.
--   subscription_mandates  = the instrument collecting money for it.
--                            Time-boxed, disposable, RENEWABLE, and
--                            tagged with WHICH gateway issued it. Many
--                            per subscription over its life; exactly
--                            one is_current at a time.
--   plan_gateway_refs      = each plan's id at each gateway. Fallback
--                            is only real if the backup gateway has
--                            its own plan id — this is that table.
--   payment_gateways       = operational state: priority, kill switch,
--                            and a DB-backed circuit breaker (in-memory
--                            breakers are useless on serverless, where
--                            every invocation starts cold).
--
-- PRE-LAUNCH CUT-OVER: the DB carries no live subscribers, so the
-- gateway columns are DROPPED rather than shadowed by a compat layer.
-- The backfill blocks below RAISE NOTICE if they ever find rows, so a
-- non-empty database announces itself instead of silently guessing.
-- =============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 0. Drop the dependent view FIRST
-- ─────────────────────────────────────────────────────────────
-- subscriber_list_view (migration 015 §3) selects s.razorpay_sub_id,
-- so Postgres REFUSES to drop that column while the view exists
-- ("cannot drop column ... because other objects depend on it").
-- CREATE OR REPLACE VIEW cannot rescue us either: replacing a view may
-- only APPEND columns, and we are removing one from the middle of the
-- select list. So the view is dropped here and recreated in §6 once
-- the new shape exists.
DROP VIEW IF EXISTS public.subscriber_list_view;

-- ─────────────────────────────────────────────────────────────
-- 1. payment_gateways — operational state + circuit breaker
-- ─────────────────────────────────────────────────────────────
-- Deliberately holds ONLY operational state. Provider FACTS (the
-- end_time ceiling, cycle arithmetic, endpoint paths, signature
-- algorithm) live in the adapter code, versioned with the code that
-- calls the API — splitting them across code and rows is how the two
-- drift apart and produce another end_time incident.

CREATE TABLE IF NOT EXISTS public.payment_gateways (
    id                   text PRIMARY KEY,          -- 'razorpay', 'cashfree', …
    display_name         text NOT NULL,

    -- Selection: lower priority wins. is_enabled is the MANUAL kill
    -- switch (an owner flips it the moment an account is blocked);
    -- the breaker below is the AUTOMATIC one.
    priority             int  NOT NULL DEFAULT 100,
    is_enabled           boolean NOT NULL DEFAULT true,
    supports_mandates    boolean NOT NULL DEFAULT true,

    -- ── DB-backed circuit breaker ────────────────────────────
    -- Shared across every serverless invocation. circuit_until in the
    -- future = gateway is skipped by selection; it half-opens by
    -- simply letting the timestamp lapse (next attempt probes it).
    consecutive_failures int NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
    circuit_opened_at    timestamptz,
    circuit_until        timestamptz,
    last_failure_at      timestamptz,
    last_failure_reason  text,
    last_success_at      timestamptz,

    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payment_gateways IS
  'Operational state per payment gateway: priority, manual kill switch, and DB-backed circuit breaker. Provider API facts live in src/lib/gateways/<id>.ts, never here.';
COMMENT ON COLUMN public.payment_gateways.circuit_until IS
  'While in the future, gateway selection skips this gateway. Lapsing is the half-open probe.';

-- Razorpay is the incumbent primary. A second gateway is an INSERT
-- here plus an adapter module plus its plan_gateway_refs rows —
-- no schema change, no code surgery in the checkout path.
INSERT INTO public.payment_gateways (id, display_name, priority)
VALUES ('razorpay', 'Razorpay', 10)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 2. plan_gateway_refs — each plan's id at each gateway
-- ─────────────────────────────────────────────────────────────
-- Fallback is only genuinely available for a plan that HAS a plan id
-- at the fallback gateway. Selection code filters on exactly this.

CREATE TABLE IF NOT EXISTS public.plan_gateway_refs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id         uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    gateway         text NOT NULL REFERENCES public.payment_gateways(id) ON DELETE RESTRICT,
    gateway_plan_id text NOT NULL CHECK (length(btrim(gateway_plan_id)) > 0),
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (plan_id, gateway)
);

CREATE INDEX IF NOT EXISTS plan_gateway_refs_lookup_idx
    ON public.plan_gateway_refs (plan_id, gateway)
    WHERE is_active;

COMMENT ON TABLE public.plan_gateway_refs IS
  'Per-gateway plan identifier for each Punyata plan. A plan is sellable through a gateway only when an is_active row exists here.';

-- Carry over whatever plans.razorpay_plan_id held.
INSERT INTO public.plan_gateway_refs (plan_id, gateway, gateway_plan_id)
SELECT p.id, 'razorpay', btrim(p.razorpay_plan_id)
FROM public.plans p
WHERE p.razorpay_plan_id IS NOT NULL
  AND length(btrim(p.razorpay_plan_id)) > 0
ON CONFLICT (plan_id, gateway) DO NOTHING;

ALTER TABLE public.plans DROP COLUMN IF EXISTS razorpay_plan_id;

-- ─────────────────────────────────────────────────────────────
-- 3. subscription_mandates — the renewable payment instrument
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subscription_mandates (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id     uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,

    -- ── Which gateway issued this mandate ────────────────────
    gateway             text NOT NULL REFERENCES public.payment_gateways(id) ON DELETE RESTRICT,
    gateway_mandate_id  text NOT NULL,   -- Razorpay sub_…, Cashfree ref, …
    gateway_customer_id text,
    gateway_plan_id     text,

    -- Normalised status vocabulary — every adapter maps its provider's
    -- words onto THIS list so no consumer ever branches per-gateway.
    status              text NOT NULL DEFAULT 'created'
                            CHECK (status IN ('created','authenticated','active','pending',
                                              'halted','paused','cancelled','completed','expired')),

    -- ── Tenure ───────────────────────────────────────────────
    -- total_count is the mandate's legal debit count (RBI/NPCI).
    -- tenure_years records what we ASKED for, so a mandate created
    -- under a different policy is self-describing years later.
    total_count         int NOT NULL CHECK (total_count > 0),
    tenure_years        int CHECK (tenure_years IS NULL OR tenure_years > 0),
    cycles_paid         int NOT NULL DEFAULT 0 CHECK (cycles_paid >= 0),
    expected_end_at     timestamptz,

    -- ── Renewal chain ────────────────────────────────────────
    -- is_current = the mandate actually charging right now. A
    -- replacement is born is_current=false and is PROMOTED only once
    -- the customer authenticates it (webhook), because a fresh UPI
    -- Autopay mandate legally requires their consent — it cannot be
    -- swapped in silently server-side.
    is_current          boolean NOT NULL DEFAULT true,
    replaces_mandate_id uuid REFERENCES public.subscription_mandates(id) ON DELETE SET NULL,
    renewal_started_at  timestamptz,
    retired_at          timestamptz,
    retire_reason       text,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE (gateway, gateway_mandate_id)
);

-- Exactly one charging mandate per subscription — enforced by the DB,
-- not by hope. promote_mandate() below is the only sanctioned swap.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_mandates_one_current_idx
    ON public.subscription_mandates (subscription_id)
    WHERE is_current;

-- Webhook resolution path: (gateway, gateway_mandate_id) → subscription.
CREATE INDEX IF NOT EXISTS subscription_mandates_subscription_idx
    ON public.subscription_mandates (subscription_id);

-- Renewal sweep: "which mandates are running out soon?"
CREATE INDEX IF NOT EXISTS subscription_mandates_renewal_idx
    ON public.subscription_mandates (expected_end_at)
    WHERE is_current;

COMMENT ON TABLE public.subscription_mandates IS
  'Renewable, gateway-tagged payment mandate. Many per subscription over its lifetime; exactly one is_current. Subscriptions never hold gateway ids themselves.';
COMMENT ON COLUMN public.subscription_mandates.is_current IS
  'The mandate currently authorised to charge. Replacements start false and are promoted by promote_mandate() once authenticated.';

-- Carry over any existing Razorpay linkage. Pre-launch this finds
-- nothing; the NOTICE makes a non-empty DB impossible to miss, since
-- the original total_count is NOT recoverable from our own rows.
DO $$
DECLARE
    v_count int;
BEGIN
    INSERT INTO public.subscription_mandates (
        subscription_id, gateway, gateway_mandate_id, gateway_customer_id,
        status, total_count, tenure_years, is_current, created_at
    )
    SELECT
        s.id,
        'razorpay',
        s.razorpay_sub_id,
        s.razorpay_customer_id,
        CASE s.status
            WHEN 'active'    THEN 'active'
            WHEN 'paused'    THEN 'paused'
            WHEN 'cancelled' THEN 'cancelled'
            WHEN 'expired'   THEN 'expired'
            WHEN 'halted'    THEN 'halted'
            ELSE 'created'
        END,
        12,     -- UNKNOWABLE from our side; see NOTICE below
        NULL,
        true,
        s.created_at
    FROM public.subscriptions s
    WHERE s.razorpay_sub_id IS NOT NULL
    ON CONFLICT (gateway, gateway_mandate_id) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
        RAISE NOTICE 'gateway cut-over: backfilled % mandate row(s) with a PLACEHOLDER total_count=12. Reconcile each against the gateway dashboard before trusting renewal maths.', v_count;
    END IF;
END $$;

ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS razorpay_sub_id;
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS razorpay_customer_id;

-- ─────────────────────────────────────────────────────────────
-- 3b. payments.gateway — a refund must go back through the
--     provider that actually took the money
-- ─────────────────────────────────────────────────────────────
-- Without this, the refund path would have to assume "whichever
-- gateway is primary today", which is wrong the moment a subscription
-- has charged on two different providers over its life.
--
-- DELIBERATE, DOCUMENTED DEBT: the existing id columns keep their
-- razorpay_* names (81 references across 13 files; a rename buys
-- nothing functional and risks the money ledger). Read
-- payments.razorpay_payment_id as "the gateway's payment id" and
-- payments.gateway as "which gateway that id belongs to".

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS gateway text NOT NULL DEFAULT 'razorpay'
        REFERENCES public.payment_gateways(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.payments.gateway IS
  'Which gateway issued razorpay_payment_id / razorpay_refund_id. Those column names predate multi-gateway support and now mean "the gateway payment/refund id".';

-- ─────────────────────────────────────────────────────────────
-- 4. Atomic helpers (Supabase JS has no transactions)
-- ─────────────────────────────────────────────────────────────

-- Promote a replacement mandate to current, retiring the incumbent in
-- ONE statement pair inside one transaction, so the
-- one-current-per-subscription index can never be transiently violated
-- by two racing webhook deliveries. Returns the retired mandate so the
-- caller can cancel it at its gateway (best-effort, outside the txn).
CREATE OR REPLACE FUNCTION public.promote_mandate(p_mandate_id uuid)
RETURNS TABLE (retired_gateway text, retired_gateway_mandate_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_subscription_id uuid;
    v_already_current boolean;
BEGIN
    SELECT m.subscription_id, m.is_current
      INTO v_subscription_id, v_already_current
      FROM public.subscription_mandates m
     WHERE m.id = p_mandate_id
       FOR UPDATE;

    IF v_subscription_id IS NULL THEN
        RAISE EXCEPTION 'promote_mandate: mandate % not found', p_mandate_id;
    END IF;

    -- Idempotent: a replayed webhook promoting the already-current
    -- mandate retires nothing and returns no rows.
    IF v_already_current THEN
        RETURN;
    END IF;

    RETURN QUERY
    UPDATE public.subscription_mandates m
       SET is_current    = false,
           retired_at    = now(),
           retire_reason = COALESCE(m.retire_reason, 'superseded_by_renewal'),
           updated_at    = now()
     WHERE m.subscription_id = v_subscription_id
       AND m.is_current
       AND m.id <> p_mandate_id
    RETURNING m.gateway, m.gateway_mandate_id;

    UPDATE public.subscription_mandates
       SET is_current    = true,
           retired_at    = NULL,
           retire_reason = NULL,
           updated_at    = now()
     WHERE id = p_mandate_id;
END;
$$;

-- Circuit breaker: atomic increment. Trips once consecutive_failures
-- reaches the threshold, staying tripped for the cool-off window.
CREATE OR REPLACE FUNCTION public.gateway_record_failure(
    p_gateway          text,
    p_reason           text,
    p_threshold        int DEFAULT 3,
    p_cooloff_seconds  int DEFAULT 300
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.payment_gateways g
       SET consecutive_failures = g.consecutive_failures + 1,
           last_failure_at      = now(),
           last_failure_reason  = left(COALESCE(p_reason, ''), 500),
           circuit_opened_at    = CASE
                                      WHEN g.consecutive_failures + 1 >= p_threshold
                                      THEN COALESCE(g.circuit_opened_at, now())
                                      ELSE g.circuit_opened_at
                                  END,
           circuit_until        = CASE
                                      WHEN g.consecutive_failures + 1 >= p_threshold
                                      THEN now() + make_interval(secs => GREATEST(p_cooloff_seconds, 1))
                                      ELSE g.circuit_until
                                  END,
           updated_at           = now()
     WHERE g.id = p_gateway;
END;
$$;

-- Any success fully closes the breaker — one working call proves the
-- gateway is back, and a half-open probe that succeeds must not leave
-- a stale failure count behind to trip it early next time.
CREATE OR REPLACE FUNCTION public.gateway_record_success(p_gateway text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.payment_gateways
       SET consecutive_failures = 0,
           circuit_opened_at    = NULL,
           circuit_until        = NULL,
           last_failure_reason  = NULL,
           last_success_at      = now(),
           updated_at           = now()
     WHERE id = p_gateway;
END;
$$;

-- Gateways currently worth attempting, best first. Plan-level
-- availability (plan_gateway_refs) is applied by the caller, which
-- knows which plan it is selling.
CREATE OR REPLACE FUNCTION public.usable_payment_gateways()
RETURNS TABLE (gateway text, priority int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT g.id, g.priority
      FROM public.payment_gateways g
     WHERE g.is_enabled
       AND g.supports_mandates
       AND (g.circuit_until IS NULL OR g.circuit_until <= now())
     ORDER BY g.priority ASC, g.id ASC;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────────────────────────
-- Server routes use the service-role client (which bypasses RLS), so
-- these policies exist to keep the tables closed to everyone else —
-- plus a read for a subscriber's own mandate history.

ALTER TABLE public.payment_gateways      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_gateway_refs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_mandates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_gateways_admin_read ON public.payment_gateways;
CREATE POLICY payment_gateways_admin_read ON public.payment_gateways
    FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS plan_gateway_refs_admin_read ON public.plan_gateway_refs;
CREATE POLICY plan_gateway_refs_admin_read ON public.plan_gateway_refs
    FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS subscription_mandates_admin_read ON public.subscription_mandates;
CREATE POLICY subscription_mandates_admin_read ON public.subscription_mandates
    FOR SELECT USING (public.is_admin());

-- A subscriber may see the mandates on their OWN subscription (read
-- only — nothing client-side ever writes a mandate).
DROP POLICY IF EXISTS subscription_mandates_own_read ON public.subscription_mandates;
CREATE POLICY subscription_mandates_own_read ON public.subscription_mandates
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.subscriptions s
             WHERE s.id = subscription_mandates.subscription_id
               AND s.user_id = auth.uid()
        )
    );

-- ─────────────────────────────────────────────────────────────
-- 6. subscriber_list_view — gateway columns now come from the
--    CURRENT mandate, not from subscriptions
-- ─────────────────────────────────────────────────────────────
-- Same definition as 20260823_015 §3, with s.razorpay_sub_id replaced
-- by the current mandate's gateway + id (+ tenure telemetry the admin
-- console can show).
--
-- CREATE (not CREATE OR REPLACE): §0 dropped this view so the column
-- drops could proceed, and the select list changed shape besides.

CREATE VIEW public.subscriber_list_view AS
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
    )                         AS family_member_count

FROM public.subscriptions s

LEFT JOIN public.plans        p  ON p.id  = s.plan_id
LEFT JOIN public.sales_agents sa ON sa.id = s.sales_agent_id
LEFT JOIN public.coupons      c  ON c.id  = s.coupon_id

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

COMMIT;

-- ── Verification ─────────────────────────────────────────────────
-- SELECT * FROM public.usable_payment_gateways();
--   Expect: ('razorpay', 10)
-- SELECT plan_id, gateway, gateway_plan_id FROM public.plan_gateway_refs;
--   Expect: one row per plan that previously had razorpay_plan_id set.
-- SELECT mandate_gateway, mandate_gateway_id FROM public.subscriber_list_view LIMIT 5;
--   Expect: the columns resolve (NULL until a mandate is created).
