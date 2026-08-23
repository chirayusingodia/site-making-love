# 🕉️ PUNYATA — Session Brief: Add Google Sign-In (Trust Factor) alongside Phone OTP

**For:** OpenCode + Kimi K3 · **Prepared by:** Chirayu (via Claude) · **Date:** 2026-08-23
**Follows:** `SESSION_SIGNUP_FIRST_CHECKOUT_PROMPT.md` (merged, `afd62b3`) and
`SESSION_TENURE_AND_OTP_ABUSE_PROMPT.md`. Read both before starting — this session
**adds** a second login method to `/login`; it does not replace the phone-OTP flow
and must not change anything about how the phone-OTP flow already behaves.

---

## 0. Why this session exists

Login currently forces every visitor through name + phone + OTP before they can
pay. That's fine and stays the default, but a first-time visitor who doesn't
recognize the Punyata brand yet may hesitate to type a phone number and wait
for an OTP. A "Continue with Google" option next to it borrows Google's trust
and removes a step (no OTP wait) for anyone who has a Google account handy —
likely to help conversion for cold/first-time traffic specifically.

**This is additive, not a replacement.** The phone number stays the backbone of
the business — telecaller calls, Sankalp Pending queue, family/gotra records,
sourcing-agent workflows are all keyed on `profiles.phone` (see
`project_telecaller_panel` / `project_hospitals_perf_spec` context). Google
Sign-In only changes *how someone proves who they are*; it must still end with
a real, usable phone number on the profile.

---

## 1. Decisions (resolved by Chirayu — build exactly this, no guessing)

**1a. Where the Google button lives.**
On `/login`, show "Continue with Google" as the first/primary action, with a
divider ("ya phone number se") below it leading into the existing name+phone
OTP form. Both paths lead to the same place (buy step, or home if no plan was
pending).

**1b. First-ever Google sign-in requires a phone number, unverified.**
The whole point of offering Google is to cut friction, so do **not** send a
second OTP after Google auth succeeds. Instead:
- On the very first successful Google sign-in for a given Google identity
  (i.e. no `profiles` row is linked to this `auth.users` id yet), show one
  small step: "Apna mobile number confirm karein" — a single phone-number
  field, format-validated (10-digit Indian mobile) but **not OTP-verified**.
- This number becomes `profiles.phone`. Full name can be pre-filled from the
  Google profile (editable).
- Real verification of that number still happens the same way it already
  happens for Sankalp-Pending subscribers today: the telecaller/sales-agent
  call after purchase. This session does not add a new verification step —
  it reuses the existing call-queue process. Flag this explicitly in the
  session summary as a deliberate trade-off (trust now, verify-by-human
  later), not an oversight, so Chirayu can revisit it if abuse shows up.

**1c. Duplicate-account collision — must handle, do not skip.**
Because phone is now reachable via two different sign-in paths, a real person
could end up trying to create a second account:
- If the phone number entered in step 1b **already exists** in `profiles`
  (created earlier via ordinary phone-OTP login), **do not create a second
  profile row.** Show a clear message ("Ye number pehle se registered hai —
  OTP se login karein") and route them into the existing phone-OTP login with
  that number pre-filled.
- **Merging** the Google `auth.users` identity into that pre-existing
  phone-based account (so the same person can use either method later) is
  **explicitly out of scope for this session** — it's a materially bigger,
  riskier change (Supabase identity linking across two different sign-in
  methods for the same person). Note it as a fast-follow candidate only if
  Chirayu wants it later.
- A returning Google user (their `auth.users` id already has a linked
  `profiles` row from a previous Google sign-in) skips straight to the buy
  step — completely normal returning-user flow, no special handling needed.

**1d. Defensive DB constraint.**
Before this session, only one signup path existed, so two `profiles` rows
with the same phone were structurally impossible. That's no longer true once
a second path exists. Check whether `profiles.phone` already has a `UNIQUE`
constraint; if not, add one (migration) as a hard backstop underneath the
app-level duplicate check in 1c — the app check can race or be bypassed, the
DB constraint can't.

---

## 2. Flow (build exactly this)

```
/login page:
  [ Continue with Google ]   ← primary, first
  ── ya phone number se ──
  [ existing name + phone + OTP form, unchanged ]

Google path:
  1. Click "Continue with Google" → Supabase signInWithOAuth({ provider: 'google' })
  2. Redirect back into the app, session established.
  3. Check: does a `profiles` row already exist linked to this auth user?
       YES → returning user → go straight to step 4 of the existing checkout
             flow (buy step / wherever they were headed), exactly like a
             returning phone-OTP user.
       NO  → first-ever login for this Google identity:
             a. Show "Confirm your mobile number" step (name pre-filled from
                Google, editable; phone field empty, required, 10-digit
                validated, NOT OTP-sent).
             b. On submit, check `profiles.phone` for an existing match:
                  MATCH FOUND    → do not create a row; show "already
                                    registered" message; route to phone-OTP
                                    login with number pre-filled (per 1c).
                  NO MATCH       → create `profiles` row (full_name, phone,
                                    linked to this auth user id) → continue
                                    into the same buy step as any new
                                    phone-OTP signup.

Phone-OTP path: unchanged — see SESSION_SIGNUP_FIRST_CHECKOUT_PROMPT.md §1.
```

---

## 3. Schema impact

No new tables. Changes:

- `profiles.phone`: add a `UNIQUE` constraint if one doesn't already exist
  (see §1d). Confirm no existing rows would violate it before adding —
  report back if any duplicates are found today (would mean the constraint
  can't go on cleanly and needs manual cleanup first).
- No changes to `subscriptions`, `family_members`, `plans`, `payments`.

---

## 4. API endpoints to build

```
POST /api/auth/complete-google-profile
    → { phone, full_name } (caller identified via existing Supabase session
       from the Google OAuth redirect, not re-authenticated)
    → checks `profiles.phone` for an existing row:
         match    → 409-style response with a code the frontend maps to the
                    "already registered, use phone login" message
         no match → creates `profiles` row linked to this session's user id,
                    returns success
```

Everything else (`request-otp`, `verify-otp`, `create-checkout`, the webhook)
is unchanged — do not touch those files as part of this session.

---

## 5. Frontend files to add/change

```
NEW    src/components/GoogleAuthButton.tsx   → wraps signInWithOAuth call
CHANGE src/routes/login.tsx                  → add Google button + divider
                                                above the existing form
NEW    src/routes/complete-profile.tsx       → the "confirm your phone
                                                number" step for first-time
                                                Google sign-ins (or a modal
                                                on top of login.tsx — your
                                                call, note which in summary)
NEW    src/lib/auth-api.ts (extend)          → thin client wrapper for
                                                complete-google-profile
```

---

## 6. Explicit constraints carried over (do not violate)

- Activation stays **webhook-driven only** — nothing here touches that.
- RLS stays authoritative; `complete-google-profile` must only ever write the
  calling session's own `profiles` row.
- Session persistence (30 days) applies identically regardless of which
  login method was used — no special-casing Google sessions.
- Do not build any account-merging logic (per §1c) — flag it as a future
  decision, don't attempt it.
- Copy stays Hinglish, matching existing site tone.
- Google OAuth requires a Google Cloud OAuth consent screen + client ID/secret
  configured in the Supabase dashboard (Authentication → Providers → Google)
  — that's a Chirayu action item (config, not code); call it out explicitly
  in the session summary if it isn't already set up, the same way the
  Turnstile keys and Supabase rate-limit setting were called out as
  Chirayu-side steps in the OTP-abuse session.

---

## 7. Definition of done / test checklist

- [ ] `/login` shows "Continue with Google" above the existing phone form
- [ ] First-ever Google sign-in → forced phone-confirm step → new `profiles`
      row created with that phone, no OTP sent
- [ ] Entering a phone number that already exists on another `profiles` row
      during the Google-confirm step does NOT create a duplicate — shows the
      "already registered" message and routes to phone-OTP login prefilled
- [ ] Returning Google user (already has a linked `profiles` row) skips the
      phone-confirm step entirely and lands straight on the buy step
- [ ] `profiles.phone` has a `UNIQUE` constraint (or existing duplicates were
      reported back before deciding it can't be added yet)
- [ ] Google-created profiles show up identically to phone-created ones in
      `/admin/subscribers`, the Sankalp-Pending call queue, and segment
      generation — no code path assumes every profile came from the phone-OTP
      form
- [ ] Session persistence, RLS scoping, and webhook-only activation all
      confirmed unaffected
- [ ] End-of-session summary: files touched, whether the confirm-phone step
      was built as a route or a modal, whether `profiles.phone` duplicates
      existed before the UNIQUE constraint, and anything left open (esp. the
      account-merge fast-follow noted in §1c)

---

*🚩 Sewa Hamari, Punya Aapka 🚩*
