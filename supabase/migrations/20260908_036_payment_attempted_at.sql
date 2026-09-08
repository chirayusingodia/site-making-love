-- ─────────────────────────────────────────────────────────────
-- 036 — payments.attempted_at : the gateway's OWN attempt time
--
-- WHY
--   "Latest payment" (telecaller call card + queue assignment) and the
--   consecutive-failure demotion counter were both ordered by
--   payments.created_at — which is OUR INSERT time, i.e. the moment a
--   webhook happened to land. Razorpay does not guarantee webhook
--   delivery order, and its retries can arrive out of order, so a late
--   `subscription.payment.failed` for an OLD attempt could be stamped
--   with a NEWER created_at than a real capture and then be read as the
--   customer's latest payment. That is exactly how a fully active,
--   paying subscriber surfaced with a "failed" latest payment (and how
--   the failure-chain count could be skewed).
--
-- FIX
--   Record the gateway payment entity's own created_at as `attempted_at`
--   on EVERY payments row — captured AND failed — and order ledger reads
--   by it. `paid_at` keeps its narrow meaning (money actually captured;
--   NULL for a failed attempt), so financial sums that key on paid_at are
--   left completely untouched.
--
-- SAFETY
--   Additive column. Backfilled from the best proxy we already retained
--   (paid_at for captures, created_at otherwise), then made NOT NULL with
--   a now() default so a direct/manual insert can never leave it blank.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS attempted_at timestamptz;

-- Backfill: a captured row's paid_at IS its gateway time; a failed row
-- never had a paid_at, so created_at is the closest thing we kept.
UPDATE public.payments
   SET attempted_at = COALESCE(paid_at, created_at)
 WHERE attempted_at IS NULL;

-- New rows are always written with attempted_at by the webhook handler;
-- the default + NOT NULL protect any other insert path too.
ALTER TABLE public.payments
    ALTER COLUMN attempted_at SET DEFAULT now();
ALTER TABLE public.payments
    ALTER COLUMN attempted_at SET NOT NULL;

-- Hot path: "recent-N payments for one subscription, newest attempt
-- first" — the telecaller card and the demotion counter.
CREATE INDEX IF NOT EXISTS idx_payments_sub_attempted_at
    ON public.payments (subscription_id, attempted_at DESC);

COMMENT ON COLUMN public.payments.attempted_at IS
    'Gateway payment-entity created_at: when the charge was ATTEMPTED at Razorpay. Set for captured AND failed rows. Order ledger reads by this, never by created_at (=our webhook-insert time), because Razorpay does not guarantee webhook delivery order.';
