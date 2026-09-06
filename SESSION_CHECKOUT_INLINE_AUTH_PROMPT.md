# Checkout: collapse login → name → payment into one page (`/checkout/grah`)

**Requested by:** Chirayu / Harshit — 2026-09-06
**Screenshot reference:** `/checkout/grah` (Sadasyata → Premium, ₹399/Monthly), showing the "आपकी जानकारी" (naam/mobile) card that already lives on the checkout page.

## 1. The problem

Today, an unauthenticated visitor who clicks "Subscribe" bounces through **three separate page loads** before they can pay, even though the checkout page itself already renders a naam/mobile ("आपकी जानकारी") card:

1. `/checkout/$planId` — session gate fires and immediately navigates away
2. `/login` — shows "Continue with Google" (phone+OTP is currently disabled, see §2)
3. `/complete-profile` — first-time users get a second naam/mobile form here
4. back to `/checkout/$planId` — the SAME naam/mobile fields render again, now pre-filled

Chirayu wants everything — login, name/mobile capture, and payment — to happen **on `/checkout/grah` itself**, with no navigation to `/login` or `/complete-profile` for this entry point. The only unavoidable hop is the actual Google OAuth round-trip (the browser has to leave to `accounts.google.com` and come back) — but it should land the person straight back on checkout, not on two more internal pages.

## 2. Current flow, traced from the actual code

### 2.1 Session gate on checkout
`src/routes/checkout.$planId.tsx` (lines ~113–122):
```ts
useEffect(() => {
  if (!sessionLoading && !userId) {
    const back = attToken
      ? `/checkout/${planId}?att=${encodeURIComponent(attToken)}`
      : `/checkout/${planId}`;
    navigate({ to: "/login", search: { redirect: back }, replace: true });
  }
}, [sessionLoading, userId, planId, attToken, navigate]);
```
The instant `useSessionProfile()` resolves with no user, it redirects to `/login?redirect=/checkout/<plan>`. This fires the moment the hook's first pass finishes — there's no grace window for an in-flight OAuth session to land, which matters for §4.

### 2.2 `/login`
`src/routes/login.tsx` — phone+OTP UI exists but is dead:
```ts
const PHONE_OTP_LOGIN_ENABLED = false; // line 62
```
So in practice the only working control on this page is `<GoogleAuthButton redirect={target} />`.

### 2.3 Google sign-in hand-off
`src/components/GoogleAuthButton.tsx` (line 55):
```ts
const redirectTo = `${window.location.origin}/complete-profile?redirect=${encodeURIComponent(redirect)}`;
await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
```
**Every** Google sign-in — regardless of where it started — lands on `/complete-profile`, never back on the original page directly. This is the hard-coded detour.

### 2.4 `/complete-profile`
`src/routes/complete-profile.tsx`:
- Polls `supabase.auth.getSession()` for up to 5s waiting for the OAuth redirect to finish resolving (lines 70–100).
- `fetchMyProfile()` — if a `profiles` row already exists (returning user), it navigates straight to `target` (line 106) — **no extra page for returning users**, only first-timers.
- If no profile row exists yet, it renders its own naam/mobile form (lines 152–301) and on submit calls `completeGoogleProfile()`, which is a plain **INSERT** (`POST /api/auth/complete-google-profile`, `src/routes/api/auth/complete-google-profile.ts` line 98: `auth.db.from("profiles").insert(...)`).
- Only after that insert succeeds does it `navigate({ to: target })` — back to checkout, a second time.

### 2.5 Why checkout can't just absorb this today
`checkout.$planId.tsx` already has its own naam/mobile card (lines 447–485) and its own save function:
```ts
await callUserApi("/api/profile/identity", payload); // src/routes/api/profile/identity.ts
```
But `/api/profile/identity.ts` is **UPDATE-only** (line 73: `.update({...}).eq("id", auth.userId)`) — a Supabase update against a non-existent row affects 0 rows and returns `ok:true` with nothing written, silently. That endpoint assumes the `profiles` row already exists, which is exactly why `/complete-profile`'s INSERT has to run first for a brand-new Google user. **This is the actual reason the third page exists.**

## 3. Target flow

```
Not logged in → land on /checkout/grah
  → sees plan, trust strip, "Continue with Google" button (inline, same page)
  → clicks it → browser leaves to Google (unavoidable) → comes straight back to /checkout/grah
  → page shows a brief "confirming…" state while the session resolves
  → naam/mobile card is now editable + pre-filled from Google's name (phone still blank, required)
  → same Pay button — its existing save-identity-then-pay logic now upserts instead of update-only
  → Razorpay opens, same as today
```
No visit to `/login` or `/complete-profile` for this entry point. Returning users (already have a `profiles` row) see no extra step at all — same as today.

`/login` and `/complete-profile` stay in the codebase unchanged for every OTHER entry point (`/profile`, `/my-subscription`, direct `/login` visits, telecaller-shared links, etc.) — this change is scoped to the checkout entry point only.

## 4. Implementation plan

### 4.1 Make the identity-save endpoint upsert-capable
This is the actual unlock — without it, nothing else here works.

- Add an `upsert` mode to `src/routes/api/profile/identity.ts` (or introduce a new `POST /api/profile/upsert-identity` if touching the existing route's contract feels risky — Chirayu/Kimi's call):
  - If no `profiles` row exists for `auth.userId` yet → **INSERT**, folding in the logic already proven in `complete-google-profile.ts`:
    - pull `email` from the verified token (`service.auth.getUser(token)`), never from the client body
    - same phone-uniqueness pre-check + `23505` race handling → `409 { code: "phone_taken" }`
  - If a row exists → **UPDATE**, exactly like today's `identity.ts`.
  - Phone is optional on this call for the *first* save only if the caller is guaranteed to complete it before Pay (checkout already makes phone mandatory before enabling the Pay button — keep that).
- Also fold in `reconcile-profile.ts`'s legacy-repair step (evict an unverified squatter's claim on the same phone) so we don't regress that fix — call it once as part of the same upsert path instead of as the separate `ensureMyProfile()`/`reconcileMyProfile()` round-trip `login.tsx` currently fires after OTP verify.

### 4.2 Change the Google redirect target — but only from checkout
- `GoogleAuthButton` already takes a `redirect` prop and builds `redirectTo`. Add an optional prop, e.g. `landOn?: "checkout" | "complete-profile"` (default `"complete-profile"` to keep every other call site's behavior identical), so only `checkout.$planId.tsx`'s usage sets `redirectTo` back to the **current checkout URL** (`/checkout/<planId>?att=<token>`) instead of `/complete-profile`.
- Concretely: `checkout.$planId.tsx` needs its own inline `<GoogleAuthButton>` (see §4.3) passing `redirect` = the checkout URL itself, and the button constructs `redirectTo = ${origin}${redirect}` directly — no `/complete-profile` in the path at all for this call site.

### 4.3 Inline the logged-out + first-time states into `checkout.$planId.tsx`
Replace the current "redirect to /login" `useEffect` (§2.1) with in-page states, mirroring what `login.tsx` + `complete-profile.tsx` do today but without leaving the route:

- **State A — logged out:** render the plan summary + trust strip (keep these, they're good) plus a "Continue with Google" button in place of the naam/mobile card and Pay button. Still no `/login` navigation.
- **State B — OAuth resolving:** after the Google redirect lands back on `/checkout/<planId>`, `useSessionProfile()`'s `supabase.auth.onAuthStateChange` / `getSession()` needs the same short polling grace period `complete-profile.tsx` uses today (lines 70–91, up to 5s) instead of the instant bounce in §2.1 — otherwise the page will flash back to State A before the session finishes landing. This is the one behavioral change that has to be handled carefully; get it wrong and the fix regresses into a redirect loop.
- **State C — logged in, no `profiles` row yet (first-time Google user):** show the existing naam/mobile card, pre-filled the same way `complete-profile.tsx` does today — `full_name` from `session.user.user_metadata.full_name ?? .name`, phone left blank and required. Saving goes through the upsert endpoint from §4.1 instead of the update-only one.
- **State D — logged in, profile exists:** unchanged — today's behavior (naam/mobile pre-filled from the profile row, editable, Pay button).

### 4.4 Untouched on purpose
- Webhook-only activation (`razorpay-webhook.server.ts`) — nothing here changes payment/activation logic, only how the person arrives at the Pay button.
- Attribution capture (`captureAttributionOnce()`), coupon logic (parked behind `COUPON_UI_ENABLED`), terms checkbox, trust strip — untouched.
- `/login`, `/complete-profile`, phone+OTP paths (even though disabled), `phone_taken` → "OTP se login karein" collision handling — all stay exactly as-is for every entry point other than checkout.
- Telecaller payment links (`/checkout/<slug>?att=<token>`) — the `att` token must survive both the pre-auth state and the post-Google-redirect return; carry it through the `redirectTo` URL's query string exactly like `attToken` is already carried into `/login`'s `redirect` param today (§2.1).

## 5. Edge cases to test before calling this done

- Fresh number, fresh Google account, first-ever visit → Continue with Google → lands back on the SAME `/checkout/<planId>` URL → sees naam (from Google) + blank mobile → fills mobile → Pay → Razorpay opens. Zero visits to `/login` or `/complete-profile`.
- Returning user (already has a `profiles` row) with an existing session → checkout renders State D immediately, no Google button shown at all (current behavior, must not regress).
- Returning user whose session expired → Continue with Google → lands back on checkout → profile row already exists → naam/mobile pre-filled from DB, not from Google metadata → Pay works without re-typing anything.
- Phone number collision (`phone_taken`, 409) during the checkout-inline upsert — decide how this surfaces on checkout itself, since the current `/complete-profile` UI's dedicated "OTP se login karein" recovery panel (lines 248–275) has nowhere to live inline. At minimum: a clear inline error + a link/button to `/login?prefill=<digits>` (that hop back out is fine — it's a genuine account-conflict recovery path, not part of the "3 pages for everyone" problem).
- Telecaller link with `?att=` token — token must still reach `create-checkout` after the round trip.
- Refresh the checkout page mid-"OAuth resolving" state (State B) — must not spin forever or bounce incorrectly; reuse `complete-profile.tsx`'s bounded 5s poll, not an unbounded one.
- Directly visiting `/checkout/$planId` with no `?redirect` history at all (not just via the Google bounce) still needs a sane logged-out State A — this is the common case (ad click straight to checkout), not the edge case.

## 6. Suggested file list for the implementation session

- `src/routes/checkout.$planId.tsx` — replace the redirect-to-/login effect with inline states A–D; own OAuth-session polling; own Google-metadata prefill.
- `src/components/GoogleAuthButton.tsx` — optional `redirectTo` override / `landOn` prop so only checkout's usage skips `/complete-profile`.
- `src/routes/api/profile/identity.ts` (or a new sibling route) — upsert support, folding in `complete-google-profile.ts`'s insert + duplicate-phone handling + `reconcile-profile.ts`'s squatter-eviction repair.
- No changes expected in: `login.tsx`, `complete-profile.tsx`, `razorpay-webhook.server.ts`, `subscriptions-checkout.server.ts`, `create-checkout.ts`.

## 7. Rollback

Everything above is additive/conditional on the checkout route specifically — `/login` and `/complete-profile` keep working unchanged for every other entry point, so reverting is just reverting `checkout.$planId.tsx` and the `GoogleAuthButton` prop; the upsert endpoint can stay (it's a superset of the old update-only behavior) or be reverted alongside if something about it turns out unsafe.
