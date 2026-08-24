import { useState, useEffect } from "react";

export type Lang = "hindi" | "english";
export const LANG_KEY = "punyata:lang";

export const translations = {
  hindi: {
    // Navigation / Header
    nav_home: "मुख्य पृष्ठ",
    nav_plans: "योजनाएं",
    nav_sevas: "हमारी सेवाएं",
    nav_reviews: "समीक्षाएं",
    nav_about: "हमारे बारे में",
    nav_faq: "सामान्य प्रश्न",
    nav_my_subscription: "मेरी सदस्यता",

    // Homepage Hero
    hero_badge: "1,200+ परिवार इस सेवा से जुड़े हैं",
    hero_sub: "जय सियाराम • तीर्थ गुरु पुष्करराज से",
    hero_title_1: "पुण्य आपका,",
    hero_title_2: "सेवा हमारी।",
    hero_desc:
      "व्यस्तता के कारण खुद दान-पुण्य, हवन, पूजा नहीं कर पाते? पुण्यता आपके नाम एवं गोत्र से तीर्थ गुरु पुष्करराज में यह ज़िम्मेदारी निभाता है — हर सेवा का प्रमाण सीधे आपके WhatsApp पर.",
    hero_cta: "See Plans — ₹251/Monthly से शुरू",

    // Homepage Mission
    mission_relief: "The Relief",
    mission_title: "व्यस्तता की वजह से पुण्य पीछे न रह जाए।",
    mission_desc:
      "शहर की दौड़-भाग में हर घर अपने दान-पुण्य, हवन और पूजा से दूर होता जा रहा है। पुण्यता यह ज़िम्मेदारी अपने ऊपर लेता है — आपके नाम, आपके गोत्र, आपके संकल्प से।",
    mission_quote: '"हम आपकी ज़िम्मेदारी नहीं लेते — हम उसे आपकी ओर से निभाते हैं।"',

    // How It Works
    hiw_title: "कैसे काम करता है",
    hiw_step: "STEP",
    hiw_step_1_title: "संकल्प (Sankalp)",
    hiw_step_1_desc: "अपने नाम एवं गोत्र से मासिक संकल्प लें।",
    hiw_step_2_title: "सेवा (Seva)",
    hiw_step_2_desc: "तीर्थ गुरु पुष्करराज में आपकी सेवा सम्पन्न होती है।",
    hiw_step_3_title: "प्रमाण (Pramaan)",
    hiw_step_3_desc: "हर अनुष्ठान का Video Proof आपके WhatsApp पर।",

    // Proof Gallery
    gallery_title: "Proof Gallery",
    gallery_see_all: "See All →",
    gallery_type: "Video",
    gallery_footer: "हर सेवा का Live/Video Proof — WhatsApp पर हर माह।",

    // Kaliyug Section
    kaliyug_badge: "कलियुग में दान-पुण्य",
    kaliyug_title: "पुण्य ही एकमात्र संचित धन है।",
    kaliyug_footer:
      "जब हम स्वयं दान-पुण्य नहीं कर पाते — तो पुण्यता यह पवित्र कर्तव्य आपके नाम से निभाता है।",

    // Family Section
    family_title: "पूरे परिवार के लिए",
    family_desc:
      "एक सदस्यता — 4 सदस्यों तक का संकल्प। हर व्यक्ति का नाम एवं गोत्र संकल्प में बोला जाता है।",

    // Plans preview
    plans_sub: "₹251/Monthly से शुरू • 4 सदस्यों तक",
    plans_view_details: "विवरण देखें",
    plans_see_full: "See Full Plans",
    plans_footer: "कोई Hidden Charges नहीं · कभी भी Cancel · 100% Secure via Razorpay",

    // Punya Meter
    pm_title: "Punya Meter",
    pm_subtitle:
      "Kya aap apne aur apni family ke liye har mahine punya kar paa rahe ho, vedic rituals ke saath?",
    pm_badge: "पुण्य ही वह एकमात्र धन है, जो इस जीवन के बाद भी आपके साथ जाता है",
    pm_ques_parent: "क्या आप माता-पिता के निमित्त दान-पुण्य करवा पाते हैं?",
    pm_ques_1: "5 sadhu-santon ko bhojan (Saadhu Santo Ko Bhojan) — vedic sankalp sahit",
    pm_ques_2: "Gau Mata ko chara / seva",
    pm_ques_3: "Hanuman ji ke nimit bandaron ko chana/kele (Vanara Seva)",
    pm_ques_4: "Sundarkand Paath vidhi-vidhan se",
    pm_ques_5: "Hawan ya Daan-Punya vedic vidhi se",
    pm_yes: "Haan, kar paata hoon",
    pm_no: "Nahi, nahi kar paata",
    pm_pass_msg: "Aapka Punya Bank sahi hai",
    pm_fail_msg: "Aapka Punya Bank sahi nahi hai",
    pm_score: "Score",
    pm_pass_bless:
      "🕉️ Pranam! Aap niyamit roop se punya karya kar rahe hain. Hanuman ji ki kripa aap par aur aapke parivar par sadav bani rahe.",
    pm_fail_bless:
      "Kaliyug mein niyamit daan-punya hi hamara sabse bada suraksha kavach hai. Vyastata ko apni punya yatra mein baadha na banne dein.",
    pm_cta: "अपनी पुण्य यात्रा शुरू करें",
    pm_reset: "Punya Meter Phir Se Check Karein",
    pm_benefits_title: "Niyamit Daan-Punya Ke Laabh",
    pm_benefit_1: "Grih-kalesh evam vastu dosh ka shaman",
    pm_benefit_2: "Parivar ke sabhi sadasyon par Hanuman ji ki kripa",
    pm_benefit_3: "Aarthik baadha evam daridrata ka naash",
    pm_benefit_4: "Purvajon ki tripti evam aashirwad",
    pm_benefit_5: "Parivar mein sakaratmak urja evam maansik shanti",
    pm_benefit_6: "Pitra dosh evam grah dosh ka shaman",
    pm_benefit_7: "Shri Hanuman ji ki kripa se bhay evam sankat ka naash",
    pm_benefit_8: "Pratyaksh daan-punya ka satat pravaah",
  },
  english: {
    // Navigation / Header
    nav_home: "Home",
    nav_plans: "Plans",
    nav_sevas: "Our Sevas",
    nav_reviews: "Reviews",
    nav_about: "About Us",
    nav_faq: "FAQ",
    nav_my_subscription: "My Subscription",

    // Homepage Hero
    hero_badge: "1,200+ Families Connected With Us",
    hero_sub: "Jai Siyaram • From Holy Pushkarraj",
    hero_title_1: "Punya Yours,",
    hero_title_2: "Service Ours.",
    hero_desc:
      "Too busy to perform daan-punya, hawan, or pooja yourself? Punyata fulfills this sacred responsibility in your name & gotra at Holy Pushkarraj — with video proof sent directly to your WhatsApp.",
    hero_cta: "See Plans — Starting from ₹251/Month",

    // Homepage Mission
    mission_relief: "The Relief",
    mission_title: "Don't let a busy life keep you from accumulating Punya.",
    mission_desc:
      "In the rush of city life, every home is drifting away from regular daan-punya, hawan, and pooja. Punyata takes up this sacred duty for you — in your name, your gotra, and with your sankalp.",
    mission_quote: '"We don\'t take away your responsibility — we fulfill it on your behalf."',

    // How It Works
    hiw_title: "How It Works",
    hiw_step: "STEP",
    hiw_step_1_title: "Sankalp",
    hiw_step_1_desc: "Take a monthly sankalp with your name & gotra.",
    hiw_step_2_title: "Seva",
    hiw_step_2_desc: "Your rituals are performed at Holy Pushkarraj.",
    hiw_step_3_title: "Pramaan",
    hiw_step_3_desc: "Video proof of every ritual is sent directly to your WhatsApp.",

    // Proof Gallery
    gallery_title: "Proof Gallery",
    gallery_see_all: "See All →",
    gallery_type: "Video",
    gallery_footer: "Live/Video Proof of every seva sent to your WhatsApp monthly.",

    // Kaliyug Section
    kaliyug_badge: "Daan-Punya in Kaliyug",
    kaliyug_title: "Punya is the only wealth that stays with you.",
    kaliyug_footer:
      "When we cannot perform daan-punya ourselves, Punyata carries out this sacred duty in your name.",

    // Family Section
    family_title: "For the Whole Family",
    family_desc:
      "One subscription — sankalp for up to 4 family members. Every person's name and gotra is spoken during the rituals.",

    // Plans preview
    plans_sub: "Starting at ₹251/Month • Up to 4 family members",
    plans_view_details: "View Details",
    plans_see_full: "See Full Plans",
    plans_footer: "No Hidden Charges · Cancel Anytime · 100% Secure via Razorpay",

    // Punya Meter
    pm_title: "Punya Meter",
    pm_subtitle:
      "Are you able to accumulate Punya for yourself and your family every month with Vedic rituals?",
    pm_badge: "Punya is the only wealth that goes with you after this life",
    pm_ques_parent: "Are you able to perform daan-punya for your parents?",
    pm_ques_1: "Feeding 5 sadhus (Saadhu Santo Ko Bhojan) — with Vedic Sankalp",
    pm_ques_2: "Feeding Gau Mata (Cow Seva) and caring",
    pm_ques_3: "Offering chickpeas/bananas to monkeys for Lord Hanuman (Vanara Seva)",
    pm_ques_4: "Sundarkand path performed according to Vedic rituals",
    pm_ques_5: "Hawan or Daan-Punya according to Vedic vidhi",
    pm_yes: "Yes, I am able to",
    pm_no: "No, I am not able to",
    pm_pass_msg: "Your Punya Bank is healthy",
    pm_fail_msg: "Your Punya Bank is not healthy",
    pm_score: "Score",
    pm_pass_bless:
      "🕉️ Pranam! You are regularly performing punya activities. May Lord Hanuman's grace always be upon you and your family.",
    pm_fail_bless:
      "In Kaliyug, regular daan-punya is our greatest shield. Don't let busyness block your punya journey.",
    pm_cta: "Start Your Punya Journey",
    pm_reset: "Check Punya Meter Again",
    pm_benefits_title: "Benefits of Regular Daan-Punya",
    pm_benefit_1: "Dispelling household discord and Vastu defects",
    pm_benefit_2: "Grace of Lord Hanuman on all family members",
    pm_benefit_3: "Destruction of financial obstacles and poverty",
    pm_benefit_4: "Satisfaction and blessings of ancestors",
    pm_benefit_5: "Positive energy and mental peace in the family",
    pm_benefit_6: "Mitigation of Pitra Dosh and planetary defects",
    pm_benefit_7: "Destruction of fear and crisis by the grace of Lord Hanuman",
    pm_benefit_8: "Continuous flow of direct daan-punya",
  },
} as const;

export function useLanguage() {
  // [Pass-2 L8] Hydration-safe: the SSR pass and the first client
  // render must agree (both "hindi"); a stored preference is applied
  // in an EFFECT after mount. The old localStorage-in-initializer made
  // english-preferring browsers hydrate with different text than the
  // server rendered — React hydration mismatch + full re-render flash
  // on every marketing page.
  const [lang, setLang] = useState<Lang>("hindi");

  useEffect(() => {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === "hindi" || stored === "english") {
      setLang((prev) => (prev === stored ? prev : stored));
    }
    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<Lang>;
      setLang(customEvent.detail);
    };
    window.addEventListener("punyata:lang-change", handleLangChange);
    return () => window.removeEventListener("punyata:lang-change", handleLangChange);
  }, []);

  return lang;
}

export function useTranslation() {
  const lang = useLanguage();
  const t = (key: keyof typeof translations.hindi) => {
    return translations[lang][key] || translations.hindi[key] || key;
  };
  return { t, lang };
}
