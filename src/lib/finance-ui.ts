// Display helpers shared by the Finance & P&L screens (owner-only UI).
// Pure — no React, no fetch.

import { addMonthsYm } from "@/lib/finance-logic";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** 'YYYY-MM' → 'Oct 2026'. */
export function ymLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

/** 'YYYY-MM' → "Oct '26" (chart axes). */
export function ymShort(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_SHORT[m - 1]} '${String(y % 100).padStart(2, "0")}`;
}

/** Full-precision ₹ for tables and tiles (Indian grouping, no decimals). */
export function inr(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

/** Compact ₹ for chart axes: ₹950, ₹12.5k, ₹1.2L, ₹2.1Cr. Takes RUPEES. */
export function inrAxis(rupees: number): string {
  const a = Math.abs(rupees);
  const sign = rupees < 0 ? "-" : "";
  const trim = (n: number) => String(Math.round(n * 10) / 10);
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}k`;
  return `${sign}₹${Math.round(a)}`;
}

export function pctText(p: number | null): string {
  if (p === null) return "—";
  return `${p >= 0 ? "+" : ""}${Math.round(p)}%`;
}

export function marginText(p: number | null): string {
  return p === null ? "—" : `${Math.round(p * 10) / 10}%`;
}

export type Tone = "good" | "bad" | "flat";

/** Is a change good or bad? Costs are good when they go DOWN. */
export function toneOf(delta: number, goodWhen: "up" | "down"): Tone {
  if (delta === 0) return "flat";
  return delta > 0 === (goodWhen === "up") ? "good" : "bad";
}

export const TONE_CLS: Record<Tone, string> = {
  good: "text-emerald-700",
  bad: "text-rose-700",
  flat: "text-stone-500",
};

/** Previous period of equal length, immediately before [fromYm, toYm]. */
export function previousPeriod(fromYm: string, count: number): { fromYm: string; toYm: string } {
  return { fromYm: addMonthsYm(fromYm, -count), toYm: addMonthsYm(fromYm, -1) };
}

// Colour-blind-safe (Okabe-Ito) — meaning is never carried by colour alone:
// every series is also named in the legend and the tooltip.
export const CHART_COLORS = {
  revenue: "#0072B2",
  expenses: "#E69F00",
  profit: "#009E73",
  autopay: "#0072B2",
  qr: "#CC79A7",
  bar: "#56B4E9",
} as const;
