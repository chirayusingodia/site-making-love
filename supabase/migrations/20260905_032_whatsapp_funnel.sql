-- =============================================================
-- PUNYATA — Session: WhatsApp Funnel (login, plan, payment link, delivery)
-- Project  : omjivlmfsikeqwndtlcn (Supabase "Punyata")
-- Branch   : Staging
-- Depends  : 20260902_031_ashirwad_patra.sql (latest prior migration)
-- Created  : 2026-09-05
-- =============================================================
--
-- See SESSION_WHATSAPP_FUNNEL_PROMPT.md §3 for the full rationale.
-- Three independent pieces:
--   1. subscriptions.delivery_phone — per-subscription WhatsApp
--      delivery target, separate from profiles.phone (login identity).
--   2. wa_messages — every inbound/outbound WhatsApp message, service-
--      role only, for audit + idempotent webhook processing.
--   3. notifications gains a delivery target + worker contract, so the
--      two existing write-only inserts finally get read and sent.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. subscriptions.delivery_phone (§3.1)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS delivery_phone text;

COMMENT ON COLUMN public.subscriptions.delivery_phone IS
    'WhatsApp number that receives the pooja video / Ashirwad Patra for THIS subscription. NULL = fall back to the account holder''s profiles.phone (existing behaviour).';


-- ─────────────────────────────────────────────────────────────
-- 2. wa_messages (§3.2) — service-role only, no telecaller/user grant
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_messages (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    direction     text NOT NULL CHECK (direction IN ('in','out')),
    wa_message_id text,                     -- Meta's id; NULL until send returns
    phone         text NOT NULL,            -- E.164, the customer's number
    profile_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    lead_id       uuid REFERENCES public.leads(id) ON DELETE SET NULL,
    kind          text NOT NULL,            -- 'template' | 'text' | 'flow_reply' | 'interactive'
    template_name text,
    body          text,
    payload       jsonb,                    -- raw provider payload, for reconstruction
    status        text NOT NULL DEFAULT 'received'
                      CHECK (status IN ('received','queued','sent','delivered','read','failed')),
    error         text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Idempotency guard: the provider redelivers webhooks, and a
-- redelivery must not create a second row (same discipline as the
-- Razorpay webhook's razorpay_payment_id upsert).
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_messages_wa_id
    ON public.wa_messages (wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_messages_phone   ON public.wa_messages (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_profile ON public.wa_messages (profile_id, created_at DESC);

-- Staff-only-by-service-role pattern (matches 012/013): RLS enabled,
-- zero permissive policies, and an explicit revoke for defense in
-- depth. anon/authenticated get nothing; access is only through
-- /api/telecaller/* and /api/admin/* behind the usual gates, using
-- the service-role client which bypasses RLS entirely.
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_messages FROM anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3. notifications — delivery target + worker contract (§3.3)
-- ─────────────────────────────────────────────────────────────
--
-- ⚠️ §0.1 of the spec's 2026-09-05 review caught this: notifications
-- (core schema 20260725_001, cols: id, user_id, type, channel,
-- message, status, meta, sent_at) has NO created_at/updated_at, and
-- its status CHECK only allows ('pending','sent','failed') — no
-- 'sending'. Without the two ALTERs below, the pending index two
-- statements down fails with 42703 (column "created_at" does not
-- exist), and because Supabase's SQL Editor runs a pasted script as
-- one implicit transaction, that single failure rolls back the WHOLE
-- of this migration — delivery_phone, wa_messages, all of it. Same
-- failure mode that bit migration 014. These two ALTERs MUST run
-- before the index statement.
ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- Backfilling created_at = now() on pre-existing rows is historically
-- wrong but harmless — none of those rows were ever delivered (the
-- §10.3 write-only bug), and the worker only orders PENDING rows by it.

-- Widen status to allow the worker's claimed/in-flight state.
-- notifications_status_check is the auto-generated constraint name
-- from the core schema's inline CHECK — confirm with:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.notifications'::regclass AND contype = 'c';
-- before relying on it in a differently-named environment.
ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_status_check
    CHECK (status IN ('pending','sending','sent','failed'));

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS to_phone      text,
    ADD COLUMN IF NOT EXISTS template_name text,
    ADD COLUMN IF NOT EXISTS template_vars jsonb,
    ADD COLUMN IF NOT EXISTS attempts      int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_error    text;
    -- sent_at already exists in core schema 001 — not re-added here.

COMMENT ON COLUMN public.notifications.to_phone IS
    'Explicit send target. NULL means "resolve at send time": subscription.delivery_phone in meta, else profiles.phone of user_id — see send-notifications worker.';

-- notifications.type has no CHECK (free text: payment_link_sent,
-- proof_resend_request, and one value from reissue-link.ts already
-- exist) — keep new types in the same snake_case style, don't add a
-- CHECK here (it would need a migration per new message type).

CREATE INDEX IF NOT EXISTS idx_notifications_pending
    ON public.notifications (status, created_at) WHERE status = 'pending';

-- Do not widen any existing notifications RLS policy (§3.5) — these
-- new columns are read/written only by the service-role worker and
-- the existing insert call sites, none of which change grants.


-- ─────────────────────────────────────────────────────────────
-- 4. WhatsApp consent (§3.4) — missing entirely before this session
-- ─────────────────────────────────────────────────────────────
-- No table/column anywhere records whether a customer agreed to be
-- messaged on WhatsApp, and nothing handles a STOP reply. Hospital-
-- sourced leads (a field agent hands us a phone number) have NOT
-- opted in. Sending business-initiated templates to un-consented
-- numbers drives block/report rates, which is what Meta uses to set
-- the WABA's quality rating — a degraded rating cuts the daily send
-- limit for EVERY subscriber, not just new ones.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS wa_opt_in_at     timestamptz,
    ADD COLUMN IF NOT EXISTS wa_opt_in_source text,   -- 'telecall' | 'website' | 'inbound_message'
    ADD COLUMN IF NOT EXISTS wa_opt_out_at    timestamptz;

COMMENT ON COLUMN public.profiles.wa_opt_in_at IS
    'When this person consented to WhatsApp messaging. NULL = never consented; business-initiated templates MUST NOT be sent.';
COMMENT ON COLUMN public.profiles.wa_opt_out_at IS
    'Set when they asked to stop. Non-NULL suppresses ALL business-initiated sends regardless of wa_opt_in_at.';

-- No RLS change needed: these live on profiles, whose existing
-- policies already govern who can read/write it. The write path for
-- wa_opt_in_source='telecall' goes through the service-role telecaller
-- API (same as every other on-behalf field), and 'inbound_message'/
-- 'website' are stamped by service-role code (webhook / checkout).
