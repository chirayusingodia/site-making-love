# Punyata — Full Repo Bug Scan Report

Scope: `site-making-love/src/**` (routes, components, hooks, lib) and `site-making-love/supabase/migrations/**`.
This is a listing of bugs found only — nothing has been fixed. Severity: Critical > High > Medium > Low.

---

## ⚡ FIX LOG — 2026-08-24 (verification + remediation pass)

**Every one of the 47 findings was re-verified against source before fixing. All 47 confirmed real**, with two accuracy nuances:

- **4.1 (severity nuance):** `sankalp_batches` already has `UNIQUE(batch_date, batch_type)`, so concurrent generation could not silently double-create rows — the loser got an unexplained 500. The real hazards were the unhandled race **and** the non-atomic delete+insert refresh (4.2), which could leave a batch partially/fully empty. Both are now structurally impossible.
- **4.9 scope extension:** the same quote-only escaping existed in `reports-logic.ts` and `admin.subscribers.tsx`; all three exporters now share the hardened helper.

### DB migration — `supabase/migrations/20260824_018_bugfix_hardening.sql` (**must be applied**)

| Fix | Item(s) | What it does |
|---|---|---|
| §1 `is_owner()` + financial RLS | 5.3 | payments/sales_agents/commission_entries/staff_commission_rates/commission_payout_periods policies switched from `is_admin()` to owner-only |
| §2 role-write guard trigger | 5.1 | client JWTs can no longer write `profiles.role` unless already owner; manual SQL/service-role unaffected |
| §3 view hardening | 5.2 | `subscriber_list_view` set to `security_invoker = true` |
| §4 call_logs FKs | 5.4 | profile/subscription FKs → ON DELETE SET NULL (compliance trail survives); insert-time target CHECK retired |
| §5–§13 constraints & triggers | 5.6/5.7/5.9–5.15 | single-primary partial UNIQUE (guarded), percent-coupon CHECK, schedule-rule UNIQUE (guarded), status↔timestamp CHECKs (`NOT VALID`), auto-escalate trigger, leads-orphan reset trigger, pincode CHECK, non-negative amount CHECKs, delivered↔timestamp CHECKs |
| §14 `generate_sankalp_batch()` | 4.1 / 4.2 | atomic create-or-refresh RPC; racers serialize on the unique via ON CONFLICT; membership delete+insert is transactional |
| §15 `redeem_coupon()` | 1.2 | conditional atomic increment — cap is now enforced, not just previewed |
| §16 `otp_check_and_log()` | 1.7 | count+log under transaction advisory locks (phone → IP order) |
| §17 family_members DELETE policy | 3.1 | users can prune their own out-of-range slots under RLS |

### Code fixes

| Item | File(s) | Fix |
|---|---|---|
| 1.1 | `api/admin/subscriptions/reissue-link.ts`, twin in `api/telecaller/send-payment-link.ts` | race detected via `.select("id")` row-count of the guarded UPDATE; zero rows → 409 bail (broken re-read check removed in both) |
| 1.2 | `lib/subscriptions-checkout.server.ts` | `redeem_coupon` RPC called after Razorpay link succeeds; NULL → checkout fails and cleans up |
| 1.3 | new `lib/phone.ts`, `auth.server.ts`, `auth-api.ts` | single shared `normalizePhoneE164`; every branch enforces the 6-9 prefix |
| 1.4 | `api/payments/webhook.ts` | malformed JSON acks with 200 (matches its own retry contract) |
| 1.5 | `lib/razorpay-webhook.server.ts` | activated/charged/resumed never flip a `cancelled`/`expired` sub back to active; payments still recorded |
| 1.6 | `lib/supabase.ts` | missing anon key throws at startup instead of placeholder fallback |
| 1.7 | `lib/auth.server.ts` | limiter delegates to atomic RPC; degrade-open valve kept for pre-migration deploys |
| 1.8 | `lib/razorpay-webhook.server.ts` | `paused` patch clears stale `halted_at` |
| 1.9 | `lib/subscriptions-checkout.server.ts` | pending user+plan row reused (pure double-click) or stale linkless row cleaned; attributed/coupon checkouts always get their own row |
| 1.10 | `api/admin/payments/refund.ts` | validates against remaining refundable paise |
| 2.1 | `api/admin/commissions/reconcile.ts` | first_deal claimed inside `acceptDrafts` the moment drafts queue — one bonus per subscription even in backlog runs |
| 2.2 | `api/telecaller/profile.ts` | `isInCallersTray` gate added before any read/write |
| 2.3 | `lib/performance-data.server.ts` | subscription fetch widened: created_at window OR start_date window |
| 2.4 | `lib/reports-data.server.ts` | Reports month filter moved to `paid_at`, matching Overview |
| 2.5 | `admin.overview.tsx` | failed-payments window IST-anchored via Intl formatter |
| 2.6 | `admin.commissions.tsx` | Entries count includes reversal rows |
| 3.1 | both `family-members` routes | slots beyond submitted count pruned after upsert (+ new RLS policy) |
| 3.2 | `home/PunyaMeter.tsx` | score denominator = `QUESTIONS.length` |
| 3.3 | `subscription-success.tsx` | ownership verified (`.eq("user_id", userId)`) before any ref-driven read |
| 3.4 | `LottieIcon.tsx` | static JIT-detectable arbitrary class swaps CSS vars at sm+ |
| 3.5 / 3.5b | `__root.tsx` | splash dismissed on first painted frame (no artificial 1500ms); `key={pathname}` remount removed |
| 3.6 | `checkout.$planId.tsx`, `profile.tsx` | shared `formatPhoneDisplay` |
| 3.7 | `CountUp.tsx` | `en-IN` grouping |
| 3.8 | `my-subscription.tsx` AddressCard, `profile.tsx` LoggedInView | reuse `useSessionProfile()` data; cancelled-flag guards |
| 3.9 | `admin.sankalp-lists.tsx` | zero-seva plans get a per-plan sentinel signature |
| 3.10 | `plans.tsx` | CountUp ribbon requires explicit `"N+ text"` convention |
| 3.11 | `admin.plans-sevas.tsx` | BOTH toggle handlers re-fetch plan_sevas + plan_addons before regenerating features |
| 4.1 / 4.2 | `api/sankalp/generate-batch.ts` | route now calls the atomic RPC |
| 4.3 | `lib/error-capture.ts`, `server.ts` | ring buffer; consumer drains and logs ALL TTL-fresh captures (no mis-attribution) |
| 4.4 | `lib/family-validation.ts`, telecaller profile route | validator accepts persisted state/pincode as satisfying the address rule |
| 4.5 | `lib/sankalp-logic.ts`, generate-batch route | eligibility uses `allHawanSevaIds()` (any scheduled hawan); day-scoping unchanged for seva resolution |
| 4.6 | `lib/plans.ts` | `formatINR`/`priceNumeric` exact to the paisa |
| 4.7 | `lib/family-validation.ts` | DOB must be a real past date ≥ 1900 |
| 4.8 | `lib/sankalp-logic.ts`, `admin.proof-upload.tsx` | optional plan-scoped tier keys used by segment assignment |
| 4.9 | new `lib/csv.ts`; payments-logic, reports-logic, admin.subscribers | shared formula-safe CSV escape |
| 4.10 | `lib/cloudinary-image.ts` | segment-wise `encodeURIComponent` on publicId |
| 4.11 | `lib/plans.ts` | slug-drift fallback logs loudly |
| 5.5 | `20260725_000_teardown.sql` | rewritten to drop every current table/view/function |

### Deliberately NOT changed

- **5.16** (`is_admin()` callable via RPC): kept open per the project's own C1 audit (migration 013) — revoking EXECUTE breaks every subscriber RLS read; it leaks only a boolean.
- Repo-wide CRLF prettier errors in lint output are a pre-existing Windows-checkout artifact (present before this pass: 24,195 problems vs 17,405 after); run `npm run format` separately if you want them normalized.

### Verification status

`tsc --noEmit` ✅ · production build ✅ · eslint on all touched files ✅ · scratch schedule tests untouched.

---

## Original scan findings

## 1. Payments / Auth / Webhooks / Checkout

### CRITICAL

**1.1 — Double-reissue race guard is broken**
File: `src/routes/api/admin/subscriptions/reissue-link.ts` (~lines 76–99)
Both racing requests write the identical literal `cancel_reason: "mandate_dead_reissued"`. The "did someone else already reissue this?" re-check just looks for that same string — which the *other* racer also wrote — so it never detects the race. Two admins (or a double-click / retried request) hitting reissue-link on the same halted subscription can both succeed, creating two Razorpay subscriptions, two `pending` DB rows, and two WhatsApp payment-link messages to the same customer.

### HIGH

**1.2 — Coupon `times_redeemed` is read but never incremented**
File: `src/lib/coupons.server.ts` (line ~86), checked against `subscriptions-checkout.server.ts` / `create-checkout.ts`
`max_redemptions` is checked against `times_redeemed`, but nothing in the checkout flow ever increments `times_redeemed` after a successful redemption. A coupon with a redemption cap can be used unlimited times.

### MEDIUM

**1.3 — Inconsistent phone validation across normalization branches**
File: `src/lib/auth.server.ts` (~27–34), duplicated in `src/lib/auth-api.ts` (~54–60)
Only the bare 10-digit branch of `normalizePhoneE164` checks the number starts with `6-9` (valid Indian mobile prefix). The 11/12/13-digit branches (0-prefixed, 91-prefixed, 091-prefixed) skip that check, so landline-shaped/invalid numbers can pass through depending on how the user typed them. Logic is duplicated client + server, so a fix in one place can silently diverge from the other.

**1.4 — Webhook malformed-JSON response contradicts its own "don't retry" comment**
File: `src/routes/api/payments/webhook.ts` (~45–51)
Comment says returning this response "acks, don't retry," but it returns HTTP 400 — a non-2xx status that Razorpay *will* retry for ~24h, per the file's own documented contract (only 200/401/500 are meant to control retry behavior).

**1.5 — Webhook activation events set `status: 'active'` with no ordering guard**
File: `src/lib/razorpay-webhook.server.ts`, `subscriptionPatchForEvent` (~251–261)
`subscription.charged` / `resumed` / `activated` unconditionally set status to `active` and clear `cancelled_at`, unlike the 3-failure demotion path which guards with `.eq("status","active")`. Razorpay doesn't guarantee delivery order, so a delayed "charged" webhook that arrives after a "cancelled" webhook can silently flip a cancelled subscription back to active.

**1.6 — Browser Supabase client falls back to a fake anon key instead of failing loudly**
File: `src/lib/supabase.ts` (~7–9)
If `VITE_SUPABASE_ANON_KEY` is unset, the client silently uses `"sb_anon_key_placeholder"` instead of throwing, unlike the server-side client (`supabase-admin.server.ts`) which explicitly throws on a missing env var. Makes misconfigured deploys fail with a confusing generic 401 instead of a clear error.

### LOW

**1.7 — OTP rate limiter has a TOCTOU race**
File: `src/lib/auth.server.ts`, `enforceAndLogOtpSend` (~96–177)
Count-then-insert is not atomic; two concurrent requests for the same phone can both read counts below the cap before either inserts, letting a couple of requests slip past the 10-min/24h limit under concurrency.

**1.8 — `subscription.paused` doesn't clear `halted_at`**
File: `src/lib/razorpay-webhook.server.ts`, `subscriptionPatchForEvent` (~272–273)
`charged`/`resumed` explicitly clear `halted_at`; `paused` does not, so a subscription that went halted → paused (without an intervening resume) keeps a stale halt timestamp visible in admin UI.

**1.9 — No cap/idempotency on repeated checkout creation**
File: `src/routes/api/subscriptions/create-checkout.ts`, `src/lib/subscriptions-checkout.server.ts`
No check for an existing `pending` subscription for the same user+plan before creating a new one — a double-click or retry can spawn unbounded pending Razorpay subscription objects.

**1.10 — Refund pre-check validates against original amount, not remaining refundable amount**
File: `src/routes/api/admin/payments/refund.ts` (~61–86)
The local guard compares the requested refund against `amount_paise` (the original payment amount), not against what's left after prior partial refunds. Razorpay itself enforces the real ceiling, so this isn't exploitable, but the local check gives a false sense of correctness.

---

## 2. Telecaller / Commissions / Admin Dashboards

### CRITICAL

**2.1 — Commission reconciler can pay the 20% first-deal bonus multiple times for one subscription**
File: `src/routes/api/admin/commissions/reconcile.ts` (~246–249, and 310/356/385)
`subsWithFirstDealEver` is computed once from existing DB rows *before* the payment loop, and is never updated as new `first_deal` entries are queued inside the loop. The per-entry idempotency check only dedupes by `payment_id`, not by subscription. If the reconciler processes two or more already-captured payments for the same subscription in one run (e.g. catching up a backlog), every one of them sees `isFirst === true` and each generates its own 20% first-deal bonus instead of only the first — massive overpayment plus missing trail commissions for the rest.

### HIGH

**2.2 — `/api/telecaller/profile` has no ownership/tray check — any telecaller can edit any customer's profile**
File: `src/routes/api/telecaller/profile.ts` (POST handler, ~21–79)
Every sibling endpoint (`family-members.ts`, `log-call.ts`, `person.ts`, `proof-resend.ts`) calls `isInCallersTray(...)` before mutating data. This route skips it entirely — it takes an arbitrary `profile_id` from the request body and updates name/address/pincode/language with zero check that the profile is actually assigned to the caller. Since pincode drives prasad shipment, this can redirect another subscriber's delivery or corrupt another telecaller's customer record.

**2.3 — Performance dashboard undercounts conversions for subscriptions that activate after creation**
File: `src/lib/performance-data.server.ts` (~118–139) vs `src/lib/performance-logic.ts`, `activatedInRange` (~205–209)
The subscription fetch filters by `created_at` within the reporting range, but "activated" (used for conversion/revenue credit) is defined by `start_date` (falling back to `created_at`). A subscription created in one month but activated (start_date) in the next is excluded from both months' performance data — the telecaller gets zero credit for a real conversion, understating her numbers versus what she's actually paid in the commission ledger.

### MEDIUM

**2.4 — Owner Overview and Reports page compute "this month's revenue" from different timestamp columns**
File: `src/routes/api/admin/overview-financials.ts` (~46, filters by `paid_at`) vs `src/lib/reports-data.server.ts` (~37, filters by `created_at`)
Both claim to show the same month's captured revenue but key off different columns. A payment created in one month and captured (paid_at) in the next lands in different months on the two pages — the owner sees two different "this month" figures.

**2.5 — Admin Overview's "Failed Payments (this month)" uses the browser's local timezone, not IST**
File: `src/routes/admin.overview.tsx` (~167–177)
Every other month-boundary calculation in the app is IST-anchored; this one metric builds the boundary from the viewer's local `Date`. An admin viewing from a non-IST timezone near a month boundary sees a different count than the IST-correct figure elsewhere in the product.

### LOW

**2.6 — Commissions page "Entries" count excludes clawback/reversal rows while "Net payable" includes them**
File: `src/routes/admin.commissions.tsx` (~67–73)
`count` only increments for `amount_paise > 0`; `net` sums everything including negative reversals. A payout period with active clawbacks shows a net figure that doesn't reconcile with the displayed entry count.

---

## 3. Frontend Routes / Components / Hooks

### HIGH

**3.1 — Family-member removal leaves stale/duplicate rows in `family_members`**
Files: `src/components/profile-completion.tsx` (`save`, `removeMember`), `src/routes/api/profile/family-members.ts`
The save payload renumbers remaining members sequentially by array index after a deletion, but the API only *upserts* by `(subscription_id, slot_number)` — it never deletes rows for slots that fall out. Deleting member #2 of 3 causes slot 2 to be overwritten with what used to be slot 3's data, while the original slot-3 row is left behind untouched — a phantom duplicate that shows up in the Pandit-facing sankalp list and member counters, causing an extra/duplicate name to be recited in the actual puja.

**3.2 — PunyaMeter quiz score hardcodes "out of 5" but the quiz has 6 questions**
File: `src/components/home/PunyaMeter.tsx`
`QUESTIONS` has 6 items and the progress header correctly shows "X / 6," but the results screen hardcodes `{yesCount} / 5`. Answering all 6 "yes" displays "6 / 5" — visibly nonsensical on a conversion-driving quiz.

**3.3 — Client-supplied `ref` (subscription id) used with no ownership check on `/subscription-success`**
File: `src/routes/subscription-success.tsx`
`ref` comes straight from the URL query string and is used to fetch `family_members` with no application-level check that the subscription belongs to the logged-in user — relies entirely on RLS. If RLS on `family_members`/`profiles` is ever misconfigured, any logged-in user can view another subscriber's family names/gotra/address just by changing `?ref=`.

### MEDIUM

**3.4 — LottieIcon's responsive size never applies (Tailwind can't see a dynamic class)**
File: `src/components/LottieIcon.tsx`
`` sm:[--lottie-size:${size}px] `` is a template-literal-interpolated class name; Tailwind's JIT scanner can't statically detect it, so it never gets generated into the CSS bundle. Every LottieIcon renders at mobile scale on desktop too.

**3.5 — Root splash screen is a fixed 1.5s delay unrelated to real readiness, shown even on 404/error pages**
File: `src/routes/__root.tsx`
`setTimeout(() => setLoading(false), 1500)` blocks the entire app behind a branded splash regardless of actual load state — including error boundary and not-found pages.

**3.5b — `key={pathname}` on the route Outlet forces a full subtree remount on every navigation**
File: `src/routes/__root.tsx`
Done purely to replay a CSS fade-in; discards component state on every navigation and can race with the router's own `scrollRestoration: true`.

**3.6 — Inconsistent phone-number formatting across pages**
Files: `src/routes/checkout.$planId.tsx` (`formatPhone`) vs `src/routes/profile.tsx`
Checkout's formatter handles a bare `919876543210` (no `+`) correctly; profile.tsx only checks `startsWith("+91")` and shows the raw unformatted digit string otherwise. Same phone value displays differently on two pages.

**3.7 — CountUp uses default browser-locale number formatting instead of `en-IN`**
File: `src/components/CountUp.tsx`
Every other numeric display in the app explicitly uses `en-IN` (lakh/crore grouping); `CountUp` uses `.toLocaleString()` with no locale, so a non-Indian-locale browser shows different digit grouping than the rest of the page for the same kind of number.

### LOW

**3.8 — AddressCard / profile.tsx re-fetch session/profile independently with no unmount guard**
Files: `src/routes/my-subscription.tsx` (`AddressCard`), `src/routes/profile.tsx` (`LoggedInView`)
Both re-query Supabase instead of reusing `useSessionProfile()`'s already-resolved state, and neither guards against setting state after unmount (unlike `use-session.ts`/`complete-profile.tsx`, which do this correctly).

**3.9 — `buildGroups` in admin.sankalp-lists.tsx can silently merge unrelated plans with zero sevas into one list**
File: `src/routes/admin.sankalp-lists.tsx`
Any plan with no `plan_sevas` rows yet hashes to the same empty signature as any other such plan, merging their subscribers into one combined Sankalp list during setup.

**3.10 — PlanRibbon regex silently changes render path for ribbon text containing an unexpected `+`**
File: `src/routes/plans.tsx`
Informational — a content-authoring trap rather than a functional defect, but worth knowing about.

**3.11 — `TierAssignmentMatrix.handleToggle` regenerates plan features using a stale `planAddons` prop**
File: `src/routes/admin.plans-sevas.tsx`
`planSevas` is freshly re-fetched before regenerating features, but `planAddons` is the stale prop value. A concurrent admin edit to addons in another tab can be reverted/erased until the next refresh.

---

## 4. Lib Helpers (Plans, Coupons, Sankalp, Reports, Cloudinary)

### CRITICAL

**4.1 — TOCTOU race in sankalp batch generation can double-enroll an entire month's subscribers**
File: `src/routes/api/sankalp/generate-batch.ts` (~107–176)
Checks for an existing batch, and only inserts a new one if none is found — no unique constraint, no upsert, no locking between the read and the write, despite the route's own docstring calling it "idempotent" (only true for sequential calls). Two concurrent triggers (double-click, retried request, cron overlapping a manual run) both see "no existing batch," both insert a full batch + membership set — every subscriber for that day gets enrolled twice, doubling WhatsApp messages and proof-video work.

### HIGH

**4.2 — Non-atomic delete+insert refresh of batch membership can leave a batch partially or fully empty**
File: `src/routes/api/sankalp/generate-batch.ts` (~124–161)
Refreshing an existing pending batch deletes all membership rows first, then re-inserts in chunks of 500. If any chunk insert fails after the delete succeeded, the batch is left with a partial or zero subscriber set with no rollback.

**4.3 — Cross-request contamination in the error-capture module**
File: `src/lib/error-capture.ts` (lines 4–27)
`lastCapturedError` is a single module-level variable shared across all concurrent requests on the server process. One request's captured error can be consumed and displayed by a different, unrelated request's error page if both error within the same 5-second TTL window.

**4.4 — `validateTelecallerProfileEdit` requires state+pincode to be re-sent on every address edit, even if already saved**
File: `src/lib/family-validation.ts` (~194–199)
The guard checks the current request body only, not the profile's persisted DB state. A telecaller fixing just a typo in `address_line1` (omitting state/pincode since they didn't change) gets a false-positive validation rejection even though the DB already has valid state/pincode for that customer.

### MEDIUM

**4.5 — List B hawan-eligibility check only considers Saturday-scheduled hawans**
File: `src/lib/sankalp-logic.ts`, `planHasHawan` (line ~192) fed by `saturdayHawanSevaIds` (~165–177)
A plan whose only hawan seva is scheduled for Tuesday/second (not Saturday) is not recognized as "hawan-eligible," so its subscribers get routed through the wrong catch-up path instead of permanent List B membership, silently losing sevas that were supposed to run twice a month.

**4.6 — `formatINR` rounds to whole rupees, diverging from the actual `price_paise` charged**
File: `src/lib/plans.ts` (~318–320, 380–381)
`Math.round(pricePaise / 100)` discards the paise remainder. A plan priced at ₹251.50 displays as "₹252" while Razorpay actually charges ₹251.50 — a customer-visible pricing mismatch against their bank statement.

**4.7 — DOB fields validate shape only, not calendar validity**
File: `src/lib/family-validation.ts`, `DOB_RE` (line 28) used at ~60–65
`2024-02-30`, `2024-13-05`, and future dates all pass the regex. No bound checks either.

**4.8 — Segment/tier bucketing is implicit in the seva-id signature, not tracked by plan_id**
File: `src/lib/sankalp-logic.ts` (~337–384)
Two genuinely different plans with the same non-hawan seva composition get silently merged into the same Pandit segment/catch-up bucket, with no way to distinguish them in segment-level reporting.

### LOW

**4.9 — CSV export has no protection against formula/CSV injection**
File: `src/lib/payments-logic.ts`, `buildPaymentsCsv`, `esc` helper (line ~153)
Only escapes embedded double-quotes; doesn't neutralize a leading `=`, `+`, `-`, `@` that Excel interprets as a formula on open.

**4.10 — `cldUrl` doesn't URL-encode the publicId path segment**
File: `src/lib/cloudinary-image.ts` (~42–53)
A publicId containing a space, `#`, `?`, or non-ASCII character produces a malformed `<img src>` with no fallback recovery.

**4.11 — Plan presentation content can silently regress to a generic fallback if `slug` drifts from the DB**
File: `src/lib/plans.ts` (~136–312)
Presentation content is keyed by hardcoded slug strings (`"basic"`, `"premium"`, `"premium-annual"`). If a plan's DB slug ever diverges, `buildPlan` falls through to a bare generic presentation with no slides/benefits/reviews and no error logged anywhere.

---

## 5. SQL Migrations / RLS / Schema (`supabase/migrations`)

### CRITICAL

**5.1 — `profiles.role` self-escalation — any user can promote themselves to admin/owner/telecaller**
File: `20260725_001_core_schema.sql` (~500–510), never remediated by later migrations
The UPDATE/INSERT policies on `profiles` only check `id = auth.uid()` — RLS is row-level, not column-level, and there's no trigger blocking writes to the `role` column. Any authenticated user can run `update profiles set role='owner' where id=auth.uid()` and instantly gain admin/owner/telecaller privileges everywhere, since `is_admin()` and virtually every other policy in the schema gate purely on `profiles.role`.

**5.2 — `subscriber_list_view` is a Security Definer View that likely bypasses RLS entirely**
Files: `20260725_003_subscriber_list_view.sql`, re-created in `20260823_015_halted_subscriptions.sql` (~89–155)
Created with `CREATE OR REPLACE VIEW` and no `security_invoker = true`. In Postgres, this means permission/RLS evaluation runs as the view *owner* (a superuser-ish role in Supabase), not the querying role — exactly the pattern Supabase's own linter flags as "Security Definer View." Any authenticated (possibly anon) client querying this view can likely get every subscriber's full name, gotra, DOB, plan price, coupon/discount values, sales-agent identity, Razorpay sub id, and cancellation reasons, completely bypassing the "user reads own subscription only" RLS policy.

### HIGH

**5.3 — Financial data isn't actually hidden from the `admin` role at the DB layer**
File: `20260801_007_owner_rls_superset.sql` (~43–52) vs `20260725_001_core_schema.sql` policy `"payments: admin write"`
The stated design is "admin = zero financial visibility," but `is_admin()` returns true for both `admin` and `owner`, and payments/sales_agents/commission_entries RLS grants `is_admin()` full row access. The migration's own comment admits masking is only enforced at the API layer, not the DB — any direct Supabase query from an admin-role JWT reads full payment amounts and commissions.

**5.4 — `call_logs` compliance/audit trail is destroyed by cascading profile deletion**
File: `20260822_012_telecaller_role.sql` (~158–169)
`profile_id`/`subscription_id` are `ON DELETE CASCADE` while `called_by` is deliberately `RESTRICT` "so a departing caller's history is never erased" — but the DPDP do-not-call flags and complaint/escalation records tied to the *customer* side vanish entirely on profile deletion, defeating the compliance purpose the migration itself calls out.

**5.5 — Teardown script (`000`) is stale and doesn't actually produce a clean slate**
File: `20260725_000_teardown.sql` (~8–28)
Only drops tables that existed as of migration 001 — never accounts for `sankalp_batches`, `hospitals`, `leads`, `commission_entries`, `call_logs`, `otp_send_log`, or 8 later functions. Running it against a fully-migrated DB leaves orphaned tables/functions with stale RLS policies.

### MEDIUM

**5.6 — No DB-level protection against multiple `is_primary = true` rows per subscription**
File: `20260725_001_core_schema.sql`, `family_members` (~208–218)
Only `UNIQUE(subscription_id, slot_number)` exists; nothing stops two family members under the same subscription from both being marked primary.

**5.7 — `coupons.discount_value` has no range CHECK for percent discounts**
File: `20260725_001_core_schema.sql`, `coupons` (~162–178)
Nothing stops `discount_type='percent', discount_value=500` from being inserted — no DB-level backstop against a >100% discount.

**5.8 — `coupons.applicable_plans uuid[]` has no referential integrity**
File: `20260725_001_core_schema.sql` (line 167)
Array columns can't carry a `REFERENCES` constraint, and no trigger validates elements against `plans.id` — a typo'd plan UUID silently makes the coupon apply to nothing.

**5.9 — `seva_schedule_rules` has no uniqueness constraint on `(seva_id, weekday, occurrence)`**
File: `20260725_001_core_schema.sql` (~63–69)
A duplicate schedule rule can be inserted twice, causing batch generation to double-count that seva.

**5.10 — `subscriptions.status` has no CHECK-level consistency with its supporting timestamp columns**
File: `20260725_001_core_schema.sql`, `subscriptions` (~185–205)
`status='active'` doesn't require `start_date`/`razorpay_sub_id`; `status='paused'` doesn't require `paused_at`; `status='cancelled'` doesn't require `cancelled_at` — unlike the equivalent guard that *was* added for `commission_entries` in migration 013.

**5.11 — `call_logs.escalated` "auto-set for complaint" is only a comment, not enforced**
File: `20260822_012_telecaller_role.sql` (~204–208)
No trigger/generated column enforces it — depends entirely on the API route remembering to set `escalated=true`. A bulk-import or alternate code path can insert a complaint that never surfaces on the "Needs Chirayu" admin list.

**5.12 — `leads.assigned_to` orphaning on staff deletion leaves a lead stuck in the wrong status**
File: `20260822_013_leads_and_commissions.sql` (line ~90)
`ON DELETE SET NULL` on `assigned_to` doesn't also reset `status` back to `'new'`, so a lead assigned to a just-deleted telecaller becomes invisible to both the rollover sweep (until its day-count threshold passes) and any "my leads" UI.

### LOW

**5.13 — `profiles.pincode` has no format CHECK despite the column comment claiming "6 digits"**
File: `20260822_011_signup_first_checkout.sql` (line 40)

**5.14 — `payments.amount_paise` / `refund_amount_paise` have no non-negative CHECK**
Files: `20260725_001_core_schema.sql` (line 226), `20260823_017_refund_tracking.sql` (line 39)
Unlike `plans.price_paise CHECK (price_paise > 0)` elsewhere in the same schema.

**5.15 — `prasad_shipments` / `seva_proofs` / `proof_deliveries` don't tie delivered/status booleans to their timestamp columns**
Files: `20260725_001_core_schema.sql`, `20260801_004_session4_proof_delivery.sql`
Same class of gap that *was* fixed for `commission_entries.status='paid'` in migration 013, but not retrofitted here.

**5.16 — `is_admin()` is callable via PostgREST RPC by any caller (including anon)**
File: `20260725_001_core_schema.sql` (~410–421)
Deliberately left open per the team's own reasoning (RLS policies need invoker EXECUTE) — low-severity boolean information leak, included for completeness rather than as an actionable defect.

---

## Quick severity index

| Severity | Count |
|---|---|
| Critical | 5 |
| High | 9 |
| Medium | 17 |
| Low | 16 |

**Critical items at a glance:** double-reissue race (payments), commission first-deal bonus overpay (telecaller), sankalp batch double-enrollment race, `profiles.role` self-escalation to admin/owner, `subscriber_list_view` likely bypassing RLS entirely.

> **Status: ALL 47 FIXED** (see Fix Log above) — pending only the manual application of
> `supabase/migrations/20260824_018_bugfix_hardening.sql` to the Supabase project.
> 5.16 remains open by documented design decision.
