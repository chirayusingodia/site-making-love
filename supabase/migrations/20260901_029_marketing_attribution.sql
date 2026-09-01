-- 029. Marketing-channel attribution for self-serve subscribers.
--
-- `subscriptions.acquisition_channel` already existed (free text) but was
-- only ever stamped 'telecall' or 'coupon:<code>' — organic/paid web
-- traffic left it null. The checkout flow now also stamps it with a
-- resolved channel ('instagram', 'whatsapp', 'facebook', 'google_ads',
-- 'organic', 'direct', 'referral:<host>') captured client-side on first
-- landing (first-touch, see src/lib/attribution.ts). These new columns
-- hold the raw signal behind that label — useful for admin reporting and,
-- later, for Meta Conversions API / Google Ads Enhanced Conversions
-- server-side matching (gclid/fbclid).
--
-- No CHECK constraint, matching acquisition_channel's existing shape —
-- channel taxonomy may grow without a migration.

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS utm_source   text,
    ADD COLUMN IF NOT EXISTS utm_medium   text,
    ADD COLUMN IF NOT EXISTS utm_campaign text,
    ADD COLUMN IF NOT EXISTS utm_content  text,
    ADD COLUMN IF NOT EXISTS utm_term     text,
    ADD COLUMN IF NOT EXISTS gclid        text,
    ADD COLUMN IF NOT EXISTS fbclid       text,
    ADD COLUMN IF NOT EXISTS landing_path text;

COMMENT ON COLUMN public.subscriptions.utm_source IS
    'Raw utm_source from the first landing hit (first-touch). See acquisition_channel for the resolved/bucketed label used in reporting.';
COMMENT ON COLUMN public.subscriptions.gclid IS
    'Google Ads click id, captured if present on first landing — for future Enhanced Conversions matching.';
COMMENT ON COLUMN public.subscriptions.fbclid IS
    'Meta (Facebook/Instagram) ads click id, captured if present on first landing — for future Conversions API matching.';
COMMENT ON COLUMN public.subscriptions.landing_path IS
    'First page path visited this session before any attribution was already stored, e.g. "/plan/basic".';
