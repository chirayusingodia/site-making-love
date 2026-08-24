-- ═════════════════════════════════════════════════════════════
-- 20260824_019_pass2_fixes.sql
-- Repairs from the Pass-2 bug scan (PUNYATA_BUG_SCAN_PASS2.md).
-- Everything here is idempotent and safe to run on any database
-- that already has migrations 001–017 applied, regardless of
-- whether 018 landed cleanly or was applied via manual workaround.
-- ═════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1. [S5 MEDIUM] opening trail-rate rows for out-of-range legacy agents
-- ─────────────────────────────────────────────────────────────
-- Migration 013 §8's backfill only copied commission_percent values
-- already inside [0,25]; agents above the cap got NO opening row and
-- resolveTrailPercent then silently pays them the flat 1% default.
-- Insert their opening row with the value CLAMPED into the legal
-- range so every legacy agent has exactly one opening row. Idempotent
-- via the same NOT EXISTS guard as 013.

INSERT INTO public.staff_commission_rates
       (agent_id, kind, percent, effective_from, reason)
SELECT sa.id,
       'trail',
       LEAST(GREATEST(sa.commission_percent, 0), 25),
       CURRENT_DATE,
       'opening'
  FROM public.sales_agents sa
 WHERE sa.commission_percent NOT BETWEEN 0 AND 25
   AND NOT EXISTS (
         SELECT 1 FROM public.staff_commission_rates scr
          WHERE scr.agent_id = sa.id AND scr.reason = 'opening'
       );

-- ─────────────────────────────────────────────────────────────
-- 1b. [P1 HIGH] first_deal is once-EVER per subscription — at the DB
-- ─────────────────────────────────────────────────────────────
-- The reconciler's claim was in-memory only, so two overlapping runs
-- (cron ∥ manual) both saw "no first_deal yet" and both paid the 20%
-- bonus — via DIFFERENT payments of one subscription, which the
-- payment-keyed unique tuple never catches. This partial unique index
-- makes the stated ledger invariant ("a subscription earns first_deal
-- EXACTLY once, ever") physically unbreakable; racing inserters now
-- get 23505 instead of double pay.
--
-- ⚠ PRE-DEPLOY (Pass-2 fix-verification landmine): if production
-- already contains duplicate first_deal rows from the pre-fix bug,
-- this CREATE UNIQUE INDEX fails outright and the migration aborts.
-- Check FIRST and dedupe manually (keep the earliest; void/reverse
-- the rest per the commission process):
--   SELECT subscription_id, count(*) FROM commission_entries
--    WHERE kind='first_deal' GROUP BY 1 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS commission_entries_first_deal_once
    ON public.commission_entries (subscription_id)
    WHERE kind = 'first_deal';


-- ─────────────────────────────────────────────────────────────
-- 2. [S7 LOW] coupon discount bounds at the DB
-- ─────────────────────────────────────────────────────────────
-- 018 constrained only the percent RANGE (BETWEEN 0 AND 100). Two
-- gaps closed here:
--   a) flat discount_value of -50000 is still storable → non-negative;
--   b) [Pass-2 residual S7] a 0%-percent coupon is still legal under
--      BETWEEN — percent-type values must be strictly positive.

ALTER TABLE public.coupons
    DROP CONSTRAINT IF EXISTS coupons_flat_nonneg_check;
ALTER TABLE public.coupons
    ADD CONSTRAINT coupons_flat_nonneg_check
    CHECK (discount_type <> 'flat' OR discount_value >= 0) NOT VALID;

ALTER TABLE public.coupons
    DROP CONSTRAINT IF EXISTS coupons_percent_positive_check;
ALTER TABLE public.coupons
    ADD CONSTRAINT coupons_percent_positive_check
    CHECK (discount_type <> 'percent' OR discount_value > 0) NOT VALID;


-- ─────────────────────────────────────────────────────────────
-- 3. [S9 LOW] escalation trigger also covers outcome edits
-- ─────────────────────────────────────────────────────────────
-- No app path UPDATEs call_logs.outcome today, but if one ever
-- appears (correction tooling), a complaint flipped in via UPDATE
-- must still surface on the Needs-Chirayu index.

DROP TRIGGER IF EXISTS trg_call_logs_escalate ON public.call_logs;
CREATE TRIGGER trg_call_logs_escalate
    BEFORE INSERT OR UPDATE OF outcome, escalated
    ON public.call_logs
    FOR EACH ROW EXECUTE FUNCTION public.call_logs_escalate_complaints();


-- ─────────────────────────────────────────────────────────────
-- 4. [S10 LOW] drop redundant indexes
-- ─────────────────────────────────────────────────────────────
-- idx_coupons_code duplicates coupons.code UNIQUE's implicit index.
-- idx_sbs_batch_id duplicates the leading column of the
-- (batch_id, subscription_id) UNIQUE index. Two more repeats of the
-- same pattern are dropped alongside them.

DROP INDEX IF EXISTS public.idx_coupons_code;
DROP INDEX IF EXISTS public.idx_sbs_batch_id;
DROP INDEX IF EXISTS public.idx_sbs_batch_segment;
DROP INDEX IF EXISTS public.idx_sankalp_batches_date_type;


-- ─────────────────────────────────────────────────────────────
-- 4b. [P9 LOW→MEDIUM] refund double-click claim latch
-- ─────────────────────────────────────────────────────────────
-- The refund endpoint validates then calls Razorpay with no
-- idempotency — two rapid clicks both passed validation and BOTH
-- refunds executed. This column is an optimistic claim: the endpoint
-- atomically claims a captured payment (only when unclaimed or
-- stale >10 min), releases it when Razorpay rejects, and the
-- webhook's refund.processed handler clears it on confirmation.
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS refund_claimed_at timestamptz;


-- ─────────────────────────────────────────────────────────────
-- 5. Convergence repairs for hand-applied 014/018 states
-- ─────────────────────────────────────────────────────────────
-- If migration 014 previously failed mid-apply and its objects were
-- created by hand, the corrected REVOKE/COMMENT inside the edited
-- file never runs there. Re-assert them (guarded), re-grant
-- is_owner() to authenticated (S3), and replace any broken copy of
-- generate_sankalp_batch with the fixed DO-NOTHING body (S2).

DO $conv$
BEGIN
    -- 5a. reallot_hospital: full-signature privilege + comment
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'reallot_hospital'
    ) THEN
        REVOKE EXECUTE ON FUNCTION public.reallot_hospital(uuid, uuid, text, uuid)
            FROM public, anon, authenticated;
        COMMENT ON FUNCTION public.reallot_hospital(uuid, uuid, text, uuid) IS
            'Atomically closes the current allotment and opens a new one (§4.4). EXECUTE revoked (C1): owner/admin only via /api/admin/hospitals/reallot. Writes its own audit_logs row.';
    END IF;

    -- 5b. is_owner: policies evaluate with invoker privileges —
    -- authenticated MUST hold EXECUTE or owner/admin browser reads of
    -- the five financial tables throw permission-denied (S3).
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'is_owner'
    ) THEN
        GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;
    END IF;

    -- 5c. otp_check_and_log: re-assert the corrected body so a
    -- database that already ran the pre-fix 018 converges too (S4) —
    -- counters must only count rows where a send actually happened.
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'otp_check_and_log'
    ) THEN
        CREATE OR REPLACE FUNCTION public.otp_check_and_log(p_phone text, p_ip text)
        RETURNS text
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $fn$
        DECLARE
            v_burst   int;
            v_daily   int;
            v_distinct int;
            v_blocked text := NULL;
        BEGIN
            PERFORM pg_advisory_xact_lock(hashtextextended('otp:' || p_phone, 0));

            SELECT COUNT(*) INTO v_burst
              FROM public.otp_send_log
             WHERE phone = p_phone
               AND allowed
               AND created_at >= now() - interval '10 minutes';

            IF v_burst >= 3 THEN
                v_blocked := 'phone_burst_10m';
            ELSE
                SELECT COUNT(*) INTO v_daily
                  FROM public.otp_send_log
                 WHERE phone = p_phone
                   AND allowed
                   AND created_at >= now() - interval '24 hours';
                IF v_daily >= 8 THEN
                    v_blocked := 'phone_daily';
                END IF;
            END IF;

            IF v_blocked IS NULL AND p_ip IS NOT NULL THEN
                PERFORM pg_advisory_xact_lock(hashtextextended('otpip:' || p_ip, 0));
                SELECT COUNT(DISTINCT phone) INTO v_distinct
                  FROM public.otp_send_log
                 WHERE ip = p_ip
                   AND allowed
                   AND created_at >= now() - interval '1 hour';
                IF v_distinct >= 5 THEN
                    v_blocked := 'ip_distinct_phones';
                END IF;
            END IF;

            INSERT INTO public.otp_send_log (phone, ip, allowed, reason)
            VALUES (p_phone, p_ip, v_blocked IS NULL, v_blocked);

            RETURN COALESCE(v_blocked, 'allowed');
        END;
        $fn$;
    END IF;
END
$conv$;

-- 5c. generate_sankalp_batch: fixed create-or-refresh body. Mirrors
-- the corrected definition in 018 verbatim (safe whether or not the
-- 018 copy already exists).
CREATE OR REPLACE FUNCTION public.generate_sankalp_batch(
    p_date       date,
    p_kind       text,
    p_membership jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_batch_id     uuid;
    v_status       text;
    v_inserted     boolean;
    v_member_count int;
    v_row          record;
BEGIN
    IF p_kind NOT IN ('second_tuesday', 'last_saturday') THEN
        RAISE EXCEPTION 'invalid batch kind %', p_kind;
    END IF;

    -- Upsert-lock: exactly one racer INSERTS, concurrent racers take
    -- the ON CONFLICT path and BLOCK here until the winner commits.
    INSERT INTO public.sankalp_batches AS b (batch_type, batch_date, status)
    VALUES (p_kind, p_date, 'pending')
    ON CONFLICT (batch_date, batch_type)
        DO NOTHING
    RETURNING b.id, b.status, (xmax = 0) AS inserted
    INTO v_batch_id, v_status, v_inserted;

    -- Never rewrite the PK (the old DO UPDATE SET id = EXCLUDED.id
    -- violated child FKs on every refresh). With DO NOTHING the
    -- loser's RETURNING is empty; it already blocked on the winner's
    -- insert above, so the committed row is now visible.
    IF v_batch_id IS NULL THEN
        SELECT sb.id, sb.status, false
          INTO v_batch_id, v_status, v_inserted
          FROM public.sankalp_batches sb
         WHERE sb.batch_type = p_kind
           AND sb.batch_date = p_date;
        IF v_batch_id IS NULL THEN
            RAISE EXCEPTION 'sankalp batch % % vanished during upsert', p_kind, p_date;
        END IF;
    END IF;

    IF v_status = 'done' THEN
        RETURN jsonb_build_object(
            'batch_id', v_batch_id,
            'action', 'skipped_done'
        );
    END IF;

    DELETE FROM public.sankalp_batch_subscriptions
    WHERE batch_id = v_batch_id;

    v_member_count := 0;
    FOR v_row IN
        SELECT (m->>'subscription_id')::uuid AS subscription_id,
               COALESCE(m->>'is_catchup', 'false')::boolean AS is_catchup
        FROM jsonb_array_elements(p_membership) AS m
    LOOP
        INSERT INTO public.sankalp_batch_subscriptions
            (batch_id, subscription_id, is_catchup)
        VALUES (v_batch_id, v_row.subscription_id, v_row.is_catchup)
        ON CONFLICT (batch_id, subscription_id) DO NOTHING;
        v_member_count := v_member_count + 1;
    END LOOP;

    UPDATE public.sankalp_batches
       SET subscriber_count = v_member_count
     WHERE id = v_batch_id;

    RETURN jsonb_build_object(
        'batch_id', v_batch_id,
        'action', CASE WHEN v_inserted THEN 'created' ELSE 'refreshed' END,
        'subscriber_count', v_member_count
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_sankalp_batch(date, text, jsonb)
    FROM public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6. [P10 residual LOW] atomic call-log daily limit
-- ─────────────────────────────────────────────────────────────
-- The route's count-then-insert let two concurrent log-call requests
-- from the same caller both read "under limit" and both insert,
-- blowing past LOG_CALL_DAILY_LIMIT. Same fix shape as
-- otp_check_and_log (018 §16): one SECURITY DEFINER RPC takes a
-- per-caller advisory xact lock, counts the IST calendar day and —
-- only if a slot remains — inserts the call row in the SAME
-- transaction. Concurrent racers serialize on the lock, so the count
-- always sees every committed sibling insert.

CREATE OR REPLACE FUNCTION public.log_call_limited(
    p_called_by         uuid,
    p_subscription_id   uuid,
    p_lead_id           uuid,
    p_profile_id        uuid,
    p_queue             text,
    p_outcome           text,
    p_notes             text,
    p_callback_at       timestamptz,
    p_identity_verified boolean,
    p_escalated         boolean,
    p_daily_limit       int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_today_count int;
    v_new_id      uuid;
BEGIN
    IF p_daily_limit IS NULL OR p_daily_limit < 1 THEN
        RAISE EXCEPTION 'invalid daily limit %', p_daily_limit;
    END IF;

    -- Serialize per-caller: the second racer BLOCKS here until the
    -- first one's transaction (count + insert) commits.
    PERFORM pg_advisory_xact_lock(hashtextextended('callquota:' || p_called_by::text, 0));

    SELECT COUNT(*) INTO v_today_count
      FROM public.call_logs
     WHERE called_by = p_called_by
       AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata'))
                         AT TIME ZONE 'Asia/Kolkata';

    IF v_today_count >= p_daily_limit THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'over_limit');
    END IF;

    INSERT INTO public.call_logs
        (subscription_id, lead_id, profile_id, called_by, queue,
         outcome, notes, callback_at, identity_verified, escalated)
    VALUES
        (p_subscription_id, p_lead_id, p_profile_id, p_called_by, p_queue,
         p_outcome, p_notes, p_callback_at, p_identity_verified, p_escalated)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('ok', true, 'call_log_id', v_new_id);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.log_call_limited(
    uuid, uuid, uuid, uuid, text, text, text, timestamptz, boolean, boolean, int)
    FROM public, anon, authenticated;

COMMENT ON FUNCTION public.log_call_limited(
    uuid, uuid, uuid, uuid, text, text, text, timestamptz, boolean, boolean, int) IS
    'Atomic per-caller IST-day quota check + call_logs insert (Pass-2 P10).
     Returns {ok:true, call_log_id} or {ok:false, reason:over_limit}.
     EXECUTE revoked — telecaller API routes only (service role).';


-- ── Verification (run manually after applying) ────────────────
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('reallot_hospital','is_owner','generate_sankalp_batch',
--      'log_call_limited');
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.coupons'::regclass
--      AND conname IN ('coupons_flat_nonneg_check',
--                      'coupons_percent_positive_check');
--   SELECT tgtype FROM pg_trigger WHERE tgname = 'trg_call_logs_escalate';
--   -- expect no rows:
--   SELECT indexname FROM pg_indexes
--    WHERE schemaname='public'
--      AND indexname IN ('idx_coupons_code','idx_sbs_batch_id');
--   -- every legacy agent has an opening row (expect zero rows):
--   SELECT sa.id FROM public.sales_agents sa
--    WHERE NOT EXISTS (
--      SELECT 1 FROM public.staff_commission_rates scr
--       WHERE scr.agent_id = sa.id AND scr.reason = 'opening');
