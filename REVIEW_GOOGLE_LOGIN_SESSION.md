# Review — Session GSI (Google Sign-In alongside Phone OTP)

**Reviewed:** 2026-08-23 · **Against:** live repo files on device (not the session summary alone)
**Verdict: ship it, pending Chirayu's 3 config steps.** No critical or high findings. One
already-honest gap in a helper script, two cosmetic nits.

---

## What I actually checked (not just the summary)

- Read `GoogleAuthButton.tsx`, `login.tsx`, `complete-profile.tsx`,
  `complete-google-profile.ts`, `auth-api.ts`, `supabase-admin.server.ts` in full.
- Confirmed `profiles.phone` really is `UNIQUE` inline in
  `20260725_001_core_schema.sql` line 152 (`profiles_phone_key`) — the report's
  §1d claim is correct, not assumed.
- Confirmed the RLS policy the handler relies on — `"profiles: user inserts own"
  ... WITH CHECK (id = auth.uid())` — exists exactly as described (same migration,
  line 502-503). The insert really does run under the caller's own JWT
  (`auth.db.from(...)`), not the service client, so RLS is the real gate here.
- Read `scratch/verify_google_profile.ts` line by line — it's a genuine live E2E
  test (creates 2 disposable Supabase auth users via admin API, signs in as each,
  hits the real endpoint, cleans up after). Counted the `check()` calls myself:
  16, matching the claimed 16/16. Check #14 (raw conflicting insert → `23505`)
  is the one that actually proves the UNIQUE constraint is live in the database —
  stronger evidence than a catalog query would have been.
- Confirmed `otp_send_log` row count is asserted as zero for the Google path
  (test #7) — backs the "no OTP side effects" claim rather than just stating it.
- Confirmed the pre-existing `getUserClient()` bug: it really did only read
  `SUPABASE_ANON_KEY` before this session; the fallback to `VITE_SUPABASE_ANON_KEY`
  is now in place (`supabase-admin.server.ts` line 225). Believable as a
  session-blocking bug given `.env` only sets the `VITE_` variant — every
  `requireUser`-gated route would have 500'd, which is a bigger deal than the
  one-line diff suggests.
- Confirmed `SESSIONS_PROGRESS.md` was actually updated (not just claimed) — the
  Session GSI entry, decisions, and key-files map are all present and match the
  code.

## Findings

**Nit — `report_phone_unique.ts` can't itself confirm the constraint exists.**
Its own comments admit it: no `information_schema`/`pg_constraint` access via
supabase-js, so it infers "constraint holds" from "zero duplicate phones today +
migration file declares it inline." That's a real gap in that *one script* — but
it isn't a gap in the overall claim, because `verify_google_profile.ts` test #14
independently and empirically proves the constraint fires in the live DB via a
real conflicting insert. Just don't reuse `report_phone_unique.ts` alone as
proof of a constraint's existence in a future session — it only proves "no
duplicates," which is a different question.

**Cosmetic — `SESSIONS_PROGRESS.md` dates this session 2026-08-24**, one day
ahead of today (2026-08-23). Harmless, but worth a one-line fix so the progress
log stays chronologically sane against the other sessions logged the same day.

**Cosmetic — one redundant auth call.** `complete-google-profile.ts` re-derives
the bearer token and calls `service.auth.getUser(token)` a second time (to read
the verified email) after `requireUser()` already validated the same token
internally. Not a bug — just an avoidable extra round-trip. Not worth a
follow-up session on its own; fold it in next time that file is touched.

**Nothing else found.** The three things this codebase's history has bitten on
before — RLS bypass via a service-role write where a user-scoped one was needed,
a missing REVOKE on a new SECURITY DEFINER function, and mojibake on a rewritten
file — don't apply here: no new SECURITY DEFINER function was added, the write
path correctly uses the caller's own JWT, and the Hinglish strings in
`complete-profile.tsx` read correctly (checked the raw bytes on the emoji/
Devanagari lines, not just that the build was green).

## Rating: 9/10

Matches its own spec closely, the one trade-off it takes (unverified phone on
the Google path) was Chirayu's explicit call in the brief and is flagged
honestly rather than hidden, and the verification script is real proof rather
than a rubber stamp. Docked one point only for the two cosmetic items above —
neither blocks shipping.

## Before going live

Chirayu's three config action items from the session summary are real
blockers, not formalities — the button will fail gracefully but do nothing
until they're done:
1. Google Cloud OAuth consent screen + client ID/secret for the prod domain.
2. Supabase → Auth → Providers → Google: paste the client ID/secret.
3. Supabase → Auth → URL Configuration: allow-list `https://<domain>/complete-profile`.
