import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle, Phone, MapPin, HelpCircle, RefreshCcw } from "lucide-react";
import { SiteChrome, WHATSAPP_URL } from "@/components/site-chrome";
import { useLanguage } from "@/lib/translations";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "संपर्क करें — पुण्यता | WhatsApp, फोन एवं पता" },
      {
        name: "description",
        content: "पुण्यता से संपर्क करें — WhatsApp, फोन या पुष्कर (राजस्थान) के पते पर। सदस्यता, भुगतान और सेवा से जुड़े हर प्रश्न के लिए।",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.punyata.com/contact" }],
  }),
  component: ContactPage,
});

const COPY = {
  hindi: {
    eyebrow: "संपर्क",
    title: "हम आपकी बात सुनने के लिए हैं",
    sub: "सदस्यता, भुगतान, संकल्प या प्रमाण — कोई भी प्रश्न हो, सीधे हमसे पूछें।",
    waT: "WhatsApp (सबसे तेज़)",
    waD: "अपना पंजीकृत मोबाइल नंबर बताकर लिखें। हमारी टीम जल्द उत्तर देती है।",
    waC: "WhatsApp पर चैट करें",
    phT: "फोन",
    phD: "सीधे बात करने के लिए कॉल करें।",
    adT: "पता",
    adD: "तीर्थ गुरु पुष्करराज, राजस्थान — 305022",
    quick: "जल्दी उत्तर चाहिए?",
    faq: "सामान्य प्रश्न",
    faqD: "सबसे ज़्यादा पूछे जाने वाले प्रश्नों के उत्तर",
    ref: "Refund / रद्द करना",
    refD: "कब और कैसे — पूरी जानकारी",
  },
  english: {
    eyebrow: "Contact",
    title: "We're here to listen",
    sub: "Subscription, payment, sankalp or proof — whatever your question, ask us directly.",
    waT: "WhatsApp (fastest)",
    waD: "Write with your registered mobile number. Our team replies quickly.",
    waC: "Chat on WhatsApp",
    phT: "Phone",
    phD: "Call to speak with us directly.",
    adT: "Address",
    adD: "Tirth Guru Pushkar, Rajasthan — 305022",
    quick: "Need a quick answer?",
    faq: "FAQ",
    faqD: "Answers to the most common questions",
    ref: "Refund / Cancellation",
    refD: "When and how — full details",
  },
} as const;

function ContactPage() {
  const lang = useLanguage();
  const c = COPY[lang];
  return (
    <SiteChrome>
      <main className="max-w-2xl mx-auto px-4 pb-16 pt-6 space-y-6">
        <header className="text-center space-y-2">
          <div className="text-xs font-bold uppercase tracking-widest text-brand">{c.eyebrow}</div>
          <h1 className="text-3xl font-bold">{c.title}</h1>
          <p className="text-[15px] text-muted-foreground">{c.sub}</p>
        </header>

        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="card-soft card-lift flex items-center gap-4 p-5 border border-whatsapp/30"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-whatsapp text-white">
            <MessageCircle size={26} />
          </span>
          <span className="min-w-0">
            <span className="block font-bold text-foreground">{c.waT}</span>
            <span className="block text-sm text-muted-foreground">{c.waD}</span>
            <span className="mt-1.5 inline-block text-sm font-bold text-whatsapp">{c.waC} →</span>
          </span>
        </a>

        <div className="grid gap-4 sm:grid-cols-2">
          <a href="tel:+917014098548" className="card-soft card-lift p-5 space-y-1.5">
            <Phone size={22} className="text-brand" />
            <div className="font-bold">{c.phT}</div>
            <div className="text-sm text-muted-foreground">{c.phD}</div>
            <div className="text-sm font-bold text-brand">+91 70140 98548</div>
          </a>
          <div className="card-soft p-5 space-y-1.5">
            <MapPin size={22} className="text-brand" />
            <div className="font-bold">{c.adT}</div>
            <div className="text-sm text-muted-foreground">{c.adD}</div>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-center text-sm font-bold uppercase tracking-widest text-brand">{c.quick}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link to="/faq" className="card-soft card-lift flex items-center gap-3 p-4">
              <HelpCircle size={20} className="shrink-0 text-brand" />
              <span>
                <span className="block text-sm font-bold">{c.faq}</span>
                <span className="block text-xs text-muted-foreground">{c.faqD}</span>
              </span>
            </Link>
            <Link to="/refund-policy" className="card-soft card-lift flex items-center gap-3 p-4">
              <RefreshCcw size={20} className="shrink-0 text-brand" />
              <span>
                <span className="block text-sm font-bold">{c.ref}</span>
                <span className="block text-xs text-muted-foreground">{c.refD}</span>
              </span>
            </Link>
          </div>
        </section>
      </main>
    </SiteChrome>
  );
}
