-- =============================================================
-- PUNYATA — International (NRI / overseas) customers
-- Created : 2026-11-09          Builds on: 043
-- =============================================================
--
-- Phase 1: anyone, any country, can subscribe; charged in INR on a
-- Razorpay card/UPI mandate. Prasad ships to India only (pincode CHECK
-- from 018 §11 is KEPT). Login stays Google-first.
--
-- Run in the Supabase SQL Editor as ONE implicit transaction — any
-- error rolls everything back. Backfills run BEFORE constraints.
--
-- CALLERS of normalize_phone_e164 (grepped across all migrations):
--   • 026 trigger function profiles_normalize_phone() — redefined below
--   • no expression index, no RPC (042/043), no otp_check_and_log uses it
-- ⇒ Output for every value already stored (canonical +91XXXXXXXXXX) is
--   byte-identical, so NO reindex and NO phone backfill is needed.
--
-- KEEP IN STEP WITH: src/lib/phone.ts (parsePhone / sqlMirrorNormalize).
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 3.1  normalize_phone_e164 — India fast path + E.164 for the world
-- ─────────────────────────────────────────────────────────────
-- Rules, in order:
--   NULL                                   → NULL
--   not intl (no '+'/'00') AND 026 rules   → same as 026 (India)
--   intl AND ^91[6-9]\d{9}$                → '+' || digits
--   intl AND starts with '91' (other)      → NULL (bad Indian number stays bad)
--   intl AND ^[1-9]\d{7,14}$               → '+' || digits (E.164)
--   everything else                        → NULL
-- Bare foreign digits (no '+') are rejected: "14155550123" could be a
-- typo'd Indian number (2026-08-30 bug class). The app always sends
-- +E164 for foreign numbers.

CREATE OR REPLACE FUNCTION public.normalize_phone_e164(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    s      text;
    intl   boolean;
    digits text;
BEGIN
    IF p_raw IS NULL THEN
        RETURN NULL;
    END IF;

    s      := btrim(p_raw);
    intl   := left(s, 1) = '+' OR left(s, 2) = '00';
    digits := regexp_replace(s, '\D', '', 'g');
    IF left(s, 2) = '00' THEN
        digits := substring(digits from 3);
    END IF;

    IF NOT intl THEN
        -- India fast path: the four 026 branches, verbatim.
        IF length(digits) = 10 AND digits ~ '^[6-9]' THEN
            RETURN '+91' || digits;
        ELSIF length(digits) = 11 AND left(digits, 1) = '0' AND substring(digits from 2) ~ '^[6-9]' THEN
            RETURN '+91' || substring(digits from 2);
        ELSIF length(digits) = 12 AND left(digits, 2) = '91' AND substring(digits from 3) ~ '^[6-9]' THEN
            RETURN '+' || digits;
        ELSIF length(digits) = 13 AND left(digits, 3) = '091' AND substring(digits from 4) ~ '^[6-9]' THEN
            RETURN '+' || substring(digits from 2);
        END IF;
        RETURN NULL;
    END IF;

    -- Explicitly international.
    IF digits ~ '^91[6-9][0-9]{9}$' THEN
        RETURN '+' || digits;
    ELSIF left(digits, 2) = '91' THEN
        RETURN NULL;
    ELSIF digits ~ '^[1-9][0-9]{7,14}$' THEN
        RETURN '+' || digits;
    END IF;

    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.normalize_phone_e164(text) IS
    'SQL mirror of src/lib/phone.ts sqlMirrorNormalize. India-shaped input → +91XXXXXXXXXX (unchanged since 026); explicit +/00 international input → E.164 (8–15 digits, no leading 0); bare foreign digits → NULL. Keep both in sync.';

CREATE OR REPLACE FUNCTION public.profiles_normalize_phone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    n_phone text;
    n_alt text;
BEGIN
    IF NEW.phone IS NOT NULL THEN
        n_phone := public.normalize_phone_e164(NEW.phone);
        IF n_phone IS NULL THEN
            RAISE EXCEPTION 'profiles.phone is not a valid phone number (E.164 required for non-Indian numbers): %', NEW.phone;
        END IF;
        NEW.phone := n_phone;
    END IF;

    IF NEW.alt_phone IS NOT NULL THEN
        n_alt := public.normalize_phone_e164(NEW.alt_phone);
        IF n_alt IS NULL THEN
            RAISE EXCEPTION 'profiles.alt_phone is not a valid phone number (E.164 required for non-Indian numbers): %', NEW.alt_phone;
        END IF;
        NEW.alt_phone := n_alt;
    END IF;

    RETURN NEW;
END;
$$;
-- Trigger definition (026) is unchanged; it keeps calling this function.


-- ─────────────────────────────────────────────────────────────
-- 3.2  profiles.country_code (ISO-3166 alpha-2 of the PHONE country)
-- ─────────────────────────────────────────────────────────────
-- profiles.country (free text, 001) is left alone — never set by code.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country_code char(2);
UPDATE public.profiles SET country_code = 'IN' WHERE country_code IS NULL;
ALTER TABLE public.profiles ALTER COLUMN country_code SET DEFAULT 'IN';
ALTER TABLE public.profiles ALTER COLUMN country_code SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.profiles'::regclass
          AND conname  = 'profiles_country_code_format_check'
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_country_code_format_check
            CHECK (country_code ~ '^[A-Z]{2}$');
    END IF;
END $$;

COMMENT ON COLUMN public.profiles.country_code IS
    'ISO-3166 alpha-2 of the customer''s PHONE country (where they live). Derived server-side from profiles.phone — never trusted from the client. Not the prasad address country (prasad is India-only, enforced by the pincode CHECK).';


-- ─────────────────────────────────────────────────────────────
-- 3.3  payments — currency / international / gateway fee
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS currency      text    NOT NULL DEFAULT 'INR';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS international boolean NOT NULL DEFAULT false;
-- Razorpay payment.fee (incl. GST); NULL for offline_qr / unknown. FINANCIAL.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS fee_paise     int     NULL;
-- Razorpay payment.tax. FINANCIAL.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS tax_paise     int     NULL;

-- Phase 1 lock: INR only. A non-INR capture fails LOUDLY instead of
-- mixing currencies into amount_paise sums (MRR, Reports, P&L).
-- Phase 2 widens this deliberately.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_currency_inr_only;
ALTER TABLE public.payments
    ADD CONSTRAINT payments_currency_inr_only CHECK (currency = 'INR');

COMMENT ON COLUMN public.payments.fee_paise IS
    'Razorpay payment.fee in paise (incl. GST). NULL for offline_qr/unknown. FINANCIAL — owner-only surfaces.';


-- ─────────────────────────────────────────────────────────────
-- 3.4  subscriptions.is_international
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS is_international boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.subscriptions.is_international IS
    'true when the PAYER is overseas (profiles.country_code <> IN at checkout, or first captured payment.international = true). Display/filter only; never used for pricing or activation.';


-- ─────────────────────────────────────────────────────────────
-- 3.5  subscriber_list_view — APPEND country_code, is_international
-- ─────────────────────────────────────────────────────────────
-- Latest definition = 042 (043 does not touch the view; grep-confirmed).
-- Reproduced verbatim with two columns appended at the END.

CREATE OR REPLACE VIEW public.subscriber_list_view AS
SELECT
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

    cm.gateway                AS mandate_gateway,
    cm.gateway_mandate_id     AS mandate_gateway_id,
    cm.status                 AS mandate_status,
    cm.total_count            AS mandate_total_count,
    cm.cycles_paid            AS mandate_cycles_paid,
    cm.expected_end_at        AS mandate_expected_end_at,

    p.id                      AS plan_id,
    p.name                    AS plan_name,
    p.price_paise             AS plan_price_paise,
    p.billing_period          AS plan_billing_period,

    sa.id                     AS agent_id,
    sa.full_name              AS agent_full_name,
    sa.agent_code,

    c.id                      AS coupon_id,
    c.code                    AS coupon_code,
    c.discount_type           AS coupon_discount_type,
    c.discount_value          AS coupon_discount_value,

    fm.id                     AS primary_member_id,
    fm.full_name              AS primary_member_name,
    fm.gotra                  AS primary_member_gotra,
    fm.relation               AS primary_member_relation,
    fm.slot_number            AS primary_member_slot,
    fm.is_primary             AS primary_member_is_primary,
    fm.dob                    AS primary_member_dob,

    (
        SELECT COUNT(*)::int
        FROM public.family_members fm2
        WHERE fm2.subscription_id = s.id
    )                         AS family_member_count,

    pr.full_name              AS profile_full_name,
    pr.phone                  AS profile_phone,
    pr.email                  AS profile_email,
    pr.alt_phone              AS profile_alt_phone,

    s.payment_mode            AS payment_mode,

    -- ── International (044) — APPENDED LAST, never reorder ───
    pr.country_code           AS country_code,
    s.is_international        AS is_international

FROM public.subscriptions s

LEFT JOIN public.plans        p  ON p.id  = s.plan_id
LEFT JOIN public.sales_agents sa ON sa.id = s.sales_agent_id
LEFT JOIN public.coupons      c  ON c.id  = s.coupon_id
LEFT JOIN public.profiles     pr ON pr.id = s.user_id

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
-- 3.6  RLS / grants
-- ─────────────────────────────────────────────────────────────
-- No new tables, no new functions beyond the (non-DEFINER) phone
-- functions above. payments.fee_paise / tax_paise are financial: the
-- admin (non-owner) payments API must NOT select them (verified in app
-- code). The existing "user reads own payments" policy would expose the
-- customer's own fee to them — harmless, noted.


-- ─────────────────────────────────────────────────────────────
-- VERIFICATION (run manually after applying; expected results inline)
-- ─────────────────────────────────────────────────────────────
-- must all return '+918005828548':
--   SELECT public.normalize_phone_e164('8005828548'), public.normalize_phone_e164('+91 80058 28548'),
--          public.normalize_phone_e164('918005828548'), public.normalize_phone_e164('08005828548'),
--          public.normalize_phone_e164('0918005828548'), public.normalize_phone_e164('0091 8005828548');
-- must return '+14155550123', '+447911123456', '+971501234567':
--   SELECT public.normalize_phone_e164('+1 (415) 555-0123'), public.normalize_phone_e164('+44 7911 123456'),
--          public.normalize_phone_e164('00971501234567');
-- must return NULL:
--   SELECT public.normalize_phone_e164('14155550123'), public.normalize_phone_e164('+91 12345 67890'),
--          public.normalize_phone_e164('+0123456789'), public.normalize_phone_e164('12345');
-- and this must return 0 rows (nothing in prod changes):
--   SELECT id, phone FROM public.profiles WHERE phone IS DISTINCT FROM public.normalize_phone_e164(phone);
-- view columns appended only:
--   SELECT country_code, is_international FROM public.subscriber_list_view LIMIT 1;
