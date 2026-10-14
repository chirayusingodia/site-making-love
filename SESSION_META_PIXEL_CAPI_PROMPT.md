# SESSION: Meta Pixel + Conversions API (CAPI) integration — Punyata

You are working in the Punyata repo (TanStack Start + React, Supabase, Razorpay, Gupshup WhatsApp, deployed on a Workers-style runtime). Read this whole prompt before touching code. Work in the order given. Do not commit; leave changes in the working tree and report a diff summary at the end.

## 0. Goal

Make Meta ad tracking production-grade so Meta-sourced subscribers are (a) credited to the right channel and (b) reported back to Meta reliably, even when the browser pixel is blocked or the user pays inside WhatsApp's in-app browser / UPI app and never returns to the success page.

## 1. What already exists (verified by reading the files — still re-read them before editing)

- `src/routes/__root.tsx` — loads the Meta Pixel base snippet only if `VITE_META_PIXEL_ID` is set; fires `fbq('track','PageView')` once. GA4 is loaded the same way. **No PageView on client-side route changes.**
- `src/lib/ad-conversions.ts` — `fireSubscribeConversion({valuePaise, planName})` calls `window.fbq('track','Subscribe',{value,currency:'INR'})` and `gtag`. No `eventID`.
- `src/routes/subscription-success.tsx` — imports and calls `fireSubscribeConversion` (around line 76).
- `src/lib/attribution.ts` — `captureAttributionOnce()` stores first-touch UTM/`fbclid`/`gclid`/channel in localStorage (`punyata_attribution_v1`); `getStoredAttribution()` reads it. **`captureAttributionOnce()` is never called anywhere in `src/`** (grep it to confirm). So attribution is currently never captured.
- `src/lib/meta.server.ts` — Instagram Graph API wrapper for Content Studio (`META_ACCESS_TOKEN`, `META_IG_USER_ID`, `META_GRAPH_VERSION`, default `v21.0`). Do NOT reuse or modify this for CAPI; CAPI uses a different token and endpoint.
- `src/lib/phone.ts` — has `normalizePhoneE164()`. All phone numbers must go through it.
- `src/lib/razorpay-webhook.server.ts` (~39 KB) and `src/lib/subscriptions-checkout.server.ts` — subscription activation is webhook-driven.
- `src/routes/api/subscriptions/create-checkout.ts` — creates the pending subscription; already reads the attribution token / `?att=` for telecaller commission. **Do not touch commission logic (`commission-logic.ts`) or the `?att=` agent-attribution path.** Marketing attribution is a separate concern (see the comment at the top of `attribution.ts`).

## 2. Tasks, in order

### Task A — Wire attribution capture (smallest, highest value)
1. Call `captureAttributionOnce()` once on client boot, in a `useEffect` in `RootComponent` in `__root.tsx` (client-only, no SSR access to `window`).
2. Also capture the Meta browser cookies at the same time and persist them alongside the attribution record: `_fbp` and `_fbc` from `document.cookie`. If `_fbc` is absent but `fbclid` is in the URL, build it as `fb.1.<timestamp_ms>.<fbclid>`. Extend `StoredAttribution` with optional `fbp`/`fbc`; keep it backward compatible with already-stored records (missing fields = null). Refresh `fbp`/`fbc` at checkout time too, since the Pixel may set them after first touch.
3. Confirm how attribution currently reaches the server at checkout. If `create-checkout.ts` or the subscriptions table already has a column for channel/UTM, reuse it. If there is none, add ONE nullable `jsonb` column `marketing_attribution` on `public.subscriptions` via a new migration (next number in `supabase/migrations`, same naming style as the existing `2026MMDD_0NN_*.sql`), and pass `getStoredAttribution()` plus `event_source_url`, `client_user_agent` from the browser. The server must capture client IP from request headers itself (`cf-connecting-ip` / `x-forwarded-for`) — never trust it from the body.
4. Validate the incoming attribution object server-side (length-cap every string, drop unknown keys). It is untrusted input.

### Task B — Browser pixel: SPA PageView + standard events + event IDs
1. Add a small client module `src/lib/meta-pixel.ts` that wraps `window.fbq` safely (no-op when missing, never throws) and exposes `trackPageView()`, `trackViewContent()`, `trackInitiateCheckout()`, `trackLead()`, `trackSubscribe()`, each accepting an `eventId`.
2. Fire `PageView` on every client-side route change (subscribe to the TanStack router's `onResolved`/location change in the root component) — but skip the very first one, because the base snippet already fires it. Do not double-count.
3. Fire `ViewContent` on `plan.$planId.tsx`, `InitiateCheckout` on `checkout.$planId.tsx` when checkout actually begins (when the Razorpay order/mandate is created, not on mere page view), `Lead` on `login`/`complete-profile` completion only if that is genuinely a lead event in this funnel — decide from reading the code and state your reasoning in the report.
4. Generate an `event_id` (UUID) per event. For the conversion event, the `event_id` MUST be deterministic and shared by browser and server: use `subscribe_<subscription_id>` (or the payment id for a one-time payment). Same string in the Pixel `eventID` option and in the CAPI payload. This is what makes Meta deduplicate instead of double-counting.
5. Update `fireSubscribeConversion` to accept and pass `eventID` as the 4th arg: `fbq('track','Subscribe',{...},{eventID})`. Keep the GA4 call unchanged.
6. Keep everything gated behind `VITE_META_PIXEL_ID`; unset = nothing loads, nothing throws.

### Task C — Server-side Conversions API
1. Create `src/lib/meta-capi.server.ts`:
   - Env (read per request, Workers-safe, same style as `meta.server.ts`): `META_PIXEL_ID` (server copy of the pixel id), `META_CAPI_ACCESS_TOKEN`, optional `META_CAPI_TEST_EVENT_CODE`, optional `META_GRAPH_VERSION` (default `v21.0`). If the pixel id or token is missing, log once and return `{skipped:true}` — never throw into the caller.
   - `sendMetaEvent({eventName, eventId, eventTime, eventSourceUrl, actionSource:'website', user:{phone?, email?, firstName?, externalId?, fbp?, fbc?, clientIp?, clientUserAgent?}, custom:{value, currency:'INR', contentName?, ...}})` → POST `https://graph.facebook.com/{version}/{pixel_id}/events` with the token in the query/body per Meta docs.
   - Hashing: SHA-256 lowercase hex via Web Crypto (`crypto.subtle.digest`), NOT `node:crypto`. Normalise before hashing: trim + lowercase for email/name; phone = E.164 from `normalizePhoneE164()`, **digits only, with country code, no `+`** (Meta's format). `external_id` = hashed profile id. Never hash `fbp`, `fbc`, IP, or user agent — those are sent raw.
   - Include `test_event_code` when `META_CAPI_TEST_EVENT_CODE` is set.
   - 5-second timeout with `AbortController`; one retry on 5xx/network error; log the Meta `fbtrace_id` on failure. Never log raw PII or the token.
2. Hook it where activation is confirmed — in the Razorpay webhook handler, at the point a subscription transitions to active (first successful mandate/payment only; **not** on renewals, **not** on retries or redelivered webhooks). Read the handler before choosing the spot. Requirements:
   - Idempotent: Razorpay redelivers webhooks. Guard so one subscription fires at most one conversion event — e.g. a nullable `meta_capi_sent_at timestamptz` on `subscriptions` (add via the same migration as Task A) set atomically (`UPDATE ... WHERE meta_capi_sent_at IS NULL RETURNING`) before sending.
   - Fire-and-forget safe: a Meta outage must NEVER fail, delay, or retry-loop the Razorpay webhook. Wrap in try/catch; on Workers use `waitUntil` if available in this codebase's pattern, otherwise await with the timeout above and swallow errors.
   - Value = amount actually charged for the first payment, in rupees, from the webhook payload / DB, not a hardcoded plan price.
   - Pull `fbp`, `fbc`, `clientIp`, `userAgent`, `eventSourceUrl` from the stored `marketing_attribution` / checkout record (Task A). If missing (e.g. the user paid via a WhatsApp-sent link in a different browser context), still send with hashed phone + external_id — that still matches.
3. Only send for subscribers who have marketing attribution of paid-Meta origin? **No** — send all conversions; Meta matches and discards what it can't attribute, and total conversion volume improves optimisation. Do skip admin/test/staff accounts (check `profiles.role`) and internal test numbers (`WHATSAPP_TEST_NUMBERS` convention).

### Task D — Consent and safety
1. Add a minimal, dismissible consent notice (one line, Hindi + English via the existing `translations.ts` pattern) and gate BOTH the Pixel load and the browser→server `fbp/fbc` forwarding behind accepted consent, storing the choice in localStorage. Default for first-time visitors: pixel off until accepted. If you judge this too heavy for this session, implement the gate flag (`hasMarketingConsent()`) and leave the banner UI as a clearly marked TODO — say which in the report.
2. Server-side CAPI for a paying customer is transactional/measurement data; still skip sending if the stored record says marketing consent was explicitly declined.
3. Do not put the CAPI token, pixel secrets, or any `META_*` value in a `VITE_*` variable or in client code. Only the public pixel id may be `VITE_`.

## 3. Hazards specific to this repo — read before coding

- **Phone format burn (twice already):** every phone you hash must come from `normalizePhoneE164()`, never the raw value. Add a test: `8005828548`, `+918005828548`, and `918005828548` all hash to the same value.
- **Pending migrations exist** (018, 021, 032 not confirmed applied). Your new migration must not depend on them and must be safe to run alone in the Supabase SQL Editor, which runs as one implicit transaction: use `ADD COLUMN IF NOT EXISTS`, no index on a column that doesn't exist yet, no references to other unapplied migrations. Check `notifications`-style schema assumptions against the actual migration files, not memory.
- **Do not edit** `commission-logic.ts`, the telecaller panel, or WhatsApp send/consent files in this session.
- `.env` contains live secrets. Do not read, print, or copy it. Document new variables in the report instead.
- Subscription activation is webhook-only by design; do not add a second activation path on the success page.

## 4. Verification (required — do not skip)

1. `npx tsc --noEmit` and the project's lint pass clean (or report pre-existing errors separately).
2. Unit tests (use the repo's existing test setup; if none, add the minimum to run with the existing tooling): hashing normalisation, phone formats, `fbc` construction, event_id determinism, idempotency guard (second call sends nothing), skip-when-env-missing.
3. Call-site check: grep every caller of `fireSubscribeConversion` and every place that now sends CAPI; confirm each passes the same `event_id` scheme. (Past reviews in this repo found green tests hiding broken call sites — verify callers, not just the helper.)
4. With `META_CAPI_TEST_EVENT_CODE` set, produce the exact curl/payload the webhook would send (token redacted) so the owner can confirm the event shows in Events Manager → Test Events with "Deduplicated" status once the Pixel event fires with the same id.
5. Confirm nothing loads or throws when all `META_*` / `VITE_META_PIXEL_ID` vars are unset (dev/preview must be inert).

## 5. Deliverables / report format

End with: files changed, the new migration filename and whether it is safe to run standalone, the list of env vars to add (server vs `VITE_`), where the CAPI hook sits in the webhook and why that spot, anything you chose not to do and why, and a short manual test checklist (pixel helper, Test Events tab, a real ₹ test payment, a redelivered webhook).

## 6. Env vars the owner must create (for your report, not for you to invent values)

- `VITE_META_PIXEL_ID` (public)
- `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, `META_CAPI_TEST_EVENT_CODE` (server only; token generated in Events Manager → Pixel → Settings → Conversions API)
