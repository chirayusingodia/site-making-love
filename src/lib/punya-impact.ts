// ─────────────────────────────────────────────────────────────
// PUNYATA — "your impact" numbers for /my-subscription + share card
//
// Every pooja Punyata performs also carries a fixed amount of daan.
// Edit the constants below if the operating reality changes — the page
// and the share image both read from here.
//
//   5 sadhu-santo are fed per pooja  (Premium: 2 poojas/month → 10)
//   7 cows are given fodder per pooja
//
// Totals are driven by the calendar poojas that have come around since
// the devotee joined (elapsedSevaDates), so "3 months, 2 poojas a
// month" reads as 6 poojas → 30 sadhu-santo.
// ─────────────────────────────────────────────────────────────

export const SADHU_PER_POOJA = 5;
export const COWS_PER_POOJA = 7;

export interface PunyaImpact {
  poojas: number;
  sadhuFed: number;
  cowsFed: number;
  /** One sankalp is recited per family member per pooja. */
  sankalps: number;
  /** Individual seva offerings performed (sevas in plan × poojas). */
  offerings: number;
}

export function computeImpact(poojas: number, members: number, sevasPerPooja: number): PunyaImpact {
  return {
    poojas,
    sadhuFed: poojas * SADHU_PER_POOJA,
    cowsFed: poojas * COWS_PER_POOJA,
    sankalps: poojas * Math.max(members, 1),
    offerings: poojas * sevasPerPooja,
  };
}
