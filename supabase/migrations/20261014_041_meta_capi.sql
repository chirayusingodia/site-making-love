-- 041. Meta Conversions API support.
--
-- Standalone: touches only public.subscriptions, uses IF NOT EXISTS, creates
-- no index and references no other unapplied migration (does NOT depend on
-- 018 / 021 / 032). Safe to paste alone into the Supabase SQL Editor, and
-- safe to re-run.
--
-- UTM / gclid / fbclid / landing_path already live on subscriptions
-- (migration 029). What CAPI additionally needs from the checkout moment is
-- stored in ONE jsonb blob rather than many columns:
--   { fbp, fbc, client_ip, client_user_agent, event_source_url, consent }
-- (all optional; written server-side after validation, see
-- src/lib/meta-capi-context.ts). client_ip is nulled after a confirmed send
-- and scrubbed by the retry cron after 30 days.
--
-- Delivery state for the first-payment conversion event:
--   meta_capi_claimed_at  — set when a worker (webhook or cron) takes the
--                           row to send it. A claim older than 10 minutes
--                           with no confirmation is STALE and may be taken
--                           again, so a crash between claim and send is
--                           never permanent.
--   meta_capi_sent_at     — set ONLY after Meta confirmed (2xx). Never
--                           pre-set, so a failed send is never lost.
--   meta_capi_attempts    — claims taken so far; the cron stops at 5.

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS marketing_context    jsonb,
    ADD COLUMN IF NOT EXISTS meta_capi_claimed_at timestamptz,
    ADD COLUMN IF NOT EXISTS meta_capi_sent_at    timestamptz,
    ADD COLUMN IF NOT EXISTS meta_capi_attempts   integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.subscriptions.marketing_context IS
    'Checkout-time Meta CAPI matching context (fbp, fbc, client_ip, client_user_agent, event_source_url, consent). Untrusted input, validated server-side. client_ip is removed after a confirmed send / 30 days.';
COMMENT ON COLUMN public.subscriptions.meta_capi_claimed_at IS
    'When a worker last claimed this subscription to send its Meta conversion. Stale after 10 minutes without meta_capi_sent_at.';
COMMENT ON COLUMN public.subscriptions.meta_capi_sent_at IS
    'Set only after Meta CAPI confirmed receipt of the first-payment conversion. NULL = not (yet) delivered.';
COMMENT ON COLUMN public.subscriptions.meta_capi_attempts IS
    'Number of send claims taken for the Meta conversion (cron gives up at 5).';
