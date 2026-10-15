// ─────────────────────────────────────────────────────────────
// PUNYATA — "what is special about this seva day" (presentation only)
//
// For a seva date we surface, in order:
//   1. a named festival (small curated table below),
//   2. the tithi that is in force at sunrise — Purnima, Amavasya,
//      Ekadashi, Pradosh, Chaturthi — computed astronomically (no
//      network call, no stored panchang),
//   3. the weekday's deity (Tuesday → Hanuman ji, Saturday → Shani Dev).
//
// The tithi comes from the Moon–Sun elongation (12° = one tithi) using
// low-precision lunar/solar longitude series (Moon good to ~0.3°, i.e.
// well under an hour of tithi time). It is read at ~06:30 IST — the
// "udaya tithi" convention a morning pooja follows. A tithi that flips
// within minutes of sunrise can differ from a printed local panchang by
// a day; the festival table is hand-checked and wins over the computed
// tithi, so add/adjust festivals there rather than trusting the maths
// for a named occasion.
// ─────────────────────────────────────────────────────────────

export interface SpecialItem {
  /** Hindi + English label shown on the checkout card. */
  hi: string;
  en: string;
}

// ── Curated festivals (YYYY-MM-DD, IST) ──────────────────────────
// Only dates where independent panchang sources agree. Extend yearly.
const FESTIVALS: Record<string, SpecialItem> = {
  "2026-10-11": { hi: "शारदीय नवरात्रि प्रारम्भ", en: "Sharad Navratri begins" },
  "2026-10-12": { hi: "शारदीय नवरात्रि", en: "Sharad Navratri" },
  "2026-10-13": { hi: "शारदीय नवरात्रि", en: "Sharad Navratri" },
  "2026-10-14": { hi: "शारदीय नवरात्रि", en: "Sharad Navratri" },
  "2026-10-15": { hi: "शारदीय नवरात्रि", en: "Sharad Navratri" },
  "2026-10-16": { hi: "शारदीय नवरात्रि", en: "Sharad Navratri" },
  "2026-10-17": { hi: "शारदीय नवरात्रि", en: "Sharad Navratri" },
  "2026-10-18": { hi: "शारदीय नवरात्रि", en: "Sharad Navratri" },
  "2026-10-19": { hi: "दुर्गा अष्टमी / महानवमी", en: "Durga Ashtami / Maha Navami" },
  "2026-10-20": { hi: "विजयादशमी (दशहरा)", en: "Vijayadashami (Dussehra)" },
  "2026-10-25": { hi: "शरद पूर्णिमा", en: "Sharad Purnima" },
  "2026-10-29": { hi: "करवा चौथ", en: "Karwa Chauth" },
  "2026-11-06": { hi: "धनतेरस", en: "Dhanteras" },
  "2026-11-08": { hi: "दीपावली", en: "Diwali" },
  "2026-11-10": { hi: "गोवर्धन पूजा", en: "Govardhan Puja" },
  "2026-11-11": { hi: "भाई दूज", en: "Bhai Dooj" },
  "2026-11-24": { hi: "कार्तिक पूर्णिमा / देव दीपावली", en: "Kartik Purnima / Dev Deepawali" },
  "2026-12-20": { hi: "मोक्षदा एकादशी / गीता जयंती", en: "Mokshada Ekadashi / Gita Jayanti" },
  "2026-12-23": { hi: "दत्तात्रेय जयंती", en: "Dattatreya Jayanti" },
};

// ── Astronomy ────────────────────────────────────────────────────
const RAD = Math.PI / 180;
const norm = (deg: number) => ((deg % 360) + 360) % 360;

/** Days since J2000.0 for a UTC instant. */
function daysSinceJ2000(utcMs: number): number {
  return utcMs / 86_400_000 + 2440587.5 - 2451545.0;
}

function sunLongitude(d: number): number {
  const l0 = 280.46 + 0.9856474 * d;
  const g = (357.528 + 0.9856003 * d) * RAD;
  return norm(l0 + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
}

function moonLongitude(d: number): number {
  const l = 218.316 + 13.176396 * d; // mean longitude
  const m = norm(134.963 + 13.064993 * d) * RAD; // moon mean anomaly
  const ms = norm(357.529 + 0.98560028 * d) * RAD; // sun mean anomaly
  const dd = norm(297.85 + 12.190749 * d) * RAD; // mean elongation
  const f = norm(93.272 + 13.22935 * d) * RAD; // argument of latitude
  return norm(
    l +
      6.289 * Math.sin(m) +
      1.274 * Math.sin(2 * dd - m) +
      0.658 * Math.sin(2 * dd) +
      0.214 * Math.sin(2 * m) -
      0.186 * Math.sin(ms) -
      0.114 * Math.sin(2 * f),
  );
}

// Pushkar (Tirth Guru Pushkarraj) — sunrise reference point.
const LAT = 26.49;
const LON = 74.55;

/** Sunrise at Pushkar on a calendar day, as UTC milliseconds. `month` is 0-based. */
function sunriseUtcMs(year: number, month: number, day: number): number {
  const noonUtc = Date.UTC(year, month, day, 12, 0, 0); // starting guess
  const d = daysSinceJ2000(noonUtc) - LON / 360;
  const lon = sunLongitude(d) * RAD;
  const decl = Math.asin(Math.sin(23.44 * RAD) * Math.sin(lon));
  // Equation of time (minutes) from sun's mean vs true longitude.
  const meanLon = norm(280.46 + 0.9856474 * d) * RAD;
  const ra = Math.atan2(Math.cos(23.44 * RAD) * Math.sin(lon), Math.cos(lon));
  let eq = (meanLon - ra) / RAD;
  eq = ((((eq + 180) % 360) + 360) % 360) - 180;
  const eotMin = eq * 4;
  const cosH =
    (Math.sin(-0.833 * RAD) - Math.sin(LAT * RAD) * Math.sin(decl)) /
    (Math.cos(LAT * RAD) * Math.cos(decl));
  const hourAngleDeg = Math.acos(Math.max(-1, Math.min(1, cosH))) / RAD;
  const solarNoonUtcMin = 720 - LON * 4 - eotMin;
  const sunriseUtcMin = solarNoonUtcMin - hourAngleDeg * 4;
  return Date.UTC(year, month, day, 0, 0, 0) + sunriseUtcMin * 60_000;
}

/**
 * Tithi (1–30: 1–15 Shukla, 16–30 Krishna) at Pushkar sunrise on a
 * calendar day. `uncertain` is true when the tithi changes within
 * ~2 hours of sunrise — too close to trust against a printed panchang.
 */
export function tithiAtSunrise(
  year: number,
  month: number,
  day: number,
): { tithi: number; uncertain: boolean } {
  const d = daysSinceJ2000(sunriseUtcMs(year, month, day));
  const elongation = norm(moonLongitude(d) - sunLongitude(d));
  const within = elongation % 12; // degrees into the current tithi
  return { tithi: Math.floor(elongation / 12) + 1, uncertain: within < 1 || within > 11 };
}

/**
 * Everything special about a seva day, most notable first. Returns [] only
 * for a weekday we have no deity for (callers show nothing in that case).
 */
export function specialDayItems(date: Date): SpecialItem[] {
  const y = date.getFullYear();
  const m = date.getMonth();
  const day = date.getDate();
  const wd = date.getDay();
  const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const { tithi, uncertain } = tithiAtSunrise(y, m, day);
  const out: SpecialItem[] = [];

  const festival = FESTIVALS[iso];
  if (festival) out.push(festival);

  // Don't repeat what the festival already says (Purnima / Ekadashi names).
  const say = (item: SpecialItem) => {
    if (festival && (festival.hi.includes(item.hi) || festival.en.includes(item.en))) return;
    out.push(item);
  };

  const paksha = tithi <= 15 ? "shukla" : "krishna";
  const n = tithi <= 15 ? tithi : tithi - 15; // 1–15 within the paksha
  if (uncertain) {
    // Tithi flips near sunrise — skip the label rather than risk a wrong one.
  } else if (tithi === 15) say({ hi: "पूर्णिमा", en: "Purnima" });
  else if (tithi === 30) say({ hi: "अमावस्या", en: "Amavasya" });
  else if (n === 11) say({ hi: "एकादशी", en: "Ekadashi" });
  else if (n === 13) say({ hi: "प्रदोष व्रत", en: "Pradosh Vrat" });
  else if (n === 4 && paksha === "krishna" && wd === 2) {
    say({ hi: "अंगारकी संकष्टी चतुर्थी", en: "Angarki Sankashti Chaturthi" });
  } else if (n === 4) {
    say(
      paksha === "krishna"
        ? { hi: "संकष्टी चतुर्थी", en: "Sankashti Chaturthi" }
        : { hi: "विनायक चतुर्थी", en: "Vinayaka Chaturthi" },
    );
  }

  if (wd === 2) out.push({ hi: "मंगलवार — हनुमान जी का दिन", en: "Tuesday — Hanuman ji's day" });
  if (wd === 6) {
    out.push({ hi: "शनिवार — शनि देव एवं हनुमान जी का दिन", en: "Saturday — Shani Dev & Hanuman ji's day" });
  }
  return out;
}
