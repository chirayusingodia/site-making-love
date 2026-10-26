-- =============================================================
-- PUNYATA — Offline (QR) subscribers + Expenses / P&L
-- Project  : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch   : Staging
-- Depends  : through 20261014_041_meta_capi.sql
-- Created  : 2026-10-25
-- =============================================================
--
-- PART A — Offline subscribers. Full subscribers who pay each month by
-- scanning Punyata's UPI QR (or cash / bank transfer) instead of a
-- Razorpay mandate. Their money lands in `payments` as
-- status='captured', gateway='offline_qr', so MRR / Reports / P&L pick
-- it up without forking any revenue math.
--
--   3.1  payment_gateways row 'offline_qr' (never selectable at checkout)
--   3.2  subscriptions.payment_mode + offline_anchor_day, mandate guard
--   3.3  offline_payment_details  (OWNER-ONLY: UTR, proof, notes, undo)
--   3.8  SECURITY DEFINER RPCs — create / record / void / cancel / lapse
--
-- PART B — Expenses, other income and P&L (OWNER-ONLY).
--   3.4  finance_categories (+ seed)
--   3.5  finance_entries    (the ledger, soft-delete)
--
--   3.6  RLS on all three new tables: owner only.
--   3.7  subscriber_list_view: append payment_mode.
--
-- The business logic (dates, amounts, coverage) is computed in
-- TypeScript (src/lib/offline-subscriptions-logic.ts, unit-tested).
-- The RPCs only VALIDATE and APPLY that result atomically, and enforce
-- optimistic concurrency. No date math is duplicated in SQL.
--
-- Idempotent throughout (IF NOT EXISTS / guarded DO blocks / named
-- constraints / ON CONFLICT DO NOTHING / CREATE OR REPLACE).
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 3.1  Gateway row
-- ─────────────────────────────────────────────────────────────
-- Both flags are false, so usable_payment_gateways() (is_enabled AND
-- supports_mandates) can NEVER select this row for checkout. It exists
-- only to satisfy the payments.gateway foreign key.

INSERT INTO public.payment_gateways (id, display_name, priority, is_enabled, supports_mandates)
VALUES ('offline_qr', 'Offline — UPI QR / Cash', 1000, false, false)
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 3.2  subscriptions: payment mode + billing anchor
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS payment_mode       text NOT NULL DEFAULT 'autopay',
    ADD COLUMN IF NOT EXISTS offline_anchor_day smallint;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.subscriptions'::regclass
          AND conname  = 'subscriptions_payment_mode_check'
    ) THEN
        ALTER TABLE public.subscriptions
            ADD CONSTRAINT subscriptions_payment_mode_check
            CHECK (payment_mode IN ('autopay', 'offline_qr'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.subscriptions'::regclass
          AND conname  = 'subscriptions_offline_anchor_day_range_check'
    ) THEN
        ALTER TABLE public.subscriptions
            ADD CONSTRAINT subscriptions_offline_anchor_day_range_check
            CHECK (offline_anchor_day IS NULL OR offline_anchor_day BETWEEN 1 AND 31);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.subscriptions'::regclass
          AND conname  = 'subscriptions_offline_anchor_only_offline_check'
    ) THEN
        ALTER TABLE public.subscriptions
            ADD CONSTRAINT subscriptions_offline_anchor_only_offline_check
            CHECK (payment_mode = 'offline_qr' OR offline_anchor_day IS NULL);
    END IF;
END $$;

-- Register + cron hot path: "offline subs by status, soonest due first".
CREATE INDEX IF NOT EXISTS idx_subscriptions_offline_due
    ON public.subscriptions (status, next_billing_date)
    WHERE payment_mode = 'offline_qr';

COMMENT ON COLUMN public.subscriptions.payment_mode IS
    'autopay = Razorpay/gateway mandate (default). offline_qr = pays monthly by UPI QR / cash / bank transfer; recorded by the owner; no subscription_mandates row, ever.';
COMMENT ON COLUMN public.subscriptions.offline_anchor_day IS
    'Offline subs only: the day-of-month billing is anchored to, so a 31st-of-month payer does not drift (Jan 31 -> Feb 28 -> Mar 31).';

-- An offline subscription must never grow a mandate: a mandate means a
-- gateway would start debiting a payer who agreed to pay by QR.
CREATE OR REPLACE FUNCTION public.subscription_mandates_block_offline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.subscriptions s
        WHERE s.id = NEW.subscription_id AND s.payment_mode = 'offline_qr'
    ) THEN
        RAISE EXCEPTION 'conflict: offline_qr subscription cannot have a payment mandate';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscription_mandates_block_offline ON public.subscription_mandates;
CREATE TRIGGER trg_subscription_mandates_block_offline
    BEFORE INSERT ON public.subscription_mandates
    FOR EACH ROW EXECUTE FUNCTION public.subscription_mandates_block_offline();

COMMENT ON FUNCTION public.subscription_mandates_block_offline() IS
    'Blocks inserting a subscription_mandates row for a payment_mode=offline_qr subscription (migration 042).';


-- ─────────────────────────────────────────────────────────────
-- 3.3  offline_payment_details  (1:1 with payments, OWNER-ONLY)
-- ─────────────────────────────────────────────────────────────
-- A separate table on purpose: payments has the policy
-- "user reads own", so internal notes, UTRs and undo snapshots must
-- never sit on payments itself.

CREATE TABLE IF NOT EXISTS public.offline_payment_details (
    payment_id             uuid PRIMARY KEY REFERENCES public.payments(id) ON DELETE CASCADE,
    subscription_id        uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE RESTRICT,
    months_covered         int  NOT NULL CHECK (months_covered BETWEEN 1 AND 24),
    period_start           date NOT NULL,
    period_end             date NOT NULL,           -- = the new next_billing_date
    reference_no           text CHECK (reference_no IS NULL OR length(btrim(reference_no)) BETWEEN 1 AND 64),
    proof_url              text,
    notes                  text CHECK (notes IS NULL OR length(notes) <= 1000),
    recorded_by            uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    -- undo snapshot: what the subscription looked like BEFORE this payment
    prev_status            text NOT NULL,
    prev_next_billing_date date,
    prev_halted_at         timestamptz,
    prev_anchor_day        smallint,
    created_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT offline_payment_details_period_check CHECK (period_end > period_start)
);

-- The same UTR can never be recorded twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_offline_payment_reference
    ON public.offline_payment_details (lower(btrim(reference_no)))
    WHERE reference_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_offline_payment_details_sub
    ON public.offline_payment_details (subscription_id, created_at DESC);

COMMENT ON TABLE public.offline_payment_details IS
    'OWNER-ONLY detail row for every payments row with gateway=offline_qr: months covered, period, UTR, screenshot, internal note and the pre-payment subscription snapshot that Void restores.';


-- ─────────────────────────────────────────────────────────────
-- 3.4  finance_categories
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.finance_categories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    entry_type  text NOT NULL CHECK (entry_type IN ('expense', 'income')),
    pnl_group   text NOT NULL CHECK (pnl_group IN ('direct', 'operating', 'other_income')),
    sort_order  int  NOT NULL DEFAULT 100,
    is_archived boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT finance_categories_type_group_check
        CHECK ((entry_type = 'income') = (pnl_group = 'other_income'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_categories_name
    ON public.finance_categories (lower(btrim(name)));

-- Seed. Conflicts resolve through the unique name index, so a re-run
-- (or an owner who already added one of these) is a no-op.
INSERT INTO public.finance_categories (name, entry_type, pnl_group, sort_order) VALUES
    ('Pandit dakshina',               'expense', 'direct',       10),
    ('Pooja samagri',                 'expense', 'direct',       20),
    ('Gau seva (chara)',              'expense', 'direct',       30),
    ('Sadhu bhojan',                  'expense', 'direct',       40),
    ('Deepdaan & sarovar',            'expense', 'direct',       50),
    ('Prasad & packaging',            'expense', 'direct',       60),
    ('Courier / shipping',            'expense', 'direct',       70),
    ('Telecaller & staff salaries',   'expense', 'operating',    10),
    ('Agent commission payouts',      'expense', 'operating',    20),
    ('Meta / Google ads',             'expense', 'operating',    30),
    ('Other marketing',               'expense', 'operating',    40),
    ('Software & hosting',            'expense', 'operating',    50),
    ('WhatsApp / SMS charges',        'expense', 'operating',    60),
    ('Payment gateway fees',          'expense', 'operating',    70),
    ('Professional fees (CA / legal)','expense', 'operating',    80),
    ('Travel',                        'expense', 'operating',    90),
    ('Office & misc',                 'expense', 'operating',   100),
    ('Donations / dakshina received', 'income',  'other_income', 10),
    ('One-time pooja booking',        'income',  'other_income', 20),
    ('Other income',                  'income',  'other_income', 30)
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 3.5  finance_entries  (the ledger)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.finance_entries (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_date      date NOT NULL,
    category_id     uuid NOT NULL REFERENCES public.finance_categories(id) ON DELETE RESTRICT,
    amount_paise    bigint NOT NULL CHECK (amount_paise > 0 AND amount_paise <= 1000000000), -- <= Rs 1 crore per line
    description     text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
    counterparty    text CHECK (counterparty IS NULL OR length(counterparty) <= 200),
    payment_method  text NOT NULL DEFAULT 'upi'
                        CHECK (payment_method IN ('upi','cash','bank_transfer','card','cheque','other')),
    reference_no    text CHECK (reference_no IS NULL OR length(reference_no) <= 64),
    receipt_url     text,
    amortize_months int  NOT NULL DEFAULT 1 CHECK (amortize_months BETWEEN 1 AND 36),
    seva_id         uuid REFERENCES public.sevas(id) ON DELETE SET NULL,
    created_by      uuid NOT NULL REFERENCES auth.users(id),
    updated_by      uuid REFERENCES auth.users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,
    deleted_by      uuid REFERENCES auth.users(id),
    delete_reason   text,
    CONSTRAINT finance_entries_soft_delete_check CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_date
    ON public.finance_entries (entry_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_finance_entries_category
    ON public.finance_entries (category_id);

COMMENT ON TABLE public.finance_entries IS
    'OWNER-ONLY expense / other-income ledger. Soft-delete only (deleted_at + deleted_by + delete_reason). amortize_months > 1 spreads the amount over that many months on the normalised P&L basis.';


-- ─────────────────────────────────────────────────────────────
-- 3.6  RLS — owner only (defence in depth; the API uses the service role)
-- ─────────────────────────────────────────────────────────────
-- Admins and telecallers must get ZERO rows through PostgREST.

ALTER TABLE public.offline_payment_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_entries         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offline_payment_details: owner only" ON public.offline_payment_details;
CREATE POLICY "offline_payment_details: owner only"
    ON public.offline_payment_details FOR ALL
    USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "finance_categories: owner only" ON public.finance_categories;
CREATE POLICY "finance_categories: owner only"
    ON public.finance_categories FOR ALL
    USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "finance_entries: owner only" ON public.finance_entries;
CREATE POLICY "finance_entries: owner only"
    ON public.finance_entries FOR ALL
    USING (public.is_owner()) WITH CHECK (public.is_owner());


-- ─────────────────────────────────────────────────────────────
-- 3.7  subscriber_list_view — append payment_mode (ONLY)
-- ─────────────────────────────────────────────────────────────
-- Same-definition-as-latest discipline: this is the 025 definition
-- verbatim (025 is the most recent redefinition — grep confirmed) with
-- ONE column appended at the END. CREATE OR REPLACE VIEW cannot drop or
-- reorder columns. offline_anchor_day and anything carrying an amount
-- are deliberately NOT exposed (admins see no ₹).

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
    pr.full_name              AS profile_full_name,
    pr.phone                  AS profile_phone,
    pr.email                  AS profile_email,
    -- Separate calling number (only set when different from
    -- profile_phone, the WhatsApp number) — see 20260830_024.
    pr.alt_phone              AS profile_alt_phone,

    -- ── Payment mode (042) — APPENDED LAST, never reorder ────
    s.payment_mode            AS payment_mode

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


-- ─────────────────────────────────────────────────────────────
-- 3.8  SECURITY DEFINER RPCs
-- ─────────────────────────────────────────────────────────────
-- Supabase JS has no transactions, so every multi-row write is one
-- function call. STANDING REVIEW ITEM: every function below carries an
-- explicit REVOKE EXECUTE ... FROM public, anon, authenticated — three
-- DEFINER functions once shipped without it and were callable by any
-- logged-in user via /rest/v1/rpc.
--
-- Each takes an explicit p_actor and writes audit_logs.admin_id =
-- p_actor. NEVER auth.uid(): the caller is the service role, so it
-- would be NULL (the hospitals-session bug). As defence in depth every
-- owner-driven function also re-checks that p_actor really is an owner.

-- 1 ── create_offline_subscription ────────────────────────────
CREATE OR REPLACE FUNCTION public.create_offline_subscription(
    p_user_id        uuid,
    p_plan_id        uuid,
    p_actor          uuid,
    p_family         jsonb,
    p_amount_paise   int,
    p_paid_at        timestamptz,
    p_method         text,
    p_months         int,
    p_period_start   date,
    p_period_end     date,
    p_anchor_day     smallint,
    p_reference_no   text,
    p_proof_url      text,
    p_notes          text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub_id     uuid;
    v_pay_id     uuid;
    v_member     jsonb;
    v_primaries  int := 0;
    v_count      int;
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_actor AND role = 'owner'
    ) THEN
        RAISE EXCEPTION 'forbidden: owner only';
    END IF;

    IF p_method NOT IN ('upi_qr', 'cash', 'bank_transfer') THEN
        RAISE EXCEPTION 'invalid: method';
    END IF;
    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'invalid: amount';
    END IF;
    IF p_months IS NULL OR p_months NOT BETWEEN 1 AND 24 THEN
        RAISE EXCEPTION 'invalid: months';
    END IF;
    IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end <= p_period_start THEN
        RAISE EXCEPTION 'invalid: period';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id AND is_active) THEN
        RAISE EXCEPTION 'invalid: plan not active';
    END IF;

    IF p_family IS NULL OR jsonb_typeof(p_family) <> 'array' THEN
        RAISE EXCEPTION 'invalid: family';
    END IF;
    v_count := jsonb_array_length(p_family);
    IF v_count NOT BETWEEN 1 AND 4 THEN
        RAISE EXCEPTION 'invalid: family size';
    END IF;
    FOR v_member IN SELECT * FROM jsonb_array_elements(p_family) LOOP
        IF COALESCE((v_member ->> 'is_primary')::boolean, false) THEN
            v_primaries := v_primaries + 1;
        END IF;
    END LOOP;
    IF v_primaries <> 1 THEN
        RAISE EXCEPTION 'invalid: exactly one primary member';
    END IF;

    -- Serialise concurrent creates for the same person so the
    -- "already subscribed" check below cannot be raced.
    PERFORM pg_advisory_xact_lock(hashtext('offline_sub:' || p_user_id::text));

    IF EXISTS (
        SELECT 1 FROM public.subscriptions
        WHERE user_id = p_user_id AND status IN ('active', 'halted', 'paused')
    ) THEN
        RAISE EXCEPTION 'conflict: already subscribed';
    END IF;

    -- attribution_source='manual' + attributed_at pre-stamp the write-once
    -- attribution so commissions/reconcile.ts's call-window fallback
    -- (which fires on attribution_source IS NULL) can never credit a
    -- telecaller for QR money. sales_agent_id / coupon_id / telecaller_id
    -- stay NULL, so no commission_entries are ever generated.
    INSERT INTO public.subscriptions (
        user_id, plan_id, status, start_date, next_billing_date,
        acquisition_channel, payment_mode, offline_anchor_day,
        attribution_source, attributed_at
    ) VALUES (
        p_user_id, p_plan_id, 'active', p_period_start, p_period_end,
        'offline_qr', 'offline_qr', p_anchor_day,
        'manual', now()
    ) RETURNING id INTO v_sub_id;

    FOR v_member IN SELECT * FROM jsonb_array_elements(p_family) LOOP
        INSERT INTO public.family_members (
            subscription_id, full_name, gotra, relation, slot_number, is_primary, dob
        ) VALUES (
            v_sub_id,
            v_member ->> 'full_name',
            NULLIF(v_member ->> 'gotra', ''),
            NULLIF(v_member ->> 'relation', ''),
            (v_member ->> 'slot_number')::int,
            COALESCE((v_member ->> 'is_primary')::boolean, false),
            NULLIF(v_member ->> 'dob', '')::date
        );
    END LOOP;

    INSERT INTO public.payments (
        subscription_id, gateway, status, amount_paise, method,
        cycle_number, paid_at, attempted_at
    ) VALUES (
        v_sub_id, 'offline_qr', 'captured', p_amount_paise, p_method,
        1, p_paid_at, p_paid_at
    ) RETURNING id INTO v_pay_id;

    INSERT INTO public.offline_payment_details (
        payment_id, subscription_id, months_covered, period_start, period_end,
        reference_no, proof_url, notes, recorded_by,
        prev_status, prev_next_billing_date, prev_halted_at, prev_anchor_day
    ) VALUES (
        v_pay_id, v_sub_id, p_months, p_period_start, p_period_end,
        NULLIF(btrim(p_reference_no), ''), p_proof_url, p_notes, p_actor,
        'pending', NULL, NULL, NULL
    );

    INSERT INTO public.audit_logs (admin_id, action, entity, entity_id, meta) VALUES
        (p_actor, 'offline.subscription.created', 'subscriptions', v_sub_id,
         jsonb_build_object('user_id', p_user_id, 'plan_id', p_plan_id,
                            'period_start', p_period_start, 'period_end', p_period_end)),
        (p_actor, 'offline.payment.recorded', 'payments', v_pay_id,
         jsonb_build_object('subscription_id', v_sub_id, 'amount_paise', p_amount_paise,
                            'method', p_method, 'months', p_months,
                            'reference_no', NULLIF(btrim(p_reference_no), ''),
                            'first_payment', true));

    RETURN jsonb_build_object(
        'subscription_id', v_sub_id,
        'payment_id', v_pay_id,
        'next_billing_date', p_period_end
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_offline_subscription(
    uuid, uuid, uuid, jsonb, int, timestamptz, text, int, date, date, smallint, text, text, text
) FROM public, anon, authenticated;

COMMENT ON FUNCTION public.create_offline_subscription(
    uuid, uuid, uuid, jsonb, int, timestamptz, text, int, date, date, smallint, text, text, text
) IS
    'Atomically creates an active offline_qr subscription + family members + first captured payment + offline_payment_details + audit. Owner-only (p_actor re-checked). EXECUTE revoked from public/anon/authenticated — service role only via POST /api/admin/offline/create.';

-- 2 ── record_offline_payment ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_offline_payment(
    p_subscription_id            uuid,
    p_actor                      uuid,
    p_expected_status            text,
    p_expected_next_billing_date date,
    p_amount_paise               int,
    p_paid_at                    timestamptz,
    p_method                     text,
    p_months                     int,
    p_period_start               date,
    p_period_end                 date,
    p_anchor_day                 smallint,
    p_reference_no               text,
    p_proof_url                  text,
    p_notes                      text,
    p_reactivate                 boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub     public.subscriptions%ROWTYPE;
    v_pay_id  uuid;
    v_cycle   int;
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_actor AND role = 'owner'
    ) THEN
        RAISE EXCEPTION 'forbidden: owner only';
    END IF;

    IF p_method NOT IN ('upi_qr', 'cash', 'bank_transfer') THEN
        RAISE EXCEPTION 'invalid: method';
    END IF;
    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'invalid: amount';
    END IF;
    IF p_months IS NULL OR p_months NOT BETWEEN 1 AND 24 THEN
        RAISE EXCEPTION 'invalid: months';
    END IF;
    IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end <= p_period_start THEN
        RAISE EXCEPTION 'invalid: period';
    END IF;

    SELECT * INTO v_sub FROM public.subscriptions
     WHERE id = p_subscription_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid: subscription not found';
    END IF;
    IF v_sub.payment_mode <> 'offline_qr' THEN
        RAISE EXCEPTION 'invalid: not an offline subscription';
    END IF;
    IF v_sub.status NOT IN ('active', 'halted') THEN
        RAISE EXCEPTION 'invalid: subscription is %', v_sub.status;
    END IF;

    -- Optimistic concurrency: two tabs that both read the same state must
    -- not both advance the due date.
    IF v_sub.status <> p_expected_status
       OR v_sub.next_billing_date IS DISTINCT FROM p_expected_next_billing_date THEN
        RAISE EXCEPTION 'stale';
    END IF;

    -- The TS-computed coverage must agree with the locked row.
    IF p_reactivate <> (v_sub.status = 'halted') THEN
        RAISE EXCEPTION 'invalid: reactivate flag does not match status';
    END IF;
    IF v_sub.status = 'active' AND p_period_start IS DISTINCT FROM v_sub.next_billing_date THEN
        RAISE EXCEPTION 'stale';
    END IF;

    SELECT COUNT(*) + 1 INTO v_cycle FROM public.payments
     WHERE subscription_id = p_subscription_id AND status = 'captured';

    INSERT INTO public.payments (
        subscription_id, gateway, status, amount_paise, method,
        cycle_number, paid_at, attempted_at
    ) VALUES (
        p_subscription_id, 'offline_qr', 'captured', p_amount_paise, p_method,
        v_cycle, p_paid_at, p_paid_at
    ) RETURNING id INTO v_pay_id;

    INSERT INTO public.offline_payment_details (
        payment_id, subscription_id, months_covered, period_start, period_end,
        reference_no, proof_url, notes, recorded_by,
        prev_status, prev_next_billing_date, prev_halted_at, prev_anchor_day
    ) VALUES (
        v_pay_id, p_subscription_id, p_months, p_period_start, p_period_end,
        NULLIF(btrim(p_reference_no), ''), p_proof_url, p_notes, p_actor,
        v_sub.status, v_sub.next_billing_date, v_sub.halted_at, v_sub.offline_anchor_day
    );

    UPDATE public.subscriptions
       SET next_billing_date  = p_period_end,
           offline_anchor_day = p_anchor_day,
           status             = CASE WHEN p_reactivate THEN 'active' ELSE status END,
           halted_at          = CASE WHEN p_reactivate THEN NULL ELSE halted_at END,
           updated_at         = now()
     WHERE id = p_subscription_id;

    INSERT INTO public.audit_logs (admin_id, action, entity, entity_id, meta)
    VALUES (p_actor, 'offline.payment.recorded', 'payments', v_pay_id,
            jsonb_build_object('subscription_id', p_subscription_id, 'amount_paise', p_amount_paise,
                               'method', p_method, 'months', p_months,
                               'period_start', p_period_start, 'period_end', p_period_end,
                               'reference_no', NULLIF(btrim(p_reference_no), ''),
                               'previous_status', v_sub.status,
                               'previous_next_billing_date', v_sub.next_billing_date));

    IF p_reactivate THEN
        INSERT INTO public.audit_logs (admin_id, action, entity, entity_id, meta)
        VALUES (p_actor, 'offline.subscription.reactivated', 'subscriptions', p_subscription_id,
                jsonb_build_object('payment_id', v_pay_id, 'previous_halted_at', v_sub.halted_at));
    END IF;

    RETURN jsonb_build_object(
        'payment_id', v_pay_id,
        'status', CASE WHEN p_reactivate THEN 'active' ELSE v_sub.status END,
        'next_billing_date', p_period_end,
        'reactivated', p_reactivate
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_offline_payment(
    uuid, uuid, text, date, int, timestamptz, text, int, date, date, smallint, text, text, text, boolean
) FROM public, anon, authenticated;

COMMENT ON FUNCTION public.record_offline_payment(
    uuid, uuid, text, date, int, timestamptz, text, int, date, date, smallint, text, text, text, boolean
) IS
    'Records one QR/cash/bank payment against an offline subscription: row-locked, optimistic-concurrency checked (RAISE stale), snapshots pre-state for Void, advances next_billing_date, reactivates a halted sub. Owner-only. EXECUTE revoked from public/anon/authenticated — service role only.';

-- 3 ── void_offline_payment ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_offline_payment(
    p_payment_id uuid,
    p_actor      uuid,
    p_reason     text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pay      public.payments%ROWTYPE;
    v_det      public.offline_payment_details%ROWTYPE;
    v_sub      public.subscriptions%ROWTYPE;
    v_latest   uuid;
    v_status   text;
    v_halted   timestamptz;
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_actor AND role = 'owner'
    ) THEN
        RAISE EXCEPTION 'forbidden: owner only';
    END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
        RAISE EXCEPTION 'invalid: reason required';
    END IF;

    SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid: payment not found';
    END IF;
    IF v_pay.gateway <> 'offline_qr' THEN
        RAISE EXCEPTION 'invalid: not an offline payment';
    END IF;

    SELECT * INTO v_det FROM public.offline_payment_details WHERE payment_id = p_payment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid: payment has no offline details';
    END IF;

    SELECT * INTO v_sub FROM public.subscriptions
     WHERE id = v_pay.subscription_id FOR UPDATE;

    IF v_sub.status NOT IN ('active', 'halted') THEN
        RAISE EXCEPTION 'conflict: subscription is %', v_sub.status;
    END IF;

    -- Only the LATEST offline payment may be voided, and only while the
    -- subscription is still exactly where that payment left it.
    SELECT payment_id INTO v_latest FROM public.offline_payment_details
     WHERE subscription_id = v_pay.subscription_id
     ORDER BY created_at DESC, payment_id DESC LIMIT 1;
    IF v_latest IS DISTINCT FROM p_payment_id THEN
        RAISE EXCEPTION 'conflict: only the latest payment can be voided';
    END IF;
    IF v_sub.next_billing_date IS DISTINCT FROM v_det.period_end THEN
        RAISE EXCEPTION 'conflict: subscription has moved on since this payment';
    END IF;

    IF EXISTS (SELECT 1 FROM public.commission_entries WHERE payment_id = p_payment_id) THEN
        RAISE EXCEPTION 'conflict: commission already references this payment';
    END IF;

    IF v_det.prev_status = 'pending' THEN
        -- The very first payment: the subscription never really started.
        UPDATE public.subscriptions
           SET status             = 'cancelled',
               cancelled_at       = now(),
               cancel_reason      = 'offline_first_payment_voided',
               next_billing_date  = NULL,
               halted_at          = NULL,
               offline_anchor_day = v_det.prev_anchor_day,
               updated_at         = now()
         WHERE id = v_sub.id;
        v_status := 'cancelled';
    ELSE
        v_status := v_det.prev_status;
        v_halted := CASE
            WHEN v_status = 'halted' THEN COALESCE(v_det.prev_halted_at, now())
            ELSE NULL
        END;
        UPDATE public.subscriptions
           SET status             = v_status,
               next_billing_date  = v_det.prev_next_billing_date,
               halted_at          = v_halted,
               offline_anchor_day = v_det.prev_anchor_day,
               updated_at         = now()
         WHERE id = v_sub.id;
    END IF;

    -- Audit FIRST with the full row snapshots so the deletion can be
    -- reconstructed, then remove the payment (details cascade).
    INSERT INTO public.audit_logs (admin_id, action, entity, entity_id, meta)
    VALUES (p_actor, 'offline.payment.voided', 'payments', p_payment_id,
            jsonb_build_object('reason', btrim(p_reason),
                               'payment', to_jsonb(v_pay),
                               'details', to_jsonb(v_det),
                               'subscription_before', to_jsonb(v_sub)));

    DELETE FROM public.payments WHERE id = p_payment_id;

    RETURN jsonb_build_object(
        'subscription_id', v_sub.id,
        'status', v_status,
        'next_billing_date', CASE WHEN v_status = 'cancelled' THEN NULL ELSE v_det.prev_next_billing_date END
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.void_offline_payment(uuid, uuid, text)
    FROM public, anon, authenticated;

COMMENT ON FUNCTION public.void_offline_payment(uuid, uuid, text) IS
    'Undoes the LATEST offline payment of a subscription (mistaken entry): restores the pre-payment snapshot (first payment => cancelled), blocked when a commission references it. Audits the full row snapshot. Owner-only. EXECUTE revoked from public/anon/authenticated — service role only.';

-- 4 ── cancel_offline_subscription ────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_offline_subscription(
    p_subscription_id uuid,
    p_actor           uuid,
    p_reason          text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub public.subscriptions%ROWTYPE;
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_actor AND role = 'owner'
    ) THEN
        RAISE EXCEPTION 'forbidden: owner only';
    END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
        RAISE EXCEPTION 'invalid: reason required';
    END IF;

    SELECT * INTO v_sub FROM public.subscriptions
     WHERE id = p_subscription_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid: subscription not found';
    END IF;
    IF v_sub.payment_mode <> 'offline_qr' THEN
        RAISE EXCEPTION 'invalid: not an offline subscription';
    END IF;
    IF v_sub.status NOT IN ('active', 'halted') THEN
        RAISE EXCEPTION 'conflict: subscription is %', v_sub.status;
    END IF;

    UPDATE public.subscriptions
       SET status        = 'cancelled',
           cancelled_at  = now(),
           cancel_reason = btrim(p_reason),
           updated_at    = now()
     WHERE id = p_subscription_id;

    INSERT INTO public.audit_logs (admin_id, action, entity, entity_id, meta)
    VALUES (p_actor, 'offline.subscription.cancelled', 'subscriptions', p_subscription_id,
            jsonb_build_object('reason', btrim(p_reason), 'previous_status', v_sub.status,
                               'next_billing_date', v_sub.next_billing_date));

    RETURN jsonb_build_object('subscription_id', p_subscription_id, 'status', 'cancelled');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_offline_subscription(uuid, uuid, text)
    FROM public, anon, authenticated;

COMMENT ON FUNCTION public.cancel_offline_subscription(uuid, uuid, text) IS
    'Stops an offline subscription (active|halted -> cancelled) with a reason + audit. Owner-only. EXECUTE revoked from public/anon/authenticated — service role only.';

-- 5 ── lapse_overdue_offline_subscriptions (nightly cron) ─────
CREATE OR REPLACE FUNCTION public.lapse_overdue_offline_subscriptions(
    p_cutoff date,
    p_actor  uuid DEFAULT NULL
) RETURNS TABLE (subscription_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_cutoff IS NULL THEN
        RAISE EXCEPTION 'invalid: cutoff required';
    END IF;

    -- Idempotent: a second run matches zero rows (status is already halted).
    -- One audit row per lapsed subscription; admin_id NULL = the system.
    RETURN QUERY
    WITH lapsed AS (
        UPDATE public.subscriptions s
           SET status     = 'halted',
               halted_at  = now(),
               updated_at = now()
         WHERE s.payment_mode = 'offline_qr'
           AND s.status = 'active'
           AND s.next_billing_date < p_cutoff
        RETURNING s.id AS sid, s.next_billing_date AS due
    ), audited AS (
        INSERT INTO public.audit_logs (admin_id, action, entity, entity_id, meta)
        SELECT p_actor, 'offline.subscription.lapsed', 'subscriptions', l.sid,
               jsonb_build_object('next_billing_date', l.due, 'cutoff', p_cutoff)
          FROM lapsed l
        RETURNING entity_id
    )
    SELECT l.sid FROM lapsed l;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lapse_overdue_offline_subscriptions(date, uuid)
    FROM public, anon, authenticated;

COMMENT ON FUNCTION public.lapse_overdue_offline_subscriptions(date, uuid) IS
    'Nightly sweep: offline_qr + active + next_billing_date < cutoff -> halted. Idempotent; one audit row per lapse (admin_id NULL = system). EXECUTE revoked from public/anon/authenticated — service role only via /api/cron/offline-dues.';


-- 6 ── update_offline_payment_details ─────────────────────────
-- Lets the owner correct HOW a payment was made (method) and its UTR /
-- screenshot / note after the fact — e.g. an imported payment whose method
-- was unknown. Deliberately cannot touch amount, date or coverage: those
-- change due dates, so they go through Void + re-record.
CREATE OR REPLACE FUNCTION public.update_offline_payment_details(
    p_payment_id   uuid,
    p_actor        uuid,
    p_method       text,
    p_reference_no text,
    p_proof_url    text,
    p_notes        text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pay public.payments%ROWTYPE;
    v_det public.offline_payment_details%ROWTYPE;
    v_ref text := NULLIF(btrim(p_reference_no), '');
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_actor AND role = 'owner'
    ) THEN
        RAISE EXCEPTION 'forbidden: owner only';
    END IF;
    IF p_method NOT IN ('upi_qr', 'cash', 'bank_transfer') THEN
        RAISE EXCEPTION 'invalid: method';
    END IF;

    SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND OR v_pay.gateway <> 'offline_qr' THEN
        RAISE EXCEPTION 'invalid: not an offline payment';
    END IF;
    SELECT * INTO v_det FROM public.offline_payment_details
     WHERE payment_id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid: payment has no offline details';
    END IF;

    UPDATE public.payments SET method = p_method WHERE id = p_payment_id;
    UPDATE public.offline_payment_details
       SET reference_no = v_ref, proof_url = p_proof_url, notes = p_notes
     WHERE payment_id = p_payment_id;

    INSERT INTO public.audit_logs (admin_id, action, entity, entity_id, meta)
    VALUES (p_actor, 'offline.payment.details_updated', 'payments', p_payment_id,
            jsonb_build_object(
                'subscription_id', v_pay.subscription_id,
                'before', jsonb_build_object('method', v_pay.method, 'reference_no', v_det.reference_no,
                                             'proof_url', v_det.proof_url, 'notes', v_det.notes),
                'after',  jsonb_build_object('method', p_method, 'reference_no', v_ref,
                                             'proof_url', p_proof_url, 'notes', p_notes)));

    RETURN jsonb_build_object('payment_id', p_payment_id, 'method', p_method);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_offline_payment_details(uuid, uuid, text, text, text, text)
    FROM public, anon, authenticated;

COMMENT ON FUNCTION public.update_offline_payment_details(uuid, uuid, text, text, text, text) IS
    'Owner-only: corrects method / UTR / screenshot / note of an offline payment (never amount or dates). Audited with before/after. EXECUTE revoked from public/anon/authenticated — service role only via POST /api/admin/offline/update-payment.';


-- ── Verification ─────────────────────────────────────────────────
-- 1. Gateway row exists and cannot be chosen at checkout:
--    SELECT id, is_enabled, supports_mandates FROM public.payment_gateways WHERE id = 'offline_qr';
--    SELECT id FROM public.usable_payment_gateways();           -- must NOT list offline_qr
-- 2. New columns + view column order (payment_mode must be LAST):
--    SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'subscriber_list_view' ORDER BY ordinal_position DESC LIMIT 3;
-- 3. Tables + RLS on:
--    SELECT relname, relrowsecurity FROM pg_class
--     WHERE relname IN ('offline_payment_details','finance_categories','finance_entries');
-- 4. Seed count (20):
--    SELECT pnl_group, count(*) FROM public.finance_categories GROUP BY 1;
-- 5. REVOKE proof — every function below must show NO anon/authenticated grantee:
--    SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_x,
--           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_x
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.proname IN (
--       'create_offline_subscription','record_offline_payment','void_offline_payment',
--       'cancel_offline_subscription','lapse_overdue_offline_subscriptions');
-- 6. Mandate guard (expect an exception): insert a subscription_mandates row for an offline sub.
-- 7. View security mode, for the record (022/023/025 each re-ran CREATE OR REPLACE VIEW after
--    018 set security_invoker=true; this migration changes nothing here):
--    SELECT relname, reloptions FROM pg_class WHERE relname = 'subscriber_list_view';
