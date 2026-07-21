import basicImg1 from "@/assets/plans/basic_1.png";
import basicImg2 from "@/assets/plans/basic_2.png";
import basicImg3 from "@/assets/plans/basic_3.png";

import grahImg1 from "@/assets/plans/grah_1.png";
import grahImg2 from "@/assets/plans/grah_2.png";
import grahImg3 from "@/assets/plans/grah_3.png";

import varshImg1 from "@/assets/plans/varsh_1.png";
import varshImg2 from "@/assets/plans/varsh_2.png";
import varshImg3 from "@/assets/plans/varsh_3.png";

// New plan specific slides imports
import basicHero from "@/assets/plans/basic_hero.png";
import basicSankalp from "@/assets/plans/basic_sankalp.png";
import basicSeva from "@/assets/plans/basic_seva.png";
import basicProof from "@/assets/plans/basic_proof.png";

import premiumHero from "@/assets/plans/premium_hero.png";
import premiumSankalp from "@/assets/plans/premium_sankalp.png";
import premiumHawan from "@/assets/plans/premium_hawan.png";
import premiumProof from "@/assets/plans/premium_proof.png";

import annualHero from "@/assets/plans/annual_hero.png";
import annualSankalp from "@/assets/plans/annual_sankalp.png";
import annualHawan from "@/assets/plans/annual_hawan.png";
import annualProof from "@/assets/plans/annual_proof.png";
import annualBonus from "@/assets/plans/annual_bonus.png";

export type PlanId = "basic" | "grah" | "varsh";

export type PlanSlide = {
  src: string;
  title: string;
  subtitle: string;
  step?: string;
  stepClass?: string;
  titleClass?: string;
  subtitleClass?: string;
  scrimClass?: string;
};

export type Plan = {
  id: PlanId;
  name: string;
  heading: string;
  subheading: string;
  comparisonLine: string;
  isVisible?: boolean;
  tagline: string;
  price: string;
  priceNumeric: number;
  cycle: string; // e.g. "/Monthly"
  strikePrice?: string;
  image: string; // fallback image
  images: string[]; // mini-carousel images for listings
  slides: PlanSlide[]; // custom distinct carousel slides
  ribbon?: string;
  badge?: { label: string; kind: "popular" | "save" | "max" };
  location: string;
  serviceTags: string[]; // Pooja + Chadava + Hawan + Aarti + Daan + Sewa etc.
  features: string[];
  extra: string[];
  comparison?: Record<string, any>;
  detail: {
    hero: string;
    description: string[];
    sevas: { title: string; note: string }[];
    benefits: string[];
    reviews: { n: string; city: string; q: string; stars: number }[];
  };
};

export const plans: Plan[] = [
  {
    id: "basic",
    name: "BASIC",
    heading: "Monthly Sundarkand Path, Gau Seva and Vanar Seva — 1st Tuesday of Every Month Sankalp",
    subheading: "Family ki suraksha, swasthya aur samriddhi ke liye har mahine aapke naam evam gotra se sankalp",
    comparisonLine: "₹251 mein — ek pizza se bhi kam mein — poore mahine ka daan-punya",
    isVisible: true,
    tagline: "सेवा की शुरुआत — ₹251/Monthly में मासिक सुंदरकांड, गौ सेवा एवं वानर सेवा (1st Tuesday only)।",
    price: "₹251",
    priceNumeric: 251,
    cycle: "/Monthly",
    image: basicHero,
    images: [basicImg1, basicImg2, basicImg3],
    slides: [
      {
        src: basicHero,
        title: "बेसिक सेवा — 4 सदस्यों तक के लिए",
        subtitle: "सुंदरकांड पाठ • वानर सेवा • गौ सेवा",
      },
      {
        src: basicSankalp,
        title: "संकल्प — आपके नाम व गोत्र से",
        subtitle: "आपकी जानकारी हर माह सेवा में शामिल होती है",
        step: "चरण 1",
      },
      {
        src: basicSeva,
        title: "पंडित जी द्वारा सेवा सम्पन्न",
        subtitle: "तीर्थ गुरु पुष्करराज, पुष्कर में विधिपूर्वक",
        step: "चरण 2",
      },
      {
        src: basicProof,
        title: "प्रमाण सीधे आपके व्हाट्सएप पर",
        subtitle: "🙏 जय श्री राम, [नाम] जी — इस माह आपकी सेवा सम्पन्न हुई। प्रमाण संलग्न है।",
        step: "चरण 3",
      },
    ],
    ribbon: "800+ परिवार जुड़े",
    location: "तीर्थ गुरु पुष्करराज, पुष्कर",
    serviceTags: ["Pooja", "Chadava", "Daan", "Sewa", "Aarti"],
    features: [
      "सुंदरकांड पाठ — हर माह (1st Tuesday)",
      "गौ सेवा — हर माह (1st Tuesday)",
      "वानर सेवा — हर माह (1st Tuesday)",
      "आरती (Aarti) — हर सेवा के साथ",
      "WhatsApp Video Proof",
    ],
    extra: ["परिवार के 4 सदस्यों का संकल्प"],
    comparison: {
      sundarkand: { has: true, frequency: "1 time a month" },
      gauSeva: { has: true, frequency: "1 time a month" },
      vanarSeva: { has: true, frequency: "1 time a month" },
      sadhuBhojan: { has: false },
      grihaShantiHawan: { has: false },
      sarvRogNivaranHawan: { has: false },
      cholaSeva: { has: false },
      aarti: { has: true, frequency: "1 time a month" },
      proof: { has: true },
      family: { has: true, label: "Up to 4" },
      prasadBox: { has: false },
      billing: { has: true, label: "Monthly" }
    },
    detail: {
      hero: "मूल संकल्प — सेवा की शुरुआत",
      description: [
        "जब आप मूल संकल्प लेते हैं, तो आपके नाम एवं गोत्र से हर माह पहले मंगलवार को श्री हनुमान जी को समर्पित सुंदरकांड पाठ एवं आरती होती है — यह पुण्य आपके परिवार में शांति, सुरक्षा और समृद्धि लाता है।",
        "इस पैक में शामिल है — सुंदरकांड पाठ, आरती, गौ सेवा एवं वानर सेवा। प्रत्येक सेवा का Video Proof आपके WhatsApp पर।",
      ],
      sevas: [
        { title: "सुंदरकांड पाठ", note: "आपके नाम-गोत्र से — बिगड़े काम बनाने और ग्रह दोष शांत करने के लिए (1st Tuesday only)।" },
        { title: "आरती (Aarti)", note: "श्री हनुमान जी की आरती — हर अनुष्ठान का अंग।" },
        { title: "गौ माता सेवा", note: "गौशाला में चारा-गुड़ अर्पण — समस्त देवताओं की सेवा के समान (1st Tuesday only)।" },
        { title: "वानर सेवा", note: "श्री हनुमान जी के प्रिय — केला एवं चना (1st Tuesday only)。" },
      ],
      benefits: [
        "परिवार में सकारात्मक ऊर्जा एवं मानसिक शांति",
        "ग्रह दोष का शमन",
        "श्री हनुमान जी की कृपा से भय एवं संकट का नाश",
        "प्रत्यक्ष दान-पुण्य का सतत् प्रवाह",
      ],
      reviews: [
        { n: "Rajesh Sharma", city: "Delhi", q: "₹251 में इतना पुण्य — हर माह video देखकर मन को शांति मिलती है।", stars: 5 },
        { n: "Sunita Verma", city: "Mumbai", q: "बच्चे के नाम से संकल्प लिया, अब हर सेवा का proof पूरे परिवार को दिखाती हूँ।", stars: 5 },
        { n: "Vikas Tiwari", city: "Lucknow", q: "पहले विश्वास नहीं हुआ, लेकिन video प्रमाण देखकर श्रद्धा और गहरी हो गई।", stars: 5 },
      ],
    },
  },
  {
    id: "grah",
    name: "PREMIUM",
    heading: "Monthly Sundarkand Path, Gau Seva, Vanar Seva, Saadhu Santo Ko Bhojan, Griha Shanti Hawan and Sarv Rog Nivaran Hawan — 1st Tuesday of Every Month and Last Saturday of Every Month Sankalp",
    subheading: "Do sankalp har mahine — do alag hawan ke saath ghar mein shanti evam rog-badha nivaran",
    comparisonLine: "₹399 mein — ek family pizza se bhi kam mein — poore mahine ka daan-punya",
    isVisible: true,
    tagline: "सम्पूर्ण पारिवारिक सेवा — 2 सुंदरकांड, 2 अलग हवन (Griha Shanti & Sarv Rog Nivaran), Saadhu Santo Ko Bhojan एवं गौ/वानर सेवा हर माह।",
    price: "₹399",
    priceNumeric: 399,
    cycle: "/Monthly",
    image: premiumHero,
    images: [grahImg1, grahImg2, grahImg3],
    slides: [
      {
        src: premiumHero,
        title: "प्रीमियम सेवा — हवन सहित सम्पूर्ण पूजा",
        subtitle: "हवन एवं आहुति • सुंदरकांड पाठ • Saadhu Santo Ko Bhojan • वानर सेवा • गौ सेवा",
      },
      {
        src: premiumSankalp,
        title: "संकल्प — आपके नाम व गोत्र से",
        subtitle: "हवन सहित सम्पूर्ण पूजा आपकी जानकारी के साथ",
        step: "चरण 1",
      },
      {
        src: premiumHawan,
        title: "हवन — पंडित जी द्वारा विधिपूर्वक सम्पन्न",
        subtitle: "तीर्थ गुरु पुष्करराज, पुष्कर में",
        step: "चरण 2",
      },
      {
        src: premiumProof,
        title: "हर सेवा का प्रमाण — फोटो व वीडियो सहित",
        subtitle: "🙏 जय श्री राम, [नाम] जी — इस माह हवन सहित आपकी सम्पूर्ण सेवा सम्पन्न हुई। प्रमाण संलग्न है।",
        step: "चरण 3",
      },
    ],
    ribbon: "500+ परिवार जुड़े",
    badge: { label: "सबसे लोकप्रिय", kind: "popular" },
    location: "तीर्थ गुरु पुष्करराज, पुष्कर",
    serviceTags: ["Pooja", "Chadava", "Hawan", "Aarti", "Daan", "Sewa"],
    features: [
      "सुnderkand — 2× हर माह (1st Tuesday & Last Saturday)",
      "Griha Shanti Hawan (1st Tuesday only)",
      "Sarv Rog Nivaran Hawan (Last Saturday only)",
      "Saadhu Santo Ko Bhojan — 2× हर माह",
      "गौ + वानर सेवा — 2× हर माह",
      "WhatsApp Video Proof सभी सेवाओं का",
    ],
    extra: ["परिवार के 4 सदस्यों का संकल्प"],
    comparison: {
      sundarkand: { has: true, frequency: "2 times a month" },
      gauSeva: { has: true, frequency: "2 times a month" },
      vanarSeva: { has: true, frequency: "2 times a month" },
      sadhuBhojan: { has: true, frequency: "2 times a month" },
      grihaShantiHawan: { has: true, frequency: "1 time a month" },
      sarvRogNivaranHawan: { has: true, frequency: "1 time a month" },
      cholaSeva: { has: false },
      aarti: { has: true, frequency: "2 times a month" },
      proof: { has: true },
      family: { has: true, label: "Up to 4" },
      prasadBox: { has: false },
      billing: { has: true, label: "Monthly" }
    },
    detail: {
      hero: "गृह शांति — सम्पूर्ण पारिवारिक कवच",
      description: [
        "गृह शांति संकल्प आपके परिवार के लिए एक आध्यात्मिक कवच है — हर माह दो सुंदरकांड पाठ, दो अलग हवन (गृह शांति और सर्व रोग निवारण), आरती, साधु संतों को भोजन और गौ-वानर सेवा से आपके घर में मंगल का वास होता है।",
        "यह पैक विशेष रूप से उन परिवारों के लिए है जो चाहते हैं कि उनके घर में सकारात्मक ऊर्जा हो और रोग, शोक तथा वास्तु दोष का शमन हो।",
      ],
      sevas: [
        { title: "सुंदरकांड पाठ", note: "माह में 2 बार (1st Tuesday & Last Saturday) आपके नाम-गोत्र से सुंदरकांड पाठ।" },
        { title: "Griha Shanti Hawan", note: "वैदिक मंत्रों से — 1st Tuesday of every month only।" },
        { title: "Sarv Rog Nivaran Hawan", note: "वैदिक मंत्रों से — Last Saturday of every month only।" },
        { title: "Saadhu Santo Ko Bhojan", note: "माह में 2 बार (1st Tuesday & Last Saturday) साधु संतों को सात्विक भोजन सत्कार।" },
        { title: "आरती (Aarti)", note: "हर अनुष्ठान के साथ पूर्ण आरती।" },
        { title: "गौ माता सेवा", note: "माह में 2 बार गौशाला में चारा-गुड़ अर्पण।" },
        { title: "वानर सेवा", note: "माह में 2 बार केला एवं चना अर्पण।" },
      ],
      benefits: [
        "गृह-कलेश एवं वास्तु दोष का शमन",
        "परिवार के सभी सदस्यों पर हनुमान जी की कृपा",
        "आर्थिक बाधा एवं रोग-बाधा का निवारण",
        "पूर्वजों की तृप्ति एवं आशीर्वाद",
      ],
      reviews: [
        { n: "Meena Patel", city: "Ahmedabad", q: "पिताजी की स्मृति में हर माह सुंदरकांड — video में उनका नाम सुनकर आँखें भर आती हैं।", stars: 5 },
        { n: "Amit Khandelwal", city: "Jaipur", q: "हवन के बाद घर का माहौल पूरा बदल गया। बहुत ही दिव्य अनुभव है।", stars: 5 },
        { n: "Neha Joshi", city: "Pune", q: "पूरे परिवार के लिए सबसे संतुलित पैक — हर पैसे का हिसाब video से।", stars: 5 },
      ],
    },
  },
  {
    id: "varsh",
    name: "PREMIUM ANNUAL",
    heading: "12 Month Sundarkand Path, Gau Seva, Vanar Seva, Saadhu Santo Ko Bhojan, Griha Shanti Hawan and Sarv Rog Nivaran Hawan Sankalp — 24 Sankalp Yearly with Prasad and Certificate",
    subheading: "Poore saal ka sanchit punya — Prasad evam Sankalp Certificate ke saath ghar tak pahunchega",
    comparisonLine: "₹4,101 mein — poore saal ka sanchit punya, ek baar ke family dinner se bhi kam mein",
    isVisible: true,
    tagline: "पूरे वर्ष का संकल्प — ₹399 वाली सभी सेवाएं 12 माह + हनुमान जी चोला सेवा + Prasad Box।",
    price: "₹4,101",
    priceNumeric: 4101,
    cycle: "/Yearly",
    strikePrice: "₹4,812",
    image: annualHero,
    images: [varshImg1, varshImg2, varshImg3],
    slides: [
      {
        src: annualHero,
        title: "प्रीमियम वार्षिक — पूरे वर्ष की निश्चिंतता",
        subtitle: "हवन एवं आहुति • सुंदरकांड • Saadhu Santo Ko Bhojan • वानर सेवा • गौ सेवा • संकल्प प्रमाणपत्र एवं प्रसाद",
      },
      {
        src: annualSankalp,
        title: "संकल्प — आपके नाम व गोत्र से",
        subtitle: "हवन सहित सम्पूर्ण पूजा आपकी जानकारी के साथ",
        step: "चरण 1",
      },
      {
        src: annualHawan,
        title: "हवन — पंडित जी द्वारा विधिपूर्वक सम्पन्न",
        subtitle: "तीर्थ गुरु पुष्करराज, पुष्कर में",
        step: "चरण 2",
      },
      {
        src: annualProof,
        title: "हर सेवा का प्रमाण — फोटो व वीडियो सहित",
        subtitle: "🙏 जय श्री राम, [नाम] जी — इस माह हवन सहित आपकी सम्पूर्ण सेवा सम्पन्न हुई। प्रमाण संलग्न है।",
        step: "चरण 3",
      },
      {
        src: annualBonus,
        title: "वार्षिक सदस्यों के लिए विशेष प्रसाद",
        subtitle: "सरोवर जल, चंदन तिलक, अक्षत-कुमकुम एवं संकल्प प्रमाणपत्र",
      },
    ],
    ribbon: "सर्वाधिक पुण्यदायी",
    badge: { label: "₹711 की बचत", kind: "save" },
    location: "तीर्थ गुरु पुष्करराज, पुष्कर",
    serviceTags: ["Pooja", "Chadava", "Hawan", "Aarti", "Daan", "Sewa", "Prasad Box"],
    features: [
      "₹399 प्लान की सभी सेवाएं — 12 माह",
      "सुंदरकांड — 24 पाठ (2/माह)",
      "आरती (Aarti) — हर सेवा के साथ",
      "हनुमान जी चोला सेवा — वार्षिक",
      "Quarterly Prasad Box — घर पर डाक द्वारा",
    ],
    extra: ["परिवार के 4 सदस्यों का संकल्प"],
    comparison: {
      sundarkand: { has: true, frequency: "2 times a month" },
      gauSeva: { has: true, frequency: "2 times a month" },
      vanarSeva: { has: true, frequency: "2 times a month" },
      sadhuBhojan: { has: true, frequency: "2 times a month" },
      grihaShantiHawan: { has: true, frequency: "1 time a month" },
      sarvRogNivaranHawan: { has: true, frequency: "1 time a month" },
      cholaSeva: { has: true, label: "1 time a year" },
      aarti: { has: true, frequency: "2 times a month" },
      proof: { has: true },
      family: { has: true, label: "Up to 4" },
      prasadBox: { has: true, label: "Quarterly" },
      billing: { has: true, label: "Yearly" }
    },
    detail: {
      hero: "वार्षिक महासंकल्प — पूरे वर्ष का पुण्य",
      description: [
        "एक वार्षिक महासंकल्प का पुण्य 12 अलग-अलग मासिक संकल्पों से कहीं अधिक फलदायी माना गया है। पूरे वर्ष अखंड रूप से आपके नाम-गोत्र से सेवाएँ चलती रहती हैं — बिना विघ्न, बिना विराम।",
        "इस पैक में गृह शांति की सभी सेवाएँ 12 महीने + हनुमान जी की विशेष वार्षिक चोला सेवा एवं Quarterly Prasad Box शामिल है। ₹4,812 की सेवाएँ मात्र ₹4,101 में — बचत ₹711।",
      ],
      sevas: [
        { title: "सुंदरकांड पाठ", note: "पूरे वर्ष अखंड जप (24 पाठ)।" },
        { title: "गृह शांति हवन", note: "हर माह वैदिक हवन (12 बार)।" },
        { title: "आरती (Aarti)", note: "हर अनुष्ठान के साथ पूर्ण आरती।" },
        { title: "हनुमान जी चोला सेवा", note: "बजरंगबली को विशेष चोला अर्पण (वार्षिक)।" },
        { title: "सरोवर दीपदान", note: "संध्या समय पुष्कर सरोवर में दीपदान।" },
        { title: "गौ माता सेवा", note: "पूरे वर्ष निरंतर गौशाला सेवा।" },
        { title: "वानर सेवा", note: "पूरे वर्ष निरंतर वानर सेवा।" },
        { title: "ब्राह्मण भोजन", note: "पूरे वर्ष निरंतर ब्राह्मण भोजन।" },
        { title: "Quarterly Prasad Box", note: "साल में 4 बार पवित्र प्रसाद आपके घर।" },
      ],
      benefits: [
        "अखंड वार्षिक पुण्य — विघ्न रहित संकल्प",
        "₹711 की बचत — मात्र ₹340 प्रति माह",
        "पूरे कुल पर श्री हनुमान जी की छत्रछाया",
        "पितरों की चिरस्थायी तृप्ति",
      ],
      reviews: [
        { n: "Prakash Agarwal", city: "Kolkata", q: "पूरे साल की चिंता एक ही बार में — यह सबसे शांतिपूर्ण निर्णय था।", stars: 5 },
        { n: "Kavita Iyer", city: "Bengaluru", q: "चोला सेवा का video देखकर रोंगटे खड़े हो गए। पैसा सार्थक हो गया।", stars: 5 },
        { n: "Ramesh Gupta", city: "Indore", q: "₹711 की बचत बोनस है — असली फायदा तो पूरे वर्ष का अखंड पुण्य है।", stars: 5 },
      ],
    },
  },
];

export function getPlan(id: string): Plan | undefined {
  return plans.find((p) => p.id === id);
}

// Shared seva list used on Homepage preview + Sevas + Plans pages
export type SevaListItem = { title: string; desc: string; iconKey: string };

export const sevaList: SevaListItem[] = [
  { title: "सुंदरकांड पाठ", desc: "आपके नाम एवं गोत्र से संकल्पपूर्वक सस्वर सुंदरकांड — श्री हनुमान जी की कृपा हेतु।", iconKey: "BookOpen" },
  { title: "गृह शांति हवन", desc: "विद्वान आचार्यों द्वारा वैदिक मंत्रों से गृह शांति हवन — परिवार की मंगल कामना सहित।", iconKey: "Flame" },
  { title: "आरती (Aarti)", desc: "हर अनुष्ठान के साथ पूर्ण आरती — दीप, धूप एवं भजन के साथ।", iconKey: "Sun" },
  { title: "गौ माता सेवा", desc: "स्थानीय गौशालाओं में गौ माता को हरा चारा एवं गुड़ का अर्पण — सीधा पुण्य।", iconKey: "Wind" },
  { title: "वानर सेवा", desc: "तीर्थ गुरु पुष्करराज में वानरों को केला एवं चना — श्री हनुमान जी के प्रिय।", iconKey: "Heart" },
  { title: "साधु संतों को भोजन", desc: "विद्वान साधु संतों को सात्विक भोजन एवं यथायोग्य सत्कार — पितृ आशीर्वाद।", iconKey: "Users" },
  { title: "सरोवर दीपदान", desc: "पुष्कर सरोवर में संध्या समय दीप अर्पण — मोक्ष एवं सौभाग्य प्रदायक।", iconKey: "Sun" },
  { title: "हनुमान जी चोला सेवा", desc: "श्री बजरंगबली को सिंदूर, चमेली तेल एवं चांदी का वर्क अर्पण — कष्ट निवारण हेतु।", iconKey: "Sparkles" },
  { title: "भंडारा / प्रसाद सेवा", desc: "तीर्थ क्षेत्र में श्रद्धालुओं एवं जरूरतमंदों के बीच प्रसाद वितरण।", iconKey: "Heart" },
  { title: "भव्य श्रृंगार", desc: "विशेष पर्वों पर भगवान का पुष्प एवं वस्त्रों से मन्त्रमुग्ध श्रृंगार।", iconKey: "Flame" },
];

export const acharyas = [
  { initials: "रा", name: "पं. रामस्वरूप शर्मा", role: "मुख्य आचार्य — तीर्थ गुरु पुष्करराज", bio: "22 वर्षों से तीर्थ गुरु पुष्करराज में सेवारत। हवन विशेषज्ञ। काशी विद्यापीठ से वेद-शास्त्र में स्नातक।", quote: "सेवा ही हमारा धर्म है।" },
  { initials: "वि", name: "पं. विनायक जी", role: "सुंदरकांड प्रमुख", bio: "8 वर्षों से सुंदरकांड पाठ में विशेषज्ञ। सस्वर एवं संकल्प-सम्मत पाठ के आचार्य।", quote: "राम नाम सबसे बड़ा मंत्र।" },
  { initials: "गो", name: "पं. गोविंद प्रसाद तिवारी", role: "गौ सेवा एवं अनुष्ठान प्रमुख", bio: "15 वर्षों से गौशाला सेवा। वानर सेवा एवं साधु संतों को भोजन के संयोजक।", quote: "गौ माता की सेवा में ही समस्त देवताओं की सेवा है।" },
];

export const testimonials = [
  { q: "हर सप्ताह WhatsApp पर video देखकर मन को असीम शांति मिलती है। माँ के नाम से हवन करवाना अब संभव हो सका।", n: "Rajesh Sharma", city: "Delhi" },
  { q: "व्यस्तता के कारण मैं स्वयं तीर्थ गुरु पुष्करराज नहीं जा सकती थी। पुण्यता ने यह सम्भव कर दिया।", n: "Sunita Verma", city: "Mumbai" },
  { q: "गौ-सेवा का सीधा पुण्य अब हर महीने। यह business नहीं, सच्ची सेवा है। जय बजरंगबली।", n: "Amit Khandelwal", city: "Jaipur" },
  { q: "पिताजी की स्मृति में हर माह सुंदरकांड — और video में उनका नाम सुनकर आँखें भर आती हैं।", n: "Meena Patel", city: "Ahmedabad" },
  { q: "₹251 में इतनी सेवाएँ — पहले विश्वास नहीं हुआ, लेकिन हर माह video देखकर श्रद्धा और गहरी हो गई।", n: "Vikas Tiwari", city: "Lucknow" },
];

export const faqs = [
  { q: "इतने सस्ते में कैसे करवा पा रहे हो यह सब?", a: "सभी के नाम का संकल्प साथ में लिया जाएगा। हर व्यक्ति का नाम और गोत्र अलग-अलग बोला जाएगा, लेकिन पंडित जी एक ही बार में सबके संकल्प सामूहिक रूप से ले लेंगे। इसीलिए यह सेवा सभी के लिए सुलभ और सस्ती रखी गई है।" },
  { q: "पहली सेवा कब शुरू होगी?", a: "अगर आप महीने के पहले मंगलवार से पहले सब्सक्राइब करते हैं, तो आपकी पहली सेवा उसी महीने के पहले मंगलवार को होती है — आपके प्लान की सभी सेवाओं के साथ। Premium और Premium Annual सदस्यों को उसी महीने के आखिरी शनिवार को अतिरिक्त सेवाएं (Saadhu Santo Ko Bhojan दोबारा + Sarv Rog Nivaran Hawan) भी मिलती हैं। अगर आप पहले मंगलवार के बाद जॉइन करते हैं, तो Basic सदस्यों को अगले महीने के पहले मंगलवार का इंतज़ार करना होता है (हालांकि इस बीच उसी महीने के आखिरी शनिवार में एक बार शामिल कर लिया जाता है, Hawan को छोड़कर)।" },
  { q: "Refund Policy क्या है?", a: "अगर किसी कारणवश सेवा न हो सके तो पूरा धन वापस किया जाएगा।" },
  { q: "क्या मुझे प्रत्येक सेवा का प्रमाण मिलेगा?", a: "जी हाँ। प्रत्येक अनुष्ठान का Live या Video Proof सीधे आपके WhatsApp पर भेजा जाता है।" },
  { q: "क्या यह कोई business है?", a: "नहीं। यह सनातन सेवा का एक सामूहिक यज्ञ है। आपकी सेवा राशि का एक-एक पैसा सीधे गौ-माता के चारे, वानरों के फल, साधु संतों को भोजन एवं अनुष्ठान सामग्री में लगाया जाता है।" },
  { q: "क्या मैं अपने माता-पिता के नाम से संकल्प ले सकता हूँ?", a: "अवश्य। आप अपने माता-पिता, स्वर्गीय प्रियजनों या किसी भी सदस्य के नाम और गोत्र से यह मासिक संकल्प आरंभ कर सकते हैं।" },
  { q: "क्या मैं किसी भी समय cancel कर सकता हूँ?", a: "जी हाँ, बिना किसी शुल्क या प्रश्न के आप अपना मासिक योगदान कभी भी रोक सकते हैं।" },
];
