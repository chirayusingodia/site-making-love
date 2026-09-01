# 🕉️ PUNYATA — Master Context Document (v4)
### "Sewa Hamari, Punya Aapka"

**Purpose of this document:** Single, self-contained brief for any AI agent (coding assistant, LLM,
consultant) to understand the entire Punyata product — business model, data architecture, operational
logic, admin system, API surface, and build status — in one read. This is **v4** and **supersedes**
`PUNYATA_MASTER_CONTEXT_v3.md` entirely. v3 was written before the telecaller panel, the hospital/agent
attribution model, the commission engine, and the halted-subscription gap existed — all four are now
core parts of the product and are documented here. v3 also described an "Occasional Pooja Pages" module
(schema, admin panel, public route) that was **never actually built** — it has been removed from this
version; see §22 for the full list of what v3 described but the repo does not contain.

If you are an AI coding agent picking this up: **read this fully before writing any code, schema, or
copy.** Where this document and the live repo disagree, the repo wins — say so rather than silently
picking one.

---

## 🆕 CHANGELOG — v3 → v4 (2026-08-23)

1. **Telecaller panel is a real, shipped sibling staff role** — `/telecaller`, a full lead pipeline, and
   a two-party commission engine (§9–§12 below). `profiles.role` is now
   `'user' | 'admin' | 'owner' | 'agent' | 'telecaller'`.
2. **Hospitals + field-agent attribution model** — a hospital is allotted to exactly one active field
   agent at a time; she sources leads there; a telecaller calls, hooks with a free pooja, and sends a
   WhatsApp registration link; both parties earn from separate commission pools (§10).
3. **Coupon codes were removed from the agent/telecaller flow entirely** (2026-08-23) — public,
   customer-facing coupons on the ordinary checkout are untouched and still exist.
4. **Owner performance leaderboard** (`/admin/performance`) — three lenses (telecaller / agent /
   hospital) built for four owner decisions: reward, reallocate, coach, cut (§12).
5. **Signup-first checkout is live** (superseded the old "family details during checkout" flow already
   in v3 §8 as an "UPDATED" note — now fully folded in, no longer marked as an update).
6. **Razorpay halted-subscription gap found and specced, not yet built** — the webhook never records
   Razorpay's own `subscription.halted` event, and there is no resume/reissue-link UI anywhere in the
   product. Migration `015` is specced (`SESSION_HALTED_SUBSCRIPTION_RECOVERY_PROMPT.md`) but not
   implemented as of this writing (§13).
7. **Razorpay subscription tenure fix (`total_count=1200`/`100`) is SPECCED BUT NOT YET APPLIED** —
   `subscriptions-checkout.server.ts` still hardcodes `TOTAL_COUNT_MONTHLY = 12` /
   `TOTAL_COUNT_YEARLY = 5` as of 2026-08-23. Do not assume this was fixed just because a spec exists.
8. **"Occasional Pooja Pages" (v3 §6A) was never built.** No `occasional_poojas` table, no
   `/occasion/:slug` route, no admin module exists anywhere in the repo — confirmed by a full-repo grep.
   Treat it as a shelved idea, not a shipped or in-progress feature, unless Chirayu explicitly revives it.
9. **Session 5 (Sales Agents & Coupons Manager admin UI) is still not built** — carried forward from v3,
   still true. The commission/attribution model that superseded its original purpose is now the
   telecaller/hospital flow in §10, not a coupon-code system.
10. Two independent code-review passes exist on the newer work (`REVIEW_TELECALLER_SESSION.md`,
    `REVIEW_HOSPITALS_SESSION.md`) with a mix of confirmed-fixed and still-open findings — see §21, the
    risk register. **Do not assume anything in those reviews is fixed unless §21 says so explicitly.**

Everything else in v3 (product overview, seva catalog, sankalp scheduling rules, brand/design system,
core architecture principles) carries forward unchanged and is restated below for a single-document read.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Repo / Branch Discipline](#3-repo--branch-discipline)
4. [Database Schema — Core (Migrations 001–011)](#4-database-schema--core-migrations-001011)
5. [Database Schema — Telecaller / Leads / Commissions / Hospitals (Migrations 012–014)](#5-database-schema--telecaller--leads--commissions--hospitals-migrations-012014)
6. [Product Catalog & Subscription Plans](#6-product-catalog--subscription-plans)
7. [Sankalp Scheduling Logic (Locked Business Rules)](#7-sankalp-scheduling-logic-locked-business-rules)
8. [Subscription Flow (Signup-First Checkout)](#8-subscription-flow-signup-first-checkout)
9. [Telecaller Panel & Role](#9-telecaller-panel--role)
10. [Hospitals, Field Agents & Lead Attribution](#10-hospitals-field-agents--lead-attribution)
11. [Commission Engine](#11-commission-engine)
12. [Owner Performance Leaderboard](#12-owner-performance-leaderboard)
13. [Razorpay Integration Flow (incl. known halted-subscription gap)](#13-razorpay-integration-flow-incl-known-halted-subscription-gap)
14. [Admin Dashboard — Actual Modules Today](#14-admin-dashboard--actual-modules-today)
15. [API Endpoints — Actual Surface Today](#15-api-endpoints--actual-surface-today)
16. [Frontend Pages & Components](#16-frontend-pages--components)
17. [WhatsApp Proof Delivery System](#17-whatsapp-proof-delivery-system)
18. [Security & Auth](#18-security--auth)
19. [Deployment Architecture](#19-deployment-architecture)
20. [Build Status & Session Sequence](#20-build-status--session-sequence)
21. [Risk Register — Known Bugs & Open Review Findings](#21-risk-register--known-bugs--open-review-findings)
22. [What v3 Described But Was Never Built](#22-what-v3-described-but-was-never-built)
23. [Future Enhancements / Roadmap](#23-future-enhancements--roadmap)
24. [Legal / Compliance](#24-legal--compliance)
25. [Core Architecture Principles](#25-core-architecture-principles)
26. [Communication & Working-Style Notes](#26-communication--working-style-notes)

---

## 1. Project Overview

**Punyata** (punyata.com) is a Hindu devotional **subscription platform**. Subscribers across India (and
the diaspora) pay a monthly/yearly fee, and Punyata performs religious rituals (sevas) on their behalf —
in the subscriber's family name and gotra — at **Tirth Guru Pushkarraj, Pushkar, Rajasthan**. After each
seva, Punyata sends photo/video proof to the family via WhatsApp.

**Tagline:** *"Sewa Hamari, Punya Aapka"* (also expressed as "Daan Punya Aapka, Sewa Hamari")

### Core positioning
Punyata is **not** a puja-booking marketplace and not a temple-visit product. It is the friction-remover
for daan-punya (charity + religious merit): people want to do right by their family's religious
obligations but don't have time, aren't near a temple, or don't know the correct process. Punyata is the
subscriber's **"Punya Bank"** — a running, trustworthy ledger of religious merit accumulated on their
behalf, month after month, with WhatsApp proof as the receipt.

Every product decision, copy line, and UX flow should reinforce: **convenience + trust + accumulation** —
never "book a puja," never a marketplace/browse experience.

### What NOT to build (hard constraints)
- ❌ A generic "browse temples / pick a priest / choose a time slot" marketplace UX
- ❌ Docker / Docker Compose / MySQL / standalone Express server
- ❌ A location/deity picker visible to users today — only Pushkar is shown until a second location is
  genuinely ready to launch
- ❌ Full frontend teardown — extend the existing design system, don't rebuild from zero
- ❌ Never expose to the Pandit ji anything beyond: seva name(s) + plain name-gotra list per sankalp.
  Never plan name, phone number, or price.
- ❌ Never use the status label "Covered" in admin UI — flagged as confusing. Use **Done / Pending /
  Missed** only.
- ❌ Never grandfather old plan compositions — plan/seva changes apply immediately to all current
  subscribers.
- ❌ Never hard-delete `plans`, `sevas`, `sales_agents`, `coupons`, `hospitals`, or agent allotments —
  soft-delete/deactivate only.
- ❌ Never activate a subscription from the frontend or from any admin/telecaller route — activation is
  **webhook-driven only** (`/api/payments/webhook`, backed by `razorpay-webhook.server.ts`). No other code
  path in the product may ever set `subscriptions.status = 'active'`.
- ❌ Never hardcode which sevas belong to which plan in frontend code — this mapping must be fully
  admin-editable (`plan_sevas`).
- ❌ **No coupon codes anywhere in the telecaller/agent flow** — neither the telecaller nor the field
  agent holds or issues a discount code to a customer. Attribution in that flow rides on the WhatsApp
  registration link token and a verbal "which agent gave you this number?" backup — never a coupon.
  Ordinary public/customer-facing coupons on the normal `/checkout/:planId` flow are a **separate,
  untouched** feature and still exist.
- ❌ Never widen `public.is_admin()` to include `telecaller` or `agent` roles — 40+ RLS policies key off
  that one function; both newer roles get **zero direct RLS grants** and reach data only through
  service-role-gated API routes with explicit field allowlists.

### Target audience
- Primary: Urban IT/metro professionals, late 20s–early 40s, who feel guilt about not personally
  performing family religious duties
- Secondary: Indian diaspora abroad

### Founder / operating context
Solo founder: **Chirayu**. Always bias toward the **lowest-maintenance viable architecture**. No infra
requiring an always-on paid server; no unnecessary complexity. Chirayu builds via OpenCode + Kimi K3 (or
oxAlpha) in his own terminal; reviews are done by Claude reading the actual repo files against each
session's brief, not the session's self-reported summary.

---

## 2. Tech Stack (mandatory)

```
Frontend   : TanStack Start (React 19 + Vite + Tailwind CSS)
Backend    : TanStack Start server routes (src/routes/api/**) — privileged ops requiring secret keys only
Database   : Supabase (PostgreSQL) with Row Level Security
Auth       : Supabase Auth (phone OTP — SMS/voice; NOT WhatsApp for OTP)
Storage    : Cloudinary (proof images/videos, card assets)
Payments   : Razorpay Subscriptions API (UPI AutoPay / card primary, recurring)
WhatsApp   : Meta WhatsApp Business API — pending Meta approval, proof-delivery-scoped only when it
             lands; wa.me manual link fallback is ACTIVE today for both proof delivery and telecaller
             payment-link sends. No bulk WhatsApp/SMS blast capability exists or is planned near-term.
Email      : Resend (transactional) — not yet wired as of this writing
Hosting    : Vercel (or equivalent Node-serverless host) for the TanStack Start app, Hostinger DNS
Animation  : Framer Motion, Lottie (lottie-react)
```

**Explicitly excluded:** Docker, MySQL, standalone Express, NextAuth-from-scratch, Multer, Prisma,
generic multi-vendor "browse & book" marketplace UX.

### Brand / design system
- Palette: cream `#FDF3EB` / `#FDFBF7`, saffron-orange `#D85A30` / amber — **no purple/violet/indigo,
  ever**
- Devanagari-supporting fonts retained from existing design system
- Extend the existing component library (`src/components/ui`, shadcn/ui-based) rather than tearing down
  and rebuilding

---

## 3. Repo / Branch Discipline

- GitHub: `chirayusingodia/site-making-love` (the actual project folder inside the repo is
  `site-making-love/`)
- Chirayu codes sessions via **OpenCode terminal**, model-agnostic between **Kimi K3** (Moonshot AI) and
  **oxAlpha** — session prompt files are written to be usable by either
- Supabase project: **"Punyata"**, project ID `omjivlmfsikeqwndtlcn`
- Work happens on `Staging`; Chirayu personally reviews (increasingly with an independent AI review pass
  against the real files, not the session's own summary — see §21) and merges `staging` → `main`
- House format for session briefs: `SESSION_<TOPIC>_PROMPT.md` files in the repo root, each with a
  pre-flight repo-reality check, numbered fix sections, and a "Definition of done" checklist at the end.
  Review passes are written to `REVIEW_<TOPIC>_SESSION.md` in the same root.

---

## 4. Database Schema — Core (Migrations 001–011)

Source of truth is `supabase/migrations/*.sql`, not this document — always verify against the live
migration files before relying on exact column names/types. What follows is the settled shape as of
migration `011`.

```sql
-- LOCATIONS / DEITIES (multi-location-ready; today, seed only Pushkar)
create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null, deity_name text, city text, state text,
  is_active boolean default true, created_at timestamptz default now()
);

-- TEAMS
create table teams (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id), name text not null, contact_phone text,
  is_active boolean default true, created_at timestamptz default now()
);

-- SEVA CATALOG
create table sevas (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique not null, description text,
  location_id uuid references locations(id), requires_sankalp boolean default true,
  is_active boolean default true, sort_order int default 0, created_at timestamptz default now()
);

-- SEVA SCHEDULE RULES (schedule lives at SEVA level, never at plan level)
create table seva_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  seva_id uuid references sevas(id),
  weekday text,      -- 'TUE', 'SAT'
  occurrence text,   -- 'second' for TUE (was 'first' — see §7), 'last' for SAT
  created_at timestamptz default now()
);

-- SUBSCRIPTION PLANS
create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique not null, price_paise int not null,
  billing_period text not null,      -- 'monthly' | 'yearly'
  razorpay_plan_id text,             -- checkout returns 503 if null — plan not sellable yet
  location_id uuid references locations(id), default_team_id uuid references teams(id),
  tagline text, highlight_text text, features jsonb, card_image_url text,
  is_active boolean default true, sort_order int default 0, created_at timestamptz default now()
);

create table plan_sevas ( plan_id uuid references plans(id), seva_id uuid references sevas(id),
  primary key (plan_id, seva_id) );
create table plan_addons ( id uuid primary key default gen_random_uuid(), plan_id uuid references plans(id),
  addon_type text not null, description text, is_active boolean default true,
  created_at timestamptz default now() );
create table plan_history ( id uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscriptions(id), old_plan_id uuid references plans(id),
  new_plan_id uuid references plans(id), changed_at timestamptz default now(),
  changed_by uuid references profiles(id) );

-- SALES AGENTS (legacy commission_percent field now DEPRECATED FOR READS —
-- see §11, superseded by staff_commission_rates history table)
create table sales_agents (
  id uuid primary key default gen_random_uuid(), full_name text not null, phone text unique,
  agent_code text unique not null, commission_percent numeric,
  is_active boolean default true, created_at timestamptz default now()
);

-- COUPONS (public/customer-facing only as of 2026-08-23 — 'agent' visibility DEPRECATED, not dropped)
create table coupons (
  id uuid primary key default gen_random_uuid(), code text unique not null,
  discount_type text not null, discount_value int not null, applicable_plans uuid[],
  visibility text default 'public',        -- 'agent' visibility deprecated, kept for history
  is_customer_facing boolean default true, assigned_to_user_id uuid references profiles(id),
  assigned_to_agent_id uuid references sales_agents(id), max_redemptions int, times_redeemed int default 0,
  valid_from timestamptz, valid_until timestamptz, is_active boolean default true,
  created_at timestamptz default now()
);

-- PROFILES — role now has 5 values as of migration 012, see §9
create table profiles (
  id uuid primary key references auth.users(id), full_name text not null, phone text unique not null,
  email text, city text, country text default 'India',
  role text default 'user',    -- 'user' | 'admin' | 'owner' | 'agent' | 'telecaller'
  address_line1 text, address_line2 text, state text, pincode text,   -- added migration 011
  do_not_call boolean,          -- telecaller-mutable flag added migration 012
  alt_phone text,               -- added migration 024: separate CALLING number, only set
                                 -- when different from `phone` (which stays the WhatsApp
                                 -- number). Collected via a checkbox on /complete-profile
                                 -- ("kya WhatsApp aur calling number same hai?"). NULL =
                                 -- same as phone. Telecaller panel + admin.subscribers both
                                 -- prefer alt_phone over phone for dialing/display when set.
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- SUBSCRIPTIONS — this table's status is THE single most-guarded piece of state
-- in the whole product. See §25 and the webhook-only activation rule.
create table subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id),
  plan_id uuid references plans(id), coupon_id uuid references coupons(id),
  sales_agent_id uuid references sales_agents(id),     -- FIELD agent who sourced the sale (see §10)
  telecaller_id uuid,                                   -- write-once, closing telecaller (migration 012)
  attribution_source text, attributed_at timestamptz,   -- how telecaller_id was set (migration 012)
  razorpay_sub_id text unique, razorpay_customer_id text,
  status text not null default 'pending'
    check (status in ('pending','active','paused','cancelled','expired')),  -- 'halted' PENDING migration 015, see §13
  start_date date, next_billing_date date, paused_at timestamptz, cancelled_at timestamptz,
  cancel_reason text, acquisition_channel text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
-- Activation is WEBHOOK-DRIVEN ONLY. Never set status='active' from anywhere else.
-- start_date / next_billing_date are DATE, not timestamptz, in the live schema (corrected during Session 6).

-- FAMILY MEMBERS — up to 4 per subscription, slot 1 required, variable size (1-4) supported
create table family_members (
  id uuid primary key default gen_random_uuid(), subscription_id uuid references subscriptions(id),
  full_name text not null, gotra text, relation text,
  slot_number int not null check (slot_number between 1 and 4),
  is_primary boolean default false, dob date, created_at timestamptz default now(),
  unique (subscription_id, slot_number)
);

-- PAYMENTS — status literally 'captured' | 'failed' | 'refunded' | 'pending'.
-- 'captured' is the ONLY status that should ever count toward revenue/commission.
create table payments (
  id uuid primary key default gen_random_uuid(), subscription_id uuid references subscriptions(id),
  razorpay_payment_id text unique, razorpay_order_id text, amount_paise int not null,
  status text not null check (status in ('captured','failed','refunded','pending')),
  method text, cycle_number int, paid_at timestamptz, failure_reason text,
  created_at timestamptz default now()
);

-- SANKALP BATCHES — one row per (batch_type, batch_date), UNIQUE-enforced (sankalp_variant retired, mig. 010)
create table sankalp_batches (
  id uuid primary key default gen_random_uuid(),
  batch_type text not null,     -- 'second_tuesday' (was 'first_tuesday') | 'last_saturday'
  batch_date date not null, status text default 'pending',   -- pending | done | missed (never "Covered")
  completed_at timestamptz, subscriber_count int, created_at timestamptz default now()
);
create table sankalp_batch_subscriptions (
  id uuid primary key default gen_random_uuid(), batch_id uuid references sankalp_batches(id),
  subscription_id uuid references subscriptions(id), is_catchup boolean default false,
  created_at timestamptz default now()
);

-- SEVA PROOF (legacy, deprecated for new writes as of the segment-video revision — see §17)
create table seva_proofs (
  id uuid primary key default gen_random_uuid(), batch_id uuid references sankalp_batches(id),
  seva_id uuid references sevas(id), team_id uuid references teams(id), month int not null, year int not null,
  media_url text not null, media_type text default 'image', caption text, is_delivered boolean default false,
  delivered_at timestamptz, whatsapp_msg_id text, uploaded_by uuid references profiles(id),
  created_at timestamptz default now()
);
-- proof_deliveries + name_segments (segment-video model, Session 4 revision) are the live delivery path —
-- see §17. SEGMENT_SIZE_SUBSCRIPTIONS = 5 (5 subscriptions/families per segment, up to 20 names/video).

-- PRASAD SHIPMENTS (table exists, no admin UI built — see §22)
create table prasad_shipments (
  id uuid primary key default gen_random_uuid(), subscription_id uuid references subscriptions(id),
  month int, year int, status text default 'pending', tracking_id text,
  shipped_at timestamptz, delivered_at timestamptz, created_at timestamptz default now()
);

-- NOTIFICATIONS LOG (used today by the telecaller payment-link flow — see §10)
create table notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id),
  type text not null, channel text not null, message text, status text, meta jsonb,
  sent_at timestamptz default now()
);

-- SEO / BLOG (table exists, no admin UI built — see §22)
create table page_seo ( id uuid primary key default gen_random_uuid(), path text unique not null,
  title text, meta_description text, og_image_url text, updated_at timestamptz default now() );
create table blog_posts ( id uuid primary key default gen_random_uuid(), slug text unique not null,
  title text not null, body_md text, cover_image_url text, is_published boolean default false,
  published_at timestamptz, created_at timestamptz default now() );

-- AUDIT LOG — append-only trail. Webhook events, admin actions, and (as of migration 012) every
-- telecaller mutating endpoint all write here (system actor = admin_id NULL).
create table audit_logs (
  id uuid primary key default gen_random_uuid(), admin_id uuid references profiles(id),
  action text not null, entity text, entity_id uuid, meta jsonb, created_at timestamptz default now()
);
```

**Migration history, 001–011:**

| Migration | What it did |
|---|---|
| `000_teardown` | Clean re-migration helper |
| `001_core_schema` | All ~20 core tables above + RLS + `is_admin()` helper + seed data (Pushkar only) |
| `002_batch_tracking` | `sankalp_batches`, `sankalp_batch_subscriptions`, `plan_history`, `family_members.dob` |
| `003_subscriber_list_view` | Postgres view joining primary family member, for admin subscriber list perf |
| `004_session4_proof_delivery` | `proof_deliveries` table, segment linking |
| `005_segment_video_revision` | Tier-pure segment videos, `SEGMENT_SIZE_SUBSCRIPTIONS = 5`, `seva_proofs` deprecated for new writes |
| `006_owner_role_check` | `profiles.role` CHECK widened to add `'owner'`, `'agent'` |
| `007_owner_rls_superset` | `is_admin()` → `role IN ('admin','owner')`, extending all admin RLS as a superset, not a replacement |
| `008_list_a_second_tuesday` | List A day: First Tuesday → **Second Tuesday** (see §7) |
| `009_retire_first_tuesday` | Cleanup of old "first Tuesday" labeling/data |
| `010_retire_sankalp_variant` | Dropped `sankalp_variant` column; added UNIQUE `(batch_type, batch_date)` — fixed a real double-enrollment bug on List B |
| `011_signup_first_checkout` | `profiles` gains `address_line1/2, state, pincode` — no other schema change needed for the funnel reorder |

---

## 5. Database Schema — Telecaller / Leads / Commissions / Hospitals (Migrations 012–014)

**Migration `012_telecaller_role`:**
- `profiles.role` CHECK widened to add `'telecaller'` — a **sibling** staff role, not an admin subset.
  `is_admin()` is deliberately **not** widened to include it.
- `profiles.do_not_call boolean` — telecaller-mutable, log-call endpoint can set it.
- `subscriptions.telecaller_id`, `attribution_source`, `attributed_at` — write-once closing-telecaller
  stamp.
- New table `call_logs` — every call attempt a telecaller makes, with an outcome enum (`no_answer`,
  `connected_interested`, `connected_completed`, `connected_partial`, etc.).
- `is_telecaller()` SECURITY DEFINER helper added (unwired at this stage, used later).

**Migration `013_leads_and_commissions`:**
- New table `leads` — the field-agent → telecaller pipeline. Carries `source_agent_id`,
  `attribution_token`, `profile_id`, `status` (`new`/`assigned`/`in_progress`/`link_sent`/`converted`/…),
  and (added in migration 014) `hospital_id`, `named_agent_id`, `free_pooja_at`, `free_pooja_by`.
- New table `staff_commission_rates` — **trail rate history**, `kind` CHECK-constrained to `'trail'`
  only (deliberately no first-deal row type — see §11). `btree_gist` exclusion constraint prevents
  overlapping effective-date rate periods for the same person.
- New table `commission_entries` — the append-only ledger. `percent_applied` is written per-entry
  (never re-derived from today's constant), `base_paise` stored alongside every entry, `kind` in
  (`first_deal`, `trail`), status in (`held`, `payable`, `clawed_back`, `void`), XOR check that exactly
  one of `agent_id`/`telecaller_id` (beneficiary) is set, idempotency unique index on
  `(payment_id, beneficiary, kind, payout_period)` using `NULLS NOT DISTINCT`.
- New table `commission_payout_periods` — lets the owner **lock** a payout month so a late refund or a
  stale reconciler run can't rewrite it.
- SECURITY DEFINER functions `assign_leads()`, `roll_over_stale_leads()`, `expire_stale_leads()` — **must**
  carry explicit `REVOKE EXECUTE FROM public, anon, authenticated` (see §21, C1 — confirmed present in
  the applied SQL per Chirayu's follow-up).

**Migration `014_hospitals_perf`:**
- New table `hospitals` — a physical site a field agent can be allotted to.
- New table `agent_hospital_allotments` — `btree_gist` no-overlap exclusion constraint: **one hospital →
  one active agent at a time**; an agent can hold many hospitals. `current_hospital_agent()` SECURITY
  DEFINER helper (REVOKEd) resolves who currently holds a hospital.
- `reallot_hospital()` SECURITY DEFINER function to move a hospital to a different agent.
- `leads` gains `hospital_id`, `named_agent_id` (the customer's own verbal "which agent gave you this
  number?" answer), `free_pooja_at`, `free_pooja_by` — the free-pooja funnel event is captured as an
  optional stamp on the existing `log-call` endpoint, **not** a new `call_logs` outcome enum value.
- Coupon **agent-visibility widening removed**: `coupons.visibility='agent'` deprecated (not dropped),
  `agentUsable` branch removed from `coupons.server.ts`'s `decideCoupon`, `couponAgentUsable` removed
  from `createCheckoutForUser`. Public customer-facing coupons on the ordinary checkout are unaffected.

**Migration `015_halted_subscriptions` — SPECCED, NOT YET BUILT** (see §13): adds `'halted'` to the
`subscriptions.status` CHECK plus a `halted_at timestamptz` column, and teaches the webhook to record
Razorpay's own `subscription.halted` event.

---

## 6. Product Catalog & Subscription Plans

### Seva catalog (data-driven — never hardcode in frontend)
1. Sundarkand Path
2. Gau Seva
3. Vanara Seva
4. Saadhu Santo Ko Bhojan (never "Brahmin Bhojan" in copy/code)
5. Griha Shanti Hawan
6. Sarv Rog Nivaran Hawan

### ⚠️ Subscription tiers are FLEXIBLE by design — do not hardcode seva composition

Confirm current composition with Chirayu before relying on this — it changes over time via `plan_sevas`,
a pure data operation, zero deploys.

| Tier | Price | Billing | Sevas included (current) |
|---|---|---|---|
| **Basic** | ₹251 | Monthly | Sundarkand Path, Gau Seva, Vanar Seva — 2nd Tuesday only, 1x/month each. No Bhojan, no Hawan. |
| **Premium** | ₹399 | Monthly | Sundarkand Path, Gau Seva, Vanar Seva, Saadhu Santo Ko Bhojan — on BOTH 2nd Tuesday and Last Saturday (2x/month each) + Griha Shanti Hawan (2nd Tuesday only) + Sarv Rog Nivaran Hawan (Last Saturday only) |
| **Premium Annual** | ₹4,101/yr | Yearly | Same as Premium + prasad shipment + Sankalp Certificate |

- Each subscription covers **up to 4 family members** (name + gotra), all used in every sankalp performed
  under that subscription. Variable family size (1–4, not always 4) needed zero code changes — segments
  group by subscription count, not name count.
- More tiers/sevas will be added over time — schema supports this without a deploy.

### Mandatory card copy/design rules
- Clearly state the team performing the sevas (`teams.name`, admin-editable)
- Visibly include **"Daan Punya Ek Saath"** and **"Pooja Aur Chadava Dono Ka Package"** on the card itself
- Unique card visual per plan — never one generic template image reused across tiers

### Physical prasad (Premium Annual only)
Lightweight non-perishables only: Sarovar jal, chandan tilak, akshat/kumkum, mauli thread, Sankalp
certificate. No perishable food, no heavy items. (`prasad_shipments` table exists; no admin UI to manage
it yet — see §22.)

---

## 7. Sankalp Scheduling Logic (Locked Business Rules)

This is the operational heart of the product and must be implemented exactly as specified — it is locked
regardless of how tier-seva composition shifts.

- Puja happens **exactly twice a month** — never weekly, never daily.
- **List A — SECOND Tuesday of the month** *(changed from First Tuesday, migration 008)*: ALL active
  subscribers (every tier) → whichever sevas their current plan includes (per live `plan_sevas` lookup).
- **List B — Last Saturday of the month**: Subscribers on plans that include Hawan (currently Premium +
  Premium Annual) → **ONE sankalp**, covering that plan's sevas plus the Saturday hawan. (The former
  Hawan-only + Full-package pair is retired — migration 010; it was a live bug that double-enrolled every
  List B subscriber.)
- **Hawan day-scoping (LOCKED):** the two hawans are **not interchangeable**.
  **Griha Shanti Hawan → Second Tuesday. Sarv Rog Nivaran Hawan → Last Saturday.**
  Every NON-hawan seva in a plan runs on **every** batch day that plan is in, so a Premium subscriber
  receives Sundarkand Path, Gau Seva, Vanar Seva and Saadhu Santo Ko Bhojan **twice a month** and each
  hawan **once**. Resolution must intersect hawans with `seva_schedule_rules` — `plan_sevas` carries no
  day dimension, so reading it alone puts both hawans on both days.
  | Batch | Sevas performed |
  |---|---|
  | Second Tuesday | Sundarkand, Gau Seva, Vanar Seva, Saadhu Santo Ko Bhojan, **Griha Shanti Hawan** |
  | Last Saturday | Sundarkand, Gau Seva, Vanar Seva, Saadhu Santo Ko Bhojan, **Sarv Rog Nivaran Hawan** |
  Basic includes no hawan at all and therefore never joins List B (except the one-time catch-up below,
  which also excludes hawan).
- Lists are always generated **live/fresh** from currently-active subscriptions **and current
  `plan_sevas` mapping** at generation time — **never cached**.
- **Basic tier limitation (not a bug):** A subscriber on a Saturday-ineligible plan who joins after that
  month's Second Tuesday must wait until next month's Second Tuesday.
- **Onboarding catch-up rule (Saturday-ineligible tiers only):** If such a subscriber joins *after* that
  month's Second Tuesday, they get a **one-time inclusion** in that same month's Last Saturday list, but
  only for the sevas their plan actually includes (NOT Hawan). From month 2 onward, they resume the
  normal Second-Tuesday-only cycle.
- **Sankalp Pending rule:** a subscription with 0 `family_members` rows is **valid**, not an error —
  derived flag only (`family_member_count === 0`, never a stored boolean). The Pandit-facing list
  **excludes** these (never fabricate a name); they are still tracked in
  `sankalp_batch_subscriptions` and auto-picked-up by the next live-generated batch once details are
  added. `/admin/subscribers` has a "Sankalp Pending / call queue" filter, oldest-purchase-first.

> **Why Second Tuesday and not First:** business/operational decision by Chirayu — gives a one-week
> buffer after month-start for that month's active-subscriber list to stabilize (failed payments
> retried, new sign-ups from the first few days settled) before the first sankalp of the month is
> generated.

### Batch tracking (admin-side)
- Each list generation (List A or List B, for a given month) creates **exactly one** distinct batch
  record: date + a snapshot of the subscriptions included. `(batch_type, batch_date)` is UNIQUE —
  regenerating a day refreshes that row's membership rather than inserting a second row.
- Admin manually clicks **"Mark Seva Completed"** per batch → locks a completion timestamp + subscriber
  count for that batch.
- Tuesday batches and Saturday batches are **completely independent records**. Marking one complete must
  never flip the other's status.
- Status labels shown in admin UI: **Done / Pending / Missed** — never "Covered."
- The **"Pending Sevas" report** shows per-subscription status per batch type (a Tuesday column and a
  Saturday column), and always shows the subscriber's join date/time alongside status.

---

## 8. Subscription Flow (Signup-First Checkout)

Login happens **first**, before plan purchase — not mid-checkout after family details. Family member
details come **after** payment (profile completion), and are explicitly optional/deferrable. Rationale
(Chirayu): reduce checkout friction to one click once the user is identified, and stop losing
family/gotra data entry to fields users don't have handy at browse time.

```
Landing / Plans page — fully PUBLIC, no login required to browse
       │
       ▼
User clicks Subscribe / Buy on a plan
       │
       ├─ Not logged in → /login?redirect=/checkout/<plan>  (plan remembered)
       │      Full Name + Mobile → OTP (Supabase phone auth, SMS/voice — NOT WhatsApp)
       │      New number  → profiles row created with name, session starts
       │      Known number→ logs into SAME profile; typed name ignored
       │      After verify → straight back to that plan's buy step
       │
       └─ Already logged in ────────────────────────────┐
                                                        ▼
Buy step (/checkout/$planId) — ONE click:
  shows plan + price + user's own name/phone (never re-entered)
  optional coupon code (public/customer-facing only — validated via /api/coupons/validate)
       │
       ▼
"Confirm & Pay" → POST /api/subscriptions/create-checkout
  creates subscriptions row (status='pending', razorpay_sub_id linked BEFORE checkout opens —
  the row must be resolvable by the webhook the moment Checkout charges the customer)
  + Razorpay Subscription (UPI AutoPay / card) → Razorpay Checkout opens
       │
       ├─ SUCCESS (client callback) → interim "Payment received, confirming…" state
       │     → redirect /subscription-success
       │     REAL activation still ONLY via webhook (subscription.activated/charged
       │     set status='active'; nothing else ever does)
       │
       └─ DISMISS → retry on same page

Post-purchase (/subscription-success):
  banner "🎉 आपकी सदस्यता सफलतापूर्वक शुरू हो गई!"
  + family members form (up to 4: name/gotra/relation/optional DOB)
  + prasad address form
  + explicit skip ("Main yeh baad mein karunga") → /my-subscription
  Same shared component (`profile-completion.tsx`) is PERMANENTLY reachable from /profile until filled.

Twice-monthly Sankalp cycle (§7):
  Second Tuesday → List A generated live → ALL active subs → sevas per current plan
  Last Saturday  → List B generated live → Hawan-eligible plans only → ONE sankalp
  → admin marks each batch "Done" independently
  → proof uploaded per batch (common footage + name-segment video, §17)
  → WhatsApp delivery → Punya Bank ledger derived from proof/segment data
```

**User dashboard** (`/my-subscription`) shows real subscription/family/address data via RLS — a pending
subscription with a linked Razorpay id shows the honest "payment confirming" state; activation is
webhook-driven and this page simply reflects whatever status actually exists.

**Known open item:** UPI-authorized subscriptions **cannot be updated via the Razorpay API** once
mandated — this blocks a simple in-place plan-upgrade flow. No upgrade UX has been built; a plan change
today means cancel + re-mandate.

---

## 9. Telecaller Panel & Role

`telecaller` is a **sibling role**, not an admin subset. `public.is_admin()` (migration 007) is **not**
widened to include it — that one function gates ~40 RLS policies, and adding the role would grant
payments/plans/sales_agents/audit_logs access in a single line. Instead:

- She gets **zero direct RLS grants**. All access goes through `/api/telecaller/*` on the service role
  behind `requireTelecaller()`, with an explicit field allowlist per query (`TC_*_COLS` constants) —
  the same API-layer masking pattern used for `sales-agents-logic.ts`.
- Her pages (`src/routes/telecaller.*.tsx`) never query Supabase directly the way `admin.subscribers.tsx`
  does.
- `/admin` (`src/routes/admin.tsx`) has a `beforeLoad` guard: a `telecaller` role is redirected to
  `/telecaller`; anyone who isn't `admin`/`owner`/`telecaller` is redirected to `/`. (This guard didn't
  exist before the telecaller role shipped — it was a real gap that had to be closed, since a lower-
  privilege role now exists and relying on API 401/403 alone was no longer acceptable.)
- Owner/admin also reach the telecaller panel read-write (nav item "Call Queue" in `admin.tsx`), so
  Chirayu can sit in the same queue and check her work.

### Financial visibility (revised from an original "zero ₹" rule)
The original "zero ₹ for telecaller" rule did not survive her becoming a seller. Now: she sees **plan
prices** (public on `/plans` anyway) and **her own earnings/payout history** in full ₹. Still masked:
company revenue/MRR, any other person's earnings or rate (including the field agent on her own sale),
other subscribers' payment amounts, and Razorpay IDs. There is no coupon-value masking rule anymore —
there are no coupon codes in this flow at all to mask.

### Hard rules carried into the panel
- `subscriptions.status='active'` stays webhook-only — she cannot activate anything.
- No OTP field anywhere in the panel; she must never ask a customer for a code.
- `profiles.phone` is not writable by a telecaller (identity key / takeover risk) — enforced by a closed
  field allowlist in `family-validation.ts`, so it's unreachable by construction, not by enumeration.
- No CSV export endpoint exists for the role (absent, not hidden).
- No bulk WhatsApp/SMS blast (Meta API is proof-delivery-scoped, still pending approval).
- She cannot edit any commission rate or attribution, including her own.
- No coupon codes: she neither holds nor issues any discount code.

### Panel surface (`src/routes/telecaller.*.tsx`, all under `requireTelecaller`)
`telecaller.tsx` (shell), `.index.tsx`, `.my-day.tsx`, `.queues.tsx`, `.queue.$queueKey.tsx`,
`.lead.$leadId.tsx`, `.person.$subscriptionId.tsx` (includes the plan-picker + payment-link sender, see
§10), `.new.tsx`, `.earnings.tsx`, `.script.tsx`. Backing API routes under `src/routes/api/telecaller/`:
`agents.ts`, `create-lead.ts`, `earnings.ts`, `family-members.ts`, `lead.ts` + `lead/update.ts`,
`log-call.ts`, `my-day.ts`, `person.ts`, `plans.ts` (sellable catalogue, name/slug only — **never**
`price_paise`; she quotes prices off the public `/plans` page like a customer would), `profile.ts`,
`proof-resend.ts`, `queue/list.ts`, `queues.ts`, `send-payment-link.ts` (§10).

---

## 10. Hospitals, Field Agents & Lead Attribution

### The end-to-end flow (confirmed business model)
1. The company **allots** a specific hospital to a field sales agent (`agent_hospital_allotments` —
   `btree_gist` exclusion: one hospital → one active agent at a time; an agent can hold many hospitals).
2. The agent collects **name + phone number** of people at that hospital and hands the numbers to the
   telecaller (~10/day).
3. The telecaller calls and FIRST asks the person **which sales agent gave them this number** — that
   verbal answer is captured as `leads.named_agent_id`, the attribution backup mechanism.
4. **Hook:** after **1 free pooja** (stamped as `leads.free_pooja_at`/`free_pooja_by` via `log-call`, not
   a new call-outcome enum value), the telecaller convinces them to subscribe.
5. She sends a **registration link on WhatsApp** (`send-payment-link.ts` → `buildWaLink`); if the person
   subscribes through that link, **both parties** earn their incentives.

### No coupon codes anywhere in this flow (locked, 2026-08-23)
Neither the telecaller nor the field agent has or hands out a coupon/discount code. Attribution is the
"which agent gave you this number?" question plus the registration-link token — never a discount code.
Public, customer-facing coupons on the ordinary `/checkout/:planId` flow are untouched and unrelated.

### Attribution priority (source of truth first, verbal is backup)
```
registration/payment-link token → telecaller-recorded agent answer (backup)
  → 30-day call window (last touch) → nobody
```
Organic self-signups credit **nobody**. `send-payment-link.ts` resolves the lead in this order: explicit
`lead_id` → `attribution_token` → most recent open lead for the target phone — and rejects (403) if the
resolved lead doesn't belong to the caller's tray or doesn't match the payment target
(`isInCallersTray`).

### Sourcing-agent attribution (fixed 2026-08-23)
The sourcing agent credited on a sale must be the **FIELD agent who sourced the lead**
(`leads.source_agent_id`), never derived from the telecaller's own phone (an earlier bug did exactly
that, wrongly crediting her as an agent on her own sale). Both `send-payment-link.ts` and the `?att=`
token path in `create-checkout.ts` now stamp `sales_agent_id` correctly alongside `telecaller_id`.

### Plan choice on the payment-link send
The telecaller panel's plan picker (`telecaller.person.$subscriptionId.tsx`, backed by
`/api/telecaller/plans`) lets her choose **which** active plan to send a link for — ₹251 Basic, ₹399
Premium, ₹4,101 Premium Annual, or any future plan marked `is_active` — it is not fixed to one tier. The
picker deliberately shows plan **names only, never `price_paise`**; if she needs to quote a rupee amount
she's expected to read it off the public `/plans` page, same as a customer would.

---

## 11. Commission Engine

Both parties (field agent + telecaller) earn on the same sale from **separate pools** — no splitting:

- **First deal: 20% of the first captured payment, FIXED for everyone forever.** Not per-person, not
  tiered, and promotion does NOT change it. Single constant `FIRST_DEAL_PERCENT = 20`. This is written
  into `commission_entries.percent_applied` on every entry, so a 2026 ledger row can be explained in 2029
  even if the constant ever changes — never value a historical entry by reading today's constant.
- **Trail: 1% of each later captured payment, to EACH party**, resolved **per payout month** from
  `staff_commission_rates` (a history table, not a single field) — a promotion lifts the person's ENTIRE
  EXISTING BOOK from that month forward, capped at 25% by a CHECK as a fat-finger guard. Locked past
  months never change. Do NOT read a single `commission_percent` off the person at payout time (silently
  rewrites history when the owner edits it later), and do NOT snapshot trail per subscription (makes a
  promotion worthless on the existing book). `sales_agents.commission_percent` is deprecated for reads,
  kept as legacy only.
- Trail is earned only on payments Razorpay actually **captured** — never on `status='active'` (a failing
  UPI mandate reads `'active'` for a while before it's caught).
- Real per-person numbers on Premium ₹399/mo: first deal ₹79.80 once; trail ₹3.99/month at 1%,
  ₹7.98 at 2%, ₹11.97 at 3%. Small per subscriber by design — its value is accumulation across the whole
  book. **Always label whether a commission figure is PER PERSON or BOTH PARTIES COMBINED** when quoting
  it — collapsing the two has caused real confusion (a ₹88/yr combined trail once read as if it were the
  per-person monthly rate).
- Yearly plans: trail accrues monthly at 1/12, generated month by month, so a mid-year cancellation
  simply stops it.
- **Open decision, still unresolved:** does the 20% first-deal on Premium Annual (₹4,101) apply to the
  full annual payment (₹820 each, 40% combined leaving the business before a single seva is delivered —
  42% of that subscriber's year-1 revenue) or a capped/rebased amount (~₹205 each,
  `monthly_equivalent_x3`)? Implemented as a switchable constant `FIRST_DEAL_BASE_YEARLY`, default
  `'full_payment'`. **Build regardless of this decision:** first_deal entries land `held` and mature to
  `payable` after 30 days (`FIRST_DEAL_HOLD_DAYS`), reversed on refund/chargeback.

### Architecture
- Commission generation must **not** live in the Razorpay webhook — a bug in commission math must never
  fail a payment activation. It's an idempotent reconciler endpoint instead
  (`/api/admin/commissions/reconcile.ts`), unique-keyed on `(payment_id, beneficiary, kind,
  payout_period)`.
- Ledger is **append-only**. Refunds write **negative reversal entries**; originals are never edited.
  Owner locks payout periods so a late refund or stale reconciler run can't rewrite a month already paid
  out.
- `commission-logic.ts` is the pure, tested module (zero imports, injected `nowMs`, correct rounding) —
  **the reconciler route must call it, never re-implement its logic inline.** Every serious commission
  bug found in review (§21) came from an inline re-implementation diverging from this tested module.

---

## 12. Owner Performance Leaderboard

`/admin/performance` (owner-gated at all three layers: nav visibility, route `beforeLoad`, and API 403).
The system scales to multiple telecallers and multiple agents at once; the owner needs to compare people
for four decisions:

1. **Reward/promote** top performers (raise trail)
2. **Reallocate** hospitals to the agents who actually convert them / drop dead hospitals
3. **Coach** weak callers (low dial-through, low free-pooja→paid conversion)
4. **Cut** underperformers, with enough history to be fair

Three lenses off the same lead+payment+commission data:
- **Per TELECALLER:** numbers received vs. called (dial-through), free-pooja → paid conversion rate,
  subscriptions closed, revenue generated, active book size, churn on her book, avg time-to-convert.
- **Per AGENT:** numbers supplied, lead→paid conversion rate (lead quality), revenue attributed,
  best/worst hospital.
- **Per HOSPITAL:** leads produced, conversion rate, revenue — to judge whether the allotment is worth
  keeping.

Implementation notes (`performance-logic.ts` + `performance-data.server.ts`): pure module with injected
`nowMs`; revenue is **captured-payments only**, never plan list price and never `status='active'`; IST
bucketing (verified correct, including the midnight-boundary round-trip); `MIN_LEADS_FOR_RANKING = 20`
fair-sample guard so a telecaller with 3 leads doesn't get ranked against one with 300; rates carried as
both `n/d` and formatted text; the data layer is IST-watermarked and caps with explicit
`truncatedTables` rather than silently truncating. A telecaller must never see another telecaller's or
agent's stats — this leaderboard is strictly owner-only.

---

## 13. Razorpay Integration Flow (incl. known halted-subscription gap)

- One Razorpay Plan per `plans` row (`razorpay_plan_id`, kept in sync; checkout 503s if unset).
- `createRazorpaySubscription()` (`razorpay.server.ts`) creates the Razorpay Subscription;
  `createCheckoutForUser()` (`subscriptions-checkout.server.ts`) inserts the `pending` row first, then
  calls it, then links `razorpay_sub_id` back onto the row **before** checkout opens.
- **Tenure — SPECCED, NOT YET APPLIED.** `total_count` is currently hardcoded
  `TOTAL_COUNT_MONTHLY = 12` / `TOTAL_COUNT_YEARLY = 5`, meaning a subscription's UPI/card mandate
  silently **ends** after 1 year (monthly) or 5 years (yearly) with nobody notified. Chirayu wants it to
  run until the customer actively cancels. The fix (specced in
  `SESSION_TENURE_AND_OTP_ABUSE_PROMPT.md`, not yet confirmed built): Razorpay supports up to 100 years,
  so set `total_count = 1200` (monthly) / `100` (yearly) as named constants. Cancellation works anytime
  regardless of `total_count`. Any subscription already created before this fix lands keeps its original
  short mandate — Razorpay doesn't retroactively extend a live subscription's `total_count`.
- **Webhook** (`/api/payments/webhook` → `razorpay-webhook.server.ts`), HMAC-SHA256 verified
  (`timingSafeEqual`, never `===`), handles: `subscription.activated`, `subscription.charged`,
  `subscription.payment.failed`, `subscription.paused`, `subscription.resumed`, `subscription.cancelled`,
  `subscription.completed`. Payment rows upsert on `razorpay_payment_id` (idempotent under Razorpay's
  at-least-once delivery). Every processed event writes an `audit_logs` row (`admin_id NULL` = system
  actor).
- **Our own 3-consecutive-failure demotion:** on `subscription.payment.failed`, the webhook counts
  consecutive `failed` payment rows (most-recent-first, any captured payment breaks the chain) and
  demotes `subscriptions.status` from `active` → `pending` at `FAILURE_DEMOTE_THRESHOLD = 3`. This only
  fires from `active` (guarded), never stomping `paused`/`cancelled`.

### 🔴 Known gap — Razorpay's own `subscription.halted` event is never recorded (found 2026-08-23)

Separately from our own 3-failure counter, **Razorpay's own retry mechanism** attempts the charge on the
due date (T+0), retries at T+1, and again around T+2/T+3 (~3-day window). If all fail, Razorpay itself
moves the subscription `pending` → `halted` on its side and fires a `subscription.halted` webhook event.
Our `SUPPORTED_EVENTS` list does **not** include this event, so it is silently ignored
(`ignored_unsupported_event`) — acknowledged (200 OK) and thrown away. Consequences:
- Our own `pending` status and Razorpay's real `halted` state can disagree; there is currently **zero
  record** in our database that a subscription has actually been halted by Razorpay.
- **No auto-catchup:** when a halted subscription resumes, Razorpay does **not** retroactively charge for
  missed cycles — it only bills forward. If seva-eligibility logic (`sankalp-logic.ts`) isn't strictly
  gated on `status = 'active'` (as opposed to just excluding `cancelled`), a halted subscriber could keep
  receiving sevas for cycles they were never actually charged for, and that revenue gap is never
  recovered automatically.
- **No resume capability exists anywhere in the codebase.** No code calls Razorpay's
  `POST /subscriptions/:id/resume`, and there is no admin/telecaller UI action to reactivate a halted
  subscriber — today that's a fully manual Razorpay-dashboard action. If the underlying mandate itself is
  dead (not just retries exhausted), Resume won't work at all and the only path is a fresh subscription +
  new checkout link.

**Fix specced but not built:** `SESSION_HALTED_SUBSCRIPTION_RECOVERY_PROMPT.md` (migration `015`) — adds
`'halted'` status + `halted_at`, teaches the webhook to record `subscription.halted`, adds an
owner/admin-only resume endpoint that calls Razorpay but never itself sets `subscriptions.status`
(preserving webhook-only activation discipline), admin UI for halted subscribers, a mandate-dead
fallback reusing the existing payment-link flow, and an explicit check that `sankalp-logic.ts` excludes
`halted` (not just `cancelled`) from seva eligibility.

### Other Razorpay-adjacent notes
- Coupon discount must be accounted for before creating the Razorpay subscription amount. **Known open
  risk:** UPI AutoPay + dynamic coupon discount may have friction — the charged amount currently remains
  the Razorpay plan price until dashboard Offers are properly linked; this is flagged, not silently
  mis-charged.
- **Birthday pooja add-on (planned, not built):** one-time charge via Razorpay Payment Links/Orders API;
  a cron would look 2–3 days ahead of `family_members.dob`. `dob` is already captured.

---

## 14. Admin Dashboard — Actual Modules Today

Nav is defined in `src/routes/admin.tsx`. Actual items, role-gated as shown:

| Module | Route | Gate | Status |
|---|---|---|---|
| Overview | `/admin/overview` | admin/owner | Built — active subs, MRR, this-month revenue, pending proofs, failed payments, paused subs |
| Call Queue (telecaller panel) | `/telecaller` | admin/owner read-write; telecaller own-tray | Built |
| Subscribers | `/admin/subscribers` | admin/owner | Built — table, filters, CSV export, Subscriber 360 view, Sankalp Pending / call-queue filter |
| Plans & Sevas | `/admin/plans-sevas` | admin/owner | Built — CRUD `plans`/`sevas`/`plan_sevas`/`seva_schedule_rules` |
| Sankalp Lists | `/admin/sankalp-lists` | admin/owner | Built — plan-wise name-gotra lists for Pandit ji (never plan name/phone/price) |
| Proof Upload | `/admin/proof-upload` | admin/owner | Built — batch-based upload, per-batch "Mark Seva Completed" |
| Pandit export | `/admin/pandit/$batchId` | admin/owner | Built — printable, name-gotra only |
| Seva Proofs | `/admin/proofs` | admin/owner | Legacy view over `seva_proofs` |
| Payments | `/admin/payments` | admin/owner | Built — payments log |
| Reports | `/admin/reports` | **owner only** | Built — subscriber/revenue/seva-completion/pending-sevas reports, CSV/PDF-via-print |
| Leads | `/admin/leads` | admin/owner | Built — lead pipeline, hospital assignment/reallotment |
| Commissions | `/admin/commissions` | **owner only** | Built — reconcile trigger, payout period lock |
| Performance | `/admin/performance` | **owner only** | Built — three-lens leaderboard, §12 |

**Not built (see §22 for the full "described but absent" list):** Sales Agents Manager UI, Coupons
Manager UI, Locations & Teams Manager UI, SEO & Content Editor, Audit Log Viewer (table receives rows
fine, no viewer built), Prasad Box Tracking UI.

---

## 15. API Endpoints — Actual Surface Today

```
Auth
  POST   /api/auth/request-otp                  → { name, phone } combined login/signup;
                                                    creates auth user + profiles row for NEW numbers
  verifyOtp runs CLIENT-side (supabase.auth.verifyOtp) — no server verify route by design,
  a server route would burn the single-use code before the browser session lands

Profile completion (RLS-scoped, caller's own JWT)
  POST   /api/profile/family-members
  POST   /api/profile/address

Subscriptions
  POST   /api/subscriptions/create-checkout     → pending row + Razorpay Subscription

Payments
  POST   /api/payments/webhook                  → the ONLY code path that ever sets status='active'

Coupons (public/customer-facing only)
  POST   /api/coupons/validate

Sankalp
  POST   /api/sankalp/generate-batch            → live-generates List A / List B

Cloudinary
  POST   /api/cloudinary/sign-upload

Admin
  GET    /api/admin/overview-financials.ts
  GET/POST /api/admin/payments/list.ts
  GET    /api/admin/reports/{monthly,pending-sevas,export}.ts
  GET    /api/admin/sales-agents/list.ts        → role-safe stub only, masks commission_percent for admin
  GET/POST /api/admin/leads/{assign,sweep,upload}.ts
  GET/POST /api/admin/commissions/{lock,reconcile}.ts
  GET/POST /api/admin/hospitals/{create,list,reallot}.ts
  GET    /api/admin/performance/{agents,hospitals,telecallers}.ts

Telecaller (all behind requireTelecaller; admin/owner also reach these)
  POST   /api/telecaller/agents.ts
  POST   /api/telecaller/create-lead.ts
  GET    /api/telecaller/earnings.ts             → JWT-only, no body parsed, filters on auth.callerId
  POST   /api/telecaller/family-members.ts
  GET/POST /api/telecaller/lead.ts, lead/update.ts
  POST   /api/telecaller/log-call.ts
  GET    /api/telecaller/my-day.ts
  GET    /api/telecaller/person.ts
  GET    /api/telecaller/plans.ts                → name/slug only, never price_paise
  GET/POST /api/telecaller/profile.ts
  POST   /api/telecaller/proof-resend.ts
  GET    /api/telecaller/queue/list.ts, queues.ts
  POST   /api/telecaller/send-payment-link.ts    → §10 — no coupon_code param, rejects one if sent
```

**Specced but not yet built:** `/api/admin/subscriptions/resume` (§13, migration 015 spec).

---

## 16. Frontend Pages & Components

### Public / User-facing
```
/                     → Landing
/plans, /plan/:id     → public browse (no login needed)
/about, /faq, /reviews, /sevas
/login                → combined Login/Signup: name+phone → OTP → verify; honors ?redirect=
/checkout/:planId     → post-login buy step ONLY; redirects to /login when no session
/subscription-success → post-payment landing: success banner + shared family/address form + explicit skip
/profile              → real session data; permanent "complete your family details" section
/my-subscription      → real subscription/family/address data via RLS
```

### Telecaller
```
/telecaller, /telecaller/my-day, /queues, /queue/:queueKey, /lead/:leadId,
/telecaller/new, /telecaller/earnings, /telecaller/script, /telecaller/person/:subscriptionId
```

### Admin (role-gated per §14 table)
```
/admin/overview, /admin/subscribers, /admin/plans-sevas, /admin/sankalp-lists,
/admin/proof-upload, /admin/pandit/:batchId, /admin/proofs, /admin/payments,
/admin/reports (owner), /admin/leads, /admin/commissions (owner), /admin/performance (owner)
```

### Key shared components
```
PlanCard, FamilyMemberForm / profile-completion.tsx (shared post-purchase + /profile), SlidingImageCard,
PizzaComparison, ComparisonTable, SevaFlow, ProofGallery, CldImage (Cloudinary), site-chrome
```

---

## 17. WhatsApp Proof Delivery System

- **Current state:** Meta WhatsApp Business API integration is **pending Meta approval**. Manual
  `wa.me` fallback is **active** for both proof delivery and telecaller payment-link sends.
- **Proof architecture is batch-based, not per-subscriber-per-upload.** Live delivery path is the
  segment-video model from the Session 4 revision, not the legacy `seva_proofs` table (kept for backward
  compatibility, deprecated for new writes):
  1. Common ~1-minute footage segment — shared across the entire batch
  2. Personalized ~2-minute name-reading segment — shared only within a subscriber's assigned segment
     group
- **Segments are tier-pure** — never mix Basic/Premium in one segment. `SEGMENT_SIZE_SUBSCRIPTIONS = 5`
  (5 subscriptions/families per segment, up to 20 names per segment video).
- One WhatsApp message per subscriber → their segment's video. "Mark Sent Manually" bypass exists for
  direct sends at low volume.
- Cloudinary path convention: `punyata-proofs/{year}-{month}/{batch_type}/segments/segment-{n}/`.

---

## 18. Security & Auth

### Authentication strategy
```
1. Phone OTP verification (Supabase Auth, SMS/voice) → registration + login, 30-day session
2. Role-based access: 'user' | 'admin' | 'owner' | 'agent' | 'telecaller' →
   route protection, enforced server-side via RLS + API-layer gates
3. Razorpay Webhook Signature Verification → HMAC-SHA256, timingSafeEqual
4. Cloudinary Signed Uploads → prevent direct/unsigned abuse
```

⚠️ **Temporarily OFF (2026-08-30):** `/login`'s phone+OTP path is hidden behind
`PHONE_OTP_LOGIN_ENABLED = false` in `src/routes/login.tsx` — Google login is the only
customer-facing signup/login path right now. The OTP request/verify code is untouched underneath
the flag; flip it back to `true` to restore phone+OTP as an alternate path, no other change
needed. Google users still go through `/complete-profile` (name + phone, deliberately **not**
OTP-verified — §1b) exactly as before.

### Row Level Security (RLS) — the layered gating pattern
- Enabled on all tables.
- Users read only their own `profiles`, `subscriptions`, `family_members`, `payments`, `notifications`.
- `public.is_admin()` = `role IN ('admin','owner')` — gates ~40 policies. **Never** widen it to include
  `telecaller`/`agent`.
- Owner is a **superset** of admin (added via migration 007, extends existing policies rather than
  replacing them) — additionally gets financial visibility: `/admin/reports`, MRR/revenue, payment
  amounts, Razorpay IDs, agent/telecaller commission figures.
- `telecaller`/`agent` roles get **zero direct RLS grants**. All access is via service-role-gated API
  routes (`requireTelecaller()`, field allowlists) — never a direct Supabase client query from their
  pages.
- `plans`, `sevas`, `locations`, `teams`, `page_seo`, `blog_posts` are public-read, admin-write.
- **Every `SECURITY DEFINER` function needs an explicit `REVOKE EXECUTE FROM public, anon,
  authenticated`.** Postgres leaves `EXECUTE` granted to `PUBLIC` by default, and PostgREST exposes every
  public function at `/rest/v1/rpc/<name>` — a `SECURITY DEFINER` function without a REVOKE bypasses RLS
  entirely for anyone with any authenticated JWT, gating in the API layer notwithstanding. This class of
  hole was found once (§21, C1) and the checklist item is now permanent for every new migration.
- Server helper functions: `requireUser`, `requireAdmin`, `requireOwner`, `requireTelecaller` (all in
  `supabase-admin.server.ts`), each returning `{ ok: true, auth: {...} } | { ok: false, status, error }`
  or an equivalent shape.
- `writeTelecallerAudit()` throws on failure — a mutating telecaller endpoint cannot succeed without also
  writing its audit trail.

### Environment variables (never committed)
```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=

RESEND_API_KEY=
ADMIN_EMAIL=
```

---

## 19. Deployment Architecture

```
punyata.com  ──→ hosted app (TanStack Start)
punyata.in   ──→ 308 redirect to punyata.com  (DNS/Hostinger config item, not yet confirmed live)

Serverless functions handle: Razorpay webhook, Cloudinary signed uploads, WhatsApp send helpers,
sankalp batch generation, admin/telecaller privileged routes.

Supabase (PostgreSQL + Auth + RLS) + Cloudinary CDN + Razorpay + Meta WhatsApp Business API (pending)
DNS: Hostinger
```

### CI/CD
```
Work happens on `staging` branch → Chirayu reviews (increasingly with an independent AI review pass
against the real files) → merges staging → main
Supabase migrations applied via SQL migration files, in order, by hand/CI
```

No Docker, no standalone servers, no infra requiring always-on paid compute beyond the hosting platform
itself.

---

## 20. Build Status & Session Sequence

| Session | Scope | Status |
|---|---|---|
| Pre-sessions | Marketing site, design system, plan pages, checkout UI | ✅ Complete |
| 0 | Core DB schema (20 tables) + RLS + seed data | ✅ Complete |
| 0.5 | Sankalp batch tracking schema | ✅ Complete |
| 1 | Admin Overview dashboard | ✅ Complete |
| 2 | Admin Subscribers module | ✅ Complete |
| 3 | Plans & Sevas Manager | ✅ Complete |
| (unnumbered) | Checkout address fields, Sankalp name lists page | ✅ Complete |
| 4 | Proof Upload + Sankalp Batch Tracking (+ segment-video revision) | ✅ Complete |
| **5** | **Sales Agents & Coupons Manager UI** | ⏳ **Still not built** — only a role-safe API stub exists |
| 6 | Razorpay Webhook + Payments Log + Reports | ✅ Complete |
| 6.5 | Owner/Admin two-tier role system | ✅ Complete |
| SFC | Signup-First Checkout | ✅ Complete (needs go-live config check — see below) |
| Tenure + OTP | 100-year `total_count` fix, OTP abuse protection | 📝 Specced — **tenure fix NOT confirmed applied**; OTP protection build status unconfirmed |
| Telecaller Panel (Part A + B) | `/telecaller`, leads, commission engine | ✅ Complete, reviewed — several findings still open (§21) |
| Hospitals/Attribution/Performance | Hospitals, allotments, sourcing-agent fix, free-pooja capture, owner leaderboard | ✅ Complete, reviewed — mojibake bug confirmed fixed; a couple of findings still open (§21) |
| Halted-subscription recovery | Migration 015, resume/reissue UI | 📝 **Specced 2026-08-23, not yet built** |
| Admin/Telecaller mobile responsive fixes | Collapsible mobile nav, table scroll wrappers, touch-target sizing, sticky call-log bar cap (§21 M1–M5) | ✅ Shipped (commit `e64a3f1`, `Staging`) — typecheck-clean, not yet visually verified against a logged-in session |
| 7 | SEO + Audit Log + Subscriber 360 polish | ⏳ Pending |

### ⚠️ Go-live config items (code done, infra/config not confirmed)
1. Apply migration `011` (and `012`–`015` once built) in Supabase
2. Supabase Auth → Phone provider enabled + 30-day refresh-token expiry
3. Deploy env: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
4. Each sellable plan needs `razorpay_plan_id` set (checkout 503s otherwise)
5. Coupon money-handling decision (Razorpay Offer linkage vs. manual credit) before public advertising
6. Supabase dashboard Auth rate-limit setting for OTP — a Chirayu-side config action, not code
7. Turnstile/hCaptcha wiring on `/login`'s OTP-request step — build status unconfirmed

---

## 21. Risk Register — Known Bugs & Open Review Findings

Two independent review passes exist against the newer (telecaller/hospitals) work, done by reading the
actual repo files rather than trusting the session's own summary. **Status below reflects what's
confirmed one way or the other as of 2026-08-23 — anything marked "unconfirmed" should be re-verified
against the live files before being assumed fixed.**

### From `REVIEW_TELECALLER_SESSION.md` (2026-08-22)

| ID | Finding | Status |
|---|---|---|
| C1 | Three `SECURITY DEFINER` functions (`assign_leads`, `roll_over_stale_leads`, `expire_stale_leads`) had no `REVOKE EXECUTE`, making them callable by any authenticated JWT via PostgREST, bypassing RLS entirely | **Confirmed fixed** — REVOKEs present in the applied migration 013 SQL |
| C2 | `log-call` accepted any `profile_id` with no tray/relationship check; combined with the 30-day call-window attribution rule, this was an exploitable path to steal commission on organic sales; also let any uuid be marked `do_not_call` | **Unconfirmed** — re-verify `log-call.ts` before trusting attribution integrity |
| H1 | Commission calculated on plan list price, not amount actually collected (wrong for coupon'd sales) | **Unconfirmed** |
| H2 | Yearly plans never generated year-1 trail (only year-2+ renewals) | **Unconfirmed** |
| H3 | Yearly trail rate lookup ignored rate history/ordering, could apply a superseded rate | **Unconfirmed** |
| H4 | Refund reversals could duplicate on every reconciler run (idempotency index excluded negative rows) | **Confirmed fixed** — reversal twin index present per Chirayu's follow-up |
| H5 | Refund-then-repay could pay the 20% first-deal bonus twice | **Unconfirmed** |
| H6 | Insert failures in the reconciler silently discarded, still reporting `ok: true` | **Unconfirmed** |
| H7 | Locked payout periods enforced in only one code path, no DB trigger backstop | **Confirmed fixed** — ledger guard trigger present per Chirayu's follow-up |
| H8 | "Cannot re-sell an existing customer" anti-gaming rule was dead code (status column never selected) | **Unconfirmed** |
| H9 | `send-payment-link` didn't validate the token/profile_id pair against each other or her tray | **Confirmed addressed** — current `send-payment-link.ts` validates lead ownership and token/profile match (verified by reading the live file) |

### From `REVIEW_HOSPITALS_SESSION.md` (2026-08-23)

| ID | Finding | Status |
|---|---|---|
| §1 | `send-payment-link.ts` was saved as double-encoded UTF-8 — the customer-facing WhatsApp message was garbled mojibake | **Confirmed fixed** — the live file renders clean `🙏`/`—` (verified by reading it directly) |
| §2 | `linksSent` in `performance-logic.ts` actually measured conversions, not links sent — hid the "sends links but can't close" coaching signal | **Unconfirmed** |
| §3 | `log-call`'s combined free-pooja + named-agent update used a single AND'd guard, so setting one on a later call could silently fail to write if the other was already set on an earlier call | **Unconfirmed** |
| §4 | Hospital reallotment via the service-role RPC recorded `set_by`/`admin_id` as NULL (no `auth.uid()` under service role) — audit trail exists but attributes to nobody | **Unconfirmed** |

**Rule reinforced by these reviews:** if a pure/tested function exists (e.g. `commission-logic.ts`), the
calling route must actually call it — every serious money bug found came from an inline re-implementation
diverging from a tested helper that already did it correctly.

### From this session (2026-08-23)
- Razorpay's own `subscription.halted` event is unhandled by the webhook; no resume capability exists —
  see §13. Spec written, not built.
- Razorpay subscription `total_count` tenure fix is specced but not confirmed applied — see §13/§20.

### From 2026-08-27 session — "New Lead" bug
| ID | Finding | Status |
|---|---|---|
| L1 | `/telecaller/new` ("New Lead") called an endpoint that created an **auth user + profile** for the phone number instead of a pipeline lead. This (a) made the customer look signed-up before they ever were, (b) polluted Queue #5 "Signed Up, Never Bought", and (c) the "open" link routed to the broken bare person-card instead of a lead call-card. | **Confirmed fixed** — `create-lead.ts` now inserts into `leads` (status `assigned`, `assigned_to`/`created_by` = caller), never touches `profiles`/auth; idempotent on an existing open lead for the same phone; rate-limited via `LEAD_CREATE_DAILY_LIMIT`/day (IST). `telecaller.new.tsx` links to `/telecaller/lead/$leadId` (the real lead call-card). `my-day.ts` counts `leadsCreatedToday` from `leads`, not profiles. Verified by reading all four live files directly. |
| L2 | Legacy telecaller-created profiles (from before the L1 fix) still show up in Queue #5 | **Confirmed fixed** — `loadTelecallerDataset` in `telecaller-data.server.ts` (line ~271) excludes any `profiles` row with `created_by_staff` set from Queue #5; migration `20260827_021_backfill_telecaller_profile_leads.sql` backfills those legacy rows into `leads` (idempotent `NOT EXISTS` guard). **Migration still needs to be applied to Supabase** — same pending-migration caveat as §8/migration 018. |

### From 2026-08-31 session — Admin/Telecaller mobile responsive audit
The `/admin` and `/telecaller` shells share one layout pattern (`flex flex-col md:flex-row` sidebar +
content), but mobile treatment had drifted per-page — some pages got fixed, others never did.

| ID | Finding | Status |
|---|---|---|
| M1 | Full sidebar nav (up to 11 items in admin) rendered as a full-width block **above** page content on mobile, with no collapse — every page required scrolling past the whole nav first | **Confirmed fixed** — `admin.tsx`/`telecaller.tsx` sidebar is now a tap-to-expand `<details>` accordion below `md`, unchanged (always-visible) at `md`+ |
| M2 | 4 tables had no `overflow-x-auto` wrapper (Hospitals & Allotments + Recent Leads in `admin.leads.tsx`, payout-periods in `admin.commissions.tsx`, payout-history in `telecaller.earnings.tsx`), forcing horizontal page overflow on mobile — other admin list pages (`admin.performance.tsx`, `admin.staff.tsx`, `admin.routing.tsx`, `admin.payments.tsx`, `admin.plans-sevas.tsx`, `admin.reports.tsx`, `admin.subscribers.tsx`) already had this wrap | **Confirmed fixed** — all 4 now scroll horizontally in their own container |
| M3 | Inline row-action buttons/selects (allot/re-allot, lead status buttons, lock & pay, proof-resend) were `h-7` (~28px) on every breakpoint, below the ~44px touch-target minimum | **Confirmed fixed** — bumped to `h-9` (36px) on mobile, `md:h-7` restores the compact desktop size |
| M4 | Sticky call-log bar (`telecaller.lead.$leadId.tsx`, `telecaller.person.$subscriptionId.tsx`) had no height cap; on mobile every field (outcome/callback/notes/buttons) stacks full-width, and with the on-screen keyboard open it could consume most of the viewport and hide the call-history context above it | **Confirmed fixed** — capped at `max-h-[70vh] overflow-y-auto` |
| M5 | Telecaller header's "₹ nahi dikhega" compliance note was `hidden sm:flex` — dropped below ~640px, i.e. the phones telecallers most likely use | **Confirmed fixed** — changed to `hidden md:flex`, consistent with the "Staging Environment" badge treatment on the admin header |

Not itself a data/money-integrity bug like §21's other findings — pure layout/UX. Verified via
`tsc --noEmit` (clean); **not yet visually verified against a logged-in session** — both shells are
auth-gated (`beforeLoad` redirects an unauthenticated session to `/`), so a real admin/telecaller login
is needed for an in-browser pass. Shipped in commit `e64a3f1` on `Staging`.

---

## 22. What v3 Described But Was Never Built

v3 of this document (written 2026-08-19/22) described features that were planned but, as confirmed by a
full-repo grep and directory listing on 2026-08-23, **do not exist in the codebase.** Do not treat these
as in-progress or shippable without a fresh scoping session:

- **"Occasional Pooja Pages" module** — a full spec existed (schema `occasional_poojas` table, admin CRUD
  at `/admin/occasional-poojas`, public unlisted route `/occasion/:slug`, Razorpay Orders-API donation
  flow). **None of it exists.** No such table, route, component, or API endpoint is present anywhere in
  `src/` or `supabase/migrations/`. If Chirayu wants this revived, it needs its own fresh session — do
  not assume any part of the old v3 spec still reflects current schema/patterns before rebuilding it.
- **Sales Agents Manager UI** (`/admin/agents` or `/admin/sales-agents`) — never built. Only the
  role-safe API stub (`/api/admin/sales-agents/list.ts` + `sales-agents-logic.ts`) exists.
- **Coupons Manager UI** (`/admin/coupons`) — never built. `/api/coupons/validate.ts` exists for the
  *customer-facing* validation call on ordinary checkout, but there is no admin CRUD screen for coupons.
- **Locations & Teams Manager UI** (`/admin/locations-teams`) — never built (Pushkar-only seed data has
  sufficed so far).
- **SEO & Content Editor** (`/admin/seo`) — never built (`page_seo`/`blog_posts` tables exist, unused by
  any UI).
- **Audit Log Viewer** (`/admin/audit-log`) — never built. The `audit_logs` table receives rows correctly
  from the webhook and every telecaller mutating endpoint; there's simply no screen to read them from
  yet.
- **Prasad Box Tracking UI** — never built (`prasad_shipments` table exists, unused by any UI).
- **Birthday pooja paid add-on** — never built (`family_members.dob` is captured, no cron/charge flow
  exists).

---

## 23. Future Enhancements / Roadmap

1. Close the risk-register items in §21 (esp. re-verify the "unconfirmed" ones before scaling volume)
2. Ship the halted-subscription recovery spec (§13, migration 015)
3. Confirm/apply the Razorpay tenure fix (`total_count=1200`/`100`)
4. Wire Meta WhatsApp Business API (currently `wa.me` manual fallback)
5. Build the modules in §22 that are still wanted (Sales Agents, Coupons, SEO, Audit Log, Prasad, Locations/Teams UIs)
6. Full end-to-end QA pass across telecaller/hospitals/commission flow
7. Birthday pooja paid add-on
8. Paid marketing (NRI/diaspora segment prioritized)

### Longer-horizon ideas
| Feature | Description |
|---|---|
| Multi-location expansion | Shyam Baba, Mahadev/Shiva poojas |
| Gift subscriptions | Buy a seva subscription for someone else |
| Live streaming | Live Sundarkand via embedded stream |
| Mobile app | Native wrapper around existing web flows |
| Devotee analytics | Personal "impact" view of accumulated punya over years |
| Razorpay plan-upgrade flow | Needs a cancel-vs-re-mandate decision, since UPI-authorized subscriptions can't be updated via API once mandated |

---

## 24. Legal / Compliance

- MOA/AOA filed with the Registrar of Companies (ROC)
- Udyam registration in progress for Razorpay KYC — Sole Proprietorship recommended over Individual

---

## 25. Core Architecture Principles

- Webhook-driven activation only — never frontend-, admin-, or telecaller-triggered subscription status
  changes. `/api/payments/webhook` is the **only** code path in the entire product that may ever set
  `subscriptions.status = 'active'`.
- Soft-delete-only on `plans`, `sevas`, `sales_agents`, `coupons`, `hospitals`, agent allotments.
- Seva schedule rules live at the seva level, never hardcoded at the plan level.
- Plan-to-seva composition is flexible and admin-editable (`plan_sevas`) — never hardcode.
- Plan composition changes apply immediately to all subscribers — no grandfathering.
- Multi-location/multi-team support built into the schema from day one.
- `telecaller`/`agent` roles are **siblings**, not admin subsets — `is_admin()` must never widen to
  include them; all their access is service-role-gated API routes with explicit field allowlists.
- No coupon codes in the telecaller/agent flow — attribution is link-token + verbal backup, never a
  discount code. Public customer-facing coupons remain separate and untouched.
- Commission ledger is append-only; refunds are negative reversal entries; payout periods are lockable.
- Every `SECURITY DEFINER` function must carry an explicit `REVOKE EXECUTE FROM public, anon,
  authenticated` — this is now a permanent migration-checklist item after C1 (§21).
- Before writing a migration that does `CREATE OR REPLACE VIEW` (or otherwise redefines an existing
  view/function) on an object that has been touched more than once, `grep` **all** of
  `supabase/migrations/*.sql` for that object's name first and diff against the *most recent* definition
  — not the one in this doc, and not the object's original `CREATE` migration. `subscriber_list_view` in
  particular has been redefined at least twice (`003` → `015` → `022`, each dropping/renaming columns
  like `razorpay_sub_id` → `mandate_gateway_id`); building a new migration off an older copy silently
  reverts those changes and breaks on the dropped columns. (Found 2026-08-30, `023`.) This is now a
  permanent migration-checklist item.
- If a pure/tested logic module exists (commission math, seva scheduling, performance metrics), the
  calling route must call it — never re-implement it inline next to the tested version.
- Always the lowest-maintenance viable architecture for a solo-founder operation.

---

## 26. Communication & Working-Style Notes

- Chirayu communicates in **Hinglish** — match this register when working with him directly.
- He consistently pushes back on over-engineered solutions — always default to the simplest viable
  approach.
- He prefers ready-to-paste, direct, token-efficient prompts for AI coding tools, consolidating multiple
  fixes into one master prompt per session, in the house `SESSION_<TOPIC>_PROMPT.md` format: pre-flight
  repo-reality check → numbered fix sections with exact file/line references → explicit DO NOT
  constraints → a "Definition of done" checklist.
- Reviews are done against the actual repo files, not the session's self-reported summary — this has
  caught real, sometimes money-losing bugs (§21) that a green test suite alone missed.
- He reasons in numbers and pushes back hard when a framing doesn't match his actual operational reality.
- Business decisions like tier-seva composition, scheduling days, and commission rates change fairly
  often — always confirm current state rather than assuming, and always build UI/logic to read live from
  the database, not hardcoded values.
- Codes via OpenCode, model-agnostic between Kimi K3 and oxAlpha — write session prompts to be usable by
  either.

---

*Document version: v4 — folds in the telecaller panel, hospitals/attribution model, commission engine,
owner performance leaderboard, and the halted-subscription gap/spec. Corrects the record on what v3
described but was never built (§22). Supersedes `PUNYATA_MASTER_CONTEXT_v3.md` entirely.*

*🚩 Sewa Hamari, Punya Aapka 🚩*
