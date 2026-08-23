# 🕉️ PUNYATA — Sessions Progress Report
### What has been done so far — complete session-by-session log

> **Last updated:** 2026-08-23 · **Branch discipline:** work happens on `Staging`, Chirayu reviews & merges to `main` (protected, PR-only).
> **Repo:** `chirayusingodia/site-making-love` · **Supabase project:** `omjivlmfsikeqwndtlcn`
> **Builders:** Sessions 0–5 → Antigravity (Claude) · Session 6 onward → OpenCode + Kimi K3

---

## 📊 Status Snapshot

| Session | Scope | Status | Built by |
|---|---|---|---|
| Pre-sessions | Marketing site, design system, plan pages, checkout UI | ✅ Complete | Lovable / Antigravity |
| Session 0 | Core DB schema (20 tables) + RLS + seed data | ✅ Complete | Antigravity |
| Session 0.5 | Sankalp batch tracking schema | ✅ Complete | Antigravity |
| Session 1 | Admin Overview dashboard | ✅ Complete | Antigravity |
| Session 2 | Admin Subscribers module | ✅ Complete | Antigravity |
| Session 3 | Plans & Sevas Manager | ✅ Complete | Antigravity |
| (unnumbered) | Checkout address fields (`/checkout/grah`) | ✅ Complete | Antigravity |
| (unnumbered) | Plan-wise Sankalp name lists page | ✅ Complete | Antigravity |
| Session 4 | Proof Upload + Sankalp Batch Tracking (+ revision) | ✅ Complete | Antigravity |
| Session 5 | Sales Agents & Coupons Manager | ⏳ **NOT built** (only a role-safe API stub exists) | — |
| Session 6 | Razorpay Webhook + Payments Log + Reports | ✅ Complete | OpenCode + Kimi K3 |
| Session 6.5 | Owner/Admin two-tier role system | ✅ Complete | OpenCode + Kimi K3 |
| Session SFC | Signup-First Checkout (auth + real payments + post-purchase profile) | ✅ Code complete — **needs Supabase/Vercel/Razorpay config to go live** | OpenCode + Kimi K3 |
| Session 7 | SEO + Audit Log + Subscriber 360 polish | ⏳ Pending | — |

---

## 🎨 Pre-Session Work (Frontend / Marketing Site)

Built before the numbered backend sessions, mostly on Lovable + Antigravity, many incremental commits on `main`:

- Landing page with **"Daan Punya Aapka, Sewa Hamari"** / Punya Bank framing
- Plan cards (Basic ₹251/mo, Premium ₹399/mo, Premium Annual ₹4,101/yr) + plan comparison table with corrected frequencies and Hanuman Ji Chola Seva benefit row
- Seva pages with visual separation, fresh Pushkar hero banner, 8-slide carousel
- Lottie micro-animations with fallbacks, staggered layout transitions, FAQ accordion
- Checkout flow UI (`/checkout/$planId`), profile page, my-subscription page
- Design system: cream `#FDF3EB` + saffron `#D85A30`, Devanagari fonts, shadcn/ui component library
- **Tech stack locked:** TanStack Start (React 19 + Vite + Tailwind), Supabase, Razorpay, Cloudinary, Vercel

---

## ✅ Session 0 — Core Database Schema
**Commit:** `425bc6b` · **Migration:** `supabase/migrations/20260725_001_core_schema.sql` (+ `20260725_000_teardown.sql` for clean re-migration, commit `b77b83b`)

- 20 tables: `locations`, `teams`, `sevas`, `seva_schedule_rules`, `plans`, `plan_sevas`, `plan_addons`, `sales_agents`, `coupons`, `profiles`, `subscriptions`, `family_members`, `payments`, `seva_proofs`, `prasad_shipments`, `notifications`, `page_seo`, `blog_posts`, `audit_logs`, `plan_history`
- **RLS enabled on all tables** — users read only their own data; admin full access via `public.is_admin()` SECURITY DEFINER helper; public-read on catalog tables (`plans`, `sevas`, `locations`, `teams`, `page_seo`, `blog_posts`)
- Seed data: Pushkar location only, current tier composition via `plan_sevas`
- **Architecture rules baked in:** soft-delete only (`is_active`), plan→seva mapping DB-driven only, no hardcoding

## ✅ Session 0.5 — Sankalp Batch Tracking Schema
**Commit:** `46d37cd` · **Migration:** `20260725_002_batch_tracking.sql`

- New tables: `sankalp_batches`, `sankalp_batch_subscriptions`, `plan_history`
- Added `dob` to `family_members` (for future birthday pooja add-on)
- Foundation for the twice-monthly First-Tuesday / Last-Saturday batch model

## ✅ Session 1 — Admin Overview Dashboard
**Commit:** `519c570`

- `/admin/overview` live dashboard querying Supabase directly
- KPIs: active subs, MRR, this-month revenue, pending proofs, failed payments, paused subs

## ✅ Session 2 — Admin Subscribers Module
**Commits:** `2559d25`, `f9eedb4` (perf) · **Migration:** `20260725_003_subscriber_list_view.sql`

- `/admin/subscribers` — table, filters, CSV export, **Subscriber 360 modal** (family members, plan, status, agent attribution, coupon)
- Perf pass: **server-side pagination** + Postgres `subscriber_list_view` (joins primary family member) + **batched CSV export** — designed for 500+ subscriber scale

## ✅ Session 3 — Plans & Sevas Manager
**Commit:** `9117a82`

- `/admin/plans-sevas` — CRUD for `plans`, `sevas`, `seva_schedule_rules`
- **Live `plan_sevas` assignment UI** — the primary tool for tier reassignment, zero deploys needed
- Fixed subscribers module TSC errors in same pass

## ✅ Checkout Address Step (unnumbered)
**Commit:** `61bb59e`

- `profiles` gained `address_line1`, `address_line2`, `state`, `pincode` (single reusable address per profile)
- `/checkout/grah` address step with **bilingual labels (Hindi + English)**; build script updated

## ✅ Plan-Wise Sankalp Name Lists (unnumbered)
**Commit:** `21e4ecd`

- `/admin/sankalp-lists` — plan-wise name-gotra lists for Pandit ji
- **Privacy constraint honoured:** only seva name(s) + plain name-gotra — never plan name, phone, or price shown to Pandit ji

## ✅ Session 4 — Proof Upload + Sankalp Batch Tracking
**Commit:** `d8fa5e6` · **Migrations:** `20260801_004_session4_proof_delivery.sql`, `20260801_005_segment_video_revision.sql` (revision)

The most complex module. What was built:

- `/admin/proof-upload` — batch-based proof upload flow
- `/admin/pandit/$batchId` — Pandit-facing printable export
- `sankalp_batches` + `sankalp_batch_subscriptions` + new `proof_deliveries` table (migration 004) + `segment_number` link
- **Independent batch logic:** Tuesday and Saturday batches are fully separate; "Mark Seva Completed" per batch locks timestamp + subscriber count; lock also triggers idempotently on first download click
- **Status labels:** Done / Pending / Missed (never "Covered")
- **Revision (migration 005) — tier-pure segment videos:**
  - ONE combined externally-edited video per segment (that segment's sevas + name-reading)
  - **Segments are tier-pure** — never mix Basic/Premium in one segment
  - **Segment size = 5 subscriptions** (up to 20 names)
  - 1 WhatsApp message per subscriber → their segment's video
  - `wa.me` pre-filled link delivery stub (Meta Cloud API pending approval)
  - **"Mark Sent Manually" bypass** for direct sends at low volume
  - Cloudinary path: `punyata-proofs/{year}-{month}/{batch_type}/segments/segment-{n}/`
  - `seva_proofs` table **deprecated for new writes** (retained for backward compat)
- Supporting libs: `src/lib/sankalp-logic.ts`, `src/lib/cloudinary-upload.ts`, API `src/routes/api/sankalp/generate-batch.ts`, `src/routes/api/cloudinary/sign-upload.ts`
- Verified by `scratch/verify_session4.ts`, `scratch/verify_sankalp_lists.tsx`

## ✅ Session 6 — Razorpay Webhook + Payments Log + Reports
**Commits:** `cb2d411` (WIP), `0353589` (finish) · **Completed 2026-08-01**

- **`/api/payments/webhook`** (`src/routes/api/payments/webhook.ts`, logic in `src/lib/razorpay-webhook.server.ts`):
  - HMAC-SHA256 signature verification against `RAZORPAY_WEBHOOK_SECRET` (mandatory)
  - All 7 subscription events handled: `activated`, `charged`, `payment.failed`, `paused`, `resumed`, `cancelled`, `completed`
  - **Webhook-driven activation only** — frontend never sets `status='active'`
  - 3-consecutive-failure demotion of subscription to `pending`
  - Idempotent payment upserts on `razorpay_payment_id`
  - Audit rows written with `admin_id NULL` (system actor)
- **`/admin/payments`** — payments log page (+ API `src/routes/api/admin/payments/list.ts`)
- **`/admin/reports`** — subscriber / revenue / seva-completion / pending-sevas reports + CSV/PDF-via-print export
  - APIs: `src/routes/api/admin/reports/monthly.ts`, `pending-sevas.ts`, `export.ts`, `overview-financials.ts`
  - Logic: `src/lib/reports-logic.ts`, `reports-data.server.ts`, `payments-logic.ts`, `financials-logic.ts`
- Verified by `scratch/verify_webhook.ts` — **64 checks passed**
- **Live-schema corrections noted:** `start_date`/`next_billing_date` are `date` (not timestamptz) in live DB

## ✅ Session 6.5 — Owner/Admin Two-Tier Role System
**Commit:** `0353589` · **Migrations:** `20260801_006_owner_role_check.sql`, `20260801_007_owner_rls_superset.sql`

- **`profiles.role` CHECK** extended to `('user','admin','owner','agent')`
- **OWNER** = superset of admin + all financial visibility (`/admin/reports`, MRR/revenue, payment amounts, Razorpay IDs, agent commission)
- **ADMIN** = full operational access, **zero financial visibility**
- `is_admin()` helper updated to `role IN ('admin','owner')` — automatically extends all **40 existing admin RLS policies** to owner (superset, not replacement)
- **Role-shaped APIs:** `overview-financials`, payments list, and `src/routes/api/admin/sales-agents/list.ts` mask financial fields for admin-role callers
- `src/lib/sales-agents-logic.ts` — pure masking functions: admin sees name/phone/agent_code/attribution count; `commission_percent` masked (owner-only)
- Verified by `scratch/verify_owner_roles.ts`

---

## ✅ Session SFC — Signup-First Checkout Flow
**Commit:** `afd62b3` (+ follow-up docs commit) · **Migration:** `20260822_011_signup_first_checkout.sql` · **Completed 2026-08-22**
**Brief:** `SESSION_SIGNUP_FIRST_CHECKOUT_PROMPT.md`

Funnel reorder (supersedes the old v3 §8 order): **login happens FIRST**, plan purchase is
one click post-login, family/address details move to AFTER payment and are fully optional.

- **Auth (Supabase phone OTP — SMS/voice, no WhatsApp vendor):**
  - `/login` — one combined Login/Signup form (matched by phone; new number → auth user +
    profiles row created with typed name; known number → typed name IGNORED, no duplicates)
  - `POST /api/auth/request-otp` (server) + client-side `verifyOtp` (deliberate: session must
    land in the browser; a server verify route would burn the single-use code)
  - `?redirect=` preserved so post-login users return to the exact plan's buy step
- **Checkout rewritten** (`/checkout/$planId`): session gate → plan + price + own name/phone →
  optional coupon → single "Confirm & Pay" → Razorpay Checkout (subscription_id based)
- **`POST /api/subscriptions/create-checkout`:** pending subscriptions row + Razorpay
  Subscription created, `razorpay_sub_id` linked BEFORE checkout opens. Activation stays
  webhook-exclusive.
- **Coupons kept (§3c):** `/api/coupons/validate` + attribution (`coupon_id` + RZP notes).
  Charged amount remains the Razorpay plan price until dashboard Offers are linked (v3 §9 risk) — flagged, not silently mis-charged.
- **Post-purchase:** `/subscription-success` (banner + shared FamilyAddressForm + explicit skip);
  same component permanently on `/profile`; `/profile` & `/my-subscription` now fully real-data via RLS.
- **Sankalp Pending (§3b):** 0-family-member subs are valid; derived flag only
  (`family_member_count === 0`). Pandit list excludes them (tracked in batch rows, never
  fabricated names); `/admin/subscribers` gains the call-queue filter (oldest-purchase-first)
  + badge. Variable family size verified safe (segments count subscriptions, not names).
- **Migration 011:** `profiles` address columns only — `family_members` verified to need no relaxation.
- **Server helpers added:** `requireUser`/`getUserClient` in `supabase-admin.server.ts`;
  new server libs `auth.server.ts`, `razorpay.server.ts`, `coupons.server.ts`, `subscriptions-checkout.server.ts`.
- **Verified:** tsc clean · ESLint clean (new files) · production build passes · schedule tests pass.

### ⚠️ Go-live config still needed (code is done, infra is not):
1. Apply migration `20260822_011` in Supabase
2. Supabase Auth → enable Phone provider + set refresh-token expiry to 30 days
3. Vercel env: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
4. Admin: set each plan's `razorpay_plan_id` (checkout returns 503 without it)
5. Decide coupon money handling (Razorpay Offer linkage vs manual credit) before public advertising

---

## ✅ Session TOA — Subscription Tenure + OTP Abuse Protection
**Brief:** `SESSION_TENURE_AND_OTP_ABUSE_PROMPT.md` · **Date:** 2026-08-23 · **Migration:** `20260823_016_otp_rate_limit.sql`

Two targeted fixes flagged after the SFC review.

- **1. Subscriptions run until cancelled, not 1 year** (`subscriptions-checkout.server.ts`):
  - Old hardcoded `total_count = 12` (monthly) / `5` (yearly) replaced with
    **`SUBSCRIPTION_MAX_YEARS = 100`** → derived via `totalCountForBillingPeriod()`:
    **monthly = 1200 cycles · yearly = 100 cycles** (Razorpay's documented 100-year max;
    no "forever" flag exists — cancellation remains the only ending).
  - `CYCLES_PER_YEAR` is an exhaustive `Record<billing_period, number>`: a third period
    value (weekly/daily) fails to compile until mapped — never silently unhandled.
  - `createRazorpaySubscription()` now REQUIRES `totalCount` (the old `?? 12` fallback is gone).
  - **Existing-subscription census:** `scratch/report_subscription_tenure.ts` reports
    **ZERO linked subscriptions in the DB** — nobody carries the old short mandate; nothing
    to escalate to Razorpay support. Re-run any time (View B groups by Razorpay's actual
    entity `total_count` when test/live keys are present).
- **2. OTP abuse protection on `/api/auth/request-otp`** (three layers):
  - **Layer 1 (Chirayu, dashboard-only):** tighten Authentication → Rate Limits → SMS send
    limit. Not code-controllable — see action items below.
  - **Layer 2 (Turnstile CAPTCHA):** `/login` renders a Turnstile widget when
    `VITE_TURNSTILE_SITE_KEY` is set (`src/lib/turnstile.ts`, dependency-free loader,
    `interaction-only` appearance). Host stays mounted across form→OTP steps so resends get
    fresh single-use tokens. Server half (`src/lib/turnstile.server.ts`) picks ONE mode by env:
    `TURNSTILE_SECRET_KEY` set → app verifies via Cloudflare siteverify (fail-closed, works
    without touching Supabase); absent → token rides through `signInWithOtp options.captchaToken`
    per Supabase's documented CAPTCHA integration (enforces once the secret is set in the
    Supabase dashboard). Tokens are never double-consumed.
  - **Layer 3 (Postgres ledger):** new `otp_send_log` table (phone, ip, allowed, reason,
    created_at; RLS on, ZERO policies = service-role only) + `otp_send_ip_phone_count()`
    RPC for the distinct-phone count PostgREST can't do. `requestOtpForPhone`
    (`auth.server.ts`) enforces BEFORE any auth/SMS work and logs EVERY attempt:
    **per phone ≤ 3/10 min and ≤ 8/24 h · per IP ≤ 5 distinct phones/hour**
    (tunable constants: `OTP_RATE_LIMITS` in `auth.server.ts`). All rejections answer
    **429 + one generic message** ("Thodi der baad try karein") — never which limit fired.
    Ledger missing (migration unapplied) → degrades OPEN with a loud console warning so a
    merge never bricks login; any OTHER ledger error fails CLOSED.
  - Route extracts client IP from `cf-connecting-ip` / first `x-forwarded-for` hop / `x-real-ip`.
- **OTP guess-limiting (verify step): NOT custom-built** per brief — that's Supabase's job
  (GoTrue tracks attempts internally, invalidates after repeated wrong codes). Chirayu must
  eyeball it in the dashboard (action item 4 below); nothing in the repo can confirm it.
- **Verified:** tsc clean · ESLint clean (all touched files) · production build passes ·
  `scratch/verify_otp_abuse.ts` 21/21 checks (limits fire, blocked+allowed attempts logged,
  fail-open-on-missing vs fail-closed-on-broken, captcha threading).

### ⚠️ Action items for Chirayu (config only — code is done):
1. **Apply migration `20260823_016_otp_rate_limit.sql`** in Supabase SQL editor — until then
   OTP rate limiting is INACTIVE (server logs one loud warning per boot).
2. **Supabase → Authentication → Rate Limits → SMS/phone OTP send limit** — check & tighten
   (default ~30/hr is generous for SMS-pumping protection). Dashboard-only setting.
3. **Turnstile:** create a free widget at Cloudflare → add `VITE_TURNSTILE_SITE_KEY` to
   Vercel env (client). Then EITHER put the matching secret in `TURNSTILE_SECRET_KEY`
   (recommended: app-level enforcement, live immediately) OR enable CAPTCHA protection in
   Supabase Auth with the same Turnstile secret (passthrough mode activates).
   Dev shortcut: Turnstile test keys (`1x00000000000000000000AA` site / `1x0000000000000000000000000000000AA` secret) always pass.
4. **Confirm OTP-guess limit:** Supabase Auth rate-limits `/auth/v1/verify` (token
   verification) per IP by default (~360/hr w/ bursts) and invalidates codes after repeated
   wrong attempts — verify under Authentication → Rate Limits that "Verification requests"
   hasn't been loosened. No custom code built for this, as decided.
5. Optional Razorpay proof: run `scratch/verify_checkout_tenure.ts` with TEST-mode keys +
   a monthly `RAZORPAY_TEST_PLAN_ID` to assert `total_count=1200` against the created
   entity (auto-cancels afterwards). Needs keys not present locally.
6. Note: because OTP sends go through our server (service-role), Supabase's own per-IP SMS
   throttling sees ONE ip (ours) unless IP forwarding is enabled — one more reason Layer 3
   lives in our code.

---

## ⏳ NOT DONE YET — Remaining Scope

### Session 5 — Sales Agents & Coupons Manager ⚠️
**Status: essentially NOT built.** Only a role-safe API stub (`/api/admin/sales-agents/list` + `sales-agents-logic.ts`) exists, created during Session 6.5 so the future UI can never leak commission data to admins. Still needed:
- `/admin/sales-agents` UI — CRUD agents, commission attribution, referral links (`punyata.com/r/FM_XXXX`)
- `/admin/coupons` UI — CRUD, visibility control (`public`/`private`/`agent_assigned`), redemption stats
- Frontend referral-code capture → `subscriptions.sales_agent_id` attribution

### Session 7 — SEO + Audit Log + Polish
- `/admin/seo` — `page_seo` + `blog_posts` editor
- `/admin/audit-log` viewer (table already receives rows from webhook + admin actions)
- Subscriber 360 dashboard polish
- Prasad Box Tracking UI (module 8 — table exists, no UI)

### Cross-cutting items still open
- **Razorpay plan-upgrade flow (UNRESOLVED):** UPI-authorized subscriptions can't be updated via API once mandated — needs cancel + re-mandate decision before upgrade UX is built
- **Meta WhatsApp Business API:** pending Meta approval; `wa.me` manual fallback active; `whatsapp_msg_id` columns ready for when API lands
- **Birthday pooja add-on:** `family_members.dob` captured; needs cron (2–3 days ahead) + one-time Razorpay Payment Links/Orders charge
- **Prasad shipments UI:** `prasad_shipments` table ready, no admin UI yet
- **Locations & Teams Manager UI** (module 4): CRUD not built (Pushkar-only seed data suffices today)
- **Email (Resend):** transactional email not yet wired
- **punyata.in → punyata.com 308 redirect:** DNS/Hostinger config item
- **Multi-location:** schema-ready from day one; only Pushkar is user-visible (by design until a second location is genuinely ready)

---

## 🗂️ Key Files Map (quick reference)

| Area | Path |
|---|---|
| Migrations | `supabase/migrations/20260725_000` … `20260822_011` (12 files) |
| Admin pages | `src/routes/admin.{overview,subscribers,plans-sevas,sankalp-lists,proof-upload,pandit.$batchId,payments,reports}.tsx` |
| User pages | `src/routes/{login,checkout.$planId,subscription-success,profile,my-subscription}.tsx` |
| Server APIs | `src/routes/api/payments/webhook.ts`, `api/auth/request-otp.ts`, `api/subscriptions/create-checkout.ts`, `api/coupons/validate.ts`, `api/profile/{family-members,address}.ts`, `api/admin/{payments,reports,sales-agents}/...`, `api/sankalp/generate-batch.ts`, `api/cloudinary/sign-upload.ts` |
| Business logic | `src/lib/{sankalp-logic,plans,payments-logic,reports-logic,financials-logic,sales-agents-logic,coupons.server}.ts` |
| Server-only | `src/lib/{razorpay-webhook.server,razorpay.server,auth.server,subscriptions-checkout.server,reports-data.server,supabase-admin.server,turnstile.server,config.server}.ts` |
| Client auth | `src/lib/auth-api.ts`, `src/lib/turnstile.ts`, `src/hooks/use-session.ts`, `src/components/profile-completion.tsx` |
| Verification scripts | `scratch/verify_{session4,webhook,owner_roles,sankalp_lists,otp_abuse,checkout_tenure}.ts`, `scratch/report_subscription_tenure.ts` (+ `scratch/ts-aliases.mjs` loader hook for plain-node runs) |
| Master context doc | `PUNYATA_MASTER_CONTEXT_v3 (1).md` (single source of truth — read before any new session) |
| Session briefs | `SESSION_SIGNUP_FIRST_CHECKOUT_PROMPT.md`, `SESSION_TENURE_AND_OTP_ABUSE_PROMPT.md` |

---

*🚩 Sewa Hamari, Punya Aapka 🚩*
