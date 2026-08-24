# 🕉️ PUNYATA — Session: Stuck "Confirming…" Pending Subscriptions (Abandoned Checkout Reuse Bug)

**Severity: CRITICAL / P0 — treat as revenue-blocking, not cosmetic.** This is not a display glitch. It is a
customer-facing checkout flow that, once triggered, permanently prevents a real customer from ever completing a
real payment through the normal Subscribe button — with the product's own UI actively telling both the customer
and the team that nothing is wrong. Fix this before any other open item in the backlog unless something is
actively losing money faster right now.

**For:** OpenCode + Kimi K3 (or oxAlpha — model-agnostic) · **Prepared by:** Chirayu (via Claude) · **Date:** 2026-08-24
**Follows:** `SESSION_HALTED_SUBSCRIPTION_RECOVERY_PROMPT.md` (migration `015`), `SESSION_TENURE_AND_OTP_ABUSE_PROMPT.md`,
`PUNYATA_BUGS_REPORT.md` (2026-08-24 bug scan, migration `20260824_018_bugfix_hardening.sql`).
**Migration:** next is `20260824_019_pending_checkout_ttl.sql` (nothing schema-breaking is strictly required — see
§3 — but this session adds an `audit_logs`-only write path plus, optionally, one indexed lookup; keep the number
reserved so migrations stay sequential).

**Live incident that triggered this session:** Chirayu (owner, phone `8005828548`) opened Razorpay Checkout for
the Premium plan, closed it without paying (no UPI/card entered, no mandate authorized), and the app kept showing
"Payment confirm ho raha hai…" for 2+ hours straight. He then clicked Subscribe again expecting a fresh attempt —
still no payment went through. Razorpay Dashboard → Subscriptions showed **two** rows, both stuck in status
`Created` (Razorpay's very first, pre-authentication state — not `authenticated`, not `active`):

| Subscription Id | Plan Id | Created At | Status |
|---|---|---|---|
| `sub_TTUWqtT7DtJjbx` | `plan_TTKHvoBDnhTshT` | 24 Aug 2026, 10:58:07 am | Created |
| `sub_TTUf7P9WYZ2xc5` | `plan_TTKHvoBDnhTshT` | 24 Aug 2026, 11:05:57 am | Created |

Both were manually deleted from `subscriptions` via SQL as an immediate workaround (confirmed no `payments` or
`family_members` rows referenced either — nothing was captured, nothing to preserve). **That workaround does
nothing for the next customer who cancels a checkout** — this session fixes the actual flow so it can't recur.

### Why this is critical, not a minor UI bug

- **It permanently blocks a legitimate second attempt to pay.** Any real customer — not just Chirayu testing —
  who opens Checkout and backs out for any reason (changed their mind for a second, weak signal, app switch to
  copy an OTP, anything) is silently downgraded into this trap the moment they click Subscribe again. There is no
  workaround available to the customer themselves; nothing on the page tells them to log out, wait, or retry
  differently, because the page says "Confirming…" as if their money is already on its way to being processed.
- **It fails silently, at scale, with zero alerting.** Because Razorpay never sends a webhook for an abandoned
  checkout, and our own code never re-checks, there is no error, no log line anyone would think to look at, no
  admin flag — nothing. The only reason this specific instance surfaced is that Chirayu personally noticed his own
  test payment stuck for two hours and asked about it. Every other customer hitting this has no equivalent way to
  escalate it back to the team; they just quietly fail to subscribe and the business never finds out why.
- **It is indistinguishable from working correctly, by design of the current UI.** A dead, un-payable subscription
  and a live payment about to confirm in 10 seconds render the exact same badge and the exact same reassuring
  copy. That is the opposite of a fail-safe: the more confused a customer becomes trying to pay again, the more
  confidently the app tells them everything is fine.
- **Every affected customer represents lost revenue that looks like nothing happened**, not a visible failure —
  no support ticket text like "checkout crashed" or "error 500," just a subscription that silently never converts.
  That is the most dangerous kind of bug for a paid product: not the one that's loud, the one that's invisible and
  compounding.

This session should be scheduled and reviewed with that severity in mind — verify the fix against the acceptance
criteria in §6 before considering this closed, not just against "the badge looks different now."

---

## 0. Repo reality check first (do this before writing code)

This is a gap-closing session on top of already-shipped signup-first checkout, not greenfield. Confirm these
still look like this as of 2026-08-24 — if any diverged, adjust the plan below and say so in your summary rather
than silently working around it:

- `src/lib/subscriptions-checkout.server.ts`, `createCheckoutForUser` (~line 146-186): when the caller carries no
  coupon/acquisition-channel/agent/telecaller attribution, it looks up the caller's existing `status='pending'`
  subscription for the same plan and, **if it already has a `razorpay_sub_id`, returns that same id unconditionally
  — no check on how old the row is, and no check on what Razorpay currently thinks that subscription's status is.**
  Only the *opposite* case (a pending row that never got a `razorpay_sub_id` linked at all, i.e. Razorpay's create
  call itself failed) is treated as an orphan and deleted.
- `src/lib/razorpay.server.ts` exports exactly three functions: `createRazorpaySubscription`,
  `resumeRazorpaySubscription`, `createRazorpayRefund`. **There is no fetch/get-subscription call and no
  cancel-subscription call anywhere in the codebase.** We have no way today to ask Razorpay "is this subscription
  id actually still alive / worth reopening?" before reusing it.
- `src/routes/my-subscription.tsx` (~line 170-180): the status badge is a strict binary —
  `current.status === "active"` renders the green "Active" badge, **anything else at all** (`pending`, `cancelled`,
  `expired`, `halted`) renders the identical grey "Confirming…" badge with the identical copy ("Payment mil gaya —
  activation webhook se poora hota hai, kuch hi minute mein."). A subscription that was never even paid for reads
  on screen exactly like one where a webhook is genuinely about to land.
- `src/routes/api/payments/webhook.ts` / `src/lib/razorpay-webhook.server.ts`: unchanged, still the only code path
  allowed to set `status='active'`. **This session does not touch that discipline** — the bug here is entirely on
  the "what happens before any webhook could ever fire" side (abandoned checkouts produce zero webhook events at
  all, by Razorpay's own design), not on webhook handling.

## 1. The problem, precisely

Two bugs compound into the "very very wrong flow" Chirayu hit:

**Bug A — indefinite reuse of a dead pending checkout (the actual blocker on retrying payment).**
When a customer opens Razorpay Checkout and closes it before authenticating (card/UPI mandate never set up),
Razorpay's subscription stays at status `created` forever on its side and — critically — **never fires any
webhook at all**, because nothing happened yet from Razorpay's point of view. Our `subscriptions` row for it
stays `pending` forever too, with no signal to ever change that. Now the customer clicks "Subscribe" again:
`createCheckoutForUser` finds that same `pending` row, sees it already has a `razorpay_sub_id`, and hands the
frontend that **same, already-abandoned** subscription id to reopen Checkout against — indefinitely, on every
retry, forever, because nothing in the lookup ever expires or re-verifies it. If that specific Razorpay
subscription object is in a state where its Checkout link is no longer completable (this needs live verification —
see §2 task 1 — but is consistent with Chirayu's report that payment "bhi nahi ho raha tha" on repeated retries),
the customer is stuck bouncing off the same broken mandate with literally no way to get a fresh one through normal
use of the site. This is the priority fix.

**Bug B — the UI actively hides that anything is wrong.**
Because `my-subscription.tsx` shows the exact same "Confirming…" copy for a 30-second-old genuinely-in-flight
payment and a 2-hour-old abandoned checkout, neither the customer nor anyone on the team glancing at the account
has any on-screen signal that something needs attention. Combined with Bug A, the product both traps the customer
in a broken retry loop *and* tells them everything is fine.

Neither bug touches activation discipline — `status='active'` still only ever comes from the webhook. The fix is
entirely about (a) not blindly trusting an old `pending` row as reusable, and (b) being honest in the UI about
which kind of "not active" a subscription actually is.

## 2. Fix, part A — stop reusing stale/dead pending checkouts

**`src/lib/razorpay.server.ts`** — add two functions, same minimal-dependency style as the existing ones:

```ts
/**
 * Fetches a Razorpay subscription's current server-side state.
 * GET /v1/subscriptions/:id. Used to verify a locally-`pending` row's
 * razorpay_sub_id is still something worth reopening Checkout against
 * before handing it back to the frontend — confirm the exact response
 * shape (status values include at least 'created', 'authenticated',
 * 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired')
 * against Razorpay's current Subscriptions API docs before shipping.
 */
export function fetchRazorpaySubscription(razorpaySubId: string): Promise<RazorpaySubscription> {
  return razorpayCall<RazorpaySubscription>(`subscriptions/${encodeURIComponent(razorpaySubId)}`, {});
  // NOTE: razorpayCall as written always does a POST — this is a GET.
  // Either add a `method` param to razorpayCall (default 'POST', pass
  // 'GET' here with no body) or write a small parallel helper. Check
  // razorpayCall's current signature before assuming which is less
  // invasive.
}

/**
 * Cancels a Razorpay subscription that we've decided to abandon locally
 * (stale/never-authenticated). POST /v1/subscriptions/:id/cancel.
 * Best-effort tidy-up of Razorpay's own dashboard — if this call fails
 * (e.g. already cancelled, already expired) do NOT throw and block the
 * customer's retry on it; log and continue creating their fresh
 * subscription regardless. Confirm the exact endpoint/body against
 * current docs — some Razorpay cancel endpoints take a
 * `cancel_at_cycle_end` boolean; for an unauthenticated/never-started
 * subscription that flag shouldn't matter, but verify.
 */
export function cancelRazorpaySubscription(razorpaySubId: string): Promise<RazorpaySubscription> {
  return razorpayCall<RazorpaySubscription>(`subscriptions/${encodeURIComponent(razorpaySubId)}/cancel`, {});
}
```

**`src/lib/subscriptions-checkout.server.ts`, `createCheckoutForUser`** — replace the unconditional reuse with a
staleness + live-status check:

- Add a constant, e.g. `const PENDING_REUSE_WINDOW_MINUTES = 20;` — a genuinely in-flight Checkout resolves via
  webhook within seconds to low minutes; 20 minutes is generous headroom before treating a `pending` row as
  abandoned rather than "still on the payment sheet." Pick the exact number with Chirayu if he wants it tighter —
  document why wherever it ends up (mirror the existing comment style, e.g. the `FAILURE_DEMOTE_THRESHOLD` comment
  in `razorpay-webhook.server.ts`).
- When `existingPending?.razorpay_sub_id` is found:
  1. If `existingPending.created_at` is within `PENDING_REUSE_WINDOW_MINUTES` of now, keep today's behaviour —
     reuse it as-is (do not add a live Razorpay call on every single fast retry; that's unnecessary API load for
     the common "double-click" case this reuse logic was originally built for per the `[Bug 1.9]` comment already
     in this file).
  2. If it's older than that window, call `fetchRazorpaySubscription(existingPending.razorpay_sub_id)` before
     trusting it further:
     - If Razorpay reports a status that's still completable (e.g. `created`, `authenticated`) — this is the
       "customer genuinely came back after 25 minutes to finish the same checkout" case — you may still reuse it,
       your call, but flag this explicitly in your summary since it's a judgment call not a hard rule.
     - If Razorpay reports anything that means this mandate cannot be completed as a fresh payment (cancelled,
       expired, or any state you determine post-verification is a dead end), **do not reuse it**: best-effort
       `cancelRazorpaySubscription` on the old id (swallow errors, see above), delete or mark the local row (match
       the existing orphan-cleanup pattern a few lines below in this same function — `.delete().eq("id",
       existingPending.id).eq("user_id", userId)` — for consistency; do NOT leave a dangling `pending` row behind
       either way), and fall through to the normal fresh-creation path below it exactly as if `existingPending`
       had been `null` from the start.
     - Write an `audit_logs` row either way (`admin_id: null`, `action: "checkout.stale_pending_discarded"` or
       similar, `entity: "subscriptions"`, `meta: { razorpay_sub_id, age_minutes, razorpay_status }`) so there's a
       paper trail of how often this happens — same discipline as every other system-actor write in this product.
  3. If the `fetchRazorpaySubscription` call itself fails (network/API error, not a "this mandate is dead" answer)
     — fail safe by falling through to fresh creation rather than either blocking the customer or blindly reusing
     a subscription you couldn't actually verify. Do not let a Razorpay API hiccup turn into a 500 on checkout.

## 3. Fix, part B — make the UI tell the truth about non-active states

**`src/routes/my-subscription.tsx`** — replace the binary `active` / everything-else badge with distinct states.
At minimum:

- `active` → unchanged, green "Active" badge.
- `pending` **and** `created_at` within `PENDING_REUSE_WINDOW_MINUTES` (reuse the same constant, or move it
  somewhere shared both files can import — your call, but don't hardcode two different numbers in two places for
  what's conceptually one "how long is 'still confirming' honest" threshold) → keep today's grey "Confirming…"
  badge and copy, this part is genuinely fine for a fresh payment.
- `pending` **and** older than that window → a new, visually distinct state (e.g. amber/red, not the same grey as
  "Confirming…") with honest copy along the lines of "Payment complete nahi hua — dobara try karein" and an
  explicit button/link back to the plan's checkout (`/plan/[slug]` or wherever the Subscribe action lives) so the
  customer has an obvious next action instead of staring at a stuck spinner-equivalent. This is the row that Part
  A's fresh-creation path will replace on the next click, so wire the button to actually retrigger checkout, not
  just to a static page.
- `cancelled` / `expired` / `halted` → their own labels, don't fold these into "Confirming…" either. Mirror
  `admin.subscribers.tsx`'s existing `StatusBadge` color/icon choices for these statuses (it already has distinct
  treatment for `paused`/`halted`/`cancelled` from the `015` session — reuse that vocabulary so the customer-facing
  and admin-facing language for the same status match) rather than inventing new colors/wording independently.
- Check `subscription-success.tsx` too — it doesn't currently show a status badge (it's a fixed "success" banner
  shown right after the checkout redirect), so it's lower priority, but if a customer bounces back to this page
  after abandoning payment, confirm it doesn't misleadingly imply success. Read the current redirect flow in
  `checkout.$planId.tsx` before assuming when this page is even reached — Verify Chirayu isn't already handling
  "abandoned" separately from "redirected after real payment" there.

## 4. Fix, part C — give ops visibility (optional but recommended)

**`src/routes/admin.subscribers.tsx`**: add a filter/segment for "stale pending" — `status='pending'` rows older
than `PENDING_REUSE_WINDOW_MINUTES` (or some slightly longer ops-facing threshold, e.g. 1 hour, your call) —
mirroring the existing "Sankalp Pending / call queue" filter pattern already in this file (see
`project_signup_checkout_flow` session notes / the 0-family-members filter). This turns "customer silently stuck"
into a queue a telecaller or admin can proactively follow up on, the same way incomplete-family-details already
is. Not required for the core fix to be correct, but closes the loop on *why* a checkout got abandoned in the
first place (declined card? confusing UPI flow? just changed their mind?) — that's a product-research question,
not a code fix, but the visibility is the prerequisite for anyone to ever ask it.

## 5. What NOT to change

- Do not touch `razorpay-webhook.server.ts`'s activation discipline. `status='active'` remains exclusively
  webhook-set. Nothing in this session should add a second path to it, including the `fetchRazorpaySubscription`
  check in §2 — that function is read-only reconnaissance to decide whether to *discard and recreate* a pending
  row, never a way to promote one to active.
- Do not add polling/setInterval on the client to repeatedly hit `fetchRazorpaySubscription` from the browser —
  that call needs `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` server-side auth and has no business being exposed to
  the client. All of §2 happens inside `createCheckoutForUser` (server-only), triggered by the customer's own next
  "Subscribe" click — not a background job hitting Razorpay on a timer for every pending row in the database.
- Do not change `FAILURE_DEMOTE_THRESHOLD` or anything else in the already-correct 3-consecutive-failure demotion
  path — that's a separate mechanism (a subscription that *did* activate and is now failing renewal charges), not
  the abandoned-first-checkout case this session addresses.

## 6. Before closing — audit for the same pattern elsewhere

Both bugs here come from a general pattern, not something unique to checkout: **(a) trusting a locally-cached
Razorpay object's state forever instead of re-verifying it, and (b) a status badge that collapses several
genuinely different states into one reassuring label.** Do not treat this session as done once checkout is fixed —
grep the rest of the codebase for the same two shapes before closing:

- **Pattern (a) — stale trust in a cached Razorpay id/status.** Check `resumeRazorpaySubscription` call sites
  (`src/routes/api/admin/subscriptions/resume.ts`) and the coupon/redemption paths in
  `subscriptions-checkout.server.ts` for the same "we assume this external object is still in the state we last
  saw it in" shape. Also check `send-payment-link.ts` and `reissue-link.ts` (telecaller/admin payment-link flows) —
  do they have their own version of "hand back an old link/subscription id without checking if it's still valid"?
  If any of them do, they need the same fetch-before-reuse treatment as §2, not necessarily in this session, but
  flagged explicitly in your summary as a follow-up item with file/line references, not left implicit.
- **Pattern (b) — a badge/label that hides which real state something is in.** `admin.subscribers.tsx` already
  has more granular status handling than the customer-facing `my-subscription.tsx` did, but check
  `admin.payments.tsx`, `admin.overview.tsx`, and the telecaller person/queue views
  (`telecaller.person.$subscriptionId.tsx`, `telecaller.queue.$queueKey.tsx`) for any place that similarly
  collapses `pending` (genuinely in-flight) together with `pending` (dead, abandoned) — since today there is no
  code-level distinction between those two anywhere except what this session adds, any other screen reading
  `status === 'pending'` as one meaning likely inherited the same ambiguity and needs the same treatment (or at
  minimum a "this counts abandoned pending as pending too" note in your summary).
- Report findings from this audit explicitly in your session summary even if the answer is "checked, nothing
  else has this shape" — don't silently skip it just because the primary fix works.

## 7. Acceptance criteria

1. Repro the original bug in a test/staging Razorpay account: open Checkout, close it without paying, click
   Subscribe again immediately (< 20 min) — confirm today's fast-path reuse still works unchanged (no regression
   on the legitimate double-click case the `[Bug 1.9]` comment describes).
2. Same repro, but wait past `PENDING_REUSE_WINDOW_MINUTES` (or fake `created_at` in a test DB) before retrying —
   confirm a **new** Razorpay subscription id is created and handed to the frontend, the old one is
   cancelled/cleaned up on Razorpay's side (best-effort) and removed locally, and an `audit_logs` row records the
   discard.
3. `/my-subscription` shows the new "payment nahi hua, dobara try karein" state (not "Confirming…") for a
   `pending` row older than the threshold, with a working retry action.
4. Confirm neither change affects any subscription that has ever reached `active` — this is entirely scoped to
   `pending` rows that never got there.
5. Manually verify against Chirayu's own account (`8005828548`) post-fix: a fresh Subscribe → cancel → Subscribe
   cycle produces a clean, completable Checkout every time, with no repeat of the two-stuck-`Created`-rows
   incident this session was opened to fix.
