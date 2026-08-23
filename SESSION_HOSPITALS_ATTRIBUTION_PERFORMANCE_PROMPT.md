# 🕉️ PUNYATA — Session: Hospitals, No-Coupon Attribution & Owner Performance

**For:** OpenCode — **Kimi K3 _or_ oxAlpha** (this brief is model-agnostic; nothing in it assumes a
particular model) · **Prepared by:** Chirayu (via Claude) · **Date:** 2026-08-23
**Branch discipline:** work on `Staging`; Chirayu reviews & merges to `main` (protected, PR-only).
**Depends on:** migrations up to `20260822_013_leads_and_commissions.sql` applied, and the telecaller
panel (Parts A + B of `SESSION_TELECALLER_PANEL_PROMPT.md`) merged. Read that file and
`REVIEW_TELECALLER_SESSION.md` first — this session edits the exact code both describe.

> **Next migration number is `014`.** File: `supabase/migrations/20260823_014_hospitals_perf.sql`.

---

## 0. Why this exists — the real business flow (corrected by Chirayu, 2026-08-23)

The lead funnel, end to end, is:

1. The company **allots a specific hospital** to a **field sales agent**.
2. The agent stands at that hospital, collects **name + phone number** of people, and hands those
   numbers in (uploaded by owner/admin on the agent's behalf).
3. A **telecaller** calls the number and **first asks the person _which sales agent_ gave them this
   number** — that answer is how the sale is attributed to the right agent.
4. The telecaller does **one free pooja** for them as the hook, then convinces them to subscribe.
5. The telecaller sends a **registration/payment link on WhatsApp**. If the person subscribes through
   that link, the **field agent and the telecaller each earn** from their **separate pools** (the 20%
   first-deal + trail engine already built in migration 013).

Two things in the current codebase do not match this flow, and this session fixes them:

- **There are NO coupon codes in this flow — not for the agent, not for the telecaller, and none is
  ever handed to the customer.** Attribution rides on the **link token** plus the **verbal "which
  agent?" answer** as a backup. But `send-payment-link.ts` today accepts a `coupon_code`, validates
  `visibility='agent'` coupons, and passes them into checkout. That "agent coupon" mechanism must be
  **removed** (§2).
- **Hospitals do not exist as an entity**, and the sourcing agent is currently mis-derived from the
  *telecaller's own* phone instead of the *field agent* who sourced the lead. This session adds the
  **hospital + allotment** model and fixes attribution to credit the real sourcing agent (§3, §4).

And one thing the business needs but the schema cannot yet answer: **with multiple telecallers and
multiple agents working at once, the owner must be able to judge each person's performance and the
calls, to decide who to reward, which hospitals to reallocate, who to coach, and who to cut.** That
requires capturing the funnel as timestamped events now (§5) and an owner leaderboard on top (§6).

---

## 1. Decisions taken — confirm, do NOT re-litigate

| # | Decision |
|---|---|
| 1 | **No coupon codes anywhere in the agent/telecaller flow.** Telecallers and agents neither hold nor issue any discount code. Remove the agent-coupon path end to end (§2). |
| 2 | **Public, customer-facing website coupons are a SEPARATE feature and stay.** This session removes only `visibility='agent'` coupon usage and the telecaller `coupon_code` field — it must NOT break `/api/coupons/validate` for ordinary public/personally-assigned coupons on the normal checkout. |
| 3 | Attribution priority is unchanged in spirit and stays: **link token → verbal "which agent" backup (via the lead's `source_agent_id`) → 30-day call window → organic (nobody).** The token is the source of truth; the agent-referral path is the backup when the token is missing. |
| 4 | A **hospital** is the allotment unit. One hospital is allotted to **one agent at a time**; an agent may hold **many** hospitals. The hospital determines the sourcing agent for its leads (overridable). |
| 5 | The **"1 free pooja"** step is a real funnel event and must be captured as a timestamp on the lead (§5). |
| 6 | The **owner performance view is OWNER-only** (it shows ₹ revenue and everyone's earnings). Admins never see it. A telecaller/agent never sees anyone's numbers but their own (already true). |
| 7 | The commission engine (migration 013 + `commission-logic.ts`) is **not being redesigned**. This session only feeds it the *correct* sourcing agent and reads *from* the ledger for reporting. |

**HARD RULES carried in (do not break, do not "improve"):**
- `subscriptions.status='active'` is webhook-only. No new endpoint here writes it.
- `public.is_admin()` stays `role IN ('admin','owner')`. **Do not add `telecaller` or widen it.** New
  tables get their own `is_admin()` policy exactly like migration 013's tables.
- Every `SECURITY DEFINER` function gets an **explicit `REVOKE EXECUTE FROM public, anon,
  authenticated`** (the C1 rule from the review — it is now a permanent checklist line).
- Telecaller pages never query Supabase directly; everything through `/api/telecaller/*` with a field
  allowlist and `stripMaskedFieldsDeep` on every return path.
- Pure/impure split: money and aggregation math lives in a **pure, zero-import, `nowMs`-injected**
  module with a `scratch/verify_*.ts` proof; endpoints call the pure function and never re-implement
  it inline (the meta-lesson from `REVIEW_TELECALLER_SESSION.md`).

---

# PART 1 — REMOVE THE AGENT/TELECALLER COUPON MECHANISM

## 2. Kill the "agent coupon" path (no schema drop required)

The goal is surgical: remove the code paths that let a telecaller/agent apply a coupon, **without**
touching the ordinary public-coupon checkout. Do all four edits; each is small.

### 2.1 `src/routes/api/telecaller/send-payment-link.ts`
- Remove `coupon_code` from the body type and the whole **"Coupon allowlist: agent-visibility ONLY"**
  block (the `coupons` lookup at lines ~76–88).
- In the `createCheckoutForUser({...})` call, **remove** `couponCode` and `couponAgentUsable`.
- Remove `couponLabel`/`coupon_used` from the response and the audit meta.
- The telecaller now sends **only** the plan link + attribution token. No discount is ever expressed.

### 2.2 `src/lib/subscriptions-checkout.server.ts`
- Remove the `couponAgentUsable?: boolean` parameter from `createCheckoutForUser` and the
  `...(input.couponAgentUsable ? { agentUsable: true } : {})` it feeds into `validateCouponForPlan`.
- Leave the ordinary `couponCode` param and the public-coupon validation intact — the public
  post-login checkout (`/api/subscriptions/create-checkout`) still supports customer-entered public
  coupons. Only the *agent* widening is gone.

### 2.3 `src/lib/coupons.server.ts`
- In `decideCoupon`, delete the `agentUsable` branch: remove the `agentUsable` input field and the
  `const agentUsable = input.agentUsable === true && coupon.visibility === "agent";` clause, so the
  visibility test is just `publiclyUsable || personallyAssigned`.
- Remove the `agentUsable?` param from `validateCouponForPlan`.
- A `visibility='agent'` coupon now simply fails `not_visible_to_user` for everyone — which is
  correct: there is no such thing as an agent coupon anymore.

### 2.4 Migration `014` — deprecate, don't destroy
- Do **not** drop the `coupons` table or the `'agent'` enum value (existing rows and the public
  coupon feature stay valid). Instead add a `COMMENT ON` note on `coupons.visibility` recording that
  `'agent'` is **deprecated and unused as of 2026-08-23 — attribution is token+agent-referral, never a
  coupon**, and (optionally) one idempotent statement deactivating any leftover agent coupons:
  ```sql
  UPDATE public.coupons SET is_active = false
   WHERE visibility = 'agent' AND is_active = true;
  ```

### 2.5 Session-5 scope correction (write it down so it is not rebuilt wrong)
When `/admin/sales-agents` and `/admin/coupons` are eventually built (still unbuilt per
`SESSIONS_PROGRESS.md`), they must **NOT** include agent-assigned coupon codes or per-agent referral
*discount* codes. Agent attribution is **number → hospital allotment → link token → verbal backup**,
never a code the agent gives out. Referral *links* that carry an attribution token are fine; referral
*coupons* are not.

**Acceptance:** `tsc` clean; public coupon validation still works on the normal checkout; a
`visibility='agent'` coupon is rejected for a telecaller; no telecaller endpoint accepts `coupon_code`.

---

# PART 2 — HOSPITALS, ALLOTMENT & CORRECT SOURCING-AGENT ATTRIBUTION

## 3. Schema — migration `014` (hospitals, allotments, lead columns)

House style of 006/012/013: purpose block; explicit "does NOT do" block; one `is_admin()` policy per
new table; every `SECURITY DEFINER` function explicitly `REVOKE`d; verification queries at the bottom.

### 3.1 `public.hospitals`
```sql
CREATE TABLE IF NOT EXISTS public.hospitals (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    city       text,
    notes      text,
    is_active  boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hospitals: admin full access"
    ON public.hospitals FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE INDEX IF NOT EXISTS idx_hospitals_active ON public.hospitals (is_active);
```

### 3.2 `public.agent_hospital_allotments` — history, no double-allotment
One hospital → one active agent at a time; use a `btree_gist` exclusion (same technique migration 013
used for `staff_commission_rates`) so two overlapping *active* allotments of the same hospital cannot
exist. An agent may hold many hospitals (no constraint on the agent dimension).
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- already created in 013; harmless

CREATE TABLE IF NOT EXISTS public.agent_hospital_allotments (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id   uuid NOT NULL REFERENCES public.hospitals(id)    ON DELETE CASCADE,
    agent_id      uuid NOT NULL REFERENCES public.sales_agents(id) ON DELETE CASCADE,
    allotted_from date NOT NULL DEFAULT CURRENT_DATE,
    allotted_to   date,                       -- NULL = current
    set_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    reason        text,                        -- 'allotment' | 'reallotment' | 'correction'
    created_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ahs_no_overlap EXCLUDE USING gist (
        hospital_id WITH =,
        daterange(allotted_from, allotted_to, '[)') WITH &&
    )
);
ALTER TABLE public.agent_hospital_allotments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_hospital_allotments: admin full access"
    ON public.agent_hospital_allotments FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE INDEX IF NOT EXISTS idx_ahs_hospital ON public.agent_hospital_allotments (hospital_id, allotted_from);
CREATE INDEX IF NOT EXISTS idx_ahs_agent    ON public.agent_hospital_allotments (agent_id, allotted_from);
```
Add a `SECURITY DEFINER` helper `current_hospital_agent(p_hospital uuid) RETURNS uuid` returning the
agent whose `[allotted_from, allotted_to)` covers `CURRENT_DATE`, and **`REVOKE EXECUTE`** it from
`public, anon, authenticated` (service-role only, C1 rule).

### 3.3 New columns on `public.leads`
```sql
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS hospital_id    uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS free_pooja_at  timestamptz,
    ADD COLUMN IF NOT EXISTS free_pooja_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS named_agent_id uuid REFERENCES public.sales_agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_hospital     ON public.leads (hospital_id);
CREATE INDEX IF NOT EXISTS idx_leads_source_agent ON public.leads (source_agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_free_pooja   ON public.leads (free_pooja_at) WHERE free_pooja_at IS NOT NULL;
```
- `hospital_id` — which hospital this number came from.
- `named_agent_id` — the agent the **customer verbally named** when the telecaller asked "which agent
  gave you this number?". This is the human-confirmed backup. Normally it equals `source_agent_id`
  (derived from the hospital allotment); when it differs, the owner sees a mismatch to investigate.
- `free_pooja_at` / `free_pooja_by` — the "1 free pooja" funnel event (§5).

Comment each column (why it exists), per house style.

## 4. Fix sourcing-agent attribution to the FIELD agent (not the telecaller)

Today two paths mis-attribute the agent. Fix both so the **field agent who sourced the lead** is
credited — which is also what makes the "verbal backup" work when the token is lost.

### 4.1 `send-payment-link.ts` — use the lead's `source_agent_id`, not the caller's phone
The current block (lines ~90–104) looks up a `sales_agents` row by **the telecaller's own phone** and
passes that as `salesAgentId`. That credits the telecaller-as-agent, which is wrong. Replace with:
- Resolve the **lead** for this send (by `lead_id` if the card carries one, else by
  `attribution_token`, else by the target `profile_id` via the most recent open lead for that phone).
- `salesAgentId = lead.source_agent_id` (may be null → then no agent credit, which is correct).
- Pass the lead's `attribution_token` into the share link (already supported) so the token path stays
  the primary, deterministic credit.
- Tray check (C2/H9 from the review): the resolved lead **must belong to this caller** (assigned to
  or created by her) and its token/profile must match the target. Reject otherwise. Reuse
  `isInCallersTray` from `telecaller-data.server.ts`.

### 4.2 `create-checkout.ts` token path — also stamp the sourcing agent
The `?att=` handler resolves `telecallerId` from `lead.assigned_to ?? lead.created_by` but never
stamps the agent. It already selects `source_agent_id` — pass it through:
- Add `salesAgentId: lead.source_agent_id ?? null` to the `createCheckoutForUser` call when a token
  resolved, so `subscriptions.sales_agent_id` is stamped write-once alongside `telecaller_id`.
- `createCheckoutForUser` already writes `sales_agent_id` when `input.salesAgentId` is set — no change
  needed there beyond §2.2's coupon removal.

### 4.3 `admin/leads/upload.ts` — capture hospital, derive the agent from allotment
- Accept `hospital_id` in the body (per-batch, like `source_agent_id`).
- When `hospital_id` is present and `source_agent_id` is **not** explicitly given, derive
  `source_agent_id` from `current_hospital_agent(hospital_id)` (service-role call) and stamp both on
  each inserted lead. An explicit `source_agent_id` in the body overrides the derivation.
- Persist `hospital_id` on every inserted/duplicate lead row.
- Keep all existing dedupe behaviour unchanged.

### 4.4 `admin.leads.tsx` — expose hospital + agent in the upload UI
- Add a **Hospital** `<select>` (active hospitals) next to the existing "Source agent" select.
- When a hospital is chosen, show the auto-derived current agent as read-only helper text ("Is
  hospital ka agent: …") so the uploader sees who will be credited; still allow the manual agent
  override.
- Add a small **Hospitals & allotments** admin surface (can be a section on this page or a new
  `/admin/hospitals.tsx`): CRUD hospitals, and allot/re-allot a hospital to an agent (writes
  `agent_hospital_allotments`; re-allotment closes the current row's `allotted_to = CURRENT_DATE - 1`
  and opens a new one — do this in one `SECURITY DEFINER` function `reallot_hospital(p_hospital,
  p_agent, p_reason)` with the exclusion constraint as the safety net, and **REVOKE** it C1-style).

**Acceptance:** uploading a batch with a hospital stamps the right agent; a token checkout stamps both
`telecaller_id` and `sales_agent_id`; a telecaller cannot send a link for a lead not in her tray; no
sale is ever credited to a telecaller *as the agent* off her own phone.

---

# PART 3 — CAPTURE THE FUNNEL & BUILD THE OWNER LEADERBOARD

## 5. Capture the "1 free pooja" event (the missing funnel step)

Everything else in the funnel is already timestamped: **received** = `leads.created_at`, **assigned**
= `leads.assigned_on`, **called (with outcome)** = `call_logs`, **link sent** = `leads.status
='link_sent'` + the `telecaller.payment_link.sent` audit row, **converted** = `leads.converted_at`.
The one gap is the free pooja. Capture it on the existing, already-gated call endpoint:

- Extend `POST /api/telecaller/log-call` with an optional `free_pooja_given?: boolean`. When true and
  the call resolves to a `lead_id` in the caller's tray, stamp `leads.free_pooja_at = now()` and
  `leads.free_pooja_by = caller` **only if `free_pooja_at` is currently NULL** (idempotent; a second
  true is a no-op). Include it in the audit meta.
- Also capture the verbal agent answer: accept optional `named_agent_id?: uuid` on the same call and
  stamp `leads.named_agent_id` (idempotent). The lead card UI (`telecaller.lead.$leadId.tsx`) gets a
  "Kaunse agent ne number diya?" select (active agents) and a "Free pooja ho gayi" toggle, both wired
  through `log-call`.
- Do **not** add a new `call_logs.outcome` enum value for this — free pooja is a lead attribute, not a
  call disposition, and changing the CHECKed enum is a heavier migration for no benefit.

**Acceptance:** after a telecaller marks a free pooja, `leads.free_pooja_at` is set once and never
overwritten; the value flows into the analytics in §6.

## 6. Owner performance leaderboard — `/admin/performance` (OWNER-only)

The owner must judge **telecallers, agents, and hospitals** side by side to make four decisions:
**reward** top performers, **reallocate** hospitals, **coach** weak callers, and **cut**
underperformers. Build one ranked, comparable view with three lenses. All figures are read-only
aggregations over a date range (default: current IST month).

### 6.1 Gating (financial → owner-only) — use the existing `requireOwner`
`supabase-admin.server.ts` **already exports `requireOwner(request)`** — do not re-invent it. It
returns `{ ok: true, auth: { staffId, role:'owner', db } }` or `{ ok: false, status: 401|403, error
}` (401 = no/invalid token or not staff; 403 = staff but not owner). Every `/api/admin/performance/*`
handler starts with:
```ts
const gate = await requireOwner(request);
if (!gate.ok) return json({ error: gate.error }, gate.status);
const { db, staffId } = gate.auth;
```
- The `/admin/performance` route must be **owner-only in both layers, exactly like
  `/admin/commissions` and `/admin/reports`**: (1) add its nav item inside the existing
  `...(role === "owner" ? [ … ] : [])` block in `admin.tsx`, and (2) guard the route's `beforeLoad`
  to redirect a non-owner away (reuse `fetchMyRole()` as the other owner routes do). The API 403 is
  layer 3.

### 6.2 Pure aggregation module `src/lib/performance-logic.ts`
Zero imports, `nowMs`/period passed in, fully unit-testable (proof in
`scratch/verify_performance.ts`). It receives already-fetched rows and returns the three ranked
tables. Keep **all** date-bucketing in **Asia/Kolkata** (the review's MEDIUM finding — a payment at
20:00 IST on the 31st must land in the correct month). Data fetch (full rows, watermarked by the
range) lives in `src/lib/performance-data.server.ts`.

### 6.3 Metrics per lens (compute from these sources)
Sources: `leads`, `call_logs`, `subscriptions`, `payments`, `commission_entries`, `sales_agents`,
`hospitals`, `agent_hospital_allotments`, `profiles` (names).

**Per TELECALLER** (`GET /api/admin/performance/telecallers?from=&to=`):
- `leads_assigned` (leads with `assigned_to = tc` in range), `leads_called` (distinct leads with a
  `call_logs` row by her), `calls_made`, **`contact_rate`** = contact-establishing calls ÷ assigned
  (are they actually working the list? — the coach signal).
- `free_poojas` (leads she stamped), `links_sent`, `conversions` (subscriptions with `telecaller_id
  = tc`, activated in range), **`free_pooja_to_paid_rate`** = conversions ÷ free_poojas (her real
  closing skill).
- **`revenue_generated_paise`** = sum of **captured** `payments.amount_paise` for subscriptions
  attributed to her (NOT plan list price — the review's H1). `active_book_count`, `churn_count`
  (her subs that went `cancelled`/`paused` in range).
- **Earnings** from `commission_entries` where `profile_id = tc`: `first_deal_paise`, `trail_paise`,
  `total_earned_paise` (this is her own money; owner may see everyone's here).
- `avg_days_to_convert` (converted_at − first contact).

**Per AGENT** (`GET /api/admin/performance/agents?from=&to=`):
- `leads_supplied` (leads with `source_agent_id = agent`), `leads_converted`, **`lead_quality_rate`**
  = converted ÷ supplied (the agent's real value — drives reallocation), `revenue_attributed_paise`
  (captured payments on subs with `sales_agent_id = agent`), `earnings_paise`
  (`commission_entries.agent_id`), `hospitals` (names held), `best_hospital` / `worst_hospital` by
  conversion.

**Per HOSPITAL** (`GET /api/admin/performance/hospitals?from=&to=`):
- current `allotted_agent`, `leads_produced`, `converted`, `conversion_rate`, `revenue_paise` — so a
  dead allotment is obvious and can be reallocated or dropped.

### 6.4 Correctness rules (bake these in; they are where reports go wrong)
- **Revenue = captured payments only.** Never the plan's list price; never `status='active'` as a
  proxy for money received (H1/H7 discipline).
- **Attribute by the resolved fields** `subscriptions.telecaller_id` / `sales_agent_id` (what
  actually got paid out), not by raw lead ownership — otherwise the leaderboard and the ledger
  disagree.
- **Fair-sample guard (the "cut" decision must be fair):** do not rank anyone with fewer than a
  configurable `MIN_LEADS_FOR_RANKING` (default 20) leads in the range as "worst" — show them as
  *"insufficient data"* instead. A bad week on 3 leads is not a firing case.
- **No silent truncation.** If any list is capped, `log`/label it (the review's "no silent caps"
  rule).
- All money returned in paise; the UI formats ₹. All rates returned as ratios + the raw
  numerator/denominator so the UI can show "12/50" not just "24%".

### 6.5 UI `src/routes/admin.performance.tsx`
- Three tabs (Telecallers / Agents / Hospitals), a date-range picker defaulting to the current IST
  month, and a **sortable, ranked table** per tab (reuse existing `components/ui/table` + the amber
  admin styling from `admin.leads.tsx` / `admin.reports.tsx`).
- Default sort surfaces each decision: Telecallers by conversion rate (reward) with contact-rate and
  free-pooja→paid columns visible (coach); Agents by lead-quality (reallocate); Hospitals by
  conversion (reallocate/drop). Mark "insufficient data" rows distinctly and keep them out of the
  top/bottom highlight.
- Read-only. No write actions on this page (reallotment lives on the leads/hospitals admin surface).

**Acceptance:** an owner sees three ranked tables that reconcile with the commission ledger totals for
the same period; an admin (non-owner) cannot reach the page or the APIs; revenue matches
sum-of-captured-payments, not list price; a telecaller with 3 leads is never shown as "worst".

---

## 7. Out of scope / related open items (do NOT silently fold in)
- **Razorpay tenure fix** (`TOTAL_COUNT_MONTHLY=12` / `TOTAL_COUNT_YEARLY=5` in
  `subscriptions-checkout.server.ts`): memory/`SESSION_TENURE_AND_OTP_ABUSE_PROMPT.md` want
  `1200`/`100` (run-until-cancel). This session does not change it — flag it, leave it.
- **`FIRST_DEAL_BASE_YEARLY`** remains `'full_payment'` and is still an open owner decision; do not
  change it here.
- The reconciler correctness cluster (H1–H8) is tracked in `REVIEW_TELECALLER_SESSION.md`; this
  session depends on those fixes being in but does not redo them.

## 8. Build order & verification
1. **Part 1 (coupons)** — smallest, isolated. `tsc`, confirm public checkout coupon still validates,
   confirm agent coupon now rejected. Commit.
2. **Part 2 (hospitals + attribution)** — migration 014 §3, then the four code edits §4. Apply 014 to
   Staging, run the migration's verification queries (exclusion constraint fires on double-allotment;
   `current_hospital_agent` returns the right agent). Walk a lead: upload with hospital → agent
   derived → send link → token checkout stamps both ids. Commit.
3. **Part 3 (funnel + leaderboard)** — §5 then §6. Write `scratch/verify_performance.ts` and prove
   the pure module against fixed inputs **including a yearly plan and an IST month-boundary payment**
   before wiring the UI. Reconcile a period's leaderboard revenue against `SELECT sum(amount_paise)`
   of captured payments and earnings against `commission_entries`. Commit.
4. Final: `tsc` clean, ESLint clean on new files, production build passes. Do not run anything against
   real money until reconciliation matches by hand.

**Every `SECURITY DEFINER` function added in 014 must carry an explicit `REVOKE EXECUTE FROM public,
anon, authenticated`.** Grep the migration for `SECURITY DEFINER` and confirm each has a matching
`REVOKE` before you consider it done — this is the C1 lesson and it is not optional.

---

*🚩 Sewa Hamari, Punya Aapka 🚩*
