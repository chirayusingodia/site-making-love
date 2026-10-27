// ─────────────────────────────────────────────────────────────
// PUNYATA — "your impact" numbers for /my-subscription + share card
//
// Every pooja Punyata performs also carries a fixed amount of daan.
// Edit the constants below if the operating reality changes — the page
// and the share image both read from here.
//
//   5 sadhu-santo are fed per pooja  (Premium: 2 poojas/month → 10)
//   7 cows are given fodder per pooja
//   30+ monkeys are fed per pooja
//
// Sundarkand and hawan happen once per pooja date when the plan
// includes them (Premium: both, twice a month).
//
// Totals are driven by the calendar poojas that have come around since
// the devotee joined, so "3 months, 2 poojas a month" reads as
// 6 poojas → 30 sadhu-santo.
// ─────────────────────────────────────────────────────────────

export const SADHU_PER_POOJA = 5;
export const COWS_PER_POOJA = 7;
export const MONKEYS_PER_POOJA = 30; // shown as "30+"

export interface PunyaImpact {
  poojas: number;
  sadhuFed: number;
  cowsFed: number;
  /** Lower bound — we feed 30+ per pooja; render with a trailing "+". */
  monkeysFed: number;
  sundarkands: number;
  hawans: number;
  /** One sankalp is recited per family member per pooja. */
  sankalps: number;
}

export interface ImpactPlanFlags {
  hasSundarkand: boolean;
  hasHawan: boolean;
  /** "2 times a month" style labels, per language, for the share card. */
  sundarkandPerMonth: number;
  hawanPerMonth: number;
}

export function computeImpact(poojas: number, members: number, flags: ImpactPlanFlags): PunyaImpact {
  return {
    poojas,
    sadhuFed: poojas * SADHU_PER_POOJA,
    cowsFed: poojas * COWS_PER_POOJA,
    monkeysFed: poojas * MONKEYS_PER_POOJA,
    sundarkands: flags.hasSundarkand ? poojas : 0,
    hawans: flags.hasHawan ? poojas : 0,
    sankalps: poojas * Math.max(members, 1),
  };
}

export interface ImpactTile {
  emoji: string;
  /** Display value (monkeys carry a trailing "+"). */
  value: string;
  label: string;
  sub: string;
}

/** The six impact tiles, shared by the page card and the share image. */
export function impactTiles(impact: PunyaImpact, flags: ImpactPlanFlags, en: boolean): ImpactTile[] {
  const perMonth = (n: number) => (en ? `${n} ${n === 1 ? "time" : "times"} a month` : `महीने में ${n} बार`);
  const tiles: ImpactTile[] = [
    {
      emoji: "🙏",
      value: String(impact.sadhuFed),
      label: en ? "Sadhu-Santo fed" : "साधु-संतों को भोजन",
      sub: en ? `${SADHU_PER_POOJA} at every pooja` : `हर पूजा में ${SADHU_PER_POOJA} संत`,
    },
    {
      emoji: "🐄",
      value: String(impact.cowsFed),
      label: en ? "Cows given fodder" : "गौ-माताओं को चारा",
      sub: en ? `${COWS_PER_POOJA} at every pooja` : `हर पूजा में ${COWS_PER_POOJA} गौ`,
    },
    {
      emoji: "🐒",
      value: `${impact.monkeysFed}+`,
      label: en ? "Monkeys fed" : "वानरों को भोजन",
      sub: en ? `${MONKEYS_PER_POOJA}+ at every pooja` : `हर पूजा में ${MONKEYS_PER_POOJA}+ वानर`,
    },
  ];
  if (flags.hasSundarkand) {
    tiles.push({
      emoji: "📖",
      value: String(impact.sundarkands),
      label: en ? "Sundarkand paath" : "सुंदरकांड पाठ",
      sub: perMonth(flags.sundarkandPerMonth),
    });
  }
  if (flags.hasHawan) {
    tiles.push({
      emoji: "🔥",
      value: String(impact.hawans),
      label: en ? "Hawan" : "हवन",
      sub: perMonth(flags.hawanPerMonth),
    });
  }
  tiles.push({
    emoji: "📿",
    value: String(impact.sankalps),
    label: en ? "Family sankalps" : "परिवार के संकल्प",
    sub: en ? "with name & gotra" : "नाम व गोत्र सहित",
  });
  return tiles;
}
