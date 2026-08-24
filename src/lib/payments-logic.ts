// Shared Payments Log masking logic (Session 6.5 two-tier roles).
// Pure functions — used by /api/admin/payments/list (server-side
// strip BEFORE the response is sent) and unit-tested in scratch/.
//
// OWNER sees every column. ADMIN sees operational fields only:
//   visible : status, subscription_id (+ subscriber name, resolved
//             separately), method, failure_reason, paid_at,
//             cycle_number, created_at, plan name/billing period
//   masked  : amount_paise, razorpay_payment_id, razorpay_order_id
//             (payment IDs can indirectly expose amount context via
//             Razorpay dashboard cross-reference — owner-only)
//
// The strip happens on RAW QUERY ROWS server-side; an admin-role
// network response never contains the real values — not hidden,
// ABSENT (null).

import { csvCell } from "@/lib/csv";

export const PAYMENT_MASKED_FIELDS = [
  "amount_paise",
  "razorpay_payment_id",
  "razorpay_order_id",
] as const;

export type PaymentMaskedField = (typeof PAYMENT_MASKED_FIELDS)[number];

export interface PaymentListRow {
  id: string;
  subscription_id: string;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  amount_paise: number | null;
  status: string; // captured | failed | refunded | pending
  method: string | null;
  cycle_number: number | null;
  paid_at: string | null;
  failure_reason: string | null;
  created_at: string;
  subscription: {
    id: string;
    plan_id: string;
    plans: { name: string; billing_period: string } | null;
  } | null;
}

export interface PaymentAggregates {
  capturedCount: number;
  failedCount: number;
  refundedCount: number;
  /** ₹ sums — present for owner, null for admin */
  capturedPaise: number | null;
  failedPaise: number | null;
  refundedPaise: number | null;
}

export interface PaymentsListResponse {
  viewerRole: "admin" | "owner";
  /** Fields stripped for this viewer (empty array for owner) */
  maskedFields: PaymentMaskedField[];
  rows: PaymentListRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  aggregates: PaymentAggregates;
}

/**
 * Nulls the owner-only fields on a row for an admin viewer.
 * Returns the row untouched for owner. Keys REMAIN present (null)
 * so the UI can render a 🔒 "restricted, not missing" placeholder.
 */
export function maskPaymentRowForRole(
  row: PaymentListRow,
  role: "admin" | "owner",
): PaymentListRow {
  if (role === "owner") return row;
  return {
    ...row,
    amount_paise: null,
    razorpay_payment_id: null,
    razorpay_order_id: null,
  };
}

export function maskPaymentRowsForRole(
  rows: PaymentListRow[],
  role: "admin" | "owner",
): PaymentListRow[] {
  return role === "owner" ? rows : rows.map((r) => maskPaymentRowForRole(r, role));
}

/**
 * Per-status aggregates over the whole filtered set. Counts are
 * operational (both roles); ₹ sums are financial (owner only —
 * null for admin).
 */
export function computePaymentAggregates(
  rows: { amount_paise: number | null; status: string }[],
  role: "admin" | "owner",
): PaymentAggregates {
  const agg: PaymentAggregates = {
    capturedCount: 0,
    failedCount: 0,
    refundedCount: 0,
    capturedPaise: role === "owner" ? 0 : null,
    failedPaise: role === "owner" ? 0 : null,
    refundedPaise: role === "owner" ? 0 : null,
  };
  for (const r of rows) {
    const amt = r.amount_paise ?? 0;
    if (r.status === "captured") {
      agg.capturedCount++;
      if (agg.capturedPaise !== null) agg.capturedPaise += amt;
    } else if (r.status === "failed") {
      agg.failedCount++;
      if (agg.failedPaise !== null) agg.failedPaise += amt;
    } else if (r.status === "refunded") {
      agg.refundedCount++;
      if (agg.refundedPaise !== null) agg.refundedPaise += amt;
    }
  }
  return agg;
}

// ─── CSV builders ────────────────────────────────────────────
// Role-aware: the owner CSV carries amount + both Razorpay IDs;
// the admin CSV omits those columns ENTIRELY (not blank cells —
// no column), so an exported file never implies missing data.

export interface PaymentsCsvNameMap {
  get(subscriptionId: string): string | undefined;
}

function fmtCsvDateTime(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? ""
    : dt.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Kolkata",
      });
}

export function buildPaymentsCsv(
  rows: PaymentListRow[],
  role: "admin" | "owner",
  nameMap: PaymentsCsvNameMap,
): string {
  // [Bug 4.9] Shared injection-safe escape (formula prefix + RFC quoting).
  const esc = csvCell;

  const headers = [
    "created_at_ist",
    "paid_at_ist",
    "subscriber",
    "plan",
    ...(role === "owner" ? ["amount_inr"] : []),
    "status",
    "method",
    "cycle_number",
    "failure_reason",
    ...(role === "owner" ? ["razorpay_payment_id", "razorpay_order_id"] : []),
    "subscription_id",
  ];

  const lines = rows.map((r) => {
    const cells: (string | number)[] = [
      fmtCsvDateTime(r.created_at),
      r.paid_at ? fmtCsvDateTime(r.paid_at) : "",
      nameMap.get(r.subscription_id) ?? "",
      r.subscription?.plans?.name ?? "",
      ...(role === "owner" ? [((r.amount_paise ?? 0) / 100).toFixed(2)] : []),
      r.status,
      r.method ?? "",
      r.cycle_number ?? "",
      r.failure_reason ?? "",
      ...(role === "owner" ? [r.razorpay_payment_id ?? "", r.razorpay_order_id ?? ""] : []),
      r.subscription_id,
    ];
    return cells.map(esc).join(",");
  });

  return [headers.map(esc).join(","), ...lines].join("\n");
}
