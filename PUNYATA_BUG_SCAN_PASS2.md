# Punyata — Full Repo Bug Scan, PASS 2

**Date:** 2026-08-24 · **Scope:** entire repo (`src/routes/**`, `src/lib/**`, `src/components/**`, `src/hooks/**`, root app files, `supabase/migrations/**`) · **Mode:** find-and-report only, nothing modified.

**Context:** this pass re-scanned the codebase *after* commit `2e22f12` (the 47-finding hardening pass). Prior fixes were spot-verified: splash timer, `key={pathname}`, PunyaMeter denominator, ribbon regex, commissions Entries count, IST failed-payments window, LottieIcon classes, plans-sevas addon re-fetch — all correctly applied. However, the scan found **60 new/remaining defects**, including **two criticals in the fix migrations themselves** (one makes migration 014 unappliable as written; one makes batch refresh impossible). Items marked ✓ were independently verified line-by-line during this report's preparation; all other items carry quoted evidence from full-file reads.

---

## 1. SQL Migrations / Schema (supabase/migrations)

### CRITICAL

**S1.✓ — Migration 014 aborts: REVOKE/COMMENT target a non-existent signature**
File: `20260823_014_hospitals_perf.sql` lines 214–218
`reallot_hospital` is created with four params (lines 175–180: `p_hospital uuid, p_agent uuid, p_reason text DEFAULT 'reallotment', p_set_by uuid DEFAULT NULL`). Defaults are not part of a function's identity, so the only signature is `(uuid, uuid, text, uuid)`. But the migration then runs:
```sql
REVOKE EXECUTE ON FUNCTION public.reallot_hospital(uuid, uuid, text) FROM public, anon, authenticated;
COMMENT ON FUNCTION public.reallot_hospital(uuid, uuid, text) IS '…';
```
A partial arg-list is an exact-signature lookup → `ERROR 42883 function … does not exist`; `REVOKE` has no IF EXISTS. Every other REVOKE in the repo matches its full signature.
**Failure:** `supabase db push` runs each file in one transaction; statement at line 214 throws → whole migration rolls back and is marked failed. Hospitals, `agent_hospital_allotments`, hospital columns on `leads`, `current_hospital_agent()` never exist; every `/api/admin/hospitals/*` call fails at runtime until hand-repaired. If this file was previously applied via a manual workaround, the defect still blocks any fresh-environment rebuild.

**S2.✓ — `generate_sankalp_batch()` ON CONFLICT rewrites the batch primary key**
File: `20260824_018_bugfix_hardening.sql` lines 503–508
```sql
ON CONFLICT (batch_date, batch_type)
    DO UPDATE SET id = EXCLUDED.id      -- id is NOT a conflict column
RETURNING b.id, b.status, (xmax = 0) AS inserted;
```
On any conflict, the existing row's PK is reassigned to the loser's freshly generated `gen_random_uuid()`. Child tables (`sankalp_batch_subscriptions.batch_id`, `name_segments.batch_id`, `proof_deliveries.batch_id`) reference it with `ON DELETE CASCADE` + default `ON UPDATE NO ACTION`.
**Failure:** generate Aug batch (row + N members) → new activations arrive → admin re-runs "generate" to refresh (the documented path) → RPC hits the conflict path → FK violation `23503` on `sankalp_batch_subscriptions` → route 500s. **Refreshing any existing batch with members is impossible** — a self-inflicted regression of exactly what §14 of 018 set out to fix. Fix is one word: `DO NOTHING`.

### HIGH

**S3.✓ — `is_owner()` EXECUTE-revoked from `authenticated`, yet five RLS policies call it**
File: `20260824_018_bugfix_hardening.sql` lines 61–62 vs 141–164
`is_owner()` is SECURITY DEFINER (so its body runs fine), but EXECUTE privilege is checked against the *caller* before the body runs. The migration revokes it from `authenticated` while creating `USING (public.is_owner())` policies on `payments`, `sales_agents`, `commission_entries`, `staff_commission_rates`, `commission_payout_periods`. No GRANT exists anywhere else in the migrations. The inline comment ("nothing in a policy evaluated for plain users calls is_owner()") is wrong — these policies evaluate whenever an authenticated-role JWT touches those tables, and the error is fatal, not filter-y.
**Failure (verified call sites):** owner opens `/admin/commissions` → browser `supabase.from("commission_entries")…` (`admin.commissions.tsx:56–64`) → `permission denied for function public.is_owner()` → page errors/renders empty. Same for `sales_agents` dropdowns (`admin.leads.tsx:64`, `admin.subscribers.tsx:941–945`), payments tab (`admin.subscribers.tsx:391–397`), failed-payments count (`admin.overview.tsx:234–243`). Service-role paths keep working, which is why server-only testing misses it.

### MEDIUM

**S4.✓ — Blocked OTP attempts consume the 24-hour phone quota**
Files: `20260824_018_bugfix_hardening.sql` lines 608–642; ledger semantics from `20260823_016_otp_rate_limit.sql`
The ledger stores every attempt (blocked rows inserted too — lines 636–642 write `v_blocked IS NULL`), but the counters do plain `COUNT(*)` with no `WHERE allowed` filter, although `OTP_RATE_LIMITS` in `auth.server.ts` documents caps on **sends**.
**Failure:** user requests 3 OTPs then retries 5 times (each blocked + logged) → daily counter sees 8 rows within ~6 min → locked out for up to 24 h despite 3 real SMS. Also lets an attacker keep a victim's number permanently capped with zero SMS cost.

**S5. — Commission opening-rate backfill silently drops legacy agents above 25%**
File: `20260822_013_leads_and_commissions.sql` lines 157 (CHECK ≤ 25), 509–517 (backfill)
Backfill selects `WHERE sa.commission_percent BETWEEN 0 AND 25` — agents seeded above 25 get no `staff_commission_rates` opening row and no warning. Trail rates resolve exclusively from that table.
**Failure:** legacy agent with `commission_percent = 30` → reconciler finds no rate → zero trail entries forever, silently.

### LOW

**S6. — Teardown misses both hospitals-session functions** — `000_teardown.sql` omits `current_hospital_agent(uuid)` and `reallot_hospital(uuid,uuid,text,uuid)` added by 014, contradicting its own completeness claim.

**S7. — Coupon amount constraints half-missing** — 018 adds the percent-range CHECK but flat-type `discount_value` remains unconstrained (negative legal) and 0% percent coupons pass. App clamp in `coupons.server.ts` prevents damage today.

**S8. — `redeem_coupon` scalar return consumed via `.single()`** — function `RETURNS int` (018:564–576); call site `subscriptions-checkout.server.ts:262–264` uses `.single()` (object profile). PostgREST may reject object-profile for scalars (`PGRST116`, which doesn't match the route's tolerance regex) — needs runtime confirmation; sibling scalar RPC `assign_leads` is called without `.single()`.

**S9. — Escalation trigger is INSERT-only** — `trg_call_logs_escalate` (018:331–334) never fires on UPDATE; a complaint edited into existence later stays off the "Needs Chirayu" index.

**S10. — Redundant indexes** — `idx_coupons_code` duplicates `coupons.code UNIQUE`; `idx_sbs_batch_id` duplicates leading column of `UNIQUE(batch_id, subscription_id)`.

---

## 2. Payments / Webhooks / Checkout / Auth (server)

### HIGH

**P1.✓ — Concurrent reconciler runs still double-pay the 20% first-deal bonus**
File: `src/routes/api/admin/commissions/reconcile.ts` lines 246–248, 318, 350–355; index `20260822_013…sql:233–236`
The [Bug 2.1] fix claims `first_deal` **in-memory, intra-run** only. Two overlapping runs (nightly cron ∥ owner clicking Reconcile) both read the ledger before either inserts; both compute `isFirst === true`. The unique index keys on `(payment_id, agent_id, …)` — two first_deal rows for one *subscription* via *different payments* never collide.
**Failure:** subscription has captured payments P1, P2 and no first_deal yet. Run A inserts `first_deal(P1)`; run B generates `first_deal(P1)` (collides, chunk insert fails wholesale) **and** `first_deal(P2)` (inserts cleanly) → bonus paid twice permanently; the wholesale chunk failure also silently drops legitimate trail entries from that run.

**P2.✓ — Webhook status patches written with no status guard; out-of-order events can resurrect terminal states**
File: `src/lib/razorpay-webhook.server.ts` lines 587–619
Demotion path guards `.eq("status","active")` (line 581), but the patch update (lines 600–604) is `.eq("id", sub.id)` only, based on a status read earlier in the handler. `terminalBlocked` protects only `active`-producing events against locally cancelled/expired.
**Failure (a):** `paused` retry arriving after `cancelled` was processed → final status `paused` (cancelled mandate back in callable queue). **(b):** concurrent `resumed` + `cancelled` deliveries: both read `active`; whichever lands last wins — a delayed resume after cancellation leaves the sub active. No event-dedup table or monotonic guard exists.

### MEDIUM

**P3. — Exhausted coupon returns HTTP 500 with raw driver error; error paths orphan Razorpay objects**
File: `src/lib/subscriptions-checkout.server.ts` lines 262–271
Cap-reached between validate and redeem → `redeem_coupon` updates 0 rows → PostgREST `PGRST116` on `.single()`, which matches neither `pgrst202|42P01|does not exist` → 500 branch with internal message leaked. The intended 400 branch (`redeemed === null`) is unreachable for the exact scenario its comment describes. Additionally the already-created Razorpay subscription (line 234) is never cancelled on this and other error-path deletes (line 284).

**P4. — `refund_amount_paise` semantics split-brain: per-refund writer, cumulative reader**
Files: `src/lib/razorpay-webhook.server.ts` lines 345–360, 467 (writer stores *this* refund's amount/id, overwrite on second refund) vs `src/routes/api/admin/payments/refund.ts` lines 87–100 (validator reads it as cumulative).
**Failure:** ₹1000 payment; two ₹400 partial refunds → DB claims only ₹400 ever refunded → third attempt validates remaining as ₹600 even though ₹800 is gone; only Razorpay's own ceiling prevents over-refund; first refund id lost from ledger.

**P5. — Attribution-carrying checkouts bypass pending-row reuse: double-click mints duplicate Razorpay subscriptions and burns coupon redemptions**
Files: `subscriptions-checkout.server.ts` lines 140–186 (`carriesAttribution` short-circuits reuse); `api/telecaller/send-payment-link.ts` lines 218–224 (always sets `acquisitionChannel:"telecall"` ⇒ always carries attribution); redemption increment lines 261–271.
**Failure:** telecaller double-clicks Send link → two subscriptions rows, two Razorpay Subscription objects, two WhatsApp links for one customer; with a coupon, `times_redeemed` increments twice — a max=10 code can be fully consumed by unpaid double-clicks.

**P6. — Retire-before-create flows leave the customer cancelled with nothing when creation fails**
Files: `api/admin/subscriptions/reissue-link.ts` lines 85–109; `api/telecaller/send-payment-link.ts` lines 113–141, 218
Guarded UPDATE serializes racers, but retirement commits before `createCheckoutForUser()` runs; a 404/503 (plan unconfigured, Razorpay 5xx) leaves the old halted row `cancelled(mandate_dead_reissued)` with no replacement — subscriber vanishes from recovery queues.

**P7. — Silent PostgREST 1000-row truncation on financial aggregates and dedupe scans**
Files: `api/admin/overview-financials.ts:37–48` (MRR/revenue), `api/admin/sales-agents/list.ts:42`, `api/admin/leads/upload.ts:95–117` (open-lead dedupe + unchunked `.in()`), `api/telecaller/earnings.ts:44–52` — none use the repo's own `fetchAllRows`.
**Failure:** >1000 active subs → owner MRR under-reports with no error; CSV upload beyond open-lead row 1000 passes dedupe → duplicate lead worked and paid twice; veteran telecaller lifetime earnings go stale past 1000 entries.

### LOW

**P9. — Refund endpoint has no submit-idempotency** — `refund.ts:61–110`: double-click fires two Razorpay refunds (no idempotency key/pending latch) → double refund executed.

**P10. — Count-then-insert daily limits racy in log-call/create-lead** — `log-call.ts:107–118`, `create-lead.ts:46–63` (contrast atomic `otp_check_and_log`); log-call also uses rolling `now()−24h` where its comment says per-IST-day.

**P11. — Unvalidated request shapes reach Postgres** — `payments/list.ts:85` (`filters` unchecked, garbage dates → PostgREST 500 verbatim); `leads/upload.ts:50–54`, `assign.ts:26–28` validate uuid by `length === 36` only.

**P12. — Client-supplied IP headers gate the per-IP OTP limit** — `request-otp.ts:26–36` falls back to attacker-controlled XFF when `cf-connecting-ip` absent; per-phone caps still bound SMS-bombing, hence low.

**P13. — Google sign-up can squat any unclaimed phone number** — `complete-google-profile.ts:43–88`; documented trade-off, flagged for awareness.

**P14. — `named_agent_id` accepted without existence/active check** — `log-call.ts:227–242`; misattribution pollutes performance views.

---

## 3. Lib Business Logic / Hooks

### HIGH

**L1.✓ — Commission `payout_period` derived in UTC, violating the app-wide IST rule**
Files: `src/lib/commission-logic.ts:250–252` (`periodOf` slices raw ISO) consumed at reconcile.ts:209/333 and `dueYearlyAccrualPeriods`; contrast `performance-logic.ts:33–38` (`istPeriodOf`, header mandates Asia/Kolkata bucketing). `telecaller/earnings.ts:72–74` uses the same helper for "this month".
**Failure:** payment captured `2026-08-31T20:00Z` (= Sep 1, 01:30 IST) books its first-deal/trail to period `2026-08`; if August is already locked, the entry is skipped forever (`skippedLocked`) and the telecaller silently loses the commission; yearly accrual ladder shifts one month early.

### MEDIUM

**L2.✓(logic) — `nextBatchCutoff` reads "today" from the UTC calendar date**
File: `src/lib/telecaller-logic.ts:491–519`
`todayIso` built from `getUTC*()` while cutoff is IST midnight. Between 00:00–05:30 IST the UTC date lags one day: if the Second Tuesday just passed, `todayIso <= tueIso` holds and the function returns the already-past Tuesday with negative `cutoffHoursRemaining`.
**Failure:** Wed 02:00 IST after 2nd Tue → dashboard shows a stale past batch and `matchesCutoffRisk` (`remaining > 0`) silently empties the cutoff_risk queue for up to 5.5 h.

**L3. — `isHawanSeva` regexes diverge between the two modules that must never disagree**
Files: `plans-schedule.ts:68–70` (`/hawan|havan/i`) vs `sankalp-logic.ts:156–158` (`/hawan/i` only). Both headers demand mirror parity. A seva named/spelled "havan" is hawan-classified on the plan page but hawan-INeligible in batch generation → plan sold as List B, subscribers processed via Basic catch-up. Partial regression of fixed Bug 4.5's intent.

**L4. — `resolveTrailPercent` treats `effectiveTo` as inclusive, contradicting documented `[from, to)`**
File: `commission-logic.ts:227–240` (`r.effectiveTo >= monthStartIso`). Back-dating an old rate row to end exactly on the payout month's first day keeps paying the OLD percent for that month — payout-dispute class bug.

### LOW

**L5. — `validateFamilyMembers` throws TypeError on non-object elements** — `family-validation.ts:64–65`: `{"members":[null]}` → `(null).slot_number` crash instead of the contract'd `{ok:false}`.

**L6. — `callUserApi`/`callAdminApi` parse `res.json()` without catch** — `auth-api.ts:136`, `admin-api.ts:38`: non-JSON response → opaque SyntaxError with no `status`, breaking callers' error branching (pairs with L7).

**L7. — `start.ts` middleware returns HTML error page for API routes** — `start.ts:5–18`: thrown plain Errors yield HTML 500 instead of JSON.

**L8. — `useLanguage` reads localStorage during first render → SSR hydration mismatch** — `translations.ts:177–196`; English-locale browsers force a full client re-render of SSR'd Hindi marketing pages.

**L9. — `useRevealOnScroll`: one-shot DOM query + untracked timers; latent opacity-0 trap** — `use-reveal-on-scroll.ts:9–32`; currently dead code (no element uses bare `.reveal`), sitting on a foot-gun.

**L10. — Join-date fallback slices UTC date** — `sankalp-logic.ts:200–204`, mirrored `reports-logic.ts:277,303`: `created_at.slice(0,10)` flips strict catch-up comparisons for activations in the 00:00–05:30 IST band.

**L11. — Two divergent MRR implementations** — `financials-logic.ts:34` (per-sub rounding) vs `reports-logic.ts:218–223` (fractional): Overview vs Reports MRR can differ by up to ±N×0.5 paise.

**L12. — Telecaller lens counts leads without range filter** — `performance-logic.ts:247,274,315`: contactRate computed over ALL-TIME leads while calls are window-filtered (hospital lens does it right at :423–425); fair-sample guard also uses all-time volume.

**L13. — `formatINR` renders ₹251.5 (single decimal)** — `plans.ts:324–330`: asymmetric fraction digits vs bank-statement ₹251.50.

**L14. — Auth-state gaps in session/role hooks** — `use-session.ts:53–62` ignores SIGNED_IN; `use-user-role.ts:12–27` has no auth listener → stale role/profile until manual refresh.

**L15. — Doc rot** — `commission-logic.ts:370` references non-existent `buildYearlyAccrualSchedule`; `telecaller-logic.ts:97–111` says "twelve queues" but there are 13.

---

## 4. Frontend Routes / Components

### HIGH

**F1.✓ — `/subscription-success` form mounts empty before fetch resolves → saving wipes saved family members**
File: `src/routes/subscription-success.tsx` lines 41–89 (effect), 133–143 (render)
Mount effect takes the `!userId` branch → `setLoading(false)`. When the session resolves, React re-renders (loading=false, sessionLoading=false, ref present) **before** the effect's async ownership+members query completes → `<FamilyAddressForm initialMembers={[]}>` mounts and seeds its state via `useState(() => seedMembers(initialMembers))` (`profile-completion.tsx:81`), ignoring later prop changes.
**Failure:** paying user with 4 saved names re-opens the page → sees ONE blank card after ~300 ms; typing one name and hitting Save submits `[{slot_number:1}]` → the [Bug 3.1] server-side slot-pruning deletes the other three saved rows. Data-loss path via pure UI staleness.

### MEDIUM

**F2.✓ — Admin nav "Seva Proofs" points to a non-existent route** — `admin.tsx:53` (`href:"/admin/proofs"`); no such route registered → guaranteed 404 on click.

**F3.✓ — Overview pending-batches "today" still UTC (incomplete [Bug 2.5] fix)** — `admin.overview.tsx:168,250`: `toISOString().split("T")[0]` while the sibling failed-payments window was correctly IST-fixed; batches dated "today" IST are excluded until 05:30 IST (~5.5 h/day understated).

**F4. — Owner chart fabricates 7 months of synthetic data** — `admin.overview.tsx:326–334`: invented multipliers on one real number presented as monthly Revenue/MRR progression, unlabeled as synthetic.

**F5. — Telecaller queue "Load more" lacks `disabled={loading}`** — `telecaller.queue.$queueKey.tsx:167–173`: rapid double-click appends the same page twice (both handlers append pre-commit cursor state) → caller dials a person listed twice.

**F6. — Empty callback datetime throws inside request construction** — `telecaller.person.$subscriptionId.tsx:422–424`, `telecaller.lead.$leadId.tsx:188–190`: untouched `datetime-local` → `new Date("").toISOString()` RangeError surfaced as generic failure instead of "pick a time"; no client validation.

**F7. — Sankalp-lists passes ALL active subscription ids in one unchunked `.in()`** — `admin.sankalp-lists.tsx:317–324`; sibling pages chunk at 200 citing URL limits; breaks at a few thousand actives.

**F8. — Seva rename/deactivate never regenerates `plans.features`** — `admin.plans-sevas.tsx:48–68` regeneration wired only to matrix/addon toggles (:202, :762), not `SevasCrud.handleSaveEdit` (:475–479) → public surfaces show the old seva string indefinitely.

**F9.✓(site) — `Math.round(price_paise/100)` regression on subscriber-facing price displays** — `my-subscription.tsx:186` (verified), `profile.tsx:233` — same rounding family the [Bug 4.6]/formatINR fix explicitly called a pricing mismatch (₹251.50 shows as ₹252 here only).

### LOW

**F10.✓ — HTML entity inside JS string renders literally** — `admin.commissions.tsx:221`: button reads "Lock &amp; pay".

**F11. — Swallowed error in proof MarkCompletedButton** — `admin.proof-upload.tsx:869–871`: silent catch, zero feedback, batch stays pending.

**F12. — Reports default month built from viewer-local time** — `admin.reports.tsx:200–201`, inconsistent with the page's own IST `monthWindow`.

**F13. — Unkeyed fragment around table rows** — `admin.subscribers.tsx:1308,1310,1432`.

**F14. — Stale-closure defaults in `loadCatalogues` clobber admin's hospital pick** — `admin.leads.tsx:60–85` (`useCallback([],…)` reading first-render state).

**F15. — ComparisonTable rounds monthly-equivalent** — `ComparisonTable.tsx:110` (`Math.round(priceNumeric/12)`).

**F16. — UTC-parse display skew for non-IST viewers** — `new Date("YYYY-MM-DD")` parsed UTC midnight rendered local in `my-subscription.tsx:47–53`, `profile.tsx:44–50`, `admin.subscribers.tsx:196–202`, `admin.sankalp-lists.tsx:599–605` (correct pattern exists at `reports-logic.ts:113`).

**F17. — `useBlocker` early-return discards typed edits without confirm** — `telecaller.person.$subscriptionId.tsx:318–323`: returns when `outcome === ""` even if notes/family/address were touched, contradicting the adjacent comment.

**F18. — SevaFlow reveal timers not cleared on unmount** — `SevaFlow.tsx:70–77`.

**F19. — Orphaned empty file `telecaller.queue..tsx`** — dead artifact, not registered in routeTree.

**F20. — Garbage class `"space-[#space-y-6] space-y-6"`** — `admin.overview.tsx:339`.

**F21. — profile-completion UX/validation gaps** — `profile-completion.tsx:100–143`: all-or-nothing address validation silently disables Save when partially filled; two-step save shows "nothing saved"-style error after members actually saved.

**F22. — profile.tsx loadData race seeds member form from empty array** — `profile.tsx:287–308`: `subs` set before `membersBySub`; open form never re-seeds after `onSaved → loadData`.

---

## Summary

| Severity | Count | Items |
|---|---|---|
| Critical | 2 | S1 (migration 014 unappliable), S2 (batch refresh FK-violates) |
| High | 5 | S3, P1, P2, F1, L1 |
| Medium | 17 | S4, S5, P3, P4, P5, P6, P7, L2, L3, L4, F2, F3, F4, F5, F6, F7, F8, F9* |
| Low | 36 | S6–S10, P9–P14, L5–L15, F10–F22 |

*\*F-count note: F2–F9 are 8 mediums; totals reflect merged duplicates (periodOf counted once across areas).*

**Critical items at a glance:** applying migration 014 as written aborts at its REVOKE (S1); once applied, sankalp batch refresh always FK-fails due to `DO UPDATE SET id = EXCLUDED.id` (S2). Fixing S2 is a one-word change (`DO NOTHING`); S3 needs either a GRANT of EXECUTE to `authenticated` or dropping the revoke; S1 needs the full 4-arg signature on lines 214–218.

> **Status: reported only — no files modified**, per the task ground rules. All 60 findings point to code actually read this pass; ✓ items were additionally re-verified directly against source while compiling this report.

---

# Pass 2 — VERIFICATION RESULTS (2026-08-24)

Every one of the 60 findings was independently re-verified against source by a second full-read pass over each cited file (whole functions, not snippets). Verdicts: **CONFIRMED** (accurate as reported), **ADJUSTED** (real, with corrected details/severity), **REFUTED** (not a live bug), **RESOLVED** (answered by verification itself).

## Verdict table

| ID | Verdict | Notes |
|---|---|---|
| S1 | CONFIRMED | 4-arg def (014:175–180) vs 3-arg REVOKE/COMMENT (:214–218); repo's own REVOKEs in 013/016/018 all use full signatures incl. defaulted params — only 014 violates this; first failure = line 214, nothing earlier masks it. Stays **Critical** (deploy-blocking for any fresh environment; verifier notes High if 014 was already hand-applied somewhere). |
| S2 | CONFIRMED | Clause quoted verbatim at 018:503–508; `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` (002:51) is not in the conflict target; child FKs default `ON UPDATE NO ACTION`. Two corrections folded in: **(a)** a fourth FK exists from `seva_proofs.batch_id` (002:192–196); **(b)** the surviving uniqueness is 010's unique *index* `sankalp_batches_type_date_uniq`, not 002's constraint (004 dropped it) — inference still valid, so the mechanism claim stands. Refresh of any non-empty batch → 23503. **Critical** confirmed. |
| S3 | CONFIRMED | (✓ in original pass.) No `GRANT EXECUTE` for these functions exists anywhere in migrations. |
| S4 | CONFIRMED | All three counters lack an `allowed` filter (018:608–630) while blocked rows persist (:636–642); `OTP_RATE_LIMITS` documented as sends (auth.server.ts:45–52). Lock ordering phone→IP deadlock-free as claimed. Not a 018 regression (016 counted the same way). Medium holds. |
| S5 | CONFIRMED | CHECK ≤25 (013:157), backfill predicate (013:513), legacy column unbounded (001:77). Severity-relevant correction: skipped agents do NOT fall back to their legacy rate — `resolveTrailPercent` returns flat `DEFAULT_TRAIL_PERCENT = 1%`. Exposure data-dependent (only out-of-range seeded agents). Medium holds. |
| S6 | CONFIRMED | Teardown drop list (000:52–65) quoted in full; both 014 functions absent; tables dropping does not drop functions. Low–Medium. |
| S7 | CONFIRMED | Percent-only range CHECK (018:229–232, `BETWEEN` admits 0%, NOT VALID); flat values unconstrained (001:165–166); app clamp verified at coupons.server.ts:106 with `chargePaise` pinned to plan price — damage contained today. Low holds. |
| S8 | **RESOLVED (refuted)** | The open question ("may need runtime confirmation") is answered statically by the P3 investigation: PostgREST serves scalar RPCs as bare JSON values and emits literal `null` even under `Accept: application/vnd.pgrst.object+json` (`coalesce(json_agg(...)->0,'null')`), and postgrest-js synthesizes PGRST116 only when `data` is an Array. So `.rpc("redeem_coupon").single()` yields `{data:null,error:null}` on exhaustion → the intended 400 branch IS reachable. No defect. |
| S9 | **REFUTED (as live bug)** | Trigger is INSERT-only (018:331–334), but no UPDATE path to `call_logs.outcome` exists anywhere: log-call inserts only with correct insert-time escalation (log-call.ts:147,164); repo-wide grep shows zero `.from("call_logs").update()` chains; the only RLS policy on call_logs is SELECT (012:250–251), so client UPDATEs are denied outright. Reclassified **informational hardening gap**. |
| S10 | CONFIRMED | Both duplicates quoted (001:612 vs UNIQUE 001:164; 002:274–275 vs UNIQUE 002:116); two more redundant indexes found (004:76–77, 002:264–265). Low. |
| P1 / P2 | CONFIRMED | (✓ in original pass.) |
| P3 | **ADJUSTED** | First half **refuted**: scalar RPC zero-rows → `{data:null, error:null}` → line 269's `400 "Coupon code valid nahi hai."` fires exactly as designed; no message leak. Second half **confirmed and worse**: Razorpay subscription created at :234 precedes the redeem attempt; catch block (:282–286) deletes only the DB row while `razorpay_sub_id` is already persisted (:241–249) → live orphaned Razorpay objects whose webhooks resolve to nothing (`ignored_unknown_subscription`); same gap on the link-failure throw (:253). `razorpay.server.ts` has no cancel API at all. Net severity stays **Medium**. |
| P4 | CONFIRMED | Writer comment literally says "THIS refund's amount (not cumulative)" (webhook :144) yet update overwrites (:467); reader treats cumulative (refund.ts:87–88); schema single UNIQUE rfnd id (017:38,54). Mitigation noted: Razorpay's own ceiling blocks actual over-refund. Medium holds. |
| P5 | CONFIRMED | Gate at checkout lib :140–154; send-payment-link always attributed (:222). One scope narrowing: telecaller flow rejects coupons (send-payment-link.ts:76–78), so redemption burn applies to public coupon-bearing checkouts only. Medium-High. |
| P6 | CONFIRMED | Retire commits before create in both flows; neither catch restores status (reissue-link:148–151; send-link:286–290); recovery surfaces key on `status==='halted'` so a cancelled row vanishes everywhere. Medium. |
| P7 | CONFIRMED | Cap documented + `fetchAllRows` provided in supabase.ts:32–51; all four sites unpaged while payments/list.ts uses the helper correctly twice (96–107,129–138) — pattern known, skipped here. Medium (scale-dependent: bites at >1000 rows/subs). |
| P9 | CONFIRMED (**upgraded to Medium**) | Guards exist (status captured, not full, amount ≤ remaining) but no idempotency latch anywhere; two rapid requests read identical pre-webhook state and both dispatch refunds; excess bounded only by Razorpay's cumulative ceiling. Owner-only surface limits exposure. |
| P10 | CONFIRMED | Comment says "per caller per IST day" (log-call:37–38) vs rolling `now()−24h` query (:111); count-then-insert unlocked on both routes. Low. |
| P11 | CONFIRMED | Corrected lines: filters unchecked at list.ts:85, interpolated at :60, raw Postgres error surfaced at :151–153; upload.ts length-36 checks at :49–56 (and unlike hospital_id, `source_agent_id` gets NO existence check before stamping); assign.ts:25–28 (downstream existence+role check exists but junk 36-char strings still 500 on uuid cast). Low–Medium. |
| P12 | CONFIRMED | Header chain cf→XFF→x-real-ip quoted verbatim (request-otp:26–36); feeds Turnstile gating + IP limiter. Low. |
| P13 | CONFIRMED (**upgraded to High**) | End-to-end collision path verified: no OTP on attached phone (documented trade-off, complete-google-profile:12–14), `profiles.phone UNIQUE` (001:152), victim's later OTP signup auto-signups a new GoTrue user whose profile insert violates the unique constraint **silently swallowed** (ensureMyProfile result unchecked auth-api:118–122; caller `.catch(() => {})` login.tsx:172) → authenticated-but-profile-less account needing manual support. Squatting DoS + identity confusion outweigh the documented intent. |
| P14 | **ADJUSTED (downgraded)** | DB backstop missed by scan: `named_agent_id … REFERENCES sales_agents(id)` (014:123) — nonexistent UUIDs fail FK (raw 500 mid-call, not silent corruption). Remaining real issues: inactive agents referenceable; friendly-error UX absent. **Low.** |
| L1 | CONFIRMED (**Medium-High**) | All consumption sites verified UTC-sliced (reconcile:209,333; commission-logic:318,388; earnings:72–74); none import istPeriodOf (performance-logic:33–36). Correction: commission-logic.ts carries no IST header mandate — the mandate lives in performance-logic.ts:5–8. Locked-period skip path confirmed (:338–341) — draft key never retried into the open period, so the commission is lost permanently. |
| L2 | **ADJUSTED (downgraded to Low)** | Mechanism reproduced exactly by date-trace (Aug 12 01:00 IST → past Tuesday, remaining −25h). Impact overstated though: had the function moved on, the Last-Saturday cutoff is >72 h away, outside `CUTOFF_RISK_WINDOW_HOURS=72` — cutoff_risk is empty either way. Observable defect = home banner showing yesterday's batch "~0h baaki" for ~5.5 h (Math.max clamp hides negative). Cosmetic/stale UI. |
| L3 | CONFIRMED (Low, latent) | Regexes quoted; parity comments false at plans-schedule.ts:9–11/:67; third variant exists (plans.ts:435 `/hawan|havan/`). Current seed data spells only "Hawan", so divergence is latent until an admin coins a "havan" seva. |
| L4 | CONFIRMED | `[from,to)` docstring (commission-logic:222) vs inclusive filter (:239); off-by-one only on effectiveTo side. One-month rate lag exactly on promotion boundaries. Low–Medium. |
| L5 | **ADJUSTED** | Only `null`/`undefined` elements throw TypeError; numbers/strings box cleanly → clean `{ok:false}`. Reachable via both family-members routes with no upstream shape validation (api/profile/family-members.ts:49 passes `body.members` straight in, outside its only try/catch). Low–Medium (500 instead of clean 400; pairs with L7). |
| L6 | CONFIRMED | Uncaught `res.json()` at auth-api:136/admin-api:38 vs defensive requestOtp:43. Concrete victim found: complete-profile.tsx:124 branches on `err.status === 409` fed by callUserApi — a non-JSON response silently degrades that routing. Low–Medium. |
| L7 | CONFIRMED (**upgraded to Medium**) | start.ts:9–16 serves HTML 500 for plain Errors; reachable **today**: api/profile/family-members.ts wraps only body-parse (:38–42), validation/DB section (:44–92) is bare — L5's TypeError propagates straight to HTML. Breaks the JSON contract for API clients. |
| L8 | CONFIRMED (Medium UX) | localStorage-in-initializer (translations:178–184); TanStack Start SSR active (nitro server entry, no ssr:false anywhere); useLanguage renders in Header/SiteChrome across all marketing pages → hydration mismatch flash for every english-preferring visitor. |
| L9 | CONFIRMED (Low) | Hook inert: sole caller index.tsx:20,56, but no element carries bare `.reveal`; trap CSS real (styles.css:153–154). Dead code + footgun. |
| L10 | **ADJUSTED (downgraded)** | Primary path safe: `start_date` is a DATE column (001:197) written IST-correctly by webhook (`toIstDateString`). UTC-slice skew applies only to the `created_at` fallback (legacy rows; 018's CHECK now forces start_date on actives). Low. |
| L11 | CONFIRMED | Formulas quoted (financials:34 vs reports:218–223); surfaced on Overview (:275 via overview-financials:64) vs Reports (:222 + CSV :344). Low. |
| L12 | **ADJUSTED (impact refuted)** | Production caller pre-filters leads to the IST window (performance-data.server.ts:88–89 with IST bounds :70–73), so contactRate denominator and insufficientData guard are range-scoped in practice — not "all-time". Remaining truth: lens inconsistency (hospital lens re-filters, others rely on data layer; pure module doesn't re-filter leads despite its own header comment). Latent only. Low/informational. |
| L13 | CONFIRMED (Low, latent) | Formatter drops trailing zero (plans.ts:324–330); consumers listed (checkout/plan pages). Seeded prices are whole rupees (001:346,357,368), triggers only if admin enters paisa-bearing price. |
| L14 | CONFIRMED | SIGNED_IN ignored (use-session:53–58) with refresh() escape hatch (:75); use-user-role has neither listener nor escape hatch (:12–27). Presentation-level. Low. |
| L15 | CONFIRMED | Ghost reference at commission-logic:370 (real export is `buildYearlyAccrualEntries`:409); TELECALLER_QUEUE_KEYS has 13 entries vs three "twelve" claims (+queues.ts:8). Docs-level. |
| F1 / F2 / F3 / F10 | CONFIRMED | (✓ in original pass.) |
| F4 | CONFIRMED (**upgraded to High**) | Fabrication block verified (overview:326–334) with invented fallback constants (`?? 2510000` / `?? 2850000`); MRR line derives from mrrPaise too; zero disclaimer copy — and the card badge literally reads **"Live Supabase Data"** (:349). Owner decision-making off fiction. |
| F5 | **ADJUSTED (downgraded to Low)** | Button lacks disabled and loadPage lacks in-flight guard — true — but the button is rendered under `{!loading && !exhausted && …}` (:167), which unmounts it synchronously on first click before a second click can dispatch. Double-click duplication essentially unreachable through this UI; latent footgun. |
| F6 | CONFIRMED (Medium) | Validation order verified on both pages (only `if (!outcome)` runs first); untouched datetime-local → RangeError shown as raw message via generic catches (person:429–432; lead:204–205); input lacks `required` (person:924–934). Call goes unlogged mid-workflow. |
| F7 | CONFIRMED (Medium) | Unchunked `.in()` at sankalp-lists:320–323; both contrast sites chunk at 200 with explicit URL-limit comments (proof-upload:411–416; pandit:85–87). Fails outright at scale; family lists silently empty except globalError. |
| F8 | CONFIRMED (**Medium-High**) | `regeneratePlanFeatures` referenced exactly 3× (def + matrix toggle + addon toggle); `handleSaveEdit` (:472–485) and also `toggleActive` (:504–507, additional site) never regenerate features. Public plan pages show stale seva names/inactive features indefinitely. |
| F9 | CONFIRMED | Both sites exact: profile.tsx:233 and my-subscription.tsx:186 identical `Math.round(price_paise/100)` expressions. Low unless fractional pricing exists. |
| F11 | CONFIRMED (Low-Medium) | Empty catch (proof-upload:869–871); comment additionally false — `await onDone()` (:868) is skipped on error, so not even the parent refresh fires; UI silently reverts, badge stays Pending. |
| F12 | CONFIRMED | Viewer-local default month (reports:200–201) inside otherwise IST-disciplined page. Low. |
| F13 | CONFIRMED | Unkeyed fragment map (subscribers:1307–1310; ExpandedMembersRow key inside fragment :1431–1432). React keys by position → warning + fragile reconciliation. Low. |
| F14 | CONFIRMED (**upgraded to Medium**) | Always-true guard snaps hospital select back to `hospitals[0]` on every re-invocation (leads:79; callers ×7); `agents` frozen at `[]` so reallot default never applies (:80); bonus: same snap-back for `telecallerId` (:74). |
| F15 | CONFIRMED | Banner rounds monthly-equivalent (ComparisonTable:110). Low/cosmetic unless fractional. |
| F16 | CONFIRMED (**upgraded to Medium**) | All four sites parse bare dates and format without timeZone (exact lines verified; sankalp-lists has a duplicate inline instance at :622–628); correct pattern exists at reports-logic:113 + :120. Billing/start dates display one day early for viewers west of UTC. |
| F17 | CONFIRMED (Medium) | `if (!touchedAny || outcome === "") return false;` (:320) defeats SPA-navigation blocking whenever outcome unselected, even with typed notes/family/address edits — contradicting the adjacent comment; beforeunload covers tab-close only. Silent field-data loss on in-app nav. |
| F18 / F19 / F20 | CONFIRMED | Timer leak trivial (SevaFlow:72–74, cleanup only disconnects observer); orphan file is 5 bytes of BOM+CRLF, unregistered in routeTree (severity: none); garbage class verified at overview:339. |
| F21 | CONFIRMED (both halves, Medium) | Silent dead Save button on partial address (validation :100–111, disabled at :286, explanatory `<p>` at :282 renders only after failed attempt — unreachable while disabled); family-saved/address-failed shows generic "Save nahi ho paya" (:139) implying nothing saved while members persisted, and `onSaved?.()` never runs leaving parent stale. |
| F22 | **ADJUSTED (upgraded to Medium-High)** | Mechanism real, lines miscited: loadData spans profile.tsx:130–162 (subs set :145 before member counts :158); render gate lets form mount in the gap with `initialMembers=[]` (:184); seeding is a lazy initializer ignoring prop updates (profile-completion:81). Aggravator discovered: save upserts slots 1..N then prunes slot > N (api/profile/family-members.ts:74–90) — saving from a blank-seeded form deletes hidden existing members. Same data-loss family as F1. |

## Verification summary

| Verdict | Count | IDs |
|---|---|---|
| Confirmed | 48 | S1–S7, S10, P1–P7, P9–P13, L1, L3, L4, L6–L9, L11, L13–L15, F1–F4, F6–F21 |
| Adjusted (real, details/severity changed) | 8 | P3, P14, L2, L5, L10, L12, F5, F22 |
| Refuted / resolved as non-defects | 2 | S8 (resolved statically), S9 (latent hardening note only) |

**Net:** **58 live defects remain** (48 confirmed as-reported + 8 adjusted), 2 dismissed.

### Severity changes made during verification

| ID | Was | Now | Reason |
|---|---|---|---|
| P13 | Low | **High** | Silent-swallow chain leaves victims permanently profile-less; squatting DoS on any unclaimed number |
| F4 | Medium | **High** | "Live Supabase Data" badge on fabricated chart + invented fallback constants |
| P9 | Low | Medium | Direct double-money action from owner double-click, bounded only by Razorpay ceiling |
| L7 | Low | Medium | Reachable today via family-members route; breaks JSON API contract |
| L1 | Medium | Medium-High | Permanent commission loss via locked-period skip (money) |
| F8 / F22 | Medium/Low | Medium-High | Feature-regen gap broader than claimed; prune-on-save data-loss aggravator |
| F14 / F16 | Low | Medium | Verified user-facing snap-back; one-day-early billing dates |
| L2 | Medium | Low | Queue impact overstated — banner cosmetics only |
| P14 | Low | Low (narrower) | FK backstop prevents silent corruption |
| F5 | Medium | Low | Conditional render blocks the double-click path |
| L10 / L12 | Low | Low (latent) | Primary paths safe in production wiring |
| S9 | Low | Informational | No reachable code path |

> **Verification status:** all four area clusters fully re-read (16 migration files, 45 API routes + all `.server.ts` libs, 38 page routes + 16 components, 25 lib modules + hooks + root files). Nothing in this report modified any file. Top-priority remediation order after verification: **S2** (`DO NOTHING`) → **S1** (full signature on 014:214–218) → **S3** (GRANT EXECUTE or drop revoke) → **F1/F22 family-form seeding** → **P13** (phone ownership policy decision).

---

# Pass 2 — FIX LOG (2026-08-24)

All 58 live defects were fixed. Verification after fixing: `tsc --noEmit` ✅ · production build (`npm run build`) ✅ · eslint on every touched file ✅ (remaining repo-wide CRLF prettier noise is the documented pre-existing Windows-checkout artifact on files this pass never touched) · schedule scratch suites: second-Tuesday math ✅ across 4 timezones (`verify_owner_roles.ts` fails identically on the CLEAN tree — pre-existing `@/` alias resolution issue from the previous session's csv import into payments-logic, not from this pass).

## SQL migrations

| Item | File | Fix |
|---|---|---|
| S1 | `20260823_014_hospitals_perf.sql` | REVOKE/COMMENT corrected to the full 4-arg signature `reallot_hospital(uuid, uuid, text, uuid)` |
| S2 | `20260824_018_bugfix_hardening.sql` | Upsert is now `ON CONFLICT … DO NOTHING`, followed by a guarded re-SELECT of the committed winner row (loser still blocks on the insert, then reads it). PK never rewritten. |
| S3 | same file | `REVOKE … FROM authenticated` replaced by `GRANT EXECUTE ON FUNCTION is_owner() TO authenticated` (SECURITY DEFINER body unchanged; mirrors the documented is_admin() boolean-leak exception) + comment rewritten to explain invoker-privilege evaluation |
| S4 | same file + `20260823_016_otp_rate_limit.sql` | All three counters in `otp_check_and_log` (and the legacy `otp_send_ip_phone_count`) now filter `AND allowed` — blocked attempts no longer consume quota |
| S5 / S7 / S9 / S10 / P9-schema / P1-index | **NEW `20260824_019_pass2_fixes.sql`** | §1 clamp-backfill opening rate rows for out-of-range legacy agents · §1b partial UNIQUE index `(subscription_id) WHERE kind='first_deal'` · §2 flat-discount non-negative CHECK (NOT VALID) · §3 escalation trigger extended to `INSERT OR UPDATE OF outcome, escalated` · §4 drops the redundant indexes · §5 convergence repairs for DBs where 014/018 were hand-applied (guarded REVOKE/COMMENT re-assert, is_owner GRANT, fixed `generate_sankalp_batch` and `otp_check_and_log` bodies re-created) |
| S6 | `20260725_000_teardown.sql` | Both hospitals-session functions added to the drop list |

## Payments / server

| Item | File(s) | Fix |
|---|---|---|
| P1 | `reconcile.ts` | first_deal drafts now insert one-by-one; a concurrent run's win surfaces as a clean 23505 skip (backed by 019's partial unique index). Trails keep chunked inserts. |
| P2 | `razorpay-webhook.server.ts` | Terminal states are sticky for ALL patch events (not just active-producing), and every status write is a CAS on the just-read status via `.eq("status", localStatus)` + row-count check → new `skipped_stale_status` action instead of blind last-write-wins |
| P3 | `razorpay.server.ts`, `subscriptions-checkout.server.ts` | New `cancelRazorpaySubscription()`; every post-creation failure cancels the Razorpay object before deleting the DB row; coupon-mismatch stale rows are cancelled too |
| P4 | `razorpay-webhook.server.ts` | `refundPatchForEvent` takes `previouslyRefundedPaise` and writes the ACCUMULATED total; handler passes the current value through |
| P5 | `subscriptions-checkout.server.ts` | Pending-row reuse extended to attributed/coupon flows (same-coupon reuse with attribution back-fill; different coupon → stale row cancelled + recreated) — telecaller double-clicks no longer mint duplicates or burn redemptions |
| P6 | `reissue-link.ts`, `send-payment-link.ts` | Claim flag + compensating revert-to-halted in the catch path (guarded by `cancel_reason = mandate_dead_reissued` so only OUR claim is undone) — creation failure no longer strands the customer as cancelled |
| P7 | `overview-financials.ts`, `sales-agents/list.ts`, `leads/upload.ts`, `telecaller/earnings.ts` | All aggregates/dedupe scans page via `fetchAllRows`; upload's profiles `.in()` chunked at 200 |
| P9 | `refund.ts` (+019 column) | Optimistic claim latch `payments.refund_claimed_at`: atomic conditional UPDATE claims unclaimed/stale>10min rows; released on Razorpay rejection; cleared by the webhook's refund.processed patch |
| P10 | `log-call.ts` | Daily window anchored to IST midnight per its own comment (residual count-vs-insert race remains by design — Low, documented) |
| P11 | `payments/list.ts`, `leads/upload.ts`, `leads/assign.ts` | Filters sanitized (status whitelist, real-calendar date validation, search length cap); UUID shape-checks replace length===36; explicit `source_agent_id` existence+active check added |
| P12 | `request-otp.ts` | XFF/x-real-ip honoured only when `TRUST_PROXY_IP_HEADERS=true`; otherwise cf-connecting-ip or null |
| P13 | NEW `api/auth/reconcile-profile.ts`, `auth-api.ts`, `login.tsx` | Post-login reconcile route (service role): missing profile + verified OTP phone ⇒ evict squatter's unverified claim, insert owner's row (23505 retry loop); client `ensureMyProfile` now calls it and failures are logged, never swallowed |
| P14 | `log-call.ts` | `named_agent_id` checked against active sales_agents before stamping → clean 400 instead of FK 500 |

## Libs / hooks

| Item | File(s) | Fix |
|---|---|---|
| L1 | `commission-logic.ts` | `periodOf` is IST-aware (pure date strings pass through; timestamps shift +5:30 before slicing); payout periods, accrual ladder and earnings "this month" all bucket in IST |
| L2 | `telecaller-logic.ts` | `nextBatchCutoff` computes "today" from the IST-shifted date |
| L3 | `sankalp-logic.ts` | `isHawanSeva` unified to `/hawan\|havan/i` over slug+name, matching plans-schedule.ts (parity comment now true) |
| L4 | `commission-logic.ts` | `resolveTrailPercent` effectiveTo made exclusive (`> monthStartIso`) per its `[from,to)` contract |
| L5 | `family-validation.ts` | Non-object member elements return `{ok:false}` instead of throwing TypeError |
| L6 | `auth-api.ts`, `admin-api.ts` | `res.json()` wrapped with `.catch(() => null)`; non-JSON responses surface as ApiError with real status |
| L7 | `start.ts` | Uncaught errors on `/api/*` return JSON 500; pages keep the HTML error page |
| L8 | `translations.ts` | Language initializer reads localStorage in an effect after mount — SSR hydration mismatch gone |
| L9 | hook + `index.tsx` + `styles.css` | Dead reveal hook, its call site and the `.reveal` opacity trap removed |
| L10 | `sankalp-logic.ts`, `reports-logic.ts` | created_at fallback shifted to IST before slicing (DATE start_date path unchanged) |
| L11 | `financials-logic.ts` | MRR sums fractionally, rounds once at the end — matches reports-logic exactly |
| L12 | `performance-logic.ts` | Telecaller AND agent lenses range-filter leads internally (hospital-lens parity; no caller-dependent pre-filtering) |
| L13 | `plans.ts` | Paisa-bearing prices render two decimals ("₹251.50") |
| L14 | `use-session.ts`, `use-user-role.ts` | SIGNED_IN triggers refetch; role hook subscribes to auth state changes |
| L15 | both logic files | Ghost `buildYearlyAccrualSchedule` reference and all "twelve queues" counts corrected |

## Frontend

| Item | File(s) | Fix |
|---|---|---|
| F1 | `subscription-success.tsx` | `dataReady` gate keeps the skeleton up until the ownership+members fetch lands — the form can never mount on stale-empty state (and prune saved members on save) |
| F2 | `admin.tsx` | "Seva Proofs" nav points at `/admin/proof-upload` (the 404 route removed) |
| F3 | `admin.overview.tsx` | Pending-batch "today" reuses the IST calendar string |
| F4 | `admin.overview.tsx` | Fabricated trend chart deleted; honest KPI tiles for captured revenue + MRR with explicit copy pointing historical trends to Reports; AreaChart imports removed |
| F5 | `telecaller.queue.$queueKey.tsx` | Load-more button disabled while loading (+ unused eslint-disable removed) |
| F6 | person + lead pages | Callback time validated (present, parseable, future) BEFORE request construction with Hinglish guidance |
| F7 | `admin.sankalp-lists.tsx` | Family fetch chunked at 200 ids |
| F8 | `admin.plans-sevas.tsx` | New `regenerateFeaturesForSeva()` re-reads everything fresh and regenerates features for every plan containing the edited/deactivated seva; wired into save-edit and toggle |
| F9 | `profile.tsx`, `my-subscription.tsx` | Exact-to-the-paisa price display (formatINR semantics), Math.round removed |
| F10 | `admin.commissions.tsx` | Button text renders "Lock & pay" |
| F11 | `admin.proof-upload.tsx` | Mark-completed failure surfaces an inline error and keeps confirm open |
| F12 | `admin.reports.tsx` | Default month computed on the IST calendar |
| F13 | `admin.subscribers.tsx` | Rows keyed via `<Fragment key>` |
| F14 | `admin.leads.tsx` | Functional setState defaults — no more snap-back of hospital/telecaller picks; reallot-agent default actually applies |
| F15 | `ComparisonTable.tsx` | Yearly/monthly-equivalent keeps paisa remainder (2 decimals when non-whole) |
| F16 | profile, my-subscription, subscribers, sankalp-lists | Date-only strings anchored to `T00:00:00+05:30` and formatted in Asia/Kolkata |
| F17 | `telecaller.person.$subscriptionId.tsx` | Blocker fires whenever ANY field is touched — typed notes can no longer be silently discarded on in-app navigation |
| F18 | `SevaFlow.tsx` | Reveal timers tracked and cleared on unmount |
| F19 | — | Orphan `telecaller.queue..tsx` deleted |
| F20 | `admin.overview.tsx` | Garbage class removed (with F4 rewrite) |
| F21 | `profile-completion.tsx` | Save-disabled reasons explained inline; two-step failure copy states family names already saved |
| F22 | `profile.tsx` | Form gated on `!loadingData` and keyed by a data revision so it always seeds from freshly loaded members |

## Deliberately NOT changed
- **S8** — refuted during verification (scalar RPC + `.single()` is safe); no change needed.
- **S9 trigger leg** was still extended in 019 (cheap defense-in-depth) although no reachable code path needs it today.
- **P10 residual race** — count-then-insert TOCTOU on log-call/create-lead daily caps left as-is (Low abuse-brake; a true fix requires moving inserts into RPC transactions).
- Repo-wide CRLF prettier noise on untouched files — pre-existing Windows-checkout artifact.

## Deployment note
Fresh environments: run migrations in order (000→019) — everything applies cleanly.
Existing databases: apply `20260824_019_pass2_fixes.sql` — it converges hand-applied 014/018 states (privileges, batch RPC, OTP limiter) and adds all new constraints/indexes idempotently.

> **Status: ALL 58 live findings FIXED** — verified with `tsc --noEmit`, production build, and scoped eslint.
