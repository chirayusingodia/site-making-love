// ─────────────────────────────────────────────────────────────
// Telecaller monthly payroll — PURE. Turns ledger rows + payout rows
// into the per-telecaller "salary this month / paid or not" view.
// No Supabase, no Date.now(); the endpoints pass data in.
//
// Amount rules (set by the commission engine, not here):
//   ₹80 first_deal on conversion (held 30 days), ₹20 trail per paid month.
// Payable now  = accrued + payable rows (incl. negative clawbacks → net).
// Held         = first-deal bonuses still inside the 30-day window.
// Paid         = rows already settled by a payout.
// ─────────────────────────────────────────────────────────────

export interface PayrollEntry {
  id: string;
  profile_id: string | null;
  subscription_id: string;
  kind: "first_deal" | "trail";
  status: string;
  amount_paise: number;
  payout_period: string;
  created_at: string;
  paid_at: string | null;
  payout_id: string | null;
}

export interface PayrollTelecaller {
  id: string;
  full_name: string | null;
  phone: string | null;
}

export interface PayoutRow {
  id: string;
  profile_id: string;
  payout_period: string;
  amount_paise: number;
  entry_count: number;
  method: string;
  reference_no: string | null;
  note: string | null;
  paid_at: string;
}

export type PayrollStatus = "no_earnings" | "pending" | "partial" | "paid" | "held_only";

export interface PayrollLine {
  entryId: string;
  subscriptionId: string;
  kind: "first_deal" | "trail";
  status: string;
  amountPaise: number;
}

export interface PayrollRow {
  profileId: string;
  name: string;
  phone: string | null;
  newConversions: number;
  trailSubscribers: number;
  earnedPaise: number; // positive rows, every status except void/clawed_back
  clawbackPaise: number;
  payablePaise: number; // what Pay would settle right now (net)
  heldPaise: number;
  paidPaise: number;
  status: PayrollStatus;
  lines: PayrollLine[];
}

export interface PayrollTotals {
  earnedPaise: number;
  payablePaise: number;
  heldPaise: number;
  paidPaise: number;
  newConversions: number;
  telecallers: number;
  fullyPaid: number;
}

const OPEN_STATUSES = new Set(["accrued", "payable"]);

export function buildPayroll(input: {
  period: string;
  entries: PayrollEntry[];
  telecallers: PayrollTelecaller[];
}): { rows: PayrollRow[]; totals: PayrollTotals } {
  const byPerson = new Map<string, PayrollEntry[]>();
  for (const e of input.entries) {
    if (!e.profile_id || e.payout_period !== input.period) continue;
    const list = byPerson.get(e.profile_id) ?? [];
    list.push(e);
    byPerson.set(e.profile_id, list);
  }

  const people = new Map(input.telecallers.map((t) => [t.id, t]));
  for (const id of byPerson.keys()) {
    if (!people.has(id)) people.set(id, { id, full_name: null, phone: null });
  }

  const rows: PayrollRow[] = [];
  for (const [id, t] of people) {
    const mine = byPerson.get(id) ?? [];
    const live = mine.filter((e) => e.status !== "void" && e.status !== "clawed_back");
    const positive = live.filter((e) => e.amount_paise > 0);
    const earned = positive.reduce((s, e) => s + e.amount_paise, 0);
    const clawback = live.filter((e) => e.amount_paise < 0).reduce((s, e) => s - e.amount_paise, 0);
    const payable = live
      .filter((e) => OPEN_STATUSES.has(e.status))
      .reduce((s, e) => s + e.amount_paise, 0);
    const held = live.filter((e) => e.status === "held").reduce((s, e) => s + e.amount_paise, 0);
    const paid = live.filter((e) => e.status === "paid").reduce((s, e) => s + e.amount_paise, 0);

    let status: PayrollStatus;
    if (live.length === 0) status = "no_earnings";
    else if (payable > 0 && paid > 0) status = "partial";
    else if (payable > 0) status = "pending";
    else if (paid > 0) status = held > 0 ? "partial" : "paid";
    else status = "held_only";

    rows.push({
      profileId: id,
      name: t.full_name?.trim() || "Unnamed telecaller",
      phone: t.phone,
      newConversions: positive.filter((e) => e.kind === "first_deal").length,
      trailSubscribers: new Set(positive.filter((e) => e.kind === "trail").map((e) => e.subscription_id))
        .size,
      earnedPaise: earned,
      clawbackPaise: clawback,
      payablePaise: payable,
      heldPaise: held,
      paidPaise: paid,
      status,
      lines: mine
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((e) => ({
          entryId: e.id,
          subscriptionId: e.subscription_id,
          kind: e.kind,
          status: e.status,
          amountPaise: e.amount_paise,
        })),
    });
  }

  // Money owed first, then by size of month.
  rows.sort(
    (a, b) =>
      b.payablePaise - a.payablePaise ||
      b.earnedPaise - a.earnedPaise ||
      a.name.localeCompare(b.name),
  );

  const totals: PayrollTotals = {
    earnedPaise: rows.reduce((s, r) => s + r.earnedPaise, 0),
    payablePaise: rows.reduce((s, r) => s + r.payablePaise, 0),
    heldPaise: rows.reduce((s, r) => s + r.heldPaise, 0),
    paidPaise: rows.reduce((s, r) => s + r.paidPaise, 0),
    newConversions: rows.reduce((s, r) => s + r.newConversions, 0),
    telecallers: rows.filter((r) => r.status !== "no_earnings").length,
    fullyPaid: rows.filter((r) => r.status === "paid").length,
  };
  return { rows, totals };
}

export const PAYOUT_METHODS = ["upi", "bank_transfer", "cash", "other"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export function isPayoutMethod(v: unknown): v is PayoutMethod {
  return typeof v === "string" && (PAYOUT_METHODS as readonly string[]).includes(v);
}
