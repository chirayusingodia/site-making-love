# 🕉️ PUNYATA — Session Follow-up: Long-Running Subscriptions + OTP Abuse Protection

**For:** OpenCode + Kimi K3 · **Prepared by:** Chirayu (via Claude) · **Date:** 2026-08-22
**Follows:** `SESSION_SIGNUP_FIRST_CHECKOUT_PROMPT.md` (merged to Staging as `afd62b3`). This is a
targeted fix to two things flagged after that session's review — read this fully, it's short.

---

## 1. Subscription must run until the customer cancels, not stop after 1 year

**Problem (confirmed):** the current checkout code sets the Razorpay subscription's
`total_count` to `12` for monthly plans and `5` for yearly plans. That means the
UPI/card mandate is scheduled to **end automatically** after 1 year (monthly) or
5 years (yearly) — a subscriber who never cancels would silently stop being
charged and stop getting sevas, with nobody notified. That's not what Chirayu
wants: subscriptions should keep renewing **indefinitely until the subscriber
(or admin) actively cancels.**

**What Razorpay actually supports (verified against Razorpay's own docs —
do not re-guess this):**
- `total_count` (or `end_at`) is a **mandatory** field on subscription creation
  — Razorpay has no literal "runs forever" flag.
- Razorpay explicitly supports subscriptions for **a maximum duration of 100
  years**.
- A live subscription can be **cancelled at any time**, regardless of how much
  of `total_count` is left — cancellation is not blocked by a long tenure.

**The fix:** set `total_count` to the 100-year-equivalent number of cycles
instead of a short one, so in practice it never runs out during any real
subscriber's lifetime, and rely on the existing cancel flow (customer- or
admin-initiated) for actual endings — exactly like a "no fixed term" gym
membership modeled on a payment platform that requires *some* number.

```
Monthly plans : total_count = 1200   (100 years × 12 cycles/year)
Yearly plans  : total_count = 100    (100 years × 1 cycle/year)
```

- Add these as named constants (e.g. `SUBSCRIPTION_MAX_YEARS = 100`, with
  per-`billing_period` cycle counts derived from it) in whichever file
  currently creates the Razorpay subscription (`subscriptions-checkout.server.ts`
  / `createCheckoutForUser`, called from `/api/subscriptions/create-checkout`)
  — replace the hardcoded `12` / `5` there. Do not scatter magic numbers.
- If `plans.billing_period` ever gains a third value (weekly/daily), derive
  its constant the same way (100 years of that cadence) rather than leaving
  it unhandled.
- **Flag back to Chirayu, don't silently skip:** any subscription **already
  created** with the old `total_count=12`/`5` keeps its original short
  mandate — Razorpay doesn't retroactively extend a live subscription's
  `total_count` via a normal update in all mandate states. Report how many
  existing subscriptions (if any) were created before this fix, so Chirayu
  can decide whether it's worth contacting Razorpay support about those or
  whether the subscriber count today is low enough to just let old ones ride
  out and only new signups get the fix.

---

## 2. OTP abuse protection on `/api/auth/request-otp`

**Problem:** this route is public and unauthenticated by design (it's how
login/signup starts) — but today it has no rate-limiting of its own beyond
whatever Supabase's default Auth throttling does implicitly. That makes it a
textbook **OTP-bombing / SMS-pumping-fraud** target: a script can hit it
repeatedly for any phone number (yours, a stranger's, or a bot-generated
list), running up your SMS bill or harassing someone who never asked for it.

Build all three layers below — they're complementary, not alternatives, and
none of them alone is enough:

**Layer 1 — Supabase dashboard setting (config only, do this today, no code):**
In the Supabase project → Authentication → Rate Limits, confirm and tighten
the SMS/phone-OTP send limit. This is a Chirayu action item, not something
Kimi K3 can do from the repo — call it out explicitly in the session summary
as something Chirayu must check himself.

**Layer 2 — CAPTCHA on the OTP request (cheap, matches lowest-maintenance bias):**
Supabase Auth has built-in CAPTCHA support (hCaptcha or Cloudflare Turnstile)
specifically for gating OTP-triggering calls. Wire Turnstile (free, usually
invisible to real users) into the `/login` page's "OTP Bhejein" action —
add `VITE_TURNSTILE_SITE_KEY` (client) and the matching secret (server) env
vars, and pass the token through to Supabase's OTP call per Supabase's
documented CAPTCHA integration. This alone blocks most scripted abuse.

**Layer 3 — Application-level rate limiting in Postgres (new, small, no new vendor):**
- New table `otp_send_log`: `phone text, ip text, created_at timestamptz default now()`.
- In `requestOtpForPhone` (`auth.server.ts`), **before** calling Supabase's OTP
  send, check this log and reject with `429` if:
  - this **phone number** has requested more than **3 OTPs in the last 10
    minutes**, or more than **8 in the last 24 hours**, OR
  - this **IP address** (from request headers) has requested OTPs for more
    than **5 distinct phone numbers in the last hour** — this catches "one
    attacker, many victim numbers," which a per-phone limit alone misses.
- On any rejection, return the **same generic message** regardless of which
  limit tripped ("Thodi der baad try karein") — don't reveal which check
  fired, that itself is information an attacker can use.
- Log every attempt (allowed or blocked) to `otp_send_log` for basic
  visibility — no new PII beyond what's already collected at signup.
- Treat the numbers above (3/10min, 8/day, 5-numbers/hour/IP) as **tunable
  constants** in one place, not hardcoded inline — Chirayu may want to loosen
  or tighten them after seeing real traffic.

**Not in scope for this fix (already handled, just confirm):** brute-forcing
the 6-digit OTP code itself is Supabase's own responsibility — it already
invalidates a code after a small number of wrong attempts. Confirm this is
still true in the current Supabase Auth config; don't build custom
guess-limiting logic for that part.

---

## 3. Definition of done

- [ ] New subscriptions created via `/api/subscriptions/create-checkout` use
      `total_count = 1200` (monthly) / `100` (yearly) — verified against a
      test-mode Razorpay subscription's actual entity response, not just the
      request payload
- [ ] Report on existing subscriptions created with the old short
      `total_count` — count + Chirayu's decision on whether to act on them
- [ ] Turnstile (or hCaptcha) live on `/login`'s OTP-request step
- [ ] `otp_send_log` table created; `request-otp` route enforces the
      per-phone and per-IP limits above with a 429 + generic message
- [ ] Confirmed (not assumed) that Supabase's own OTP-guess attempt limit is
      active on the verify step
- [ ] Chirayu notified explicitly to check/tighten the Supabase dashboard
      SMS rate-limit setting himself (not code-controllable)
- [ ] End-of-session summary: files touched, the exact constants chosen,
      and anything left open

---

*🚩 Sewa Hamari, Punya Aapka 🚩*
