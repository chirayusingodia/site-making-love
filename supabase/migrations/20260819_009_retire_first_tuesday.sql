-- =============================================================
-- PUNYATA — Retire the 'first_tuesday' batch_type entirely
-- Project  : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch   : Staging
-- Depends  : 20260819_008_list_a_second_tuesday.sql (must be applied)
-- Created  : 2026-08-19
-- =============================================================
--
-- WHY THIS EXISTS
--   Migration 008 widened batch_type to three values and kept
--   'first_tuesday' valid so that batches generated before the List A
--   shift would stay readable. That protection is unnecessary: the site
--   is still under construction — no live audience, no subscribers, and
--   sankalp_batches is empty. There are no historical rows to preserve,
--   so 'first_tuesday' is dead weight and is retired here.
--
-- WHAT CHANGES
--   batch_type CHECK narrows from three values to two:
--     ('first_tuesday', 'second_tuesday', 'last_saturday')
--   → ('second_tuesday', 'last_saturday')
--
-- WHAT DOES NOT CHANGE
--   * List B — 'last_saturday' — untouched, still valid.
--   * seva_schedule_rules — already set to 'second' by migration 008;
--     this file does not touch that table.
--   * The twice-a-month cadence and plan_sevas composition.
--
-- SAFETY
--   The guard below aborts the migration if any 'first_tuesday' row
--   exists, rather than silently deleting data. If it ever fires, decide
--   deliberately what to do with those rows before re-running — do not
--   just remove the guard.
--
-- IDEMPOTENT: safe to re-run. The constraint is dropped IF EXISTS before
-- being re-added, and the guard passes when the count is zero.
-- =============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Guard — refuse to run if any legacy row is present
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
    legacy_count integer;
BEGIN
    SELECT count(*) INTO legacy_count
      FROM public.sankalp_batches
     WHERE batch_type = 'first_tuesday';

    IF legacy_count > 0 THEN
        RAISE EXCEPTION
            'Aborting: % row(s) in sankalp_batches still use batch_type=''first_tuesday''. '
            'Narrowing the CHECK constraint would make them invalid. Decide how to handle '
            'these rows before re-running this migration.', legacy_count;
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. Narrow the CHECK constraint to the two live values
-- ─────────────────────────────────────────────────────────────
--
-- batch_type is a text column with a CHECK constraint (not a Postgres
-- enum), so this is a drop-and-re-add. No row data is read or written:
-- this file contains no UPDATE, DELETE, INSERT, or TRUNCATE against
-- sankalp_batches.
--
-- [BL-1] List A and List B batches remain fully independent rows.

ALTER TABLE public.sankalp_batches
    DROP CONSTRAINT IF EXISTS sankalp_batches_batch_type_check;

ALTER TABLE public.sankalp_batches
    ADD CONSTRAINT sankalp_batches_batch_type_check
    CHECK (batch_type IN ('second_tuesday', 'last_saturday'));

COMMENT ON COLUMN public.sankalp_batches.batch_type IS
    'List A / List B discriminator. ''second_tuesday'' = List A (all active '
    'subscribers, second Tuesday of the month). ''last_saturday'' = List B '
    '(hawan-plan subscribers, last Saturday). The former ''first_tuesday'' '
    'value is retired and no longer permitted.';

COMMIT;

-- =============================================================
-- DOWN MIGRATION (restores the three-value constraint)
-- =============================================================
--
-- Non-destructive: widening a CHECK constraint cannot invalidate
-- existing rows, so no DELETE is needed. Uncomment and run only if you
-- deliberately need 'first_tuesday' accepted again.
--
-- BEGIN;
--
-- ALTER TABLE public.sankalp_batches
--     DROP CONSTRAINT IF EXISTS sankalp_batches_batch_type_check;
-- ALTER TABLE public.sankalp_batches
--     ADD CONSTRAINT sankalp_batches_batch_type_check
--     CHECK (batch_type IN ('first_tuesday', 'second_tuesday', 'last_saturday'));
--
-- COMMIT;
