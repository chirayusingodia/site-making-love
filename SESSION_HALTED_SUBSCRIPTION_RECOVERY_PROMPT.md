# 🕉️ PUNYATA — Session: Halted Subscription Detection + Recovery

**For:** OpenCode + Kimi K3 (or oxAlpha — model-agnostic) · **Prepared by:** Chirayu (via Claude) · **Date:** 2026-08-23
**Follows:** `SESSION_TENURE_AND_OTP_ABUSE_PROMPT.md` (tenure fix — `total_count=1200`/`100` — check whether that
landed; if `subscriptions-checkout.server.ts` still has `TOTAL_COUNT_MONTHLY = 12` / `TOTAL_COUNT_YEARLY = 5`,
flag it back, it's a separate open item, not in scope here).
**Migration:** next is `20260823_015_halted_subscriptions.sql` — builds on migrations up to `014`
(hospitals + performance). Read `SESSION_HOSPITALS_ATTRIBUTION_PERFORMANCE_PROMPT.md` first if unfamiliar with
the current lead/agent/telecaller model — this session reuses it, doesn't replace it.

---

## 0. Repo reality check first (do this before writing code)

This is a gap-closing session, not greenfield. Before touching anything, confirm these three files still look
like this (they did as of 2026-08-23) — if any diverged, adjust the plan below accordingly and say so in your
summary rather than silently working around it:

- `src/lib/razorpay-webhook.server.ts` — `SUPPORTED_EVENTS` (around line 30) lists `subscription.activated`,
  `subscription.charged`, `subscription.payment.failed`, `subscription.paused`, `subscription.resumed`,
  `subscription.cancelled`, `subscription.completed`. **`subscription.halted` is absent.**
- `src/lib/razorpay.server.ts` — only exports `createRazorpaySubscription`. No resume/fetch call exists.
- Repo-wide grep for `resume`/`halt` (case-insensitive) across `src/` returns exactly one hit: the
  `subscription.resumed` string inside `razorpay-webhook.server.ts`'s event list. There is no UI, no API route,
  and no admin/telecaller action anywhere that reactivates a subscription.

## 1. The problem, precisely

Two independent "give up" mechanisms exist and only one of them is wired up:

1. **Our own counter** (already built, working correctly): `processWebhookEvent` counts consecutive `failed`
   rows in `payments` per subscription and demotes `subscriptions.status` from `active` → `pending` at
   `FAILURE_DEMOTE_THRESHOLD = 3`. This is us noticing failures ourselves.
2. **Razorpay's own counter** (not wired up at all): after Razorpay's own retry schedule is exhausted, Razorpay
   moves the subscription to `halted` on its side and POSTs a `subscription.halted` webhook event. Because that
   event string isn't in `SUPPORTED_EVENTS`, `processWebhookEvent` returns `ignored_unsupported_event` and
   **nothing is written anywhere** — not to `subscriptions`, not to `audit_logs`. The event is acknowledged
   (200 OK, so Razorpay stops retrying delivery) and then thrown away.

Consequences: (a) our `pending` status and Razorpay's real `halted` state can disagree — a subscriber can be
sitting fully halted on Razorpay's side while our DB still shows `pending`, with nobody flagged to act; (b) even
if we did record it, there is no way in the product today to bring a halted subscriber back — it requires
someone manually opening the Razorpay dashboard.

## 2. Fix, part A — record the halt (schema + webhook)

**Migration `20260823_015_halted_subscriptions.sql`:**
- Widen the `subscriptions.status` CHECK constraint (currently
  `CHECK (status IN ('pending','active','paused','cancelled','expired'))` in `20260725_001_core_schema.sql`,
  line ~196) to add `'halted'`:
  `CHECK (status IN ('pending','active','paused','cancelled','expired','halted'))`.
  Use `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ...` (name the constraint explicitly rather than
  relying on Postgres's auto-generated name — `\d subscriptions` on a real DB first to get the exact name, or
  make the migration tolerant of the auto-generated name via `information_schema` lookup if you can't confirm it
  ahead of time).
- Add `halted_at timestamptz` column to `subscriptions` (nullable), mirroring the existing `paused_at` /
  `cancelled_at` pattern — same style, same nullability.
- No RLS change needed: `'active'` is still the only status a webhook can set that unlocks anything; `'halted'`
  is a strictly more restrictive state than `'pending'`, so existing policies that gate on `status = 'active'`
  are unaffected. Confirm this by grepping existing RLS policies for `status` before finishing — don't assume.

**`src/lib/razorpay-webhook.server.ts` changes:**
- Add `"subscription.halted"` to `SUPPORTED_EVENTS`.
- Add a case to `subscriptionPatchForEvent`: `case "subscription.halted": return { status: "halted",
  halted_at: nowIso };` — add `halted_at` to the `SubscriptionPatch` interface alongside `paused_at`/
  `cancelled_at`.
- Add `"halted"` to the `ProcessResult["action"]` union and the ternary chain in `processWebhookEvent` that maps
  event → action string, same pattern as the other five status-patch events.
- **Do not touch the existing 3-failure `pending` demotion logic** — it stays exactly as is. `halted` and
  `pending` are two different signals (ours vs Razorpay's) and both should be recorded; do not try to merge them
  into one threshold or make one override the other. If a subscription is already `pending` from our own
  counter and then a `subscription.halted` event arrives, let the halt patch apply on top — `halted` is a more
  final signal than our own guess, and the webhook log line will show `previous_status: "pending"` in
  `audit_logs.meta`, which is exactly the reconstructability the existing audit-row comment says this file is
  for. No guard needed here (contrast with the `.eq("status", "active")` guard on the failure-demotion path,
  which exists to avoid stomping `paused`/`cancelled` — halted coming from Razorpay itself is authoritative and
  should not be similarly gated).
- Existing idempotency guarantees (upsert on `razorpay_payment_id`, set-valued status patches) already cover
  this new event without extra work — a replayed `subscription.halted` delivery just re-writes the same status
  and a fresh timestamp, which is fine.

## 3. Fix, part B — resume (mandate still valid)

**`src/lib/razorpay.server.ts`:** add one function, same minimal-dependency style as
`createRazorpaySubscription`:

```ts
export function resumeRazorpaySubscription(razorpaySubId: string): Promise<RazorpaySubscription> {
  return razorpayCall<RazorpaySubscription>(`subscriptions/${razorpaySubId}/resume`, {});
}
```

Razorpay's resume endpoint is `POST /v1/subscriptions/:id/resume` with an empty (or `{}`) body — confirm
against Razorpay's current Subscriptions API docs before shipping, don't assume the shape is unchanged from
what's documented here.

**New route `src/routes/api/admin/subscriptions/resume.ts`** (owner + admin gated — this touches money-adjacent
state, so do NOT expose it to `requireTelecaller`; she gets the mandate-dead fallback in Part C instead, never
a raw resume button):
- `POST { subscription_id }`.
- `requireAdmin(request)` — same gate as `admin.commissions`/`admin.reports`.
- Look up the subscription row, confirm `status === 'halted'` (reject with a clear message if it's any other
  status — this endpoint is not a general "make active" button).
- Call `resumeRazorpaySubscription(sub.razorpay_sub_id)`.
- **Do NOT set `status = 'active'` in this code.** The activation-discipline rule from
  `razorpay-webhook.server.ts`'s own header comment ("no other server route does it") stays intact — a
  successful resume call just tells Razorpay to try charging again; the `subscription.resumed` (already
  supported) or `subscription.charged` webhook event is what flips status back to `active`, same as every other
  transition in this product. This route only calls Razorpay and writes an audit log
  (`admin.subscription.resume_attempted`); it does not touch `subscriptions.status` at all. If the resume call
  itself fails (e.g. Razorpay rejects because the mandate is actually dead), return that error to the caller
  verbatim so the admin knows to fall back to Part C.

**Admin UI (`src/routes/admin.subscribers.tsx`):**
- Add `halted` to `StatusBadge`'s `map` (around line 197) — pick a visually distinct color from `paused` (e.g.
  rose/red, since this is more urgent than a voluntary pause) and an icon that reads as "stopped," not
  "cancelled" (this is recoverable, cancelled is not).
- In the subscription 360 view (`Section title="Subscription Record"`, around line 510-539), add a
  `sub.status === "halted"` block mirroring the existing `paused`/`cancelled` conditional blocks, showing
  `Halted At` (`fmtDate(sub.halted_at)`).
- Add a "Resume Subscription" button visible only when `sub.status === 'halted'`, calling the new
  `/api/admin/subscriptions/resume` route, with a loading/disabled state and a toast/inline result showing
  Razorpay's response (success → "Resume requested — status updates once Razorpay confirms"; failure → show the
  error and point at the mandate-dead fallback below).
- Add a filter/segment for `halted` subscribers to whatever subscriber-list filtering already exists in this
  file, so this isn't something an admin has to stumble into via the 360 view — it should be a list they can
  pull up on demand (mirrors the existing "Sankalp Pending" filter pattern already in this file per project
  memory — same idea, new status).

## 4. Fix, part C — mandate is dead, resume won't work

Resume only works while the underlying UPI/card mandate is still alive. When it isn't (expired card, revoked
UPI Autopay), Razorpay's resume call fails and the only path forward is a fresh subscription + new checkout link
— this is not a bug to route around, it's how Razorpay works.

- On a resume failure in the admin UI (Part B), surface a secondary action: "Send New Payment Link" — reuse the
  **existing** `/api/telecaller/send-payment-link` flow (`src/routes/api/telecaller/send-payment-link.ts`) rather
  than building a second checkout-link generator. That route currently requires `requireTelecaller`; either (a)
  add `requireAdmin` as an accepted caller (owner/admin should be able to trigger the same flow the telecaller
  panel uses, this is not agent-attribution-sensitive when an admin does it directly), or (b) add a thin
  admin-side route that calls the same underlying `createCheckoutForUser` directly with no `salesAgentId`/
  `telecallerId` (organic re-signup, credits nobody, per the existing attribution rule "Organic self-signups
  credit NOBODY" in project memory) — prefer (b), it's cleaner and doesn't risk loosening telecaller-flow gating
  for an unrelated caller.
- Before creating the new subscription, mark the old halted one `cancelled` (with a `cancel_reason` like
  `"mandate_dead_reissued"`) so the subscriber doesn't end up with two subscription rows both looking live in
  reports — this matters for the owner performance leaderboard (`performance-logic.ts`) which sums active books;
  a stale halted-but-uncancelled row sitting around would double-count or confuse "active book size" per
  telecaller/agent.
- Same "Send New Payment Link" affordance should be reachable from the telecaller's own panel
  (`telecaller.person.$subscriptionId.tsx`) for a halted subscription that's HERS (in her tray) — she doesn't
  get the raw Resume button (Part B, admin/owner only), but re-sending a link for a subscriber she's already
  working is exactly the kind of follow-up her role exists for, and the existing send-payment-link route already
  does the tray-membership check (`isInCallersTray`) so this is additive, not a new gate to design.

## 5. Owner performance leaderboard — don't let this silently skew numbers

`performance-logic.ts` / `performance-data.server.ts` (from the hospitals+perf session) compute active book
size, churn, and revenue per telecaller/agent/hospital. Before this session, a halted subscription had no
distinct status, so it either read as `pending` (undercounting active books incorrectly) or, if nothing updated
it, silently stayed `active` (overcounting revenue that isn't actually coming in). Check whichever of those two
it currently does in practice (log a few real halted-candidate rows, or reason from the webhook code) and:
- Confirm `active book size` / churn calculations exclude `halted` the same way they already exclude `paused`
  and `cancelled` — a halted subscriber is not being billed and should not count as active, but should also not
  count as churned/cancelled outright (it's still recoverable, distinguish it if the leaderboard cares about
  that distinction; if it doesn't currently split paused vs cancelled either, treat halted the same as paused
  for now and flag the finer distinction as a follow-up, don't over-build this session).

## 6. Confirmed Razorpay halt mechanics (verified 2026-08-23, don't re-guess)

- Razorpay's own retry window is roughly **3 days**: it attempts the charge on the due date (T+0), retries at
  T+1, and again around T+2/T+3. If all of those fail, it moves the subscription `pending` → `halted` and fires
  `subscription.halted`. This is a fixed ~3-day clock, not an open-ended number of attempts — useful context for
  judging how quickly our own `FAILURE_DEMOTE_THRESHOLD = 3` counter is likely to track (or diverge from)
  Razorpay's halt, though the two are still driven by different signals and should stay separately recorded per
  Part A above.
- **No auto-catchup, this matters for sevas:** when a halted subscription resumes, Razorpay does **not**
  retroactively charge for the cycles that were missed during the halt — it only bills forward from the resume
  point. Concretely: if `sankalp-logic.ts`'s batch generation (or any other seva-scheduling path) is keying off
  something looser than `subscriptions.status = 'active'` — e.g. off `next_billing_date` alone, or off a status
  it hasn't been taught to exclude — a halted subscriber could keep receiving sevas for a period they were never
  actually charged for, and that revenue gap is never recovered by Razorpay or by us automatically. **Add this
  as an explicit check in this session:** confirm every seva-eligibility query in `sankalp-logic.ts` (and
  anywhere else that gates "does this subscriber get a seva this cycle") excludes `status != 'active'`
  specifically, not just `status = 'cancelled'` — a query that only excludes `cancelled` would wrongly keep
  serving `halted` (and `pending`/`paused`) subscribers. Report what you find either way, even if it's already
  correct.
- Razorpay also has its own customer-facing recovery path (a payment-failure email with a secure card-update
  link) independent of anything we build — that's Razorpay's own retry-adjacent flow, not something to
  replicate; our Resume/re-issue-link options in Parts B and C are for when a human on our side needs to act
  (staff-initiated), separate from Razorpay's automatic customer-initiated one.

## 7. Definition of done

- [ ] Migration `015` adds `'halted'` to the `subscriptions.status` CHECK and adds `halted_at timestamptz`
- [ ] `subscription.halted` added to `SUPPORTED_EVENTS`, patches `status='halted', halted_at=now()`, existing
      3-failure `pending` demotion logic untouched and still fires independently
- [ ] `resumeRazorpaySubscription()` added to `razorpay.server.ts`; verified against Razorpay's current API docs
- [ ] `/api/admin/subscriptions/resume` — owner/admin only, rejects anything not currently `halted`, never sets
      `subscriptions.status` itself (webhook-only activation discipline preserved)
- [ ] Admin subscriber 360 view shows `halted` status, `Halted At`, and a Resume button; a halted-subscribers
      filter/list exists so admins don't need to stumble into it one row at a time
- [ ] Mandate-dead fallback: new-checkout-link path built (admin-side, reusing `createCheckoutForUser` directly,
      organic/no-attribution), old halted row marked `cancelled` with a reason before the new one is created
- [ ] Same re-send-link affordance reachable from the telecaller panel for her own tray's halted subscribers
      (Resume button itself stays admin/owner-only)
- [ ] Confirmed (not assumed) that every seva-eligibility query (`sankalp-logic.ts` and any other batch/seva
      scheduling path) excludes `status != 'active'` specifically, not just `!= 'cancelled'` — reported either
      way, since Razorpay never retroactively charges for sevas given during a halt
- [ ] Confirmed how the owner performance leaderboard currently treats a subscription that's neither `active`
      nor cleanly `paused`/`cancelled`, and confirmed `halted` is excluded from "active book" the same way
- [ ] Tested against Razorpay **test mode**: manually trigger enough consecutive test-mode failures (or use
      Razorpay's test webhook simulator) to get an actual `subscription.halted` event delivered, and confirm the
      full path — webhook records it, admin sees it, Resume button calls Razorpay, `subscription.resumed`/
      `subscription.charged` event flips status back to `active`
- [ ] End-of-session summary: files touched, migration number confirmed against what's actually in
      `supabase/migrations/` at merge time (another session may have landed `015` first — check, don't assume)

---

*🚩 Sewa Hamari, Punya Aapka 🚩*
