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
  /** Title — Hindi + English. */
  hi: string;
  en: string;
  /** One-line "why is this day special" — Hindi + English. */
  descHi: string;
  descEn: string;
  kind: "festival" | "tithi" | "weekday";
}

// ── Curated festivals (YYYY-MM-DD, IST) ──────────────────────────
// Only dates where independent panchang sources agree. Extend yearly.
const FESTIVALS: Record<string, SpecialItem> = {
  "2026-10-11": { hi: "शारदीय नवरात्रि प्रारम्भ", en: "Sharad Navratri begins", descHi: "माँ दुर्गा की नौ दिन की उपासना का पहला दिन — घटस्थापना।", descEn: "First day of the nine-day worship of Maa Durga — Ghatasthapana.", kind: "festival" },
  "2026-10-12": { hi: "शारदीय नवरात्रि", en: "Sharad Navratri", descHi: "माँ दुर्गा के नौ स्वरूपों की उपासना के नौ पावन दिन।", descEn: "Nine sacred days of worship of Maa Durga's nine forms.", kind: "festival" },
  "2026-10-13": { hi: "शारदीय नवरात्रि", en: "Sharad Navratri", descHi: "माँ दुर्गा के नौ स्वरूपों की उपासना के नौ पावन दिन।", descEn: "Nine sacred days of worship of Maa Durga's nine forms.", kind: "festival" },
  "2026-10-14": { hi: "शारदीय नवरात्रि", en: "Sharad Navratri", descHi: "माँ दुर्गा के नौ स्वरूपों की उपासना के नौ पावन दिन।", descEn: "Nine sacred days of worship of Maa Durga's nine forms.", kind: "festival" },
  "2026-10-15": { hi: "शारदीय नवरात्रि", en: "Sharad Navratri", descHi: "माँ दुर्गा के नौ स्वरूपों की उपासना के नौ पावन दिन।", descEn: "Nine sacred days of worship of Maa Durga's nine forms.", kind: "festival" },
  "2026-10-16": { hi: "शारदीय नवरात्रि", en: "Sharad Navratri", descHi: "माँ दुर्गा के नौ स्वरूपों की उपासना के नौ पावन दिन।", descEn: "Nine sacred days of worship of Maa Durga's nine forms.", kind: "festival" },
  "2026-10-17": { hi: "शारदीय नवरात्रि", en: "Sharad Navratri", descHi: "माँ दुर्गा के नौ स्वरूपों की उपासना के नौ पावन दिन।", descEn: "Nine sacred days of worship of Maa Durga's nine forms.", kind: "festival" },
  "2026-10-18": { hi: "शारदीय नवरात्रि", en: "Sharad Navratri", descHi: "माँ दुर्गा के नौ स्वरूपों की उपासना के नौ पावन दिन।", descEn: "Nine sacred days of worship of Maa Durga's nine forms.", kind: "festival" },
  "2026-10-19": { hi: "दुर्गा अष्टमी / महानवमी", en: "Durga Ashtami / Maha Navami", descHi: "नवरात्रि के सबसे शुभ दिन — कन्या पूजन और माँ की विशेष आराधना।", descEn: "The most auspicious days of Navratri — Kanya Pujan and special worship of the Goddess.", kind: "festival" },
  "2026-10-20": { hi: "विजयादशमी (दशहरा)", en: "Vijayadashami (Dussehra)", descHi: "बुराई पर अच्छाई की जीत का पर्व — श्री राम की रावण पर विजय।", descEn: "The festival of good over evil — Shri Ram's victory over Ravana.", kind: "festival" },
  "2026-10-25": { hi: "शरद पूर्णिमा", en: "Sharad Purnima", descHi: "चंद्रमा की सोलह कलाओं का दिन — माँ लक्ष्मी की कृपा और अमृत वर्षा की मान्यता।", descEn: "The moon shines with all sixteen kalas — a day associated with Maa Lakshmi's blessings.", kind: "festival" },
  "2026-10-29": { hi: "करवा चौथ", en: "Karwa Chauth", descHi: "सुहागिनों का निर्जला व्रत — पति की लंबी आयु की कामना।", descEn: "The fast observed by married women for their husbands' long life.", kind: "festival" },
  "2026-11-06": { hi: "धनतेरस", en: "Dhanteras", descHi: "दीपावली का आरंभ — धन्वंतरि जयंती और माँ लक्ष्मी-कुबेर की पूजा।", descEn: "The start of Diwali — Dhanvantari Jayanti and worship of Maa Lakshmi and Kubera.", kind: "festival" },
  "2026-11-08": { hi: "दीपावली", en: "Diwali", descHi: "माँ लक्ष्मी और श्री गणेश की पूजा का पर्व — अंधकार पर प्रकाश की विजय।", descEn: "The festival of lights — worship of Maa Lakshmi and Shri Ganesh.", kind: "festival" },
  "2026-11-10": { hi: "गोवर्धन पूजा", en: "Govardhan Puja", descHi: "श्रीकृष्ण द्वारा गोवर्धन धारण की स्मृति — गौ-पूजन और अन्नकूट का दिन।", descEn: "In memory of Shri Krishna lifting Govardhan — a day of cow worship and Annakut.", kind: "festival" },
  "2026-11-11": { hi: "भाई दूज", en: "Bhai Dooj", descHi: "भाई-बहन के पवित्र स्नेह का पर्व।", descEn: "The festival of the sacred bond between brothers and sisters.", kind: "festival" },
  "2026-11-24": { hi: "कार्तिक पूर्णिमा / देव दीपावली", en: "Kartik Purnima / Dev Deepawali", descHi: "देवताओं की दीपावली — गंगा स्नान, दीपदान और दान-पुण्य का महापर्व।", descEn: "The Diwali of the gods — holy dip, lamp offering and charity.", kind: "festival" },
  "2026-12-20": { hi: "मोक्षदा एकादशी / गीता जयंती", en: "Mokshada Ekadashi / Gita Jayanti", descHi: "मोक्ष देने वाली एकादशी — इसी दिन श्रीमद्भगवद्गीता का उपदेश हुआ।", descEn: "The Ekadashi that grants moksha — the day the Bhagavad Gita was spoken.", kind: "festival" },
  "2026-12-23": { hi: "दत्तात्रेय जयंती", en: "Dattatreya Jayanti", descHi: "भगवान दत्तात्रेय का प्राकट्य दिवस — गुरु तत्व की उपासना।", descEn: "Birth day of Lord Dattatreya — worship of the Guru principle.", kind: "festival" },
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

  const tithiItem = (hi: string, en: string, descHi: string, descEn: string): SpecialItem => ({
    hi, en, descHi, descEn, kind: "tithi",
  });
  // Don't repeat what the festival already says (Purnima / Ekadashi names).
  const say = (item: SpecialItem) => {
    if (festival && (festival.hi.includes(item.hi) || festival.en.includes(item.en))) return;
    out.push(item);
  };

  const paksha = tithi <= 15 ? "shukla" : "krishna";
  const n = tithi <= 15 ? tithi : tithi - 15; // 1–15 within the paksha
  // A weekday-flavoured Amavasya has its own well-known name; it replaces
  // the plain "Amavasya" + weekday pair so the day reads as ONE highlight.
  let weekdayCovered = false;
  if (uncertain) {
    // Tithi flips near sunrise — skip the label rather than risk a wrong one.
  } else if (tithi === 30 && wd === 2) {
    say(tithiItem("भौमवती अमावस्या", "Bhaumvati Amavasya",
      "मंगलवार को पड़ने वाली अमावस्या। मान्यता है कि इस दिन हनुमान जी की पूजा और पितरों के निमित्त दान विशेष फलदायी होता है।",
      "An Amavasya that falls on a Tuesday. Worship of Hanuman ji and charity for the ancestors are believed to be especially fruitful today."));
    weekdayCovered = true;
  } else if (tithi === 30 && wd === 6) {
    say(tithiItem("शनि अमावस्या", "Shani Amavasya",
      "शनिवार को पड़ने वाली अमावस्या। मान्यता है कि इस दिन शनि देव की उपासना और दान से शनि पीड़ा में राहत मिलती है।",
      "An Amavasya that falls on a Saturday. Worship of Shani Dev and charity today are believed to ease Shani's afflictions."));
    weekdayCovered = true;
  } else if (tithi === 15) {
    say(tithiItem("पूर्णिमा", "Purnima",
      "पूर्ण चंद्रमा की तिथि — दान, स्नान और सत्यनारायण पूजा के लिए शुभ मानी जाती है।",
      "The full-moon day — considered auspicious for charity, holy bathing and Satyanarayan puja."));
  } else if (tithi === 30) {
    say(tithiItem("अमावस्या", "Amavasya",
      "पितरों की तृप्ति और दान-पुण्य की तिथि मानी जाती है।",
      "A tithi associated with satisfying the ancestors and with charity."));
  } else if (n === 11) {
    say(tithiItem("एकादशी", "Ekadashi",
      "भगवान विष्णु की प्रिय तिथि — व्रत, पूजा और दान का विशेष महत्व।",
      "Lord Vishnu's favourite tithi — fasting, worship and charity carry special merit."));
  } else if (n === 13) {
    say(tithiItem("प्रदोष व्रत", "Pradosh Vrat",
      "भगवान शिव की आराधना की तिथि — संध्या के प्रदोष काल में पूजा का महत्व।",
      "A tithi for worshipping Lord Shiva — especially in the evening Pradosh Kaal."));
  } else if (n === 4 && paksha === "krishna" && wd === 2) {
    say(tithiItem("अंगारकी संकष्टी चतुर्थी", "Angarki Sankashti Chaturthi",
      "मंगलवार को पड़ने वाली संकष्टी — गणेश जी की उपासना से विघ्न दूर होने की मान्यता।",
      "A Sankashti that falls on a Tuesday — worship of Ganesh ji is believed to remove obstacles."));
  } else if (n === 4) {
    say(paksha === "krishna"
      ? tithiItem("संकष्टी चतुर्थी", "Sankashti Chaturthi",
          "गणेश जी का व्रत-दिवस — संकटों को हरने वाली चतुर्थी।",
          "Ganesh ji's fasting day — the Chaturthi that removes troubles.")
      : tithiItem("विनायक चतुर्थी", "Vinayaka Chaturthi",
          "गणेश जी की उपासना का दिन — शुभ कार्यों में विघ्न दूर होने की मान्यता।",
          "A day to worship Ganesh ji — believed to remove obstacles from auspicious work."));
  }

  if (wd === 2 && !weekdayCovered) {
    out.push({ hi: "मंगलवार", en: "Tuesday", kind: "weekday",
      descHi: "हनुमान जी को समर्पित दिन — बल, साहस और संकट निवारण की मान्यता।",
      descEn: "A day dedicated to Hanuman ji — associated with strength, courage and relief from troubles." });
  }
  if (wd === 6 && !weekdayCovered) {
    out.push({ hi: "शनिवार", en: "Saturday", kind: "weekday",
      descHi: "शनि देव एवं हनुमान जी का दिन — शनि पीड़ा में राहत की मान्यता।",
      descEn: "The day of Shani Dev and Hanuman ji — believed to ease Shani's afflictions." });
  }
  return out;
}
