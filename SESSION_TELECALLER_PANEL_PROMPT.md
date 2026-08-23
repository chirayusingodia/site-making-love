# 🕉️ PUNYATA — Session: Telecaller Panel + Lead Attribution & Commission Engine

**For:** OpenCode + Kimi K3 · **Prepared by:** Chirayu (via Claude) · **Date:** 2026-08-22
**Depends on:** `SESSION_SIGNUP_FIRST_CHECKOUT_PROMPT.md` (merged to Staging as `afd62b3`) and
`SESSION_TENURE_AND_OTP_ABUSE_PROMPT.md`. Read those first — this session builds directly on the
"Sankalp Pending" reality they created.

**This is a large session.** It has two halves that can be shipped independently, in this order:

- **Part A — the telecaller panel** (§2–§7): a third staff surface for calling, on-behalf profile
  editing, and call logging.
- **Part B — the lead & commission engine** (§8–§12): daily lead assignment from field agents,
  two-party sale attribution, and the 20% + trail incentive ledger.

Ship Part A first and confirm it works on real subscribers before starting Part B. Part B touches
money and must not be rushed to keep pace with a UI.

---

## 0. Why this exists

The signup-first checkout session deliberately made **family/gotra details optional at purchase
time**. The business plan for filling them in is: *a human calls the subscriber.* Separately, field
sales agents hand that human roughly **10 phone numbers a day** to call and close.

Today both jobs would require an `admin`-role login, which hands her the entire back office — plans
& pricing editor, payments page, proof upload, and a CSV export of the whole subscriber database.
That is the wrong blast radius for a telecalling seat, and it gets worse with every hire.

Existing hierarchy (migrations 006/007) is **owner ⊃ admin**. This session adds a **sibling, not a
subset**:

```
owner       — admin superset + all financial visibility (₹, MRR, Razorpay IDs, everyone's commission)
admin       — full operational access, ZERO financial visibility
telecaller  — NEW. Call queues, assigned leads, on-behalf profile editing, payment links,
              and HER OWN earnings. No plans/sevas/proof/reports/CSV-export. No other
              person's money, ever.
agent       — existing sales-agent value. Gains attribution + trail in Part B.
```

> **Owner and admin can both open the telecaller panel** (read-write), so Chirayu can sit in the
> same queue and check her work. `user` and `agent` cannot.

---

## 1. Decisions taken — confirm, don't re-litigate

| # | Decision |
|---|---|
| 1 | Telecaller **cannot** see: company revenue/MRR, other people's earnings or commission rates, other subscribers' payment **amounts**, Razorpay IDs, coupon discount values, or any report |
| 2 | Telecaller **can** see: plan **prices** (they are public on `/plans` — she is selling them), subscription & payment **status** + dates, and **her own** earnings and payout history in full ₹ |
| 3 | Telecaller **can** create a brand-new customer from scratch and complete their whole profile on their behalf |
| 4 | Telecaller **cannot** take payment, enter card/UPI details, or activate a subscription. She sends a payment link the customer pays himself |
| 5 | `call_logs` disposition tracking ships in v1 |
| 6 | Field agent and telecaller are paid from **separate pools** — both earn on the same sale, independently. No splitting, no negotiation. **20% first deal is fixed for everyone forever; promotion raises the 1% trail only** |
| 7 | Trail is earned only on **payments Razorpay actually captured**, never on `status = 'active'` |

> **§1.2 supersedes the earlier "zero ₹ visibility" framing.** It could not survive her becoming a
> seller: she has to quote a price, prices are public anyway, and her own commission is a percentage
> of payments so she can back-compute them regardless. The rule is now *"her own money and public
> prices — yes; everyone else's money — no."*

**HARD RULE RESTATED (do not break, do not "improve"):** `subscriptions.status = 'active'` is set
**exclusively** by the Razorpay webhook handler with the service-role key. No telecaller endpoint, UI
action, or admin override may set it. If a customer insists he paid, the only move is to log it and
escalate to Chirayu.

---

# PART A — THE TELECALLER PANEL

## 2. Data layer — migration `20260822_012_telecaller_role.sql`

House style of migrations 006/011: purpose block, an explicit "what this deliberately does NOT do"
block, runtime constraint-name discovery instead of assumed names, verification queries at the
bottom, and no auto-promotion of any existing account.

### 2.1 Widen the role CHECK

Migration 006 named the constraint `profiles_role_check`, but **still discover it at runtime** as 006
did — branch databases and restores drift.

```sql
-- allowed set becomes:
CHECK (role IN ('user','admin','owner','telecaller','agent'))
```

Update `COMMENT ON COLUMN public.profiles.role`. Promote nobody; include the commented manual
promotion statement at the bottom, same as 006.

### 2.2 🚨 `is_admin()` MUST NOT match `telecaller`

Migration 007 widened `public.is_admin()` to `role IN ('admin','owner')`, and **40 RLS policies**
depend on that one function — including `payments: admin write`, `sales_agents: admin only`,
`plans: admin write` and `audit_logs: admin only`. Adding `'telecaller'` there would hand a
telecaller the entire financial schema in one line. **Do not touch `is_admin()`.**

Instead the telecaller gets **no direct table grants at all**. Every byte she reads or writes goes
through a new endpoint under `/api/telecaller/*`, running on the **service-role client** behind a
`requireTelecaller()` gate, returning an **explicit field allowlist**. This is the architecture the
codebase already uses for financial masking (`/api/admin/payments/list`,
`/api/admin/sales-agents/list`, `sales-agents-logic.ts`) — masking at the API layer, because Postgres
RLS is row-level and cannot hide a column.

**State this in code comments:** telecaller pages may **never** query Supabase directly the way
`admin.subscribers.tsx` does (`supabase.from("subscriber_list_view")…`). A direct client query would
either be blocked by RLS or leak whatever columns RLS does allow.

Add an `is_telecaller()` helper (SECURITY DEFINER, STABLE, pinned `search_path`, same shape as
`is_admin()`) — **not wired into any policy in this migration**, purely so a future session that
needs a row-level telecaller rule has the primitive and doesn't reach for `is_admin()`.

### 2.3 New table `call_logs`

```sql
CREATE TABLE IF NOT EXISTS public.call_logs (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id   uuid REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    profile_id        uuid REFERENCES public.profiles(id)      ON DELETE CASCADE,
    lead_id           uuid,          -- FK added in §8 once leads exists
    called_by         uuid NOT NULL REFERENCES auth.users(id)  ON DELETE RESTRICT,
    queue             text,          -- which queue this call came from (§3)
    identity_verified boolean NOT NULL DEFAULT false,
    outcome           text NOT NULL CHECK (outcome IN (
                          'connected_interested',   -- wants it, link sent
                          'connected_completed',    -- sankalp details captured
                          'connected_partial',
                          'connected_refused',
                          'callback_requested',
                          'no_answer', 'busy', 'switched_off',
                          'wrong_number',
                          'do_not_call',
                          'language_barrier',
                          'complaint'
                      )),
    notes             text,
    callback_at       timestamptz,   -- required when outcome = 'callback_requested'
    created_at        timestamptz NOT NULL DEFAULT now()
);
```

- Table CHECK: at least one of `subscription_id` / `profile_id` / `lead_id` is present.
- Indexes: partial on `(callback_at)` where not null; `(subscription_id, created_at DESC)`;
  `(profile_id, created_at DESC)`; `(called_by, created_at DESC)`; `(outcome, created_at DESC)`.
- RLS: enabled, with **one** policy — `USING (public.is_admin())` — so owner/admin read everything
  through their existing grants. The telecaller reads her own history through `/api/telecaller/*`
  (service role), so there is exactly one code path to audit.

### 2.4 New columns on `profiles`

```sql
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS do_not_call        boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS preferred_language text,
    ADD COLUMN IF NOT EXISTS created_by_staff   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS last_called_at     timestamptz;
```

- `created_by_staff` NULL means self-signup — how every existing row stays.
- `last_called_at` is denormalised deliberately: every queue needs "not called in the last N hours",
  and a `call_logs` join on every page load is wasteful. Written in the same request as the
  `call_logs` insert.
- `do_not_call = true` removes the person from **every** queue permanently. Only owner can clear it.

### 2.5 What this migration deliberately does NOT do

- Does **not** modify `is_admin()` or any of the 40 policies calling it.
- Does **not** add a `profile_complete` boolean. "Incomplete" stays **derived**
  (`family_member_count = 0`, `gotra IS NULL`, `pincode IS NULL`) exactly as migration 011 decided.
- Does **not** touch `family_members`, `subscriptions`, `payments`, or `plans`.
- Does **not** grant the telecaller any RLS policy on any table.

---

## 3. The work queues

The panel's home page is **not** a dashboard, it is a **stack of queues with live counts**. She logs
in and starts dialling in one click, deciding nothing. `/api/telecaller/queues` returns each count;
each queue has its own cursor-paginated list endpoint.

Every queue is **derived from existing data** — no new flags. Every queue excludes
`do_not_call = true` and, by default, anyone with a `call_logs` row in the last 24h.

| Priority | Queue | Definition | Why it's here |
|---|---|---|---|
| **0** | **Aaj ke leads** | Leads assigned to her today (§8), unworked first | Her actual job. This is the only queue with a daily target |
| 1 | **Sankalp Pending** | active subscription, `family_member_count = 0`, oldest purchase first | He paid and is getting **nothing** in the next batch |
| 2 | **Batch cutoff at risk** | Sankalp Pending or missing gotra, where the next batch cutoff is < 72h away | Same people, time-boxed. Live countdown — reuse `plans-schedule.ts` / `sankalp-logic.ts`, do not re-derive the calendar |
| 3 | **Payment failed** | latest `payments.status = 'failed'`, not yet cancelled | Silent churn — and it kills her own trail, so she'll work it |
| 4 | **Abandoned checkout** | `subscriptions.status = 'pending'`, created > 30 min ago | Highest-intent lead in the database. Nobody calls these today |
| 5 | **Signed up, never bought** | profile exists, zero subscriptions, created > 1h ago | He gave you his number voluntarily |
| 6 | **Paused** | `status = 'paused'` with `paused_at` | Know who paused, call them |
| 7 | **Recently cancelled** | `status = 'cancelled'`, within 30 days, show `cancel_reason` | Win-back window; the reason text is free product research |
| 8 | **Callback due** | `call_logs.callback_at <= now()`, no later log for that person | A promised callback that doesn't fire is worse than never calling |
| 9 | **Incomplete details** | active, ≥1 member, but missing `gotra` / `relation`, or fewer members than the plan allows | A missing gotra is a visibly worse sankalp in the Pandit's list |
| 10 | **Missing prasad address** | active Premium Annual with a prasad addon, `pincode IS NULL` | Cannot ship. Deadline-driven |
| 11 | **Welcome call** | became `active` in the last 48h, never called | Cheapest churn prevention there is |
| 12 | **Renewal ahead** | yearly plan, `next_billing_date` within 14 days | Warn before the debit so it isn't a surprise chargeback |

Implementation:

- Each queue is a **named pure function** in a new `src/lib/telecaller-logic.ts` (predicate +
  ordering + field allowlist), mirroring how `sales-agents-logic.ts` and `reports-logic.ts` separate
  logic from route. Unit-test every one in `scratch/` — the existing convention.
- Reuse `subscriber_list_view` (migration 003) server-side where it fits; it already exposes
  `family_member_count` and the primary member. Do **not** create a second overlapping view.
- The 24h cooldown, 72h cutoff window, and 30-min abandonment threshold are **tunable constants in
  one place** (same discipline as the OTP rate-limit constants).

---

## 4. Exactly what the telecaller may see

Put this in `telecaller-logic.ts` as an explicit allowlist plus `maskForTelecaller()` and a
`TELECALLER_MASKED_FIELDS` export, mirroring `sales-agents-logic.ts`. Endpoints build their
`.select()` **from the allowlist** — never `select("*")` then delete, because the next schema
addition would leak by default.

**VISIBLE**

- Person: `full_name`, `phone`, `city`, `state`, `preferred_language`, `do_not_call`,
  `address_line1/2`, `pincode`, `last_called_at`
- Subscription: `id`, `status`, `start_date`, `next_billing_date`, `paused_at`, `cancelled_at`,
  `cancel_reason`, `created_at`
- Plan: `name`, `billing_period`, **and `price_paise`** — she is selling it and the price is public
- Payment: latest payment's `status`, `paid_at`, `method` (so she can say "aapka UPI mandate fail
  hua"), `failure_reason`. **Not `amount_paise`**
- Family members: all fields
- Sevas: which sevas the plan includes, and whether this month's proof was delivered
- Her own `call_logs` history for the person on screen
- **Her own commission**: her entries, her totals, her payout history, her current trail rate (§11)

**MASKED — nulled server-side before the response leaves the handler**

- `payments.amount_paise` and every derived per-subscriber ₹ figure
- `razorpay_sub_id`, `razorpay_payment_id`, `razorpay_order_id`, `razorpay_customer_id`
- `coupons.discount_value`, `discount_type`
- **Any other person's** commission rate, entry, or total — including the field agent who sourced
  the very lead she is looking at
- Company aggregates: revenue, MRR, collection totals, `/admin/reports`, `/admin/overview`
  financial tiles, `/admin/payments`

**Also blocked structurally, not merely hidden**

- **No bulk CSV export of any kind.** Not "owner-only" — **no export endpoint exists** for this
  role. Her exfiltration path for a subscriber list is manual retyping.
- Queue endpoints are cursor-paginated with a hard page cap (50) and **no arbitrary page-skip**. She
  works the queue; she does not browse the database.

---

## 5. On-behalf actions — the authority matrix

All under `/api/telecaller/*`, all behind `requireTelecaller()`, all writing an `audit_logs` row with
`admin_id = <telecaller uuid>`, the action, the entity, and a `meta` jsonb holding **before and
after**. No exceptions — if it writes, it audits.

### 5.1 Identity verification gate

Before any edit form unlocks, she must tick **"identity verified"**, which requires confirming
**two** of: full name, plan name, city, last-4 of phone. The tick is stored on the `call_logs` row
(`identity_verified`). Cheap, and it is the only thing between "helpful telecaller" and "anyone who
phones in claiming to be someone".

### 5.2 Add / edit family members on behalf ✅

`POST /api/telecaller/family-members`. The existing `POST /api/profile/family-members` is
`requireUser()` and RLS-scoped to the caller's own subscriptions — it **cannot** be reused.

- **Extract the shared validator** out of `api/profile/family-members.ts` into
  `telecaller-logic.ts` (or `family-validation.ts`) and have both routes call it. Two copies of
  "slot 1–4, name ≥ 2 chars, dob YYYY-MM-DD" will drift.
- Service-role client, same `upsert(..., { onConflict: "subscription_id,slot_number" })`.
- Same Hinglish error copy (`"Slot 2: naam zaroori hai"`) so both surfaces speak alike.
- Refuse if the subscription is `cancelled`.
- Audit `telecaller.family_members.upsert` with the prior rows in meta.

**Spelling matters more than speed.** The name goes into the Pandit's list and is read aloud. Add a
Devanagari/Latin toggle and a "read it back to the customer" confirm step before save.

### 5.3 Complete address, city, language, name spelling ✅

`POST /api/telecaller/profile` — allowlisted subset of `profiles`: `full_name`, `city`, `state`,
`address_line1`, `address_line2`, `pincode`, `preferred_language`. Reuse the pincode/state validation
from `api/profile/address.ts` (extract it, same reasoning).

**`phone` is NOT in the allowlist.** It is the identity key (`profiles.phone` is UNIQUE and mirrors
`auth.users`); changing it is account takeover. A wrong number is a `wrong_number` outcome and an
escalation, never an inline edit.

### 5.4 Create a new customer from scratch ✅

`POST /api/telecaller/create-lead` → auth user + `profiles` row, `created_by_staff = <her uuid>`.

- Reuse `normalizePhoneE164()` and the idempotent create path from `auth.server.ts`. **Do not write
  a second phone parser.**
- If the phone already exists: return the existing person so she lands on their card, and **do not
  overwrite their name** — same rule as login, a lookup must never rename an existing account.
- **Sends no OTP.** Creating a lead is a database row, not a login.
- **🚨 THE OTP RULE — put it as visible text in the UI:** she must **never** ask a customer to read
  out an OTP, and no field to type one exists anywhere in this panel. If she can log in as the
  customer, every audit trail in this document is worthless. "Just tell me the code" is the
  signature of the exact fraud this panel must not enable.
- Rate limit: **30 lead creations per telecaller per day**, tunable constant.

### 5.5 Send a payment link ✅ (she never touches money)

`POST /api/telecaller/send-payment-link` → creates the checkout via the **existing**
`createCheckoutForUser` in `subscriptions-checkout.server.ts`, so the `total_count = 1200/100` tenure
fix and every other rule applies automatically. **Do not duplicate that logic.**

- The link carries an **attribution token** (§9) — this is how the sale gets credited to her
  deterministically instead of by guesswork.
- She sees the plan name and its public price. The response carries **no Razorpay ID**.
- **Coupons:** only from an allowlisted "telecaller-usable" set (`coupons.visibility = 'agent'` is
  the closest existing concept — reuse or add a dedicated flag; do not invent a parallel table). She
  sees the coupon **code and label**, never its `discount_value`, and can **never** enter a
  free-form discount.
- Stamps `acquisition_channel = 'telecall'`.

### 5.6 Pause / cancel / resume ❌ — escalation only

A cancellation request goes into `call_logs` with the reason. She cannot set `paused`, `cancelled`,
or `active`. Retention decisions belong to the owner, and `active` is webhook-only (§1). Surface
escalations in a "Needs Chirayu" list on `/admin/overview`.

**Note the incentive alignment here:** because her trail dies with the subscription (§10), she is
already motivated to save it rather than process the cancellation. That is the design working.

### 5.7 Everything else ❌

No plans/sevas editing, no proof upload, no batch generation, no sankalp lists, no `sales_agents`
management, no reports, no subscriber delete, no `role` changes, no CSV export, **no editing of any
commission rate or attribution — including her own**. Enforce at the route gate, **not** by omitting
a sidebar link.

---

## 6. Routes & UI

### 6.1 Guards, both directions

- New `src/routes/telecaller.tsx` layout with a `beforeLoad` role guard, plus per-route guards, plus
  the API gate. Three layers, same as Reports.
- **🚩 Existing gap to fix in this session:** `src/routes/admin.tsx` has **no `beforeLoad` role guard
  at all** — it renders the shell for anyone and relies on API 401/403 to keep tables empty.
  Acceptable with only admin/owner; not acceptable once a lower-privilege role exists (a telecaller
  could load `/admin/plans-sevas` and see the chrome, nav and field labels). Add a `beforeLoad` to
  `/admin` redirecting non-`admin`/`owner` to `/telecaller` (if telecaller) or `/`. Keep the API
  gates exactly as they are.
- Add a **"Call Queue"** item to the admin/owner sidebar pointing at `/telecaller`.

### 6.2 Visual identity — deliberately different

Reuse the `admin.tsx` shell structure but **change the accent colour** (admin/owner is amber-700 —
use a distinct hue such as indigo or teal) and label the header pill **"Telecaller Portal"**. A
caller who is sometimes handed an admin login must be able to tell at a glance, across a shared
screen, which surface she is on.

### 6.3 Pages

```
/telecaller                        → redirect to /telecaller/queues
/telecaller/queues                 → the queue stack (§3) with live counts + "start calling" CTA
/telecaller/queue/$queueKey        → the working list for one queue
/telecaller/person/$subscriptionId → the call card
/telecaller/lead/$leadId           → the call card, lead variant (§8)
/telecaller/new                    → create-lead form
/telecaller/my-day                 → her calls, outcomes, completions, callbacks due, daily target
/telecaller/earnings               → her commission ledger (§11)
/telecaller/script                 → talking points + objection handling (static, §7)
```

### 6.4 The call card — the screen she lives on

One page, no tabs to hunt through, built for talking-while-typing:

- **Top:** name, big `tel:` click-to-call button, `preferred_language` chip, plan **name**, status
  badge, and "called N times / last called <date>"
- **A "why you're calling" banner** in one Hinglish sentence ("Sankalp adhoora hai — 4 mein se 0
  naam bhare hain"), so she opens her mouth already informed
- **Identity-verified checkbox** (§5.1) gating the forms below
- **Inline family-member form** — 4 slots, spelling read-back step, save without leaving the page
- **Inline address form**, shown only when the plan needs it
- **Plan picker + "Send payment link"** with the public price visible
- **Sticky bottom bar: "Log this call"** — outcome, notes, callback picker. Navigating away without
  logging shows a confirm. An unlogged call is an invisible call.
- **After save: auto-advance to the next person in the queue.** She should never return to a list to
  pick the next name.
- Reuse existing components (`ui/*`, the 360-modal patterns in `admin.subscribers.tsx`) — but **do
  not import that route's direct-Supabase data layer** (§2.2).

### 6.5 Copy

Hinglish, matching the existing voice (`"Pincode 6 anko ka hona chahiye"`, `"Thodi der baad try
karein"`). Respect `preferred_language` where set.

---

## 7. Extra capabilities — recommended

**Build in this session (cheap, high value)**

1. **Do-not-call flag** — one outcome, one column, removes the person from every queue forever.
   Sensible under India's DPDP framework and it stops the queue rotting.
2. **Callback scheduling** — already in `call_logs`. Turns "call me at 7pm" into queue #8.
3. **Wrong-number / dead-lead marking** — stops the same bad row being redialled for a year.
4. **Language preference capture** — one field, routes future calls to the right caller.
5. **Batch cutoff countdown** — "names must be in by <date>, 41 subscribers still pending". Reuse
   `plans-schedule.ts`; don't re-derive.
6. **Talking-points / objection-handling page** — static, no DB. "Too expensive", "where does the
   money go", "prove it happened". Free onboarding for the next hire.
7. **Proof re-send request** — she can't upload proof, but she can flag "customer didn't get this
   month's WhatsApp proof", creating a task for admin. Today that complaint has nowhere to go.
8. **Her own daily stats** (`/my-day`) — calls, outcomes, completions, callbacks pending.

**Next session**

9. **Upsell queue** — monthly subscribers active > 3 months → annual-plan payment link. Pure
   revenue, no new mechanics beyond §5.5. Note it also raises her own first-deal bonus, so it will
   get worked.
10. **Referral capture** — "koi aur family member interested hai?" → creates a lead with
    `referred_by`. Cheapest acquisition channel this business has.
11. **Birthday / anniversary / shraddh-tithi sankalp** — `family_members.dob` already exists and is
    almost never used. "Aapke pitaji ki tithi aa rahi hai, sankalp add karein?" is the most on-brand
    upsell possible.
12. **Festival campaign lists** — owner-defined target lists (Navratri, Pitru Paksha). Needs a
    `campaigns` table; hold it.
13. **Complaint / ticket lifecycle** — `outcome = 'complaint'` gets 80% of this today.
14. **Call recording + consent** — real value for training and payout disputes, but needs a telephony
    vendor, a consent prompt and a retention policy. **Do not build a half version.** A decision for
    Chirayu, not a task.
15. **Cloud telephony click-to-call** (Exotel/Knowlarity/Twilio) so the customer never sees her
    personal number and call duration lands in `call_logs` automatically. The `tel:` link is the
    zero-cost stand-in.

**Explicitly do NOT build**

- Any bulk WhatsApp/SMS blast in this panel. The Meta WhatsApp Business API is still pending
  approval and is scoped to **proof delivery**; a telecaller-triggered broadcast is a
  template-violation and account-ban risk. One-to-one payment links only.
- Any screen showing more than one subscriber's contact details at once beyond the paginated queue.

---

# PART B — LEADS, ATTRIBUTION & COMMISSION

## 8. The lead pipeline — 10 numbers a day

### 8.1 New table `leads`

```sql
CREATE TABLE IF NOT EXISTS public.leads (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name         text,
    phone             text NOT NULL,          -- stored E.164, normalised on insert
    city              text,
    notes             text,                   -- what the field agent scribbled
    interested_plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,

    source_agent_id   uuid REFERENCES public.sales_agents(id) ON DELETE SET NULL,
    assigned_to       uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- the telecaller
    assigned_on       date,

    status            text NOT NULL DEFAULT 'new' CHECK (status IN (
                          'new','assigned','in_progress','link_sent',
                          'converted','not_interested','unreachable',
                          'wrong_number','duplicate','expired'
                      )),
    profile_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,   -- set on first contact
    subscription_id   uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL, -- set on conversion
    converted_at      timestamptz,
    attribution_token text UNIQUE,            -- rides on the payment link (§9)

    created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
```

- Normalise `phone` with `normalizePhoneE164()` **before insert** — a lead list with mixed formats
  can't be deduped. Reject un-normalisable numbers at upload with a per-row error.
- **Dedupe on upload, don't silently insert.** If the phone matches an existing lead that is open, or
  an existing `profiles` row with an **active** subscription, mark the new row `duplicate` and show
  the uploader why. Otherwise a number gets worked — and paid on — twice.
- RLS: enabled, one `USING (public.is_admin())` policy. Telecaller access is via
  `/api/telecaller/*` only.
- Add the deferred FK from `call_logs.lead_id` → `leads(id)` here.
- Indexes: `(assigned_to, assigned_on)`, `(status)`, `(phone)`, unique on `attribution_token`.

### 8.2 Upload and assignment

- **Owner/admin** uploads leads on the field agent's behalf: paste-a-list or CSV-upload UI at
  `/admin/leads`, picking the `source_agent_id`. A per-agent self-serve upload is a later session —
  don't build an agent-facing surface now.
- **Assignment:** `POST /api/admin/leads/assign` — pick a telecaller and a count (default 10), and it
  claims the oldest unassigned leads, stamping `assigned_to` + `assigned_on` + `status='assigned'`.
  Must be **transactional and idempotent** — two admins clicking at once must not hand the same lead
  to two callers. Use a single `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`.
- **Daily target** is a tunable constant (`DAILY_LEAD_TARGET = 10`). Queue 0 shows `6/10 worked`.
- **Rollover:** a lead `assigned` but with no `call_logs` row for **3 days** returns to the pool
  (`status='new'`, `assigned_to=NULL`) and is logged. Leads must not die in one person's tray.
- **Expiry:** `status='new'` and older than 60 days → `expired`. A four-month-old number is not a
  lead.

---

## 9. Attribution — who gets credited, and why

Two independent parties can earn on one sale:

- **Sourcing agent** — `subscriptions.sales_agent_id` (column already exists)
- **Closing telecaller** — `subscriptions.telecaller_id` (**new column**, migration §12)

**Never overwrite `sales_agent_id` with a telecaller.** They are different roles in different pools.

### 9.1 How attribution is established, in priority order

1. **Attribution token (deterministic, preferred).** The payment link from §5.5 carries
   `?att=<token>` tied to the lead. On checkout creation the token resolves to
   `(telecaller_id, source_agent_id)` and both are stamped on the subscription. This is the path
   that should carry almost every sale — build it first and make the UI push her toward it.
2. **Call-window fallback.** No token, but a `call_logs` row exists for this phone/profile by a
   telecaller within the **attribution window (30 days, tunable)** before the subscription was
   created → credit the telecaller of the **most recent** such call (last touch).
3. **Agent-only.** No qualifying call, but the subscription arrived through an agent's own referral
   path → agent only, no telecaller credit.
4. **Neither.** Organic self-signup with no call and no token → **nobody is credited.** This is the
   default, and it must be genuinely the default — an organic subscriber quietly landing in
   someone's ledger is the failure mode that destroys trust in the whole system.

Implement this as a **pure function** `resolveAttribution(...)` in a new
`src/lib/commission-logic.ts`, unit-tested in `scratch/` across all four paths plus the edge cases in
§9.2. It is called **once**, at first successful activation, from the reconciler (§10.4) — never from
the webhook.

### 9.2 Anti-gaming rules — implement each explicitly

- She **cannot** be credited on a lead never assigned to her, unless she created it herself via
  §5.4 (that path stamps `created_by` and is rate-limited to 30/day).
- She **cannot** be credited where `profiles.phone` already had an **active** subscription before her
  first call. No re-selling an existing customer to yourself.
- The same person cannot be both `sales_agent_id` and `telecaller_id` on one subscription unless
  owner explicitly allows it via a config flag (default: **off**, request rejected and logged).
- Attribution is **write-once**. Changing it afterwards is an owner-only endpoint that writes an
  `audit_logs` row and is **refused outright** if the affected payout period is locked (§10.5).
- A subscription that never reached `active` earns nobody anything.
- Leads created by a telecaller for a phone number matching **her own** profile, or another staff
  member's, are rejected.

---

## 10. The commission engine

### 10.1 The rates

| | First deal | Trail, per month | Adjustable? |
|---|---|---|---|
| Sourcing agent | **20%** of the first captured payment | **1%** of each later captured payment | Trail only |
| Closing telecaller | **20%** of the first captured payment | **1%** of each later captured payment | Trail only |

- **The 20% first-deal bonus is FIXED at 20% for everyone, permanently.** It is a single system-wide
  constant (`FIRST_DEAL_PERCENT = 20`). It is **not** per-person, **not** tiered, and **promotion
  does not change it.** Do not build a UI to edit it per person.
- **Promotion changes the trail only.** Owner lifts an individual from 1% to **2%** or **3%** (or any
  rate he sets, capped at 25% by the CHECK constraint as a fat-finger guard).

What that looks like per person on a Premium ₹399/mo subscriber:

| | Per person, per event | Over 12 months, per person |
|---|---|---|
| First deal, 20% | ₹79.80 once | ₹79.80 |
| Trail at 1% | ₹3.99 per month, from month 2 | ₹43.89 |
| Trail at 2% (promoted) | ₹7.98 per month | ₹87.78 |
| Trail at 3% (promoted) | ₹11.97 per month | ₹131.67 |

The trail is small per subscriber **by design** — its value is that it accumulates across her whole
book. At 1%, a caller holding 190 paying Premium subscribers earns about ₹758 a month from trail
alone, on top of that month's new closes, for keeping people subscribed.

### 10.2 🚨 The two rate mechanics are different — this is the subtle part

**Get this wrong and every payout dispute you ever have will come from it.**

- **The first-deal bonus is a FIXED CONSTANT, and is still written onto the entry.** 20% for
  everyone, always. It is nonetheless stored in `commission_entries.percent_applied` on every entry —
  not because it varies today, but so that a ledger row from 2026 can still be explained in 2029 even
  if the constant is ever changed. **Never** compute a historical entry's value by reading today's
  constant.
- **The trail rate is RESOLVED PER PAYOUT MONTH** from a rate-history table. When owner promotes
  someone from 1% to 2%, **their entire existing book earns 2% from that month forward** — because
  that is what "promotion" means to a human being, and it is by far the stronger motivator. Already
  locked past months never change.

So: **do not** store a single `commission_percent` on the person and read it at payout time — that
would silently rewrite history the moment owner edits it. And **do not** snapshot the trail rate per
subscription — that would make a promotion worthless on the book she already built.

`sales_agents.commission_percent` (existing column) must therefore be **deprecated for reads**. Keep
the column, `COMMENT` it as legacy, and migrate its current values into the new rate-history table as
each agent's opening row.

### 10.3 New tables

```sql
-- TRAIL rate history. One row per (person, effective period).
-- There is deliberately NO first-deal row type here: the first-deal bonus is
-- the fixed constant FIRST_DEAL_PERCENT = 20 and is not per-person (§10.1).
CREATE TABLE IF NOT EXISTS public.staff_commission_rates (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id       uuid REFERENCES public.sales_agents(id) ON DELETE CASCADE,
    profile_id     uuid REFERENCES public.profiles(id)     ON DELETE CASCADE,
    kind           text NOT NULL DEFAULT 'trail' CHECK (kind = 'trail'),
    percent        numeric(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 25),
    effective_from date NOT NULL,
    effective_to   date,                     -- NULL = current
    set_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    reason         text,                     -- 'promotion', 'correction', 'opening'
    created_at     timestamptz NOT NULL DEFAULT now()
);
-- CHECK: exactly one of agent_id / profile_id is set.
-- EXCLUSION constraint: no overlapping periods per person.
-- The `kind` column is kept (constrained to 'trail') only so a future rate type
-- can be added without a table rewrite. Do not widen it without a decision.

-- The immutable ledger. One row per (payment, beneficiary, kind, period).
CREATE TABLE IF NOT EXISTS public.commission_entries (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id  uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE RESTRICT,
    payment_id       uuid NOT NULL REFERENCES public.payments(id)      ON DELETE RESTRICT,
    agent_id         uuid REFERENCES public.sales_agents(id) ON DELETE RESTRICT,
    profile_id       uuid REFERENCES public.profiles(id)     ON DELETE RESTRICT,
    kind             text NOT NULL CHECK (kind IN ('first_deal','trail')),
    percent_applied  numeric(5,2) NOT NULL,
    base_paise       int NOT NULL,           -- what the % was applied to
    amount_paise     int NOT NULL,           -- the earning itself
    payout_period    text NOT NULL,          -- 'YYYY-MM'
    status           text NOT NULL DEFAULT 'accrued' CHECK (status IN (
                         'accrued','held','payable','paid','clawed_back','void'
                     )),
    paid_at          timestamptz,
    note             text,
    created_at       timestamptz NOT NULL DEFAULT now()
);
-- CHECK: exactly one of agent_id / profile_id.
-- UNIQUE (payment_id, agent_id, profile_id, kind, payout_period) → idempotent regeneration.

-- Locked payout months.
CREATE TABLE IF NOT EXISTS public.commission_payout_periods (
    period      text PRIMARY KEY,            -- 'YYYY-MM'
    locked_at   timestamptz,
    locked_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    note        text
);
```

All three: RLS enabled, one `USING (public.is_admin())` policy. Telecaller reads **her own rows
only**, through `/api/telecaller/earnings`, filtered server-side by her uuid.

### 10.4 🚨 Generation must NOT live in the Razorpay webhook

The webhook is the single most load-bearing piece of this system — it is the only thing that can set
`status = 'active'`. **A bug in commission arithmetic must never be able to fail a payment
activation.**

So: build an **idempotent reconciler**, `POST /api/admin/commissions/reconcile` (owner-only, also
runnable on a schedule). It scans `payments` with `status='captured'` and creates any missing
`commission_entries`. The UNIQUE constraint above makes re-running it free and safe. Log what it
created. The webhook stays exactly as it is.

Per captured payment:

1. Resolve attribution once for the subscription (§9.1) if not already stamped.
2. Is this the subscription's **first** captured payment?
   - **Yes** → one `first_deal` entry per beneficiary at the fixed `FIRST_DEAL_PERCENT` (20),
     written into `percent_applied`.
   - **No** → one `trail` entry per beneficiary at the rate resolved for **that payment's payout
     period** from `staff_commission_rates`.
3. **Yearly plans:** the trail accrues **monthly at one-twelfth**, not in a lump. One captured
   annual payment generates 11 monthly `trail` entries (months 2–12), one per `payout_period`, each
   created as that month arrives — **not** all at once, so a mid-year cancellation simply stops
   generating them. Your cash is already collected, so accrual costs you nothing and it keeps her
   retention incentive alive all year instead of only in renewal month.
4. Round **half-up to the paisa** at the entry level, and store `base_paise` alongside so any figure
   can be re-derived and argued about with evidence. Never round at the total.

### 10.5 Holds, clawbacks and locking

- **Hold the first-deal bonus.** New `first_deal` entries land as `held`, not `payable`, and mature
  to `payable` after **30 days** with no refund or chargeback. See §10.6 for why this is not
  optional.
- **Refund or chargeback** → the reconciler writes a **`clawed_back` reversal entry** (negative
  `amount_paise`) against the current open period. It does **not** edit or delete the original — the
  ledger is append-only. If the original was already `paid`, the reversal simply reduces the next
  payout.
- **Cancellation** stops future trail generation. It never reverses trail already earned on money you
  kept.
- **Locking:** owner locks a period (`commission_payout_periods.locked_at`). After that, no entry in
  that period can be created, edited, or reversed — corrections go to the current open period with a
  `note`. Without locking, a stale reconciler run or a late refund silently rewrites a month you
  already paid out on.
- Every rate change, promotion, manual adjustment, attribution override and payout mark writes an
  `audit_logs` row.

### 10.6 🚩 What your numbers actually cost

**Read the column headers carefully.** "Per person" is what one beneficiary earns. "Both" is what
leaves the business, since agent and telecaller each earn the same rate on the same sale. Confusing
the two makes the trail look ten times bigger than it is.

Trail at 1% each, over a subscriber's first 12 months:

| Plan | First deal, per person | First deal, **both** | Trail per person, per month | Yr-1 total, **both** | % of yr-1 revenue |
|---|---|---|---|---|---|
| Basic ₹251/mo | ₹50.20 | ₹100.40 | **₹2.51** | ₹155.62 | 5.2% |
| Premium ₹399/mo | ₹79.80 | ₹159.60 | **₹3.99** | ₹247.38 | 5.2% |
| **Premium Annual ₹4,101/yr** | **₹820.20** | **₹1,640.40** | ₹3.42 (accrued 1/12) | ₹1,722.42 | **42%** |

The trail is genuinely cheap — about ₹4 a month per person on a Premium subscriber, ₹88 a year across
both of them. Even with both promoted to 3%, the monthly plans only reach roughly 8.8% of year-1
revenue. **The trail is not the thing to worry about.**

**The 20% on Premium Annual is.** Because the whole year is collected on day one, 40% of that
subscriber's entire year-1 revenue — ₹1,640 — leaves before he has received a single seva. Two things
follow, and only the second is a real decision:

- **Build the hold + clawback regardless.** The `first_deal` entry sits `held` for 30 days and is
  reversed on a refund or chargeback (§10.5). This is not optional and not a policy question: without
  it you pay ₹1,640 in full on a payment that gets reversed. It is roughly 20 lines of code.
- **Open decision for Chirayu:** does 20% of the full annual payment stand as-is? Chirayu has
  confirmed 20% is fixed and not per-person, which settles the *rate*. It does not settle the *base*
  for yearly plans. Either answer is workable and both are one named constant:
  - **Keep it** — ₹820 each per annual sale. It makes the annual plan by far the most attractive
    thing to sell, which may be exactly what you want while you are growing. Just know it is 42% of
    that subscriber's year-1 revenue and plan the seva-delivery margin around it.
  - **Cap or rebase it** — e.g. a flat ceiling per sale, or 20% of the monthly equivalent × 3
    (≈ ₹205 each). An annual close is worth more than a monthly one; this pays it more than one
    without paying it thirteen.

  Implement it as `FIRST_DEAL_BASE_YEARLY` with a documented default of `'full_payment'` and the
  alternative `'monthly_equivalent_x3'` available, so switching it later is a one-line change and not
  a migration. **Do not silently pick one — surface the choice in the session summary.**

---

## 11. Her earnings page — `/telecaller/earnings`

The whole point of the trail is that she can watch it grow. Hide it and you have the cost of a
trail scheme with none of the behavioural benefit.

Shows, **for her only**:

- **This month:** earned so far, split into first-deal vs trail
- **Her book:** how many subscribers are currently paying her a trail, and how many dropped off this
  month (the second number is the one that changes her behaviour)
- **Her current trail rate**, with her tier — and if owner promoted her, when it took effect
- **Held bonuses** with their maturity dates, clearly labelled as not yet payable and why
- **Payout history** by locked period, with status
- **Per-subscriber lines** she can expand: plan name, when it started, what it has earned her,
  whether it is still paying

Strictly not shown: any other person's earnings or rate — **including the field agent on her own
sale** — company revenue or MRR, other subscribers' payment amounts, or any aggregate beyond her own
totals.

Owner gets the mirror of this at `/admin/reports` (owner-only, existing gate): everyone's ledger,
per-period payout sheets, the lock control, the reconciler trigger, and a per-person view. **Admin
sees none of it** — it is financial data, and that is the existing rule.

---

## 12. Migration `20260822_013_leads_and_commissions.sql`

Separate migration from 012 so Part A can ship and be verified alone.

- `subscriptions`: `ADD COLUMN IF NOT EXISTS telecaller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL`,
  plus `attribution_source text` (`'token' | 'call_window' | 'agent_referral' | 'organic' | 'manual'`)
  and `attributed_at timestamptz`. All nullable; existing rows keep NULL and are treated as organic.
- `leads`, `staff_commission_rates`, `commission_entries`, `commission_payout_periods` per §8.1/§10.3.
- `call_logs.lead_id` FK → `leads(id)`.
- Backfill: one `staff_commission_rates` opening row per existing `sales_agents` row, carrying its
  current `commission_percent` as `kind='trail'`, `reason='opening'`,
  `effective_from = <migration date>`. Then `COMMENT` the old column as legacy-do-not-read.
- **Deliberately NOT done:** no backfill of `commission_entries` for historical payments — pre-launch
  sales have no attribution and inventing it would be fabricating payouts. State this in the header.
  If Chirayu wants historical commission, that is a manual, owner-signed exercise, not a migration.
- RLS on all new tables: enabled, one `USING (public.is_admin())` policy each. No telecaller policy.

---

## 13. Security checklist — verify each, don't assume

- [ ] `public.is_admin()` still returns `role IN ('admin','owner')` — **unchanged**. With a
      telecaller JWT: `SELECT public.is_admin();` → **false**
- [ ] With a telecaller JWT, direct REST calls to `subscriber_list_view`, `payments`, `plans`,
      `sales_agents`, `audit_logs`, `sankalp_batches`, `leads`, `commission_entries` and
      `staff_commission_rates` all return **empty or denied**
- [ ] Every `/api/admin/*` endpoint returns 401/403 to a telecaller JWT — spot-check
      `reports/export`, `payments/list`, `overview-financials`, `sales-agents/list`,
      `commissions/reconcile`, `leads/assign`
- [ ] `/api/telecaller/earnings` with telecaller A's JWT returns **zero** rows belonging to B,
      including when A passes B's uuid as a parameter
- [ ] `grep` the built client bundle on a telecaller session for `amount_paise`,
      `commission_percent`, `razorpay_` — the only ₹ figures present are plan prices and her own
      commission amounts
- [ ] No `select("*")` anywhere under `/api/telecaller/*`
- [ ] Every write endpoint produces an `audit_logs` row with before/after in `meta`
- [ ] No OTP field, no card/UPI field, no CVV field exists anywhere in the telecaller UI
- [ ] `phone` is not writable through any telecaller endpoint
- [ ] No CSV/export endpoint is reachable by a telecaller
- [ ] `/admin/*` redirects a telecaller instead of rendering the shell (§6.1)
- [ ] `subscriptions.status` cannot be written by any telecaller endpoint — grep to prove it
- [ ] No telecaller endpoint can write `commission_entries`, `staff_commission_rates`,
      `subscriptions.telecaller_id` or `sales_agent_id`
- [ ] Running the reconciler twice in a row creates **zero** duplicate entries
- [ ] An organic signup with no call and no token creates **zero** commission entries
- [ ] A locked period rejects new entries, edits and reversals

---

## 14. Definition of done

**Part A**

- [ ] Migration 012 applied to Staging: role CHECK widened, `is_telecaller()` added, `is_admin()`
      untouched, `call_logs` created, `profiles` columns added
- [ ] `src/lib/telecaller-logic.ts` — queue predicates, field allowlist, `maskForTelecaller()`,
      shared family/address validators extracted from the existing routes
- [ ] Unit tests in `scratch/` for every queue predicate and the masking function
- [ ] `/api/telecaller/*`: `queues`, `queue/list`, `person`, `family-members`, `profile`,
      `create-lead`, `send-payment-link`, `log-call`
- [ ] `/telecaller` panel: queue stack, working lists, call card, new-lead form, my-day, script
- [ ] `beforeLoad` guard added to `/admin` (the gap found in §6.1)
- [ ] "Call Queue" link in the admin/owner sidebar
- [ ] Walked end-to-end on a real Sankalp-Pending subscriber with a hand-promoted test account

**Part B**

- [ ] `FIRST_DEAL_PERCENT = 20` as a fixed system constant — **no per-person first-deal rate, and no
      UI to edit one.** Promotion touches the trail only
- [ ] Hold + 30-day clawback on `first_deal` entries — built regardless of §10.6
- [ ] `FIRST_DEAL_BASE_YEARLY` implemented as a switchable constant, with Chirayu's choice recorded
      in the session summary
- [ ] Migration 013 applied: `leads`, rate history, ledger, payout periods,
      `subscriptions.telecaller_id`, agent rate backfill
- [ ] `src/lib/commission-logic.ts` — `resolveAttribution()`, rate resolution, entry generation,
      yearly accrual, clawback. Unit-tested in `scratch/` across **all four** attribution paths and
      **every** §9.2 anti-gaming rule
- [ ] `/admin/leads` upload + assign (transactional, `SKIP LOCKED`, dedupe on upload)
- [ ] Reconciler endpoint, idempotent, proven by running it twice
- [ ] `/telecaller/earnings` (own rows only) and the owner payout sheet + lock control
- [ ] **A full worked example, in the session summary, with real numbers:** one monthly and one
      annual subscriber followed from lead → call → link → payment → first-deal entry → three months
      of trail → a promotion from 1% to 2% → a refund and its clawback. Paste the actual ledger rows.
      If that example is right, the engine is right.
- [ ] Every box in §13 ticked with **actual output pasted**, not the word "verified"
- [ ] End-of-session summary: files touched, endpoints added, every constant chosen and its value,
      and every open question

---

*🚩 Sewa Hamari, Punya Aapka 🚩*
