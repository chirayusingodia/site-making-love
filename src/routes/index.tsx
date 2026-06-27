import { createFileRoute } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircle,
  X,
  Shield,
  Video,
  Ban,
  Star,
  Lock,
  Play,
  Pause,
  Music2,
  Check,
  CheckCheck,
  Calendar,
  Flame,
  BookOpen,
  Wind,
  Heart,
  Users,
  Sparkles,
  ArrowRight,
  ChevronUp,
} from "lucide-react";
import heroImg from "@/assets/pushkar-hero.jpg";
import havanImg from "@/assets/havan.jpg";
import gauSevaImg from "@/assets/gau-seva.jpg";
import pushkarGhatImg from "@/assets/pushkar-ghat.jpg";

const WHATSAPP_NUMBER = "+91 80058 28548";
const WHATSAPP_RAW = "918005828548";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_RAW}?text=${encodeURIComponent(
  "Jai Siyaram, मुझे पुण्यम सेवा से जुड़ना है।",
)}`;
const AUDIO_URL =
  "https://upload.wikimedia.org/wikipedia/commons/2/20/Hanuman_Chalisa_-_Hari_Om_Sharan.ogg";

// ---------------------- i18n ----------------------
type Lang = "hi" | "en";
type Dict = Record<string, string>;

const DICT: Record<Lang, Dict> = {
  hi: {
    nav_sundarkand: "सुंदरकांड",
    nav_sevas: "सेवाएँ",
    nav_packages: "Plans",
    nav_pandits: "आचार्य",
    nav_faq: "प्रश्न",
    nav_cta: "Join Now",
    hero_badge: "1,200+ परिवार इस सेवा से जुड़े हैं",
    hero_kicker: "जय सियाराम • तीर्थ गुरु पुष्करराज से",
    hero_h1_l1: "हर घर में सुंदरकांड,",
    hero_h1_l2: "हर मन में राम।",
    hero_para:
      "व्यस्तता के कारण स्वयं अनुष्ठान नहीं कर पाते? संस्थान आपके नाम एवं गोत्र से तीर्थ गुरु पुष्करराज में मासिक सुंदरकांड पाठ, गृह शांति हवन, गौ सेवा एवं ब्राह्मण भोज सम्पन्न करवाता है।",
    hero_cta: "See Plans — ₹251 से शुरू",
    trust_secure: "100% Secure Payment",
    trust_video: "हर month Video Proof",
    trust_nohidden: "कोई Hidden Charges नहीं",
    counters_title: "Ab Tak Ki Sewa",
    c1: "सुंदरकांड पाठ सम्पन्न",
    c2: "गौ माताओं को चारा अर्पित",
    c3: "ब्राह्मणों को भोजन",
    c4: "परिवार जुड़े",
    manifesto:
      "बालाजी की असीम कृपा और प्रेरणा से हम राम नाम और सुंदरकांड के इस mission में निरंतर लगे हैं — यह कोई business नहीं, यह सनातन सेवा का सामूहिक यज्ञ है।",
    manifesto_sub: "पूर्ण पारदर्शिता • हर पैसे का हिसाब • Video Proof",
    sk_kicker: "सुंदरकांड का महात्म्य",
    sk_h1_l1: "जहाँ सुंदरकांड,",
    sk_h1_l2: "वहाँ संकट का नाश।",
    sk_quote:
      "सुंदरकांड का पाठ करने वाले के घर में न दरिद्रता रहती है, न रोग, न शोक, न भय।",
    sk_para:
      "श्री राम चरितमानस का सुंदरकांड — एकमात्र ऐसा कांड है जिसमें श्री हनुमान जी ने स्वयं अपने पराक्रम से असंभव को संभव कर दिखाया। यह पाठ साक्षात हनुमान जी का आवाहन है — बिगड़े काम बनते हैं, ग्रह दोष शांत होते हैं, और परिवार में सकारात्मक ऊर्जा का संचार होता है।",
    sk_cost_label: "आज के समय में सुंदरकांड की लागत",
    sk_cost: "₹7,000–11,000",
    sk_cost_sub: "सामान्य आचार्य शुल्क",
    sk_cost_para:
      "इसलिए श्री हनुमान जी की कृपा से हमने संकल्प लिया — यह पुण्य हर घर तक पहुँचे। सामूहिक संकल्प के माध्यम से मात्र ₹251 में आपके नाम और गोत्र से सुंदरकांड पाठ।",
    daan_kicker: "तीर्थ गुरु पुष्करराज में दान का माहात्म्य",
    daan_h1_l1: "तीर्थ गुरु पुष्करराज —",
    daan_h1_l2: "जहाँ एक दान, सहस्र पुण्य।",
    daan_para:
      "पद्म पुराण के अनुसार तीर्थ गुरु पुष्करराज समस्त तीर्थों का राजा है — स्वयं ब्रह्मा जी का यज्ञ स्थल। यहाँ किया गया एक दान अन्य स्थानों पर किए सहस्र दानों के समान फलदायी होता है।",
    daan_gau_t: "गौ माता को हरा चारा",
    daan_gau_p:
      "शास्त्रों में गौ माता में तैंतीस कोटि देवताओं का वास माना गया है। हरा चारा अर्पण करने से पितृ दोष शांत होते हैं, लक्ष्मी का वास होता है।",
    daan_gau_q: '"गावो विश्वस्य मातरः" — गाय ही सम्पूर्ण विश्व की माता हैं।',
    daan_van_t: "मंगलवार को वानरों को केला",
    daan_van_p:
      "मंगलवार श्री हनुमान जी का दिन है। इस दिन वानरों को केला, चना और गुड़ खिलाना साक्षात हनुमान जी की सेवा मानी जाती है।",
    daan_van_q: '"हनुमान सम नहिं बड़भागी" — हर मंगलवार आपके नाम से वानर सेवा।',
    wa_proof_title: "आपको ऐसा Proof मिलेगा WhatsApp पर",
    wa_proof_para:
      "हर माह के पहले सप्ताह में आपके WhatsApp पर सभी सेवाओं का Proof भेजा जाता है।",
    gallery_title: "पिछले माह की सेवाओं की झलक",
    gallery_sub: "जून 2026 — 1,200+ परिवारों के लिए सम्पन्न",
    gallery_footer: "सदस्य बनने पर यह सभी Videos आपके WhatsApp पर आती हैं।",
    sevas_kicker: "आपकी मासिक सेवाएँ",
    sevas_title: "पाँच पवित्र अनुष्ठान — पूरे परिवार के लिए",
    family_kicker: "परिवार सहित संकल्प",
    family_title: "हर योजना में परिवार के 4 सदस्यों तक का नाम सम्मिलित",
    family_para:
      "माता, पिता, पत्नी, संतान — सबके नाम एवं गोत्र से एक साथ संकल्प।",
    family_cta: "See Plans",
    pandits_title: "हमारे आचार्य — जो आपकी सेवा करते हैं",
    journey_kicker: "पुण्य की यात्रा",
    journey_title: "तीन सरल चरण",
    test_kicker: "भक्तों के अनुभव",
    test_title: "1,200+ परिवारों का विश्वास।",
    faq_kicker: "शंका समाधान",
    faq_title: "अक्सर पूछे जाने वाले प्रश्न",
    faq_popular: "लोकप्रिय",
    final_kicker: "जय श्री राम • जय बजरंगबली",
    final_title: "अखंड पुण्य के भागीदार बनें।",
    final_para:
      "₹251/month से शुरू — सुंदरकांड, गृह शांति हवन, गौ सेवा, वानर सेवा एवं ब्राह्मण भोजन। परिवार के 4 सदस्यों तक का संकल्प। हर अनुष्ठान का Video Proof आपके WhatsApp पर।",
    final_cta: "Join Now",
    final_sub: "कोई Hidden Charges नहीं • कभी भी Cancel करें • पूर्ण पारदर्शिता",
    foot_tag: "सनातन सेवा का सामूहिक यज्ञ — तीर्थ गुरु पुष्करराज से, आपके परिवार तक।",
    foot_addr: "पुण्यम सेवा संस्थान, तीर्थ गुरु पुष्करराज, राजस्थान — 305022",
    foot_contact: "संपर्क करें",
    foot_24x7: "WhatsApp पर 24×7 उपलब्ध",
    foot_trust: "विश्वास एवं भुगतान",
    foot_pay: "UPI • PhonePe • GPay • Debit/Credit Card",
    foot_copy: "© 2026 पुण्यम सेवा संस्थान • सर्वाधिकार सुरक्षित",
    sticky_top: "₹251 से शुरू • कभी भी Cancel करें",
    sticky_title: "परिवार सहित संकल्प",
    sticky_cta: "Join Now",
    seePlansFloat: "See Plans",
    pkg_kicker: "अपना संकल्प चुनें",
    pkg_title_l1: "तीन पवित्र योजनाएँ —",
    pkg_title_l2: "हर श्रद्धा के लिए।",
    pkg_new_members: "इस माह 68 नए परिवार जुड़े",
    pkg_family_note:
      "हर योजना में आपके परिवार के 4 सदस्यों तक का नाम एवं गोत्र सम्मिलित।",
    pkg_footer:
      "कोई Hidden Charges नहीं • कभी भी Cancel करें • 100% Secure Payment via Razorpay",
    urgency_label: "अगला सुंदरकांड पाठ",
    urgency_after: "— अभी join करें तो इसमें शामिल होंगे",
    intro_text: "सभी को जय सिया राम",
    sk_listen: "सुंदरकांड सुनें",
    plan_join: "Join Now",
    plan_popular: "सबसे लोकप्रिय",
    plan_max_punya: "सर्वाधिक पुण्यदायी",
    plan_save: "₹711 की बचत",
    monthly: "/माह",
    yearly: "/वर्ष",
    not_in_basic: "Premium में उपलब्ध",
    not_in_yearly: "वार्षिक में उपलब्ध",
  },
  en: {
    nav_sundarkand: "Sundarkand",
    nav_sevas: "Sevas",
    nav_packages: "Plans",
    nav_pandits: "Acharyas",
    nav_faq: "FAQ",
    nav_cta: "Join Now",
    hero_badge: "1,200+ families already joined",
    hero_kicker: "Jai Siyaram • From Tirth Guru Pushkarraj",
    hero_h1_l1: "Sundarkand in every home,",
    hero_h1_l2: "Ram in every heart.",
    hero_para:
      "Too busy to perform rituals yourself? Our institution performs monthly Sundarkand path, Grah Shanti Havan, Gau Seva and Brahmin Bhoj at Tirth Guru Pushkarraj in your name and gotra.",
    hero_cta: "See Plans — starting ₹251",
    trust_secure: "100% Secure Payment",
    trust_video: "Video Proof every month",
    trust_nohidden: "No hidden charges",
    counters_title: "Our Sevas So Far",
    c1: "Sundarkand paths completed",
    c2: "Cows fed",
    c3: "Brahmins served meals",
    c4: "Families joined",
    manifesto:
      "By Balaji's grace we remain devoted to this mission of Ram naam and Sundarkand — this is not a business, it is a collective yagya of Sanatan seva.",
    manifesto_sub: "Full transparency • Every rupee accounted • Video Proof",
    sk_kicker: "Significance of Sundarkand",
    sk_h1_l1: "Where Sundarkand,",
    sk_h1_l2: "there ends suffering.",
    sk_quote:
      "In the home where Sundarkand is recited, there is no poverty, illness, sorrow or fear.",
    sk_para:
      "Sundarkand of Sri Ramcharitmanas is the only canto where Sri Hanuman ji himself turned the impossible into reality. This path is a direct invocation of Hanuman ji — broken matters mend, grah doshas calm, and positive energy fills the home.",
    sk_cost_label: "Cost of a Sundarkand today",
    sk_cost: "₹7,000–11,000",
    sk_cost_sub: "typical acharya fee",
    sk_cost_para:
      "So by Sri Hanuman ji's grace we resolved — let this punya reach every home. Through collective sankalp, in just ₹251 we do Sundarkand path in your name and gotra.",
    daan_kicker: "Significance of daan at Tirth Guru Pushkarraj",
    daan_h1_l1: "Tirth Guru Pushkarraj —",
    daan_h1_l2: "where one daan equals a thousand.",
    daan_para:
      "According to Padma Purana, Tirth Guru Pushkarraj is the king of all tirthas — the yagya site of Brahma ji himself. A daan offered here yields fruit equal to a thousand offered elsewhere.",
    daan_gau_t: "Green fodder for Gau Mata",
    daan_gau_p:
      "Scriptures hold that 33 koti devas reside in Gau Mata. Offering green fodder pacifies pitru dosha and invites Lakshmi.",
    daan_gau_q: '"Gavo vishvasya matarah" — cows are the mothers of the universe.',
    daan_van_t: "Bananas to vanaras on Tuesday",
    daan_van_p:
      "Tuesday is Hanuman ji's day. Feeding monkeys bananas, chana and gud on this day is direct seva of Hanuman ji himself.",
    daan_van_q: '"Hanuman sam nahin badbhagi" — every Tuesday, vanar seva in your name.',
    wa_proof_title: "This is the proof you receive on WhatsApp",
    wa_proof_para:
      "In the first week of every month, proof of all sevas is sent to your WhatsApp.",
    gallery_title: "A glimpse of last month's sevas",
    gallery_sub: "June 2026 — performed for 1,200+ families",
    gallery_footer: "When you join, all these videos come to your WhatsApp.",
    sevas_kicker: "Your monthly sevas",
    sevas_title: "Five sacred rituals — for your whole family",
    family_kicker: "Family-inclusive sankalp",
    family_title: "Every plan includes up to 4 family members",
    family_para: "Mother, father, spouse, children — sankalp together by name and gotra.",
    family_cta: "See Plans",
    pandits_title: "Our Acharyas — who serve you",
    journey_kicker: "Journey of punya",
    journey_title: "Three simple steps",
    test_kicker: "Devotees' experiences",
    test_title: "Trusted by 1,200+ families.",
    faq_kicker: "Your questions answered",
    faq_title: "Frequently asked questions",
    faq_popular: "Popular",
    final_kicker: "Jai Shri Ram • Jai Bajrangbali",
    final_title: "Become a partner in everlasting punya.",
    final_para:
      "Starting at ₹251/month — Sundarkand, Grah Shanti Havan, Gau Seva, Vanar Seva and Brahmin Bhoj. Sankalp for up to 4 family members. Video Proof of every ritual on your WhatsApp.",
    final_cta: "Join Now",
    final_sub: "No hidden charges • Cancel anytime • Full transparency",
    foot_tag:
      "A collective yagya of Sanatan seva — from Tirth Guru Pushkarraj to your family.",
    foot_addr: "Punyam Seva Sansthan, Tirth Guru Pushkarraj, Rajasthan — 305022",
    foot_contact: "Contact",
    foot_24x7: "Available 24×7 on WhatsApp",
    foot_trust: "Trust & Payments",
    foot_pay: "UPI • PhonePe • GPay • Debit/Credit Card",
    foot_copy: "© 2026 Punyam Seva Sansthan • All rights reserved",
    sticky_top: "Starting ₹251 • cancel anytime",
    sticky_title: "Family-inclusive sankalp",
    sticky_cta: "Join Now",
    seePlansFloat: "See Plans",
    pkg_kicker: "Choose your sankalp",
    pkg_title_l1: "Three sacred plans —",
    pkg_title_l2: "for every shraddha.",
    pkg_new_members: "68 new families joined this month",
    pkg_family_note: "Every plan covers up to 4 family members by name and gotra.",
    pkg_footer:
      "No hidden charges • Cancel anytime • 100% Secure Payment via Razorpay",
    urgency_label: "Next Sundarkand path",
    urgency_after: "— join now to be included",
    intro_text: "Jai Siya Ram to all",
    sk_listen: "Listen to Sundarkand",
    plan_join: "Join Now",
    plan_popular: "Most Popular",
    plan_max_punya: "Most Punya",
    plan_save: "Save ₹711",
    monthly: "/month",
    yearly: "/year",
    not_in_basic: "Available in Premium",
    not_in_yearly: "Available in Yearly",
  },
};

const LangCtx = createContext<{ lang: Lang; t: (k: string) => string; setLang: (l: Lang) => void }>(
  { lang: "hi", t: (k) => k, setLang: () => {} },
);

function useLang() {
  return useContext(LangCtx);
}

function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("hi");
  useEffect(() => {
    const stored = (typeof window !== "undefined" && (localStorage.getItem("punyam_lang") as Lang)) || "hi";
    setLangState(stored === "en" ? "en" : "hi");
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("punyam_lang", l);
  };
  const t = (k: string) => DICT[lang][k] ?? DICT.hi[k] ?? k;
  const value = useMemo(() => ({ lang, t, setLang }), [lang]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

// ---------------------- Route ----------------------
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title:
          "पुण्यम सेवा — तीर्थ गुरु पुष्करराज से मासिक सुंदरकांड, हवन व गौ सेवा",
      },
      {
        name: "description",
        content:
          "तीर्थ गुरु पुष्करराज से आपके नाम एवं गोत्र से मासिक सुंदरकांड पाठ, गृह शांति हवन, गौ सेवा, वानर सेवा एवं ब्राह्मण भोजन। प्रत्येक अनुष्ठान का Video Proof सीधे WhatsApp पर।",
      },
      { property: "og:title", content: "पुण्यम सेवा — तीर्थ गुरु पुष्करराज से मासिक सेवा" },
      { property: "og:description", content: "सनातन सेवा का सामूहिक यज्ञ — पूर्ण पारदर्शिता के साथ।" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: () => (
    <LangProvider>
      <HomePage />
    </LangProvider>
  ),
});

// ---------------------- Data ----------------------
type SevaItem = {
  num: string;
  titleHi: string; titleEn: string;
  descHi: string; descEn: string;
  quoteHi: string; quoteEn: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
};
const sevas: SevaItem[] = [
  {
    num: "1", Icon: BookOpen,
    titleHi: "सुंदरकांड पाठ", titleEn: "Sundarkand Path",
    descHi: "आपके नाम एवं गोत्र से संकल्पपूर्वक सस्वर सुंदरकांड पाठ — श्री हनुमान जी की कृपा हेतु।",
    descEn: "Melodious Sundarkand recitation in your name and gotra — for Sri Hanuman ji's grace.",
    quoteHi: "जय जय जय हनुमान गोसाईं।",
    quoteEn: "Jai Jai Jai Hanuman Gosain.",
  },
  {
    num: "2", Icon: Flame,
    titleHi: "गृह शांति हवन", titleEn: "Grah Shanti Havan",
    descHi: "विद्वान आचार्यों द्वारा वैदिक मंत्रों से गृह शांति हवन — आपके परिवार की मंगल कामना सहित।",
    descEn: "Grah Shanti Havan by learned acharyas with Vedic mantras — with blessings for your family.",
    quoteHi: "ॐ स्वाहा — अग्निदेव शुद्धि के साक्षी।",
    quoteEn: "Om Svaha — Agnidev is witness to purification.",
  },
  {
    num: "3", Icon: Leaf,
    titleHi: "गौ माता सेवा", titleEn: "Gau Mata Seva",
    descHi: "स्थानीय गौशालाओं में गौ माता को हरा चारा एवं गुड़ का अर्पण — सीधा पुण्य।",
    descEn: "Green fodder and jaggery offered to cows at local goshalas — direct punya.",
    quoteHi: "गावो विश्वस्य मातरः।",
    quoteEn: "Gavo vishvasya matarah.",
  },
  {
    num: "4", Icon: Heart,
    titleHi: "वानर सेवा", titleEn: "Vanar Seva",
    descHi: "तीर्थ गुरु पुष्करराज के पवित्र स्थलों पर वानरों को केला एवं चना — श्री हनुमान जी के प्रिय।",
    descEn: "Bananas and chana to vanaras at sacred spots of Tirth Guru Pushkarraj — dear to Hanuman ji.",
    quoteHi: "हनुमान सम नहिं बड़भागी।",
    quoteEn: "None as blessed as Hanuman.",
  },
  {
    num: "5", Icon: Users,
    titleHi: "ब्राह्मण भोजन", titleEn: "Brahmin Bhojan",
    descHi: "विद्वान ब्राह्मणों को सात्विक भोजन एवं यथायोग्य सत्कार — पितृ आशीर्वाद।",
    descEn: "Satvik bhojan and respectful satkar to learned Brahmins — for pitru aashirvad.",
    quoteHi: "ब्राह्मणो भोजितो येन तेन तृप्ताः पितामहाः।",
    quoteEn: "Feed a Brahmin and the pitamahas are satisfied.",
  },
];

function Leaf({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <Wind size={size} className={className} />;
}

type Plan = {
  id: "basic" | "grah" | "varsh";
  nameHi: string; nameEn: string;
  taglineHi: string; taglineEn: string;
  price: string;
  cycleKey: "monthly" | "yearly";
  strikePrice?: string;
  badge?: "popular" | "max";
  features: { hi: string; en: string; included: boolean; noteKey?: string }[];
};

const plans: Plan[] = [
  {
    id: "basic",
    nameHi: "मूल संकल्प", nameEn: "Mool Sankalp",
    taglineHi: "सेवा की शुरुआत", taglineEn: "Begin your seva",
    price: "₹251",
    cycleKey: "monthly",
    features: [
      { hi: "सुंदरकांड पाठ — महीने में 1 बार", en: "Sundarkand path — 1× per month", included: true },
      { hi: "गौ सेवा — हरा चारा अर्पण", en: "Gau Seva — green fodder", included: true },
      { hi: "वानर सेवा — केला व चना", en: "Vanar Seva — banana & chana", included: true },
      { hi: "ब्राह्मण भोजन — 5 ब्राह्मण", en: "Brahmin Bhojan — 5 Brahmins", included: true },
      { hi: "WhatsApp Video Proof — हर माह", en: "WhatsApp Video Proof — every month", included: true },
      { hi: "परिवार के 4 सदस्यों का संकल्प", en: "Sankalp for 4 family members", included: true },
      { hi: "गृह शांति हवन", en: "Grah Shanti Havan", included: false, noteKey: "not_in_basic" },
      { hi: "सुंदरकांड — माह में 2 बार", en: "Sundarkand — 2× per month", included: false, noteKey: "not_in_basic" },
      { hi: "हनुमान जी सिंदूर सेवा", en: "Hanuman Sindoor Seva", included: false, noteKey: "not_in_basic" },
      { hi: "हनुमान जी चोला सेवा", en: "Hanuman Chola Seva", included: false, noteKey: "not_in_yearly" },
    ],
  },
  {
    id: "grah",
    nameHi: "गृह शांति", nameEn: "Grah Shanti",
    taglineHi: "सम्पूर्ण पारिवारिक सेवा", taglineEn: "Complete family seva",
    price: "₹401",
    cycleKey: "monthly",
    badge: "popular",
    features: [
      { hi: "सुंदरकांड पाठ — महीने में 2 बार", en: "Sundarkand path — 2× per month", included: true },
      { hi: "गृह शांति हवन — हर माह", en: "Grah Shanti Havan — every month", included: true },
      { hi: "गौ सेवा + वानर सेवा", en: "Gau Seva + Vanar Seva", included: true },
      { hi: "ब्राह्मण भोजन — 5 ब्राह्मण", en: "Brahmin Bhojan — 5 Brahmins", included: true },
      { hi: "हनुमान जी सिंदूर सेवा — हर माह", en: "Hanuman Sindoor Seva — every month", included: true },
      { hi: "WhatsApp Video Proof — सभी सेवाओं का", en: "WhatsApp Video Proof — for all sevas", included: true },
      { hi: "परिवार के 4 सदस्यों का संकल्प", en: "Sankalp for 4 family members", included: true },
      { hi: "हनुमान जी चोला सेवा", en: "Hanuman Chola Seva", included: false, noteKey: "not_in_yearly" },
      { hi: "वार्षिक बचत ₹711", en: "Annual savings ₹711", included: false, noteKey: "not_in_yearly" },
    ],
  },
  {
    id: "varsh",
    nameHi: "वार्षिक महासंकल्प", nameEn: "Annual Mahasankalp",
    taglineHi: "पूरे वर्ष का संकल्प", taglineEn: "Full-year sankalp",
    price: "₹4,101",
    cycleKey: "yearly",
    strikePrice: "₹4,812",
    badge: "max",
    features: [
      { hi: "₹401 वाली सभी सेवाएं — 12 माह", en: "Everything in ₹401 plan — 12 months", included: true },
      { hi: "सुंदरकांड — 24 पाठ (2 प्रति माह)", en: "Sundarkand — 24 paths (2/month)", included: true },
      { hi: "गृह शांति हवन — 12 बार", en: "Grah Shanti Havan — 12 times", included: true },
      { hi: "हनुमान जी सिंदूर सेवा — 12 बार", en: "Hanuman Sindoor Seva — 12 times", included: true },
      { hi: "हनुमान जी चोला सेवा — वार्षिक (1 बार)", en: "Hanuman Chola Seva — yearly (1×)", included: true },
      { hi: "गौ सेवा + वानर सेवा — हर माह", en: "Gau + Vanar Seva — every month", included: true },
      { hi: "ब्राह्मण भोजन — हर माह", en: "Brahmin Bhojan — every month", included: true },
      { hi: "WhatsApp Video Proof — सभी अनुष्ठानों का", en: "WhatsApp Video Proof — every ritual", included: true },
      { hi: "₹711 की सीधी बचत", en: "Direct savings of ₹711", included: true },
      { hi: "परिवार के 4 सदस्यों का संकल्प", en: "Sankalp for 4 family members", included: true },
    ],
  },
];

const journey = [
  {
    titleHi: "मासिक संकल्प", titleEn: "Monthly sankalp",
    descHi: "अपना नाम, गोत्र एवं संकल्प साझा करें। मासिक योगदान ₹251 मात्र।",
    descEn: "Share your name, gotra and sankalp. Monthly contribution only ₹251.",
    benefitHi: "केवल 2 minute में registration — कोई कागज़ी कार्यवाही नहीं।",
    benefitEn: "Registration in just 2 minutes — no paperwork.",
  },
  {
    titleHi: "तीर्थ गुरु पुष्करराज में अनुष्ठान", titleEn: "Ritual at Tirth Guru Pushkarraj",
    descHi: "हमारे आचार्य आपके नाम से सुंदरकांड, हवन एवं समस्त सेवाएँ सम्पन्न करते हैं।",
    descEn: "Our acharyas perform Sundarkand, havan and all sevas in your name.",
    benefitHi: "विद्वान वैदिक ब्राह्मणों द्वारा शास्त्र-सम्मत विधि।",
    benefitEn: "Shastra-compliant vidhi by learned Vedic Brahmins.",
  },
  {
    titleHi: "WhatsApp पर Video Proof", titleEn: "Video proof on WhatsApp",
    descHi: "प्रत्येक अनुष्ठान का Live या Video Proof सीधे आपके WhatsApp पर।",
    descEn: "Live or video proof of every ritual, straight to your WhatsApp.",
    benefitHi: "हर video में आपका नाम बोला जाता है — 100% प्रमाण।",
    benefitEn: "Your name is spoken in every video — 100% proof.",
  },
];

const testimonials = [
  {
    qHi: "हर सप्ताह WhatsApp पर video देखकर मन को असीम शांति मिलती है। माँ के नाम से हवन करवाना अब संभव हो सका।",
    qEn: "Watching the WhatsApp video every week gives immense peace. Now I can have a havan done in my mother's name.",
    n: "Rajesh Sharma", city: "Delhi", initials: "RS",
  },
  {
    qHi: "व्यस्तता के कारण मैं स्वयं तीर्थ गुरु पुष्करराज नहीं जा सकती थी। पुण्यम सेवा ने यह सम्भव कर दिया।",
    qEn: "I couldn't travel to Tirth Guru Pushkarraj myself. Punyam Seva made it possible.",
    n: "Sunita Verma", city: "Mumbai", initials: "SV",
  },
  {
    qHi: "गौ-सेवा का सीधा पुण्य अब हर महीने। यह business नहीं, सच्ची सेवा है। जय बजरंगबली।",
    qEn: "Direct gau-seva punya every month. This isn't business, it's true seva. Jai Bajrangbali.",
    n: "Amit Khandelwal", city: "Jaipur", initials: "AK",
  },
  {
    qHi: "पिताजी की स्मृति में हर माह सुंदरकांड पाठ — और video में उनका नाम सुनकर आँखें भर आती हैं।",
    qEn: "Monthly Sundarkand in my father's memory — eyes tear up hearing his name in the video.",
    n: "Meena Patel", city: "Ahmedabad", initials: "MP",
  },
  {
    qHi: "₹251 में इतनी सेवाएँ — पहले विश्वास नहीं हुआ, लेकिन हर माह video देखकर श्रद्धा और गहरी हो गई।",
    qEn: "So many sevas in ₹251 — couldn't believe at first, but seeing the monthly video deepened my faith.",
    n: "Vikas Tiwari", city: "Lucknow", initials: "VT",
  },
];

const faqs = [
  {
    qHi: "इतने सस्ते में कैसे करवा पा रहे हो यह सब?",
    qEn: "How is this all possible at such a low cost?",
    aHi: "सभी के नाम का संकल्प साथ में लिया जाएगा। हर व्यक्ति का नाम और गोत्र अलग-अलग बोला जाएगा, लेकिन पंडित जी एक ही बार में सबके संकल्प सामूहिक रूप से ले लेंगे। इसीलिए यह सेवा सभी के लिए सुलभ और सस्ती रखी गई है।",
    aEn: "Sankalps for everyone are taken together. Each person's name and gotra is spoken separately, but the panditji takes all sankalps collectively in one sitting — that's how it stays affordable for everyone.",
    highlighted: true,
  },
  {
    qHi: "पहली सेवा कब शुरू होगी?",
    qEn: "When does my first seva begin?",
    aHi: "आपकी सदस्यता शुरू होते ही वानर सेवा, गौ सेवा और ब्राह्मण भोजन उसी सप्ताह से शुरू हो जाते हैं। सुंदरकांड पाठ हर महीने के पहले मंगलवार को होता है — अगर आप महीने के बीच में जुड़ते हैं, तो आपकी पहली सुंदरकांड सेवा अगले महीने के पहले मंगलवार को होगी। ₹401/₹4101 पैक में दूसरी सुंदरकांड सेवा उसी महीने के अंतिम शनिवार को होती है।",
    aEn: "Vanar Seva, Gau Seva and Brahmin Bhojan begin in the same week as your subscription. Sundarkand happens on the first Tuesday of every month — if you join mid-month, your first Sundarkand is on the next month's first Tuesday. The ₹401/₹4,101 plan has a second Sundarkand on the last Saturday.",
  },
  {
    qHi: "Refund Policy क्या है?",
    qEn: "What is the refund policy?",
    aHi: "अगर किसी कारणवश सेवा न हो सके तो पूरा धन वापस किया जाएगा।",
    aEn: "If a seva can't be performed for any reason, full refund is provided.",
  },
  {
    qHi: "क्या मुझे प्रत्येक सेवा का प्रमाण मिलेगा?",
    qEn: "Will I get proof of every seva?",
    aHi: "जी हाँ। प्रत्येक अनुष्ठान — सुंदरकांड, हवन, गौ सेवा, वानर सेवा एवं ब्राह्मण भोज — का Live या Video Proof सीधे आपके WhatsApp पर भेजा जाता है।",
    aEn: "Yes. Live or video proof of every ritual — Sundarkand, havan, gau, vanar and Brahmin bhoj — is sent straight to your WhatsApp.",
  },
  {
    qHi: "क्या यह कोई business है?",
    qEn: "Is this a business?",
    aHi: "नहीं। यह सनातन सेवा का एक सामूहिक यज्ञ है। आपकी सेवा राशि का एक-एक पैसा सीधे गौ-माता के चारे, वानरों के फल, ब्राह्मण भोज एवं अनुष्ठान सामग्री में लगाया जाता है।",
    aEn: "No. This is a collective yagya of Sanatan seva. Every rupee goes directly into fodder, fruits, Brahmin bhoj and ritual materials.",
  },
  {
    qHi: "क्या मैं अपने माता-पिता या प्रियजनों के नाम से संकल्प ले सकता हूँ?",
    qEn: "Can I take a sankalp in my parents' or loved ones' name?",
    aHi: "अवश्य। आप अपने माता-पिता, स्वर्गीय प्रियजनों या किसी भी सदस्य के नाम और गोत्र से यह मासिक संकल्प आरंभ कर सकते हैं।",
    aEn: "Absolutely. You can start a monthly sankalp in the name and gotra of your parents, departed loved ones, or any family member.",
  },
  {
    qHi: "क्या मैं किसी भी समय cancel कर सकता हूँ?",
    qEn: "Can I cancel anytime?",
    aHi: "जी हाँ, बिना किसी शुल्क या प्रश्न के आप अपना मासिक योगदान कभी भी रोक सकते हैं।",
    aEn: "Yes, with no fee or questions, you can stop your monthly contribution any time.",
  },
];

const pandits = [
  {
    nameHi: "पं. रामस्वरूप शर्मा", nameEn: "Pt. Ramswaroop Sharma",
    roleHi: "मुख्य आचार्य — तीर्थ गुरु पुष्करराज", roleEn: "Chief Acharya — Tirth Guru Pushkarraj",
    detailHi: "22 वर्षों से तीर्थ गुरु पुष्करराज में सेवारत। हवन विशेषज्ञ। काशी विद्यापीठ से वेद-शास्त्र में स्नातक।",
    detailEn: "Serving at Tirth Guru Pushkarraj for 22 years. Havan specialist. Graduate of Veda-shastra from Kashi Vidyapith.",
    quoteHi: "सेवा ही हमारा धर्म है।", quoteEn: "Seva is our dharma.",
    color: "from-saffron to-[oklch(0.6_0.2_38)]",
    initials: "रा",
  },
  {
    nameHi: "पं. विनायक जी", nameEn: "Pt. Vinayak ji",
    roleHi: "सुंदरकांड प्रमुख", roleEn: "Sundarkand Lead",
    detailHi: "8 वर्षों से सुंदरकांड पाठ में विशेषज्ञ। सस्वर एवं संकल्प-सम्मत पाठ के आचार्य।",
    detailEn: "Specialist in Sundarkand recitation for 8 years. Master of melodic, sankalp-compliant paths.",
    quoteHi: "राम नाम सबसे बड़ा मंत्र।", quoteEn: "Ram naam is the greatest mantra.",
    color: "from-gold to-saffron",
    initials: "वि",
  },
  {
    nameHi: "पं. गोविंद प्रसाद तिवारी", nameEn: "Pt. Govind Prasad Tiwari",
    roleHi: "गौ सेवा एवं अनुष्ठान प्रमुख", roleEn: "Gau Seva & Rituals Lead",
    detailHi: "15 वर्षों से गौशाला सेवा। वानर सेवा एवं ब्राह्मण भोज के संयोजक। स्थानीय मंदिर समिति के सदस्य।",
    detailEn: "15 years in goshala seva. Coordinator for vanar seva and Brahmin bhoj. Member of local temple committee.",
    quoteHi: "गौ माता की सेवा में ही समस्त देवताओं की सेवा है।",
    quoteEn: "In serving Gau Mata is the service of all devas.",
    color: "from-deep to-saffron",
    initials: "गो",
  },
];

const gallery = [
  { hi: "सुंदरकांड पाठ", en: "Sundarkand Path", grad: "from-[#FF6B35] to-[#8B1A1A]" },
  { hi: "गृह शांति हवन", en: "Grah Shanti Havan", grad: "from-[#C9A84C] to-[#FF6B35]" },
  { hi: "गौ माता सेवा", en: "Gau Mata Seva", grad: "from-[#8B1A1A] to-[#C9A84C]" },
  { hi: "वानर सेवा", en: "Vanar Seva", grad: "from-[#FF6B35] to-[#C9A84C]" },
  { hi: "ब्राह्मण भोजन", en: "Brahmin Bhojan", grad: "from-[#8B1A1A] to-[#FF6B35]" },
  { hi: "विशेष संकल्प", en: "Special Sankalp", grad: "from-[#C9A84C] to-[#8B1A1A]" },
];

// ---------------------- Helpers ----------------------
function WhatsAppIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.52 3.48A11.94 11.94 0 0 0 12.05 0C5.5 0 .15 5.34.15 11.9c0 2.1.55 4.14 1.6 5.95L0 24l6.31-1.66a11.9 11.9 0 0 0 5.74 1.46h.01c6.55 0 11.9-5.34 11.9-11.9 0-3.18-1.24-6.17-3.44-8.42ZM12.06 21.8h-.01a9.86 9.86 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.38a9.85 9.85 0 0 1-1.51-5.26C2.17 6.44 6.6 2 12.06 2c2.64 0 5.12 1.03 6.98 2.9a9.81 9.81 0 0 1 2.89 6.99c0 5.46-4.44 9.91-9.87 9.91Zm5.43-7.42c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15s-.77.96-.95 1.16c-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.21 5.08 4.5.71.31 1.27.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  );
}

function Divider({ symbol = "🕉️" }: { symbol?: string }) {
  return (
    <div className="section-divider py-6">
      <span aria-hidden>{symbol}</span>
    </div>
  );
}

function IntroOverlay() {
  const { t } = useLang();
  const [shown, setShown] = useState(false);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("punyam_intro_seen")) return;
    setShown(true);
    sessionStorage.setItem("punyam_intro_seen", "1");
    const fadeT = setTimeout(() => setFading(true), 1200);
    const hideT = setTimeout(() => setShown(false), 1800);
    return () => { clearTimeout(fadeT); clearTimeout(hideT); };
  }, []);
  if (!shown) return null;
  return (
    <div className={`fixed inset-0 z-[200] flex items-center justify-center bg-deep transition-opacity duration-700 ${fading ? "opacity-0" : "opacity-100"}`}>
      <div className="flex flex-col items-center gap-8">
        <div className="relative">
          <div className="diya-flame" />
          <div className="w-32 h-10 rounded-b-[50%] rounded-t-md"
            style={{ background: "linear-gradient(to bottom, #C9A84C 0%, #8B5A2B 60%, #4a2c14 100%)", boxShadow: "0 8px 28px rgba(0,0,0,0.6)" }} />
        </div>
        <p className="font-display text-2xl md:text-3xl text-cream text-center px-6">
          <span aria-hidden>🕉️</span> {t("intro_text")}
        </p>
      </div>
    </div>
  );
}

function useFadeUpOnView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    el.style.opacity = "0";
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { el.classList.add("animate-fade-up"); el.style.opacity = ""; io.unobserve(el); }
      });
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function CountersSection() {
  const { t } = useLang();
  const ref = useRef<HTMLDivElement | null>(null);
  const [vals, setVals] = useState([0, 0, 0, 0]);
  const targets = [1247, 3891, 6235, 1200];
  const items = [
    { Icon: BookOpen, label: t("c1"), suffix: "" },
    { Icon: Leaf, label: t("c2"), suffix: "" },
    { Icon: Users, label: t("c3"), suffix: "" },
    { Icon: Heart, label: t("c4"), suffix: "+" },
  ];
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(el);
        const start = performance.now();
        const dur = 2000;
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / dur);
          const ease = 1 - Math.pow(1 - p, 3);
          setVals(targets.map((tg) => Math.round(tg * ease)));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section ref={ref} className="px-6 py-14 bg-gradient-to-br from-saffron via-[oklch(0.62_0.2_38)] to-deep text-white">
      <div className="max-w-6xl mx-auto">
        <h2 className="font-display font-extrabold text-3xl md:text-4xl text-center mb-10 text-white">
          {t("counters_title")}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {items.map((it, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 md:p-6 text-center border-2 border-gold/60 shadow-xl hover-lift">
              <it.Icon size={28} className="mx-auto mb-2 text-saffron" />
              <div className="font-display font-extrabold text-3xl md:text-4xl text-maroon">
                {vals[i].toLocaleString("en-IN")}{it.suffix}
              </div>
              <div className="text-xs md:text-sm text-muted-foreground mt-1 leading-snug">{it.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhatsAppProofSection() {
  const { t, lang } = useLang();
  const messages = [
    { hi: "Jai Shri Ram, [भक्त जी], इस माह आपके नाम एवं गोत्र से सुंदरकांड पाठ सम्पन्न हुआ।",
      en: "Jai Shri Ram, [devotee], this month's Sundarkand path completed in your name and gotra.",
      thumbGrad: "from-[#8B1A1A] to-[#FF6B35]", time: "10:23 AM" },
    { hi: "गृह शांति हवन सम्पन्न — आपके परिवार की मंगल कामना सहित।",
      en: "Grah Shanti Havan completed — with mangal kamna for your family.",
      thumbGrad: "from-[#C9A84C] to-[#8B1A1A]", time: "10:24 AM" },
    { hi: "गौ माता सेवा सम्पन्न — आपके नाम से चारा एवं गुड़ अर्पित।",
      en: "Gau Mata Seva completed — fodder and jaggery offered in your name.",
      thumbGrad: "from-[#FF6B35] to-[#C9A84C]", time: "10:25 AM" },
    { hi: "वानर सेवा सम्पन्न — तीर्थ गुरु पुष्करराज के पवित्र स्थल पर।",
      en: "Vanar Seva completed — at sacred spots of Tirth Guru Pushkarraj.",
      thumbGrad: "from-[#8B1A1A] to-[#C9A84C]", time: "10:26 AM" },
  ];
  return (
    <section className="px-6 py-14 bg-cream">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-display font-extrabold text-2xl md:text-4xl text-maroon mb-3">
            {t("wa_proof_title")}
          </h2>
          <div className="h-1 w-20 bg-gold mx-auto" />
        </div>
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div className="mx-auto w-full max-w-[320px] bg-[#0b141a] rounded-[2rem] p-2 shadow-2xl border-4 border-gray-800">
            <div className="bg-[#25D366] text-white px-4 py-3 rounded-t-[1.5rem] flex items-center gap-3">
              <div className="size-10 rounded-full bg-white/20 flex items-center justify-center text-lg" aria-hidden>🚩</div>
              <div>
                <div className="font-bold text-sm">Punyam Seva</div>
                <div className="text-[10px] opacity-80">online</div>
              </div>
            </div>
            <div className="px-3 py-4 space-y-2 max-h-[480px] overflow-hidden"
              style={{ background: "#e5ddd5 url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><circle cx=%2220%22 cy=%2220%22 r=%221%22 fill=%22%23d8d0c8%22/></svg>')" }}>
              {messages.map((m, i) => (
                <div key={i} className="bg-[#dcf8c6] rounded-lg p-2 max-w-[85%] shadow-sm">
                  <div className={`h-20 rounded-md mb-2 bg-gradient-to-br ${m.thumbGrad} relative overflow-hidden`}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Play size={28} className="text-white drop-shadow-lg" fill="white" />
                    </div>
                    <div className="absolute inset-0 backdrop-blur-[2px] bg-black/10" />
                  </div>
                  <p className="text-[11px] text-gray-800 leading-snug">{lang === "hi" ? m.hi : m.en}</p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[9px] text-gray-500">{m.time}</span>
                    <CheckCheck size={12} className="text-blue-500" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-lg md:text-xl text-deep leading-relaxed">{t("wa_proof_para")}</p>
            <ul className="mt-6 space-y-3 text-sm md:text-base">
              {(lang === "hi" ? [
                "हर video में आपका नाम और गोत्र बोला जाता है",
                "Live या रिकॉर्डेड video — आपकी सुविधा अनुसार",
                "Photo proof भी साथ में",
                "Family group में भी share कर सकते हैं",
              ] : [
                "Your name and gotra is spoken in every video",
                "Live or recorded — at your convenience",
                "Photo proof included too",
                "Share in your family group as well",
              ]).map((tx, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 size-5 rounded-full bg-saffron/15 text-saffron flex items-center justify-center">
                    <Check size={12} />
                  </span>
                  <span className="text-deep/85">{tx}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function GallerySection() {
  const { t, lang } = useLang();
  return (
    <section className="px-6 py-14 bg-cream">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-3">
          <h2 className="font-display font-extrabold text-2xl md:text-4xl text-maroon">{t("gallery_title")}</h2>
        </div>
        <p className="text-center text-sm text-muted-foreground mb-10">{t("gallery_sub")}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
          {gallery.map((g, i) => (
            <div key={i} className={`relative aspect-square rounded-2xl overflow-hidden bg-gradient-to-br ${g.grad} hover-lift cursor-pointer group`}>
              <div className="absolute inset-0 backdrop-blur-[3px] bg-black/20" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="size-14 md:size-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                  <Play size={24} className="text-saffron ml-1" fill="currentColor" />
                </div>
              </div>
              <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
                <div className="text-white font-display font-bold text-sm md:text-base">{lang === "hi" ? g.hi : g.en}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-center mt-8 text-deep text-sm md:text-base">{t("gallery_footer")}</p>
      </div>
    </section>
  );
}

function AudioPlayer() {
  const { t } = useLang();
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().catch(() => {}); setPlaying(true); }
  };
  return (
    <div className="fixed bottom-24 left-4 md:bottom-6 md:left-6 z-[60]">
      {expanded ? (
        <div className="bg-cream border-2 border-gold/50 rounded-2xl p-4 shadow-2xl w-64 animate-modal">
          <div className="flex items-center justify-between mb-2">
            <div className="font-display font-bold text-maroon text-sm flex items-center gap-2">
              <Music2 size={14} className="text-saffron" /> {t("sk_listen")}
            </div>
            <button onClick={() => setExpanded(false)} className="size-6 rounded-full hover:bg-saffron/15 flex items-center justify-center">
              <X size={14} />
            </button>
          </div>
          <audio ref={audioRef} src={AUDIO_URL} preload="none" onEnded={() => setPlaying(false)} />
          <div className="flex items-center gap-3">
            <button onClick={toggle} className="size-11 rounded-full bg-saffron text-white flex items-center justify-center shadow-md hover:scale-105 transition-transform">
              {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>
            <div className="text-xs text-deep/70 leading-tight">
              {playing ? "Playing..." : "Tap play"}
              <div className="text-[10px] opacity-60">Hanuman Chalisa</div>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setExpanded(true)} className="bg-cream border-2 border-gold/50 text-maroon px-4 py-2.5 rounded-full shadow-lg hover:scale-105 transition-transform flex items-center gap-2 text-sm font-semibold">
          <Music2 size={16} className="text-saffron" />
          <span className="hidden sm:inline">{t("sk_listen")}</span>
        </button>
      )}
    </div>
  );
}

type ModalState = { open: boolean; plan: Plan | null };

function SubscribeModal({ state, onClose }: { state: ModalState; onClose: () => void; }) {
  const { t, lang } = useLang();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", gotra: "", phone: "", city: "" });
  const [agree, setAgree] = useState(false);
  const [today] = useState(() => new Date().toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric" }));
  useEffect(() => {
    if (state.open) { setStep(1); setForm({ name: "", gotra: "", phone: "", city: "" }); setAgree(false); }
  }, [state.open]);
  if (!state.open || !state.plan) return null;
  const plan = state.plan;
  const planName = lang === "hi" ? plan.nameHi : plan.nameEn;
  const cycle = t(plan.cycleKey === "monthly" ? "monthly" : "yearly");
  const nextFromStep1 = () => { if (!form.name.trim() || form.phone.length < 10) return; setStep(2); };
  const submitToWhatsApp = () => {
    const msg = `Jai Siyaram, मुझे ${planName} योजना (${plan.price}${cycle}) के लिए सदस्य बनना है।\n\nनाम: ${form.name}\nगोत्र: ${form.gotra || "Kashyap"}\nशहर: ${form.city || "—"}\n\nकृपया मुझे जोड़ें।`;
    window.open(`https://wa.me/${WHATSAPP_RAW}?text=${encodeURIComponent(msg)}`, "_blank");
    setStep(3);
  };
  return (
    <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4">
      <div className="bg-cream w-full md:max-w-lg md:rounded-3xl rounded-t-3xl shadow-2xl animate-modal border-t-4 md:border-4 border-gold/50 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gold/30">
          <div>
            <div className="text-xs uppercase tracking-wider text-saffron font-bold">{planName} • {plan.price}{cycle}</div>
            <div className="font-display font-extrabold text-xl text-maroon">
              {step === 1 && (lang === "hi" ? "अपना परिचय दें" : "Your details")}
              {step === 2 && (lang === "hi" ? "अपनी योजना confirm करें" : "Confirm your plan")}
              {step === 3 && (lang === "hi" ? "संकल्प पंजीकृत हुआ!" : "Sankalp registered!")}
            </div>
          </div>
          <button onClick={onClose} className="size-9 rounded-full hover:bg-saffron/15 flex items-center justify-center text-maroon" aria-label="close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 md:p-6">
          <div className="flex items-center gap-2 mb-5">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= step ? "bg-saffron" : "bg-gold/30"}`} />
            ))}
          </div>
          {step === 1 && (
            <div className="space-y-3">
              <Field label={lang === "hi" ? "पूरा नाम *" : "Full name *"} value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder={lang === "hi" ? "अपना पूरा नाम" : "Your full name"} />
              <Field label={lang === "hi" ? "गोत्र" : "Gotra"} value={form.gotra} onChange={(v) => setForm({ ...form, gotra: v })} placeholder={lang === "hi" ? "गोत्र न पता हो तो 'कश्यप' लिखें" : "If unknown, write 'Kashyap'"} />
              <Field label={lang === "hi" ? "Mobile नंबर *" : "Mobile *"} value={form.phone} onChange={(v) => setForm({ ...form, phone: v.replace(/[^0-9]/g, "").slice(0, 10) })} placeholder={lang === "hi" ? "10 अंकों का mobile" : "10-digit mobile"} type="tel" />
              <Field label={lang === "hi" ? "शहर" : "City"} value={form.city} onChange={(v) => setForm({ ...form, city: v })} placeholder={lang === "hi" ? "आपका शहर" : "Your city"} />
              <button onClick={nextFromStep1} disabled={!form.name.trim() || form.phone.length < 10} className="w-full mt-2 bg-saffron text-white py-3.5 rounded-xl font-bold disabled:opacity-50 hover:shadow-lg transition-all">
                {lang === "hi" ? "अगला चरण →" : "Next →"}
              </button>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border-2 border-gold/40 p-4">
                <div className="font-display font-bold text-lg text-maroon">{planName}</div>
                <div className="text-saffron font-extrabold text-2xl">
                  {plan.price}<span className="text-sm text-deep/60 font-normal">{cycle}</span>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-deep/80">
                  {plan.features.filter(f => f.included).slice(0, 5).map((f, i) => (
                    <li key={i} className="flex gap-2"><Check size={12} className="text-green-600 mt-0.5 shrink-0" />{lang === "hi" ? f.hi : f.en}</li>
                  ))}
                </ul>
              </div>
              <label className="flex items-start gap-3 text-sm text-deep cursor-pointer">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 size-5 accent-saffron" />
                <span>{lang === "hi" ? "मैं सहमत हूँ कि यह सेवा मेरे नाम एवं गोत्र से सम्पन्न की जाएगी।" : "I agree that this seva will be performed in my name and gotra."}</span>
              </label>
              <button onClick={submitToWhatsApp} disabled={!agree} className="w-full bg-[#25D366] text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 hover:shadow-lg transition-all">
                <WhatsAppIcon className="size-5" />
                {lang === "hi" ? "WhatsApp पर जोड़ें →" : "Continue on WhatsApp →"}
              </button>
              <button onClick={() => setStep(1)} className="w-full text-deep/60 text-sm hover:text-saffron">← Back</button>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-cream border-4 border-gold rounded-2xl p-6 text-center relative">
                <div className="text-4xl mb-2" aria-hidden>🕉️</div>
                <div className="font-mono text-xs uppercase tracking-[0.25em] text-saffron mb-2">
                  {lang === "hi" ? "संकल्प प्रमाण पत्र" : "Sankalp Certificate"}
                </div>
                <div className="h-px bg-gold/40 my-3" />
                <p className="font-display text-base md:text-lg text-deep leading-relaxed">
                  <strong className="text-maroon">{form.name || "Bhakta"} ji</strong>{" "}
                  {lang === "hi"
                    ? <>के नाम एवं गोत्र (<em>{form.gotra || "कश्यप"}</em>) से दिनांक <strong>{today}</strong> को तीर्थ गुरु पुष्करराज में सुंदरकांड पाठ एवं समस्त सेवाएँ सम्पन्न की जाएंगी।</>
                    : <> — in your name and gotra (<em>{form.gotra || "Kashyap"}</em>), Sundarkand path and all sevas will be performed at Tirth Guru Pushkarraj on <strong>{today}</strong>.</>}
                </p>
                <div className="h-px bg-gold/40 my-3" />
                <div className="text-xs italic text-saffron">Punyam Seva Sansthan, Tirth Guru Pushkarraj</div>
              </div>
              <p className="text-xs text-center text-deep/60">
                {lang === "hi" ? "यह प्रमाण पत्र आपके WhatsApp पर भी भेजा जाएगा।" : "This certificate will also be sent to your WhatsApp."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-maroon mb-1.5 uppercase tracking-wider">{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl border-2 border-gold/40 bg-white text-deep placeholder:text-deep/40 focus:outline-none focus:border-saffron focus:ring-4 focus:ring-saffron/15" />
    </label>
  );
}

function nextFirstTuesday(d = new Date()) {
  // first Tuesday of current month; if past, next month
  const tryMonth = (y: number, m: number) => {
    const first = new Date(y, m, 1);
    const day = first.getDay(); // 0 Sun..6 Sat
    const offset = (2 - day + 7) % 7; // 2 = Tuesday
    return new Date(y, m, 1 + offset);
  };
  let candidate = tryMonth(d.getFullYear(), d.getMonth());
  if (candidate < new Date(d.getFullYear(), d.getMonth(), d.getDate())) {
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    candidate = tryMonth(next.getFullYear(), next.getMonth());
  }
  return candidate;
}

function UrgencyStrip() {
  const { t, lang } = useLang();
  const date = useMemo(() => nextFirstTuesday(), []);
  const formatted = date.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="w-full bg-amber-100 border-y border-amber-300 text-amber-950">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-center gap-3 text-center text-sm md:text-base font-medium">
        <Calendar size={18} className="shrink-0 text-amber-700" />
        <span>
          <strong>{t("urgency_label")}:</strong> {lang === "hi" ? "मंगलवार" : "Tuesday"}, {formatted} {t("urgency_after")}
        </span>
      </div>
    </div>
  );
}

// ---------------------- Page ----------------------
function HomePage() {
  const { t, lang, setLang } = useLang();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [waOpen, setWaOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const [modal, setModal] = useState<ModalState>({ open: false, plan: null });

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
      setPastHero(window.scrollY > 500);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Instagram UTM auto-scroll
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const isInsta = params.get("ref") === "insta" || params.get("utm_source") === "instagram";
    if (!isInsta) return;
    const tm = setTimeout(() => {
      document.getElementById("packages")?.scrollIntoView({ behavior: "smooth" });
    }, 1200);
    return () => clearTimeout(tm);
  }, []);

  const openModal = (plan: Plan) => setModal({ open: true, plan });
  const scrollToPackages = () => { document.getElementById("packages")?.scrollIntoView({ behavior: "smooth" }); };

  const heroRef = useFadeUpOnView<HTMLDivElement>();
  const sundarkandRef = useFadeUpOnView<HTMLDivElement>();
  const sevasRef = useFadeUpOnView<HTMLDivElement>();
  const packagesRef = useFadeUpOnView<HTMLDivElement>();

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-saffron/20 pb-32 md:pb-0">
      <IntroOverlay />

      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-[0.05] -z-10"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(139,26,26,0.5) 1px, transparent 0)", backgroundSize: "22px 22px" }} />

      {/* Nav */}
      <nav className={`sticky top-0 z-40 transition-all ${scrolled ? "bg-cream/85 backdrop-blur-xl border-b border-gold/40 shadow-sm" : "bg-cream/60 backdrop-blur-md border-b border-transparent"}`}>
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex justify-between items-center gap-3">
          <a href="#top" className="font-display font-extrabold text-lg md:text-xl tracking-tight text-saffron uppercase shrink-0 flex items-center gap-1.5">
            <span aria-hidden>🚩</span> {lang === "hi" ? "पुण्यम सेवा" : "Punyam Seva"}
          </a>
          <div className="hidden md:flex gap-6 text-sm font-medium tracking-wide uppercase opacity-80">
            <a href="#sundarkand" className="hover:text-saffron transition-colors">{t("nav_sundarkand")}</a>
            <a href="#sevas" className="hover:text-saffron transition-colors">{t("nav_sevas")}</a>
            <a href="#packages" className="hover:text-saffron transition-colors">{t("nav_packages")}</a>
            <a href="#pandits" className="hover:text-saffron transition-colors">{t("nav_pandits")}</a>
            <a href="#faq" className="hover:text-saffron transition-colors">{t("nav_faq")}</a>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="inline-flex items-center bg-white/70 border border-gold/40 rounded-full p-0.5 text-[11px] font-semibold">
              <button onClick={() => setLang("hi")} className={`px-2.5 py-1 rounded-full transition-colors ${lang === "hi" ? "bg-saffron text-white" : "text-deep/70 hover:text-saffron"}`}>हिंदी</button>
              <button onClick={() => setLang("en")} className={`px-2.5 py-1 rounded-full transition-colors ${lang === "en" ? "bg-saffron text-white" : "text-deep/70 hover:text-saffron"}`}>EN</button>
            </div>
            <button onClick={scrollToPackages} className="bg-gradient-to-r from-saffron to-[oklch(0.6_0.21_38)] text-white px-4 md:px-5 py-2 rounded-full text-xs md:text-sm font-semibold hover:shadow-lg hover:shadow-saffron/40 transition-all inline-flex items-center gap-1.5">
              {t("nav_cta")} <ArrowRight size={14} />
            </button>
          </div>
        </div>
        <div className="md:hidden flex gap-4 overflow-x-auto px-4 pb-2 text-xs font-medium uppercase tracking-wide opacity-80 scrollbar-none">
          <a href="#sundarkand" className="whitespace-nowrap hover:text-saffron">{t("nav_sundarkand")}</a>
          <a href="#sevas" className="whitespace-nowrap hover:text-saffron">{t("nav_sevas")}</a>
          <a href="#packages" className="whitespace-nowrap hover:text-saffron">{t("nav_packages")}</a>
          <a href="#pandits" className="whitespace-nowrap hover:text-saffron">{t("nav_pandits")}</a>
          <a href="#faq" className="whitespace-nowrap hover:text-saffron">{t("nav_faq")}</a>
        </div>
      </nav>

      {/* 1. Hero */}
      <section id="top" className="relative px-6 pt-14 md:pt-20 pb-16 md:pb-20 text-center overflow-hidden">
        <div className="max-w-4xl mx-auto" ref={heroRef}>
          <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 rounded-full px-4 py-1.5 text-xs md:text-sm font-semibold mb-6">
            <span className="size-2 rounded-full bg-green-500 animate-pulse" />
            {t("hero_badge")}
          </div>
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-gold mb-4 inline-flex items-center gap-2">
            <span aria-hidden>🚩</span> {t("hero_kicker")}
          </span>
          <h1 className="font-display font-extrabold text-5xl md:text-7xl lg:text-[5.5rem] leading-[1.05] mb-6 mt-4 text-balance text-maroon">
            {t("hero_h1_l1")}
            <br />
            <span className="inline-flex items-center gap-3 justify-center">
              <span className="bg-gradient-to-r from-saffron via-[oklch(0.7_0.2_40)] to-gold bg-clip-text text-transparent">
                {t("hero_h1_l2")}
              </span>
              <Flame size={42} className="text-saffron animate-flame inline-block" />
            </span>
          </h1>
          <p className="text-base md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 text-pretty leading-relaxed">
            {t("hero_para")}
          </p>
          <div className="flex flex-col items-center gap-5 mt-2">
            <button onClick={scrollToPackages} className="bg-gradient-to-r from-saffron to-[oklch(0.6_0.21_38)] text-white px-8 py-4 rounded-2xl text-lg font-bold shadow-xl shadow-saffron/30 hover:shadow-saffron/50 hover:-translate-y-0.5 transition-all inline-flex items-center gap-2">
              {t("hero_cta")} <ArrowRight size={18} />
            </button>
            <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 text-xs md:text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Lock size={14} className="text-saffron" /> {t("trust_secure")}</span>
              <span className="inline-flex items-center gap-1.5"><Video size={14} className="text-saffron" /> {t("trust_video")}</span>
              <span className="inline-flex items-center gap-1.5"><Ban size={14} className="text-saffron" /> {t("trust_nohidden")}</span>
            </div>
          </div>
        </div>
        <div className="mt-12 max-w-6xl mx-auto rounded-3xl overflow-hidden ring-1 ring-gold/30 shadow-2xl">
          <img src={heroImg} alt="Tirth Guru Pushkarraj — temple and ghat at sunrise" width={1920} height={896} className="w-full aspect-[21/9] object-cover" />
        </div>
      </section>

      <Divider />

      {/* 2. Manifesto */}
      <section className="px-6 py-10">
        <div className="max-w-3xl mx-auto text-center">
          <p className="font-display text-xl md:text-3xl leading-relaxed text-balance text-maroon">
            "{t("manifesto")}"
          </p>
          <p className="font-mono text-xs uppercase tracking-[0.3em] mt-6 opacity-50">{t("manifesto_sub")}</p>
        </div>
      </section>

      <Divider />

      {/* Urgency strip + 3. Packages */}
      <UrgencyStrip />

      <section id="packages" className="px-6 py-16 bg-background relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-saffron/[0.04] to-transparent pointer-events-none" />
        <div ref={packagesRef} className="max-w-6xl mx-auto relative">
          <div className="text-center mb-4">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">{t("pkg_kicker")}</span>
            <h2 className="font-display font-extrabold text-3xl md:text-5xl leading-[1.1] mb-4 text-balance text-maroon">
              {t("pkg_title_l1")}<br />
              <span className="text-saffron">{t("pkg_title_l2")}</span>
            </h2>
            <div className="h-1 w-20 bg-gold mx-auto mb-4" />
            <div className="inline-flex items-center gap-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-3 py-1 text-xs font-semibold mb-4">
              <Sparkles size={12} /> {t("pkg_new_members")}
            </div>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">{t("pkg_family_note")}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 md:gap-7 mt-12 items-stretch">
            {plans.map((p) => <PlanCard key={p.id} plan={p} onJoin={() => openModal(p)} />)}
          </div>

          <p className="text-center text-xs md:text-sm text-muted-foreground mt-8 font-medium">{t("pkg_footer")}</p>
        </div>
      </section>

      <Divider symbol="✦" />

      {/* 4. Counters */}
      <CountersSection />

      <Divider symbol="✦" />

      {/* 5. Mission/quote */}
      <section className="px-6 py-10">
        <div className="max-w-3xl mx-auto text-center">
          <p className="font-display italic text-lg md:text-2xl leading-relaxed text-deep">
            {lang === "hi"
              ? "\"राम नाम जपिए, हर घर में सुख-शांति आए।\" — हनुमान जी की कृपा से हर परिवार तक यह संकल्प पहुँचे।"
              : "\"Chant Ram naam, peace shall come to every home.\" — by Hanuman ji's grace, may this sankalp reach every family."}
          </p>
        </div>
      </section>

      <Divider />

      {/* 6. Sundarkand */}
      <section id="sundarkand" className="px-6 py-14 bg-deep text-cream relative overflow-hidden">
        <div aria-hidden className="absolute -right-32 -top-32 w-[36rem] h-[36rem] opacity-[0.06] pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,200,120,0.8) 0, transparent 60%)", borderRadius: "50%" }} />
        <div ref={sundarkandRef} className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center relative">
          <div className="rounded-3xl overflow-hidden ring-1 ring-gold/20 shadow-2xl order-2 lg:order-1">
            <img src={pushkarGhatImg} alt="Pushkar ghat at sunrise" width={1920} height={1080} loading="lazy" className="w-full h-full object-cover" />
          </div>
          <div className="order-1 lg:order-2">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-gold block mb-4 inline-flex items-center gap-2">
              <span aria-hidden>🚩</span> {t("sk_kicker")}
            </span>
            <h2 className="font-display font-extrabold text-3xl md:text-5xl leading-[1.15] mb-6 text-balance mt-4">
              {t("sk_h1_l1")}<br /><span className="text-saffron">{t("sk_h1_l2")}</span>
            </h2>
            <blockquote className="border-l-4 border-saffron pl-5 py-1 mb-6 italic font-display text-gold text-lg md:text-xl leading-relaxed">
              "{t("sk_quote")}"
            </blockquote>
            <p className="text-lg leading-relaxed opacity-90 mb-5">{t("sk_para")}</p>
            <div className="mt-8 p-6 rounded-2xl bg-gradient-to-br from-saffron/15 to-gold/10 border border-saffron/40 shadow-inner">
              <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-gold mb-3">{t("sk_cost_label")}</div>
              <div className="flex items-baseline gap-4 flex-wrap mb-4">
                <span className="font-display text-4xl md:text-5xl font-extrabold text-saffron">{t("sk_cost")}</span>
                <span className="text-xs uppercase tracking-wider opacity-70">{t("sk_cost_sub")}</span>
              </div>
              <p className="leading-relaxed text-gold font-medium">{t("sk_cost_para")}</p>
            </div>
          </div>
        </div>
      </section>

      <Divider />

      {/* 7. Pushkar Daan */}
      <section className="px-6 py-14">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">{t("daan_kicker")}</span>
            <h2 className="font-display font-bold text-3xl md:text-5xl leading-tight mb-6 text-balance text-maroon">
              {t("daan_h1_l1")}<br /><span className="text-saffron">{t("daan_h1_l2")}</span>
            </h2>
            <div className="h-1 w-20 bg-gold mx-auto" />
          </div>
          <p className="text-lg leading-relaxed text-muted-foreground max-w-3xl mx-auto text-center mb-12">{t("daan_para")}</p>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="group rounded-2xl overflow-hidden border-2 border-gold/40 bg-white hover-lift">
              <div className="aspect-[16/9] overflow-hidden">
                <img src={gauSevaImg} alt="Cow being fed" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
              </div>
              <div className="p-6">
                <Wind size={28} className="text-saffron mb-3" />
                <h3 className="font-display font-bold text-xl md:text-2xl mb-3 text-maroon">{t("daan_gau_t")}</h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-4">{t("daan_gau_p")}</p>
                <p className="italic font-display text-saffron text-sm md:text-base border-l-2 border-saffron pl-3">{t("daan_gau_q")}</p>
              </div>
            </div>
            <div className="group rounded-2xl overflow-hidden border-2 border-saffron/40 bg-saffron/5 hover-lift">
              <div className="aspect-[16/9] overflow-hidden">
                <img src={havanImg} alt="Vanar seva" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
              </div>
              <div className="p-6">
                <Heart size={28} className="text-saffron mb-3" />
                <h3 className="font-display font-bold text-xl md:text-2xl mb-3 text-maroon">{t("daan_van_t")}</h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-3">{t("daan_van_p")}</p>
                <p className="italic font-display text-saffron text-sm md:text-base border-l-2 border-saffron pl-3">{t("daan_van_q")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Divider />

      {/* 8. Seva details */}
      <section id="sevas" className="px-6 py-14 bg-cream">
        <div ref={sevasRef} className="max-w-6xl mx-auto">
          <div className="mb-12 max-w-2xl">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">{t("sevas_kicker")}</span>
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4 text-maroon">{t("sevas_title")}</h2>
            <div className="h-1 w-20 bg-gold" />
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {sevas.map((s) => {
              const Icon = s.Icon;
              return (
                <div key={s.num} className="group bg-white p-7 rounded-2xl border-2 border-gold/30 hover:border-saffron/60 hover-lift transition-all">
                  <div className="relative size-14 mb-5">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-saffron to-gold rotate-6 opacity-90 group-hover:rotate-12 transition-transform" />
                    <div className="relative size-14 rounded-2xl bg-gradient-to-br from-saffron to-[oklch(0.6_0.21_38)] flex items-center justify-center text-white shadow-lg shadow-saffron/30">
                      <Icon size={24} />
                    </div>
                  </div>
                  <h3 className="font-display text-xl font-bold mb-3 text-maroon">{lang === "hi" ? s.titleHi : s.titleEn}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground mb-4">{lang === "hi" ? s.descHi : s.descEn}</p>
                  <p className="italic text-xs text-saffron/90 border-l-2 border-saffron/40 pl-3">{lang === "hi" ? s.quoteHi : s.quoteEn}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-10 rounded-2xl bg-gradient-to-r from-saffron via-[oklch(0.6_0.21_38)] to-saffron text-white p-6 md:p-8 shadow-xl shadow-saffron/25 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-80 mb-2">{t("family_kicker")}</div>
              <h3 className="font-display font-extrabold text-xl md:text-2xl leading-snug">{t("family_title")}</h3>
              <p className="text-sm opacity-90 mt-1">{t("family_para")}</p>
            </div>
            <button onClick={scrollToPackages} className="bg-white text-saffron px-6 py-3 rounded-xl font-bold text-sm whitespace-nowrap hover:bg-cream transition-colors shadow-lg inline-flex items-center gap-1.5">
              {t("family_cta")} <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </section>

      <Divider />

      {/* 9. WhatsApp proof */}
      <WhatsAppProofSection />

      <Divider symbol="✦" />

      {/* 10. Gallery */}
      <GallerySection />

      <Divider symbol="✦" />

      {/* 11. Pandits */}
      <PanditsSection id="pandits" />

      <Divider />

      {/* 12. Journey */}
      <section id="journey" className="px-6 py-14 bg-cream">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">{t("journey_kicker")}</span>
            <h2 className="font-display font-bold text-3xl md:text-4xl text-maroon">{t("journey_title")}</h2>
          </div>
          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-8">
            <div aria-hidden className="hidden md:block absolute top-9 left-[16%] right-[16%] h-0.5"
              style={{ backgroundImage: "radial-gradient(circle, oklch(0.74 0.12 80 / 0.7) 1.5px, transparent 1.5px)", backgroundSize: "12px 2px", backgroundRepeat: "repeat-x" }} />
            {journey.map((step, i) => (
              <div key={i} className="relative bg-white rounded-2xl p-6 border-2 border-gold/30 hover:border-saffron/40 hover-lift transition-all flex flex-col items-center text-center">
                <div className="relative mb-4">
                  <div className="size-16 md:size-18 rounded-full bg-gradient-to-br from-saffron to-[oklch(0.6_0.21_38)] text-white font-display font-extrabold text-2xl flex items-center justify-center shadow-xl shadow-saffron/40 ring-4 ring-cream">
                    {i + 1}
                  </div>
                </div>
                <h4 className="font-display font-bold text-lg md:text-xl mb-2 leading-snug text-maroon">{lang === "hi" ? step.titleHi : step.titleEn}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">{lang === "hi" ? step.descHi : step.descEn}</p>
                <p className="text-xs text-saffron font-medium italic mt-auto">{lang === "hi" ? step.benefitHi : step.benefitEn}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider symbol="✦" />

      {/* 13. Testimonials */}
      <section id="testimonials" className="px-6 py-14">
        <div className="max-w-6xl mx-auto bg-gradient-to-br from-saffron to-[oklch(0.45_0.18_28)] text-white rounded-[2.5rem] px-6 py-12 md:px-14 md:py-14">
          <span className="font-mono text-xs uppercase tracking-[0.3em] opacity-80 block mb-3">{t("test_kicker")}</span>
          <h2 className="font-display font-bold text-3xl md:text-4xl mb-10 max-w-2xl">{t("test_title")}</h2>
          <div className="md:hidden flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 snap-x snap-mandatory scrollbar-none">
            {testimonials.map((tt, i) => <TestimonialCard t={tt} key={i} mobile lang={lang} />)}
          </div>
          <div className="hidden md:grid md:grid-cols-3 gap-6">
            {testimonials.slice(0, 3).map((tt, i) => <TestimonialCard t={tt} key={i} lang={lang} />)}
          </div>
          <div className="hidden md:grid md:grid-cols-2 gap-6 mt-6 max-w-4xl mx-auto">
            {testimonials.slice(3).map((tt, i) => <TestimonialCard t={tt} key={i + 3} lang={lang} />)}
          </div>
        </div>
      </section>

      <Divider />

      {/* 14. FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-14">
        <div className="text-center mb-10">
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">{t("faq_kicker")}</span>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-maroon">{t("faq_title")}</h2>
        </div>
        <div className="space-y-2">
          {faqs.map((f, i) => {
            const open = openFaq === i;
            return (
              <button key={i} onClick={() => setOpenFaq(open ? null : i)}
                className={`w-full text-left rounded-xl px-5 py-5 transition-all ${open ? "bg-saffron/5 border-l-4 border-saffron shadow-sm" : "border-l-4 border-transparent hover:bg-cream/60"} ${(f as any).highlighted && !open ? "bg-saffron/5 border-l-saffron/40" : ""}`}>
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    {(f as any).highlighted && (
                      <span className="bg-saffron text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0">{t("faq_popular")}</span>
                    )}
                    <h4 className="font-display font-bold text-base md:text-lg text-maroon">{lang === "hi" ? f.qHi : f.qEn}</h4>
                  </div>
                  <span className={`text-saffron text-2xl shrink-0 transition-transform ${open ? "rotate-45" : ""}`}>+</span>
                </div>
                {open && <p className="text-muted-foreground mt-3 leading-relaxed text-pretty text-sm md:text-base">{lang === "hi" ? f.aHi : f.aEn}</p>}
              </button>
            );
          })}
        </div>
      </section>

      <Divider />

      {/* 15. Final CTA */}
      <section id="subscribe" className="px-6 py-14">
        <div className="max-w-4xl mx-auto rounded-[2.5rem] p-12 md:p-16 text-center relative overflow-hidden text-white"
          style={{ background: "linear-gradient(135deg, oklch(0.55 0.2 45) 0%, oklch(0.42 0.18 35) 60%, oklch(0.32 0.15 30) 100%)" }}>
          <div aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.08]">
            <span className="text-[22rem] md:text-[28rem] leading-none font-display">🕉️</span>
          </div>
          <div className="relative">
            <div className="font-mono text-xs uppercase tracking-[0.3em] text-gold mb-6 inline-flex items-center gap-2">
              <span aria-hidden>🚩</span> {t("final_kicker")} <span aria-hidden>🚩</span>
            </div>
            <h2 className="font-display font-extrabold text-3xl md:text-5xl mb-6 leading-tight text-balance">{t("final_title")}</h2>
            <p className="opacity-90 max-w-xl mx-auto mb-10 leading-relaxed">{t("final_para")}</p>
            <button onClick={scrollToPackages} className="inline-flex items-center gap-2 bg-white text-saffron px-10 py-5 rounded-xl text-lg font-extrabold hover:scale-105 transition-transform shadow-2xl">
              {t("final_cta")} <ArrowRight size={18} />
            </button>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-70 mt-8">{t("final_sub")}</div>
          </div>
        </div>
      </section>

      {/* 16. Footer */}
      <footer className="px-6 py-12 bg-deep text-cream">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8 text-sm">
          <div>
            <div className="font-display font-extrabold text-xl text-saffron mb-2 inline-flex items-center gap-1.5">
              <span aria-hidden>🚩</span> {lang === "hi" ? "पुण्यम सेवा" : "Punyam Seva"}
            </div>
            <p className="text-cream/80 leading-relaxed">{t("foot_tag")}</p>
            <p className="text-xs text-cream/60 mt-3 leading-relaxed">{t("foot_addr")}</p>
          </div>
          <div>
            <div className="font-display font-bold text-gold mb-3">{t("foot_contact")}</div>
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[#25D366] font-semibold hover:underline">
              <WhatsAppIcon className="size-4" /> {WHATSAPP_NUMBER}
            </a>
            <p className="text-xs text-cream/70 mt-2">{t("foot_24x7")}</p>
            <div className="flex items-center gap-3 mt-4">
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" aria-label="WhatsApp"
                className="size-9 rounded-full bg-[#25D366] text-white flex items-center justify-center hover:scale-105 transition-transform">
                <WhatsAppIcon className="size-4" />
              </a>
            </div>
          </div>
          <div>
            <div className="font-display font-bold text-gold mb-3">{t("foot_trust")}</div>
            <div className="space-y-2 text-xs text-cream/80">
              <div className="inline-flex items-center gap-2"><Shield size={14} className="text-green-400" /><span>{lang === "hi" ? "Razorpay द्वारा सुरक्षित" : "Secured by Razorpay"}</span></div>
              <div className="inline-flex items-center gap-2"><Video size={14} className="text-saffron" /><span>{lang === "hi" ? "Video Proof गारंटी" : "Video Proof guaranteed"}</span></div>
              <div className="inline-flex items-center gap-2"><Ban size={14} className="text-gold" /><span>{lang === "hi" ? "कोई Hidden Charge नहीं" : "No hidden charges"}</span></div>
            </div>
            <p className="text-xs text-cream/60 mt-3 leading-relaxed">{t("foot_pay")}</p>
          </div>
        </div>
        <div className="max-w-5xl mx-auto mt-8 pt-6 border-t border-gold/20 text-center font-mono text-[10px] tracking-[0.3em] uppercase text-cream/50">{t("foot_copy")}</div>
      </footer>

      {/* Sticky mobile bottom bar */}
      <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md bg-white/95 backdrop-blur-xl border-2 border-saffron/40 rounded-2xl p-3 pl-5 shadow-2xl z-50 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">{t("sticky_top")}</div>
          <div className="font-display text-base font-extrabold text-maroon leading-none mt-0.5">{t("sticky_title")}</div>
        </div>
        <button onClick={scrollToPackages} className="bg-gradient-to-r from-saffron to-[oklch(0.6_0.21_38)] text-white px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap shadow-lg shadow-saffron/30 inline-flex items-center gap-1.5">
          {t("sticky_cta")} <ArrowRight size={14} />
        </button>
      </div>

      {/* Floating See Plans pill (visible after hero) */}
      {pastHero && (
        <button onClick={scrollToPackages} aria-label={t("seePlansFloat")}
          className="hidden md:inline-flex fixed bottom-28 right-6 z-[60] items-center gap-1.5 bg-saffron text-white px-4 py-2 rounded-full text-xs font-semibold shadow-xl hover:scale-105 transition-transform">
          <ChevronUp size={12} /> {t("seePlansFloat")}
        </button>
      )}

      {/* Floating WhatsApp */}
      <div className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-[60] flex flex-col items-end gap-3">
        {waOpen && (
          <div className="animate-modal bg-white border-2 border-gold/40 shadow-2xl rounded-2xl p-4 pr-3 max-w-[18rem] relative">
            <button onClick={() => setWaOpen(false)} aria-label="close" className="absolute top-2 right-2 size-6 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground">
              <X size={14} />
            </button>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-saffron mb-2 inline-flex items-center gap-1.5">
              <MessageCircle size={12} /> {lang === "hi" ? "अभी जुड़ें" : "Connect"}
            </div>
            <p className="text-sm leading-relaxed text-deep mb-4 pr-4">
              {lang === "hi" ? "आप हमसे WhatsApp पर भी जुड़ सकते हैं — नि:संकोच संपर्क करें।" : "Connect with us on WhatsApp — feel free to reach out."}
            </p>
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-[#25D366] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity w-full justify-center">
              <WhatsAppIcon className="size-4" /> WhatsApp
            </a>
          </div>
        )}
        <button onClick={() => setWaOpen((v) => !v)} aria-label="WhatsApp"
          className="group relative inline-flex items-center justify-center size-14 bg-[#25D366] text-white rounded-full shadow-2xl shadow-[#25D366]/40 hover:scale-105 transition-transform ring-4 ring-white/40 animate-pulse-ring">
          <WhatsAppIcon className="size-6" />
        </button>
      </div>

      <AudioPlayer />
      <SubscribeModal state={modal} onClose={() => setModal({ open: false, plan: null })} />
    </div>
  );
}

// ---------------------- Plan card ----------------------
function PlanCard({ plan, onJoin }: { plan: Plan; onJoin: () => void }) {
  const { t, lang } = useLang();
  const name = lang === "hi" ? plan.nameHi : plan.nameEn;
  const tagline = lang === "hi" ? plan.taglineHi : plan.taglineEn;
  const cycle = t(plan.cycleKey === "monthly" ? "monthly" : "yearly");
  const isPremium = plan.id === "grah";
  const isYearly = plan.id === "varsh";

  const wrap =
    isYearly
      ? "relative flex flex-col rounded-3xl p-7 md:p-8 transition-all hover-lift bg-[#3D1F00] text-cream ring-1 ring-gold/40 shadow-2xl"
      : isPremium
      ? "relative flex flex-col rounded-3xl p-7 md:p-8 transition-all bg-white ring-2 ring-saffron shadow-2xl shadow-saffron/25 md:scale-[1.03] hover-lift"
      : "relative flex flex-col rounded-3xl p-7 md:p-8 transition-all bg-cream ring-1 ring-saffron/40 hover-lift";

  return (
    <div className={wrap}>
      {plan.badge === "popular" && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-saffron text-white text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
          {t("plan_popular")}
        </span>
      )}
      {plan.badge === "max" && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-[#3D1F00] text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
          {t("plan_max_punya")}
        </span>
      )}

      <div className="border-b border-current/10 pb-5 mb-5">
        <div className={`font-mono text-[10px] uppercase tracking-[0.25em] mb-3 ${isYearly ? "text-gold" : "text-saffron"}`}>{tagline}</div>
        <h3 className={`font-display font-extrabold text-2xl mb-3 ${isYearly ? "text-cream" : "text-maroon"}`}>{name}</h3>
        {plan.strikePrice && (
          <div className={`text-sm line-through ${isYearly ? "text-cream/50" : "text-deep/40"}`}>{plan.strikePrice}</div>
        )}
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className={`font-display font-extrabold text-5xl ${isYearly ? "text-gold" : "text-saffron"}`}>{plan.price}</span>
          <span className={`text-sm ${isYearly ? "text-cream/70" : "text-muted-foreground"}`}>{cycle}</span>
        </div>
        {isYearly && (
          <span className="inline-block mt-3 bg-gold text-[#3D1F00] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
            {t("plan_save")}
          </span>
        )}
      </div>

      <ul className="space-y-3 mb-7 flex-1">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-3 text-sm leading-relaxed">
            {f.included ? (
              <Check size={16} className={`mt-0.5 shrink-0 ${isYearly ? "text-gold" : "text-green-600"}`} />
            ) : (
              <X size={16} className="mt-0.5 shrink-0 text-deep/30" />
            )}
            <span className={f.included ? (isYearly ? "text-cream/95" : "text-deep") : "text-deep/40 line-through"}>
              {lang === "hi" ? f.hi : f.en}
              {!f.included && f.noteKey && (
                <span className="block text-[10px] not-italic no-underline text-saffron/80 font-medium mt-0.5">
                  {t(f.noteKey)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <button onClick={onJoin}
        className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold text-sm transition-all ${
          isYearly
            ? "bg-gold text-[#3D1F00] hover:shadow-xl hover:-translate-y-0.5"
            : isPremium
            ? "bg-gradient-to-r from-saffron to-[oklch(0.6_0.21_38)] text-white hover:shadow-xl hover:shadow-saffron/40 hover:-translate-y-0.5"
            : "bg-white border-2 border-saffron text-saffron hover:bg-saffron hover:text-white hover:-translate-y-0.5"
        }`}>
        {t("plan_join")} — {plan.price}{cycle}
      </button>
    </div>
  );
}

function PanditsSection({ id }: { id?: string }) {
  const { t, lang } = useLang();
  return (
    <section id={id} className="px-6 py-14">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-display font-extrabold text-2xl md:text-4xl text-maroon">{t("pandits_title")}</h2>
          <div className="h-1 w-20 bg-gold mx-auto mt-4" />
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {pandits.map((p, i) => (
            <div key={i} className="bg-cream rounded-2xl p-6 border-2 border-gold/40 shadow-md hover-lift text-center">
              <div className={`mx-auto size-24 rounded-full bg-gradient-to-br ${p.color} text-white font-display font-extrabold text-2xl flex items-center justify-center shadow-lg mb-4 ring-4 ring-gold/30`}>
                {p.initials}
              </div>
              <h3 className="font-display font-bold text-xl text-maroon mb-1">{lang === "hi" ? p.nameHi : p.nameEn}</h3>
              <div className="text-xs uppercase tracking-wider text-saffron font-semibold mb-3">{lang === "hi" ? p.roleHi : p.roleEn}</div>
              <p className="text-sm text-deep/80 leading-relaxed mb-4">{lang === "hi" ? p.detailHi : p.detailEn}</p>
              <p className="italic font-display text-saffron text-sm border-t border-gold/30 pt-3">"{lang === "hi" ? p.quoteHi : p.quoteEn}"</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialCard({ t, mobile = false, lang }: { t: { qHi: string; qEn: string; n: string; city: string; initials: string }; mobile?: boolean; lang: Lang; }) {
  return (
    <div className={`bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20 ${mobile ? "min-w-[85%] snap-center" : ""}`}>
      <div className="flex items-center gap-1 mb-3 text-gold">
        {[0, 1, 2, 3, 4].map((i) => (<Star key={i} size={14} fill="currentColor" strokeWidth={0} />))}
      </div>
      <p className="text-base md:text-lg font-display leading-relaxed mb-5">"{lang === "hi" ? t.qHi : t.qEn}"</p>
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full bg-white text-saffron font-display font-extrabold flex items-center justify-center shadow-md">{t.initials}</div>
        <div>
          <div className="font-semibold text-sm">{t.n}</div>
          <div className="font-mono text-[10px] opacity-80 uppercase tracking-wider">{t.city}</div>
        </div>
      </div>
    </div>
  );
}
