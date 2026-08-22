// ─────────────────────────────────────────────────────────────────────────────
// SITE IMAGERY MANIFEST — the single source of truth for every photograph
// rendered by the marketing site.
//
// HOW TO SWAP A PHOTO (the only code change needed):
//
//   1. Upload the real photo to Cloudinary under the `punyata-site/` folder
//      (see src/assets/README.md for the naming convention), e.g.
//      `punyata-site/sevas/gau-seva`.
//   2. Paste that public id into the matching `publicId` below.
//
//   That's it. Every consumer renders through <CldImage>, so filling in a
//   publicId switches that one image over to Cloudinary — with automatic
//   format negotiation, quality selection and responsive widths — without
//   touching a single component.
//
// WHY `fallback` EXISTS: until a publicId is filled in (and for any dev running
// without `VITE_CLOUDINARY_CLOUD_NAME`), the bundled Vite asset below is served
// instead. Nothing ever goes blank. This is the ONLY file in src/ that is
// allowed to import a raster asset from `@/assets` — everything else goes
// through these keys.
//
// `w`/`h` are the intrinsic pixel dimensions of the fallback and are emitted as
// the <img> width/height attributes so the browser reserves the correct box and
// the page does not shift as photos decode. Keep replacement photos at the same
// aspect ratio, or update w/h alongside the publicId.
//
// NOTE: several fallbacks below are byte-identical placeholder renders. They are
// kept as SEPARATE keys on purpose — they are distinct semantic slots that will
// each receive a different real photograph.
// ─────────────────────────────────────────────────────────────────────────────

// Home / hero
import heroPushkarGhatsImg from "@/assets/hero/pushkar-ghats.jpg";
import heroWhatsappProofImg from "@/assets/hero/whatsapp-proof.jpg";

// Seva photography
import sevaSundarkandImg from "@/assets/sevas/sundarkand.png";
import sevaGauImg from "@/assets/sevas/gau_seva.png";
import sevaSadhuBhojanImg from "@/assets/sevas/sadhu_bhojan.png";
import sevaHawanImg from "@/assets/sevas/hawan.png";
import sevaSarovarDeepdaanImg from "@/assets/sevas/sarovar_deepdaan.png";
import sevaVanarImg from "@/assets/plans/varsh_1.png";

// Plan cards & plan-detail carousels
import planBasicHeroImg from "@/assets/plans/basic_hero.png";
import planBasicSankalpImg from "@/assets/plans/basic_sankalp.png";
import planBasicSevaImg from "@/assets/plans/basic_seva.png";
import planBasicProofImg from "@/assets/plans/basic_proof.png";
import planPremiumHeroImg from "@/assets/plans/premium_hero.png";
import planPremiumSankalpImg from "@/assets/plans/premium_sankalp.png";
import planPremiumHawanImg from "@/assets/plans/premium_hawan.png";
import planPremiumProofImg from "@/assets/plans/premium_proof.png";
import planAnnualHeroImg from "@/assets/plans/annual_hero.png";
import planAnnualSankalpImg from "@/assets/plans/annual_sankalp.png";
import planAnnualHawanImg from "@/assets/plans/annual_hawan.png";
import planAnnualProofImg from "@/assets/plans/annual_proof.png";
import planAnnualBonusImg from "@/assets/plans/annual_bonus.png";

// About page story carousel
import aboutStory1Img from "@/assets/about/story_1.png";
import aboutStory2Img from "@/assets/about/story_2.png";
import aboutStory3Img from "@/assets/about/story_3.png";
import aboutStory4Img from "@/assets/about/story_4.png";

// Standalone location & proof-gallery stills
import pushkarGhatImg from "@/assets/pushkar-ghat.jpg";
import proofHavanImg from "@/assets/havan.jpg";
import proofGauImg from "@/assets/gau-seva.jpg";

export type SiteImage = {
  /** Cloudinary public id under `punyata-site/`. Empty = serve `fallback`. */
  publicId: string;
  /** Bundled Vite asset served until `publicId` is filled in. */
  fallback: string;
  /** Default alt text; a consumer may pass a more specific one. */
  alt: string;
  /** Intrinsic width of `fallback`, in px. */
  w: number;
  /** Intrinsic height of `fallback`, in px. */
  h: number;
};

export const SITE_IMAGES = {
  // ── Home hero carousel ────────────────────────────────────────────────────
  heroPushkarGhats: {
    publicId: "",
    fallback: heroPushkarGhatsImg,
    alt: "तीर्थ गुरु पुष्करराज — पवित्र सरोवर एवं संध्या दीपदर्शन",
    w: 1024,
    h: 1024,
  },
  heroWhatsappProof: {
    publicId: "",
    fallback: heroWhatsappProofImg,
    alt: "100% पारदर्शिता — हर सेवा का WhatsApp Video Proof",
    w: 1024,
    h: 1024,
  },

  // ── Seva photography ──────────────────────────────────────────────────────
  sevaSundarkand: {
    publicId: "",
    fallback: sevaSundarkandImg,
    alt: "सुंदरकांड पाठ — आपके नाम व गोत्र से संकट हरण पाठ",
    w: 1024,
    h: 558,
  },
  sevaGau: {
    publicId: "",
    fallback: sevaGauImg,
    alt: "गौ माता सेवा — हरा चारा एवं गुड़ अर्पण",
    w: 1024,
    h: 1024,
  },
  sevaSadhuBhojan: {
    publicId: "",
    fallback: sevaSadhuBhojanImg,
    alt: "साधु संतों को भोजन — पुष्कर क्षेत्र सात्विक भोजन सत्कार",
    w: 1024,
    h: 1024,
  },
  sevaHawan: {
    publicId: "",
    fallback: sevaHawanImg,
    alt: "वैदिक आहुति — गृह शांति एवं सर्व रोग निवारण हवन",
    w: 1024,
    h: 1024,
  },
  sevaSarovarDeepdaan: {
    publicId: "",
    fallback: sevaSarovarDeepdaanImg,
    alt: "सरोवर दीपदान — पुष्कर सरोवर में मोक्ष प्रदायक दीप अर्पण",
    w: 1024,
    h: 1024,
  },
  sevaVanar: {
    publicId: "",
    fallback: sevaVanarImg,
    alt: "वानर सेवा — श्री हनुमान जी के प्रिय फल व चना अर्पण",
    w: 1024,
    h: 1024,
  },

  // ── Basic plan ────────────────────────────────────────────────────────────
  planBasicHero: {
    publicId: "",
    fallback: planBasicHeroImg,
    alt: "बेसिक सेवा — 4 सदस्यों तक के लिए",
    w: 1024,
    h: 1024,
  },
  planBasicSankalp: {
    publicId: "",
    fallback: planBasicSankalpImg,
    alt: "संकल्प — आपके नाम व गोत्र से",
    w: 1024,
    h: 1024,
  },
  planBasicSeva: {
    publicId: "",
    fallback: planBasicSevaImg,
    alt: "पंडित जी द्वारा सेवा सम्पन्न — तीर्थ गुरु पुष्करराज",
    w: 1024,
    h: 1024,
  },
  planBasicProof: {
    publicId: "",
    fallback: planBasicProofImg,
    alt: "प्रमाण सीधे आपके व्हाट्सएप पर",
    w: 1024,
    h: 1024,
  },

  // ── Premium (गृह शांति) plan ───────────────────────────────────────────────
  planPremiumHero: {
    publicId: "",
    fallback: planPremiumHeroImg,
    alt: "प्रीमियम सेवा — हवन सहित सम्पूर्ण पूजा",
    w: 1024,
    h: 1024,
  },
  planPremiumSankalp: {
    publicId: "",
    fallback: planPremiumSankalpImg,
    alt: "संकल्प — आपके नाम व गोत्र से, हवन सहित सम्पूर्ण पूजा",
    w: 1024,
    h: 1024,
  },
  planPremiumHawan: {
    publicId: "",
    fallback: planPremiumHawanImg,
    alt: "हवन — पंडित जी द्वारा विधिपूर्वक सम्पन्न",
    w: 1024,
    h: 1024,
  },
  planPremiumProof: {
    publicId: "",
    fallback: planPremiumProofImg,
    alt: "हर सेवा का प्रमाण — फोटो व वीडियो सहित",
    w: 1024,
    h: 1024,
  },

  // ── Premium annual (वार्षिक महासंकल्प) plan ─────────────────────────────────
  planAnnualHero: {
    publicId: "",
    fallback: planAnnualHeroImg,
    alt: "प्रीमियम वार्षिक — पूरे वर्ष की निश्चिंतता",
    w: 1024,
    h: 1024,
  },
  planAnnualSankalp: {
    publicId: "",
    fallback: planAnnualSankalpImg,
    alt: "संकल्प — आपके नाम व गोत्र से, हवन सहित सम्पूर्ण पूजा",
    w: 1024,
    h: 1024,
  },
  planAnnualHawan: {
    publicId: "",
    fallback: planAnnualHawanImg,
    alt: "हवन — पंडित जी द्वारा विधिपूर्वक सम्पन्न",
    w: 1024,
    h: 1024,
  },
  planAnnualProof: {
    publicId: "",
    fallback: planAnnualProofImg,
    alt: "हर सेवा का प्रमाण — फोटो व वीडियो सहित",
    w: 1024,
    h: 1024,
  },
  planAnnualBonus: {
    publicId: "",
    fallback: planAnnualBonusImg,
    alt: "वार्षिक सदस्यों के लिए विशेष प्रसाद एवं संकल्प प्रमाणपत्र",
    w: 1024,
    h: 1024,
  },

  // ── About page story carousel ─────────────────────────────────────────────
  aboutStory1: {
    publicId: "",
    fallback: aboutStory1Img,
    alt: "Pushkar Brahma temple",
    w: 1024,
    h: 1024,
  },
  aboutStory2: {
    publicId: "",
    fallback: aboutStory2Img,
    alt: "Elderly priest",
    w: 1024,
    h: 1024,
  },
  aboutStory3: {
    publicId: "",
    fallback: aboutStory3Img,
    alt: "Devotee viewing proof",
    w: 1024,
    h: 1024,
  },
  aboutStory4: {
    publicId: "",
    fallback: aboutStory4Img,
    alt: "Pushkar sunset",
    w: 1024,
    h: 1024,
  },

  // ── Location still (About + Plans pages) ──────────────────────────────────
  pushkarGhat: {
    publicId: "",
    fallback: pushkarGhatImg,
    alt: "तीर्थ गुरु पुष्करराज",
    w: 1024,
    h: 1024,
  },

  // ── Proof gallery thumbnails ──────────────────────────────────────────────
  proofGhat: {
    publicId: "",
    fallback: pushkarGhatImg,
    alt: "पुष्कर घाट पर सम्पन्न सेवा का Video Proof",
    w: 1024,
    h: 1024,
  },
  proofHavan: {
    publicId: "",
    fallback: proofHavanImg,
    alt: "हवन सेवा का Video Proof",
    w: 1024,
    h: 1024,
  },
  proofGau: {
    publicId: "",
    fallback: proofGauImg,
    alt: "गौ सेवा का Video Proof",
    w: 1024,
    h: 1024,
  },
  proofWhatsapp: {
    publicId: "",
    fallback: heroWhatsappProofImg,
    alt: "WhatsApp पर भेजा गया सेवा प्रमाण",
    w: 1024,
    h: 1024,
  },
} as const satisfies Record<string, SiteImage>;

export type SiteImageKey = keyof typeof SITE_IMAGES;

/**
 * Wrap an arbitrary absolute URL (e.g. a `plans.card_image_url` typed into the
 * admin panel) as a SiteImage so it can flow through <CldImage> unchanged.
 * `publicId` stays empty, so the URL is used verbatim as the `src`.
 */
export function externalImage(url: string, alt: string, w = 1024, h = 1024): SiteImage {
  return { publicId: "", fallback: url, alt, w, h };
}
