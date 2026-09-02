import { SITE_IMAGES, type SiteImageKey } from "@/lib/site-images";
import { testimonials } from "@/lib/plans";

// Static UI manifest for /admin/images — describes, in plain language,
// where each editable photo appears on the live site. This is presentation
// metadata only (not a DB table): add a row here whenever a new SITE_IMAGES
// key or testimonial slot is introduced.

export type ImageSlot =
  | { kind: "site_image"; key: SiteImageKey; label: string }
  | { kind: "review"; slotKey: `review-${number}`; label: string; reviewIndex: number };

export interface ImageSlotSection {
  title: string;
  description: string;
  livePage: string;
  slots: ImageSlot[];
}

function siteImage(key: SiteImageKey, label: string): ImageSlot {
  return { kind: "site_image", key, label };
}

export const IMAGE_SLOT_SECTIONS: ImageSlotSection[] = [
  {
    title: "होमपेज — सबसे ऊपर वाला Hero Carousel",
    description: "पहली चीज़ जो कोई भी visitor site खोलते ही देखता है — 8 photo का slideshow।",
    livePage: "/",
    slots: [
      siteImage("heroPushkarGhats", "Slide 1 — पुष्कर सरोवर घाट"),
      siteImage("planBasicSeva", "Slide 2 — पंडित जी द्वारा सेवा"),
      siteImage("sevaHawan", "Slide 3 — हवन सेवा"),
      siteImage("sevaGau", "Slide 4 — गौ सेवा"),
      siteImage("sevaSadhuBhojan", "Slide 5 — साधु भोजन सेवा"),
      siteImage("sevaVanar", "Slide 6 — वानर सेवा"),
      siteImage("sevaSarovarDeepdaan", "Slide 7 — सरोवर दीपदान"),
      siteImage("heroWhatsappProof", "Slide 8 — WhatsApp Proof स्क्रीनशॉट"),
    ],
  },
  {
    title: "सेवा फोटो (Homepage एवं Sevas Page पर उपयोग होती हैं)",
    description: "हर सेवा की अपनी एक तस्वीर — /sevas page और होमपेज carousel दोनों में दिखती है।",
    livePage: "/sevas",
    slots: [
      siteImage("sevaSundarkand", "सुंदरकांड पाठ"),
      siteImage("sevaGau", "गौ सेवा"),
      siteImage("sevaVanar", "वानर सेवा"),
      siteImage("sevaSadhuBhojan", "साधु संतों को भोजन"),
      siteImage("sevaHawan", "हवन सेवा"),
      siteImage("sevaSarovarDeepdaan", "सरोवर दीपदान"),
    ],
  },
  {
    title: "Plan — बेसिक",
    description: "Plan card की मुख्य फोटो एवं plan detail page का step-by-step slideshow।",
    livePage: "/plan/basic",
    slots: [
      siteImage("planBasicHero", "Card व Slide 1 — मुख्य फोटो"),
      siteImage("planBasicSankalp", "Slide 2 — संकल्प"),
      siteImage("planBasicSeva", "Slide 3 — सेवा सम्पन्न"),
      siteImage("planBasicProof", "Slide 4 — WhatsApp Proof"),
    ],
  },
  {
    title: "Plan — प्रीमियम (गृह शांति)",
    description: "Plan card की मुख्य फोटो एवं plan detail page का step-by-step slideshow।",
    livePage: "/plan/grah",
    slots: [
      siteImage("planPremiumHero", "Card व Slide 1 — मुख्य फोटो"),
      siteImage("planPremiumSankalp", "Slide 2 — संकल्प"),
      siteImage("planPremiumHawan", "Slide 3 — हवन"),
      siteImage("planPremiumProof", "Slide 4 — WhatsApp Proof"),
    ],
  },
  {
    title: "Plan — वार्षिक (वार्षिक महासंकल्प)",
    description: "Plan card की मुख्य फोटो एवं plan detail page का step-by-step slideshow।",
    livePage: "/plan/varsh",
    slots: [
      siteImage("planAnnualHero", "Card व Slide 1 — मुख्य फोटो"),
      siteImage("planAnnualSankalp", "Slide 2 — संकल्प"),
      siteImage("planAnnualHawan", "Slide 3 — हवन"),
      siteImage("planAnnualProof", "Slide 4 — WhatsApp Proof"),
      siteImage("planAnnualBonus", "Slide 5 — विशेष प्रसाद"),
    ],
  },
  {
    title: "About Page — Story Carousel",
    description: "About page पर ऊपर scroll होने वाली 4 तस्वीरों की कहानी।",
    livePage: "/about",
    slots: [
      siteImage("aboutStory1", "Story 1 — पुष्कर ब्रह्मा मंदिर"),
      siteImage("aboutStory2", "Story 2 — वरिष्ठ पंडित जी"),
      siteImage("aboutStory3", "Story 3 — Proof देखता भक्त"),
      siteImage("aboutStory4", "Story 4 — पुष्कर सूर्यास्त"),
    ],
  },
  {
    title: "Location व Proof Gallery",
    description: "About page का location फोटो, और Reviews page की Proof Gallery thumbnails।",
    livePage: "/reviews",
    slots: [
      siteImage("pushkarGhat", "तीर्थ गुरु पुष्करराज (location फोटो)"),
      siteImage("proofGhat", "Proof Gallery — घाट"),
      siteImage("proofHavan", "Proof Gallery — हवन"),
      siteImage("proofGau", "Proof Gallery — गौ सेवा"),
      siteImage("proofWhatsapp", "Proof Gallery — WhatsApp"),
    ],
  },
  {
    title: "Reviews — भक्तों की फोटो",
    description:
      "अभी हर review में सिर्फ नाम के initials दिखते हैं। यहाँ से photo लगाएँ तो असली फोटो दिखेगी — photo hataayein to phir se initials dikhne lagenge.",
    livePage: "/reviews",
    slots: testimonials.map((t, i) => ({
      kind: "review" as const,
      slotKey: `review-${i + 1}` as const,
      label: `${t.n} — ${t.city}`,
      reviewIndex: i,
    })),
  },
];
