-- =============================================================
-- PUNYATA — List A schedule shift: FIRST Tuesday → SECOND Tuesday
-- Project  : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch   : Staging
-- Depends  : 20260725_001_core_schema.sql   (seva_schedule_rules)
--            20260725_002_batch_tracking.sql (sankalp_batches)
-- Created  : 2026-08-19
-- =============================================================
--
-- WHAT CHANGES
--   List A (the all-subscribers sankalp) moves from the FIRST Tuesday
--   of the month to the SECOND Tuesday. Operational reasoning per
--   Master Context v3 Section 7: a one-week buffer after month-start
--   lets the active-subscriber list stabilise (failed payments retried,
--   early-month sign-ups settled) before the month's first sankalp.
--
-- WHAT DOES NOT CHANGE
--   * List B — Last Saturday — is untouched. No statement in this file
--     references weekday='SAT' or batch_type='last_saturday'.
--   * The twice-a-month cadence. This is a day-of-month shift only.
--   * Tier/seva composition (plan_sevas). Not referenced here.
--   * Existing sankalp_batches rows. This file contains NO UPDATE,
--     DELETE, or INSERT against sankalp_batches — only a CHECK
--     constraint widening. Historical batches keep batch_type
--     'first_tuesday' because that is what actually happened on
--     their date.
--
-- IDEMPOTENT: safe to re-run. The UPDATE is predicated on
-- occurrence='first', and the constraint is dropped IF EXISTS before
-- being re-added.
-- =============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. seva_schedule_rules — List A rules: 'first' → 'second'
-- ─────────────────────────────────────────────────────────────
--
-- Scoped by EXPLICIT seva_id, not a blanket weekday='TUE' predicate.
-- A bare (weekday='TUE' AND occurrence='first') filter happens to
-- select exactly List A today, but it would also capture any future
-- non-List-A Tuesday rule added before this migration runs. The five
-- seva_ids below are the complete, audited List A membership:
--
--   c1… Sundarkand Path
--   c2… Gau Seva
--   c3… Vanar Seva
--   c4… Saadhu Santo Ko Bhojan   (also has a separate SAT/'last' rule
--                                 for List B — NOT touched here, the
--                                 weekday='TUE' clause excludes it)
--   c5… Griha Shanti Hawan       (a TUESDAY hawan — distinct from
--                                 Sarv Rog Nivaran Hawan, which is
--                                 Saturday-only and is NOT listed)
--
-- Deliberately absent: c6… Sarv Rog Nivaran Hawan (SAT/'last' only).
--
-- The occurrence CHECK constraint from 20260725_001 already permits
-- 'second', so no constraint change is needed on this table.

UPDATE public.seva_schedule_rules
   SET occurrence = 'second'
 WHERE weekday    = 'TUE'
   AND occurrence = 'first'
   AND seva_id IN (
        'c1c1c1c1-0001-0001-0001-c1c1c1c1c1c1',  -- Sundarkand Path
        'c2c2c2c2-0002-0002-0002-c2c2c2c2c2c2',  -- Gau Seva
        'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',  -- Vanar Seva
        'c4c4c4c4-0004-0004-0004-c4c4c4c4c4c4',  -- Saadhu Santo Ko Bhojan
        'c5c5c5c5-0005-0005-0005-c5c5c5c5c5c5'   -- Griha Shanti Hawan (Tue)
   );

-- ─────────────────────────────────────────────────────────────
-- 2. sankalp_batches.batch_type — ADD 'second_tuesday'
-- ─────────────────────────────────────────────────────────────
--
-- batch_type is a text column with a CHECK constraint (not a Postgres
-- enum), so this is a drop-and-re-add of the constraint. No data is
-- read or written.
--
-- 'first_tuesday' is RETAINED INDEFINITELY as a valid value. It is not
-- renamed and not deprecated at the DB level: rows generated before
-- this shift must stay both readable and constraint-valid. Application
-- code writes ONLY 'second_tuesday' for new List A batches
-- (see GeneratableBatchKind in src/lib/sankalp-logic.ts).
--
-- [BL-1] still holds: List A and List B batches remain independent
-- rows. Widening this constraint creates no relationship between them.

ALTER TABLE public.sankalp_batches
    DROP CONSTRAINT IF EXISTS sankalp_batches_batch_type_check;

ALTER TABLE public.sankalp_batches
    ADD CONSTRAINT sankalp_batches_batch_type_check
    CHECK (batch_type IN ('first_tuesday', 'second_tuesday', 'last_saturday'));

COMMENT ON COLUMN public.sankalp_batches.batch_type IS
    'List A / List B discriminator. ''second_tuesday'' = current List A '
    '(all active subscribers). ''first_tuesday'' = legacy List A, retained '
    'indefinitely for rows generated before the Aug 2026 shift; never '
    'written by new code, never rewritten. ''last_saturday'' = List B '
    '(hawan-plan subscribers), unchanged by that shift.';

COMMIT;

-- =============================================================
-- DOWN MIGRATION (reverses both steps; run manually if reverting)
-- =============================================================
--
-- Step 2 is reverted FIRST: narrowing the CHECK while any
-- 'second_tuesday' row exists would fail. The DELETE is therefore
-- required — and it is why reverting is destructive. Those rows are
-- real List A batches generated on second Tuesdays; if any exist,
-- export them before running this.
--
-- BEGIN;
--
-- -- 2a. Remove rows carrying the value about to become invalid.
-- --     Membership rows cascade via ON DELETE CASCADE.
-- DELETE FROM public.sankalp_batches WHERE batch_type = 'second_tuesday';
--
-- -- 2b. Restore the original two-value constraint.
-- ALTER TABLE public.sankalp_batches
--     DROP CONSTRAINT IF EXISTS sankalp_batches_batch_type_check;
-- ALTER TABLE public.sankalp_batches
--     ADD CONSTRAINT sankalp_batches_batch_type_check
--     CHECK (batch_type IN ('first_tuesday', 'last_saturday'));
--
-- -- 1'. List A rules back to the FIRST Tuesday. Same explicit seva_id
-- --     scoping, so a genuinely-second-Tuesday rule added later by an
-- --     admin for some other seva is left alone.
-- UPDATE public.seva_schedule_rules
--    SET occurrence = 'first'
--  WHERE weekday    = 'TUE'
--    AND occurrence = 'second'
--    AND seva_id IN (
--         'c1c1c1c1-0001-0001-0001-c1c1c1c1c1c1',
--         'c2c2c2c2-0002-0002-0002-c2c2c2c2c2c2',
--         'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
--         'c4c4c4c4-0004-0004-0004-c4c4c4c4c4c4',
--         'c5c5c5c5-0005-0005-0005-c5c5c5c5c5c5'
--    );
--
-- COMMIT;
