// ─────────────────────────────────────────────────────────────
// PUNYATA — Finance request validators (PURE, OWNER-ONLY routes)
//
// ONE copy of each rule: the entries / categories / pnl routes all
// call these, none validates inline. Hinglish copy matches the rest of
// the admin panel. Unit-tested in scratch/verify_finance_logic.ts.
// ─────────────────────────────────────────────────────────────

import { monthRange, type PnlBasis } from "@/lib/finance-logic";

export const ENTRY_METHODS = ["upi", "cash", "bank_transfer", "card", "cheque", "other"] as const;
export type EntryMethod = (typeof ENTRY_METHODS)[number];
export const MAX_ENTRY_PAISE = 1_000_000_000; // ₹1 crore per line
export const FINANCE_UPLOAD_PREFIX = "https://res.cloudinary.com/";
export const MAX_PNL_MONTHS = 36;

export type FinParse<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function realDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isRealDate(s: unknown): s is string {
  return typeof s === "string" && realDate(s);
}

// ─── Ledger entry ────────────────────────────────────────────

export interface EntryFields {
  entryDate: string;
  categoryId: string;
  amountPaise: number;
  description: string;
  counterparty: string | null;
  paymentMethod: EntryMethod;
  referenceNo: string | null;
  receiptUrl: string | null;
  amortizeMonths: number;
  sevaId: string | null;
}

/** The ONE validator for a ledger entry — create and edit share it. */
export function parseEntryBody(body: unknown, today: string): FinParse<EntryFields> {
  if (!body || typeof body !== "object") return { ok: false, error: "Entry details zaroori hain" };
  const b = body as Record<string, unknown>;

  const entryDate = b.entryDate;
  if (!isRealDate(entryDate) || entryDate < "2020-01-01") {
    return { ok: false, error: "Entry ki tareekh (YYYY-MM-DD) sahi nahi hai" };
  }
  if (entryDate > today) return { ok: false, error: "Entry ki tareekh aage ki nahi ho sakti" };

  if (!isUuid(b.categoryId)) return { ok: false, error: "Category chunna zaroori hai" };

  const amount = b.amountPaise;
  if (
    typeof amount !== "number" ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > MAX_ENTRY_PAISE
  ) {
    return { ok: false, error: "Amount ₹0.01 se ₹1 crore ke beech hona chahiye" };
  }

  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (description.length < 1 || description.length > 500) {
    return { ok: false, error: "Description 1 se 500 akshar ka hona chahiye" };
  }

  const opt = (v: unknown, max: number, label: string): FinParse<string | null> => {
    if (v === undefined || v === null || v === "") return { ok: true, value: null };
    if (typeof v !== "string") return { ok: false, error: `${label} sahi nahi hai` };
    const t = v.trim();
    if (t.length > max)
      return { ok: false, error: `${label} ${max} akshar se chhota hona chahiye` };
    return { ok: true, value: t.length > 0 ? t : null };
  };
  const counterparty = opt(b.counterparty, 200, "Paid to / received from");
  if (!counterparty.ok) return counterparty;
  const referenceNo = opt(b.referenceNo, 64, "Reference");
  if (!referenceNo.ok) return referenceNo;

  const method = b.paymentMethod === undefined ? "upi" : b.paymentMethod;
  if (typeof method !== "string" || !(ENTRY_METHODS as readonly string[]).includes(method)) {
    return { ok: false, error: "Payment method sahi nahi hai" };
  }

  let receiptUrl: string | null = null;
  if (b.receiptUrl !== undefined && b.receiptUrl !== null && b.receiptUrl !== "") {
    if (typeof b.receiptUrl !== "string" || !b.receiptUrl.startsWith(FINANCE_UPLOAD_PREFIX)) {
      return { ok: false, error: "Receipt ka link Cloudinary se hona chahiye" };
    }
    receiptUrl = b.receiptUrl;
  }

  const months = b.amortizeMonths === undefined ? 1 : b.amortizeMonths;
  if (typeof months !== "number" || !Number.isInteger(months) || months < 1 || months > 36) {
    return { ok: false, error: "Spread months 1 se 36 ke beech hona chahiye" };
  }

  let sevaId: string | null = null;
  if (b.sevaId !== undefined && b.sevaId !== null && b.sevaId !== "") {
    if (!isUuid(b.sevaId)) return { ok: false, error: "Seva sahi nahi hai" };
    sevaId = b.sevaId;
  }

  return {
    ok: true,
    value: {
      entryDate,
      categoryId: b.categoryId,
      amountPaise: amount,
      description,
      counterparty: counterparty.value,
      paymentMethod: method as EntryMethod,
      referenceNo: referenceNo.value,
      receiptUrl,
      amortizeMonths: months,
      sevaId,
    },
  };
}

/** A soft-delete / archive reason: 3-300 chars. */
export function parseReason(v: unknown): FinParse<string> {
  const reason = typeof v === "string" ? v.trim() : "";
  if (reason.length < 3 || reason.length > 300) {
    return { ok: false, error: "Reason 3 se 300 akshar ka hona chahiye" };
  }
  return { ok: true, value: reason };
}

// ─── Category ────────────────────────────────────────────────

export interface CategoryFields {
  name: string;
  entryType: "expense" | "income";
  pnlGroup: "direct" | "operating" | "other_income";
  sortOrder: number | null;
}

export function parseCategoryBody(body: unknown): FinParse<CategoryFields> {
  if (!body || typeof body !== "object")
    return { ok: false, error: "Category details zaroori hain" };
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (name.length < 1 || name.length > 80) {
    return { ok: false, error: "Category ka naam 1 se 80 akshar ka hona chahiye" };
  }
  const entryType = b.entryType;
  if (entryType !== "expense" && entryType !== "income") {
    return { ok: false, error: "Type expense ya income hona chahiye" };
  }
  const pnlGroup = b.pnlGroup;
  if (pnlGroup !== "direct" && pnlGroup !== "operating" && pnlGroup !== "other_income") {
    return { ok: false, error: "Group direct, operating ya other_income hona chahiye" };
  }
  // Mirrors the table CHECK: income <=> other_income.
  if ((entryType === "income") !== (pnlGroup === "other_income")) {
    return { ok: false, error: "Income hamesha 'Other income' group mein aati hai" };
  }
  let sortOrder: number | null = null;
  if (b.sortOrder !== undefined && b.sortOrder !== null) {
    if (
      typeof b.sortOrder !== "number" ||
      !Number.isInteger(b.sortOrder) ||
      b.sortOrder < 0 ||
      b.sortOrder > 10000
    ) {
      return { ok: false, error: "Sort order 0 se 10000 ke beech ek poora number ho" };
    }
    sortOrder = b.sortOrder;
  }
  return { ok: true, value: { name, entryType, pnlGroup, sortOrder } };
}

// ─── P&L request ─────────────────────────────────────────────

export interface PnlRequest {
  fromYm: string;
  toYm: string;
  basis: PnlBasis;
  /** The period to compare AGAINST (the "base"); null = no comparison. */
  compare: { fromYm: string; toYm: string } | null;
}

function parseRange(v: unknown, label: string): FinParse<{ fromYm: string; toYm: string }> {
  if (!v || typeof v !== "object") return { ok: false, error: `${label} range zaroori hai` };
  const r = v as Record<string, unknown>;
  if (
    typeof r.fromYm !== "string" ||
    !YM_RE.test(r.fromYm) ||
    typeof r.toYm !== "string" ||
    !YM_RE.test(r.toYm)
  ) {
    return { ok: false, error: `${label}: months YYYY-MM format mein hon` };
  }
  if (r.fromYm > r.toYm) return { ok: false, error: `${label}: start month end se pehle ho` };
  if (monthRange(r.fromYm, r.toYm).length > MAX_PNL_MONTHS) {
    return { ok: false, error: `${label}: ek baar mein max ${MAX_PNL_MONTHS} months` };
  }
  return { ok: true, value: { fromYm: r.fromYm, toYm: r.toYm } };
}

export function parsePnlRequest(body: unknown): FinParse<PnlRequest> {
  if (!body || typeof body !== "object") return { ok: false, error: "Request body zaroori hai" };
  const b = body as Record<string, unknown>;
  const main = parseRange(b, "Period");
  if (!main.ok) return main;
  const basis = b.basis === undefined ? "cash" : b.basis;
  if (basis !== "cash" && basis !== "normalised") {
    return { ok: false, error: "Basis cash ya normalised hona chahiye" };
  }
  let compare: PnlRequest["compare"] = null;
  if (b.compare !== undefined && b.compare !== null) {
    const c = parseRange(b.compare, "Compare period");
    if (!c.ok) return c;
    compare = c.value;
  }
  return { ok: true, value: { ...main.value, basis, compare } };
}
