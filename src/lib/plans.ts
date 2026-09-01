import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  buildLiveSeva,
  buildSevaComparison,
  isHawanSeva,
  scheduleForPlan,
  sevaFeatureLines,
  type ComparisonValue,
  type LiveSeva,
} from "@/lib/plans-schedule";

// ─────────────────────────────────────────────────────────────────────────────
// PLAN & SEVA DATA — 100% LIVE FROM SUPABASE
//
// Plan-to-seva composition is NEVER hardcoded here. Plans, their included
// sevas, frequencies, features and the seva catalog are fetched live from
// `plans` + `plan_sevas` + `sevas` + `seva_schedule_rules` + `plan_addons`
// (all is_active-filtered). If the DB call fails, consumers must show a
// loading/error state — this module deliberately ships NO hardcoded
// fallback composition data.
//
// What DOES live here statically: per-slug *presentation* assets only
// (carousel images, long-form marketing prose, reviews, benefits) which have
// no DB columns today. These contain no tier-composition data — adding or
// reassigning a seva in the admin manager needs zero code changes.
// ─────────────────────────────────────────────────────────────────────────────

// Plan slide images resolve through the central manifest — see
// src/lib/site-images.ts for how to swap in a real Cloudinary photo.
import { SITE_IMAGES, externalImage, type SiteImage } from "@/lib/site-images";

export type PlanSlide = {
  image: SiteImage;
  title: string;
  subtitle: string;
  step?: string;
  stepClass?: string;
  titleClass?: string;
  subtitleClass?: string;
  scrimClass?: string;
};

// ─── DB row shapes ───────────────────────────────────────────────────────────
interface DbPlan {
  id: string;
  name: string;
  slug: string;
  price_paise: number;
  billing_period: "monthly" | "yearly";
  tagline: string | null;
  highlight_text: string | null;
  card_image_url: string | null;
  is_active: boolean;
  sort_order: number;
}
interface DbSeva {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}
interface DbPlanSeva {
  plan_id: string;
  seva_id: string;
}
interface DbScheduleRule {
  seva_id: string;
  weekday: string;
  occurrence: string;
}
interface DbPlanAddon {
  plan_id: string;
  addon_type: string;
  description: string | null;
  is_active: boolean;
}

// ─── Live composition shapes ─────────────────────────────────────────────────
// Defined in plans-schedule.ts alongside the derivation that produces them;
// re-exported here so consumers keep importing them from "@/lib/plans".
export type { LiveSeva, ComparisonValue } from "@/lib/plans-schedule";

export type Plan = {
  id: string; // public URL id (slug alias, e.g. "grah" for "premium")
  slug: string; // DB slug
  name: string; // DB plans.name
  heading: string; // presentation
  subheading: string; // presentation
  tagline: string; // DB plans.tagline (presentation fallback when null)
  price: string; // derived from price_paise, e.g. "₹251"
  priceNumeric: number; // derived rupees, e.g. 251
  cycle: string; // "/Monthly" | "/Yearly"
  billingPeriod: "monthly" | "yearly";
  strikePrice?: string; // presentation anchor
  image: SiteImage; // presentation (DB card_image_url wins when set)
  slides: PlanSlide[]; // presentation
  ribbon?: string; // presentation
  badge?: { label: string; kind: "popular" | "save" | "max" }; // presentation
  location: string; // single-location label (Pushkar only, user-visible today)
  serviceTags: string[]; // derived from live composition
  features: string[]; // derived live from plan_sevas + schedule rules + addons
  includedSevas: LiveSeva[]; // live plan_sevas join
  comparison: Record<string, ComparisonValue>; // keyed by seva slug + proof/family/prasad/billing
  detail: {
    description: string[]; // presentation
    sevas: { title: string; note: string }[]; // LIVE from plan_sevas
    benefits: string[]; // presentation
    reviews: { n: string; city: string; q: string; stars: number }[]; // presentation
  };
  isVisible: boolean; // DB is_active (rows are pre-filtered)
};

export type SevaListItem = { slug: string; title: string; desc: string; iconKey: string };

// ─── Presentation-only per-slug assets (NO composition data here) ────────────
type PlanPresentation = {
  planId: string;
  heading: string;
  subheading: string;
  tagline: string; // fallback only — DB tagline wins when set
  image: SiteImage;
  slides: PlanSlide[];
  ribbon?: string;
  badge?: Plan["badge"];
  strikePrice?: string;
  detail: {
    description: string[];
    benefits: string[];
    reviews: { n: string; city: string; q: string; stars: number }[];
  };
};

const PLAN_PRESENTATION: Record<string, PlanPresentation> = {
  basic: {
    planId: "basic",
    heading:
      "Monthly Sundarkand Path, Gau Seva and Vanar Seva — 2nd Tuesday of Every Month Sankalp",
    subheading:
      "Family ki suraksha, swasthya aur samriddhi ke liye har mahine aapke naam evam gotra se sankalp",
    tagline:
      "सेवा की शुरुआत — ₹251/Monthly में मासिक सुंदरकांड, गौ सेवा एवं वानर सेवा (2nd Tuesday only)।",
    image: SITE_IMAGES.planBasicHero,
    slides: [
      {
        image: SITE_IMAGES.planBasicHero,
        title: "बेसिक सेवा — 4 सदस्यों तक के लिए",
        subtitle: "सुंदरकांड पाठ • वानर सेवा • गौ सेवा",
      },
      {
        image: SITE_IMAGES.planBasicSankalp,
        title: "संकल्प — आपके नाम व गोत्र से",
        subtitle: "आपकी जानकारी हर माह सेवा में शामिल होती है",
        step: "चरण 1",
      },
      {
        image: SITE_IMAGES.planBasicSeva,
        title: "पंडित जी द्वारा सेवा सम्पन्न",
        subtitle: "तीर्थ गुरु पुष्करराज, पुष्कर में विधिपूर्वक",
        step: "चरण 2",
      },
      {
        image: SITE_IMAGES.planBasicProof,
        title: "प्रमाण सीधे आपके व्हाट्सएप पर",
        subtitle: "🙏 जय श्री राम, [नाम] जी — इस माह आपकी सेवा सम्पन्न हुई। प्रमाण संलग्न है।",
        step: "चरण 3",
      },
    ],
    ribbon: "800+ परिवार जुड़े",
    detail: {
      description: [
        "जब आप मूल संकल्प लेते हैं, तो आपके नाम एवं गोत्र से हर माह दूसरे मंगलवार को श्री हनुमान जी को समर्पित सुंदरकांड पाठ एवं आरती होती है — यह पुण्य आपके परिवार में शांति, सुरक्षा और समृद्धि लाता है।",
        "इस पैक में शामिल है — सुंदरकांड पाठ, आरती, गौ सेवा एवं वानर सेवा। प्रत्येक सेवा का Video Proof आपके WhatsApp पर।",
      ],
      benefits: [
        "परिवार में सकारात्मक ऊर्जा एवं मानसिक शांति",
        "पितृ दोष एवं ग्रह दोष का शमन",
        "श्री हनुमान जी की कृपा से भय एवं संकट का नाश",
        "प्रत्यक्ष दान-पुण्य का सतत् प्रवाह",
      ],
      reviews: [
        {
          n: "Rajesh Sharma",
          city: "Delhi",
          q: "₹251 में इतना पुण्य — हर माह video देखकर मन को शांति मिलती है।",
          stars: 5,
        },
        {
          n: "Sunita Verma",
          city: "Mumbai",
          q: "बच्चे के नाम से संकल्प लिया, अब हर सेवा का proof पूरे परिवार को दिखाती हूँ।",
          stars: 5,
        },
        {
          n: "Vikas Tiwari",
          city: "Lucknow",
          q: "पहले विश्वास नहीं हुआ, लेकिन video प्रमाण देखकर श्रद्धा और गहरी हो गई।",
          stars: 5,
        },
      ],
    },
  },
  premium: {
    planId: "grah",
    heading:
      "Monthly Sundarkand Path, Gau Seva, Vanar Seva, Saadhu Santo Ko Bhojan, Griha Shanti Hawan and Sarv Rog Nivaran Hawan — 2nd Tuesday of Every Month and Last Saturday of Every Month Sankalp",
    subheading:
      "Do sankalp har mahine — do alag hawan ke saath ghar mein shanti evam rog-badha nivaran",
    tagline:
      "सम्पूर्ण पारिवारिक सेवा — 2 सुंदरकांड, 2 अलग हवन (Griha Shanti & Sarv Rog Nivaran), Saadhu Santo Ko Bhojan एवं गौ/वानर सेवा हर माह।",
    image: SITE_IMAGES.planPremiumHero,
    slides: [
      {
        image: SITE_IMAGES.planPremiumHero,
        title: "प्रीमियम सेवा — हवन सहित सम्पूर्ण पूजा",
        subtitle: "हवन एवं आहुति • सुंदरकांड पाठ • Saadhu Santo Ko Bhojan • वानर सेवा • गौ सेवा",
      },
      {
        image: SITE_IMAGES.planPremiumSankalp,
        title: "संकल्प — आपके नाम व गोत्र से",
        subtitle: "हवन सहित सम्पूर्ण पूजा आपकी जानकारी के साथ",
        step: "चरण 1",
      },
      {
        image: SITE_IMAGES.planPremiumHawan,
        title: "हवन — पंडित जी द्वारा विधिपूर्वक सम्पन्न",
        subtitle: "तीर्थ गुरु पुष्करराज, पुष्कर में",
        step: "चरण 2",
      },
      {
        image: SITE_IMAGES.planPremiumProof,
        title: "हर सेवा का प्रमाण — फोटो व वीडियो सहित",
        subtitle:
          "🙏 जय श्री राम, [नाम] जी — इस माह हवन सहित आपकी सम्पूर्ण सेवा सम्पन्न हुई। प्रमाण संलग्न है।",
        step: "चरण 3",
      },
    ],
    ribbon: "500+ परिवार जुड़े",
    badge: { label: "सबसे लोकप्रिय", kind: "popular" },
    detail: {
      description: [
        "गृह शांति संकल्प आपके परिवार के लिए एक आध्यात्मिक कवच है — हर माह दो सुंदरकांड पाठ, दो अलग हवन (गृह शांति और सर्व रोग निवारण), आरती, साधु संतों को भोजन और गौ-वानर सेवा से आपके घर में मंगल का वास होता है।",
        "यह पैक विशेष रूप से उन परिवारों के लिए है जो चाहते हैं कि उनके घर में सकारात्मक ऊर्जा हो और रोग, शोक तथा वास्तु दोष का शमन हो।",
      ],
      benefits: [
        "गृह-कलेश एवं वास्तु दोष का शमन",
        "परिवार के सभी सदस्यों पर श्री हनुमान जी की कृपा",
        "आर्थिक बाधा एवं दरिद्रता का नाश",
        "पूर्वजों की तृप्ति एवं आशीर्वाद",
        "परिवार में सकारात्मक ऊर्जा एवं मानसिक शांति",
        "पितृ दोष एवं ग्रह दोष का शमन",
        "श्री हनुमान जी की कृपा से भय एवं संकट का नाश",
        "प्रत्यक्ष दान-पुण्य का सतत् प्रवाह",
      ],
      reviews: [
        {
          n: "Meena Patel",
          city: "Ahmedabad",
          q: "पिताजी की स्मृति में हर माह सुंदरकांड — video में उनका नाम सुनकर आँखें भर आती हैं।",
          stars: 5,
        },
        {
          n: "Amit Khandelwal",
          city: "Jaipur",
          q: "हवन के बाद घर का माहौल पूरा बदल गया। बहुत ही दिव्य अनुभव है।",
          stars: 5,
        },
        {
          n: "Neha Joshi",
          city: "Pune",
          q: "पूरे परिवार के लिए सबसे संतुलित पैक — हर पैसे का हिसाब video से।",
          stars: 5,
        },
      ],
    },
  },
  "premium-annual": {
    planId: "varsh",
    heading:
      "12 Month Sundarkand Path, Gau Seva, Vanar Seva, Saadhu Santo Ko Bhojan, Griha Shanti Hawan and Sarv Rog Nivaran Hawan Sankalp — 24 Sankalp Yearly with Prasad and Certificate",
    subheading:
      "Poore saal ka sanchit punya — Prasad evam Sankalp Certificate ke saath ghar tak pahunchega",
    tagline:
      "पूरे वर्ष का संकल्प — ₹399 वाली सभी सेवाएं 12 माह + Prasad Box + Sankalp Certificate।",
    image: SITE_IMAGES.planAnnualHero,
    slides: [
      {
        image: SITE_IMAGES.planAnnualHero,
        title: "प्रीमियम वार्षिक — पूरे वर्ष की निश्चिंतता",
        subtitle:
          "हवन एवं आहुति • सुंदरकांड • Saadhu Santo Ko Bhojan • वानर सेवा • गौ सेवा • संकल्प प्रमाणपत्र एवं प्रसाद",
      },
      {
        image: SITE_IMAGES.planAnnualSankalp,
        title: "संकल्प — आपके नाम व गोत्र से",
        subtitle: "हवन सहित सम्पूर्ण पूजा आपकी जानकारी के साथ",
        step: "चरण 1",
      },
      {
        image: SITE_IMAGES.planAnnualHawan,
        title: "हवन — पंडित जी द्वारा विधिपूर्वक सम्पन्न",
        subtitle: "तीर्थ गुरु पुष्करराज, पुष्कर में",
        step: "चरण 2",
      },
      {
        image: SITE_IMAGES.planAnnualProof,
        title: "हर सेवा का प्रमाण — फोटो व वीडियो सहित",
        subtitle:
          "🙏 जय श्री राम, [नाम] जी — इस माह हवन सहित आपकी सम्पूर्ण सेवा सम्पन्न हुई। प्रमाण संलग्न है।",
        step: "चरण 3",
      },
      {
        image: SITE_IMAGES.planAnnualBonus,
        title: "वार्षिक सदस्यों के लिए विशेष प्रसाद",
        subtitle: "सरोवर जल, चंदन तिलक, अक्षत-कुमकुम एवं संकल्प प्रमाणपत्र",
      },
    ],
    ribbon: "सर्वाधिक पुण्यदायी",
    badge: { label: "₹711 की बचत", kind: "save" },
    strikePrice: "₹4,812",
    detail: {
      description: [
        "एक वार्षिक महासंकल्प का पुण्य 12 अलग-अलग मासिक संकल्पों से कहीं अधिक फलदायी माना गया है। पूरे वर्ष अखंड रूप से आपके नाम-गोत्र से सेवाएँ चलती रहती हैं — बिना विघ्न, बिना विराम।",
        "इस पैक में गृह शांति की सभी सेवाएँ 12 महीने + Quarterly Prasad Box एवं Sankalp Certificate शामिल है। ₹4,812 की सेवाएँ मात्र ₹4,101 में — बचत ₹711।",
      ],
      benefits: [
        "गृह-कलेश एवं वास्तु दोष का शमन",
        "परिवार के सभी सदस्यों पर श्री हनुमान जी की कृपा",
        "आर्थिक बाधा एवं दरिद्रता का नाश",
        "पूर्वजों की तृप्ति एवं आशीर्वाद",
        "परिवार में सकारात्मक ऊर्जा एवं मानसिक शांति",
        "पितृ दोष एवं ग्रह दोष का शमन",
        "श्री हनुमान जी की कृपा से भय एवं संकट का नाश",
        "प्रत्यक्ष दान-पुण्य का सतत् प्रवाह",
        "अखंड वार्षिक पुण्य — विघ्न रहित संकल्प",
        "₹711 की बचत — मात्र ₹340 प्रति माह",
      ],
      reviews: [
        {
          n: "Prakash Agarwal",
          city: "Kolkata",
          q: "पूरे साल की चिंता एक ही बार में — यह सबसे शांतिपूर्ण निर्णय था।",
          stars: 5,
        },
        {
          n: "Kavita Iyer",
          city: "Bengaluru",
          q: "चोला सेवा का video देखकर रोंगटे खड़े हो गए। पैसा सार्थक हो गया।",
          stars: 5,
        },
        {
          n: "Ramesh Gupta",
          city: "Indore",
          q: "₹711 की बचत बोनस है — असली फायदा तो पूरे वर्ष का अखंड पुण्य है।",
          stars: 5,
        },
      ],
    },
  },
};

/** Generic presentation for a plan slug with no bespoke assets yet (e.g. a new plan added in admin). */
function genericPresentation(plan: DbPlan): PlanPresentation {
  return {
    planId: plan.slug,
    heading: plan.tagline ?? plan.name,
    subheading: plan.highlight_text ?? "",
    tagline: plan.tagline ?? "",
    image: SITE_IMAGES.planBasicHero,
    slides: [],
    detail: {
      description: plan.tagline ? [plan.tagline] : [],
      benefits: [],
      reviews: [],
    },
  };
}

// Single user-visible location today (Pushkar) — matches existing UI copy.
const LOCATION_LABEL = "तीर्थ गुरु पुष्करराज, पुष्कर";

// ─── Pure derivation helpers ─────────────────────────────────────────────────
/**
 * [Bug 4.6] Exact rupee rendering — the old Math.round silently turned
 * a ₹251.50 plan into "₹252" while Razorpay charged ₹251.50, so the
 * displayed price disagreed with the bank statement. Whole rupees
 * still render without decimals.
 * [Pass-2 L13] Paisa-bearing prices now render BOTH decimals
 * ("₹251.50", not the asymmetric "₹251.5").
 */
export function formatINR(pricePaise: number): string {
  const rupees = pricePaise / 100;
  const hasPaise = pricePaise % 100 !== 0;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Cadence hint parsed from an addon's admin-written description (e.g. "Quarterly Prasad Box — …"). */
function addonCadence(description: string | null): string | undefined {
  if (!description) return undefined;
  if (/quarterly/i.test(description)) return "Quarterly";
  if (/monthly|maasik/i.test(description)) return "Monthly";
  if (/yearly|annual|varsh/i.test(description)) return "Yearly";
  return undefined;
}

function buildPlan(
  dbPlan: DbPlan,
  liveSevas: LiveSeva[],
  planSevas: DbPlanSeva[],
  planAddons: DbPlanAddon[],
): Plan {
  // [Bug 4.11] Presentation content is keyed by hardcoded slugs. If a
  // DB slug ever drifts, the generic fallback silently stripped the
  // plan of its slides/benefits/reviews with NO signal anywhere. Log
  // loudly so the drift is fixable instead of invisible.
  const pres = PLAN_PRESENTATION[dbPlan.slug];
  if (!pres) {
    console.warn(
      `[plans] No PLAN_PRESENTATION entry for slug "${dbPlan.slug}" (plan "${dbPlan.name}", id ${dbPlan.id}) — using generic fallback. ` +
        `Add a matching entry in src/lib/plans.ts or correct the DB slug.`,
    );
  }
  const resolvedPres = pres ?? genericPresentation(dbPlan);
  const includedIds = new Set(
    planSevas.filter((ps) => ps.plan_id === dbPlan.id).map((ps) => ps.seva_id),
  );
  // Rule days are GLOBAL (seva_schedule_rules has no plan dimension); what a
  // subscriber actually receives depends on their tier, so re-derive per plan.
  // Hawan-eligible plans sit in both batches, so their non-hawan sevas run on
  // List A *and* List B — see scheduleForPlan() in plans-schedule.ts.
  const includedSevas = scheduleForPlan(liveSevas.filter((s) => includedIds.has(s.id)));
  const addons = planAddons.filter((a) => a.plan_id === dbPlan.id && a.is_active);
  const prasadAddon = addons.find((a) => a.addon_type === "prasad");
  const hasHawan = includedSevas.some(isHawanSeva);

  // Features list — derived live from plan_sevas + seva_schedule_rules + plan_addons
  const features = sevaFeatureLines(includedSevas);
  addons.forEach((a) => features.push(a.description ?? a.addon_type));
  features.push("WhatsApp Video Proof"); // universal platform feature, not a seva

  // Comparison matrix values — every active seva gets a row keyed by its slug,
  // with the frequency the PLAN gives it (Premium runs Sundarkand twice a month).
  const comparison: Record<string, ComparisonValue> = buildSevaComparison(liveSevas, includedSevas);
  comparison.proof = { has: true };
  comparison.family = { has: true, label: "Up to 4" };
  comparison.prasad = prasadAddon
    ? {
        has: true,
        ...(addonCadence(prasadAddon.description)
          ? { frequency: addonCadence(prasadAddon.description) }
          : {}),
      }
    : { has: false };
  comparison.billing = {
    has: true,
    label: dbPlan.billing_period === "monthly" ? "Monthly" : "Yearly",
  };

  const serviceTags = [
    "Pooja",
    "Chadava",
    ...(hasHawan ? ["Hawan"] : []),
    "Aarti",
    "Daan",
    "Sewa",
    ...(prasadAddon ? ["Prasad Box"] : []),
  ];

  return {
    id: resolvedPres.planId,
    slug: dbPlan.slug,
    name: dbPlan.name,
    heading: resolvedPres.heading,
    subheading: resolvedPres.subheading,
    tagline: dbPlan.tagline ?? resolvedPres.tagline,
    price: formatINR(dbPlan.price_paise),
    priceNumeric: dbPlan.price_paise / 100, // [Bug 4.6] exact — no rounding
    cycle: dbPlan.billing_period === "monthly" ? "/Monthly" : "/Yearly",
    billingPeriod: dbPlan.billing_period,
    strikePrice: resolvedPres.strikePrice,
    // An admin-entered card_image_url is an explicit override and always wins
    // over the bundled/Cloudinary manifest entry for this slug.
    image: dbPlan.card_image_url?.trim()
      ? externalImage(dbPlan.card_image_url.trim(), dbPlan.name)
      : resolvedPres.image,
    slides: resolvedPres.slides,
    ribbon: resolvedPres.ribbon,
    badge: resolvedPres.badge,
    location: LOCATION_LABEL,
    serviceTags,
    features,
    includedSevas,
    comparison,
    detail: {
      description: resolvedPres.detail.description,
      sevas: includedSevas.map((s) => ({
        title: s.name,
        note: s.description ?? (s.days.length ? `हर माह — ${s.days.join(" & ")}` : ""),
      })),
      benefits: resolvedPres.detail.benefits,
      reviews: resolvedPres.detail.reviews,
    },
    isVisible: true,
  };
}

function iconKeyForSeva(seva: DbSeva): string {
  const key = `${seva.slug} ${seva.name}`.toLowerCase();
  if (/sundarkand|पाठ/.test(key)) return "BookOpen";
  if (/hawan|havan/.test(key)) return "Flame";
  if (/aarti/.test(key)) return "Sun";
  if (/gau|cow/.test(key)) return "Wind";
  if (/vanar/.test(key)) return "Heart";
  if (/bhojan|sadhu|santo|brahmin/.test(key)) return "Users";
  return "Sparkles";
}

// ─── Live fetch (throws on failure — callers render error state) ─────────────
export type PublicPlansData = {
  plans: Plan[];
  sevas: LiveSeva[];
  sevaList: SevaListItem[];
};

export async function fetchPublicPlansData(): Promise<PublicPlansData> {
  const [plansRes, sevasRes, planSevasRes, rulesRes, addonsRes] = await Promise.all([
    supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("sevas").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("plan_sevas").select("*"),
    supabase.from("seva_schedule_rules").select("*"),
    supabase.from("plan_addons").select("*").eq("is_active", true),
  ]);
  const error =
    plansRes.error ?? sevasRes.error ?? planSevasRes.error ?? rulesRes.error ?? addonsRes.error;
  if (error) throw new Error(`Supabase: ${error.message}`);

  const dbPlans = (plansRes.data ?? []) as DbPlan[];
  const dbSevas = (sevasRes.data ?? []) as DbSeva[];
  const planSevas = (planSevasRes.data ?? []) as DbPlanSeva[];
  const rules = (rulesRes.data ?? []) as DbScheduleRule[];
  const addons = (addonsRes.data ?? []) as DbPlanAddon[];

  const liveSevas = dbSevas.map((s) => buildLiveSeva(s, rules));
  const plans = dbPlans.map((p) => buildPlan(p, liveSevas, planSevas, addons));
  const sevaList: SevaListItem[] = dbSevas.map((s) => ({
    slug: s.slug,
    title: s.name,
    desc: s.description ?? "",
    iconKey: iconKeyForSeva(s),
  }));

  return { plans, sevas: liveSevas, sevaList };
}

/**
 * Live plans + sevas for all public pages. No hardcoded fallback — on error,
 * render the error state surfaced by React Query (isError / refetch).
 */
export function usePublicPlans() {
  return useQuery<PublicPlansData>({
    queryKey: ["public-plans-data"],
    queryFn: fetchPublicPlansData,
    staleTime: 60_000,
    retry: 1,
  });
}

/** Lookup by public URL id or DB slug (e.g. "grah" | "premium"). */
export function getPlanById(plans: Plan[], id: string): Plan | undefined {
  return plans.find((p) => p.id === id || p.slug === id);
}

// ─── Static marketing content (not plan/seva composition) ────────────────────
export const acharyas = [
  {
    initials: "रा",
    name: "पं. रामस्वरूप शर्मा",
    role: "मुख्य आचार्य — तीर्थ गुरु पुष्करराज",
    bio: "22 वर्षों से तीर्थ गुरु पुष्करराज में सेवारत। हवन विशेषज्ञ। काशी विद्यापीठ से वेद-शास्त्र में स्नातक।",
    quote: "सेवा ही हमारा धर्म है।",
  },
  {
    initials: "वि",
    name: "पं. विनायक जी",
    role: "सुंदरकांड प्रमुख",
    bio: "8 वर्षों से सुंदरकांड पाठ में विशेषज्ञ। सस्वर एवं संकल्प-सम्मत पाठ के आचार्य।",
    quote: "राम नाम सबसे बड़ा मंत्र।",
  },
  {
    initials: "गो",
    name: "पं. गोविंद प्रसाद तिवारी",
    role: "गौ सेवा एवं अनुष्ठान प्रमुख",
    bio: "15 वर्षों से गौशाला सेवा। वानर सेवा एवं साधु संतों को भोजन के संयोजक।",
    quote: "गौ माता की सेवा में ही समस्त देवताओं की सेवा है।",
  },
];

export const testimonials = [
  {
    q: "हर सप्ताह WhatsApp पर video देखकर मन को असीम शांति मिलती है। माँ के नाम से हवन करवाना अब संभव हो सका।",
    n: "Rajesh Sharma",
    city: "Delhi",
  },
  {
    q: "व्यस्तता के कारण मैं स्वयं तीर्थ गुरु पुष्करराज नहीं जा सकती थी। पुण्यता ने यह सम्भव कर दिया।",
    n: "Sunita Verma",
    city: "Mumbai",
  },
  {
    q: "गौ-सेवा का सीधा पुण्य अब हर महीने। यह business नहीं, सच्ची सेवा है। जय बजरंगबली।",
    n: "Amit Khandelwal",
    city: "Jaipur",
  },
  {
    q: "पिताजी की स्मृति में हर माह सुंदरकांड — और video में उनका नाम सुनकर आँखें भर आती हैं।",
    n: "Meena Patel",
    city: "Ahmedabad",
  },
  {
    q: "₹251 में इतनी सेवाएँ — पहले विश्वास नहीं हुआ, लेकिन हर माह video देखकर श्रद्धा और गहरी हो गई।",
    n: "Vikas Tiwari",
    city: "Lucknow",
  },
];

export const faqs = [
  {
    q: "इतने सस्ते में कैसे करवा पा रहे हो यह सब?",
    a: "सभी के नाम का संकल्प साथ में लिया जाएगा। हर व्यक्ति का नाम और गोत्र अलग-अलग बोला जाएगा, लेकिन पंडित जी एक ही बार में सबके संकल्प सामूहिक रूप से ले लेंगे। इसीलिए यह सेवा सभी के लिए सुलभ और सस्ती रखी गई है।",
  },
  {
    q: "पहली सेवा कब शुरू होगी?",
    a: "अगर आप महीने के दूसरे मंगलवार से पहले सब्सक्राइब करते हैं, तो आपकी पहली सेवा उसी महीने के दूसरे मंगलवार को होती है — आपके प्लान की सभी सेवाओं के साथ। Premium और Premium Annual सदस्यों को उसी महीने के आखिरी शनिवार को अतिरिक्त सेवाएं (Saadhu Santo Ko Bhojan दोबारा + Sarv Rog Nivaran Hawan) भी मिलती हैं। अगर आप दूसरे मंगलवार के बाद जॉइन करते हैं, तो Basic सदस्यों को अगले महीने के दूसरे मंगलवार का इंतज़ार करना होता है (हालांकि इस बीच उसी महीने के आखिरी शनिवार में एक बार शामिल कर लिया जाता है, Hawan को छोड़कर)।",
  },
  { q: "Refund Policy क्या है?", a: "अगर किसी कारणवश सेवा न हो सके तो पूरा धन वापस किया जाएगा।" },
  {
    q: "क्या मुझे प्रत्येक सेवा का प्रमाण मिलेगा?",
    a: "जी हाँ। प्रत्येक अनुष्ठान का Live या Video Proof सीधे आपके WhatsApp पर भेजा जाता है।",
  },
  {
    q: "क्या यह कोई business है?",
    a: `ईमानदारी से कहें तो — पुण्यता एक संगठित सेवा है, और किसी भी संगठन को चलते रहने के लिए आत्मनिर्भर होना पड़ता है। हम इसे छिपाते नहीं। फर्क सिर्फ प्राथमिकता का है: यहाँ पहले सेवा आती है, फिर उसे हर महीने बिना रुके चलाते रहने का प्रबंध। और आपका दिया हुआ पैसा कहाँ-कहाँ जाता है, यह जानने का पूरा हक आपका है।

बड़ा हिस्सा — सीधे दान-पुण्य में: गौ-माता का चारा, वानरों के फल, साधु संतों का भोजन, तथा हवन एवं अनुष्ठान की सामग्री।

शेष हिस्सा — पुण्यता को चलाने में: आचार्य एवं पंडित जी की टीम की दक्षिणा; हर सेवा की वीडियो रिकॉर्डिंग एवं एडिटिंग करने वाली टीम; पुष्कर का ऑफिस एवं वहाँ की व्यवस्था; तथा app, website, payment एवं WhatsApp पर प्रमाण पहुँचाने का तकनीकी खर्च।

इसके साथ वह पूरी टीम भी — मैनेजर एवं समन्वयक जो हर महीने संकल्प सूची तैयार करते हैं, सेवाओं का शेड्यूल संभालते हैं, प्रमाण जाँचकर हर परिवार तक भेजते हैं, और आपके प्रश्नों का उत्तर देते हैं। यही लोग हैं जिनकी वजह से हर सेवा समय पर और बिना चूक के पूरी होती है।

यही संतुलन है जिसकी वजह से जो सेवा सामान्यतः हज़ारों में पड़ती है, वह आप तक मात्र ₹251 में पहुँच पाती है — और हर महीने पहुँचती रहती है।`,
  },
  {
    q: "क्या मैं अपने माता-पिता के नाम से संकल्प ले सकता हूँ?",
    a: "अवश्य। आप अपने माता-पिता, स्वर्गीय प्रियजनों या किसी भी सदस्य के नाम और गोत्र से यह मासिक संकल्प आरंभ कर सकते हैं।",
  },
  {
    q: "क्या मैं किसी भी समय cancel कर सकता हूँ?",
    a: "जी हाँ, बिना किसी शुल्क या प्रश्न के आप अपना मासिक योगदान कभी भी रोक सकते हैं।",
  },
];
