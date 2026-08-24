-- =============================================================
-- PUNYATA — Bug-Scan Hardening (PUNYATA_BUGS_REPORT.md fixes)
-- Project  : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch   : Staging
-- Depends  : through 20260823_017_refund_tracking.sql
-- Created  : 2026-08-24
-- =============================================================
--
-- One migration covering every DB-side finding from the full repo
-- bug scan. Report IDs are cited inline. Idempotent throughout.
--
--   5.1  profiles.role self-escalation  → write-guard trigger
--   5.2  subscriber_list_view bypasses RLS → security_invoker = true
--   5.3  financial tables readable by admin role → owner-only grants
--   5.4  call_logs compliance trail destroyed on cascade → SET NULL
--   5.6  multiple is_primary rows per subscription → partial UNIQUE
--   5.7  coupons percent > 100 → CHECK
--   5.9  duplicate seva_schedule_rules → UNIQUE
--   5.10 subscriptions status/timestamp inconsistency → CHECKs
--   5.11 call_logs.escalated auto-set comment-only → trigger
--   5.12 leads orphaned by staff deletion → reset-to-new trigger
--   5.13 profiles.pincode format → CHECK
--   5.14 payments negative amounts → CHECKs
--   5.15 delivered booleans vs timestamps → CHECKs
--   4.1  sankalp batch generation race → atomic RPC
--   4.2  non-atomic membership refresh → same RPC
--   1.2  coupon times_redeemed never incremented → redeem_coupon RPC
--   1.7  OTP rate limiter TOCTOU → otp_check_and_log RPC
--
-- NOT VALID is used for every new CHECK that historical rows may
-- already violate: Postgres enforces NOT VALID checks on all NEW
-- writes immediately while leaving legacy rows alone (validate
-- later with VALIDATE CONSTRAINT once data is audited).
--
-- 5.16 (is_admin() callable via RPC) stays deliberately open — see
-- migration 013's C1 addendum: RLS policy evaluation needs invoker
-- EXECUTE; revoking would break every subscriber read.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 0. is_owner() helper — financial-visibility check
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'owner'
    );
$$;

COMMENT ON FUNCTION public.is_owner() IS
    'Owner-only RLS check (migration 018). Owner is the ONLY role with financial visibility: payments, sales_agents, commission_entries, staff_commission_rates, commission_payout_periods policies gate on this.';

-- [Pass-2 S3 fix] RLS policy expressions are evaluated with the
-- INVOKER's privileges, so every role that can reach a policy gated
-- on this function MUST hold EXECUTE — owners/admins connect over
-- PostgREST as `authenticated`. Revoking it made the five financial
-- policies throw "permission denied" for the very users they gate.
-- SECURITY DEFINER keeps the body's profile read safe; granting to
-- authenticated leaks only the same one-boolean is_admin() already
-- leaks (documented C1 exception, migration 013).
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- 1. [5.1 CRITICAL] profiles.role self-escalation guard
-- ─────────────────────────────────────────────────────────────
-- RLS is row-level, not column-level: "profiles: user updates own"
-- lets any user UPDATE their own row INCLUDING the role column.
-- This BEFORE trigger makes role writes impossible from a client
-- JWT unless the actor is ALREADY an owner (or there is no request
-- JWT at all — raw SQL in the dashboard and service-role requests,
-- which is exactly how legitimate promotions happen).

CREATE OR REPLACE FUNCTION public.profiles_role_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.role IS DISTINCT FROM 'user'
           AND auth.uid() IS NOT NULL
           AND NOT public.is_owner() THEN
            RAISE EXCEPTION
                'profiles.role can only be set by the owner or via server-side SQL';
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE
    IF NEW.role IS DISTINCT FROM OLD.role
       AND auth.uid() IS NOT NULL
       AND NOT public.is_owner() THEN
        RAISE EXCEPTION
            'profiles.role changes require the owner role';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.profiles_role_write_guard()
    FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_role_write_guard ON public.profiles;
CREATE TRIGGER trg_profiles_role_write_guard
    BEFORE INSERT OR UPDATE OF role ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.profiles_role_write_guard();

COMMENT ON TRIGGER trg_profiles_role_write_guard ON public.profiles IS
    '[Bug 5.1] Blocks client-JWT writes to profiles.role unless the actor is already owner. Staff promotion remains manual SQL / service-role only (migrations 006/012).';


-- ─────────────────────────────────────────────────────────────
-- 2. [5.2 CRITICAL] subscriber_list_view must run as invoker
-- ─────────────────────────────────────────────────────────────
-- Without security_invoker, permission/RLS evaluation runs as the
-- view OWNER (Supabase postgres role) and the underlying
-- "user reads own" policies never constrain the querying user.

ALTER VIEW public.subscriber_list_view SET (security_invoker = true);

COMMENT ON VIEW public.subscriber_list_view IS
    '[Bug 5.2] security_invoker was added in migration 018 — queries now evaluate underlying RLS as the calling role, so each signed-in user sees only their own subscription row. Admin/owner see all via is_admin(); server routes use the service role.';


-- ─────────────────────────────────────────────────────────────
-- 3. [5.3 HIGH] Financial tables are OWNER-only at the DB layer
-- ─────────────────────────────────────────────────────────────
-- The stated design ("admin = zero financial visibility") was only
-- enforced at the API layer; is_admin() granted admins full row
-- access to every financial table. All staff data paths go through
-- service-role endpoints, so tightening RLS breaks no UI:
--   • /admin/payments reads via /api/admin/payments/list (service)
--   • /admin/commissions is owner-gated beforeLoad + browser query
--   • telecaller earnings route uses the service role

DROP POLICY IF EXISTS "payments: admin write" ON public.payments;
CREATE POLICY "payments: owner full access"
    ON public.payments FOR ALL
    USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "sales_agents: admin only" ON public.sales_agents;
CREATE POLICY "sales_agents: owner only"
    ON public.sales_agents FOR ALL
    USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "commission_entries: admin full access" ON public.commission_entries;
CREATE POLICY "commission_entries: owner full access"
    ON public.commission_entries FOR ALL
    USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "staff_commission_rates: admin full access" ON public.staff_commission_rates;
CREATE POLICY "staff_commission_rates: owner full access"
    ON public.staff_commission_rates FOR ALL
    USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "commission_payout_periods: admin full access" ON public.commission_payout_periods;
CREATE POLICY "commission_payout_periods: owner full access"
    ON public.commission_payout_periods FOR ALL
    USING (public.is_owner()) WITH CHECK (public.is_owner());


-- ─────────────────────────────────────────────────────────────
-- 4. [5.4 HIGH] call_logs survives subject deletion
-- ─────────────────────────────────────────────────────────────
-- profile_id/subscription_id were ON DELETE CASCADE, destroying
-- DPDP do-not-call context and complaint/escalation history when a
-- profile/subscription disappears. History rows now keep existing
-- with nulled references (notes/outcome/escalated survive); the
-- insert-time target CHECK is retired because its invariant cannot
-- hold after the referenced rows are gone.

ALTER TABLE public.call_logs
    DROP CONSTRAINT IF EXISTS call_logs_profile_id_fkey;
ALTER TABLE public.call_logs
    ADD CONSTRAINT call_logs_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.call_logs
    DROP CONSTRAINT IF EXISTS call_logs_subscription_id_fkey;
ALTER TABLE public.call_logs
    ADD CONSTRAINT call_logs_subscription_id_fkey
    FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;

ALTER TABLE public.call_logs
    DROP CONSTRAINT IF EXISTS call_logs_target_check;

COMMENT ON TABLE public.call_logs IS
    'Telecaller disposition log. [Bug 5.4] profile_id/subscription_id are ON DELETE SET NULL so the audit trail (outcomes, DND context, complaints) outlives deleted subjects; called_by stays RESTRICT. Insert-time "must attach to someone" is enforced by the API layer since the old CHECK cannot survive reference nulling.';


-- ─────────────────────────────────────────────────────────────
-- 5. [5.6 MEDIUM] one is_primary per subscription
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.family_members
        WHERE is_primary
        GROUP BY subscription_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE NOTICE
            '[Bug 5.6] family_members has subscriptions with MULTIPLE is_primary rows — dedupe manually, then re-run to add uq_family_members_one_primary';
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS uq_family_members_one_primary
            ON public.family_members (subscription_id)
            WHERE is_primary;
    END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 6. [5.7 MEDIUM] percent coupons capped at 100
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.coupons'::regclass
          AND conname  = 'coupons_percent_range_check'
    ) THEN
        ALTER TABLE public.coupons
            ADD CONSTRAINT coupons_percent_range_check
            CHECK (discount_type <> 'percent' OR discount_value BETWEEN 0 AND 100)
            NOT VALID;
    END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 7. [5.9 MEDIUM] no duplicate seva_schedule_rules
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
    dupes int;
BEGIN
    SELECT COUNT(*) INTO dupes FROM (
        SELECT 1 FROM public.seva_schedule_rules
        GROUP BY seva_id, weekday, occurrence
        HAVING COUNT(*) > 1
    ) d;
    IF dupes > 0 THEN
        RAISE NOTICE
            '[Bug 5.9] % duplicate seva_schedule_rules rows exist — dedupe manually, then re-run to add uq_seva_schedule_rules', dupes;
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS uq_seva_schedule_rules
            ON public.seva_schedule_rules (seva_id, weekday, occurrence);
    END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 8. [5.10 MEDIUM] subscriptions status ↔ timestamp consistency
-- ─────────────────────────────────────────────────────────────
-- Mirrors the guard migration 013 added for commission_entries.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.subscriptions'::regclass
          AND conname  = 'subscriptions_active_has_start_check'
    ) THEN
        ALTER TABLE public.subscriptions
            ADD CONSTRAINT subscriptions_active_has_start_check
            CHECK (status <> 'active' OR start_date IS NOT NULL)
            NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.subscriptions'::regclass
          AND conname  = 'subscriptions_paused_at_check'
    ) THEN
        ALTER TABLE public.subscriptions
            ADD CONSTRAINT subscriptions_paused_at_check
            CHECK (status <> 'paused' OR paused_at IS NOT NULL)
            NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.subscriptions'::regclass
          AND conname  = 'subscriptions_cancelled_at_check'
    ) THEN
        ALTER TABLE public.subscriptions
            ADD CONSTRAINT subscriptions_cancelled_at_check
            CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL)
            NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.subscriptions'::regclass
          AND conname  = 'subscriptions_halted_at_check'
    ) THEN
        ALTER TABLE public.subscriptions
            ADD CONSTRAINT subscriptions_halted_at_check
            CHECK (status <> 'halted' OR halted_at IS NOT NULL)
            NOT VALID;
    END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 9. [5.11 MEDIUM] escalated auto-set is structural now
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.call_logs_escalate_complaints()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.outcome = 'complaint' THEN
        NEW.escalated := true;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.call_logs_escalate_complaints()
    FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_call_logs_escalate ON public.call_logs;
CREATE TRIGGER trg_call_logs_escalate
    BEFORE INSERT ON public.call_logs
    FOR EACH ROW EXECUTE FUNCTION public.call_logs_escalate_complaints();


-- ─────────────────────────────────────────────────────────────
-- 10. [5.12 MEDIUM] staff deletion un-orphans their leads
-- ─────────────────────────────────────────────────────────────
-- leads.assigned_to is ON DELETE SET NULL; without this trigger the
-- lead keeps status='assigned' with no assignee until the day-count
-- rollover sweep eventually rescues it.

CREATE OR REPLACE FUNCTION public.leads_unassigned_reset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.assigned_to IS NULL AND OLD.assigned_to IS NOT NULL
       AND NEW.status IN ('assigned', 'in_progress') THEN
        NEW.status      := 'new';
        NEW.assigned_on := NULL;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.leads_unassigned_reset()
    FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_leads_unassigned_reset ON public.leads;
CREATE TRIGGER trg_leads_unassigned_reset
    BEFORE UPDATE OF assigned_to ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_unassigned_reset();


-- ─────────────────────────────────────────────────────────────
-- 11. [5.13 LOW] profiles.pincode format CHECK
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.profiles'::regclass
          AND conname  = 'profiles_pincode_format_check'
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_pincode_format_check
            CHECK (pincode IS NULL OR pincode ~ '^[0-9]{6}$')
            NOT VALID;
    END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 12. [5.14 LOW] payments amounts are non-negative
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.payments'::regclass
          AND conname  = 'payments_amount_non_negative_check'
    ) THEN
        ALTER TABLE public.payments
            ADD CONSTRAINT payments_amount_non_negative_check
            CHECK (amount_paise >= 0)
            NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.payments'::regclass
          AND conname  = 'payments_refund_amount_non_negative_check'
    ) THEN
        ALTER TABLE public.payments
            ADD CONSTRAINT payments_refund_amount_non_negative_check
            CHECK (refund_amount_paise IS NULL OR refund_amount_paise >= 0)
            NOT VALID;
    END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 13. [5.15 LOW] delivered booleans ↔ timestamps agree
-- ─────────────────────────────────────────────────────────────
-- Same class of gap migration 013 fixed for commission_entries.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.seva_proofs'::regclass
          AND conname  = 'seva_proofs_delivered_at_consistency_check'
    ) THEN
        ALTER TABLE public.seva_proofs
            ADD CONSTRAINT seva_proofs_delivered_at_consistency_check
            CHECK ((is_delivered = true) = (delivered_at IS NOT NULL))
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.prasad_shipments'::regclass
          AND conname  = 'prasad_shipments_shipped_at_check'
    ) THEN
        ALTER TABLE public.prasad_shipments
            ADD CONSTRAINT prasad_shipments_shipped_at_check
            CHECK (status NOT IN ('shipped','delivered','returned') OR shipped_at IS NOT NULL)
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.prasad_shipments'::regclass
          AND conname  = 'prasad_shipments_delivered_at_check'
    ) THEN
        ALTER TABLE public.prasad_shipments
            ADD CONSTRAINT prasad_shipments_delivered_at_check
            CHECK (status <> 'delivered' OR delivered_at IS NOT NULL)
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.proof_deliveries'::regclass
          AND conname  = 'proof_deliveries_delivered_at_consistency_check'
    ) THEN
        ALTER TABLE public.proof_deliveries
            ADD CONSTRAINT proof_deliveries_delivered_at_consistency_check
            CHECK ((is_delivered = true) = (delivered_at IS NOT NULL))
            NOT VALID;
    END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 14. [4.1 CRITICAL / 4.2 HIGH] atomic sankalp batch generation
-- ─────────────────────────────────────────────────────────────
-- The route previously did read-check-delete-insert across four
-- round trips: concurrent triggers raced the read (double-create
-- attempt) and interleaved delete+chunked-insert (partial batch).
-- Everything below runs in ONE transaction; the (batch_date,
-- batch_type) UNIQUE plus ON CONFLICT serializes racers — the
-- loser waits, then refreshes instead of failing.

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

    -- [Pass-2 S2 fix] Never rewrite the PK (the old DO UPDATE SET
    -- id = EXCLUDED.id violated child FKs on every refresh). With
    -- DO NOTHING the loser's RETURNING is empty; it already blocked
    -- on the winner's insert above, so the row is now visible.
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

    -- Refresh membership atomically: wipe + reinsert inside this
    -- transaction. A failure anywhere rolls EVERYTHING back,
    -- including the batch row itself on first creation.
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

-- C1 discipline: service role only (the route runs behind
-- requireAdmin on the service client).
REVOKE EXECUTE ON FUNCTION public.generate_sankalp_batch(date, text, jsonb)
    FROM public, anon, authenticated;

COMMENT ON FUNCTION public.generate_sankalp_batch(date, text, jsonb) IS
    '[Bugs 4.1/4.2] Atomic batch create-or-refresh. Concurrent callers serialize on the (batch_date,batch_type) unique via ON CONFLICT; membership delete+reinsert is transactional, so a mid-refresh failure can never leave a partially-empty batch. Service-role only.';


-- ─────────────────────────────────────────────────────────────
-- 15. [1.2 HIGH] atomic coupon redemption
-- ─────────────────────────────────────────────────────────────
-- Returns the new times_redeemed, or NULL when the code does not
-- exist / is inactive / is exhausted — the authoritative cap the
-- checkout flow previously only previewed.

CREATE OR REPLACE FUNCTION public.redeem_coupon(p_code text)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.coupons
       SET times_redeemed = times_redeemed + 1
     WHERE code = UPPER(p_code)
       AND is_active
       AND (max_redemptions IS NULL OR times_redeemed < max_redemptions)
    RETURNING times_redeemed;
$$;

REVOKE EXECUTE ON FUNCTION public.redeem_coupon(text)
    FROM public, anon, authenticated;

COMMENT ON FUNCTION public.redeem_coupon(text) IS
    '[Bug 1.2] Atomic redemption increment with cap enforcement. The conditional UPDATE means two concurrent checkouts can never push times_redeemed past max_redemptions. Service-role only (checkout route).';


-- ─────────────────────────────────────────────────────────────
-- 16. [1.7 LOW] atomic OTP rate-limit check + ledger write
-- ─────────────────────────────────────────────────────────────
-- Replaces count-then-insert in auth.server.ts. Transaction-scoped
-- advisory locks serialize per-phone (and per-IP) so concurrent
-- requests cannot both slip under the caps. Returns 'allowed' or
-- the block reason consumed by OtpRateLimitError.

CREATE OR REPLACE FUNCTION public.otp_check_and_log(p_phone text, p_ip text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_burst   int;
    v_daily   int;
    v_distinct int;
    v_blocked text := NULL;
BEGIN
    -- Consistent lock order (phone → ip) avoids deadlocks.
    PERFORM pg_advisory_xact_lock(hashtextextended('otp:' || p_phone, 0));

    -- [Pass-2 S4 fix] Count only rows where a send actually happened
    -- (allowed = true). Blocked attempts are logged but must never
    -- consume quota — OTP_RATE_LIMITS caps SENDS, and counting blocks
    -- let retries/self-extending lockouts pin a phone forever.
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
    VALUES (
        p_phone,
        p_ip,
        v_blocked IS NULL,
        v_blocked
    );

    RETURN COALESCE(v_blocked, 'allowed');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.otp_check_and_log(text, text)
    FROM public, anon, authenticated;

COMMENT ON FUNCTION public.otp_check_and_log(text, text) IS
    '[Bug 1.7] TOCTOU-safe OTP limiter: counts + ledger insert run under transaction advisory locks keyed by phone (then IP), so racing requests serialize instead of both passing the cap. Thresholds mirror OTP_RATE_LIMITS in src/lib/auth.server.ts (3/10min, 8/24h, 5 distinct phones/hour/IP) — tune BOTH together. Returns ''allowed'' or the block reason. Service-role only.';


-- ─────────────────────────────────────────────────────────────
-- 17. [3.1 HIGH] users may prune their own family-member slots
-- ─────────────────────────────────────────────────────────────
-- The family-members API now deletes slots that fell out of the
-- submitted list; under the caller's JWT it needs its own policy —
-- previously only admins could DELETE at all.

DROP POLICY IF EXISTS "family_members: user deletes own" ON public.family_members;
CREATE POLICY "family_members: user deletes own"
    ON public.family_members FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.subscriptions s
            WHERE s.id = subscription_id AND s.user_id = auth.uid()
        )
    );


-- ═════════════════════════════════════════════════════════════
-- Verification (run manually after applying):
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('is_owner','profiles_role_write_guard','generate_sankalp_batch',
--      'redeem_coupon','otp_check_and_log');
--   SELECT pg_get_viewdef('public.subscriber_list_view'::regclass);
--     -- reindex check:
--   SELECT indexname FROM pg_indexes
--    WHERE tablename IN ('family_members','seva_schedule_rules');
--   As a normal user JWT:
--     UPDATE public.profiles SET role='owner' WHERE id=auth.uid();
--     -- expect: exception from trg_profiles_role_write_guard
-- ═════════════════════════════════════════════════════════════
