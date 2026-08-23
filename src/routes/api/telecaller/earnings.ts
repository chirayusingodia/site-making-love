import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller } from "@/lib/supabase-admin.server";
import { stripMaskedFieldsDeep } from "@/lib/telecaller-logic";
import { addPeriods, FIRST_DEAL_HOLD_DAYS, periodOf } from "@/lib/commission-logic";

// POST /api/telecaller/earnings
// Gate: requireTelecaller. Body: NONE.
//
// §11 — the whole point of the trail is that she can watch it grow.
// STRICTLY her own rows: every query below keys off auth.callerId;
// there is NO parameter that could select another beneficiary, so
// "A passes B's uuid" is structurally impossible, not merely
// filtered. Not shown, ever: anyone else's rate or earnings —
// including the field agent on her own sale — company revenue/MRR,
// other subscribers' payment amounts, or aggregates beyond her own.

interface EntryRow {
  id: string;
  kind: "first_deal" | "trail";
  status: string;
  amount_paise: number;
  payout_period: string;
  created_at: string;
  subscription_id: string;
  base_paise: number;
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

export const Route = createFileRoute("/api/telecaller/earnings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        try {
          // No body parsing on purpose — nothing the caller sends can
          // widen the query beyond HER uuid.
          void request;

          const [entriesRes, ratesRes, periodsRes] = await Promise.all([
            auth.db
              .from("commission_entries")
              .select(
                "id,kind,status,amount_paise,payout_period,created_at," +
                  "subscription_id,base_paise",
              )
              .eq("profile_id", auth.callerId)
              .order("payout_period", { ascending: true }),
            auth.db
              .from("staff_commission_rates")
              .select("percent,effective_from,effective_to,reason")
              .eq("profile_id", auth.callerId)
              .order("effective_from", { ascending: false })
              .limit(5),
            auth.db.from("commission_payout_periods").select("period,locked_at"),
          ]);
          if (entriesRes.error) return json({ error: entriesRes.error.message }, 500);
          if (ratesRes.error) return json({ error: ratesRes.error.message }, 500);
          if (periodsRes.error) return json({ error: periodsRes.error.message }, 500);

          const entries = (entriesRes.data ?? []) as unknown as EntryRow[];
          const lockedPeriods = new Set(
            ((periodsRes.data ?? []) as { period: string; locked_at: string | null }[])
              .filter((p) => p.locked_at)
              .map((p) => p.period),
          );

          const nowIso = new Date().toISOString();
          const thisPeriod = periodOf(nowIso);
          const prevPeriod = addPeriods(thisPeriod, -1);

          const posThis = entries.filter(
            (e) => e.payout_period === thisPeriod && e.amount_paise > 0,
          );
          const clawbacksThis = entries.filter(
            (e) => e.payout_period === thisPeriod && e.amount_paise < 0,
          );

          // Her book: subscribers currently paying her trail.
          const trailSubsAll = new Set(
            entries.filter((e) => e.kind === "trail").map((e) => e.subscription_id),
          );
          const trailSubsThis = new Set(
            entries
              .filter((e) => e.kind === "trail" && e.payout_period === thisPeriod)
              .map((e) => e.subscription_id),
          );
          const trailSubsPrev = new Set(
            entries
              .filter((e) => e.kind === "trail" && e.payout_period === prevPeriod)
              .map((e) => e.subscription_id),
          );
          let droppedOff = 0;
          for (const s of trailSubsPrev) if (!trailSubsThis.has(s)) droppedOff++;

          // Her current trail rate (+ when it took effect).
          const rates = (ratesRes.data ?? []) as {
            percent: number;
            effective_from: string;
            effective_to: string | null;
            reason: string | null;
          }[];
          const today = nowIso.slice(0, 10);
          const currentRate =
            rates.find(
              (r) =>
                r.effective_from <= today && (r.effective_to === null || r.effective_to >= today),
            ) ??
            rates[0] ??
            null;

          // Held bonuses with maturity dates.
          const held = entries.filter((e) => e.kind === "first_deal" && e.status === "held");

          // Payout history by locked/open period (net of clawbacks).
          interface PeriodBucket {
            period: string;
            earned: number;
            clawedBack: number;
            net: number;
            locked: boolean;
          }
          const byPeriod = new Map<string, PeriodBucket>();
          for (const e of entries) {
            const b =
              byPeriod.get(e.payout_period) ??
              ({
                period: e.payout_period,
                earned: 0,
                clawedBack: 0,
                net: 0,
                locked: lockedPeriods.has(e.payout_period),
              } satisfies PeriodBucket);
            if (e.amount_paise > 0) b.earned += e.amount_paise;
            else b.clawedBack += -e.amount_paise;
            b.net = b.earned - b.clawedBack;
            byPeriod.set(e.payout_period, b);
          }

          // Per-subscriber lines (expandable in the UI).
          const perSub = new Map<
            string,
            { total: number; firstEarn: number; trailEarn: number; lastPeriod: string }
          >();
          for (const e of entries) {
            if (e.amount_paise <= 0) continue;
            const cur = perSub.get(e.subscription_id) ?? {
              total: 0,
              firstEarn: 0,
              trailEarn: 0,
              lastPeriod: e.payout_period,
            };
            cur.total += e.amount_paise;
            if (e.kind === "first_deal") cur.firstEarn += e.amount_paise;
            else cur.trailEarn += e.amount_paise;
            if (e.payout_period > cur.lastPeriod) cur.lastPeriod = e.payout_period;
            perSub.set(e.subscription_id, cur);
          }

          return json(
            stripMaskedFieldsDeep({
              thisMonth: {
                period: thisPeriod,
                firstDealPaise: sum(
                  posThis.filter((e) => e.kind === "first_deal").map((e) => e.amount_paise),
                ),
                trailPaise: sum(
                  posThis.filter((e) => e.kind === "trail").map((e) => e.amount_paise),
                ),
                clawedBackPaise: sum(clawbacksThis.map((c) => -c.amount_paise)),
                totalNetPaise:
                  sum(posThis.map((e) => e.amount_paise)) -
                  sum(clawbacksThis.map((c) => -c.amount_paise)),
              },
              book: {
                payingNow: trailSubsThis.size,
                totalEver: trailSubsAll.size,
                droppedOffThisMonth: droppedOff,
              },
              trailRate: currentRate
                ? {
                    percent: Number(currentRate.percent),
                    since: currentRate.effective_from,
                    reason: currentRate.reason,
                  }
                : { percent: 1, since: null, reason: "default" },
              heldBonuses: held.map((h) => ({
                id: h.id,
                amountPaise: h.amount_paise,
                createdAt: h.created_at,
                maturesAtIso: new Date(
                  Date.parse(h.created_at) + FIRST_DEAL_HOLD_DAYS * 24 * 3_600_000,
                ).toISOString(),
              })),
              payoutHistory: [...byPeriod.values()].sort((a, b) =>
                b.period.localeCompare(a.period),
              ),
              perSubscriberLines: [...perSub.entries()]
                .map(([subscriptionId, v]) => ({ subscriptionId, ...v }))
                .sort((a, b) => b.total - a.total),
            }),
          );
        } catch (err) {
          console.error("telecaller/earnings error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
