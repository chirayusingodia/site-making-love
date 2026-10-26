// ─────────────────────────────────────────────────────────────
// PUNYATA — Subscriber trend (PURE). Counts only: no ₹ anywhere, so the
// route that serves it is open to admins as well as the owner.
//
//   paying    — distinct subscriptions whose payments COVER the month
//               (same rule as the P&L: finance-logic.payingSubscribersByMonth)
//   newSubs   — subscriptions whose start_date falls in the month
//   cancelled — subscriptions whose cancelled_at falls in the month
//   lapsed    — subscriptions whose halted_at falls in the month
//   activeNow — status = 'active' today (a live status, not a history)
// ─────────────────────────────────────────────────────────────

import {
  monthKeyIST,
  monthRange,
  payingSubscribersByMonth,
  type PaymentLite,
} from "@/lib/finance-logic";

export interface SubLite {
  id: string;
  status: string;
  start_date: string | null;
  cancelled_at: string | null;
  halted_at: string | null;
}

export interface TrendMonth {
  ym: string;
  paying: number;
  newSubs: number;
  cancelled: number;
  lapsed: number;
}

export interface SubscriberTrend {
  months: TrendMonth[];
  activeNow: number;
}

export function buildSubscriberTrend(input: {
  subs: SubLite[];
  payments: PaymentLite[];
  fromYm: string;
  toYm: string;
}): SubscriberTrend {
  const { subs, payments, fromYm, toYm } = input;
  const paying = payingSubscribersByMonth(payments, fromYm, toYm);
  const keys = monthRange(fromYm, toYm);
  const rows = new Map<string, TrendMonth>(
    keys.map((ym) => [
      ym,
      { ym, paying: paying.get(ym)?.size ?? 0, newSubs: 0, cancelled: 0, lapsed: 0 },
    ]),
  );
  for (const s of subs) {
    if (s.start_date) {
      const r = rows.get(monthKeyIST(s.start_date));
      if (r) r.newSubs++;
    }
    if (s.cancelled_at) {
      const r = rows.get(monthKeyIST(s.cancelled_at));
      if (r) r.cancelled++;
    }
    if (s.halted_at) {
      const r = rows.get(monthKeyIST(s.halted_at));
      if (r) r.lapsed++;
    }
  }
  return {
    months: keys.map((k) => rows.get(k)!),
    activeNow: subs.filter((s) => s.status === "active").length,
  };
}
