-- =============================================================
-- PUNYATA — Retire sankalp_variant: ONE batch per (kind, date)
-- Project  : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch   : Staging
-- Depends  : 20260725_002_batch_tracking.sql (created the column)
--            20260819_009_retire_first_tuesday.sql
-- Created  : 2026-08-19
-- =============================================================
--
-- WHY THIS EXISTS
--   sankalp_variant split every Last Saturday into TWO batch rows:
--   'hawan_only' (Sarv Rog Nivaran Hawan alone) and 'full_package'
--   (the full seva set). That split was never a business rule — no
--   plan grants a hawan WITHOUT the rest of its sevas, and Master
--   Context v3 mentions the values only in a schema comment.
--
--   Worse, it was actively wrong. generate-batch computed the member
--   set ONCE for kind='last_saturday' and inserted those same rows
--   into BOTH batches (computeBatchMembership even documented the two
--   variants as sharing one member set). So every List B subscriber
--   was enrolled twice on the same date: two pandit list entries, two
--   proof videos, and subscriber_count double-counted in reports.
--
--   With the split gone the column would hold the single constant
--   value 'full_package' on every Last Saturday row and NULL on every
--   Second Tuesday row — no information. (batch_type, batch_date)
--   already identifies a batch, so the column is dropped.
--
-- WHAT CHANGES
--   * sankalp_variant column DROPPED from sankalp_batches, along with
--     its CHECK constraint (dropped implicitly with the column).
--   * A UNIQUE constraint on (batch_type, batch_date) is added, so the
--     duplicate-row class of bug cannot recur at the DB level.
--
-- WHAT DOES NOT CHANGE
--   * batch_type — still 'second_tuesday' | 'last_saturday'. [BL-1]
--     Tuesday and Saturday batches remain fully independent rows.
--   * The twice-a-month cadence, plan_sevas composition, and
--     seva_schedule_rules. None are referenced here.
--   * sankalp_batch_subscriptions, including is_catchup — the Basic
--     late-joiner catch-up rule is unaffected.
--   * status vocabulary: pending / done / missed. [BL-2]
--
-- SAFETY
--   The guard below aborts if more than one batch row exists for any
--   (batch_type, batch_date) pair, rather than letting the UNIQUE
--   constraint fail with an opaque error. If it fires, those are the
--   duplicate List B rows described above: decide which to keep (the
--   one whose members have proofs) and delete the other before
--   re-running. The site is pre-launch with an empty
--   sankalp_batches, so the guard is expected to pass trivially.
--
--   This file contains NO UPDATE, DELETE, INSERT or TRUNCATE against
--   any table.
--
-- IDEMPOTENT: safe to re-run. Both DDL statements use IF EXISTS /
-- IF NOT EXISTS forms and the guard passes when no duplicates exist.
-- =============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Guard — refuse to run while duplicate (type, date) rows exist
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
    dup_count integer;
BEGIN
    SELECT count(*) INTO dup_count
      FROM (
        SELECT batch_type, batch_date
          FROM public.sankalp_batches
         GROUP BY batch_type, batch_date
        HAVING count(*) > 1
      ) d;

    IF dup_count > 0 THEN
        RAISE EXCEPTION
            'Aborting: % (batch_type, batch_date) pair(s) have more than one row. '
            'These are the duplicate hawan_only/full_package Last Saturday rows. '
            'Keep the row whose members carry proofs, delete the other, then '
            're-run this migration.', dup_count;
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. Drop the column (its CHECK constraint goes with it)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.sankalp_batches
    DROP COLUMN IF EXISTS sankalp_variant;

-- ─────────────────────────────────────────────────────────────
-- 3. Enforce one batch per (kind, date) at the DB level
-- ─────────────────────────────────────────────────────────────
--
-- generate-batch already looks up an existing row by exactly this
-- pair and refreshes it rather than inserting a second one; this
-- constraint makes that invariant structural instead of conventional.

CREATE UNIQUE INDEX IF NOT EXISTS sankalp_batches_type_date_uniq
    ON public.sankalp_batches (batch_type, batch_date);

COMMENT ON TABLE public.sankalp_batches IS
    'One row per sankalp day: (batch_type, batch_date) is unique. '
    'batch_type ''second_tuesday'' = List A (all active subscribers), '
    '''last_saturday'' = List B (hawan-plan subscribers, plus one-time '
    'catch-up joiners flagged on sankalp_batch_subscriptions.is_catchup). '
    'The retired sankalp_variant column once split List B into '
    '''hawan_only'' and ''full_package'' rows over an identical member '
    'set, double-enrolling every subscriber; do not reintroduce it.';

COMMIT;

-- =============================================================
-- DOWN MIGRATION (run manually if reverting)
-- =============================================================
--
-- Restores the column and its CHECK, and drops the uniqueness rule.
-- Non-destructive: the column comes back NULL on every existing row,
-- which the CHECK permits. It does NOT recreate the duplicate List B
-- rows — regenerate those from the app if you truly need them back.
--
-- BEGIN;
--
-- DROP INDEX IF EXISTS public.sankalp_batches_type_date_uniq;
--
-- ALTER TABLE public.sankalp_batches
--     ADD COLUMN IF NOT EXISTS sankalp_variant text
--         CHECK (
--             sankalp_variant IS NULL
--             OR sankalp_variant IN ('hawan_only', 'full_package')
--         );
--
-- COMMIT;
