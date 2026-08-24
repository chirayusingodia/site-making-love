import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { fetchAllRows } from "@/lib/supabase";
import {
  addPeriods,
  buildClawbacksForPayment,
  buildCommissionEntriesForPayment,
  buildYearlyAccrualEntries,
  dueYearlyAccrualPeriods,
  FIRST_DEAL_HOLD_DAYS,
  isPeriodLocked,
  periodOf,
  resolveAttribution,
  type LedgerEntryDraft,
  type LedgerEntryLite,
  type TrailRateRow,
} from "@/lib/commission-logic";

// POST /api/admin/commissions/reconcile
// Auth: OWNER only (financial data — admin gets 403).
// Body: { dryRun?: boolean }
//
// §10.4 — commission generation deliberately does NOT live in the
// Razorpay webhook: a bug here must never be able to fail an
// activation. This endpoint is IDEMPOTENT (the partial UNIQUE index
// makes re-runs free) and safe to run on a schedule.
//
// Per captured payment:
//   1. resolve attribution ONCE (write-once on the subscription)
//   2. first captured payment → first_deal entries (held 30 days)
//      otherwise → trail at the rate resolved PER PAYOUT MONTH;
//      yearly plans accrue monthly at 1/12 across months 2–12
//   3. organic (no agent, no telecaller) → ZERO entries, genuinely
//   4. locked periods are never written — corrections go to the
//      current open period

interface PaymentRow {
  id: string;
  subscription_id: string;
  status: string;
  amount_paise: number;
  created_at: string;
}

interface SubRow {
  id: string;
  user_id: string;
  status: string;
  sales_agent_id: string | null;
  telecaller_id: string | null;
  attribution_source: string | null;
  attributed_at: string | null;
  created_at: string;
  start_date: string | null;
  billing_period: "monthly" | "yearly" | null;
  price_paise: number | null;
}

// Same builder→rows boundary used in telecaller-data.server.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asRows<T>(
  builder: any,
): PromiseLike<{ data: T[] | null; error: { message: string } | null }> {
  return builder;
}

export const Route = createFileRoute("/api/admin/commissions/reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireOwner(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const { db } = auth.auth;

        let dryRun = false;
        try {
          const body = await request.json();
          dryRun = body?.dryRun === true;
        } catch {
          /* body optional */
        }

        try {
          // ── Load the world (paged scans, staging scale) ────────
          const [paymentsRes, subsRes, ratesRes, periodsRes] = await Promise.all([
            fetchAllRows<PaymentRow>((from, to) =>
              asRows<PaymentRow>(
                db
                  .from("payments")
                  .select("id,subscription_id,status,amount_paise,created_at")
                  .range(from, to),
              ),
            ),
            fetchAllRows<SubRow>((from, to) =>
              asRows<SubRow>(
                db
                  .from("subscriptions")
                  // H8 (REVIEW): `status` was missing from this select,
                  // so the prior-active-subscription anti-gaming check
                  // compared undefined === "active" and NEVER fired.
                  .select(
                    "id,user_id,status,sales_agent_id,telecaller_id,attribution_source,attributed_at," +
                      "created_at,start_date,plans(billing_period,price_paise)",
                  )
                  .range(from, to),
              ),
            ),
            fetchAllRows<{
              agent_id: string | null;
              profile_id: string | null;
              percent: number;
              effective_from: string;
              effective_to: string | null;
            }>((from, to) =>
              asRows<{
                agent_id: string | null;
                profile_id: string | null;
                percent: number;
                effective_from: string;
                effective_to: string | null;
              }>(
                db
                  .from("staff_commission_rates")
                  .select("agent_id,profile_id,percent,effective_from,effective_to")
                  .range(from, to),
              ),
            ),
            fetchAllRows<{ period: string; locked_at: string | null }>((from, to) =>
              asRows<{ period: string; locked_at: string | null }>(
                db.from("commission_payout_periods").select("period,locked_at").range(from, to),
              ),
            ),
          ]);
          for (const r of [paymentsRes, subsRes, ratesRes, periodsRes]) {
            if (r.error) throw new Error(String(r.error));
          }

          interface EntryRow extends LedgerEntryLite {}
          const entriesRes = await fetchAllRows<EntryRow>((from, to) =>
            asRows<EntryRow>(
              db
                .from("commission_entries")
                .select(
                  "id,kind,status,amount_paise,payout_period,created_at,subscription_id," +
                    "payment_id,agent_id,profile_id,percent_applied,base_paise",
                )
                .range(from, to),
            ),
          );
          if (entriesRes.error) throw new Error(String(entriesRes.error));

          const callsRes = await fetchAllRows<{
            called_by: string;
            profile_id: string | null;
            created_at: string;
            outcome: string;
          }>((from, to) =>
            asRows<{
              called_by: string;
              profile_id: string | null;
              created_at: string;
              outcome: string;
            }>(
              db
                .from("call_logs")
                // C2: outcome rides into attribution — only
                // contact-establishing outcomes may ever qualify.
                .select("called_by,profile_id,created_at,outcome")
                .order("created_at", { ascending: false })
                .range(from, to),
            ),
          );
          if (callsRes.error) throw new Error(String(callsRes.error));

          const subsById = new Map<
            string,
            SubRow & { plans?: { billing_period: string; price_paise: number } | null }
          >();
          for (const s of subsRes.data as (SubRow & {
            plans?: { billing_period: string; price_paise: number } | null;
          })[]) {
            const { plans, ...rest } = s;
            subsById.set(s.id, {
              ...rest,
              billing_period: (plans?.billing_period as "monthly" | "yearly" | undefined) ?? null,
              price_paise: plans?.price_paise ?? null,
            });
          }
          const entries = entriesRes.data;
          // snake_case columns → the engine's camelCase rate rows.
          const rates: TrailRateRow[] = (
            ratesRes.data as {
              agent_id: string | null;
              profile_id: string | null;
              percent: number;
              effective_from: string;
              effective_to: string | null;
            }[]
          ).map((r) => ({
            agentId: r.agent_id,
            profileId: r.profile_id,
            percent: Number(r.percent),
            effectiveFrom: r.effective_from,
            effectiveTo: r.effective_to,
          }));
          const lockedPeriods = periodsRes.data.filter((p) => p.locked_at).map((p) => p.period);

          const nowMs = Date.now();
          const nowPeriod = periodOf(new Date(nowMs).toISOString());
          const openPeriod = isPeriodLocked(nowPeriod, lockedPeriods)
            ? addPeriods(nowPeriod, 1) // degenerate; still refuse to write into locks below
            : nowPeriod;

          const captured = paymentsRes.data.filter((p) => p.status === "captured");
          captured.sort((a, b) => a.created_at.localeCompare(b.created_at));
          const refundedIds = new Set(
            paymentsRes.data.filter((p) => p.status === "refunded").map((p) => p.id),
          );

          // Existing-entry index for idempotency decisions.
          const entryKey = (e: {
            payment_id: string;
            agent_id: string | null;
            profile_id: string | null;
            kind: string;
            payout_period: string;
          }) =>
            `${e.payment_id}|${e.agent_id ?? "-"}|${e.profile_id ?? "-"}|${e.kind}|${e.payout_period}`;
          const existingKeys = new Set(entries.filter((e) => e.amount_paise > 0).map(entryKey));

          // H4: reversal keys are PERIOD-INDEPENDENT (the reversal
          // lands in whatever period is open when it runs) — matching
          // on original identity is what makes refunds idempotent.
          const existingReversalKeys = new Set(
            entries
              .filter((e) => e.amount_paise < 0)
              .map((e) => `${e.payment_id}|${e.agent_id ?? ""}|${e.profile_id ?? ""}|${e.kind}`),
          );

          // H5 (REVIEW): "is this the first captured payment?" used to
          // be inferred from the CURRENT captured list — which excludes
          // refunded payments. Refund month 1 and month 2 became a NEW
          // "first", paying the 20% bonus twice under a fresh payment_id
          // the unique index could not catch. The ledger itself is the
          // truth: a subscription earns first_deal EXACTLY once, ever.
          const subsWithFirstDealEver = new Set(
            entries.filter((e) => e.kind === "first_deal").map((e) => e.subscription_id),
          );

          let attributionsResolved = 0;
          let firstDealEntries = 0;
          let trailEntries = 0;
          let skippedLocked = 0;
          let skippedZeroPaise = 0; // H6 decision: zero-value entries are never created
          let reversalsInserted = 0;
          let flipsApplied = 0;
          let holdsMatured = 0;

          // ── Pass 1: attribution + entry generation ─────────────
          const toInsert: LedgerEntryDraft[] = [];

          for (const pay of captured) {
            const sub = subsById.get(pay.subscription_id);
            if (!sub) continue;

            // 1a. Write-once attribution (call-window fallback path;
            // token path was stamped at checkout creation, §9.1).
            if (!sub.attribution_source) {
              const priorActive =
                sub.user_id !== null &&
                [...subsById.values()].some(
                  (s) =>
                    s.id !== sub.id &&
                    s.user_id === sub.user_id &&
                    // H8: `status` now actually selected — this branch
                    // fired for real for the first time.
                    s.status === "active" &&
                    s.created_at < pay.created_at,
                );
              const resolution = resolveAttribution({
                subscriptionCreatedAtMs: Date.parse(sub.created_at),
                tokenContext: null,
                callsByTelecallers: callsRes.data
                  .filter((c) => c.profile_id === sub.user_id)
                  .map((c) => ({
                    calledBy: c.called_by,
                    createdAtMs: Date.parse(c.created_at),
                    outcome: c.outcome, // C2: no outcome → never qualifies
                  })),
                existingSalesAgentId: sub.sales_agent_id,
                priorActiveSubscription: priorActive,
              });
              sub.telecaller_id = resolution.telecallerId;
              sub.attribution_source = resolution.source;
              sub.attributed_at = new Date().toISOString();
              attributionsResolved++;
              if (!dryRun && (resolution.telecallerId || resolution.rejectedReason)) {
                await db
                  .from("subscriptions")
                  .update({
                    telecaller_id: resolution.telecallerId,
                    attribution_source: resolution.source,
                    attributed_at: sub.attributed_at,
                  })
                  .eq("id", sub.id)
                  .is("attributed_at", null);
              }
            }

            // [Bug 2.1] `isFirst` used to be recomputed from
            // subsWithFirstDealEver, which was derived ONCE before the
            // loop — several already-captured payments of one
            // subscription in a single backlog run ALL saw true and ALL
            // paid the 20% bonus (dedupe keyed by payment_id only).
            // Payments sort oldest-first, so the claim now happens
            // inside acceptDrafts the moment first_deal drafts are
            // queued; every later iteration sees false.
            const isFirst = !subsWithFirstDealEver.has(sub.id);

            const beneficiaries = [
              ...(sub.sales_agent_id ? [{ role: "agent" as const, id: sub.sales_agent_id }] : []),
              ...(sub.telecaller_id
                ? [{ role: "telecaller" as const, id: sub.telecaller_id }]
                : []),
            ];
            if (beneficiaries.length === 0) continue; // organic — genuinely nobody

            // H1 (REVIEW): the basis is the CAPTURED amount — a
            // coupon'd sale must not pay commission on money that
            // never arrived. Plan price is only the fallback.
            const pricePaise = pay.amount_paise ?? sub.price_paise;
            if (!pricePaise || pricePaise <= 0) continue;
            const paidAtIso = pay.created_at;

            const acceptDrafts = (drafts: LedgerEntryDraft[], kind: "first_deal" | "trail") => {
              for (const d of drafts) {
                if (existingKeys.has(entryKey(d))) continue;
                if (isPeriodLocked(d.payout_period, lockedPeriods)) {
                  skippedLocked++;
                  continue;
                }
                if (d.amount_paise === 0) {
                  // H6 explicit policy: a rounding-to-zero entry buys a
                  // ledger row nobody can act on; skip it loudly.
                  skippedZeroPaise++;
                  continue;
                }
                existingKeys.add(entryKey(d));
                toInsert.push(d);
                if (kind === "first_deal") {
                  // [Bug 2.1] Claim the subscription's one-and-only
                  // first_deal as soon as its drafts are queued —
                  // later payments in THIS run can never re-earn it.
                  subsWithFirstDealEver.add(sub.id);
                  firstDealEntries++;
                } else {
                  trailEntries++;
                }
              }
            };

            if ((sub.billing_period ?? "monthly") === "yearly") {
              // H2 (REVIEW): accrual now runs for EVERY captured yearly
              // payment INCLUDING the first — previously the whole
              // months-2..12 block sat behind `!isFirst`, so year-1
              // trail was silently never created for anyone.
              //
              // H3: rate lookup lives in buildYearlyAccrualEntries →
              // resolveTrailPercent (effective_to aware, ordered). The
              // inline `rates.find` + dead `appliedPct` are gone.
              if (isFirst) {
                acceptDrafts(
                  buildCommissionEntriesForPayment({
                    subscriptionId: sub.id,
                    paymentId: pay.id,
                    billingPeriod: "yearly",
                    pricePaise,
                    paidAtIso,
                    isFirstCapturedPayment: true,
                    beneficiaries,
                    rates,
                  }),
                  "first_deal",
                );
              }
              for (const payoutPeriod of dueYearlyAccrualPeriods(paidAtIso, nowMs)) {
                acceptDrafts(
                  buildYearlyAccrualEntries({
                    subscriptionId: sub.id,
                    paymentId: pay.id,
                    pricePaise,
                    paidAtIso,
                    targetPeriod: payoutPeriod,
                    beneficiaries,
                    rates,
                  }),
                  "trail",
                );
              }
            } else if (isFirst) {
              acceptDrafts(
                buildCommissionEntriesForPayment({
                  subscriptionId: sub.id,
                  paymentId: pay.id,
                  billingPeriod: "monthly",
                  pricePaise,
                  paidAtIso,
                  isFirstCapturedPayment: true,
                  beneficiaries,
                  rates,
                }),
                "first_deal",
              );
            } else {
              acceptDrafts(
                buildCommissionEntriesForPayment({
                  subscriptionId: sub.id,
                  paymentId: pay.id,
                  billingPeriod: "monthly",
                  pricePaise,
                  paidAtIso,
                  isFirstCapturedPayment: false,
                  beneficiaries,
                  rates,
                }),
                "trail",
              );
            }
          }

          // ── Pass 2: refund clawbacks (append-only, idempotent) ──
          const insertErrors: string[] = [];
          for (const pay of paymentsRes.data) {
            if (!refundedIds.has(pay.id)) continue;
            const plan = buildClawbacksForPayment(
              entries,
              pay.id,
              openPeriod,
              existingReversalKeys, // H4: already-reversed originals are skipped
            );
            flipsApplied += plan.flipIds.length;
            reversalsInserted += plan.reversals.length;
            if (dryRun) continue;
            for (const flipId of plan.flipIds) {
              const { error } = await db
                .from("commission_entries")
                .update({
                  status: "clawed_back",
                  note: `clawed_back in-place (same open period, unpaid) @ ${new Date().toISOString()}`,
                })
                .eq("id", flipId);
              // H7: the DB trigger refuses flips inside locked periods —
              // surface instead of swallowing.
              if (error) insertErrors.push(`flip ${flipId}: ${error.message}`);
            }
            if (plan.reversals.length > 0) {
              const { error } = await db.from("commission_entries").insert(plan.reversals);
              // H4 twin unique index makes duplicates impossible; H6
              // means any OTHER failure is reported, not hidden.
              if (error) insertErrors.push(`reversals ${pay.id}: ${error.message}`);
            }
          }

          // ── Pass 3: hold maturation (lock-aware, constant-driven) ──
          const matureIds = entries.filter(
            (e) =>
              e.kind === "first_deal" &&
              e.status === "held" &&
              !isPeriodLocked(e.payout_period, lockedPeriods) && // H7
              Date.parse(e.created_at) + FIRST_DEAL_HOLD_DAYS * 24 * 3_600_000 <= nowMs, // H7: no magic 30
          );
          holdsMatured = matureIds.length;
          if (!dryRun && matureIds.length > 0) {
            const { error } = await db
              .from("commission_entries")
              .update({ status: "payable" })
              .in(
                "id",
                matureIds.map((m) => m.id),
              )
              .eq("status", "held");
            if (error) insertErrors.push(`maturation: ${error.message}`);
          }

          // ── Write the generated drafts ─────────────────────────
          let inserted = 0;
          if (!dryRun && toInsert.length > 0) {
            for (let i = 0; i < toInsert.length; i += 200) {
              const chunk = toInsert.slice(i, i + 200);
              // H6 (REVIEW): `.then(undefined, () => …)` swallowed every
              // failure and still answered ok:true. Errors are now
              // collected and reported per chunk.
              const res = await db.from("commission_entries").insert(chunk).select("id");
              if (res.error) {
                insertErrors.push(`chunk ${i / 200}: ${res.error.message}`);
              } else {
                inserted += res.data?.length ?? 0;
              }
            }
          }

          const summary = {
            dryRun,
            ok: insertErrors.length === 0,
            capturedPaymentsScanned: captured.length,
            attributionsResolved,
            draftsGenerated: toInsert.length,
            inserted,
            insertErrors,
            skippedZeroPaise,
            firstDealEntries,
            trailEntries,
            skippedLocked,
            reversalsInserted,
            flipsApplied,
            holdsMatured,
            openPeriod,
          };

          await writeTelecallerAudit(
            db,
            auth.auth.staffId,
            "admin.commissions.reconciled",
            "commission_entries",
            null,
            summary,
          );

          return json({ ...summary });
        } catch (err) {
          console.error("commissions/reconcile error:", err);
          return json({ error: err instanceof Error ? err.message : "Reconcile failed" }, 500);
        }
      },
    },
  },
});
