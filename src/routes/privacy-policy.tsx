import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock, ShieldCheck } from "lucide-react";
import { SiteChrome, WHATSAPP_URL } from "@/components/site-chrome";
import { useLanguage } from "@/lib/translations";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — पुण्यता | आपकी जानकारी सुरक्षित" },
      {
        name: "description",
        content:
          "पुण्यता आपकी कौन-सी जानकारी लेता है, क्यों लेता है, किसके साथ साझा करता है और आप उसे कैसे हटवा सकते हैं।",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.punyata.com/privacy-policy" }],
  }),
  component: PrivacyPage,
});

type Section = { h: string; p?: string; items?: string[] };

const CONTENT: Record<"hindi" | "english", { title: string; date: string; intro: string; sections: Section[]; contactH: string; contactP: string; cta: string; refund: string }> = {
  hindi: {
    title: "गोपनीयता नीति (Privacy Policy)",
    date: "प्रभावी तिथि: 21 अक्टूबर 2026",
    intro:
      "पुण्यता आपके नाम और गोत्र से संकल्प लेकर सेवा करता है, इसलिए आपकी जानकारी हमारे लिए पवित्र अमानत है। यह पेज सरल भाषा में बताता है कि हम क्या लेते हैं और उसका क्या करते हैं।",
    sections: [
      {
        h: "1. हम कौन-सी जानकारी लेते हैं",
        items: [
          "आपका नाम, मोबाइल नंबर और (Google से लॉगिन करने पर) ईमेल।",
          "संकल्प हेतु परिवार के सदस्यों के नाम, गोत्र एवं संबंधित विवरण।",
          "आपकी सदस्यता, भुगतान की स्थिति एवं सेवा का इतिहास।",
          "WhatsApp पर हुई बातचीत की स्थिति (संदेश भेजने के लिए आवश्यक सहमति सहित)।",
          "वेबसाइट उपयोग की सामान्य जानकारी — कौन-सा पेज देखा, किस लिंक/विज्ञापन से आए।",
        ],
      },
      {
        h: "2. हम इसका उपयोग कैसे करते हैं",
        items: [
          "आपके नाम एवं गोत्र से संकल्प लेना और मासिक सेवा सम्पन्न करना।",
          "Video/Photo Proof और आशीर्वाद पत्र आपको WhatsApp पर भेजना।",
          "भुगतान, रसीद और सदस्यता से जुड़ी सूचनाएं एवं सहायता देना।",
          "वेबसाइट को बेहतर बनाना और यह समझना कि हमारी जानकारी लोगों तक कैसे पहुँचती है।",
        ],
      },
      {
        h: "3. किसके साथ साझा होती है",
        p: "हम आपकी जानकारी बेचते नहीं हैं। केवल सेवा चलाने के लिए आवश्यक सहयोगियों के साथ यह साझा होती है:",
        items: [
          "Razorpay — भुगतान प्रक्रिया के लिए। आपके कार्ड/UPI का विवरण पुण्यता के सर्वर पर संग्रहीत नहीं होता।",
          "WhatsApp संदेश सेवा प्रदाता — प्रमाण एवं सूचनाएं भेजने के लिए।",
          "आचार्य/सेवा टीम — केवल संकल्प के लिए आवश्यक नाम और गोत्र।",
          "Meta (Facebook/Instagram) Pixel — केवल तभी जब आप विज्ञापन-संबंधी कुकीज़ की सहमति देते हैं।",
        ],
      },
      {
        h: "4. कुकीज़ एवं विज्ञापन-ट्रैकिंग",
        p: "लॉगिन और भाषा-पसंद जैसे आवश्यक कार्यों के लिए हम ब्राउज़र स्टोरेज का उपयोग करते हैं। विज्ञापन मापने वाला Meta Pixel आपकी स्पष्ट सहमति के बाद ही चालू होता है; मना करने पर वह लोड नहीं होता।",
      },
      {
        h: "5. आपके अधिकार",
        items: [
          "अपनी जानकारी देखने, सुधारने या हटवाने का अनुरोध करना।",
          "WhatsApp संदेशों की सहमति कभी भी वापस लेना।",
          "सदस्यता कभी भी रद्द करना (/my-subscription से)।",
        ],
      },
      {
        h: "6. सुरक्षा एवं अवधि",
        p: "आपका डेटा सुरक्षित सर्वर पर एन्क्रिप्टेड कनेक्शन (HTTPS) के साथ रखा जाता है और केवल अधिकृत टीम सदस्य ही देख सकते हैं। सदस्यता चलने तक, तथा कानूनी/लेखा आवश्यकताओं के लिए आवश्यक अवधि तक ही हम इसे रखते हैं।",
      },
      {
        h: "7. बच्चों की जानकारी",
        p: "सदस्यता 18 वर्ष से अधिक आयु के व्यक्ति द्वारा ली जाती है। परिवार के बच्चों के नाम केवल संकल्प के उद्देश्य से अभिभावक द्वारा दिए जाते हैं।",
      },
      {
        h: "8. नीति में बदलाव",
        p: "कोई बड़ा बदलाव होने पर हम इस पेज पर नई प्रभावी तिथि के साथ अपडेट करेंगे।",
      },
    ],
    contactH: "प्रश्न या डेटा-अनुरोध?",
    contactP: "अपना पंजीकृत मोबाइल नंबर बताकर हमें WhatsApp करें — हम 24-48 घंटों में उत्तर देंगे।",
    cta: "WhatsApp पर संपर्क करें",
    refund: "Refund Policy देखें",
  },
  english: {
    title: "Privacy Policy",
    date: "Effective date: 21 October 2026",
    intro:
      "Punyata performs seva in your name and gotra, so your information is a sacred trust to us. This page explains in plain language what we collect and what we do with it.",
    sections: [
      {
        h: "1. What we collect",
        items: [
          "Your name, mobile number and (if you sign in with Google) email.",
          "Names, gotra and related details of family members for the sankalp.",
          "Your subscription, payment status and seva history.",
          "WhatsApp conversation status (including the consent needed to message you).",
          "General site usage — which pages you viewed and which link/ad brought you here.",
        ],
      },
      {
        h: "2. How we use it",
        items: [
          "To take sankalp in your name & gotra and perform your monthly seva.",
          "To send video/photo proof and your Ashirwad Patra on WhatsApp.",
          "To handle payments, receipts, subscription notices and support.",
          "To improve the website and understand how people find us.",
        ],
      },
      {
        h: "3. Who it is shared with",
        p: "We do not sell your information. It is shared only with partners needed to run the service:",
        items: [
          "Razorpay — to process payments. Your card/UPI details are not stored on Punyata's servers.",
          "Our WhatsApp messaging provider — to deliver proof and notifications.",
          "The acharya/seva team — only the name and gotra needed for the sankalp.",
          "Meta (Facebook/Instagram) Pixel — only if you consent to advertising cookies.",
        ],
      },
      {
        h: "4. Cookies & ad tracking",
        p: "We use browser storage for essentials like login and language preference. The Meta Pixel, which measures advertising, runs only after your explicit consent; if you decline, it is never loaded.",
      },
      {
        h: "5. Your rights",
        items: [
          "Request to view, correct or delete your information.",
          "Withdraw WhatsApp messaging consent at any time.",
          "Cancel your subscription anytime from /my-subscription.",
        ],
      },
      {
        h: "6. Security & retention",
        p: "Your data is kept on secured servers over encrypted connections (HTTPS) and is visible only to authorised team members. We keep it while your subscription runs and for as long as legal or accounting requirements need.",
      },
      {
        h: "7. Children's information",
        p: "Subscriptions are taken by adults (18+). Children's names are provided by a parent or guardian solely for the sankalp.",
      },
      {
        h: "8. Changes to this policy",
        p: "If we make a significant change, we will update this page with a new effective date.",
      },
    ],
    contactH: "Questions or a data request?",
    contactP: "WhatsApp us with your registered mobile number — we reply within 24–48 hours.",
    cta: "Chat on WhatsApp",
    refund: "View Refund Policy",
  },
};

function PrivacyPage() {
  const lang = useLanguage();
  const c = CONTENT[lang];
  return (
    <SiteChrome>
      <main className="max-w-2xl mx-auto px-4 pb-16 pt-6 space-y-6">
        <header className="text-center space-y-3">
          <div className="text-xs font-bold uppercase tracking-widest text-brand">Legal</div>
          <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
            <Lock size={24} className="text-brand" /> {c.title}
          </h1>
          <div className="inline-flex items-center gap-1.5 bg-brand-soft text-brand text-xs font-bold px-3 py-1.5 rounded-full">
            <ShieldCheck size={13} /> {c.date}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{c.intro}</p>
        </header>

        {c.sections.map((s) => (
          <section key={s.h} className="card-soft p-5 space-y-2.5">
            <h2 className="text-base font-bold text-[#5B1A1A]">{s.h}</h2>
            {s.p && <p className="text-sm text-foreground/80 leading-relaxed">{s.p}</p>}
            {s.items && (
              <ul className="space-y-1.5 list-disc pl-5 text-sm text-foreground/80 leading-relaxed marker:text-brand">
                {s.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section className="card-soft p-5 text-center space-y-3 border border-brand/10">
          <h2 className="text-base font-bold text-[#5B1A1A]">{c.contactH}</h2>
          <p className="text-sm text-muted-foreground">{c.contactP}</p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-whatsapp text-white text-sm font-bold px-5 py-2.5 rounded-full">
              {c.cta}
            </a>
            <Link to="/refund-policy" className="inline-flex items-center gap-2 bg-brand-soft text-brand text-sm font-bold px-5 py-2.5 rounded-full">
              {c.refund}
            </Link>
          </div>
        </section>
      </main>
    </SiteChrome>
  );
}
