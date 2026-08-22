# 🕉️ PUNYATA — Session Brief: Signup-First Checkout Flow

**For:** OpenCode + Kimi K3 · **Prepared by:** Chirayu (via Claude) · **Date:** 2026-08-21
**Read `PUNYATA_MASTER_CONTEXT_v3.md` fully before starting — this session is an ADDITION/CHANGE to Section 8 (Subscription Flow) of that doc, not a replacement of anything else in it.**

---

## 0. Why this session exists

Current checkout (`src/routes/checkout.$planId.tsx`) is a **frontend-only mockup** — no Supabase Auth call, no DB writes, no Razorpay call. The "Pay" button just flips local state to show a fake success screen. This session replaces that with a real, working flow, and **changes the funnel order** from what v3 Section 8 currently describes.

**New rule — this supersedes v3 Section 8's step order:**
Login happens **first, before plan purchase** — not mid-checkout after family details. Once logged in, buying a plan is a single click (name + phone already known). Family member details move to **after** payment, on the profile page, and are explicitly optional/deferrable.

---

## 1. New Flow (build exactly this)

```
1. Landing / Plans page — fully public, no login required to browse plans.

2. User clicks "Subscribe" / "Buy" on a plan.
   → If not logged in: show Login/Signup step (see #2 below), remembering
     which plan they wanted (query param or session storage), then return
     them straight to step 3 after verification.
   → If already logged in: skip straight to step 3.

3. Login / Signup (name + phone, OTP-gated):
   a. Enter Full Name + Mobile Number (single combined form — no separate
      "signup" vs "login" UI; same form handles both new and returning
      users, matched by phone number).
   b. Send OTP to that number.
   c. User enters OTP → verified.
   d. On success:
        - New number  → create `profiles` row (full_name, phone), start session.
        - Existing number → log into existing profile, ignore the name field
          they typed (or offer to update it) — do NOT create a duplicate profile.
   e. Session persists 30 days (already the documented standard — no change).

4. Buy step (post-login):
   - Show the chosen plan, price, and the user's name + phone already
     filled in / displayed (not re-asked).
   - No family-member form here. No separate contact form here.
   - "Confirm & Pay" → creates a `pending` subscription row → opens Razorpay
     Checkout (UPI AutoPay / card) for that plan's amount.
   - On Razorpay success callback: show an immediate "Payment received,
     confirming your subscription…" state (real activation still only
     happens via the existing webhook — do not flip status client-side).

5. Post-purchase → Profile Completion page:
   - Redirect here right after payment.
   - Banner: "🎉 आपकी सदस्यता सफलतापूर्वक शुरू हो गई! / Your subscription
     is active." (copy in Hinglish, matching site tone.)
   - Below the banner: family member form (Member 1..4, same fields as
     today's checkout step 1 — Name, Gotra, Relation, optional DOB) +
     address fields (address_line1/2, state, pincode — needed for Premium
     Annual prasad shipping).
   - Two clear actions: **"Save & Continue"** and **"I'll do this later"**
     (explicit skip). Both land the user on `/my-subscription` or `/profile`.
   - This exact same form/component must be reachable again later from
     `/profile` — it's not a one-time modal, it's the permanent "complete
     your family details" section until filled.

6. `/profile` and `/my-subscription` — replace today's hardcoded
   placeholders (`isLoggedIn = false`, `hasActive = false`) with real
   Supabase session + real subscription/family_members data. Show a
   persistent "Complete your family details" prompt/card if fewer than 1
   family member is on file yet.
```

---

## 2. Why login-before-pay (explicit rationale to preserve)

Chirayu's call: reduce checkout friction to one click once the user is
identified, and stop losing the family/gotra data entry to fields the user
doesn't have handy at browse time. Do not silently revert to the old
"family details before OTP" order from v3 Section 8 — this session's order
is now the correct one; update v3 Section 8 to match once this ships.

---

## 3. Decisions (resolved by Chirayu — build exactly this, no guessing)

**3a. OTP delivery channel — RESOLVED: Option A, standard SMS/voice OTP.**
Collect **one** phone number field — don't ask "WhatsApp number" vs "calling
number" separately, it's the same field either way. Send the OTP via
Supabase Auth's native phone-OTP (SMS/voice through whichever provider is
configured — Twilio/MSG91/etc.). Do **not** build a separate WhatsApp-OTP
vendor integration (MSG91 WhatsApp OTP / Gupshup / AiSensy) for this
session — that's explicitly out of scope. On-screen copy should just say
"OTP" / "कोड" — don't promise WhatsApp delivery in the UI text since it
isn't happening this way.

**3b. Subscriptions with 0 family members at batch-generation time — RESOLVED.**
Business-side fix: **a sales agent calls the subscriber to complete their
family/gotra details as soon as possible after purchase.** The system side
needs to support that process, not replace it:

- The moment a subscription is created with 0 rows in `family_members`,
  mark it (derived, not a new stored flag — see §4) as **"Sankalp Pending"**.
- Surface a **call queue**: any list/filter in `/admin/subscribers` (and
  ideally the future Sales Agents module, Session 5) showing subscriptions
  with 0 family members, sorted oldest-purchase-first, so agents know who
  to call and how urgently.
- **Never fabricate a name.** Do not use `profiles.full_name` as a stand-in
  sankalp entry. If a subscription has 0 family members on the day a batch
  (`generate-batch`) runs, **exclude it from that batch's Pandit-facing
  list** — there's nothing correct to recite yet — but still create its
  `sankalp_batch_subscriptions` row (so it's tracked, not silently lost)
  and flag it clearly as "no family details yet" wherever that batch is
  reviewed in admin.
- The moment the agent (or the subscriber themselves via `/profile`) adds
  at least one family member, that subscription is automatically picked
  up by the **next** live-generated batch — this needs **no new logic**,
  since batch generation already reads live from current `family_members`
  data (same mechanism as the existing "onboarding catch-up" rule for late
  joiners in v3 §7 — reuse that precedent, don't build a parallel path).
- Variable family size (1, 2, 3, or 4 members — never require exactly 4)
  needs **no schema or segment-logic changes**. `SEGMENT_SIZE_SUBSCRIPTIONS
  = 5` already groups by *number of subscriptions* per segment, not number
  of names — a 2-person family and a 4-person family both fit fine in the
  same segment, contributing 2 and 4 names respectively (segment videos
  already range "up to 20 names," it was never a fixed 20). Just confirm
  no code path anywhere assumes every subscription contributes exactly 4
  names — if you find one, fix it as part of this session.

**3c. Coupon entry — still open, pick one and say which in your summary:**
keep a simple optional coupon-code field on the "Buy" step (step 4 above),
or drop it for this session and add as a fast-follow. Recommend keeping it
since `/api/coupons/validate` scope is small — flag if you disagree.

---

## 4. Schema impact

No new tables needed. Changes:

- `family_members`: the current `slot_number between 1 and 4` +
  presumably-implied "slot 1 required at signup" behavior must become
  **fully optional at the DB level for as long as the subscription is
  active with zero family members.** Confirm no existing constraint
  requires at least one row per subscription; if one exists, it must be
  relaxed. Subscriptions with 0 family members are a valid, expected state
  now (previously they weren't).
- Consider adding a cheap derived flag rather than a new column: compute
  "profile incomplete" client-side/API-side as `family_members count === 0`
  for that subscription — do not add a redundant boolean column that can
  drift out of sync.
- No changes to `subscriptions`, `profiles`, `plans`, `payments` schemas.

---

## 5. API endpoints to build

```
Auth
  POST /api/auth/request-otp     → { name, phone } → sends OTP (channel per §3a),
                                    creates profiles row if phone is new
  POST /api/auth/verify-otp      → { phone, otp } → verifies, establishes session

Subscriptions
  POST /api/subscriptions/create-checkout
      → { plan_id, coupon_code? } (user identified via session, not re-entered)
      → creates a `pending` subscriptions row (user_id, plan_id, coupon_id)
      → creates the matching Razorpay subscription/order
      → returns whatever the frontend needs to open Razorpay Checkout
  (existing) POST /api/payments/webhook → unchanged, already correct —
      this is still the ONLY code path that sets status='active'

Profile completion
  POST /api/profile/family-members   → upsert up to 4 members for the
                                        caller's own subscription (RLS-scoped)
  POST /api/profile/address          → upsert address_line1/2, state, pincode
                                        on `profiles` (unchanged shape from
                                        today's /checkout/grah fields)

Coupons (if kept per §3c)
  POST /api/coupons/validate         → { code, plan_id } → discount or rejection
```

All of these are new server routes under `src/routes/api/` following the
existing pattern (see `src/routes/api/payments/webhook.ts` and
`src/routes/api/sankalp/generate-batch.ts` for the house style: server-only
logic split into a `*.server.ts` lib file, thin route handler).

---

## 6. Frontend files to add/change

```
NEW    src/routes/login.tsx                 → name+phone → OTP → verify (steps 3a-3d)
CHANGE src/routes/checkout.$planId.tsx      → strip family/contact/address steps;
                                               becomes: plan confirm → pay only;
                                               redirect to /login if no session,
                                               preserving planId to return to
NEW    src/routes/subscription-success.tsx  → post-payment landing: success banner
                                               + family/address form + "later" skip
                                               (or fold into profile.tsx — your call,
                                               but the form must be the SAME component
                                               reused on /profile)
CHANGE src/routes/profile.tsx               → remove hardcoded isLoggedIn/placeholder
                                               data; real session + real subscription
                                               + "complete your family details" prompt
                                               if 0 family members on file
CHANGE src/routes/my-subscription.tsx       → remove hardcoded hasActive placeholder;
                                               real data from `subscriptions` +
                                               `family_members` via RLS-scoped query
NEW    src/lib/auth-api.ts                  → thin client wrappers for
                                               request-otp / verify-otp
CHANGE src/lib/supabase.ts                  → no structural change expected, just
                                               confirm session persistence config
                                               (30-day) matches v3 §14
```

---

## 7. Explicit constraints carried over (do not violate)

- Activation is **webhook-driven only** — this session must never set
  `subscriptions.status = 'active'` from any frontend or non-webhook API code.
- RLS stays authoritative; any new API route must enforce the caller can
  only read/write their own `profiles`/`subscriptions`/`family_members` rows.
- No hardcoded plan→seva mapping — unaffected by this session, just don't
  introduce any.
- Razorpay webhook HMAC verification is unchanged — do not touch
  `razorpay-webhook.server.ts` unless you find an actual bug while wiring
  `create-checkout` against it (e.g., a mismatch in how `razorpay_sub_id`
  is stored) — if so, flag it, don't silently patch webhook behavior as a
  side effect of this session.
- No Docker/MySQL/standalone Express/Prisma — stays TanStack Start +
  Supabase + Razorpay + existing stack.

---

## 8. Definition of done / test checklist

- [ ] New phone number → name+phone → OTP → verified → `profiles` row created → session active
- [ ] Existing phone number → OTP → verified → logs into same `profiles` row, no duplicate created
- [ ] Logged-in user clicks "Subscribe" on a plan → sees plan+price+their own name/phone, no re-entry of anything → one "Confirm & Pay" click → Razorpay Checkout opens for the right amount
- [ ] Not-logged-in user clicks "Subscribe" → routed to login → after OTP success → lands back on the SAME plan's buy step automatically (no re-picking the plan)
- [ ] Successful payment → `pending` subscription row exists with correct `razorpay_sub_id` before webhook fires → webhook activates it → status flips to `active` only via webhook, verified by checking `subscriptions.status` is never touched by any other code path
- [ ] Post-payment redirect shows success banner + family/address form
- [ ] "I'll do this later" skip works — user has an active, paying subscription with 0 family members, and can return to `/profile` anytime to add them
- [ ] `/profile` and `/my-subscription` show real data for a logged-in user with an active subscription, and a real empty state for one with none
- [ ] Sankalp list generation (`/api/sankalp/generate-batch`) handles a subscription with 0 family members per §3b: excluded from that batch's Pandit list, but tracked in `sankalp_batch_subscriptions` and visible as "Sankalp Pending" in admin — no crash, no silent loss
- [ ] `/admin/subscribers` (or equivalent) shows a working "0 family members / call queue" filter so a sales agent can find who to call
- [ ] A subscription with 2 family members and one with 4 both land correctly in the same segment without any code assuming exactly 4 names per subscription
- [ ] End-of-session summary provided per v3 §13 working style: files touched, decisions made (especially §3a/§3b/§3c), root causes of any bugs, anything left open

---

*🚩 Sewa Hamari, Punya Aapka 🚩*
