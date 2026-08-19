# 🕉️ PUNYATA — Master Context Document (v3)
### "Sewa Hamari, Punya Aapka"

**Purpose of this document:** Single, self-contained brief for any AI agent (coding assistant, LLM, consultant) to understand the entire Punyata product — business model, data architecture, operational logic, admin system, API surface, and build status — in one read. This is v3 and **supersedes** `PUNYATA_MASTER_CONTEXT (2).md` (v2) and the earlier "Punyam Sewa" draft entirely.

If you are an AI coding agent picking this up: **read this fully before writing any code, schema, or copy.**

---

## 🆕 CHANGELOG — v2 → v3

1. **Sankalp List A day changed: First Tuesday → SECOND TUESDAY of the month.**
   List B (Last Saturday) is unchanged. This affects: `seva_schedule_rules`, `sankalp_batches.batch_type`, the onboarding catch-up rule, the Pending Sevas report, and all copy/admin labels that said "1st Tuesday." See Section 7.
2. **New module: Occasional Pooja Pages** — a way for Chirayu to generate a one-off, unlisted "micro-landing page" per subscriber for ad-hoc/occasional poojas (birthday, festival, special sankalp, etc.), attach a photo + custom message, and send the direct link to that subscriber via WhatsApp with an open/voluntary donation ask ("ab aapko jitna es pooja paath ka dena hai aap de sakte hain"). Never linked from the public site nav or sitemap — reachable only via its unique URL. Chirayu can toggle any page live/down anytime. See Section 6A and Section 10 (new admin module #7A).

3. **`sankalp_variant` RETIRED — Last Saturday is ONE batch, not two.**
   The `'hawan_only'` / `'full_package'` split was never a business rule: no plan
   grants a hawan without the rest of its sevas. It was also a live bug —
   membership was computed once for `kind='last_saturday'` and inserted into BOTH
   rows, so every List B subscriber was enrolled twice (two pandit entries, two
   proof videos, double `subscriber_count`). The column is dropped and a UNIQUE
   `(batch_type, batch_date)` index now makes one-batch-per-day structural.
   See Section 7 and migration `20260819_010_retire_sankalp_variant.sql`.
4. **The two hawans are DAY-SPECIFIC, not interchangeable.**
   Griha Shanti Hawan is the Second Tuesday hawan; Sarv Rog Nivaran Hawan is the
   Last Saturday hawan. `plan_sevas` alone has no day dimension, so seva
   resolution must scope hawans by `seva_schedule_rules`; without it both hawans
   appeared on both days. Non-hawan sevas DO run on every batch day their plan is
   in. See Section 7.

Everything else in this document carries forward unchanged from v2 unless explicitly marked "UPDATED" below.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [System Architecture Diagram](#3-system-architecture-diagram)
4. [Folder Structure](#4-folder-structure)
5. [Database Schema](#5-database-schema)
6. [Product Catalog & Subscription Plans (Flexible)](#6-product-catalog--subscription-plans-flexible)
6A. [Occasional Pooja Pages (NEW)](#6a-occasional-pooja-pages-new)
7. [Sankalp Scheduling Logic (Locked Business Rules) — UPDATED](#7-sankalp-scheduling-logic-locked-business-rules--updated)
8. [Subscription Flow](#8-subscription-flow)
9. [Razorpay Integration Flow](#9-razorpay-integration-flow)
10. [Admin Dashboard Modules — UPDATED](#10-admin-dashboard-modules--updated)
11. [API Endpoints — UPDATED](#11-api-endpoints--updated)
12. [Frontend Pages & Components — UPDATED](#12-frontend-pages--components--updated)
13. [WhatsApp Proof Delivery System](#13-whatsapp-proof-delivery-system)
14. [Security & Auth](#14-security--auth)
15. [Deployment Architecture](#15-deployment-architecture)
16. [Monthly Reporting System](#16-monthly-reporting-system)
17. [Build Status & Session Sequence](#17-build-status--session-sequence)
18. [Future Enhancements / Roadmap](#18-future-enhancements--roadmap)
19. [Legal / Compliance](#19-legal--compliance)
20. [Core Architecture Principles](#20-core-architecture-principles)
21. [Communication & Working-Style Notes](#21-communication--working-style-notes)

---

## 1. Project Overview

**Punyata** (punyata.com) is a Hindu devotional **subscription platform**. Subscribers across India (and the diaspora) pay a monthly/yearly fee, and Punyata performs religious rituals (sevas) on their behalf — in the subscriber's family name and gotra — at **Tirth Guru Pushkarraj, Pushkar, Rajasthan**. After each seva, Punyata sends photo/video proof to the family via WhatsApp.

**Tagline:** *"Sewa Hamari, Punya Aapka"* (also expressed as "Daan Punya Aapka, Sewa Hamari")

### Core positioning
Punyata is **not** a puja-booking marketplace and not a temple-visit product. It is the friction-remover for daan-punya (charity + religious merit): people want to do right by their family's religious obligations but don't have time, aren't near a temple, or don't know the correct process. Punyata is the subscriber's **"Punya Bank"** — a running, trustworthy ledger of religious merit accumulated on their behalf, month after month, with WhatsApp proof as the receipt.

Every product decision, copy line, and UX flow should reinforce: **convenience + trust + accumulation** — never "book a puja," never a marketplace/browse experience.

### What NOT to build (hard constraints)
- ❌ A generic "browse temples / pick a priest / choose a time slot" marketplace UX
- ❌ Docker / Docker Compose / MySQL / standalone Express server
- ❌ A location/deity picker visible to users today — only Pushkar is shown until a second location is genuinely ready to launch
- ❌ Full frontend teardown — extend the existing design system, don't rebuild from zero
- ❌ Never expose to the Pandit ji anything beyond: seva name(s) + plain name-gotra list per sankalp. Never plan name, phone number, or price.
- ❌ Never use the status label "Covered" in admin UI — flagged as confusing. Use **Done / Pending / Missed** only.
- ❌ Never grandfather old plan compositions — plan/seva changes apply immediately to all current subscribers.
- ❌ Never hard-delete `plans`, `sevas`, `sales_agents`, or `coupons` — soft-delete only (`is_active = false`).
- ❌ Never activate a subscription from the frontend — activation is **webhook-driven only**.
- ❌ Never hardcode which sevas belong to which plan in frontend code — this mapping must be fully admin-editable.
- ❌ **NEW:** Never link an Occasional Pooja page anywhere in site navigation, sitemap, footer, or search-indexable content — it must be reachable only via its direct unique URL shared by Chirayu.

### Target audience
- Primary: Urban IT/metro professionals, late 20s–early 40s, who feel guilt about not personally performing family religious duties
- Secondary: Indian diaspora abroad

### Founder / operating context
Solo founder: **Chirayu**. Always bias toward the **lowest-maintenance viable architecture**. No infra requiring an always-on paid server; no unnecessary complexity.

---

## 2. Tech Stack (mandatory)

```
Frontend   : TanStack Start (React 19 + Vite + Tailwind CSS)
Backend    : Vercel Serverless Functions (/api folder) — privileged ops requiring secret keys only
Database   : Supabase (PostgreSQL) with Row Level Security
Auth       : Supabase Auth (phone OTP)
Storage    : Cloudinary (proof images/videos, card assets, occasional pooja photos)
Payments   : Razorpay Subscriptions API (UPI AutoPay primary); Razorpay Payment Links / Orders API for one-time charges (birthday pooja add-on, occasional pooja donations)
WhatsApp   : Meta WhatsApp Business API (pending Meta approval) — manual wa.me fallback currently ACTIVE
Email      : Resend (transactional only)
Hosting    : Vercel free tier (punyata.com primary, punyata.in → 308 redirect), Hostinger DNS
Animation  : Framer Motion, Lottie (lottie-react, JSON from LottieFiles.com)
Video ads  : Higgsfield.ai (AI video generation)
```

**Explicitly excluded:** Docker, MySQL, standalone Express, NextAuth-from-scratch, Multer, Prisma, generic multi-vendor "browse & book" marketplace UX.

### Repo / branch discipline
- GitHub: `chirayusingodia/site-making-love`
- **Chirayu codes all sessions via OpenCode terminal using Kimi K3** (Moonshot AI, API-based)
- **Antigravity** works directly on the `staging` branch (Single Active Writer rule)
- Chirayu personally reviews and merges `staging` → `main`
- Supabase project: **"Punyata"**, project ID `omjivlmfsikeqwndtlcn`

### Brand / design system
- Palette: cream `#FDF3EB`, saffron-orange `#D85A30` — **no purple/violet/indigo, ever**
- Devanagari-supporting fonts retained from existing design system
- Extend the existing component library rather than tearing down and rebuilding, unless a section genuinely requires a new pattern

---

## 3. System Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────┐
│                          USER (Browser / WhatsApp)                 │
│         Landing → Plan Selection → Family Details → Checkout       │
│         + Occasional Pooja unlisted link (via WhatsApp only)       │
└──────────────────────────────┬──────────────────────────────────────┘
                                │ HTTPS
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│           TANSTACK START FRONTEND (React 19 + Vite + Tailwind)      │
│                         hosted on Vercel                             │
│  ┌────────────┐  ┌───────────────┐  ┌────────────────────────────┐ │
│  │ Public Site│  │ Subscribe Flow│  │  User Dashboard (Punya Bank)│ │
│  └────────────┘  └───────────────┘  └────────────────────────────┘ │
│  ┌────────────────────────┐  ┌────────────────────────────────┐   │
│  │ /occasion/:slug (UNLISTED│  │      Admin Panel (role-gated)   │  │
│  │ single-use donation page)│  └────────────────────────────────┘  │
│  └────────────────────────┘                                       │
└───────────────┬───────────────────────────────┬─────────────────────┘
                │ direct client calls            │ privileged calls
                ▼                                ▼
   ┌───────────────────────┐        ┌──────────────────────────────┐
   │  Supabase (Postgres)   │        │  Vercel Serverless Functions   │
   │  + RLS policies        │◄──────►│  (/api) — secret-key operations│
   │  + Supabase Auth (OTP) │        │  Razorpay order/webhook,       │
   └───────────┬────────────┘        │  Cloudinary signed uploads,    │
               │                     │  WhatsApp send, cron jobs      │
               │                     └───────────┬────────────────────┘
               │                                 │
               ▼                                 ▼
   ┌───────────────────────┐        ┌──────────────────────────────┐
   │  Core Tables:          │        │  External Services:            │
   │  profiles, plans,      │        │  Razorpay Subscriptions API    │
   │  sevas, subscriptions, │        │  Razorpay Payment Links (donation)│
   │  family_members,       │        │  Cloudinary (media CDN)        │
   │  payments,             │        │  Meta WhatsApp Business API    │
   │  sankalp_batches,      │        │  (wa.me manual fallback today) │
   │  seva_proofs,          │        │  Resend (email)                │
   │  name_segments,        │        └──────────────────────────────┘
   │  occasional_poojas ★NEW│
   └───────────────────────┘
                │
                ▼
   ┌───────────────────────────────────────────┐
   │  Twice-Monthly Sankalp Batch Engine         │
   │  (live-generated, never cached)             │
   │  List A: SECOND Tuesday → all active subs   │  ← UPDATED (was First Tuesday)
   │  List B: Last Saturday → Hawan-eligible only │
   └───────────────────────────────────────────┘
                │
                ▼
   ┌───────────────────────────────────────────┐
   │  Admin: Proof Upload → Mark Batch Done →     │
   │  WhatsApp delivery (common footage +         │
   │  personalized name-segment, 2 messages)      │
   └───────────────────────────────────────────┘
```

Key architectural note: unlike a typical SaaS, there is **no always-on backend server**. All privileged logic (Razorpay webhook handling, Cloudinary signed uploads, WhatsApp send actions, scheduled batch generation, occasional-pooja page creation) lives in **stateless Vercel Serverless Functions**, keeping this a zero-maintenance, free-tier-friendly stack suitable for a solo founder.

---

## 4. Folder Structure

```
punyata/
├── app/                          # TanStack Start routes
│   ├── routes/
│   │   ├── index.tsx              # Landing page
│   │   ├── subscribe/             # Plan selection → family details → checkout
│   │   ├── dashboard/             # User "Punya Bank" dashboard
│   │   ├── r/$agentCode.tsx       # Agent referral link landing
│   │   ├── occasion/$slug.tsx     # ★NEW — unlisted occasional pooja page (public, no nav link)
│   │   └── admin/                 # Admin panel routes (role-gated)
│   │       ├── overview.tsx
│   │       ├── subscribers/
│   │       ├── plans-sevas/
│   │       ├── locations-teams/
│   │       ├── agents/
│   │       ├── coupons/
│   │       ├── proof-upload/
│   │       ├── occasional-poojas/ # ★NEW — create/manage occasional pooja pages
│   │       ├── prasad/
│   │       ├── payments/
│   │       ├── reports/
│   │       ├── seo/
│   │       ├── audit-log/
│   │       └── reports.tsx        # /admin/reports — owner-only executive dashboard
│   └── root.tsx
│
├── components/
│   ├── ui/                        # shared component library (extend, don't replace)
│   ├── home/                      # HeroSection, PunyaMeterQuiz, HowItWorks, etc.
│   ├── subscribe/                 # PlanCard, FamilyMemberForm, CouponInput, PaymentButton
│   ├── dashboard/                 # PunyaBankLedger, SevaProofGallery, BillingSection
│   ├── occasion/                  # ★NEW — OccasionHero, OccasionDonateButton (unlisted page UI)
│   └── admin/                     # SubscriberTable, ProofUploader, BatchTracker, ReportExporter,
│                                   # OccasionalPoojaEditor ★NEW
│
├── lib/
│   ├── supabase.ts                 # Supabase client (browser + server variants)
│   ├── razorpay.ts                 # Razorpay SDK setup
│   ├── whatsapp.ts                 # WhatsApp send helper (wa.me fallback today)
│   ├── cloudinary.ts               # Signed upload helpers
│   └── validators/                 # Zod schemas
│
├── api/                            # Vercel Serverless Functions
│   ├── payments/
│   │   ├── create-order.ts
│   │   └── webhook.ts
│   ├── proofs/
│   │   └── deliver.ts
│   ├── sankalp/
│   │   └── generate-batch.ts       # cron-triggered / manual batch generation
│   ├── occasional-poojas/          # ★NEW
│   │   ├── create.ts               # admin: creates page + unique slug
│   │   ├── toggle-active.ts        # admin: take page live/down
│   │   └── donate-order.ts         # creates Razorpay Payment Link / Order for open donation
│   └── admin/
│       └── reports.ts
│
├── public/                         # Static assets, card images
├── supabase/
│   └── migrations/                 # SQL migration history (schema in Section 5)
└── package.json
```

---

## 5. Database Schema (Supabase / Postgres — source of truth)

```sql
-- ─────────────────────────────────────────
-- LOCATIONS / DEITIES  (multi-location-ready; today, seed only Pushkar)
-- ─────────────────────────────────────────
create table locations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  deity_name    text,
  city          text,
  state         text,
  is_active     boolean default true,
  created_at    timestamptz default now()
);

-- ─────────────────────────────────────────
-- TEAMS
-- ─────────────────────────────────────────
create table teams (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid references locations(id),
  name          text not null,
  contact_phone text,
  is_active     boolean default true,
  created_at    timestamptz default now()
);

-- ─────────────────────────────────────────
-- SEVA CATALOG
-- ─────────────────────────────────────────
create table sevas (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text unique not null,
  description       text,
  location_id       uuid references locations(id),
  requires_sankalp  boolean default true,
  is_active         boolean default true,
  sort_order        int default 0,
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────
-- SEVA SCHEDULE RULES  (schedule lives at seva level, NOT plan level)
-- UPDATED: occurrence for TUE changed from 'first' to 'second'
-- ─────────────────────────────────────────
create table seva_schedule_rules (
  id            uuid primary key default gen_random_uuid(),
  seva_id       uuid references sevas(id),
  weekday       text,               -- 'TUE', 'SAT'
  occurrence    text,               -- 'second' (was 'first') for TUE; 'last' for SAT
  created_at    timestamptz default now()
);
-- Migration note: existing rows with weekday='TUE' and occurrence='first'
-- must be updated to occurrence='second' as part of this change. This is a
-- pure data update — no schema shape change required.

-- ─────────────────────────────────────────
-- SUBSCRIPTION PLANS
-- ─────────────────────────────────────────
create table plans (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text unique not null,
  price_paise       int not null,
  billing_period    text not null,           -- 'monthly' | 'yearly'
  razorpay_plan_id  text,
  location_id       uuid references locations(id),
  default_team_id   uuid references teams(id),
  tagline           text,
  highlight_text    text,
  features          jsonb,                   -- derived from plan_sevas + plan_addons at render time
  card_image_url    text,
  is_active         boolean default true,
  sort_order        int default 0,
  created_at        timestamptz default now()
);

create table plan_sevas (
  plan_id   uuid references plans(id),
  seva_id   uuid references sevas(id),
  primary key (plan_id, seva_id)
);

create table plan_addons (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid references plans(id),
  addon_type    text not null,     -- 'prasad' | 'certificate'
  description   text,
  is_active     boolean default true,
  created_at    timestamptz default now()
);

create table plan_history (
  id                uuid primary key default gen_random_uuid(),
  subscription_id   uuid references subscriptions(id),
  old_plan_id       uuid references plans(id),
  new_plan_id       uuid references plans(id),
  changed_at        timestamptz default now(),
  changed_by        uuid references profiles(id)
);

-- ─────────────────────────────────────────
-- SALES AGENTS
-- ─────────────────────────────────────────
create table sales_agents (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  phone               text unique,
  agent_code          text unique not null,
  commission_percent  numeric,
  is_active           boolean default true,
  created_at          timestamptz default now()
);

-- ─────────────────────────────────────────
-- COUPONS / OFFERS
-- ─────────────────────────────────────────
create table coupons (
  id                    uuid primary key default gen_random_uuid(),
  code                  text unique not null,
  discount_type         text not null,
  discount_value        int not null,
  applicable_plans      uuid[],
  visibility            text default 'public',
  is_customer_facing    boolean default true,
  assigned_to_user_id   uuid references profiles(id),
  assigned_to_agent_id  uuid references sales_agents(id),
  max_redemptions       int,
  times_redeemed        int default 0,
  valid_from            timestamptz,
  valid_until           timestamptz,
  is_active             boolean default true,
  created_at            timestamptz default now()
);

-- ─────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────
create table profiles (
  id            uuid primary key references auth.users(id),
  full_name     text not null,
  phone         text unique not null,
  email         text,
  city          text,
  country       text default 'India',
  role          text default 'user',          -- 'user' | 'admin' | 'owner'
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ─────────────────────────────────────────
-- SUBSCRIPTIONS
-- ─────────────────────────────────────────
create table subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references profiles(id),
  plan_id               uuid references plans(id),
  coupon_id             uuid references coupons(id),
  sales_agent_id        uuid references sales_agents(id),

  razorpay_sub_id       text unique,
  razorpay_customer_id  text,

  status                text default 'pending',
  start_date            timestamptz,
  next_billing_date     timestamptz,
  paused_at             timestamptz,
  cancelled_at          timestamptz,
  cancel_reason         text,

  acquisition_channel   text,

  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
-- Activation is WEBHOOK-DRIVEN ONLY. Never set status='active' from the frontend.

-- ─────────────────────────────────────────
-- FAMILY MEMBERS
-- ─────────────────────────────────────────
create table family_members (
  id                uuid primary key default gen_random_uuid(),
  subscription_id   uuid references subscriptions(id),
  full_name         text not null,
  gotra             text,
  relation          text,
  slot_number       int not null check (slot_number between 1 and 4),
  is_primary        boolean default false,
  dob               date,
  created_at        timestamptz default now(),
  unique (subscription_id, slot_number)
);

-- ─────────────────────────────────────────
-- PAYMENTS
-- ─────────────────────────────────────────
create table payments (
  id                   uuid primary key default gen_random_uuid(),
  subscription_id      uuid references subscriptions(id),
  razorpay_payment_id  text unique,
  razorpay_order_id    text,
  amount_paise         int not null,
  status               text not null,
  method               text,
  cycle_number         int,
  paid_at              timestamptz,
  failure_reason       text,
  created_at           timestamptz default now()
);

-- ─────────────────────────────────────────
-- SANKALP BATCHES
-- UPDATED: batch_type value 'first_tuesday' renamed to 'second_tuesday'
-- ─────────────────────────────────────────
create table sankalp_batches (
  id                uuid primary key default gen_random_uuid(),
  batch_type        text not null,      -- 'second_tuesday' (was 'first_tuesday') | 'last_saturday'
  batch_date        date not null,
  -- sankalp_variant RETIRED (migration 010). One batch per (batch_type,
  -- batch_date), enforced by a UNIQUE index. Do not reintroduce a variant
  -- column: the old 'hawan_only'/'full_package' pair covered an identical
  -- member set and double-enrolled every List B subscriber.
  status            text default 'pending',  -- pending | done | missed
  completed_at      timestamptz,
  subscriber_count  int,
  created_at        timestamptz default now()
);
-- Migration note: any existing rows with batch_type='first_tuesday' should be
-- relabeled 'second_tuesday' going forward; historical rows can keep their
-- original label since they reflect what actually happened on that date —
-- only NEW batch generation logic changes.

create table sankalp_batch_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid references sankalp_batches(id),
  subscription_id   uuid references subscriptions(id),
  is_catchup        boolean default false,
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────
-- SEVA PROOF
-- ─────────────────────────────────────────
create table seva_proofs (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid references sankalp_batches(id),
  seva_id           uuid references sevas(id),
  team_id           uuid references teams(id),
  month             int not null,
  year              int not null,
  media_url         text not null,
  media_type        text default 'image',
  caption           text,
  is_delivered      boolean default false,
  delivered_at      timestamptz,
  whatsapp_msg_id   text,
  uploaded_by       uuid references profiles(id),
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────
-- NAME SEGMENTS
-- ─────────────────────────────────────────
create table name_segments (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid references sankalp_batches(id),
  segment_number    int not null,
  video_url         text not null,
  created_at        timestamptz default now()
);
-- SEGMENT_SIZE_SUBSCRIPTIONS = 5 (5 subscriptions/families per segment,
-- up to 20 names per segment video — see Section 13)

-- ─────────────────────────────────────────
-- PRASAD SHIPMENTS
-- ─────────────────────────────────────────
create table prasad_shipments (
  id                uuid primary key default gen_random_uuid(),
  subscription_id   uuid references subscriptions(id),
  month             int,
  year              int,
  status            text default 'pending',
  tracking_id       text,
  shipped_at        timestamptz,
  delivered_at      timestamptz,
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────
-- ★NEW: OCCASIONAL POOJA PAGES
-- One-off, unlisted "micro-landing" pages Chirayu generates ad-hoc for a
-- specific subscriber/occasion (birthday, festival, special sankalp, etc.).
-- Each page gets a unique slug, custom photo + message, and an OPEN/
-- voluntary donation ask rather than a fixed subscription charge.
-- Never linked from site nav/sitemap — reachable only via direct URL,
-- which Chirayu shares manually over WhatsApp. Fully admin-togglable.
-- ─────────────────────────────────────────
create table occasional_poojas (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text unique not null,       -- URL path: punyata.com/occasion/{slug}
                                                      -- random/unguessable, NOT sequential (e.g. nanoid)
  subscription_id       uuid references subscriptions(id),   -- optional link to an existing subscriber
  recipient_name        text not null,               -- name shown on page/message (e.g. from family_members
                                                       -- or typed fresh if not an existing subscriber)
  recipient_gotra       text,
  occasion_label        text,                        -- e.g. 'Janamdin Pooja', 'Diwali Special Sankalp'
  title                 text not null,                -- headline shown on page, e.g.
                                                       -- 'Aapke Naam Ki Pooja Sampann Hui'
  message_body          text not null,                -- free-form content Chirayu writes per occasion
  image_url             text,                         -- Cloudinary — proof photo/video thumbnail for this occasion
  video_url             text,                         -- optional Cloudinary video
  suggested_amount_paise int,                         -- optional anchor amount shown on page (not enforced)
  razorpay_payment_link_id  text,                      -- Razorpay Payment Link (supports variable/open amount
                                                        -- via "Payment Page" style link — confirm at build time,
                                                        -- see Section 9 open question) OR left null for a simple
                                                        -- amount-select UI backed by Orders API per click
  is_active             boolean default true,          -- Chirayu's on/off toggle — "take the page down"
  view_count            int default 0,
  created_by             uuid references profiles(id),
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);
-- App rule: /occasion/:slug returns 404-equivalent ("page not found / no longer
-- available") whenever is_active = false, regardless of whether the row still
-- exists — so "taking it down" is instant and reversible.
-- RLS: public SELECT only where is_active = true; all writes admin-only.

-- ─────────────────────────────────────────
-- NOTIFICATIONS LOG
-- ─────────────────────────────────────────
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id),
  type        text not null,
  channel     text not null,
  message     text,
  status      text,
  meta        jsonb,
  sent_at     timestamptz default now()
);

-- ─────────────────────────────────────────
-- SEO / BLOG
-- ─────────────────────────────────────────
create table page_seo (
  id                uuid primary key default gen_random_uuid(),
  path              text unique not null,
  title             text,
  meta_description  text,
  og_image_url      text,
  updated_at        timestamptz default now()
);

create table blog_posts (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  title             text not null,
  body_md           text,
  cover_image_url   text,
  is_published      boolean default false,
  published_at      timestamptz,
  created_at        timestamptz default now()
);
-- Note: page_seo is intentionally NOT populated for /occasion/:slug pages —
-- they must stay unindexed. Add a route-level noindex/robots meta tag instead
-- of an SEO entry, and exclude /occasion/* from any generated sitemap.xml.

-- ─────────────────────────────────────────
-- AUDIT LOG
-- ─────────────────────────────────────────
create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references profiles(id),
  action      text not null,
  entity      text,
  entity_id   uuid,
  meta        jsonb,
  created_at  timestamptz default now()
);
-- occasional_poojas create/toggle-active/edit actions should log here too,
-- same as any other admin content action.
```

---

## 6. Product Catalog & Subscription Plans (Flexible)

### Seva catalog (data-driven — never hardcode in frontend)
1. Sundarkand Path
2. Gau Seva
3. Vanara Seva
4. Saadhu Santo Ko Bhojan (never "Brahmin Bhojan" in copy/code)
5. Griha Shanti Hawan
6. Sarv Rog Nivaran Hawan

### ⚠️ Subscription tiers are FLEXIBLE by design — do not hardcode seva composition

Confirm current composition with Chirayu before relying on this — it changes over time via `plan_sevas`, a pure data operation, zero deploys.

| Tier | Price | Billing | Sevas included (current) |
|---|---|---|---|
| **Basic** | ₹251 | Monthly | Sundarkand Path, Gau Seva, Vanar Seva — 2nd Tuesday only, 1x/month each. No Bhojan, no Hawan. |
| **Premium** | ₹399 | Monthly | Sundarkand Path, Gau Seva, Vanar Seva, Saadhu Santo Ko Bhojan — on BOTH 2nd Tuesday and Last Saturday (2x/month each) + Griha Shanti Hawan (2nd Tuesday only) + Sarv Rog Nivaran Hawan (Last Saturday only) |
| **Premium Annual** | ₹4,101/yr | Yearly | Same as Premium + prasad shipment + Sankalp Certificate |

- Each subscription covers **up to 4 family members** (name + gotra), all used in every sankalp performed under that subscription.
- More tiers/sevas will be added over time — schema supports this without a deploy.

### Mandatory card copy/design rules
- Clearly state the team performing the sevas (`teams.name`, admin-editable)
- Visibly include **"Daan Punya Ek Saath"** and **"Pooja Aur Chadava Dono Ka Package"** on the card itself
- Unique card visual per plan — never one generic template image reused across tiers

### Physical prasad (Premium Annual only)
Lightweight non-perishables only: Sarovar jal, chandan tilak, akshat/kumkum, mauli thread, Sankalp certificate. No perishable food, no heavy items.

---

## 6A. Occasional Pooja Pages (NEW)

### What this is
A lightweight, admin-only tool for Chirayu to create a **single, unlisted page** tied to one specific occasion for one specific subscriber (or even a prospective/non-subscriber, since `subscription_id` is optional) — e.g. a birthday sankalp, a festival-special pooja, or a one-off gesture. The page carries a photo/video, a custom message, and an **open donation ask** rather than a fixed price — matching the "ab aapko jitna es pooja paath ka dena hai, aap de sakte hain" framing.

### Why it's separate from the main subscription flow
- It's **not** a plan, not recurring, not tied to `plan_sevas`
- It must be **createable and killable in minutes**, with zero impact on the main site's nav/SEO/sitemap
- The donation amount is voluntary/open, unlike fixed-price plans

### Admin workflow
1. Chirayu opens `/admin/occasional-poojas` → "Create New"
2. Picks (optional) an existing subscriber/subscription to auto-fill name + gotra, or types a name fresh
3. Fills: occasion label, title, message body, uploads a photo/video (Cloudinary signed upload), optionally sets a suggested anchor amount
4. System generates a unique, unguessable `slug` → page live at `punyata.com/occasion/{slug}`
5. Chirayu copies the link and sends it manually via personal WhatsApp with his own message
6. Subscriber opens the link → sees the photo/message → taps a "Daan Dein" button → pays whatever amount they choose (or picks from small preset chips like ₹51/₹101/₹251/Custom) via Razorpay
7. Chirayu can toggle the page **inactive** anytime from the same admin list — page instantly shows a graceful "no longer available" state, page row/data stays intact for records (soft toggle, not delete)

### Page requirements (public-facing `/occasion/:slug`)
- No header/footer nav linking back into the main site's subscribe funnel — keep it a self-contained, focused single page
- `noindex, nofollow` meta tag; excluded from `sitemap.xml`
- Falls back to a simple "this page is no longer available" screen if `is_active = false` or slug doesn't exist — never a raw 404/500
- Brand palette only (cream + saffron), consistent with rest of site
- One primary CTA: donate button → Razorpay checkout (Payment Link or Orders API, see Section 9)

### Open build question (flag before Session build)
Razorpay Payment Links are typically fixed-amount. For a true "pay whatever you want" flow, two options to evaluate at build time:
- **Option A:** Preset amount chips (₹51/₹101/₹251/₹501/Custom-amount field) → each selection creates a fresh Razorpay **Order** (Orders API, one-time, not Subscriptions) server-side via `/api/occasional-poojas/donate-order.ts`, then opens Razorpay Checkout with that exact amount
- **Option B:** Razorpay's "Payment Pages" product (if available on the account) which natively supports variable/donor-chosen amounts

Default to **Option A** (Orders API + preset chips) since it needs no additional Razorpay product enablement and fits the existing stack pattern already used for the birthday pooja add-on.

---

## 7. Sankalp Scheduling Logic (Locked Business Rules) — UPDATED

This is the operational heart of the product and must be implemented exactly as specified — it is locked regardless of how tier-seva composition shifts.

- Puja happens **exactly twice a month** — never weekly, never daily.
- **List A — SECOND Tuesday of the month** *(changed from First Tuesday)*: ALL active subscribers (every tier) → whichever sevas their current plan includes (per live `plan_sevas` lookup).
- **List B — Last Saturday of the month**: Subscribers on plans that include Hawan (currently Premium + Premium Annual) → **ONE sankalp**, covering that plan's sevas plus the Saturday hawan. *(UPDATED — the former Hawan-only + Full-package pair is retired; see Changelog #3.)*
- **Hawan day-scoping (LOCKED):** the two hawans are **not interchangeable**.
  **Griha Shanti Hawan → Second Tuesday. Sarv Rog Nivaran Hawan → Last Saturday.**
  Every NON-hawan seva in a plan runs on **every** batch day that plan is in, so
  a Premium subscriber receives Sundarkand Path, Gau Seva, Vanar Seva and Saadhu
  Santo Ko Bhojan **twice a month** and each hawan **once**. Resolution must
  intersect hawans with `seva_schedule_rules` — `plan_sevas` carries no day
  dimension, so reading it alone puts both hawans on both days.
  Concretely, for Premium/Premium Annual:
  | Batch | Sevas performed |
  |---|---|
  | Second Tuesday | Sundarkand, Gau Seva, Vanar Seva, Saadhu Santo Ko Bhojan, **Griha Shanti Hawan** |
  | Last Saturday | Sundarkand, Gau Seva, Vanar Seva, Saadhu Santo Ko Bhojan, **Sarv Rog Nivaran Hawan** |
  Basic includes no hawan at all and therefore never joins List B (except the
  one-time catch-up below, which also excludes hawan).
- Lists are always generated **live/fresh** from currently-active subscriptions **and current plan_sevas mapping** at generation time — **never cached**.
- **Basic tier limitation (not a bug):** A subscriber on a Saturday-ineligible plan who joins after that month's Second Tuesday must wait until next month's Second Tuesday.
- **Onboarding catch-up rule (Saturday-ineligible tiers only):** If such a subscriber joins *after* that month's Second Tuesday, they get a **one-time inclusion** in that same month's Last Saturday list, but only for the sevas their plan actually includes (NOT Hawan). From month 2 onward, they resume the normal Second-Tuesday-only cycle.

> **Why Second Tuesday and not First:** business/operational decision by Chirayu — gives a one-week buffer after month-start for that month's active-subscriber list to stabilize (failed payments retried, new sign-ups from the first few days settled) before the first sankalp of the month is generated. Purely operational; no change to the twice-a-month cadence itself.

### Batch tracking (admin-side)
- Each list generation (List A or List B, for a given month) creates **exactly one** distinct **batch record**: date + a snapshot of the subscriptions included. `(batch_type, batch_date)` is UNIQUE — regenerating a day refreshes that row's membership rather than inserting a second row.
- Admin manually clicks **"Mark Seva Completed"** per batch → locks a completion timestamp + subscriber count for that batch.
- Tuesday batches and Saturday batches are **completely independent records**. Marking one complete must never flip the other's status.
- Status labels shown in admin UI: **Done / Pending / Missed** — never "Covered."
- The **"Pending Sevas" report** shows per-subscription status per batch type (a Tuesday column and a Saturday column), and always shows the subscriber's join date/time alongside status.

---

## 8. Subscription Flow

```
Landing page — messaging: "Daan Punya Aapka, Sewa Hamari" / Punyata as the subscriber's "Punya Bank"
       │
       ▼
Plan cards (rendered dynamically from `plans` + live `plan_sevas` — tagline, highlight_text,
features list, team name, unique card_image_url per plan — all tiers shown together, no toggle)
       │
       ▼
Select a plan
       │
       ▼
Family details step:
  - Member 1 (compulsory): Full Name + Gotra + Relation
  - Members 2-4 (optional): Full Name + Gotra + Relation + DOB, "+ Add Family Member" up to 4 total
       │
       ▼
Contact details: Phone, Email, City, Country
       │
       ▼
Phone OTP verification (Supabase Auth)
       │
       ▼
Coupon code entry (optional) — validated against `coupons`;
  agent-shared links can pre-fill attribution
       │
       ▼
Review: plan, all family members (name+gotra used in every sankalp), team performing
the seva, price after coupon discount
       │
       ▼
Razorpay Checkout → UPI AutoPay mandate / card auto-debit
       │
       ├─ SUCCESS → subscription created via WEBHOOK (status: active) + family_members rows
       │            → WhatsApp welcome message
       │            → subscriber auto-included in the next live-generated List A/B
       │
       └─ FAILED  → retry notification (WhatsApp + email) → after 3 failures → status: pending, flagged in admin

Twice-monthly Sankalp cycle (UPDATED):
  Second Tuesday → List A generated live → ALL active subs → sevas per current plan
  Last Saturday  → List B generated live → Hawan-eligible plans only → ONE sankalp (plan sevas + Sarv Rog Nivaran Hawan)
  → admin marks each batch "Done" independently
  → proof uploaded per batch (common footage + name-segment video)
  → WhatsApp delivery (2 messages per subscriber)
  → user's dashboard shows a running "Punya Bank" ledger derived from seva_proofs

Separately (ad-hoc, not tied to the cycle above):
Admin creates an Occasional Pooja page → unique link sent via WhatsApp → subscriber
opens page → sees photo/message → makes an open/voluntary donation via Razorpay →
Chirayu can take the page down anytime.
```

**User dashboard** shows a computed timeline/count of sevas performed to date — no separate table needed; it's a view over `seva_proofs` + `sankalp_batch_subscriptions` + `family_members`. (Occasional pooja donations are separate one-off events and are **not** part of this recurring ledger, though they may optionally be surfaced as a "Special Sevas" note if useful later.)

---

## 9. Razorpay Integration Flow

- One Razorpay Plan per `plans` row (`razorpay_plan_id` kept in sync)
- Checkout must account for coupon discount before creating the Razorpay subscription amount. **Known open risk:** UPI AutoPay + dynamic coupon discount may have friction — fall back to admin-applied manual discount coding if so.
- Webhook handler (`/api/payments/webhook`), HMAC-SHA256 verified, handles: `subscription.activated`, `subscription.charged`, `subscription.payment.failed`, `subscription.paused`, `subscription.resumed`, `subscription.cancelled`, `subscription.completed`
- **Critical open question (unresolved):** UPI-authorized subscriptions **cannot be updated via the Razorpay API** once mandated — blocks a simple in-place plan-upgrade flow.
- **Birthday pooja add-on (planned):** one-time charge via Razorpay Payment Links/Orders API; cron looks 2–3 days ahead of `family_members.dob`.
- **★NEW — Occasional Pooja donations:** one-time charge, same Orders-API pattern as the birthday add-on. Default approach: preset amount chips → server creates a fresh Order per selection → Razorpay Checkout opens for that exact amount → on success, mark that `occasional_poojas` row's donation as received (extend schema with a lightweight `occasional_pooja_payments` table if per-page multiple-donor tracking is needed later — not required for v1, a single Order-per-click flow with a webhook-confirmed `payments`-style log is sufficient to start).

---

## 10. Admin Dashboard Modules — UPDATED

1. **Overview Dashboard** — active subs, MRR, this-month revenue, pending proofs, failed payments, paused subs
2. **Subscribers** — table incl. family members per subscription, plan, status, agent attribution, coupon used; filters; CSV export; Subscriber 360 view
3. **Plans & Sevas Manager** — CRUD `plans`, `sevas`, `plan_sevas` mapping, `seva_schedule_rules` (now reflects Second Tuesday / Last Saturday)
4. **Locations & Teams Manager** — CRUD `locations`, `teams`
5. **Sales Agents Manager** — CRUD agents, referral links (`punyata.com/r/FM_XXXX`)
6. **Coupons Manager** — CRUD, visibility control, redemption stats
7. **Proof Upload + Sankalp Batch Tracking** — batch-based upload, per-batch "Mark Seva Completed," WhatsApp send workflow
7A. **★NEW — Occasional Poojas Manager** (`/admin/occasional-poojas`)
   - List view: all pages with slug, occasion label, recipient, created date, active/inactive toggle, view count
   - "Create New" form: pick subscriber (optional) or type name fresh, occasion label, title, message body, photo/video upload, optional suggested amount
   - One-click **copy link** button (`punyata.com/occasion/{slug}`) for pasting into WhatsApp
   - One-click **toggle active/inactive** ("take down") per page — instant, reversible
   - Never surfaced in public nav/sitemap — this module itself is the only place these links are discoverable
8. **Prasad Box Tracking** — status per subscriber
9. **Payments Log** — transactions, failures, refunds (subscription payments; occasional-pooja donations can be a filterable sub-view here or their own tab)
10. **Reports** — subscriber report, revenue report, seva completion report, "Pending Sevas" report, CSV/PDF export
11. **SEO & Content Editor** — `page_seo`, `blog_posts` (explicitly excludes `/occasion/*` routes)
12. **Audit Log Viewer** — now also logs occasional-pooja create/toggle/edit actions
13. **CEO/Executive Dashboard** (`/admin/reports`, owner-gated) — planned

---

## 11. API Endpoints — UPDATED

```
Auth (Supabase Auth directly)
  signInWithOtp / verifyOtp (client SDK)

Subscriptions
  POST   /api/subscriptions/create-checkout
  GET    /api/subscriptions/my                  (via Supabase client + RLS)
  POST   /api/subscriptions/pause
  POST   /api/subscriptions/resume
  POST   /api/subscriptions/cancel

Payments
  POST   /api/payments/create-order
  POST   /api/payments/webhook

Proofs / Sankalp
  POST   /api/sankalp/generate-batch            → live-generates List A (Second Tuesday) or List B (Last Saturday)
  POST   /api/proofs/upload
  POST   /api/proofs/deliver
  PATCH  /api/sankalp/batches/:id/complete

★NEW — Occasional Poojas
  POST   /api/occasional-poojas/create           → admin: creates page + unique slug (auth: admin/owner only)
  PATCH  /api/occasional-poojas/:id/toggle-active → admin: flip is_active
  POST   /api/occasional-poojas/donate-order      → public: creates a Razorpay Order for a chosen/preset amount
                                                     against a given slug (rejects if is_active = false)
  GET    /api/occasional-poojas/:slug             → public: fetch page content (only if is_active = true)

Admin
  GET    /api/admin/reports/monthly
  GET    /api/admin/reports/pending-sevas
  GET    /api/admin/reports/export

Coupons / Agents
  POST   /api/coupons/validate
  POST   /api/agents/attribute
```

---

## 12. Frontend Pages & Components — UPDATED

### Public / User-facing
```
/                     → Landing
/subscribe            → Plan cards → Family details → Contact → OTP → Coupon → Review → Razorpay checkout
/r/:agentCode         → Agent referral landing
/dashboard            → PunyaBankLedger, SevaProofGallery, BillingSection, ManageSubscription
/occasion/:slug       → ★NEW, UNLISTED — occasional pooja page (photo/video, message, donate CTA);
                         noindex; not in any nav/footer/sitemap; graceful "no longer available"
                         state when inactive or not found
```

### Admin (role-gated: 'admin' or 'owner')
```
/admin/overview
/admin/subscribers
/admin/plans-sevas
/admin/locations-teams
/admin/agents
/admin/coupons
/admin/proof-upload
/admin/occasional-poojas      → ★NEW — create/manage/toggle occasional pooja pages
/admin/prasad
/admin/payments
/admin/reports
/admin/seo
/admin/audit-log
```

### Key shared components
```
PlanCard                → renders from `plans` + live `plan_sevas`
FamilyMemberForm        → up to 4 slots, slot 1 required
SankalpBatchTracker     → Tuesday/Saturday independent status, Done/Pending/Missed
ProofUploader           → common footage + name-segment video, batch-scoped
PunyaBankLedger         → timeline view derived from seva_proofs
OccasionHero            → ★NEW — public-facing occasional pooja page layout (photo/video + message + CTA)
OccasionDonateButton    → ★NEW — preset amount chips + custom field → triggers Razorpay Order flow
OccasionalPoojaEditor   → ★NEW — admin create/edit form (subscriber picker, upload, slug + link display)
```

---

## 13. WhatsApp Proof Delivery System

- **Current state:** Meta WhatsApp Business API integration is **pending Meta approval**. Manual `wa.me` fallback is **active**.
- **Future state:** Meta API wired in, with `whatsapp_msg_id` stored per proof/notification for delivery tracking.
- **Proof architecture is batch-based, not per-subscriber-per-upload.**
- **Video proof structure:**
  1. Common ~1-minute footage segment — shared across the entire batch
  2. Personalized ~2-minute name-reading segment — shared only within a subscriber's assigned segment group
- **Delivery = two separate WhatsApp messages.**
- `SEGMENT_SIZE_SUBSCRIPTIONS = 5` — 5 subscriptions (families) per segment, up to 20 names per segment video. Use this literal constant when instructing coding agents; never state "20" alone.
- **Occasional Pooja links are sent manually** by Chirayu via his personal WhatsApp — no automated delivery pipeline needed for v1, since each is a one-off, low-volume send.

---

## 14. Security & Auth

### Authentication strategy
```
1. Phone OTP verification (Supabase Auth) → registration + login, 30-day session
2. Role-based access: 'user' | 'admin' | 'owner' → route protection, enforced server-side via RLS
3. Razorpay Webhook Signature Verification → HMAC-SHA256
4. Cloudinary Signed Uploads → prevent direct/unsigned abuse
```

### Row Level Security (RLS)
- Enabled on **all** tables, including `occasional_poojas`.
- Users read only their own `profiles`, `subscriptions`, `family_members`, `payments`, `seva_proofs`, `prasad_shipments`, `notifications`.
- `occasional_poojas`: **public SELECT only where `is_active = true`**; no listing/enumeration endpoint exposed (slug must be known — obtained only via the direct link); all INSERT/UPDATE/DELETE admin-only.
- Admins (`profiles.role = 'admin'`) get full access via policy. Owner-only gates `/admin/reports`.
- `plans`, `sevas`, `locations`, `teams`, `page_seo`, `blog_posts` are public-read, admin-write.

### Environment variables (Vercel Environment Variables only — never committed)
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

## 15. Deployment Architecture

```
punyata.com  ──→ Vercel (TanStack Start app)
punyata.in   ──→ 308 redirect to punyata.com

Vercel Edge Network + Serverless Functions
  SSR / Static Pages (public + dashboard + /occasion/:slug, noindex)
  /api Functions (Razorpay, Cloudinary, WhatsApp, cron batch gen, occasional-poojas)

Supabase (PostgreSQL + Auth + RLS) + Cloudinary CDN + Razorpay + Meta WhatsApp Business API (pending)
DNS: Hostinger
```

### CI/CD
```
Antigravity commits → staging branch
Chirayu reviews → merges staging → main
GitHub push to main → Vercel auto-deploy
Supabase migrations applied via SQL migration files
```

No Docker, no standalone servers, no infra requiring always-on paid compute.

---

## 16. Monthly Reporting System

Unchanged from v2 — see Subscriber Status Report, Revenue Report, Seva Completion Report, Pending Sevas Report (now reflecting Second Tuesday / Last Saturday columns). Occasional Pooja donations should get their own lightweight line item ("Occasional Pooja Donations — count + total ₹") in the Revenue Report once volume justifies it; not required for v1.

---

## 17. Build Status & Session Sequence

- **Session 0:** Core Supabase schema, RLS, seed data — done/merged
- **Session 0.5:** Sankalp batch tracking schema (`sankalp_batches`, `sankalp_batch_subscriptions`, `plan_history`, DOB column) — done/merged
- **Session 1, 2, 2-fix, 3:** done/merged
- **Session 4 (Sankalp batch tracking):** in progress — **must incorporate the Second Tuesday change** (update `seva_schedule_rules` seed data + any hardcoded "first Tuesday" logic in batch-generation code)
- **Session 5:** upcoming
- **Session 6 (Razorpay payments webhook):** HMAC verification built; `RAZORPAY_WEBHOOK_SECRET` needs setting in Vercel
- **Session 7 (SEO + Audit Log + Subscriber 360):** upcoming
- **★NEW — Occasional Poojas module:** not yet scheduled into the 9-session sequence; recommend as its own scoped session (schema + admin CRUD + public unlisted route + donate-order endpoint) once Sessions 4–7 are through, since it's additive and doesn't block the core subscription/batch pipeline

---

## 18. Future Enhancements / Roadmap

1. Complete remaining build sessions (4–7)
2. Wire Meta WhatsApp Business API
3. Public-facing family member onboarding flow
4. Franchise/referral program
5. Prasad shipment tracking UI
6. Birthday pooja paid add-on
7. Full end-to-end QA pass
8. CEO/Executive Dashboard
9. **★NEW — Occasional Poojas module build** (see Section 6A)
10. Paid marketing (NRI/diaspora segment prioritized)

### Longer-horizon ideas
| Feature | Description |
|---|---|
| Multi-location expansion | Shyam Baba, Mahadev/Shiva poojas |
| Gift subscriptions | Buy a seva subscription for someone else |
| Live streaming | Live Sundarkand via embedded stream |
| Mobile app | Native wrapper around existing web flows |
| Devotee analytics | Personal "impact" view of accumulated punya over years |

---

## 19. Legal / Compliance

- MOA/AOA filed with the Registrar of Companies (ROC)
- Udyam registration in progress for Razorpay KYC — Sole Proprietorship recommended over Individual

---

## 20. Core Architecture Principles

- Webhook-driven activation only — never frontend-triggered subscription status changes
- Soft-delete-only on `plans`, `sevas`, `sales_agents`, `coupons`
- Seva schedule rules live at the seva level, never hardcoded at the plan level
- Plan-to-seva composition is flexible and admin-editable (`plan_sevas`) — never hardcode
- Plan composition changes apply immediately to all subscribers — no grandfathering
- Multi-location/multi-team support built into the schema from day one
- Franchise payouts are cash-UPI, qualification triggers only after first successful charge
- Always the lowest-maintenance viable architecture for a solo-founder operation
- **★NEW:** Anything "unlisted"/link-only (like Occasional Pooja pages) must be enforced server-side via RLS (`is_active` gate, no enumeration endpoint) — never rely on "nobody will guess the URL" alone as the only protection; slugs must be unguessable (random, not sequential/incrementing IDs)

---

## 21. Communication & Working-Style Notes

- Chirayu communicates in **Hinglish** — match this register when working with him directly.
- He consistently pushes back on over-engineered solutions — always default to the simplest viable approach.
- He prefers ready-to-paste, direct, token-efficient prompts for AI coding tools, consolidating multiple fixes into one master prompt per session.
- Each coding session prompt should include: a pre-flight self-audit step, explicit DO NOT constraints, and a required end-of-session summary.
- He reasons in numbers and pushes back hard when a framing doesn't match his actual operational reality.
- Business decisions like tier-seva composition and scheduling days change fairly often — always confirm current state rather than assuming, and always build UI/logic to read live from the database, not hardcoded values.

---

*Document version: v3 — Second Tuesday sankalp schedule change (was First Tuesday); adds Occasional Pooja Pages module (Section 6A) with schema, admin panel, public unlisted route, and Razorpay donation flow. Supersedes PUNYATA_MASTER_CONTEXT (2).md (v2) entirely.*

*🚩 Sewa Hamari, Punya Aapka 🚩*
