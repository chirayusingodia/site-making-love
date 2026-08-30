-- =============================================================
-- PUNYATA — Free Sewa gate before "Aaj Ke Leads"
-- Depends  : 20260823_014_hospitals_perf.sql (free_pooja_at/by)
-- Created  : 2026-08-31
-- =============================================================
--
-- PURPOSE:
--   leads.free_pooja_at already records WHEN a telecaller confirmed
--   the field agent's "free sewa" promise (migration 014, §5), but
--   nothing gated on it — an agent-sourced lead landed straight in
--   the paid-conversion queue ("Aaj Ke Leads") whether or not the
--   free sewa had happened yet. This migration adds ONLY the batch
--   LABEL column; the actual gate is a query filter in application
--   code (loadTodaysLeads / loadFreeSewaPendingLeads), not a new
--   status or constraint here.
--
--   free_service_batch_cutoff is a pure LABEL for grouping/audit —
--   which of the alternating Second-Tuesday / Last-Saturday cutoffs
--   (see src/lib/sankalp-logic.ts, reused via nextBatchCutoff() in
--   telecaller-logic.ts) a lead's free-sewa call falls under. It is
--   NOT a visibility delay: telecallers must be able to work a
--   free-sewa call the moment a lead is uploaded, not wait for the
--   cutoff date to arrive.
-- =============================================================

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS free_service_batch_cutoff date;

COMMENT ON COLUMN public.leads.free_service_batch_cutoff IS
    'Which Second-Tuesday/Last-Saturday cutoff batch (nextBatchCutoff() at insert time) this agent-sourced lead''s free-sewa call belongs to. Label only — does not gate visibility. NULL for leads with no source_agent_id.';

CREATE INDEX IF NOT EXISTS idx_leads_free_service_batch
    ON public.leads (free_service_batch_cutoff)
    WHERE free_service_batch_cutoff IS NOT NULL;

-- ═════════════════════════════════════════════════════════════
-- END OF MIGRATION 20260831_028_free_sewa_gate
-- ═════════════════════════════════════════════════════════════
