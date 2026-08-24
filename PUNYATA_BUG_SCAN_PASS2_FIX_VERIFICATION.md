# Punyata Pass 2 — Fix Verification

**Verified against:** live source on your machine, staged fresh and read line-by-line by four independent reviewers, one per report area. Two claims were double-checked directly against the device filesystem (not just the staged copy) because the first pass of reviewers disagreed with each other.

## Rating: 8.5/10 — a strong, mostly-correct fix pass, with 5 real residual issues and one pre-deploy landmine to check before applying migration 019

Of the 58 claimed fixes: **~53 are genuinely fixed correctly**, 2 were falsely reported broken by reviewers reading a stale cached copy of deleted files (corrected below — they're actually fine), and **5 have real remaining problems** — one of them (P3) is the same severity class as the criticals you were fixing. Nothing was faked or left untouched wholesale; the gaps are narrow and fixable in under an hour combined.

---

## Correction to two reviewer findings (false negatives)

Two of my reviewers reported `src/hooks/use-reveal-on-scroll.ts` (L9 dead code) and `src/routes/telecaller.queue..tsx` (F19 orphan file) as still present/not deleted. I re-checked directly against your machine's filesystem (not the cached staging copy) and both **are actually deleted** — the reviewers were reading leftover files from an earlier staging pass in my scratch space. No action needed on either; treat both as correctly fixed.

---

## Real residual issues

**1. P3 (coupon exhaustion → 500 leak) — NOT FIXED, medium severity.**
`subscriptions-checkout.server.ts` still has the orphaned-Razorpay-subscription half fixed (it now cancels the Razorpay sub on any checkout failure), but the actual PGRST116 branch is untouched:
```js
if (redeemErr && !/pgrst202|42P01|does not exist/i.test(redeemErr.message)) {
  throw new CheckoutError(`coupon redemption failed: ${redeemErr.message}`, 500);
```
The regex still doesn't include `pgrst116`. A coupon that hits its cap between validation and redemption still 500s with a raw Postgres error message instead of the intended 400. One-line fix: add `pgrst116` to the regex.

**2. P10 (log-call daily limit) — half-fixed, low severity.**
The IST calendar-day window is now correct, but the count-then-insert pattern is still racy — two concurrent calls from the same telecaller can both read "under limit" and both insert, blowing past the daily cap. Needs an atomic check-and-log (same pattern the OTP limiter already uses).

**3. F11 (proof-upload error feedback) — fix introduced a new bug, low severity.**
The catch block now sets `errMsg`, but the `finally` block reads `errMsg` from the stale render-time closure (still `null`) rather than the just-set value, so `setConfirming(false)` fires and the branch that would show the error is hidden in the same tick. Net effect: user still sees no error message on failure — the original complaint still holds, just via a different mechanism. Fix: check the caught error directly in `finally`, or restructure so the confirming-branch collapse only happens on success.

**4. F21 (address line2) — NOT FIXED, low severity.**
`addressTouched` in `profile-completion.tsx` still checks only `line1`, `state`, `pincode` — a user who edits only the landmark/line2 field still gets `addressTouched === false`, so their edit is silently dropped on save with no warning. One-line fix: add `address.line2.trim()` to the touched check.

**5. S7 (coupon constraints) — half-fixed, low severity.**
Flat-discount non-negativity is now enforced. A 0%-percent coupon is still legal (the only percent CHECK is `BETWEEN 0 AND 100`, unchanged). Minor — add `discount_value > 0` for percent coupons if you want it fully closed.

**6. reconcile-profile.ts (phone-squatting mitigation) — correctly built, but reactive not structural.**
This is a reasonable, correctly-implemented endpoint (evicts a squatter's phone before inserting the OTP-verified owner, with a race-safe retry on conflict). But it only fires when explicitly called after a failed insert — it doesn't close the underlying race window where a Google sign-up can still squat a number before the real owner completes OTP. This was a documented trade-off originally, not a hard bug, so this is a nice-to-have, not a miss.

---

## Pre-deploy check before applying `20260824_019_pass2_fixes.sql` to Supabase

The new `commission_entries_first_deal_once` unique index (the fix for P1) will **fail to create outright** if your production DB already has duplicate `first_deal` commission rows from the pre-fix double-pay bug (P1) — which is entirely possible if reconcile has been running in production. Before applying 019, run:

```sql
SELECT subscription_id, count(*) FROM commission_entries WHERE kind='first_deal' GROUP BY 1 HAVING count(*) > 1;
```

If that returns any rows, dedupe them manually first (keep the earliest, void/reverse the rest per your commission process) — otherwise the migration aborts partway through.

---

## Everything else: confirmed correct

All of these were verified against the actual current code, not just the summary: S1, S2 (correctly re-derives the real batch id on conflict instead of reassigning it), S3, S4, S5 (clamped backfill for legacy agents added), S6, S9, S10, P1 (DB-level unique index now keyed on subscription_id, not payment_id — actually closes the race), P2 (real compare-and-swap on status), P4 (refund tracking is now genuinely cumulative), P5, P6 (real compensating-transaction revert on failure), P7 (all four queries independently confirmed paginated by reading the query code), P9 (real atomic claim-latch with timeout), P11, P12, P14, and all 15 lib/hook findings (L1–L15, including the IST period fix traced against your exact example timestamp) and 19 of the 22 frontend findings (F1–F10, F12–F18, F20, F22).

Good, careful work overall — the two criticals (S1, S2) and the two highs I'd have worried most about (P1, P2) are all solidly fixed. Send the 5 items above back for a quick follow-up pass and this is done.

---

# Pass 2 — RESIDUAL FIX LOG (2026-08-24)

All 5 real residual issues from this verification are now closed. Verified after fixing: `tsc --noEmit` ✅ · production build (`npm run build`) ✅ · eslint on every touched file ✅ (only the documented pre-existing Windows CRLF checkout noise remains; index is LF).

| Item | File(s) | Fix |
|---|---|---|
| P3 | `subscriptions-checkout.server.ts` | `pgrst116` added to the coupon-redemption tolerance regex — a coupon capped between validate and redeem now lands on the intended clean 400 instead of a raw driver-error 500. |
| P10 | NEW `log_call_limited()` in `20260824_019_pass2_fixes.sql` §6 + `api/telecaller/log-call.ts` | Atomic check-and-log, mirroring `otp_check_and_log`: per-caller advisory xact lock → IST-calendar-day count → insert, all inside ONE transaction. The count-then-insert race can no longer blow past `LOG_CALL_DAILY_LIMIT`. Quota is consumed only after tray/DND/target resolution, so failed lookups never burn slots. Route maps `{ok:false, reason:'over_limit'}` to the same 429 as before. Teardown drop added. |
| F11 | `admin.proof-upload.tsx` | The `finally` block read the stale render-time `errMsg` closure (always null), collapsing the confirm UI and hiding the just-set error. Now tracks an explicit `succeeded` flag: confirm stays open with the inline error on failure, collapses only on success. |
| F21 | `profile-completion.tsx` | `addressTouched` now includes `address.line2.trim()` — a landmark/line2-only edit counts as touched, gets unit-validated, and is saved instead of silently dropped. |
| S7 | `20260824_019_pass2_fixes.sql` §2 | Added `coupons_percent_positive_check` (`discount_type <> 'percent' OR discount_value > 0`, NOT VALID) — 0%-percent coupons are no longer storable. |

## Pre-deploy reminder (unchanged, still manual)
The `commission_entries_first_deal_once` unique index will fail if production already holds duplicate `first_deal` rows from the pre-fix double-pay bug. Run the duplicate-check query (now also embedded as a comment above the CREATE INDEX in migration 019) and dedupe manually before applying 019.

## Deliberately NOT changed
- **reconcile-profile reactive-vs-structural gap** — verification itself classed it as a documented trade-off / nice-to-have, not a miss. The endpoint works as designed; closing the underlying Google-signup squat window needs an OTP-on-linked-phone policy decision, not a patch.
