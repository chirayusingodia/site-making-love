# 🕉️ PUNYATA — Master Context for AI Coding Agent (Kimi K3 / OpenCode)
### "Sewa Hamari, Punya Aapka"

**Read this fully before writing any code, schema, or copy.** This is the single source of truth. It supersedes and replaces all earlier architecture drafts, including any doc referencing "Punyam Sewa" (obsolete name/stack — Next.js/Prisma — never use).

---

## 0. CRITICAL CONTEXT — READ FIRST

- **Brand name is FINAL: Punyata.** Domain: punyata.com (punyata.in → 308 redirect to .com). Never use any alternate/old name anywhere in code, copy, comments, config, or commit messages.
- **Founder:** Chirayu, solo founder. Always bias toward the **lowest-maintenance viable architecture** — this is a one-person operation, not a funded team. No infra requiring an always-on paid server. No unnecessary complexity.
- **Communication style:** Chirayu communicates in Hinglish. He reasons in numbers, pushes back on over-engineering, and wants direct, consolidated, paste-ready prompts — no external file dependencies unless confirmed to exist.
- **Build status:** Sessions 0, 0.5, 1, 2, and 3 are **already complete** (built on Antigravity, staging branch, merged to main after review). Do not re-do this work. Assume the schema and modules described below already exist in Supabase/the codebase unless explicitly told otherwise. **Session 4 onward is the current/next scope.**
- **Recent confirmed schema change:** `profiles` table now includes address columns — `address_line1`, `address_line2`, `state`, `pincode` (single reusable address per profile, used at `/checkout/grah`). This is reflected in the schema below. If you touch checkout or profile-related code, account for these fields.

---

## 1. Business Model

Punyata is a Hindu devotional **subscription platform**. Subscribers across India (and diaspora) pay monthly/yearly, and Punyata performs religious rituals (sevas) on their behalf — in the subscriber's family name and gotra — at **Tirth Guru Pushkarraj, Pushkar, Rajasthan**. After each seva, Punyata sends photo/video proof via WhatsApp.

**Core positioning:** Punyata is the subscriber's **"Punya Bank"** — a running, trustworthy ledger of religious merit accumulated on their behalf, with WhatsApp proof as the receipt. It is **not** a puja-booking marketplace, not a temple-visit product. Every decision should reinforce: convenience + trust + accumulation — never "book a puja," never a browse/marketplace UX.

### Hard constraints — what NOT to build
- ❌ No "browse temples / pick a priest / choose a time slot" marketplace UX — ever, even as multi-location support is added
- ❌ No Docker / MySQL / standalone Express server / NextAuth-from-scratch / Prisma
- ❌ No location/deity picker visible to users today — only Pushkar shown until a second location is genuinely ready
- ❌ No full frontend teardown — extend the existing design system
- ❌ Never expose to Pandit ji anything beyond: seva name(s) + plain name-gotra list. Never plan name, phone, or price.
- ❌ Never use the status label "Covered" in admin UI. Only **Done / Pending / Missed**.
- ❌ Never grandfather old plan compositions — plan/seva changes apply immediately to all current subscribers
- ❌ Never hard-delete `plans`, `sevas`, `sales_agents`, `coupons` — soft-delete only (`is_active = false`)
- ❌ Never activate a subscription from the frontend — activation is **webhook-driven only**
- ❌ Never hardcode which sevas belong to which plan in frontend code — must be read live from `plan_sevas`

### Target audience
Primary: Urban IT/metro professionals, late 20s–early 40s. Secondary: Indian diaspora abroad.

---

## 2. Tech Stack (mandatory)

```
Frontend   : TanStack Start (React 19 + Vite + Tailwind CSS)
Backend    : Vercel Serverless Functions (/api folder) — privileged ops only
Database   : Supabase (PostgreSQL) with Row Level Security — project ID: omjivlmfsikeqwndtlcn
Auth       : Supabase Auth (phone OTP)
Storage    : Cloudinary (proof images/videos, card assets)
Payments   : Razorpay Subscriptions API (UPI AutoPay primary); Razorpay Payment Links/Orders API for one-time charges
WhatsApp   : Meta WhatsApp Business API (pending Meta approval) — manual wa.me fallback currently ACTIVE
Email      : Resend (transactional only)
Hosting    : Vercel free tier, Hostinger DNS
Animation  : Framer Motion, lottie-react — no other animation libraries
```

**Explicitly excluded:** Docker, MySQL, standalone Express, NextAuth-from-scratch, Multer, Prisma, generic multi-vendor "browse & book" marketplace UX.

### Repo / branch discipline
- GitHub: `chirayusingodia/site-making-love`
- Branch structure: `main` (protected, PR-only) ← `staging`
- Antigravity worked on `staging`; Chirayu reviews and merges to `main`
- **From now on: backend sessions are being done via OpenCode terminal + Kimi K3**, to conserve Antigravity/Claude quota. Same repo, same branch discipline should be followed — commit to `staging`, Chirayu reviews and merges to `main` himself.

### Brand / design system
- Palette: cream `#FDF3EB`, saffron-orange `#D85A30` — **no purple/violet/indigo, ever**
- Devanagari-supporting fonts retained from existing design system
- Extend existing component library, don't rebuild from zero

---

## 3. Database Schema (Supabase / Postgres — current state, Sessions 0 + 0.5 complete)

```sql
-- ─────────────────────────────────────────
-- LOCATIONS / DEITIES (multi-location-ready; today, seed only Pushkar)
-- ─────────────────────────────────────────
create table locations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,              -- 'Tirth Guru Pushkarraj, Pushkar'
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
-- SEVA SCHEDULE RULES (schedule lives at seva level, NOT plan level)
-- ─────────────────────────────────────────
create table seva_schedule_rules (
  id            uuid primary key default gen_random_uuid(),
  seva_id       uuid references sevas(id),
  weekday       text,               -- 'TUE', 'SAT'
  occurrence    text,               -- 'first', 'last'
  created_at    timestamptz default now()
);

-- ─────────────────────────────────────────
-- SUBSCRIPTION PLANS
-- ─────────────────────────────────────────
create table plans (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,           -- 'Basic', 'Premium', 'Premium Annual'
  slug              text unique not null,
  price_paise       int not null,            -- 25100 / 39900 / 410100 — confirmed correct paise values
  billing_period    text not null,           -- 'monthly' | 'yearly'
  razorpay_plan_id  text,
  location_id       uuid references locations(id),
  default_team_id   uuid references teams(id),
  tagline           text,
  highlight_text    text,
  features          jsonb,                   -- derive from plan_sevas at render time, don't hand-duplicate
  card_image_url    text,
  is_active         boolean default true,
  sort_order        int default 0,
  created_at        timestamptz default now()
);

-- SOURCE OF TRUTH for "which sevas are in which plan" — admin-editable, zero deploys
create table plan_sevas (
  plan_id   uuid references plans(id),
  seva_id   uuid references sevas(id),
  primary key (plan_id, seva_id)
);

-- ─────────────────────────────────────────
-- PLAN ADD-ONS (non-ritual: prasad, certificates)
-- ─────────────────────────────────────────
create table plan_addons (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid references plans(id),
  addon_type    text not null,     -- 'prasad' | 'certificate'
  description   text,
  is_active     boolean default true,
  created_at    timestamptz default now()
);

-- ─────────────────────────────────────────
-- PLAN HISTORY
-- ─────────────────────────────────────────
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
  agent_code          text unique not null,   -- e.g. 'FM_RAHUL01' → punyata.com/r/FM_RAHUL01
  commission_percent  numeric,
  is_active           boolean default true,   -- soft-delete only
  created_at          timestamptz default now()
);

-- ─────────────────────────────────────────
-- COUPONS / OFFERS
-- ─────────────────────────────────────────
create table coupons (
  id                    uuid primary key default gen_random_uuid(),
  code                  text unique not null,
  discount_type         text not null,        -- 'percent' | 'flat'
  discount_value        int not null,
  applicable_plans      uuid[],
  visibility            text default 'public', -- 'public' | 'private' | 'agent_assigned'
  is_customer_facing    boolean default true,
  assigned_to_user_id   uuid references profiles(id),
  assigned_to_agent_id  uuid references sales_agents(id),
  max_redemptions       int,
  times_redeemed        int default 0,
  valid_from            timestamptz,
  valid_until           timestamptz,
  is_active             boolean default true,   -- soft-delete only
  created_at            timestamptz default now()
);

-- ─────────────────────────────────────────
-- USERS / PROFILES (extends supabase.auth.users)
-- ⚠️ UPDATED: address columns added (checkout /checkout/grah step)
-- ─────────────────────────────────────────
create table profiles (
  id              uuid primary key references auth.users(id),
  full_name       text not null,
  phone           text unique not null,
  email           text,
  city            text,
  country         text default 'India',
  address_line1   text,             -- NEW
  address_line2   text,             -- NEW
  state           text,             -- NEW
  pincode         text,             -- NEW
  role            text default 'user',   -- 'user' | 'admin' | 'owner'
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
-- Single reusable address per profile (not per-subscription). Bilingual labels
-- (Hindi + English) on the checkout UI. role='owner' gates /admin/reports.

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
  status                text default 'pending',  -- pending|active|paused|cancelled|expired
  start_date            timestamptz,
  next_billing_date     timestamptz,
  paused_at             timestamptz,
  cancelled_at          timestamptz,
  cancel_reason         text,
  acquisition_channel   text,   -- 'field_sales' | 'digital_ad' | 'referral' | 'organic'
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
-- Activation is WEBHOOK-DRIVEN ONLY. Never set status='active' from frontend.

-- ─────────────────────────────────────────
-- FAMILY MEMBERS (up to 4 per subscription; slot 1 compulsory)
-- ─────────────────────────────────────────
create table family_members (
  id                uuid primary key default gen_random_uuid(),
  subscription_id   uuid references subscriptions(id),
  full_name         text not null,
  gotra             text,
  relation          text,
  slot_number       int not null check (slot_number between 1 and 4),
  is_primary        boolean default false,   -- true only for slot 1
  dob               date,              -- for birthday pooja add-on feature
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
  status               text not null,     -- pending|captured|failed|refunded
  method               text,
  cycle_number         int,
  paid_at              timestamptz,
  failure_reason       text,
  created_at           timestamptz default now()
);

-- ─────────────────────────────────────────
-- SANKALP BATCHES
-- ─────────────────────────────────────────
create table sankalp_batches (
  id                uuid primary key default gen_random_uuid(),
  batch_type        text not null,      -- 'first_tuesday' | 'last_saturday'
  batch_date        date not null,
  sankalp_variant   text,               -- last_saturday only: 'hawan_only' | 'full_package'
  status            text default 'pending',  -- pending | done | missed
  completed_at      timestamptz,
  subscriber_count  int,
  created_at        timestamptz default now()
);

create table sankalp_batch_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid references sankalp_batches(id),
  subscription_id   uuid references subscriptions(id),
  is_catchup        boolean default false,
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────
-- SEVA PROOF (batch-based: one seva event → one proof, shared across batch)
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
  whatsapp_msg_id   text,   -- null while wa.me fallback active
  uploaded_by       uuid references profiles(id),
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────
-- NAME SEGMENTS (personalized name-reading video segments within a batch)
-- ─────────────────────────────────────────
create table name_segments (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid references sankalp_batches(id),
  segment_number    int not null,
  video_url         text not null,
  created_at        timestamptz default now()
);
-- 5 families / 20 names per segment (4 members × 5 families).
-- Delivery = 2 WhatsApp messages per subscriber: 1 common footage + 1 name-segment video.
-- Cloudinary path: punyata-proofs/{year}-{month}/{batch_type}/segments/segment-{n}/
-- Segment numbers reset fresh each month on new lock events.

-- ─────────────────────────────────────────
-- PRASAD SHIPMENTS
-- ─────────────────────────────────────────
create table prasad_shipments (
  id                uuid primary key default gen_random_uuid(),
  subscription_id   uuid references subscriptions(id),
  month             int,
  year              int,
  status            text default 'pending',   -- pending|packed|shipped|delivered
  tracking_id       text,
  shipped_at        timestamptz,
  delivered_at      timestamptz,
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────
-- NOTIFICATIONS LOG
-- ─────────────────────────────────────────
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id),
  type        text not null,
  channel     text not null,      -- whatsapp|email|sms
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
```

**RLS**: enabled on all tables. Users read only their own `profiles`, `subscriptions`, `family_members`, `payments`, `seva_proofs` (via subscription/batch), `prasad_shipments`, `notifications`. A user's own assigned `coupons` (`assigned_to_user_id = auth.uid()`) are readable by them. Admins (`role='admin'`) get full access. Owner-only (`role='owner'`) gates `/admin/reports`. `plans`, `sevas`, `locations`, `teams`, `page_seo`, `blog_posts` are public-read, admin-write.

---

## 4. Product Catalog & Current Tier Composition

**⚠️ Always confirm current composition before assuming — this changes via `plan_sevas` admin edits, not code.** As of this doc:

| Tier | Price | Billing | Sevas | Frequency | Extras |
|---|---|---|---|---|---|
| **Basic** | ₹251/mo | Monthly | Sundarkand Path, Gau Seva, Vanar Seva | 1st Tuesday only, 1x/month each | None |
| **Premium** | ₹399/mo | Monthly | Same 3 + Saadhu Santo Ko Bhojan | Both 1st Tuesday AND Last Saturday (2x/month each) | + Griha Shanti Hawan (1st Tue only) + Sarv Rog Nivaran Hawan (Last Sat only) |
| **Premium Annual** | ₹4,101/yr | Yearly | Same as Premium | Same as Premium | + Prasad shipment + Sankalp Certificate |

- `Saadhu Santo Ko Bhojan` is the **canonical name** (renamed from "Brahmin Bhojan") — no exceptions anywhere in code/copy.
- Each subscription covers up to 4 family members (1 compulsory, 3 optional).
- Pandit ji receives ONLY seva name(s) + plain name-gotra list — never plan, price, or phone.
- Plan-to-seva mapping is ALWAYS DB-driven via `plan_sevas` — never hardcoded in frontend or business logic.
- Plan composition changes apply immediately to all subscribers — no grandfathering.

### Mandatory card copy/design rules
- Team performing sevas must be shown (from `teams.name`)
- Must visibly include concepts "Daan Punya Ek Saath" and "Pooja Aur Chadava Dono Ka Package" on-card
- Unique `card_image_url` per plan — never one generic template reused across tiers

### Physical prasad (Premium Annual only)
Lightweight non-perishables only: Sarovar jal, chandan tilak, akshat/kumkum, mauli thread, Sankalp certificate. No perishable food, no heavy items.

---

## 5. Sankalp Scheduling Logic (LOCKED — implement exactly as specified)

- Puja happens **exactly twice a month** — never weekly, never daily.
- **List A — First Tuesday:** ALL active subscribers, all tiers → whichever sevas their current plan includes (live `plan_sevas` lookup).
- **List B — Last Saturday:** Subscribers on plans that include Hawan (currently Premium + Premium Annual) → **two separate sankalps**: (1) Hawan-only, (2) Full package (all plan sevas + Hawan).
- Lists are always generated **live/fresh** from currently-active subscriptions and current `plan_sevas` mapping — **never cached**.
- **Basic new joiners** who miss the 1st Tuesday wait until next month's 1st Tuesday — genuine tier limitation, not a bug.
- **Onboarding catch-up rule (Hawan-ineligible tiers only):** if such a subscriber joins after that month's 1st Tuesday, they get a **one-time inclusion** in that month's Last Saturday list, but only for sevas their plan actually includes (NOT Hawan). From month 2 onward, normal 1st-Tuesday-only cycle resumes.
- **Premium/Premium Annual new joiners** who join after the 1st Tuesday can be included in the same month's Last Saturday as their first coverage.

### Batch tracking rules
- Each list generation creates an **independent batch record** — Tuesday and Saturday batches are completely separate. Marking one complete must never affect the other.
- Admin manually clicks "Mark Seva Completed" per batch → locks completion timestamp + subscriber count.
- Lock also triggers on **first download click** (not a fixed calendar day) — idempotent on repeat downloads.
- Status labels: **Done / Pending / Missed** — never "Covered."
- Always show join date/time alongside status to distinguish genuine missed seva from normal wait window.
- "Pending Sevas" report shows per-subscription status per batch type (Tuesday column + Saturday column) with join-date context.

---

## 6. Video Proof Architecture

- Name-reading segments: 5 families (20 names: 4 members × 5 families) per segment.
- Each subscriber receives 2 WhatsApp messages: 1 common seva video (shared batch-wide) + 1 segment-specific name video.
- Cloudinary folder structure: `punyata-proofs/{year}-{month}/{batch_type}/segments/segment-{n}/`
- Segment numbers reset fresh each month on new lock events.
- True bulk send (4000+ subscribers) requires Meta Cloud API; stub period uses pre-fill queue UI (~1000 confirm-taps vs. 8000 manual actions).
- **Open/pending decision:** exact segment size (15 vs 20-25 families) — confirm with Chirayu if this affects your current task.

---

## 7. Subscription Flow

```
Landing ("Daan Punya Aapka, Sewa Hamari" / Punya Bank framing)
  → Plan cards (dynamic, from `plans` + live `plan_sevas`, all tiers shown together)
  → Select plan
  → Family details (Member 1 compulsory: Name+Gotra+Relation; Members 2-4 optional, +DOB)
  → Contact details (Phone, Email, City, Country)
  → Address step (/checkout/grah): address_line1, address_line2, state, pincode — bilingual labels
  → Phone OTP verification (Supabase Auth)
  → Coupon code entry (optional, validated against `coupons`)
  → Review (plan, family members, team, price after discount)
  → Razorpay Checkout → UPI AutoPay mandate / card auto-debit
       ├─ SUCCESS → subscription created via WEBHOOK (status: active) + family_members rows
       │            → WhatsApp welcome → auto-included in next live List A/B
       └─ FAILED  → retry notification → after 3 failures → status: pending, flagged in admin
```

---

## 8. Razorpay Integration — Key Notes

- One Razorpay Plan per `plans` row (`razorpay_plan_id` kept in sync)
- Checkout accounts for coupon discount before creating Razorpay subscription amount, where Razorpay's model allows it
- Webhook handler (`/api/payments/webhook`), HMAC-SHA256 verified, handles: `subscription.activated`, `subscription.charged`, `subscription.payment.failed`, `subscription.paused`, `subscription.resumed`, `subscription.cancelled`, `subscription.completed`
- **Critical open question (unresolved):** UPI-authorized subscriptions cannot be updated via Razorpay API once mandated — blocks simple in-place plan-upgrade flow. Needs resolution (cancel + re-mandate, or admin workaround) before upgrade UX is built. **Flag this rather than silently picking an approach if your task touches plan upgrades.**
- Birthday pooja add-on (planned): one-time charge via Payment Links/Orders API; cron looks 2-3 days ahead using `family_members.dob`.

---

## 9. Admin Dashboard Modules (reference — build order in Section 11)

1. Overview — active subs, MRR, this-month revenue, pending proofs, failed payments, paused subs
2. Subscribers — table w/ family members, plan, status, agent attribution, coupon; filters; CSV export; Subscriber 360 view
3. Plans & Sevas Manager — CRUD `plans`, `sevas`, **`plan_sevas` mapping** (primary tool for tier reassignment), `seva_schedule_rules`
4. Locations & Teams Manager — CRUD `locations`, `teams`
5. Sales Agents Manager — CRUD agents, commission attribution, referral links (`punyata.com/r/FM_XXXX`)
6. Coupons Manager — CRUD, visibility control, redemption stats
7. Proof Upload + Sankalp Batch Tracking — batch-based upload, per-batch "Mark Seva Completed," WhatsApp send workflow (wa.me stub today)
8. Prasad Box Tracking
9. Payments Log
10. Reports — subscriber, revenue, seva completion, "Pending Sevas" report, CSV/PDF export
11. SEO & Content Editor
12. Audit Log Viewer
13. CEO/Executive Dashboard (`/admin/reports`, owner-gated)

---

## 10. Security & Auth

- Phone OTP (Supabase Auth), 30-day session
- Role-based: `user` | `admin` | `owner` — enforced server-side via RLS, not just client route guards
- Razorpay webhook HMAC-SHA256 verification — mandatory, non-negotiable
- Cloudinary signed uploads only
- Secrets in Vercel Environment Variables only, never committed

---

## 11. Session Sequence & Current Status

**COMPLETE (Antigravity, staging → main, merged):**
- Session 0: Core schema (10 tables) with RLS + seed data
- Session 0.5: Sankalp batch tracking migration (`sankalp_batches`, `sankalp_batch_subscriptions`, `plan_history`; `dob` on `family_members`)
- Session 1: Overview Dashboard
- Session 2: Subscribers module (cursor pagination + Postgres view for primary family member, 500+ scale)
- Session 3: Plans & Sevas Manager with live `plan_sevas` assignment UI

**Recent addition (small, outside the numbered sessions):** `address_line1`, `address_line2`, `state`, `pincode` added to `profiles` for the `/checkout/grah` address step.

**NEXT / CURRENT SCOPE (this is what you're picking up):**
- **Session 4 — Proof Upload + Sankalp Batch Tracking** (most complex — Tuesday/Saturday independent batch logic, name-segment video uploads, `wa.me` stub delivery, Pandit-facing printable export)
- **Session 5 — Sales Agents & Coupons** with commission attribution
- **Session 6 — Payments Webhook + Financial Reports** (security-critical — HMAC verification, webhook-driven activation only)
- **Session 7 — SEO + Audit Log + Subscriber 360 Dashboard polish**

**⚠️ Sessions 4 and 6 involve money and data-integrity-critical logic. Be extra rigorous: idempotency on batch locking, exact HMAC verification per Razorpay docs, no silent assumptions on ambiguous business rules — flag and ask instead.**

---

## 12. Core Architecture Principles (apply to every decision)

- Webhook-driven activation only — never frontend-triggered subscription status changes
- Soft-delete-only on `plans`, `sevas`, `sales_agents`, `coupons`
- Seva schedule rules live at the seva level (`seva_schedule_rules`), never hardcoded at plan level
- Plan-to-seva composition is flexible and admin-editable (`plan_sevas`) — never hardcode in frontend/business logic
- Plan composition changes apply immediately — no grandfathering
- `plan_addons` keeps non-ritual deliverables separate from ritual seva scheduling
- Multi-location/multi-team support built into schema from day one, even though only Pushkar is user-visible today
- Always the lowest-maintenance viable architecture for a solo-founder operation — resist over-engineering

---

## 13. Working-Style Notes for This Session

- Communicate assumptions explicitly; don't silently guess on ambiguous business logic (e.g. Razorpay upgrade-flow question, segment-size decision) — flag it and propose options instead.
- Before writing code: **pre-flight self-audit** — confirm which tables/files you're about to touch and why.
- Explicit DO NOT constraints for this session: [Chirayu — fill in per-session specifics here before pasting to Kimi K3]
- End of session, always provide a summary: files touched, decisions made, root causes of any bugs fixed, and anything left open/unresolved.
- Work sequentially, task-by-task, to avoid context mismanagement.
- If something in this doc looks stale or contradicts what you find in the actual live schema/codebase, **trust the live codebase and flag the discrepancy** rather than silently overriding either.

---

*Document purpose: consolidated context for OpenCode + Kimi K3, picking up from Session 4 onward. Supersedes all prior fragmented docs (build spec v3, earlier master context, and the obsolete "Punyam Sewa" draft).*

*🚩 Sewa Hamari, Punya Aapka 🚩*
