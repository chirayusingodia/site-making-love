// Shared financial derivations for the Overview Dashboard.
// Pure functions — unit-tested in scratch/. The figures these
// produce are OWNER-ONLY in the product; they are computed
// server-side (/api/admin/overview-financials) and never sent to
// an admin-role caller.

export interface ActiveSubPlan {
  plan_price_paise: number | null;
  plan_billing_period: string | null;
}

export interface OverviewFinancials {
  /** MRR in paise — yearly plans normalised to monthly-equivalent (÷12) */
  mrrPaise: number;
  monthlyPlansActiveCount: number;
  yearlyPlansActiveCount: number;
  /** This-month captured revenue in paise (IST month window) */
  capturedRevenuePaise: number;
  capturedPaymentsCount: number;
}

export function computeMrr(subs: ActiveSubPlan[]): {
  mrrPaise: number;
  monthlyPlansActiveCount: number;
  yearlyPlansActiveCount: number;
} {
  let mrrPaise = 0;
  let monthlyPlansActiveCount = 0;
  let yearlyPlansActiveCount = 0;
  for (const s of subs) {
    const price = s.plan_price_paise ?? 0;
    if (s.plan_billing_period === "yearly") {
      yearlyPlansActiveCount++;
      // [Pass-2 L11] fractional sum, rounded ONCE at the end — the old
      // per-sub Math.round diverged from reports-logic's fractional
      // MRR by up to ±N×0.5 paise between the two owner screens.
      mrrPaise += price / 12;
    } else {
      monthlyPlansActiveCount++;
      mrrPaise += price;
    }
  }
  return {
    mrrPaise: Math.round(mrrPaise),
    monthlyPlansActiveCount,
    yearlyPlansActiveCount,
  };
}

export function sumCapturedPayments(payments: { amount_paise: number | null }[]): {
  capturedRevenuePaise: number;
  capturedPaymentsCount: number;
} {
  return {
    capturedRevenuePaise: payments.reduce((acc, p) => acc + (p.amount_paise ?? 0), 0),
    capturedPaymentsCount: payments.length,
  };
}
