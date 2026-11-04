-- =============================================================
-- PUNYATA — Telecaller monthly payroll + payout history
-- Project  : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch   : Staging
-- Depends  : through 20261025_042_offline_qr_and_finance.sql
-- Created  : 2026-11-04
-- =============================================================
--
-- Telecaller pay is now FLAT (₹80 first conversion, ₹20 per paid month
-- after) — the amounts are written by the commission reconciler
-- (src/lib/commission-logic.ts). This migration adds the "did we pay
-- her yet?" half:
--
--   1. telecaller_payouts — one row per payout the owner records
--      (who, which month, how much, how, UTR/reference, when). Rows are
--      never edited or deleted: history IS the audit trail.
--   2. commission_entries.payout_id — which payout settled each entry.
--   3. pay_telecaller_period() — atomic: sums the payable entries,
--      writes the payout row and flips those entries to 'paid' in ONE
--      transaction. The owner's expected amount is checked inside, so a
--      stale screen can never pay a different figure than it showed.
--
-- NOTE: a LOCKED payout period freezes its entries (migration 013
-- trigger), so pay a month BEFORE locking it. This function therefore
-- refuses locked periods with a clear error instead of a trigger error.
--
-- Idempotent throughout.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.telecaller_payouts (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    payout_period  text NOT NULL CHECK (payout_period ~ '^[0-9]{4}-[0-9]{2}$'),
    amount_paise   int  NOT NULL CHECK (amount_paise > 0),
    entry_count    int  NOT NULL CHECK (entry_count > 0),
    method         text NOT NULL CHECK (method IN ('upi','bank_transfer','cash','other')),
    reference_no   text,
    note           text,
    paid_at        timestamptz NOT NULL DEFAULT now(),
    paid_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telecaller_payouts_profile
    ON public.telecaller_payouts (profile_id, payout_period);
CREATE INDEX IF NOT EXISTS idx_telecaller_payouts_period
    ON public.telecaller_payouts (payout_period);

ALTER TABLE public.telecaller_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telecaller_payouts: admin full access" ON public.telecaller_payouts;
CREATE POLICY "telecaller_payouts: admin full access"
    ON public.telecaller_payouts FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Append-only: a wrong payout is corrected by a note/new row, never edited.
CREATE OR REPLACE FUNCTION public.telecaller_payouts_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'telecaller_payouts is append-only: % denied', TG_OP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.telecaller_payouts_guard() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_telecaller_payouts_guard ON public.telecaller_payouts;
CREATE TRIGGER trg_telecaller_payouts_guard
    BEFORE UPDATE OR DELETE ON public.telecaller_payouts
    FOR EACH ROW EXECUTE FUNCTION public.telecaller_payouts_guard();

COMMENT ON TABLE public.telecaller_payouts IS
    'Owner-recorded telecaller payouts (migration 043). Append-only. Each row settles the payable commission_entries of one (telecaller, payout_period) via commission_entries.payout_id.';

ALTER TABLE public.commission_entries
    ADD COLUMN IF NOT EXISTS payout_id uuid REFERENCES public.telecaller_payouts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_commission_entries_payout
    ON public.commission_entries (payout_id);


-- ─────────────────────────────────────────────────────────────
-- pay_telecaller_period — atomic settle
-- ─────────────────────────────────────────────────────────────
-- Payable = status IN ('accrued','payable'), INCLUDING negative
-- clawback rows, so the payout is net. 'held' first-deal bonuses are
-- still inside the 30-day refund window and are NOT paid yet — they
-- stay for a later payout once matured.

CREATE OR REPLACE FUNCTION public.pay_telecaller_period(
    p_profile          uuid,
    p_period           text,
    p_expected_paise   int,
    p_method           text,
    p_reference        text,
    p_note             text,
    p_paid_by          uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total  int;
    v_count  int;
    v_id     uuid;
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.commission_payout_periods
         WHERE period = p_period AND locked_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'period_locked';
    END IF;

    -- Lock the candidate rows so two owners clicking Pay cannot both settle them.
    PERFORM 1
       FROM public.commission_entries
      WHERE profile_id = p_profile
        AND payout_period = p_period
        AND status IN ('accrued','payable')
        FOR UPDATE;

    SELECT COALESCE(SUM(amount_paise), 0), COUNT(*)
      INTO v_total, v_count
      FROM public.commission_entries
     WHERE profile_id = p_profile
       AND payout_period = p_period
       AND status IN ('accrued','payable');

    IF v_count = 0 OR v_total <= 0 THEN
        RAISE EXCEPTION 'nothing_payable';
    END IF;
    IF v_total <> p_expected_paise THEN
        RAISE EXCEPTION 'stale';
    END IF;

    INSERT INTO public.telecaller_payouts
        (profile_id, payout_period, amount_paise, entry_count, method, reference_no, note, paid_by)
    VALUES
        (p_profile, p_period, v_total, v_count, p_method, NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_note), ''), p_paid_by)
    RETURNING id INTO v_id;

    UPDATE public.commission_entries
       SET status = 'paid', paid_at = now(), payout_id = v_id
     WHERE profile_id = p_profile
       AND payout_period = p_period
       AND status IN ('accrued','payable');

    RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pay_telecaller_period(uuid, text, int, text, text, text, uuid)
    FROM public, anon, authenticated;

COMMENT ON FUNCTION public.pay_telecaller_period(uuid, text, int, text, text, text, uuid) IS
    'Settles one telecaller-month atomically (migration 043). Raises period_locked | nothing_payable | stale. Service role only, via POST /api/admin/commissions/pay.';


-- ─────────────────────────────────────────────────────────────
-- first_deal uniqueness: per BENEFICIARY, positive rows only
-- ─────────────────────────────────────────────────────────────
-- Migration 019 made first_deal unique per SUBSCRIPTION. With agent AND
-- telecaller both earning on one sale, the second beneficiary's first
-- deal hit 23505 and was silently skipped (the reconciler treats 23505
-- as "another run claimed it") — the telecaller's ₹80 would vanish. It
-- also blocked first_deal clawback reversals (negative rows of the same
-- kind). The invariant that matters is: each beneficiary earns a
-- subscription's first deal exactly once.
DROP INDEX IF EXISTS public.commission_entries_first_deal_once;
CREATE UNIQUE INDEX IF NOT EXISTS commission_entries_first_deal_once_per_beneficiary
    ON public.commission_entries (subscription_id, agent_id, profile_id)
    NULLS NOT DISTINCT
    WHERE kind = 'first_deal' AND amount_paise > 0;
