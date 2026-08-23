# 🔍 PUNYATA — Code review: Telecaller Panel + Commission Engine

**Reviewed by:** Claude, against the actual repo files (not the session summary) · **Date:** 2026-08-22
**Session under review:** `SESSION_TELECALLER_PANEL_PROMPT.md`, Parts A and B
**Verdict:** Part A is ready to apply after two fixes. **Part B must not go near real money yet.**

---

## Rating

| Area | Score | Note |
|---|---|---|
| Part A — panel, queues, masking, gates | **8 / 10** | Genuinely well built. The hard part — not leaking data — is done properly |
| Security boundary | **6 / 10** | Excellent at the API layer, one **critical** hole at the database layer |
| Commission engine | **4 / 10** | The pure module is good. The reconciler that calls it re-implements the logic and diverges — multiple money-losing bugs |
| SQL / migration craft | **8 / 10** | Constraints, exclusion ranges, XOR checks, `SKIP LOCKED` all correct. One fatal omission |
| Honesty of the summary | **7 / 10** | Surfaced the open decision as asked. But "ALL CHECKS PASSED" oversells it — see below |
| **Overall** | **6.5 / 10** | Impressive breadth, real craft, and four bugs that would each have cost money |

### The meta-lesson, and it matters more than any single bug

`verify_commission_engine.ts` passed — and it was right to. It tests `commission-logic.ts`, which is
genuinely well written: zero imports, `nowMs` injected, correct rounding, correct rate resolution.

**But `reconcile.ts` doesn't consistently use it.** For yearly plans it hand-rolls the rate lookup
inline, and for hold maturation it hand-rolls the 30-day window. Those inline copies are where every
serious bug lives. The tests validated the library; production runs the copy.

**Rule for the next session:** if a pure function exists, the route must call it. An inline
re-implementation next to a tested helper is a defect on sight, even when it looks correct.

---

## 🔴 CRITICAL — fix before applying migration 013

### C1. Three `SECURITY DEFINER` functions are callable by any logged-in user

`supabase/migrations/20260822_013_leads_and_commissions.sql:285, :326, :354` create
`assign_leads()`, `roll_over_stale_leads()` and `expire_stale_leads()` as `SECURITY DEFINER`. There is
**no `REVOKE EXECUTE` anywhere in any migration** — I grepped all fourteen. Postgres therefore leaves
`EXECUTE` granted to `PUBLIC`, and PostgREST exposes every public function at `/rest/v1/rpc/<name>`.

`SECURITY DEFINER` means these run as the definer and **bypass the `leads: admin full access` RLS
policy entirely.** Gating `/api/admin/leads/assign` with `requireAdmin` is irrelevant — the RPC is
reachable directly with any authenticated JWT, including an ordinary subscriber's.

- `POST /rest/v1/rpc/assign_leads {"p_telecaller":"<any uuid>","p_count":500}` → self-assign 500
  leads, names and phone numbers included, then read them through the legitimate queue endpoint.
- `POST /rest/v1/rpc/expire_stale_leads {"p_days":0}` → destroy the entire `new` lead pipeline. The
  audit row it writes has `admin_id = NULL`, so you cannot even tell who did it.

**Fix:** in migration 013, after each function:

```sql
REVOKE EXECUTE ON FUNCTION public.assign_leads(uuid, int)        FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.roll_over_stale_leads(int)     FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_stale_leads(int)        FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_telecaller()                FROM public, anon, authenticated;
```

Then **audit every other `SECURITY DEFINER` function in the project** the same way — `is_admin()`
included — and add "does it have an explicit REVOKE?" to the migration checklist permanently. This
class of hole is invisible in the application code, which is exactly why it survived review until
someone read the SQL.

### C2. `log-call` accepts any `profile_id`, and `call_logs` is the commission key

`src/routes/api/telecaller/log-call.ts:69-72` accepts any well-formed uuid as `profile_id`. Nothing
checks that the person is in her tray, her queue, or has any relationship to her.

`reconcile.ts:266` then feeds `call_logs` into `resolveAttribution`, whose call-window path
(`commission-logic.ts:150-156`) awards the sale to `qualifying[0].calledBy` — last touch inside 30
days. Outcome is **not** consulted.

**The fraud:** page `/api/telecaller/queue/list` for `never_bought` (50 profile ids per call,
unlimited pages), then `POST log-call {"profile_id":"…","outcome":"no_answer"}` for every one. Every
person on that list who buys organically in the next 30 days pays her 20% plus trail, on a sale she
never made. Nothing rate-limits `log-call`.

The same endpoint (`:140`) also latches `profiles.do_not_call = true` on any uuid — a scripted sweep
removes your entire subscriber base from all thirteen queues, and only hand-written SQL can undo it.

**Fix, all three:**
1. `log-call` must verify the target is in the caller's own tray (assigned lead, or a `call_logs`
   row she already owns, or a subscription surfaced by a queue she is entitled to) — reject otherwise.
2. `resolveAttribution` must only count **contact-establishing** outcomes:
   `connected_interested`, `connected_completed`, `connected_partial`. A `no_answer` is not a touch.
3. Rate-limit `log-call` per caller per day, and require `identity_verified` for outcomes that
   mutate `profiles`.

Apply the same tray check to `/api/telecaller/person`, `family-members` and `proof-resend`, which
also accept arbitrary uuids today.

---

## 🟠 HIGH — money is wrong

### H1. Commission is calculated on the plan's list price, not the amount collected

`reconcile.ts:293`: `const pricePaise = sub.price_paise ?? pay.amount_paise` — `sub.price_paise`
comes from the joined `plans` row. A coupon'd sale therefore pays 20% of the **undiscounted** price.
The spec basis is the captured payment. **Swap the fallback order:** use `pay.amount_paise`, falling
back to the plan price only if the payment amount is missing.

### H2. Yearly plans never generate year-1 trail

`reconcile.ts:296-318` handles `isFirst` and then `continue`s. The yearly accrual block at `:320` is
only reachable when `isFirst === false` — i.e. the year-2 renewal. So for a Premium Annual
subscriber, months 2–12 of trail are silently never created for either party.

`dueYearlyAccrualPeriods()` is implemented correctly. It is simply wired to the wrong branch. Move
the yearly-accrual pass so it runs for the first captured payment too.

### H3. Yearly trail rate lookup ignores rate history

`reconcile.ts:333-338` uses `rates.find(r => … && r.effectiveFrom <= '<period>-01')` — no
`effective_to` filter, no ordering. `find` returns whatever row the driver happened to put first, so
a superseded rate can win and a promotion may never apply. There is also dead
`const appliedPct = …; void appliedPct;` at `:339-340` — an unfinished refactor left in place.

**Fix:** delete the inline lookup and call `resolveTrailPercent()`, which already does this correctly.
See the meta-lesson above.

### H4. Refund reversals duplicate on every reconciler run

The idempotency index is `… WHERE amount_paise > 0` (migration 013:236), which deliberately exempts
negative rows. `buildClawbacksForPayment` (`commission-logic.ts:419-426`) skips only entries already
`clawed_back` or `void` — it never checks whether a reversal for the original already exists, and the
original's status is unchanged on the reversal path, so it re-qualifies forever.

A nightly cron turns one refund into thirty negative entries a month. **Fix:** add a second partial
unique index covering reversals (e.g. on `(payment_id, agent_id, profile_id, kind, payout_period)`
`WHERE amount_paise < 0`), and make the builder skip originals that already have one.

### H5. Refund-then-repay pays the 20% bonus twice

`isFirst` is derived from the captured list, which excludes refunded payments (`:204, :281`). Refund
month 1, and month 2 becomes "first" — a second `first_deal` entry under a different `payment_id`, so
the unique index cannot stop it. Track "has this subscription ever had a first-deal entry" instead of
inferring it from the current captured set.

### H6. Insert failures are silently discarded

`:398-402` and `:430-434` swallow every error via `.then(undefined, () => …)` and still report
`ok: true`. One bad row kills its whole 200-row chunk, invisibly. And
`commission_entries_amount_sign_check` (`CHECK amount_paise <> 0`, sql:221) **will** fire whenever a
small base rounds to zero paise — a ₹251 plan at 1% is 2.51 paise, and a 1/12 accrual of it rounds to
0. Surface these errors and decide explicitly what a zero-value entry should do.

### H7. Locked periods are enforced in one place only

Pass 3 (`:407-423`) flips `held → payable` with **no** `isPeriodLocked` check, editing rows in a
locked month. It also hardcodes `30` instead of `FIRST_DEAL_HOLD_DAYS`. More broadly, there is no
database trigger preventing `UPDATE`/`DELETE` on `commission_entries` or inserts into a locked
period — the append-only guarantee and the lock both rest entirely on one endpoint remembering to
check. Add a trigger so the invariant is structural.

### H8. The "cannot re-sell an existing customer" rule is dead code

`reconcile.ts:246-250` tests `s.status === "active"`, but the subscriptions select at `:95-99` never
selects `status`. It is always `undefined`, so `priorActive` is **always false** and the whole
anti-gaming branch is unreachable. `SubRow.status: string` hid it from the type checker.

**Add `status` to the select.** Then check whether any other §9.2 rule is similarly inert — a rule
that compiles is not a rule that runs.

### H9. `send-payment-link` binds an unvalidated token to an unrelated profile

`send-payment-link.ts:58-59, :122-128` — neither `attribution_token` nor `profile_id` is checked
against the other or against her tray. She can send a link carrying her own lead's token to a
stranger, and `subscriptions-checkout.server.ts:142-147` then stamps `telecaller_id` write-once.
Validate that the token's lead belongs to the caller **and** matches the target profile.

---

## 🟡 MEDIUM

- **Payout period is computed in UTC** (`periodOf`, `:221`). An IST payment at 20:00 on 31 Aug is
  1 Sept locally but lands in period `2026-08`. Convert to Asia/Kolkata before slicing — month-boundary
  payouts will otherwise be argued about.
- **Rate backfill skips agents** with `NULL` or `>25` `commission_percent` (sql:390), who then
  silently fall through to `DEFAULT_TRAIL_PERCENT = 1`. Either backfill everyone or fail loudly.
- **Organic subscriptions are never stamped** (`:268` writes only when there is a telecaller or a
  rejection reason), so `attribution_source` stays NULL and they are re-resolved on every run.
- **`create-lead`'s 30/day limit is TOCTOU** (`create-lead.ts:51-63`) — count-then-insert, so
  concurrent posts overshoot. Enforce it in the database.
- **`leads.attribution_token` has no expiry or single-use column** (sql:101), and the reconciler
  passes `tokenContext: null` (`:254`) — so the token path, which the spec calls the primary and
  deterministic one, is not actually exercised there at all. Worth confirming end-to-end.
- **Raw DB error text is returned to the client** throughout (`json({error: err.message})`), leaking
  column and constraint names. Log server-side, return a generic message.
- **`fetchAllRows` full-table scans** of payments, subscriptions, entries and call_logs on every
  reconciler run. Fine now, not at 10k subscribers. Add a watermark.
- **Stray file `src/routes/telecaller.queue..tsx`** — 5 bytes, BOM + CRLF only. Delete it.

---

## ✅ What is genuinely well done — keep doing this

Credit where it is due; most of this is the part that is hard to get right.

- **`is_admin()` is untouched.** Verified by grep across all fourteen migrations. Migration 012 adds
  only the unwired `is_telecaller()` primitive, exactly as specified. The single most dangerous
  shortcut available was not taken.
- **No field leakage in any response.** Zero `select("*")` under `api/telecaller`. Every query is
  built from `TC_*_COLS` allowlists, `amount_paise` is never even fetched, and
  `stripMaskedFieldsDeep` is applied on **every** return path in all thirteen handlers — including
  early returns, which is where this normally breaks.
- **`/api/telecaller/earnings` is JWT-only** (`earnings.ts:42` doesn't parse a body at all; `:51`
  filters on `auth.callerId`). Passing someone else's uuid is structurally impossible, not merely
  rejected. That is the right way to build it.
- **`profiles.phone` is rejected by a closed allowlist** in `family-validation.ts:137`, so `role` and
  everything else is unreachable by construction rather than by enumeration.
- **`writeTelecallerAudit` throws on failure**, so a write cannot succeed without its trail. All
  seven mutating endpoints call it.
- **The pure/impure split in `commission-logic.ts` is real** — zero imports, injected `nowMs`,
  `roundHalfUp` applied per entry and never to a total, `base_paise` stored alongside every entry so
  any figure can be re-derived and argued about with evidence.
- **`FIRST_DEAL_PERCENT` is fixed at 20 and still written into `percent_applied`** — the subtlety
  from the spec was understood and implemented.
- **SQL craft:** `NULLS NOT DISTINCT` on the idempotency index, `btree_gist` exclusion constraint
  preventing overlapping rate periods, `kind = 'trail'` CHECK excluding first-deal rows, XOR
  beneficiary checks, `paid_at` biconditional, `ON DELETE RESTRICT` on ledger FKs, and
  `FOR UPDATE SKIP LOCKED` in `assign_leads`. This is careful work.
- **The `/admin` `beforeLoad` guard was added** as asked, and the open `FIRST_DEAL_BASE_YEARLY`
  decision was surfaced rather than silently picked.

---

## Recommended order of work

1. **C1** and **C2** — before migration 013 touches Staging. C1 is a four-line fix.
2. **H8**, **H1**, **H3** — one-line-ish fixes with real consequences.
3. **H2**, **H4**, **H5**, **H7** — the ledger correctness cluster. Re-run the worked example
   afterwards **with a yearly plan**, which is the case the existing example never covered.
4. **H6**, **H9**, then the medium list.
5. Only then apply 012 + 013 to Staging and walk the panel end to end.

Do not run the reconciler against real payments until H1–H8 are closed. Everything else in this
document can wait; those cannot.

---

*🚩 Sewa Hamari, Punya Aapka 🚩*
