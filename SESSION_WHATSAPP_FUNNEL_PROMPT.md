# 🕉️ PUNYATA — Session: WhatsApp Funnel (login, plan, payment link, delivery)

**For:** OpenCode + Kimi K3 (or oxAlpha — model-agnostic) · **Prepared by:** Chirayu (via Claude) · **Date:** 2026-09-05
**Migration:** next is `20260905_032_whatsapp_funnel.sql` — builds on migrations up to `031` (`ashirwad_patra`).
**Read first if unfamiliar:** `SESSION_TELECALLER_PANEL_PROMPT.md` (tray/attribution/commission model) and
`SESSION_HOSPITALS_ATTRIBUTION_PERFORMANCE_PROMPT.md` (hospitals → agent → lead chain). This session **reuses**
both; it does not replace either.

---

## 0. Repo reality check first (do this before writing any code)

This is an additive session on a live codebase. Confirm these still hold (they did as of 2026-09-05). If any
diverged, **flag it in your summary rather than silently working around it**:

- `src/routes/api/telecaller/send-payment-link.ts` — builds a `/checkout/:plan?att=<token>` share link and a
  `wa.me` link via `buildWaLink`. It **already** has a guest-mode branch (lines ~146-186) for a lead with no
  `profiles` row, and an existing-profile branch that calls `createCheckoutForUser`. It inserts a
  `notifications` row (line ~312) with `status: 'pending'`.
- `src/lib/sankalp-logic.ts` — exports `buildWaLink(phoneRaw, message)` (line ~467) and
  `normalizePhoneForWa` (line ~460). `groupForPandit()` returns **only** `{name, gotra}` sourced from
  `family_members`.
- `src/routes/api/subscriptions/create-checkout.ts` — resolves `?att=` → lead → stamps `telecaller_id` +
  `source_agent_id` (lines ~67-76). Requires `profiles.full_name` and `profiles.phone` to exist (lines ~30-38).
- `src/lib/gateways/razorpay.ts` — `createMandate` posts to `subscriptions` with `customer_notify: 0` and
  **no** `customer_id` (line ~252).
- `src/routes/admin.proof-upload.tsx` — line ~971-972 resolves the proof recipient as
  `profiles.phone` of `subscriptions.user_id`, and **silently `continue`s** when that phone is missing.
- **`notifications` is write-only.** Repo-wide there are exactly two inserts
  (`send-payment-link.ts:312`, `mandates.server.ts:552`) and **zero readers**. No worker exists.

## 0.1 🔴 STOP — four blocking defects already in the written code (found 2026-09-05 review)

Implementation began before this review. `20260905_032_whatsapp_funnel.sql`,
`src/lib/notifications-worker.server.ts` and `src/routes/api/cron/send-notifications.ts` now exist. **Four
defects make them non-functional. Fix these before anything else; do not apply migration 032 as written.**

The root cause of all four is the same: `public.notifications` (core schema `20260725_001`, lines 274-283) has
**only** these columns —

```
id, user_id, type, channel, message, status, meta, sent_at
```

**There is no `created_at` and no `updated_at`**, and `status` is CHECK-constrained to
`('pending','sent','failed')` — `'sending'` is **not** a legal value.

| # | Where | Defect | Result |
|---|---|---|---|
| 1 | `032` lines 82-83 | `CREATE INDEX … ON notifications (status, created_at)` | `42703 column "created_at" does not exist` |
| 2 | `notifications-worker.server.ts:85` | `.update({ status: "sending" })` | `23514 check_violation` |
| 3 | worker `:96,:128,:136` | writes `updated_at` | `42703` |
| 4 | worker `:73` | `.order("created_at")` | `42703` |

**Defect 1 is the dangerous one.** Supabase's SQL Editor runs a pasted multi-statement script as one implicit
transaction, so that single failing index **rolls back the whole of migration 032** — `delivery_phone`,
`wa_messages`, all of it. This is exactly the failure mode that bit migration `014` (the
`REVOKE`/`COMMENT` function-signature mismatch); the lesson from that session applies unchanged.

**The fix — add these to migration 032 §3 BEFORE the index statement:**

```sql
-- notifications predates the worker: it has no timestamps and its
-- status CHECK has no in-flight state. Both are needed before the
-- pending index and the claim-guard below can work at all.
ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Widen status to allow the claimed/in-flight state. Look the
-- constraint name up rather than trusting the auto-generated one:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.notifications'::regclass AND contype = 'c';
-- (it is almost certainly notifications_status_check).
ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_status_check
    CHECK (status IN ('pending','sending','sent','failed'));
```

Backfilled `created_at = now()` on pre-existing rows is historically wrong but harmless — none of those rows
were ever delivered (that is the §10.3 bug), and the worker only orders `pending` rows by it.

`sent_at` on line 77 of the migration is a **no-op**: it already exists in the base table. Harmless, but do not
mistake it for a new column.

**Verify before running, per the migration-014 lesson:** query `information_schema.columns` for
`notifications` on the real DB rather than trusting the migration filenames.

---

## 1. Hard constraints — verified, do not re-litigate

These were confirmed against Meta's own developer documentation and Infobip's WhatsApp docs on 2026-09-05.
**Do not design around a claim that contradicts these, however confident a vendor blog sounds.**

1. **A recurring UPI Autopay mandate CANNOT be authorised inside WhatsApp.** WhatsApp Payments in India supports
   one-time order payments only. NPCI separately requires the payer to enter their UPI PIN in their own UPI app.
   The mandate step therefore leaves WhatsApp — **once per subscription lifetime** — and that is acceptable and
   by design. Do not attempt a native in-chat mandate.
2. **WhatsApp's BBPS bill payments** (launched 2026-09-03) are for registered billers only. Out of scope.
3. **Every message this system sends is business-initiated** unless it falls inside the 24-hour service window
   opened by a customer message. Business-initiated sends require an **approved template**. Free-form text is
   legal only inside that 24h window. Enforce this in code (§6), not in documentation.

## 2. Scope

**Provider: Gupshup (self-serve tier).** Decided 2026-09-05 — see §2.1 for the reasoning and the trade-offs
that were accepted knowingly.

**In scope:** Gupshup WhatsApp integration, inbound webhook, outbound sender, one **static** WhatsApp Flow for
signup, identity resolution for new vs returning customers, `delivery_phone`, and three live bug fixes (§10).

**Not in scope, do not build:** a WhatsApp inbox UI (Gupshup's console provides it — see §9.3); dynamic /
pre-filled Flows (Phase 2 — see §7.2); "send proof to both payer and beneficiary" (Phase 2 — see §3.2);
Rail B / manual monthly payments (separate session); any change to commission logic; any change to
`is_admin()`; yearly plans.

### 2.1 Provider decision: Gupshup (self-serve tier)

Chosen 2026-09-05 by Chirayu, over Meta Cloud API direct. Reasoning, recorded so it is not re-argued:

- Gupshup's **self-serve tier has no monthly subscription** — wallet pre-pay only. BSP markup is ~₹0.085 per
  message on top of Meta's pass-through rate. At ~9,000 utility messages/month that is **~₹765/month**, which
  is not a meaningful cost at this stage.
- It supports **WhatsApp Flows via API**, and the Flow reply reaches our backend as an `nfm_reply` webhook —
  the same payload shape Meta Cloud API delivers. So the integration work below is provider-shaped, not
  provider-dependent.
- Its **agent inbox pulls the Phase-2 telecaller inbox forward at zero build cost**, and it supports multiple
  agents on one number.
- The deciding factor is dev bandwidth, not architecture: this project already carries a P0 stuck-pending
  issue, an unapplied migration `018`, and a 57-item confirmed bug list. Removing work is worth ₹765/month.

**Understand what this does NOT save.** Roughly 85% of this spec is identical under either provider: the
webhook endpoint, Flow-submission processing, `createCheckoutForUser` wiring, the notifications worker,
identity resolution, `delivery_phone`, `wa_messages`, and migration 032. Gupshup changes *which endpoint we
POST to* and supplies a console for templates and an inbox. Do not assume any section below can be skipped
because a BSP is in play.

**Accepted trade-off (Chirayu's call):** the Gupshup inbox sits outside our telecaller access-control model
(`requireTelecaller()` + field allowlist + `isInCallersTray()`), so a caller can see conversations for leads
outside her tray. At 1-3 telecallers with hospital-sourced (not inbound-random) leads this is acceptable.
Revisit if the team grows. **Narrower real gap:** replies she types directly into the Gupshup console will not
appear in `wa_messages`, so they are outside our audit trail — which matters only in a commission dispute.
Everything sent through our own backend is still recorded.

**Scaling note — do not "just add another account".** A second Gupshup account means a second WhatsApp number,
which splits the customer base across two brand numbers; customers who spoke to number 1 stay on number 1. The
scaling path is **more agent seats on one number**. Confirm seat pricing with Gupshup directly.

**Confirm with Gupshup before building:** that the self-serve tier (not just enterprise, ₹4,000-15,000/mo
minimum) supports what §5-§7 need. If dynamic-Flow endpoint configuration turns out to be enterprise-only,
that does not block Phase 1 — §7.2 deliberately needs only a static Flow.

---

## 3. Migration `20260905_032_whatsapp_funnel.sql`

### 3.1 `subscriptions.delivery_phone`

```sql
ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS delivery_phone text;

COMMENT ON COLUMN public.subscriptions.delivery_phone IS
    'WhatsApp number that receives the pooja video / Ashirwad Patra for THIS subscription. NULL = fall back to the account holder''s profiles.phone (existing behaviour).';
```

**Why on `subscriptions` and not `profiles`:** one account holder may hold two subscriptions with different
beneficiaries (e.g. his mother, and separately his in-laws) and therefore different delivery targets. The patra
and the video are already per-subscription.

**Why this column is needed at all:** `profiles.phone` currently does three jobs at once — login identity
(phone-OTP, UNIQUE), WhatsApp delivery target, and (with `alt_phone` as the escape) the dial number. Jobs 1 and 2
collide the moment a son's account holds his mother's sevas: the delivery should go to her, but the login must
stay his. Migration `024`'s own header anticipated "the WhatsApp number is a family member's" — that solution
only worked while the elderly person was the account holder. This column separates delivery from identity
properly. **`profiles.alt_phone` stays exactly as it is (calling number) — do not repurpose it.**

### 3.2 `wa_messages`

Stores every inbound WhatsApp message and every outbound send, so Phase 2 can render a thread without a
schema change, and so delivery is auditable now.

```sql
CREATE TABLE IF NOT EXISTS public.wa_messages (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    direction     text NOT NULL CHECK (direction IN ('in','out')),
    wa_message_id text,                     -- Meta's id; NULL until send returns
    phone         text NOT NULL,            -- E.164, the customer's number
    profile_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    lead_id       uuid REFERENCES public.leads(id) ON DELETE SET NULL,
    kind          text NOT NULL,            -- 'template' | 'text' | 'flow_reply' | 'interactive'
    template_name text,
    body          text,
    payload       jsonb,                    -- raw Meta payload, for reconstruction
    status        text NOT NULL DEFAULT 'received'
                      CHECK (status IN ('received','queued','sent','delivered','read','failed')),
    error         text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_messages_wa_id
    ON public.wa_messages (wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_messages_phone   ON public.wa_messages (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_profile ON public.wa_messages (profile_id, created_at DESC);
```

The partial UNIQUE on `wa_message_id` is the **idempotency guard** — Meta redelivers webhooks, and a redelivery
must not create a second row. Same discipline as the Razorpay webhook's `razorpay_payment_id` upsert.

### 3.3 `notifications` gets a delivery target and a worker contract

`notifications` currently has nothing that reads it. Give it what a sender needs:

```sql
-- ⚠️ The timestamp columns and the widened status CHECK from §0.1 MUST
-- come first, or the index below and the worker's claim-guard both fail.
ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS to_phone      text,
    ADD COLUMN IF NOT EXISTS template_name text,
    ADD COLUMN IF NOT EXISTS template_vars jsonb,
    ADD COLUMN IF NOT EXISTS attempts      int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_error    text;
    -- sent_at already exists in core schema 001 — do not re-add.

CREATE INDEX IF NOT EXISTS idx_notifications_pending
    ON public.notifications (status, created_at) WHERE status = 'pending';
```

`to_phone` NULL means "resolve at send time from the subscription / profile" — see §6.2.

Note `notifications.type` has **no CHECK constraint** — it is free text, currently carrying
`payment_link_sent`, `proof_resend_request`, and one value from `reissue-link.ts`. Keep new types in that
same snake_case style; do not add a CHECK now (it would need a migration every time a message type is added).

### 3.4 WhatsApp consent — MISSING ENTIRELY TODAY, and mandatory

A repo-wide grep for `opt_in / optin / consent / unsubscribe / opt_out / STOP` returns **nothing** related to
messaging. No table, no column, no code path records whether a customer agreed to be messaged on WhatsApp, and
nothing handles a STOP reply. **This is the largest gap in the original spec and it must not ship without it.**

Why it matters concretely for Punyata: leads arrive because someone handed a phone number to a field agent at
a hospital — that person never opted in to WhatsApp messaging. Sending business-initiated templates to
un-consented numbers is what drives block/report rates, and block/report rates are what Meta uses to set the
number's **quality rating**. A number that drops to low quality gets its daily send limit cut, which takes
down proof-video delivery for *every* subscriber, not just the new ones. One bad batch can degrade the whole
channel.

```sql
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS wa_opt_in_at     timestamptz,
    ADD COLUMN IF NOT EXISTS wa_opt_in_source text,   -- 'telecall' | 'website' | 'inbound_message'
    ADD COLUMN IF NOT EXISTS wa_opt_out_at    timestamptz;

COMMENT ON COLUMN public.profiles.wa_opt_in_at IS
    'When this person consented to WhatsApp messaging. NULL = never consented; business-initiated templates MUST NOT be sent.';
COMMENT ON COLUMN public.profiles.wa_opt_out_at IS
    'Set when they asked to stop. Non-NULL suppresses ALL business-initiated sends regardless of wa_opt_in_at.';
```

**Rules:**

1. **`sendWhatsApp()` refuses a template send when `wa_opt_out_at IS NOT NULL`, or when `wa_opt_in_at IS
   NULL`.** Enforce it in the send primitive (§6.1), not at call sites — one gate, impossible to forget.
   Transactional replies inside the 24h service window are exempt from the opt-in check (the customer started
   that conversation) but **never** from opt-out.
2. **Three ways consent is recorded**, all legitimate:
   - **Telecall** — the telecaller asks on the call ("WhatsApp par bhej dun?") and taps a control in her
     panel. This is the primary path for hospital-sourced leads. Record source `'telecall'` and her staff id
     in `audit_logs`.
   - **Inbound message** — if the customer messages us first, that is consent. Stamp it on webhook receipt.
   - **Website** — a checkbox at checkout, default unticked.
3. **Opt-out must be honoured automatically.** In the webhook (§5 step 4), match inbound text against a
   keyword list — `STOP`, `BAND`, `BAND KARO`, `BAND KARIYE`, `हटाओ`, `बंद`, `UNSUBSCRIBE` — case- and
   whitespace-insensitive. On match: set `wa_opt_out_at`, write an `audit_log`, flag the telecaller's person
   page, and send **one** plain confirmation inside the still-open 24h window. Never argue, never re-ask.
4. **Opting out of messaging is not cancelling the subscription.** Do not touch `subscriptions.status`. Flag
   it for the telecaller instead — a subscriber who cannot receive their pooja video needs a phone call, not
   a silent lapse.
5. **Existing subscribers have no recorded consent.** Do not bulk-migrate them onto API delivery. Roll the
   API sender out to newly-consented customers first; existing subscribers stay on the manual `wa.me` path
   (§9.1 keeps it) until the telecaller has collected consent on a call. Note this in your summary.

### 3.5 RLS

`wa_messages` is service-role only. **No telecaller grant, no user grant.** Add explicit
`REVOKE ALL ON public.wa_messages FROM anon, authenticated;` and enable RLS with no permissive policy, matching
the pattern used for staff-only tables in `012`/`013`. Access happens only through `/api/telecaller/*` and
`/api/admin/*` with the usual gates. Do the same for the new `notifications` columns — do not widen any
existing `notifications` policy.

---

## 4. Environment

Add to `.env` and to the deploy env (do **not** commit real values):

```
GUPSHUP_API_KEY=               # Gupshup apikey (self-serve)
GUPSHUP_APP_NAME=              # the Gupshup app/channel name
GUPSHUP_SOURCE_NUMBER=         # our WhatsApp business number, E.164 without '+'
GUPSHUP_WEBHOOK_SECRET=        # our own random string; see §5 on verification
WHATSAPP_FLOW_ID=              # the signup Flow's id, once published
```

Mirror the existing config pattern in `src/lib/config.server.ts`. A missing var must fail **loudly at first
use**, exactly like `razorpay.ts`'s `isConfigured()` — never silently no-op a send.

**Keep the provider behind one seam.** Put every Gupshup-specific detail (base URL, auth header, request
shape) inside `src/lib/whatsapp-send.server.ts` and `src/lib/whatsapp-webhook.server.ts` only. Nothing else in
the codebase should know the provider's name. This mirrors what `src/lib/gateways/` already does for payment
providers, and it is what makes a later move to Meta Cloud API direct a two-file change rather than a rewrite.

---

## 5. Inbound — `src/routes/api/whatsapp/webhook.ts`

Model it on `src/routes/api/payments/webhook.ts` (thin route) + `src/lib/razorpay-webhook.server.ts`
(all logic, testable). Create `src/lib/whatsapp-webhook.server.ts` the same way.

Gupshup POSTs inbound events to a callback URL configured in its console. Register
`https://<our-domain>/api/whatsapp/webhook`.

**POST** — in this order, and **never** reorder these:

1. **Authenticate the caller.** Gupshup's callback authentication differs from Meta's `X-Hub-Signature-256`;
   check what the Gupshup console actually offers for this app (signed header, basic auth, or a shared secret)
   and use it. If the only available mechanism is a shared secret, carry `GUPSHUP_WEBHOOK_SECRET` as an
   unguessable path segment or header and compare it **timing-safely**. Reject 401 on mismatch. **Do not ship
   an unauthenticated webhook** — this endpoint can create accounts and subscriptions.
2. **Return 200 fast.** Gupshup retries on non-200 and slow responses. Persist first, process after.
3. **Insert into `wa_messages`** (direction `in`). On unique-violation of `wa_message_id`, treat as an already
   handled redelivery and stop — do not process twice.
4. Route by payload type. Gupshup wraps the Meta payload, so read its current inbound-webhook documentation
   for the exact envelope — **do not guess field paths.** The three cases to handle:
   - an **`nfm_reply`** (Flow submission) → §7.3
   - a plain inbound **message** (text/button/image) → store only; set the "customer replied" flag (§9.2)
   - a **delivery status** event → update the matching outbound row's `status`
     (`sent`/`delivered`/`read`/`failed`)

**Hard rule, same as the Razorpay webhook:** a failure anywhere in step 4 must never turn into a non-200. Log
it, write an `audit_logs` row, return 200. A retry storm is worse than one dropped message.

**Do NOT** put subscription activation logic in this webhook. Activation stays Razorpay-webhook-only
(existing house rule: `subscriptions.status='active'` is webhook-driven-only).

---

## 6. Outbound — `src/lib/whatsapp-send.server.ts`

### 6.1 The send primitive

One function, gateway-style, minimal dependencies:

```ts
export async function sendWhatsApp(input: {
  toPhone: string;
  template?: { name: string; languageCode: string; vars: Record<string, string> };
  text?: string;                 // free-form; ONLY legal inside the 24h window
  profileId?: string | null;
  leadId?: string | null;
}): Promise<{ ok: true; waMessageId: string } | { ok: false; error: string }>
```

- Normalise `toPhone` through the **existing** `normalizePhoneForWa` — do not write a second phone parser
  (this repo already has one parser rule; honour it).
- Write the `wa_messages` row (direction `out`, status `queued`) **before** the HTTP call, then patch it with
  `wa_message_id` + `sent` on success or `failed` + `error` on failure. A crash mid-send must leave a trace.
- **Enforce the 24h rule in code:** if `text` is given, look up the most recent inbound `wa_messages` row for
  that phone. If it is older than 24h or absent, **refuse the send and return an error** — do not silently
  downgrade to a template, and do not send anyway. Callers must pass a template for business-initiated sends.
- Consult **Gupshup's current send-API documentation** for the exact endpoint and request body — **do not
  guess field names from memory.** Pin the base URL and any version in one constant at the top of the file.
- Gupshup distinguishes template sends from session (free-form) sends at the API level; map our `template` vs
  `text` inputs onto whichever calls it actually exposes, and keep that mapping inside this file.

### 6.2 The worker — `notifications` finally gets a reader

`notifications` has been write-only since it was created. Give it a processor at
`src/routes/api/cron/send-notifications.ts`, modelled on the existing `src/routes/api/cron/renew-mandates.ts`
(same gating, same shape):

- Select `status='pending'` ordered by `created_at`, small batch (50), with a claim update to `status='sending'`
  guarded by `.eq('status','pending')` so two concurrent runs cannot double-send (same race-guard idiom as
  `send-payment-link.ts`'s halted-row claim).
- Resolve the recipient: `to_phone` if set, else `subscriptions.delivery_phone` for the subscription in
  `meta`, else `profiles.phone` of `user_id`. **If none resolve, mark the row `failed` with a clear
  `last_error` — never skip silently** (this is exactly the bug being fixed in §10.1).
- Call `sendWhatsApp` with `template_name` + `template_vars`.
- On failure increment `attempts`; give up at 3 and leave `status='failed'` for an admin to see.

### 6.3 Templates to get approved (via the Gupshup console)

**Submit these on day one, before writing the calling code — template approval is the long pole of this whole
session.** Gupshup's console submits them to Meta on our behalf; approval latency is Meta's, not Gupshup's.

| Template | Category | Purpose |
|---|---|---|
| `punyata_plan_offer` | Marketing/Utility | Post-call: plan name + "Vivran bharein" Flow button |
| `punyata_returning_confirm` | Utility | Returning customer: previous names + confirm/change buttons |
| `punyata_payment_link` | Utility | The Razorpay link |
| `punyata_payment_pending` | Utility | 2h drop-off nudge |
| `punyata_subscription_active` | Utility | Confirmation after webhook activation |
| `punyata_mandate_halted` | Utility | Auto-pay failed + re-authorise link |
| `punyata_proof_ready` | Utility | Pooja video / Ashirwad Patra delivery |

Every template's variables must be positional and documented in a comment next to the constant that names it.
Categories affect billing — authentication-category templates are cheapest but must not be used for
non-authentication content; do not mis-categorise to save money.

**`punyata_plan_offer` is a MARKETING template, not Utility.** It promotes a plan to someone who has not
bought yet. Register it as Marketing and price it as such: Marketing is roughly **₹0.88** per message versus
**₹0.115** for Utility — about 7×. It also carries stricter opt-in expectations and can be suppressed by the
user's own marketing preferences. The §2.1 cost estimate covers Utility traffic only; add offers separately
(500 offers/month ≈ ₹440). Everything post-purchase — payment link, confirmation, halt alert, proof delivery
— is genuinely Utility and stays Utility.

**One language. Do not build a language switch.** `src/lib/translations.ts` is a **client-side React hook**
(`useLanguage()` reads `localStorage`, default `"hindi"`); it is unusable from server code, and the
customer's choice is never persisted server-side, so there is no per-customer language to honour even if you
wanted one. Every outbound string in the repo today is hardcoded Hinglish (`send-payment-link.ts:165`,
`sankalp-logic.ts:484`). Keep that: register each template **once**, in Hinglish, and match the registered
language code exactly in the send call — a mismatched language code is a hard send failure, not a fallback.
A per-customer language preference is a separate feature and needs a `profiles` column first.

### 6.4 Sending policy — limits, safety, and cost control

None of this was in the original spec. Each item is a real failure mode at this project's actual scale.

**Messaging tier will throttle batch proof delivery.** Meta assigns a WABA a daily business-initiated limit
(commonly 1,000 → 10,000 → 100,000 unique recipients/day, raised on good quality and volume). A new number
starts at the bottom. Proof delivery is inherently **bursty** — one pooja batch means one message per
subscriber, all at once. At 3,000 subscribers on a 1,000/day tier, **two-thirds of that batch silently
fails.** Therefore:
- The worker (§6.2) takes a `MAX_SENDS_PER_DAY` constant, defaulting **below** the current tier.
- Proof batches are **spread across days**, oldest-queued first, not fired in one sweep. The
  `notifications` queue already makes this natural — do not bypass it with a direct loop over subscribers.
- Surface remaining daily headroom on the proof-upload page so an admin sees "3,000 queued, ~1,000/day" and
  is not surprised.

**Test safety — build this before the first send.** There is no staging WABA. A bug in development that
messages real elderly subscribers is not recoverable. Gate the send primitive: when
`NODE_ENV !== 'production'`, `sendWhatsApp()` sends only to numbers in a `WHATSAPP_TEST_NUMBERS` allowlist
and logs-and-drops everything else. Fail closed — an unset allowlist in non-production means send nothing.

**Spend circuit breaker.** Gupshup is pre-pay from a wallet. A loop bug in the worker — a row that fails,
resets to `pending`, and is picked up again — can drain it fast. `attempts` capping at 3 (§6.2) handles the
per-row case; add a per-run and per-day global cap as the backstop, and refuse to send when the day's count
is exceeded rather than paging someone.

**Retention.** `wa_messages.payload` stores raw provider payloads containing phone numbers and message text.
That is deliberate (audit, idempotency, reconstruction), but it is personal data — do not expose it through
any telecaller or user endpoint (§3.5 already revokes it), and note in your summary that a retention/purge
policy is an open item, not something this session decides.

---

## 7. The signup Flow

### 7.1 Fields

One Flow, one screen where possible: `full_name`, `gotra`, family members (1-4: name + optional gotra +
optional relation), `address`, and `delivery_phone` (optional, labelled "pooja ka video kis number par bhejein?"
defaulting to the sender's own number).

Validation must mirror `src/lib/family-validation.ts` **exactly** — 1-4 members, slots 1-4 unique, name ≥ 2
chars, gotra ≤ 60, relation ≤ 40. Do not write a second validator; the Flow's client-side rules are a courtesy,
and `validateFamilyMembers()` on the server stays the boundary.

### 7.2 Flow JSON — STATIC only in Phase 1

Author it once, store it in-repo at `whatsapp/flows/signup.flow.json` so it is reviewable and versioned.
Consult Meta's current Flow JSON schema documentation for exact syntax — **do not invent it**. Publish it
through the Gupshup console and put the resulting id in `WHATSAPP_FLOW_ID`.

**Use a STATIC Flow. Do not build a dynamic Flow in this session.** A dynamic Flow (server-supplied screen
content at runtime) requires a data-channel `endpoint_uri` registered on the Meta Business Manager side plus a
Gupshup support ticket to wire it up — a live external dependency on someone else's queue. Phase 1 does not
need it:

- **New customer** → static Flow, empty form. This is the common case.
- **Returning customer** → does not open a Flow at all. They get the `punyata_returning_confirm` template with
  two buttons (§8.2); "Haan, yahi rakhein" copies the previous family rows server-side and goes straight to
  payment.
- **Returning customer who taps "Badalna hai"** → open the same static Flow, empty. They retype. This is a
  rare branch; accept the friction rather than take the dependency.

Pre-filled/dynamic Flows are Phase 2, and only if that last branch turns out to be common.

### 7.3 On submission

The Flow reply arrives at the webhook (§5, step 4). Then, **in this order**:

1. Resolve identity (§8).
2. `validateFamilyMembers()` server-side. On failure, send a template asking them to retry — never persist a
   half-valid family set.
3. Upsert `profiles` (name, address; **never** overwrite `phone`).
4. Call the **existing** `createCheckoutForUser()` — do not write a parallel checkout path. Pass
   `acquisitionChannel: 'whatsapp'`, plus `telecallerId` / `salesAgentId` resolved from the attribution token
   carried in the Flow's `flow_token` (§8.3).
5. Write `family_members` for the new subscription and `delivery_phone` on it.
6. Queue `punyata_payment_link` into `notifications`.

**Guard against double submission.** A customer can tap the Flow button twice, or submit and then resubmit
before the first reply lands — that would create two subscriptions and two mandates for one person. The
webhook's `wa_message_id` guard (§5 step 3) only stops *provider redelivery of the same message*; two genuine
submissions are two different message ids and slip straight through. Before step 4, check for an existing
`pending` subscription for the resolved profile and reuse it (this is the same reuse path as §10.2) rather
than creating a second. Add a `verify_*` case for it.

**How the pooja video actually reaches them** — settled, do not redesign: the video is a **Cloudinary URL**
stored in `name_segments.video_url` (one combined segment video; `message_kind='common'` was retired by
migration `005`, so there is exactly one video per subscriber per batch). Today `buildDeliveryMessage()`
puts that URL as **plain text inside the message**, and `proof_deliveries.wa_link` holds the pre-built
`wa.me` link. Keep the URL-in-text approach for `punyata_proof_ready` — pass it as a template variable. Do
**not** switch to WhatsApp media upload: the videos are hand-edited and uploaded with no size cap anywhere in
the repo (`accept="video/*"` is the only constraint), so they can easily exceed WhatsApp's media limits,
whereas a Cloudinary link always works. If a template variable containing a URL is rejected at approval,
shorten it behind our own domain rather than abandoning the approach.

---

## 8. Identity resolution — the core of this session

### 8.1 The rule

Meta hands us a **verified** phone number (`wa_id`) on every inbound message. That number is the key:

```
normalizePhoneE164(wa_id) → look up profiles.phone (already UNIQUE, migration 001)
  found     → RETURNING customer
  not found → NEW customer
```

**A returning customer must never be asked for their name, address, or phone again.** This is not a new
feature — the schema already supports it. Implement it as the first branch of Flow dispatch, not as an
afterthought.

### 8.2 What a returning customer is still asked

`family_members` is scoped to `subscriptions`, not `profiles` — so a *new* subscription genuinely needs them.
**Do not make them retype it.** Read the most recent prior subscription's `family_members` for that
`user_id`, render them in a `punyata_returning_confirm` template with two buttons:

- **"Haan, yahi rakhein"** → copy those rows onto the new subscription verbatim, skip the Flow entirely, go
  straight to the payment link.
- **"Badalna hai"** → open the same **static, empty** Flow; they retype. (An earlier draft said "pre-filled"
  here — that contradicted §7.2 and is wrong for Phase 1. Pre-filling needs a dynamic Flow, which is
  deliberately deferred.)

### 8.3 Attribution must survive

The telecaller's send must carry the lead's `attribution_token` into the Flow as the `flow_token`, and it must
come back on submission. Resolve it exactly the way `create-checkout.ts:67-76` already does — lead →
`assigned_to`/`created_by` = telecaller, `source_agent_id` = field agent — and pass both into
`createCheckoutForUser`.

**Commission logic must not be touched in this session.** It rides on `subscriptions.telecaller_id` /
`sales_agent_id`, which are stamped write-once at checkout creation and are indifferent to who paid or which
channel was used. If you find yourself editing `commission-logic.ts`, stop — you have gone out of scope.

### 8.4 The auth user, and why the phone format is the highest-risk line in this session

**Correction to an earlier draft of this spec:** you **must** create an `auth.users` row on the WhatsApp path.
There is no way around it — `profiles.id` mirrors `auth.users.id`, and `subscriptions.user_id` is a NOT NULL FK
to it, so no subscription can exist without one. Create it via the Supabase admin API at Flow-submission time
(§7.3 step 3).

**⚠️ THIS IS WHERE THIS PROJECT HAS ALREADY BEEN BURNED TWICE.** `requestOtpForPhone` in `auth.server.ts`
decides "new or existing customer" by looking up `profiles` **by phone string**. This codebase has produced
duplicate accounts twice from exactly that lookup:

- 2026-08-23: a `profiles` row with `phone = NULL` meant an OTP login created a brand-new row instead of
  matching the existing one.
- 2026-08-30: a phone stored as bare `8005828548` did not match a later OTP login normalising to
  `+918005828548`, creating a **second** row for the same person. Two live owner rows resulted.

A WhatsApp funnel that writes phone numbers is the same hazard at customer scale. Therefore:

- The auth user **must** be created with its phone set, in **exactly** the E.164 form
  `normalizePhoneE164()` produces. Never a bare 10-digit string, never NULL, never a placeholder.
- `profiles.phone` must carry the identical string. Write it through `normalizePhoneE164()` — never from the
  raw `wa_id`, which arrives without a `+` and will not match.
- Before creating anything, look up by the **normalised** value. If a row exists, adopt it (§8.1); never
  insert alongside it.
- Add a `verify_*` case asserting that a `wa_id` such as `918005828548` resolves to the *same* profile a
  website OTP login with `8005828548` would reach. This single test is the guard against repeating the bug.

**Do NOT mint sessions, tokens, or magic links from the WhatsApp path.** WhatsApp identifies a person; it does
not authenticate a browser session. A one-tap login link would be genuinely nicer UX — and is exactly wrong
here, because **forwarding a WhatsApp message is normal behaviour in this customer base** (a subscriber
handing the link to her son is the documented common case, §5 of the scenarios doc). A forwarded magic link is
an account takeover. The customer logs in on the website with the existing phone-OTP or Google flow, once.

**Google-login caveat, unresolved by design:** per `SESSION_GOOGLE_LOGIN_PROMPT.md` this project does **no
account merging**. A customer onboarded via WhatsApp (phone) who later signs in with Google will land on a
separate row unless that Google account's profile carries the same normalised phone. Do not attempt to build
merging in this session — but surface any such collision in `audit_logs` so it is visible rather than silent.

### 8.5 The three numbers — one job each, and the rules that keep them apart

After this session a customer can have three different numbers on file. Confusing them is how identity bugs
get created, so each has exactly one job and they are never substituted for one another:

| Column | Job | Scope | Unique? |
|---|---|---|---|
| `profiles.phone` | **Identity.** Login (phone-OTP), and the number they WhatsApp us from | per person | **YES** (migration 001) |
| `subscriptions.delivery_phone` | **Sevas.** Pooja video, Ashirwad Patra go here | per subscription | **NO — never add UNIQUE** |
| `profiles.alt_phone` | **Dialling.** The number the telecaller calls | per person | **NO — never add UNIQUE** |

NULL in either of the last two means "fall back to `profiles.phone`". That keeps every existing row correct
without a backfill.

**Rules — each of these prevents a specific, real failure:**

1. **Only `profiles.phone` is ever an identity.** No lookup, login path, or dedupe check may fall back to
   `alt_phone` or `delivery_phone`. An alternate number must never be able to reach an account.
2. **Never put a UNIQUE constraint on `alt_phone` or `delivery_phone`.** Sharing them is normal and expected —
   a husband and wife may hold separate subscriptions with both videos going to the same son's number. A
   UNIQUE index would make the second subscription fail with a confusing error.
3. **Normalise all three through `normalizePhoneE164()` on every write.** Same hazard as §8.4: a
   `delivery_phone` stored as bare 10 digits produces a broken send target, and it will fail silently at the
   worst possible moment — the month a customer is waiting for their pooja video.
4. **Inbound WhatsApp matches on `profiles.phone` only.** If a son messages from a number that is somebody's
   `delivery_phone`, he is **not** that customer and must not be treated as logged in. But do help the
   telecaller: search `alt_phone` and `delivery_phone` for **display only** and show a hint —
   *"Yeh number Kamla Devi ke account se juda hai"* — as a lead, never as authentication.
5. **A failed send to `delivery_phone` must be visible.** That number may not have WhatsApp at all; this is
   not verifiable up front. The worker (§6.2) marks it `failed` with a reason, and it must surface on the
   telecaller's person page so she can call and correct it.

**Flow design — do NOT ask for all three at signup.**

- `profiles.phone` — never asked. It arrives verified from WhatsApp.
- `delivery_phone` — **one optional field at the end of the signup Flow**, phrased in customer language
  ("Pooja ka video kis WhatsApp number par bhejein?") and pre-filled with their own number. It belongs here
  because the third-party-payer case (son enrolling his mother) is decided at signup, by the son, who knows
  her number.
- `alt_phone` — **not in the Flow at all.** It is a telecaller panel field. She discovers the need on a call
  ("mujhe mat call kariye, mere bete ko kariye") and records it there. Asking every customer for a second
  number at signup costs conversion for a case most of them do not have.

Existing `/complete-profile` already asks the WhatsApp-vs-calling question (migration 024); leave that page's
behaviour alone, just make sure it writes through the same normaliser.

**Out of scope, note it and move on:** a customer changing their primary number (new SIM) is an identity
change requiring OTP on the new number, and is a support flow. Do not build it here.

---

## 9. Telecaller panel

### 9.1 One-click send

`send-payment-link.ts` keeps its current contract and gating (`requireTelecaller`, `isInCallersTray`,
tray/lead/target match checks, halted-row retirement, audit row). Change only the tail: instead of returning a
`waLink` for her to click, **queue the `notifications` row and let the worker send it**. Keep returning
`shareLink` so the panel can still show/copy it, and keep `waLink` as a manual fallback for when the API send
fails — do not delete that path.

### 9.2 "Customer replied" flag

When an inbound text arrives (§5, step 4), surface it on her existing lead/person pages — a badge and a
timestamp, nothing more. **She calls them.** That is the workflow; do not build a reply box in this session.

### 9.3 Chat — use Gupshup's inbox, build nothing

Two-way chat happens in the **Gupshup agent console**, not in our panel. Do not build a thread view or a reply
box in this session. Give each telecaller her own Gupshup agent seat (one number, multiple seats — never a
second Gupshup account, see §2.1).

Her workflow stays phone-first: the badge in §9.2 tells her a customer replied, and she calls. The Gupshup
inbox is there for the cases where a reply is genuinely faster than a call.

**Known gap, accepted:** replies she types into the Gupshup console do not pass through our webhook, so they
will not appear in `wa_messages` and are outside our audit trail. Everything our backend sends is still
recorded. If a commission dispute ever hinges on "maine convince kiya tha", that evidence lives in Gupshup, not
in `audit_logs`. Building our own tray-gated thread view (Phase 2) is what closes this — do it only if the
team grows past ~3 telecallers or a dispute actually occurs.

---

## 10. Live bugs to fix in this session

### 10.1 Silent proof-delivery skip — `admin.proof-upload.tsx:972`

```ts
if (!sub || !profile?.phone) continue;
```

A subscriber with no phone is silently dropped: no `proof_deliveries` row, no warning, no count. Nobody ever
learns that customer got no video that month. **Fix:** still skip the send, but surface it — collect the skipped
subscriptions and render a visible "N subscribers ka number nahi hai — inko video nahi jayega" panel with the
list, so it becomes a work item instead of a silent hole.

While here, change the recipient resolution to prefer `subscriptions.delivery_phone` and fall back to
`profiles.phone`.

### 10.2 Orphaned pending subscriptions

`createCheckoutForUser` looks up `existingPending` by user. When a telecaller pre-creates a pending subscription
under person A's `user_id` and person B (e.g. the son) converts under his own `user_id`, A's row is never found
and is stranded as `pending` forever — feeding the known stuck-pending problem. Ensure the WhatsApp path reuses
the pending row when the resolved profile matches.

**Correction to an earlier draft: there is no checkout-TTL "sweep".** `src/lib/checkout-ttl.ts` exports only
`PENDING_REUSE_WINDOW_MINUTES = 3` and `pendingCheckoutIsStale()`, and both callers
(`subscriptions-checkout.server.ts:293`, `my-subscription.tsx:267`) are **lazy and inline** — a stale row is
only cleaned when *that same user returns and requests checkout again*. A customer who never comes back leaves
a `pending` row forever. Nothing in the repo expires them in the background.

WhatsApp makes this worse, because the funnel creates pending rows for people who may never tap the link. So:
**do not claim the TTL covers this.** Either (a) leave it and note the growth explicitly in your summary, or
(b) add a background expiry — but if you add one, it belongs in a separate session with the existing P0
stuck-pending work, not bolted on here. Do not invent a second TTL constant either way.

(Unrelated but worth fixing while you are in there: `admin.subscribers.tsx:117` has a comment claiming the
reuse window is 20 minutes. It is 3. Correct the comment.)

### 10.3 `notifications` write-only

Fixed by §6.2. After this session, assert it: a repo grep for `from("notifications")` must show at least one
**read**. Note in your summary that the two existing inserts now actually deliver — and that anything they
recorded before this session was never sent.

---

## 11. House rules that must survive this session

- `subscriptions.status = 'active'` is set by the **Razorpay webhook only**. The WhatsApp webhook never sets it.
- `public.is_admin()` is not widened. `telecaller` remains a sibling role with zero direct RLS grants.
- No coupon codes anywhere in the telecaller/agent flow.
- The telecaller never sees another person's earnings, company revenue, other subscribers' amounts, or Razorpay
  ids. `stripMaskedFieldsDeep` still applies to every response she receives.
- She never asks a customer for an OTP, and no OTP field appears anywhere in her panel.
- `profiles.phone` is not writable by a telecaller.
- One phone parser (`normalizePhoneE164` / `normalizePhoneForWa`), one family validator
  (`validateFamilyMembers`), one checkout creator (`createCheckoutForUser`). Do not add a second of any.

---

## 12. Verification

Pure logic goes in `*-logic.ts` with `verify_*` coverage, matching the existing convention:

1. `verify_whatsapp_identity.ts` — new vs returning resolution: unknown number → NEW; known number →
   RETURNING with prior family members returned; **and the critical one (§8.4): a `wa_id` of `918005828548`
   must resolve to the same profile that a website OTP login with `8005828548` reaches — one row, not two.**
   Cover `+91`-prefixed, bare-10-digit, and leading-zero inputs.
2. `verify_whatsapp_window.ts` — free-form send refused with no inbound message, refused at 24h+1min, allowed
   at 23h59m.
3. `verify_notifications_worker.ts` — recipient resolution order (`to_phone` → `delivery_phone` →
   `profiles.phone` → `failed`, never silent skip); claim guard prevents double-send; `attempts` caps at 3;
   the daily cap refuses rather than sends.
4. Webhook idempotency — the same provider message id delivered twice produces one row and one side effect.
5. Webhook authentication — an unauthenticated or tampered request is rejected 401.
6. `verify_whatsapp_consent.ts` — a template send is refused when `wa_opt_in_at IS NULL`; refused when
   `wa_opt_out_at IS NOT NULL` **even if opt-in is set**; a free-form reply inside the 24h window is allowed
   without opt-in but still refused after opt-out; each opt-out keyword (`STOP`, `BAND`, `BAND KARO`, `बंद`,
   `UNSUBSCRIBE`, mixed case, surrounding whitespace) sets `wa_opt_out_at` and does **not** touch
   `subscriptions.status`.
7. Flow double-submit — two genuine submissions for the same profile produce **one** subscription, not two.
8. Returning-customer copy-forward — "Haan, yahi rakhein" reproduces the previous subscription's
   `family_members` exactly (names, gotra, slot numbers) onto the new subscription.
9. Non-production send guard — with `NODE_ENV !== 'production'` and an empty allowlist, `sendWhatsApp()`
   sends nothing and returns a clear error.

**Manual, before going live — do not skip this one:** send a real payment link to a real WhatsApp account and
complete an actual ₹399 mandate **on an Android phone and on an iPhone**. Confirm the link opens, the UPI app
launches from WhatsApp's in-app browser, the PIN screen appears, and the Razorpay webhook activates the
subscription. WhatsApp's in-app browser handing off to a UPI app is the one step in this whole design that has
not been verified for this stack — if it fails, the fix is to force the link into the system browser, and it is
far cheaper to learn that now than after launch.

---

## 13. Gupshup-specific gotchas to plan around

Reported consistently in third-party reviews (G2 and pricing audits) as of 2026-09-05. None are blockers;
all are cheaper to know now:

- **Wallet lock-up.** Self-serve is pre-pay and unused balance is not refunded. Top up in small amounts until
  monthly volume is known; do not park a large float.
- **Price changes with little notice.** Track actual per-message spend monthly (the `wa_messages` table makes
  this a one-query report) so a markup change is noticed rather than absorbed silently.
- **Self-serve support is slow.** Anything needing a support ticket — notably dynamic-Flow endpoint
  configuration — is on someone else's queue. This is exactly why §7.2 keeps Phase 1 on a static Flow.
- **Template rejections.** Expect at least one round. Submit all seven (§6.3) on day one, and keep the copy
  plain and transactional; anything that reads like marketing in a Utility-category template gets rejected.
- **Do not mis-categorise templates to save money.** Authentication-category rates are the cheapest but must
  carry authentication content only. Mis-categorisation risks the number's quality rating, which is far more
  expensive than the saving.

Keep the provider seam from §4 intact. If any of the above turns painful, moving to Meta Cloud API direct
should be a two-file change plus a WABA migration — not a rewrite.

## 14. What to report back

- **First: confirmation that all four §0.1 defects are fixed**, and the output of the
  `information_schema.columns` check on `notifications` proving `created_at`/`updated_at` exist and the
  status CHECK accepts `'sending'`, **before** migration 032 is applied.
- Which files you created vs modified, and whether §0's reality check still matched.
- The Flow JSON as published, and each template's approval status — including which category Meta actually
  approved `punyata_plan_offer` under.
- Confirmation that commission logic was **not** touched.
- The current WABA messaging tier, and what `MAX_SENDS_PER_DAY` was set to (§6.4).
- Confirmation that the non-production send allowlist is in place and fails closed.
- Anything in §1 that a vendor doc contradicted — with the source — rather than acting on it unilaterally.

---

## 15. Review log

**2026-09-05 — full adversarial review against the live repo.** Findings folded in above rather than listed
separately, so this section records only what changed and why:

- **§0.1 added.** Four blocking defects found in already-written code, all rooted in `notifications` lacking
  `created_at`/`updated_at` and its status CHECK not allowing `'sending'`. Migration 032 as written fails and
  rolls back entirely.
- **§3.4 added — WhatsApp consent.** The single largest gap. Nothing in the codebase records opt-in or
  handles opt-out; hospital-sourced leads have not consented to messaging, and un-consented sends degrade the
  number's quality rating for every subscriber.
- **§6.3 corrected.** `punyata_plan_offer` is Marketing (~7× Utility pricing), not "Marketing/Utility". One
  language only — `translations.ts` is a client-side React hook and cannot serve outbound copy.
- **§6.4 added.** Messaging-tier throttling (bursty proof batches vs a 1,000/day starting tier), a
  non-production send allowlist, a spend circuit breaker, and a note that payload retention is unresolved.
- **§7.3 extended.** Flow double-submit guard, and the settled answer on video delivery (Cloudinary URL as a
  template variable — never WhatsApp media upload, since the repo caps video size nowhere).
- **§8.2 corrected.** Said "pre-filled" where §7.2 mandates a static, empty Flow. Contradiction removed.
- **§10.2 corrected.** The original text claimed an existing "checkout-TTL sweep" covers orphaned pending
  rows. **There is no sweep** — `checkout-ttl.ts` is lazy and inline (`PENDING_REUSE_WINDOW_MINUTES = 3`),
  cleaning only when the same user returns. WhatsApp makes the leak worse; the honest options are stated.
- **§12 extended** from 5 verification cases to 9.
