-- =============================================================
-- PUNYATA — Session: OTP Abuse Protection (Layer 3)
-- Project : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch  : Staging
-- Created : 2026-08-23
-- =============================================================
--
-- /api/auth/request-otp is public by design (login/signup starts
-- there) and was a textbook OTP-bombing / SMS-pumping-fraud target.
-- This migration adds the application-level rate-limit ledger:
--
--   public.otp_send_log — one row per OTP-send ATTEMPT (allowed or
--   blocked), written server-side by requestOtpForPhone() BEFORE
--   Supabase's send. The limits themselves (3/10min per phone,
--   8/24h per phone, 5 distinct phones/hour per IP) live as
--   tunable constants in src/lib/auth.server.ts (OTP_RATE_LIMITS)
--   — this file only provides storage + one counting helper.
--
-- PII: phone numbers already exist in profiles/auth; ip is newly
-- stored here ONLY (never joined to identity) — accepted for
-- abuse visibility, nothing beyond that.
--
-- RLS: table is ENABLED with ZERO policies. Only the service-role
-- key touches it (rate limiting + logging run inside the server
-- route under getServiceClient()). No client, staff or otherwise,
-- gets any grant — abuse telemetry must not be readable/writable
-- from the browser.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / OR REPLACE).
-- =============================================================

-- ── 1. Ledger table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.otp_send_log (
    id         bigint generated always as identity PRIMARY KEY,
    phone      text        NOT NULL,
    ip         text,
    allowed    boolean     NOT NULL DEFAULT true,
    reason     text,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.otp_send_log IS
    'One row per /api/auth/request-otp OTP-send attempt (allowed or blocked). Rate-limit thresholds live in src/lib/auth.server.ts (OTP_RATE_LIMITS). Service-role only.';
COMMENT ON COLUMN public.otp_send_log.reason IS
    'NULL when allowed; which limit tripped when blocked: phone_burst_10m | phone_daily | ip_distinct_phones. Never surfaced to the client.';

ALTER TABLE public.otp_send_log ENABLE ROW LEVEL SECURITY;

-- Deliberately NO policies: RLS-enabled + zero policies = denied to
-- every anon/authenticated role; service role bypasses RLS.

-- ── 2. Indexes for the three limit lookups ────────────────────
-- All three checks are range scans on (key, created_at DESC).

CREATE INDEX IF NOT EXISTS otp_send_log_phone_created_idx
    ON public.otp_send_log (phone, created_at DESC);

CREATE INDEX IF NOT EXISTS otp_send_log_ip_created_idx
    ON public.otp_send_log (ip, created_at DESC);

-- ── 3. Distinct-phone count per IP ────────────────────────────
-- PostgREST's count='exact' counts ROWS, not DISTINCT values, so the
-- per-IP check ("one attacker, many victim numbers") counts through
-- this SECURITY DEFINER helper instead of shipping rows to Node.
CREATE OR REPLACE FUNCTION public.otp_send_ip_phone_count(
    p_ip    text,
    p_since timestamptz
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT count(DISTINCT phone)::int
    FROM public.otp_send_log
    WHERE ip = p_ip
      AND created_at >= p_since;
$$;

REVOKE ALL ON FUNCTION public.otp_send_ip_phone_count(text, timestamptz) FROM PUBLIC, anon, authenticated;

-- ── 4. Housekeeping note (manual, no pg_cron dependency) ──────
-- The ledger grows one row per attempt forever; lookups only ever
-- read the last 24h. When it feels heavy, prune periodically as
-- owner, e.g.:
--   DELETE FROM public.otp_send_log WHERE created_at < now() - interval '30 days';
-- (Safe: deleting history only weakens forensic visibility, never
-- current enforcement.)

-- ── Verification ───────────────────────────────────────────────
-- SELECT * FROM public.otp_send_log LIMIT 1;            -- as anon → permission denied (zero policies)
-- SELECT public.otp_send_ip_phone_count('1.2.3.4', now() - interval '1 hour');
-- Expect: 0 (integer), no error.
