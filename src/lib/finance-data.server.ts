import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase";
import { monthWindow } from "@/lib/reports-logic";
import {
  buildPnl,
  comparePeriods,
  fetchWindow,
  moverSentence,
  topMovers,
  type CategoryLite,
  type CompareRow,
  type EntryLite,
  type MonthPnl,
  type PaymentLite,
} from "@/lib/finance-logic";
import type { PnlRequest } from "@/lib/finance-requests";

// Server-only data loader for the P&L. OWNER-ONLY callers: the rows it
// reads (payments, finance_entries) carry ₹ figures.
//
// WINDOW: spreads that START before the requested range still land in
// it (yearly plan = 12 months, QR prepay up to 24, amortised expense up
// to 36), so payments are read PAYMENT_LOOKBACK_MONTHS back and — on
// the normalised basis — entries ENTRY_LOOKBACK_MONTHS back
// (fetchWindow). buildPnl then drops anything outside the range.

interface PaymentRow {
  id: string;
  subscription_id: string;
  amount_paise: number | null;
  status: string;
  paid_at: string | null;
  refunded_at: string | null;
  refund_amount_paise: number | null;
  gateway: string | null;
  subscriptions: {
    plans: { billing_period: string | null } | { billing_period: string | null }[] | null;
  } | null;
  offline_payment_details:
    | { period_start: string | null; months_covered: number | null }
    | { period_start: string | null; months_covered: number | null }[]
    | null;
}

const one = <T>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export function toPaymentLite(r: PaymentRow): PaymentLite {
  const plan = one(one(r.subscriptions)?.plans);
  const det = one(r.offline_payment_details);
  return {
    id: r.id,
    subscription_id: r.subscription_id,
    amount_paise: r.amount_paise,
    status: r.status,
    paid_at: r.paid_at,
    refunded_at: r.refunded_at,
    refund_amount_paise: r.refund_amount_paise,
    gateway: r.gateway,
    plan_billing_period: plan?.billing_period ?? null,
    offline_period_start: det?.period_start ?? null,
    offline_months: det?.months_covered ?? null,
  };
}

export interface LedgerRow {
  id: string;
  entry_date: string;
  amount_paise: number;
  description: string;
  counterparty: string | null;
  payment_method: string;
  reference_no: string | null;
  amortize_months: number;
  category_id: string;
  finance_categories:
    { name: string; entry_type: string } | { name: string; entry_type: string }[] | null;
}

export interface PnlResult {
  basis: PnlRequest["basis"];
  fromYm: string;
  toYm: string;
  categories: CategoryLite[];
  pnl: { months: MonthPnl[]; total: MonthPnl };
  /** Present when the request carried `compare`. Rows are computed with
   *  a = the compare (base) period and b = the primary period, so
   *  delta = primary − compare ("this period vs the one before"). */
  compare: {
    fromYm: string;
    toYm: string;
    pnl: { months: MonthPnl[]; total: MonthPnl };
    rows: CompareRow[];
    movers: { key: string; label: string; sentence: string }[];
  } | null;
  /** Raw ledger rows covering the primary range (for the xlsx export). */
  ledger: LedgerRow[];
}

const inrFmt = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

export async function fetchPnlData(db: SupabaseClient, req: PnlRequest): Promise<PnlResult> {
  const minFrom = req.compare && req.compare.fromYm < req.fromYm ? req.compare.fromYm : req.fromYm;
  const maxTo = req.compare && req.compare.toYm > req.toYm ? req.compare.toYm : req.toYm;
  const win = fetchWindow(minFrom, req.basis);
  const paymentsFrom = new Date(monthWindow(win.paymentsFromYm).monthStart).toISOString();
  const entriesFrom = monthWindow(win.entriesFromYm).first;
  const entriesTo = monthWindow(maxTo).last;

  const [catsRes, paymentsRes, entriesRes, ledgerRes] = await Promise.all([
    db.from("finance_categories").select("id,name,entry_type,pnl_group").order("sort_order"),
    // A payment counts when it was PAID in the window or REFUNDED in it
    // (a refund can land long after the original payment).
    fetchAllRows<PaymentRow>((from, to) =>
      db
        .from("payments")
        .select(
          "id,subscription_id,amount_paise,status,paid_at,refunded_at,refund_amount_paise,gateway," +
            "subscriptions(plans(billing_period)),offline_payment_details(period_start,months_covered)",
        )
        .in("status", ["captured", "refunded"])
        .or(`paid_at.gte.${paymentsFrom},refunded_at.gte.${paymentsFrom}`)
        .order("paid_at", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<EntryLite>((from, to) =>
      db
        .from("finance_entries")
        .select("entry_date,amount_paise,amortize_months,category_id")
        .is("deleted_at", null)
        .gte("entry_date", entriesFrom)
        .lte("entry_date", entriesTo)
        .order("entry_date", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<LedgerRow>((from, to) =>
      db
        .from("finance_entries")
        .select(
          "id,entry_date,amount_paise,description,counterparty,payment_method,reference_no,amortize_months,category_id," +
            "finance_categories(name,entry_type)",
        )
        .is("deleted_at", null)
        .gte("entry_date", monthWindow(req.fromYm).first)
        .lte("entry_date", monthWindow(req.toYm).last)
        .order("entry_date", { ascending: true })
        .range(from, to),
    ),
  ]);
  if (catsRes.error) throw new Error(`finance_categories: ${catsRes.error.message}`);
  if (paymentsRes.error) throw new Error(`payments: ${paymentsRes.error}`);
  if (entriesRes.error) throw new Error(`finance_entries: ${entriesRes.error}`);
  if (ledgerRes.error) throw new Error(`ledger: ${ledgerRes.error}`);

  const categories = (catsRes.data ?? []) as CategoryLite[];
  const payments = paymentsRes.data.map(toPaymentLite);
  const entries = entriesRes.data;

  const main = buildPnl({
    payments,
    entries,
    categories,
    fromYm: req.fromYm,
    toYm: req.toYm,
    basis: req.basis,
  });

  let compare: PnlResult["compare"] = null;
  if (req.compare) {
    const base = buildPnl({
      payments,
      entries,
      categories,
      fromYm: req.compare.fromYm,
      toYm: req.compare.toYm,
      basis: req.basis,
    });
    const rows = comparePeriods(base.total, main.total, categories);
    compare = {
      fromYm: req.compare.fromYm,
      toYm: req.compare.toYm,
      pnl: base,
      rows,
      movers: topMovers(rows, 3).map((r) => ({
        key: r.key,
        label: r.label,
        sentence: moverSentence(r, inrFmt),
      })),
    };
  }

  return {
    basis: req.basis,
    fromYm: req.fromYm,
    toYm: req.toYm,
    categories,
    pnl: main,
    compare,
    ledger: ledgerRes.data,
  };
}
