-- =============================================================
-- PUNYATA — Session Part B: Leads, Attribution & Commission Engine
-- Project  : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch   : Staging
-- Depends  : 20260822_012_telecaller_role.sql
-- Created  : 2026-08-22
-- =============================================================
--
-- PURPOSE (Part B of the telecaller session):
--   1. The lead pipeline — field agents hand ~10 numbers/day to the
--      telecaller; owner/admin upload and assign them (§8).
--   2. Two-party attribution — sourcing agent (existing
--      subscriptions.sales_agent_id) and closing telecaller (NEW
--      subscriptions.telecaller_id) earn INDEPENDENTLY from separate
--      pools. Never overwrite one with the other (§9).
--   3. The commission ledger — 20% first deal (FIXED system constant,
--      not per-person) + per-month trail at a rate RESOLVED PER PAYOUT
--      MONTH from staff_commission_rates history (§10).
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--   - NO backfill of commission_entries for historical payments.
--     Pre-launch sales have no attribution and inventing it would be
--     fabricating payouts. If Chirayu ever wants historical commission,
--     that is a manual, owner-signed exercise — not a migration.
--   - NO first-deal rates anywhere in staff_commission_rates. That
--     table is trail-only by CHECK; the first-deal bonus is the fixed
--     constant FIRST_DEAL_PERCENT = 20 in application code (§10.2).
--   - Does NOT drop sales_agents.commission_percent — it is COMMENTed
--     as legacy-do-not-read after its values are migrated into the
--     opening rate rows below.
--   - Does NOT touch is_admin() or any existing policy. New tables get
--     exactly ONE policy each (admin read/write); telecallers reach
--     their OWN commission rows only through /api/telecaller/earnings.
--   - Requires Postgres 15+ (Supabase default) for UNIQUE NULLS NOT
--     DISTINCT on commission_entries — that is what makes regeneration
--     idempotent even though beneficiary ids are nullable.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. subscriptions — closing-telecaller attribution columns
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS telecaller_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS attribution_source text,
    ADD COLUMN IF NOT EXISTS attributed_at      timestamptz;

-- 'manual' exists only for the owner's write-once override endpoint;
-- nothing else may write it (§9.2).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.subscriptions'::regclass
          AND conname = 'subscriptions_attribution_source_check'
    ) THEN
        ALTER TABLE public.subscriptions
            ADD CONSTRAINT subscriptions_attribution_source_check
            CHECK (attribution_source IS NULL OR attribution_source IN (
                'token', 'call_window', 'agent_referral', 'organic', 'manual'
            ));
    END IF;
END $$;

COMMENT ON COLUMN public.subscriptions.telecaller_id IS
    'Closing telecaller (auth.users id). Independent of sales_agent_id — different roles, separate commission pools (§9). Written once at first activation by the reconciler; changes are owner-only and audited.';
COMMENT ON COLUMN public.subscriptions.attribution_source IS
    'How attribution was established (§9.1): token | call_window | agent_referral | organic | manual. NULL = never reconciled, treated as organic.';
COMMENT ON COLUMN public.subscriptions.attributed_at IS
    'When attribution was resolved (first successful activation).';

CREATE INDEX IF NOT EXISTS idx_subscriptions_telecaller_id
    ON public.subscriptions (telecaller_id);


-- ─────────────────────────────────────────────────────────────
-- 2. leads — the pipeline table (§8.1)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leads (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name          text,
    phone              text NOT NULL,   -- stored E.164, normalized via normalizePhoneE164() BEFORE insert
    city               text,
    notes              text,            -- what the field agent scribbled
    interested_plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,

    source_agent_id    uuid REFERENCES public.sales_agents(id) ON DELETE SET NULL,
    assigned_to        uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- the telecaller
    assigned_on        date,

    status             text NOT NULL DEFAULT 'new' CHECK (status IN (
                           'new','assigned','in_progress','link_sent',
                           'converted','not_interested','unreachable',
                           'wrong_number','duplicate','expired'
                       )),
    profile_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,     -- set on first contact
    subscription_id    uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL, -- set on conversion
    converted_at       timestamptz,
    attribution_token  text UNIQUE,    -- rides on the payment link (§9)

    created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    -- Dedupe discipline is enforced AT UPLOAD (application code marks
    -- the row 'duplicate' and shows why) — a DB-level unique on phone
    -- would block legitimate re-contact months later, so it lives here
    -- only as an index, not a constraint.
    CONSTRAINT leads_status_open_check CHECK (
        status NOT IN ('converted') OR subscription_id IS NOT NULL
    )
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads: admin full access"
    ON public.leads FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_leads_assigned
    ON public.leads (assigned_to, assigned_on);
CREATE INDEX IF NOT EXISTS idx_leads_status
    ON public.leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_phone
    ON public.leads (phone);
-- Queue-0 sweep support: open leads older than N days.
CREATE INDEX IF NOT EXISTS idx_leads_created_at
    ON public.leads (created_at);

COMMENT ON TABLE public.leads IS
    'Field-agent lead list (Part B §8). Uploaded by owner/admin on the agent''s behalf; assigned to telecallers in daily batches. Telecallers reach ONLY their own assigned rows through /api/telecaller/* — there is deliberately no telecaller RLS policy here.';


-- Deferred FK from migration 012: call_logs.lead_id → leads(id).
ALTER TABLE public.call_logs
    DROP CONSTRAINT IF EXISTS call_logs_lead_id_fkey;
ALTER TABLE public.call_logs
    ADD CONSTRAINT call_logs_lead_id_fkey
    FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


-- ─────────────────────────────────────────────────────────────
-- 3. staff_commission_rates — TRAIL rate history (§10.3)
-- ─────────────────────────────────────────────────────────────
-- One row per (person, effective period). There is deliberately NO
-- first-deal row type: the first-deal bonus is the fixed constant
-- FIRST_DEAL_PERCENT = 20 and is not per-person (§10.1/§10.2).

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.staff_commission_rates (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id       uuid REFERENCES public.sales_agents(id) ON DELETE CASCADE,
    profile_id     uuid REFERENCES public.profiles(id)     ON DELETE CASCADE,
    kind           text NOT NULL DEFAULT 'trail' CHECK (kind = 'trail'),
    percent        numeric(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 25),
    effective_from date NOT NULL,
    effective_to   date,                     -- NULL = current
    set_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    reason         text,                     -- 'promotion', 'correction', 'opening'
    created_at     timestamptz NOT NULL DEFAULT now(),

    -- Exactly one beneficiary dimension.
    CONSTRAINT staff_commission_rates_person_check CHECK (
        (agent_id IS NULL) <> (profile_id IS NULL)
    ),

    -- No overlapping periods per person. btree_gist lets us mix =
    -- (coalesced identity) with && (range overlap) in one GiST index.
    -- effective_to IS NULL opens an unbounded range = "current".
    CONSTRAINT staff_commission_rates_no_overlap
        EXCLUDE USING gist (
            (COALESCE(agent_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
            (COALESCE(profile_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
            daterange(effective_from, effective_to, '[)') WITH &&
        )
);

ALTER TABLE public.staff_commission_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_commission_rates: admin full access"
    ON public.staff_commission_rates FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.staff_commission_rates IS
    'TRAIL rate history (§10.2). Resolved PER PAYOUT MONTH — promotion lifts the whole existing book forward; already-locked past months never change. NEVER store a single mutable percent on the person and read it at payout time.';

-- Legacy column: kept so old queries don't break, dead for reads.
COMMENT ON COLUMN public.sales_agents.commission_percent IS
    'LEGACY — do not read (migration 013). Trail rates live in staff_commission_rates, resolved per payout month. This column was migrated into the opening rate rows and is retained only for backward compatibility.';


-- ─────────────────────────────────────────────────────────────
-- 4. commission_entries — the immutable ledger (§10.3)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.commission_entries (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id  uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE RESTRICT,
    payment_id       uuid NOT NULL REFERENCES public.payments(id)      ON DELETE RESTRICT,
    agent_id         uuid REFERENCES public.sales_agents(id) ON DELETE RESTRICT,
    profile_id       uuid REFERENCES public.profiles(id)     ON DELETE RESTRICT,
    kind             text NOT NULL CHECK (kind IN ('first_deal','trail')),
    percent_applied  numeric(5,2) NOT NULL,
    base_paise       int NOT NULL,           -- what the % was applied to
    amount_paise     int NOT NULL,           -- the earning itself (negative = clawback reversal)
    payout_period    text NOT NULL CHECK (payout_period ~ '^[0-9]{4}-[0-9]{2}$'),
    status           text NOT NULL DEFAULT 'accrued' CHECK (status IN (
                         'accrued','held','payable','paid','clawed_back','void'
                     )),
    paid_at          timestamptz,
    note             text,
    created_at       timestamptz NOT NULL DEFAULT now(),

    -- Exactly one beneficiary dimension.
    CONSTRAINT commission_entries_person_check CHECK (
        (agent_id IS NULL) <> (profile_id IS NULL)
    ),
    -- A reversal carries a negative amount; ordinary entries cannot.
    CONSTRAINT commission_entries_amount_sign_check CHECK (amount_paise <> 0),
    -- Paid rows must carry when.
    CONSTRAINT commission_entries_paid_at_check CHECK (
        (status = 'paid') = (paid_at IS NOT NULL)
    )
);

-- Idempotent regeneration (reconciler can run twice freely). NULLS
-- NOT DISTINCT (PG15+) is what makes agent-entries (profile NULL)
-- dedupe against each other. Clawback reversals are EXEMPT via the
-- partial predicate — they must always be appendable (§10.5), even
-- against the same tuple as the original entry in the same period.
CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_entries_regenerated
    ON public.commission_entries (payment_id, agent_id, profile_id, kind, payout_period)
    NULLS NOT DISTINCT
    WHERE amount_paise > 0;

-- H4 (REVIEW): the exemption above means a naive reconciler would
-- insert a DUPLICATE reversal on every run — a nightly cron turns one
-- refund into thirty negative entries a month. This twin index makes
-- REVERSALS idempotent per (payment, beneficiary, kind, period) too:
-- one refund, one reversal row, forever.
CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_entries_reversals
    ON public.commission_entries (payment_id, agent_id, profile_id, kind, payout_period)
    NULLS NOT DISTINCT
    WHERE amount_paise < 0;

ALTER TABLE public.commission_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commission_entries: admin full access"
    ON public.commission_entries FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_commission_entries_beneficiary
    ON public.commission_entries (agent_id, payout_period);
CREATE INDEX IF NOT EXISTS idx_commission_entries_beneficiary_profile
    ON public.commission_entries (profile_id, payout_period);
CREATE INDEX IF NOT EXISTS idx_commission_entries_payment
    ON public.commission_entries (payment_id);

COMMENT ON TABLE public.commission_entries IS
    'Append-only commission ledger (§10). One row per (payment, beneficiary, kind, period). percent_applied/base_paise are stored on every row so a 2026 entry stays explainable in 2029 even if constants change. Reversals are NEW negative rows — the original is never edited or deleted.';


-- ─────────────────────────────────────────────────────────────
-- 5. commission_payout_periods — locked months (§10.3/§10.5)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.commission_payout_periods (
    period      text PRIMARY KEY,            -- 'YYYY-MM'
    locked_at   timestamptz,
    locked_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    note        text,
    CONSTRAINT commission_payout_periods_format_check
        CHECK (period ~ '^[0-9]{4}-[0-9]{2}$')
);

ALTER TABLE public.commission_payout_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commission_payout_periods: admin full access"
    ON public.commission_payout_periods FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.commission_payout_periods IS
    'Payout months. locked_at IS NULL = still open. After locking, no entry in that period may be created, edited or reversed — corrections go to the current open period with a note (§10.5).';


-- ─────────────────────────────────────────────────────────────
-- 5b. H7 (REVIEW): make the ledger invariants STRUCTURAL, not
--     endpoint-memory. Until now the append-only guarantee and the
--     lock both rested on one route remembering to check.
--
--   • DELETE: never. The ledger is append-only, full stop.
--   • INSERT into a LOCKED period: rejected outright.
--   • UPDATE touching a row IN a locked period (or moving a row INTO
--     one): rejected — corrections go to the current OPEN period.
--   • UPDATE of immutable columns (subscription/payment/beneficiary/
--     kind/percent/base/amount/payout_period): rejected ALWAYS.
--     Allowed mutations are exactly: status transitions, paid_at,
--     note — e.g. held → payable → paid, and the same-open-period
--     clawback flip.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.commission_entries_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'commission_entries is append-only: DELETE denied';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF EXISTS (
            SELECT 1 FROM public.commission_payout_periods
             WHERE period = NEW.payout_period AND locked_at IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'payout period % is locked: no new entries', NEW.payout_period;
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE: immutable core can never change…
    IF OLD.subscription_id IS DISTINCT FROM NEW.subscription_id
        OR OLD.payment_id    IS DISTINCT FROM NEW.payment_id
        OR OLD.agent_id      IS DISTINCT FROM NEW.agent_id
        OR OLD.profile_id    IS DISTINCT FROM NEW.profile_id
        OR OLD.kind          IS DISTINCT FROM NEW.kind
        OR OLD.percent_applied IS DISTINCT FROM NEW.percent_applied
        OR OLD.base_paise    IS DISTINCT FROM NEW.base_paise
        OR OLD.amount_paise  IS DISTINCT FROM NEW.amount_paise
        OR OLD.payout_period IS DISTINCT FROM NEW.payout_period
    THEN
        RAISE EXCEPTION 'commission_entries is append-only: immutable columns cannot change (entry %)', OLD.id;
    END IF;

    -- …and a row in a locked month is frozen entirely (status included).
    IF EXISTS (
        SELECT 1 FROM public.commission_payout_periods
         WHERE period IN (OLD.payout_period, NEW.payout_period)
           AND locked_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'payout period % is locked: entries frozen', OLD.payout_period;
    END IF;

    RETURN NEW;
END;
$$;

-- C1 discipline applies here too: the trigger fires as its owner for
-- any writer, but the FUNCTION itself must not be callable via RPC.
REVOKE EXECUTE ON FUNCTION public.commission_entries_guard()
    FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_commission_entries_guard ON public.commission_entries;
CREATE TRIGGER trg_commission_entries_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.commission_entries
    FOR EACH ROW EXECUTE FUNCTION public.commission_entries_guard();


-- ─────────────────────────────────────────────────────────────
-- 6. Transactional lead assignment — SKIP LOCKED (§8.2)
-- ─────────────────────────────────────────────────────────────
-- Supabase-js cannot express FOR UPDATE SKIP LOCKED, so assignment
-- runs through this SECURITY DEFINER function. Two admins clicking
-- simultaneously claim DISJOINT sets; neither blocks the other.

CREATE OR REPLACE FUNCTION public.assign_leads(p_telecaller uuid, p_count int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    claimed int;
BEGIN
    WITH candidates AS (
        SELECT id
          FROM public.leads
         WHERE assigned_to IS NULL
           AND status = 'new'
         ORDER BY created_at
         LIMIT GREATEST(1, LEAST(p_count, 200))
         FOR UPDATE SKIP LOCKED
    )
    UPDATE public.leads l
       SET assigned_to   = p_telecaller,
           assigned_on   = CURRENT_DATE,
           status        = 'assigned',
           updated_at    = now()
      FROM candidates c
     WHERE l.id = c.id;

    GET DIAGNOSTICS claimed = ROW_COUNT;
    RETURN claimed;
END;
$$;

-- ── C1 (REVIEW_TELECALLER_SESSION.md): SECURITY DEFINER + default
-- PUBLIC EXECUTE + PostgREST /rest/v1/rpc/* = any logged-in subscriber
-- could self-assign the entire leads table (names + phones) and read
-- it back through a legitimate queue endpoint. The RLS policy is
-- bypassed by DEFINER semantics; the API gate never sees these calls.
-- Only the service-role connection (owner of these functions) may run them.
REVOKE EXECUTE ON FUNCTION public.assign_leads(uuid, int)
    FROM public, anon, authenticated;

COMMENT ON FUNCTION public.assign_leads(uuid, int) IS
    'Claims the oldest unassigned new leads for one telecaller (§8.2). Transactional + SKIP LOCKED: concurrent calls never hand the same lead twice. Returns the number claimed. EXECUTE revoked from public/anon/authenticated (C1) — callable only by the service role via POST /api/admin/leads/assign.';


-- ─────────────────────────────────────────────────────────────
-- 7. Rollover + expiry sweeps (§8.2)
-- ─────────────────────────────────────────────────────────────
-- Leads must not die in one person's tray, and a four-month-old
-- number is not a lead. Both sweepers log what they did.

CREATE OR REPLACE FUNCTION public.roll_over_stale_leads(p_days int DEFAULT 3)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    moved int;
BEGIN
    UPDATE public.leads l
       SET assigned_to = NULL,
           assigned_on = NULL,
           status      = 'new',
           updated_at  = now()
     WHERE l.status IN ('assigned', 'in_progress')
       AND l.assigned_on < CURRENT_DATE - p_days
       AND NOT EXISTS (
             SELECT 1 FROM public.call_logs cl WHERE cl.lead_id = l.id
           );
    GET DIAGNOSTICS moved = ROW_COUNT;

    INSERT INTO public.audit_logs (admin_id, action, entity, entity_id, meta)
    VALUES (NULL, 'leads_rollover_sweep', 'leads', NULL,
            jsonb_build_object('days', p_days, 'returned', moved));
    RETURN moved;
END;
$$;

-- C1: p_days=0 over this RPC would expire-flush the whole open
-- pipeline with an un-attributable NULL-admin audit row. Service role only.
REVOKE EXECUTE ON FUNCTION public.roll_over_stale_leads(int)
    FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.expire_stale_leads(p_days int DEFAULT 60)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    expired int;
BEGIN
    UPDATE public.leads l
       SET status     = 'expired',
           updated_at = now()
     WHERE l.status = 'new'
       AND l.created_at < now() - make_interval(days => p_days);
    GET DIAGNOSTICS expired = ROW_COUNT;

    INSERT INTO public.audit_logs (admin_id, action, entity, entity_id, meta)
    VALUES (NULL, 'leads_expiry_sweep', 'leads', NULL,
            jsonb_build_object('days', p_days, 'expired', expired));
    RETURN expired;
END;
$$;

-- C1: same RPC exposure as above — service role only.
REVOKE EXECUTE ON FUNCTION public.expire_stale_leads(int)
    FROM public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- C1 addendum — the project-wide SECURITY DEFINER audit this review
-- demanded. Every DEFINER function must carry an EXPLICIT decision:
--
--   assign_leads(uuid,int)      → REVOKED above
--   roll_over_stale_leads(int)  → REVOKED above
--   expire_stale_leads(int)     → REVOKED above
--   is_telecaller()             → REVOKED in migration 012 (unwired
--                                 primitive; nothing may call it yet)
--   is_admin()                  → deliberately KEPT granted to PUBLIC.
--     RLS policy expressions are evaluated with the INVOKER's
--     privileges, so all forty policies calling is_admin() require
--     EXECUTE for every authenticated role — revoking it would break
--     every subscriber read in the product. It is a pure boolean
--     predicate over profiles.role and leaks nothing beyond true/false.
--
-- Migration checklist gains a permanent line: "does every SECURITY
-- DEFINER function have an explicit GRANT or REVOKE?"
-- ─────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────
-- 8. Backfill — opening trail-rate rows from legacy agents
-- ─────────────────────────────────────────────────────────────
-- Each existing sales_agents row becomes the OPENING row of the new
-- rate history, carrying its current commission_percent. reason=
-- 'opening', effective_from = migration date. Idempotent: re-running
-- skips agents that already have an opening row.

INSERT INTO public.staff_commission_rates
       (agent_id, kind, percent, effective_from, reason)
SELECT sa.id, 'trail', sa.commission_percent, CURRENT_DATE, 'opening'
  FROM public.sales_agents sa
 WHERE sa.commission_percent BETWEEN 0 AND 25
   AND NOT EXISTS (
         SELECT 1 FROM public.staff_commission_rates scr
          WHERE scr.agent_id = sa.id AND scr.reason = 'opening'
       );


-- ─────────────────────────────────────────────────────────────
-- 9. Verification queries (run manually after applying)
-- ─────────────────────────────────────────────────────────────
-- New objects:
--   \d public.leads
--   \d public.staff_commission_rates
--   \d public.commission_entries
--   SELECT * FROM public.commission_payout_periods;
--
-- Opening backfill (one row per active agent):
--   SELECT sa.full_name, scr.percent, scr.effective_from
--     FROM public.staff_commission_rates scr
--     JOIN public.sales_agents sa ON sa.id = scr.agent_id
--    WHERE scr.reason = 'opening';
--
-- Overlap guard actually fires (expect an exclusion violation):
--   INSERT INTO public.staff_commission_rates
--     (agent_id, percent, effective_from, reason)
--   VALUES ('<an-agent-uuid>', 1, CURRENT_DATE, 'test');  -- then rollback
--
-- Assignment claims disjoint sets under concurrency:
--   SELECT public.assign_leads('<telecaller-uuid>', 10);  -- twice → second returns remaining count

-- ═════════════════════════════════════════════════════════════
-- END OF MIGRATION 20260822_013_leads_and_commissions
-- ═════════════════════════════════════════════════════════════
