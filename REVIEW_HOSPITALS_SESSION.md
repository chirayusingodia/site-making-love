# 🔍 PUNYATA — Code review: Hospitals, No-Coupon Attribution & Owner Performance

**Reviewed by:** Claude, against the actual repo files (not the session summary) · **Date:** 2026-08-23
**Session under review:** `SESSION_HOSPITALS_ATTRIBUTION_PERFORMANCE_PROMPT.md` (migration 014 +
coupon removal + attribution fix + funnel capture + owner leaderboard)
**Verdict:** Solid, spec-faithful work. **No money-losing bugs this time.** One customer-facing defect
(garbled WhatsApp text) should be fixed before the panel sends a single real link; three smaller
correctness items after that. Safe to apply 013+014 to Staging once §1 is fixed.

---

## Rating

| Area | Score | Note |
|---|---|---|
| Migration 014 craft | **9 / 10** | Exclusion constraint, every DEFINER REVOKEd, columns commented, coupon deprecated-not-dropped — exactly to spec |
| Coupon removal | **10 / 10** | Clean end to end; public checkout untouched; old clients rejected loudly |
| Attribution fix | **9 / 10** | Sourcing agent now the FIELD agent in both send-payment-link and the token checkout — the real bug is gone |
| Performance engine | **8 / 10** | Pure module, captured-only revenue, IST bucketing correct, fair-sample guard, owner-gated. One mislabeled metric |
| Encoding / polish | **5 / 10** | `send-payment-link.ts` shipped as double-encoded UTF-8 — customer message is garbled |
| **Overall** | **8 / 10** | The hard parts (schema, money attribution, gating) are right; the misses are a bad file save and two edge-case metrics |

**Verified against the live schema (not assumed):** `subscriptions.paused_at / cancelled_at /
start_date` all exist (core schema `:197–200`), so churn + the data-layer SELECT are valid;
`payments.status` really is the literal `'captured'` (`razorpay-webhook.server.ts` `capturedPaymentRow`
`:218`), so the revenue filter is correct. Both were the highest-risk assumptions in the leaderboard;
both hold.

---

## 🔴 HIGH — fix before the panel sends a real link

### 1. `send-payment-link.ts` is saved as double-encoded UTF-8 (mojibake)

Every non-ASCII byte in the rewritten file is corrupted. It is invisible to `tsc`, ESLint and the
build — which is why the summary is green — but it is real on disk and it reaches customers:

- The WhatsApp body: `Namaste ðŸ™ Punyata se judein â€" aapka plan: …` — the 🙏 became `ðŸ™` and the
  em-dash became `â€"`. **This is the message the customer receives.**
- The coupon-rejection error: `"Is flow mein coupon nahi hota â€" link hi attribution hai"`.
- All the `§`/`—`/box-drawing comment characters (cosmetic, but same root cause).

Only this one file is affected — `create-checkout.ts`, `coupons.server.ts`, `log-call.ts`,
`performance-logic.ts` and migration 014 all render clean, so it is an isolated bad save, not an
editor-wide setting. **Fix:** re-save `send-payment-link.ts` as UTF-8 with the correct `🙏` and `—`
(and `§`). Add a customer-facing string to `verify_*` or eyeball the built message once.

---

## 🟠 MEDIUM

### 2. `linksSent` doesn't measure links sent — it counts conversions

`performance-logic.ts:256` computes `linksSent = myLeads.filter(l => l.convertedAt !== null ||
l.subscriptionId !== null)`. That is the *converted* set, not the *link-sent* set. A lead that got a
WhatsApp link but hasn't paid (`status='link_sent'`, `converted_at` null, `subscription_id` null) is
**not** counted. So `linksSent ≈ conversions`, and the one funnel step that reveals *"she sends links
but can't close"* — the core coaching signal the owner asked for — is invisible.

Root cause: `PerfLeadRow` has no `status` field, so the pure module *can't* see it.
**Fix:** add `leads.status` to `PerfLeadRow` + the data-layer select, and count
`status IN ('link_sent','converted')` (or any lead that ever reached link_sent).

### 3. `log-call` combined free-pooja + named-agent stamp: one guard blocks the other

`log-call.ts:210–212` builds a single `UPDATE` carrying both `free_pooja_at`/`free_pooja_by` and
`named_agent_id`, then ANDs both idempotency guards onto it:
```ts
if (poojaRequested)       q = q.is("free_pooja_at", null);
if (namedAgentRequested)  q = q.is("named_agent_id", null);
```
When both are requested in one call and **one is already set**, the combined `WHERE … free_pooja_at
IS NULL AND named_agent_id IS NULL` matches zero rows, so the field that *was* still null is silently
not written. Realistic path: telecaller marks the free pooja on call 1; on call 2 she records the
named agent while the free-pooja toggle is still on → `named_agent_id` never saves.
**Fix:** write each field in its own guarded UPDATE (or only include the guard for the field actually
being set this request).

---

## 🟡 LOW

### 4. Re-allotment history and audit are unattributed

`reallot.ts:51` calls `auth.db.rpc("reallot_hospital", …)` on the **service-role** client. Inside the
SECURITY DEFINER function (`migration 014:191, :196`), `set_by` and the `audit_logs.admin_id` are both
`auth.uid()` — which is **NULL** under a service-role connection with no JWT. So every reallotment row
and its audit entry records *nobody did it*. Ironic given `writeTelecallerAudit` throws precisely so a
trail can't be lost.
**Fix:** add a `p_set_by uuid` parameter to `reallot_hospital`, pass `auth.staffId` from the endpoint,
and use it for both `set_by` and the audit `admin_id` (or write the audit row from the endpoint via
`writeTelecallerAudit(auth.db, auth.staffId, …)`).

> Note (not a bug): `reallot`/hospital CRUD use `requireAdmin` (admin ∪ owner). Allotment isn't
> financial, so admin access is fine — only the performance leaderboard is owner-gated, correctly.

---

## ✅ What is genuinely well done — keep doing this

- **Migration 014 is to spec, line for line:** `ahs_no_overlap` btree_gist exclusion (one active
  agent per hospital), all four lead columns commented, and **every** SECURITY DEFINER function
  (`current_hospital_agent`, `reallot_hospital`) carries an explicit `REVOKE EXECUTE FROM public,
  anon, authenticated`. The C1 checklist line held.
- **The coupon amputation is complete and safe:** `agentUsable` gone from `decideCoupon`,
  `couponAgentUsable` gone from `createCheckoutForUser`, `coupon_code` rejected with a clear message
  in `send-payment-link`, and the *public* coupon path on the ordinary checkout is untouched. Agent
  coupons deactivated idempotently in the migration.
- **The sourcing-agent bug is actually fixed in both places** — `send-payment-link` credits
  `lead.source_agent_id` (with lead resolution `lead_id → token → open-by-phone` and a tray + token/
  profile match gate), and `create-checkout`'s `?att=` path now stamps `sales_agent_id` alongside
  `telecaller_id`.
- **Performance engine correctness:** pure/`nowMs`-injected module; IST bucketing is right (I checked
  the double-offset trap — IST-midnight stamps round-trip correctly); revenue is captured-payments
  only; attribution follows `subscriptions.telecaller_id/sales_agent_id` so the board can't disagree
  with the ledger; `MIN_LEADS_FOR_RANKING=20` fair-sample guard; rates carried as `n/d` + text; the
  data layer is IST-watermarked and caps with explicit `truncatedTables`.
- **Owner gating is right:** every `/api/admin/performance/*` handler opens with `requireOwner`, and
  the page follows the `/admin/commissions` owner-only pattern.
- **Free-pooja/named-agent are lead attributes, not a new call-outcome enum value** — the CHECKed
  enum was left alone, exactly as the spec asked.

---

## Recommended order of work
1. **§1** (mojibake) — before any real WhatsApp link goes out. One re-save.
2. **§2** and **§3** — the two metric/idempotency fixes; re-run `verify_performance.ts` after §2 with
   a lead that is `link_sent` but not converted.
3. **§4** — pass the actor into `reallot_hospital`.
4. Then apply 013 + 014 to Staging and run each migration's verification block (exclusion-violation
   test, `current_hospital_agent`, the C1 DEFINER/REVOKE sweep query).

Nothing here touches the commission math, and nothing is in the money-losing class of the previous
review. This was a clean session.

---

*🚩 Sewa Hamari, Punya Aapka 🚩*
