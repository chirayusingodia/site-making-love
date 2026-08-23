-- =============================================================
-- PUNYATA — Session: Refund Webhook Handling
-- Project : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch  : Staging
-- Created : 2026-08-23
-- =============================================================
--
-- Gap found while wiring up Razorpay live mode: razorpay-webhook.server.ts
-- subscribed to the 8 subscription.* lifecycle events only. Razorpay's
-- REFUND events (refund.created / refund.processed / refund.failed /
-- refund.speed_changed — a separate event family fired off the payment
-- object, not the subscription) were never subscribed to or handled.
-- public.payments.status already allowed a 'refunded' value and the
-- admin Payments List already had refund aggregation/masking logic
-- (payments-logic.ts) — but nothing ever WROTE that value. If a refund
-- was issued from the Razorpay dashboard, Supabase would keep showing
-- the payment as 'captured' forever: a silent state mismatch, not a
-- webhook failure (Razorpay doesn't know or care that we ignored the
-- event, so nothing here risks Razorpay disabling the webhook or
-- touching the subscription's own status/mandate).
--
-- This migration adds the columns the webhook needs to record a
-- refund against the payment row it belongs to. It does NOT touch
-- subscriptions.status or the mandate in any way — issuing a refund
-- is a financial correction on a past payment, not a subscription
-- lifecycle event, so a subscriber keeps their active service unless
-- an admin separately decides to cancel it.
--
-- RLS: NO CHANGE. Same "payments: admin write" policy from migration
-- 001 already covers these columns; the webhook writes via the
-- service-role client (bypasses RLS) exactly as it does for every
-- other payments write.
--
-- Idempotent: safe to re-run (IF NOT EXISTS throughout).
-- =============================================================

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS razorpay_refund_id  text,
    ADD COLUMN IF NOT EXISTS refund_amount_paise int,
    ADD COLUMN IF NOT EXISTS refund_status       text,
    ADD COLUMN IF NOT EXISTS refunded_at         timestamptz;

-- Uniqueness on the refund id, mirroring razorpay_payment_id's own
-- UNIQUE column constraint — multiple NULLs are fine (most payments
-- are never refunded), but the same refund id can't land on two rows.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.payments'::regclass
          AND conname  = 'payments_razorpay_refund_id_key'
    ) THEN
        ALTER TABLE public.payments
            ADD CONSTRAINT payments_razorpay_refund_id_key UNIQUE (razorpay_refund_id);
    END IF;
END $$;

-- refund_status mirrors Razorpay's own payment.refund_status field
-- ('partial' | 'full') rather than overloading payments.status —
-- a PARTIAL refund leaves status='captured' (money still substantially
-- collected); only a FULL refund flips status to the existing
-- 'refunded' value the original CHECK constraint already allows.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.payments'::regclass
          AND conname  = 'payments_refund_status_check'
    ) THEN
        ALTER TABLE public.payments
            ADD CONSTRAINT payments_refund_status_check
            CHECK (refund_status IS NULL OR refund_status IN ('partial','full'));
    END IF;
END $$;

COMMENT ON COLUMN public.payments.razorpay_refund_id  IS 'Razorpay rfnd_... id. Set only on refund.processed — refund.created/failed never write here (refund not yet confirmed, or never happened).';
COMMENT ON COLUMN public.payments.refund_amount_paise IS 'Amount actually refunded (paise), from the refund.processed payload — may be less than amount_paise for a partial refund.';
COMMENT ON COLUMN public.payments.refund_status       IS 'partial | full, from Razorpay payment.refund_status. NULL = never refunded.';
COMMENT ON COLUMN public.payments.refunded_at          IS 'When refund.processed was recorded (our clock, not Razorpay''s created_at).';

CREATE INDEX IF NOT EXISTS idx_payments_razorpay_refund_id
    ON public.payments(razorpay_refund_id)
    WHERE razorpay_refund_id IS NOT NULL;

-- ── Verification ───────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='payments'
--   AND column_name LIKE 'refund%' OR column_name = 'razorpay_refund_id';
-- Expect: razorpay_refund_id, refund_amount_paise, refund_status, refunded_at.
