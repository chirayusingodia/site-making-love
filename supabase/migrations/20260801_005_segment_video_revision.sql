-- =============================================================
-- PUNYATA — Session 4 (revision): Single Combined Segment Video
-- Project  : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch   : Staging
-- Depends  : 20260801_004_session4_proof_delivery.sql
-- Created  : 2026-08-01
-- =============================================================
--
-- WHAT CHANGES (supersedes the two-asset / two-message model):
--
-- [REV-1] ONE combined video per segment — the externally-edited
--         video already contains that segment's sevas PLUS the
--         name-reading for just that segment's families. The old
--         "common batch-wide footage" asset no longer exists.
--
-- [REV-2] Delivery = ONE WhatsApp message per subscriber (their
--         segment's video). proof_deliveries.message_kind is now
--         'segment' only; legacy 'common' rows are removed.
--
-- [REV-3] Segments are TIER-PURE (hard constraint, enforced in
--         application logic): 5 SUBSCRIPTIONS per segment, all
--         sharing the same resolved seva signature for that batch
--         variant. Up to 20 NAMES per segment (5 × 4 members).
--
-- [REV-4] seva_proofs is DEPRECATED for new uploads. No columns
--         are dropped and no existing rows are touched — the table
--         remains for backward compatibility with rows written
--         during the first Session 4 pass (and any subscriber-
--         facing gallery built against them). New proof media
--         lives ONLY in name_segments.video_url.
--
-- [BL-1] Tuesday/Saturday batch independence is UNCHANGED.
-- [BL-2] Status vocabulary UNCHANGED: pending | done | missed.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. [REV-2] proof_deliveries — single message kind
-- ─────────────────────────────────────────────────────────────
--
-- Remove legacy 'common'-message rows from the superseded model,
-- then tighten the CHECK to the only remaining kind. The UNIQUE
-- (batch_id, subscription_id, message_kind) is unchanged — with a
-- single kind it now guarantees exactly ONE message row per
-- subscriber per batch.

DELETE FROM public.proof_deliveries WHERE message_kind = 'common';

ALTER TABLE public.proof_deliveries
    DROP CONSTRAINT IF EXISTS proof_deliveries_message_kind_check;

ALTER TABLE public.proof_deliveries
    ADD CONSTRAINT proof_deliveries_message_kind_check
    CHECK (message_kind IN ('segment'));

COMMENT ON TABLE public.proof_deliveries IS
    'One WhatsApp message per subscriber per batch, referencing the subscriber''s segment combined video (name_segments). wa.me stub period: wa_link pre-filled, whatsapp_msg_id NULL until Meta Cloud API. Manual-bypass rows have wa_link NULL and no stored media — they must NOT surface in the subscriber Punya Bank gallery.';

COMMENT ON COLUMN public.proof_deliveries.message_kind IS
    'Always ''segment'' (revision 005): the single combined segment video. Legacy ''common'' batch-footage messages no longer exist.';


-- ─────────────────────────────────────────────────────────────
-- 2. [REV-1][REV-3] name_segments — repurposed (comments only)
-- ─────────────────────────────────────────────────────────────
-- No structural change: (batch_id, segment_number, video_url)
-- already fits "one combined video per tier-pure group of 5
-- subscriptions." Comments updated so no one assumes naam-only.

COMMENT ON TABLE public.name_segments IS
    'One COMBINED proof video per tier-pure segment within a batch: the externally-edited video containing that segment''s sevas + name-reading for its families. Tier purity + size (5 subscriptions / max 20 names) enforced by application logic via sankalp_batch_subscriptions.segment_number. NOT a naam-only clip.';

COMMENT ON COLUMN public.name_segments.video_url IS
    'Cloudinary URL of the single combined segment video (sevas + name-reading). Path: punyata-proofs/{year}-{month}/{batch_type}/segments/segment-{n}/';


-- ─────────────────────────────────────────────────────────────
-- 3. [REV-4] seva_proofs — deprecated for new writes (comment)
-- ─────────────────────────────────────────────────────────────
-- Table and existing rows preserved. RLS unchanged. No new rows
-- are written by the proof-upload flow after revision 005.

COMMENT ON TABLE public.seva_proofs IS
    'DEPRECATED for new uploads (revision 005): formerly held the batch-wide "common footage" video. New proof media lives in name_segments.video_url (one combined video per tier-pure segment). Table + rows retained for backward compatibility; RLS unchanged; do not write new rows from the proof-upload flow.';

-- ═════════════════════════════════════════════════════════════
-- END OF MIGRATION 20260801_005_segment_video_revision
-- ═════════════════════════════════════════════════════════════
