-- =============================================================
-- PUNYATA — Ashirwad Patra (blessing certificate)
-- Project  : Punyata
-- Branch   : Staging
-- Depends  : 20260725_001_core_schema.sql (subscriptions, is_admin())
--            20260801_004_session4_proof_delivery.sql (batch model)
--            20260801_007_owner_rls_superset.sql (is_admin() covers owner)
-- Created  : 2026-09-02
-- =============================================================
--
-- WHAT THIS IS:
--   After a pooja batch is marked done, the system issues ONE
--   Ashirwad Patra per family unit (subscription) — a personalised
--   blessing certificate naming the WHOLE family (every family_members
--   name, including the extra names that are not website users), the
--   sevas performed that day, and the occasion. It is rendered
--   client-side to a fixed-size PNG (identical on every device),
--   stored on Cloudinary, shown to the devotee, and sent on WhatsApp
--   by the admin.
--
-- IMMUTABILITY:
--   The row is a SNAPSHOT — names / gotra / seva_names / occasion are
--   frozen at issue time. Editing family_members later never rewrites
--   an already-issued patra. This is deliberate and differs from the
--   "always live" Sankalp/Pandit lists: an issued certificate is a
--   historical document, not a live view.
--
-- STATUS: generated | delivered. No physical dispatch (digital only).
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. Serial sequence for the human-readable patra number
-- ─────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.ashirwad_patra_serial_seq;


-- ─────────────────────────────────────────────────────────────
-- 2. ashirwad_patras — one row per (batch, subscription)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ashirwad_patras (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    batch_id         uuid NOT NULL
                         REFERENCES public.sankalp_batches(id) ON DELETE CASCADE,
    subscription_id  uuid NOT NULL
                         REFERENCES public.subscriptions(id) ON DELETE CASCADE,

    -- Human-readable serial, e.g. AP-2026-000512. Assigned at insert
    -- from the sequence; year is the IST year at issue time.
    patra_no         text NOT NULL UNIQUE
                         DEFAULT (
                             'AP-'
                             || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY')
                             || '-'
                             || lpad(nextval('public.ashirwad_patra_serial_seq')::text, 6, '0')
                         ),

    -- ── SNAPSHOT payload (immutable once issued) ──
    names            jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ["श्री राहुल शर्मा", ...]
    gotra            text,
    seva_names       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ["सुन्दरकाण्ड पाठ", ...]
    batch_kind       text NOT NULL
                         CHECK (batch_kind IN ('second_tuesday', 'last_saturday')),
    batch_date       date NOT NULL,
    occasion_label   text NOT NULL,

    -- Rendered certificate image (Cloudinary secure_url). NULL until
    -- the admin renders + uploads it.
    image_url        text,

    status           text NOT NULL DEFAULT 'generated'
                         CHECK (status IN ('generated', 'delivered')),
    delivered_at     timestamptz,
    delivered_via    text,                                  -- e.g. 'whatsapp'

    created_at       timestamptz NOT NULL DEFAULT now(),

    -- One patra per family unit per batch → generation is idempotent.
    UNIQUE (batch_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_ashirwad_patras_batch
    ON public.ashirwad_patras (batch_id);

CREATE INDEX IF NOT EXISTS idx_ashirwad_patras_subscription
    ON public.ashirwad_patras (subscription_id);


-- ─────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────
-- Mirrors proof_deliveries: a user reads patras tied to their own
-- subscriptions; admin/owner (is_admin() → role IN ('admin','owner')
-- since migration 007) have full access.

ALTER TABLE public.ashirwad_patras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ashirwad_patras: user reads own"
    ON public.ashirwad_patras FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.subscriptions s
            WHERE s.id = subscription_id
              AND s.user_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY "ashirwad_patras: admin full access"
    ON public.ashirwad_patras FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ═════════════════════════════════════════════════════════════
-- END OF MIGRATION 20260902_031_ashirwad_patra
-- ═════════════════════════════════════════════════════════════
