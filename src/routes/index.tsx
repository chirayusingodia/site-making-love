import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  MessageCircle,
  X,
  Shield,
  Video,
  Ban,
  Star,
  Youtube,
  Instagram,
  Lock,
} from "lucide-react";
import heroImg from "@/assets/pushkar-hero.jpg";
import havanImg from "@/assets/havan.jpg";
import gauSevaImg from "@/assets/gau-seva.jpg";
import pushkarGhatImg from "@/assets/pushkar-ghat.jpg";

const WHATSAPP_NUMBER = "+91 99999 99999";
const WHATSAPP_URL =
  "https://wa.me/919999999999?text=%E0%A4%9C%E0%A4%AF%20%E0%A4%B8%E0%A4%BF%E0%A4%AF%E0%A4%BE%E0%A4%B0%E0%A4%BE%E0%A4%AE%20%F0%9F%99%8F%F0%9F%8F%BB%20%E0%A4%AE%E0%A5%81%E0%A4%9D%E0%A5%87%20%E0%A4%AA%E0%A5%81%E0%A4%A3%E0%A5%8D%E0%A4%AF%E0%A4%AE%20%E0%A4%B8%E0%A5%87%E0%A4%B5%E0%A4%BE%20%E0%A4%B8%E0%A5%87%20%E0%A4%9C%E0%A5%81%E0%A4%A1%E0%A4%BC%E0%A4%A8%E0%A4%BE%20%E0%A4%B9%E0%A5%88";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "पुण्यम सेवा — मासिक संकल्प से जुड़ें | Sundarkand, Havan & Gau Seva" },
      {
        name: "description",
        content:
          "पुष्कर से आपके नाम और गोत्र से मासिक सुंदरकांड पाठ, गृह शांति हवन, गौ सेवा, वानर सेवा एवं ब्राह्मण भोज। प्रत्येक अनुष्ठान का Video Proof सीधे WhatsApp पर।",
      },
      { property: "og:title", content: "पुण्यम सेवा — मासिक सेवा योगदान" },
      {
        property: "og:description",
        content: "सनातन सेवा का सामूहिक यज्ञ। पूर्ण पारदर्शिता के साथ मासिक संकल्प।",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: HomePage,
});

const sevas = [
  {
    num: "1",
    title: "सुंदरकांड पाठ",
    desc: "आपके नाम एवं गोत्र से संकल्पपूर्वक सस्वर सुंदरकांड पाठ — श्री हनुमान जी की कृपा हेतु।",
    quote: "जय जय जय हनुमान गोसाईं।",
  },
  {
    num: "2",
    title: "गृह शांति हवन",
    desc: "विद्वान आचार्यों द्वारा वैदिक मंत्रों से गृह शांति हवन — आपके परिवार की मंगल कामना सहित।",
    quote: "ॐ स्वाहा — अग्निदेव शुद्धि के साक्षी।",
  },
  {
    num: "3",
    title: "गौ माता सेवा",
    desc: "स्थानीय गौशालाओं में गौ माता को हरा चारा एवं गुड़ का अर्पण — सीधा पुण्य।",
    quote: "गावो विश्वस्य मातरः।",
  },
  {
    num: "4",
    title: "वानर सेवा",
    desc: "पुष्कर के पवित्र स्थलों पर वानरों को फल एवं चना — श्री हनुमान जी के प्रिय।",
    quote: "हनुमान सम नहिं बड़भागी।",
  },
  {
    num: "5",
    title: "ब्राह्मण भोजन",
    desc: "विद्वान ब्राह्मणों को सात्विक भोजन एवं यथायोग्य सत्कार — पितृ आशीर्वाद।",
    quote: "ब्राह्मणो भोजितो येन तेन तृप्ताः पितामहाः।",
  },
];

const plans = [
  {
    id: "basic",
    name: "मूल संकल्प",
    price: "₹251",
    cycle: "/ माह",
    tagline: "हर घर तक राम नाम",
    highlight: false,
    saving: null as string | null,
    features: [
      "मासिक सुंदरकांड पाठ (आपके नाम एवं गोत्र से)",
      "गौ माता सेवा — हरा चारा",
      "वानर सेवा — फल एवं चना",
      "ब्राह्मण भोजन",
      "परिवार के 4 सदस्यों तक का संकल्प",
      "हर अनुष्ठान का Video Proof — WhatsApp पर",
    ],
  },
  {
    id: "grah",
    name: "गृह शांति",
    price: "₹401",
    cycle: "/ माह",
    tagline: "सबसे लोकप्रिय",
    highlight: true,
    saving: null,
    features: [
      "मासिक सुंदरकांड पाठ",
      "गृह शांति हवन (हर माह)",
      "हर शनिवार विशेष सेवा (हर माह)",
      "गौ सेवा + वानर सेवा + ब्राह्मण भोजन",
      "परिवार के 4 सदस्यों तक का संकल्प",
      "हर अनुष्ठान का Video Proof",
    ],
  },
  {
    id: "varsh",
    name: "वार्षिक महासंकल्प",
    price: "₹4001",
    cycle: "/ वर्ष",
    tagline: "सर्वाधिक पुण्यदायी",
    highlight: false,
    saving: "₹1000 की बचत",
    features: [
      "12 माह — सुंदरकांड पाठ",
      "गृह शांति हवन (हर माह)",
      "हर शनिवार विशेष सेवा (हर माह)",
      "गौ सेवा + वानर सेवा + ब्राह्मण भोजन",
      "परिवार के 4 सदस्यों तक का संकल्प",
      "वर्ष भर का Video Proof — WhatsApp पर",
    ],
  },
];

const journey = [
  {
    title: "मासिक संकल्प",
    desc: "अपना नाम, गोत्र एवं संकल्प साझा करें। मासिक योगदान ₹251 मात्र।",
    benefit: "केवल 2 मिनट में रजिस्ट्रेशन — कोई कागज़ी कार्यवाही नहीं।",
  },
  {
    title: "पुष्कर में अनुष्ठान",
    desc: "हमारे आचार्य आपके नाम से सुंदरकांड, हवन एवं समस्त सेवाएँ सम्पन्न करते हैं।",
    benefit: "विद्वान वैदिक ब्राह्मणों द्वारा शास्त्र-सम्मत विधि।",
  },
  {
    title: "WhatsApp पर Video Proof",
    desc: "प्रत्येक अनुष्ठान का Live या Video Proof सीधे आपके WhatsApp पर — पूर्ण पारदर्शिता।",
    benefit: "हर वीडियो में आपका नाम बोला जाता है — 100% प्रमाण।",
  },
];

const testimonials = [
  {
    q: "हर सप्ताह WhatsApp पर वीडियो देखकर मन को असीम शांति मिलती है। माँ के नाम से हवन करवाना अब संभव हो सका।",
    n: "राजेश शर्मा",
    city: "दिल्ली",
    initials: "रा",
  },
  {
    q: "व्यस्तता के कारण मैं स्वयं पुष्कर नहीं जा सकती थी। पुण्यम सेवा ने यह सम्भव कर दिया — पूर्ण पारदर्शिता के साथ।",
    n: "सुनीता वर्मा",
    city: "मुंबई",
    initials: "सु",
  },
  {
    q: "गौ-सेवा का सीधा पुण्य अब हर महीने। यह व्यवसाय नहीं, सच्ची सेवा है। जय बजरंगबली।",
    n: "अमित खंडेलवाल",
    city: "जयपुर",
    initials: "अ",
  },
  {
    q: "पिताजी की स्मृति में हर माह सुंदरकांड पाठ — और वीडियो में उनका नाम सुनकर आँखें भर आती हैं।",
    n: "मीना पटेल",
    city: "अहमदाबाद",
    initials: "मी",
  },
  {
    q: "₹251 में इतनी सेवाएँ — पहले विश्वास नहीं हुआ, लेकिन हर माह वीडियो देखकर श्रद्धा और गहरी हो गई।",
    n: "विकास तिवारी",
    city: "लखनऊ",
    initials: "वि",
  },
];

const faqs = [
  {
    q: "इतने सस्ते में कैसे करवा पा रहे हो यह सब?",
    a: "सभी के नाम का संकल्प साथ में लिया जाएगा। हर व्यक्ति का नाम और गोत्र अलग-अलग बोला जाएगा, लेकिन पंडित जी एक ही बार में सबके संकल्प सामूहिक रूप से ले लेंगे। इसीलिए यह सेवा सभी के लिए सुलभ और सस्ती रखी गई है।",
    highlighted: true,
  },
  {
    q: "पहली सेवा कब से शुरू होगी?",
    a: "सदस्यता के अगले मंगलवार/शनिवार से आपके नाम से सेवा आरम्भ हो जाती है।",
  },
  {
    q: "भुगतान कैसे होगा?",
    a: "UPI, PhonePe, GPay, Debit/Credit Card — सभी विकल्प उपलब्ध हैं। 100% सुरक्षित।",
  },
  {
    q: "क्या Video Proof सच में मिलेगा?",
    a: "हाँ। हर अनुष्ठान की वीडियो आपके WhatsApp नंबर पर भेजी जाती है — जिसमें आपका नाम बोला जाता है।",
  },
  {
    q: "रिफंड पॉलिसी क्या है?",
    a: "अगर किसी कारणवश सेवा न हो सके तो पूरा धन वापस किया जाएगा।",
  },
  {
    q: "क्या मुझे प्रत्येक सेवा का प्रमाण मिलेगा?",
    a: "जी हाँ। प्रत्येक अनुष्ठान — सुंदरकांड, हवन, गौ सेवा, वानर सेवा एवं ब्राह्मण भोज — का Live या Video Proof सीधे आपके WhatsApp पर भेजा जाता है।",
  },
  {
    q: "क्या यह कोई व्यवसाय है?",
    a: "नहीं। यह सनातन सेवा का एक सामूहिक यज्ञ है। आपकी सेवा राशि का एक-एक पैसा सीधे गौ-माता के चारे, वानरों के फल, ब्राह्मण भोज एवं अनुष्ठान सामग्री में लगाया जाता है।",
  },
  {
    q: "क्या मैं अपने माता-पिता या प्रियजनों के नाम से संकल्प ले सकता हूँ?",
    a: "अवश्य। आप अपने माता-पिता, स्वर्गीय प्रियजनों या किसी भी सदस्य के नाम और गोत्र से यह मासिक संकल्प आरंभ कर सकते हैं।",
  },
  {
    q: "क्या मैं किसी भी समय योगदान रोक सकता हूँ?",
    a: "जी हाँ, बिना किसी शुल्क या प्रश्न के आप अपना मासिक योगदान कभी भी रोक सकते हैं।",
  },
];

function WhatsAppIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.52 3.48A11.94 11.94 0 0 0 12.05 0C5.5 0 .15 5.34.15 11.9c0 2.1.55 4.14 1.6 5.95L0 24l6.31-1.66a11.9 11.9 0 0 0 5.74 1.46h.01c6.55 0 11.9-5.34 11.9-11.9 0-3.18-1.24-6.17-3.44-8.42ZM12.06 21.8h-.01a9.86 9.86 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.38a9.85 9.85 0 0 1-1.51-5.26C2.17 6.44 6.6 2 12.06 2c2.64 0 5.12 1.03 6.98 2.9a9.81 9.81 0 0 1 2.89 6.99c0 5.46-4.44 9.91-9.87 9.91Zm5.43-7.42c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15s-.77.96-.95 1.16c-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.21 5.08 4.5.71.31 1.27.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  );
}

function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [waOpen, setWaOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-saffron/20 pb-32 md:pb-0">
      {/* Subtle mandala texture overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.04] -z-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(180,90,30,0.5) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* Nav */}
      <nav
        className={`sticky top-0 z-40 transition-all ${
          scrolled
            ? "bg-cream/85 backdrop-blur-xl border-b border-saffron/25 shadow-sm"
            : "bg-cream/60 backdrop-blur-md border-b border-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex justify-between items-center gap-3">
          <a
            href="#top"
            className="font-display font-extrabold text-lg md:text-xl tracking-tight text-saffron uppercase shrink-0"
          >
            🚩 पुण्यम सेवा
          </a>
          <div className="hidden md:flex gap-6 text-sm font-medium tracking-wide uppercase opacity-80">
            <a href="#sundarkand" className="hover:text-saffron transition-colors">सुंदरकांड</a>
            <a href="#sevas" className="hover:text-saffron transition-colors">सेवाएँ</a>
            <a href="#packages" className="hover:text-saffron transition-colors">योजनाएँ</a>
            <a href="#journey" className="hover:text-saffron transition-colors">प्रक्रिया</a>
            <a href="#faq" className="hover:text-saffron transition-colors">प्रश्न</a>
          </div>
          <a
            href="#packages"
            className="bg-gradient-to-r from-saffron to-[oklch(0.68_0.2_40)] text-white px-4 md:px-5 py-2 rounded-full text-xs md:text-sm font-semibold hover:shadow-lg hover:shadow-saffron/40 transition-all shrink-0"
          >
            अभी जुड़ें →
          </a>
        </div>
        <div className="md:hidden flex gap-4 overflow-x-auto px-4 pb-2 text-xs font-medium uppercase tracking-wide opacity-80 scrollbar-none">
          <a href="#sundarkand" className="whitespace-nowrap hover:text-saffron">सुंदरकांड</a>
          <a href="#sevas" className="whitespace-nowrap hover:text-saffron">सेवाएँ</a>
          <a href="#packages" className="whitespace-nowrap hover:text-saffron">योजनाएँ</a>
          <a href="#journey" className="whitespace-nowrap hover:text-saffron">प्रक्रिया</a>
          <a href="#faq" className="whitespace-nowrap hover:text-saffron">प्रश्न</a>
        </div>
      </nav>

      {/* Hero */}
      <section id="top" className="relative px-6 pt-14 md:pt-20 pb-16 md:pb-20 text-center overflow-hidden">
        <div className="max-w-4xl mx-auto animate-incense">
          <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 rounded-full px-4 py-1.5 text-xs md:text-sm font-semibold mb-6">
            <span className="size-2 rounded-full bg-green-500 animate-pulse" />
            अभी 1,200+ परिवार इस सेवा से जुड़े हैं
          </div>

          <span className="font-mono text-xs uppercase tracking-[0.3em] text-gold mb-4 block">
            🚩 जय सियाराम • पुष्कर राज से
          </span>

          <h1 className="font-display font-extrabold text-5xl md:text-7xl lg:text-[5.5rem] leading-[1.05] mb-6 text-balance">
            <span className="text-deep">हर घर में सुंदरकांड,</span>
            <br />
            <span className="inline-flex items-center gap-3 justify-center">
              <span className="bg-gradient-to-r from-saffron via-[oklch(0.7_0.2_40)] to-gold bg-clip-text text-transparent">
                हर मन में राम।
              </span>
              <span className="text-3xl md:text-5xl animate-flame inline-block">🪔</span>
            </span>
          </h1>

          <p className="text-base md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 text-pretty leading-relaxed">
            व्यस्तता के कारण स्वयं अनुष्ठान नहीं कर पाते? संस्थान आपके{" "}
            <span className="text-foreground font-medium">नाम एवं गोत्र</span> से पुष्कर में मासिक
            सुंदरकांड पाठ, गृह शांति हवन, गौ सेवा एवं ब्राह्मण भोज सम्पन्न करवाता है।
          </p>

          <div className="flex flex-col items-center gap-5">
            <a
              href="#packages"
              className="bg-gradient-to-r from-saffron to-[oklch(0.66_0.2_38)] text-white px-8 py-4 rounded-2xl text-lg font-bold shadow-xl shadow-saffron/30 hover:shadow-saffron/50 hover:-translate-y-0.5 transition-all"
            >
              योजना चुनें — ₹251 से शुरू →
            </a>

            <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 text-xs md:text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Lock size={14} className="text-saffron" /> 100% Secure Payment
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Video size={14} className="text-saffron" /> Video Proof हर माह
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Ban size={14} className="text-saffron" /> कोई Commitment नहीं
              </span>
            </div>
          </div>
        </div>

        <div className="mt-12 max-w-6xl mx-auto rounded-3xl overflow-hidden ring-1 ring-black/5 shadow-2xl animate-incense [animation-delay:200ms]">
          <img
            src={heroImg}
            alt="पुष्कर सरोवर — सूर्योदय के समय मंदिर एवं घाट"
            width={1920}
            height={896}
            className="w-full aspect-[21/9] object-cover"
          />
        </div>
      </section>

      {/* Manifesto strip */}
      <section className="px-6 py-10">
        <div className="max-w-3xl mx-auto text-center">
          <p className="font-display text-2xl md:text-3xl leading-relaxed text-balance text-deep">
            "यह कोई व्यवसाय नहीं — यह सनातन सेवा का{" "}
            <span className="text-saffron">सामूहिक यज्ञ</span> है।"
          </p>
          <p className="font-mono text-xs uppercase tracking-[0.3em] mt-6 opacity-50">
            पूर्ण पारदर्शिता • हर पैसे का हिसाब • Video Proof
          </p>
        </div>
      </section>

      {/* Sundarkand */}
      <section
        id="sundarkand"
        className="px-6 py-14 bg-deep text-cream relative overflow-hidden"
      >
        {/* Mandala watermark */}
        <div
          aria-hidden
          className="absolute -right-32 -top-32 w-[36rem] h-[36rem] opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,200,120,0.8) 0, transparent 60%), conic-gradient(from 0deg, rgba(255,200,120,0.4), transparent 30%, rgba(255,200,120,0.4) 60%, transparent 90%)",
            borderRadius: "50%",
          }}
        />
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center relative">
          <div className="rounded-3xl overflow-hidden ring-1 ring-gold/20 shadow-2xl order-2 lg:order-1">
            <img
              src={pushkarGhatImg}
              alt="पुष्कर घाट — सूर्योदय के समय दीप अर्पण एवं आरती"
              width={1920}
              height={1080}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="order-1 lg:order-2">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-gold block mb-4">
              🚩 सुंदरकांड का महात्म्य
            </span>
            <h2 className="font-display font-extrabold text-3xl md:text-5xl leading-[1.15] mb-6 text-balance">
              जहाँ सुंदरकांड,
              <br />
              <span className="text-saffron">वहाँ संकट का नाश।</span>
            </h2>

            <blockquote className="border-l-4 border-saffron pl-5 py-1 mb-6 italic font-display text-gold text-lg md:text-xl leading-relaxed">
              "सुंदरकांड का पाठ करने वाले के घर में न दरिद्रता रहती है, न रोग, न शोक, न भय।"
            </blockquote>

            <p className="text-lg leading-relaxed opacity-90 mb-5">
              श्री राम चरितमानस का सुंदरकांड — एकमात्र ऐसा कांड है जिसमें श्री हनुमान जी ने स्वयं
              अपने पराक्रम से असंभव को संभव कर दिखाया। यह पाठ साक्षात हनुमान जी का आवाहन है —
              बिगड़े काम बनते हैं, ग्रह दोष शांत होते हैं, और परिवार में सकारात्मक ऊर्जा का संचार
              होता है। मंगलवार एवं शनिवार को इसका पाठ विशेष फलदायी माना गया है।
            </p>

            <div className="mt-8 p-6 rounded-2xl bg-gradient-to-br from-saffron/15 to-gold/10 border border-saffron/40 shadow-inner">
              <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-gold mb-3">
                आज के समय में सुंदरकांड की लागत
              </div>
              <div className="flex items-baseline gap-4 flex-wrap mb-4">
                <span className="font-display text-4xl md:text-5xl font-extrabold text-saffron">
                  ₹7,000–11,000
                </span>
                <span className="text-xs uppercase tracking-wider opacity-70">
                  सामान्य आचार्य शुल्क
                </span>
              </div>
              <p className="leading-relaxed opacity-90 mb-4">
                आज एक बार सुंदरकांड का पाठ अपने घर पर करवाने में ₹7,000 से ₹11,000 तक खर्च आता है —
                आचार्य, सामग्री, प्रसाद, दक्षिणा सब मिलाकर।
              </p>
              <p className="leading-relaxed text-gold font-medium">
                इसलिए श्री हनुमान जी की कृपा से हमने संकल्प लिया — यह पुण्य हर घर तक पहुँचे।
                सामूहिक संकल्प के माध्यम से{" "}
                <span className="text-saffron font-bold">मात्र ₹251</span> में आपके नाम और गोत्र से
                सुंदरकांड पाठ।
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Daan in Pushkar */}
      <section className="px-6 py-14">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">
              पुष्कर में दान का माहात्म्य
            </span>
            <h2 className="font-display font-bold text-3xl md:text-5xl leading-tight mb-6 text-balance">
              तीर्थराज पुष्कर —<br />
              <span className="text-saffron">जहाँ एक दान, सहस्र पुण्य।</span>
            </h2>
            <div className="h-1 w-20 bg-gold mx-auto" />
          </div>

          <p className="text-lg leading-relaxed text-muted-foreground max-w-3xl mx-auto text-center mb-12">
            पद्म पुराण के अनुसार पुष्कर समस्त तीर्थों का राजा है — स्वयं ब्रह्मा जी का यज्ञ
            स्थल। यहाँ किया गया एक दान अन्य स्थानों पर किए सहस्र दानों के समान फलदायी होता है।
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Gau Mata */}
            <div className="group rounded-2xl overflow-hidden border border-border bg-cream hover:-translate-y-1 hover:shadow-xl hover:shadow-saffron/10 transition-all">
              <div className="aspect-[16/9] overflow-hidden">
                <img
                  src={gauSevaImg}
                  alt="गौ माता को हरा चारा"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  loading="lazy"
                />
              </div>
              <div className="p-6">
                <div className="text-3xl mb-3">🐄</div>
                <h3 className="font-display font-bold text-xl md:text-2xl mb-3">
                  गौ माता को हरा चारा
                </h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-4">
                  शास्त्रों में गौ माता में तैंतीस कोटि देवताओं का वास माना गया है। हरा चारा अर्पण
                  करने से पितृ दोष शांत होते हैं, लक्ष्मी का वास होता है, संतान सुख की प्राप्ति
                  होती है।
                </p>
                <p className="italic font-display text-saffron text-sm md:text-base border-l-2 border-saffron pl-3">
                  "गावो विश्वस्य मातरः" — गाय ही सम्पूर्ण विश्व की माता हैं।
                </p>
              </div>
            </div>

            {/* Vanar */}
            <div className="group rounded-2xl overflow-hidden border border-saffron/40 bg-saffron/5 hover:-translate-y-1 hover:shadow-xl hover:shadow-saffron/20 transition-all">
              <div className="aspect-[16/9] overflow-hidden">
                <img
                  src={havanImg}
                  alt="वानर सेवा — मंगलवार"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  loading="lazy"
                />
              </div>
              <div className="p-6">
                <div className="text-3xl mb-3">🍌</div>
                <h3 className="font-display font-bold text-xl md:text-2xl mb-3">
                  मंगलवार को वानरों को केला
                </h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-3">
                  मंगलवार श्री हनुमान जी का दिन है। इस दिन वानरों को केला, चना और गुड़ खिलाना
                  साक्षात हनुमान जी की सेवा मानी जाती है। मंगल दोष शांत होते हैं, साहस और बल की
                  वृद्धि होती है।
                </p>
                <p className="italic font-display text-saffron text-sm md:text-base border-l-2 border-saffron pl-3">
                  "हनुमान सम नहिं बड़भागी" — हर मंगलवार आपके नाम से वानर सेवा।
                </p>
              </div>
            </div>
          </div>

          <p className="text-center mt-12 font-display text-xl md:text-2xl text-deep leading-relaxed text-balance">
            "जो स्वयं नहीं जा सकते — उनके नाम का संकल्प हम पुष्कर तक पहुँचाते हैं।
            <span className="text-saffron"> पुण्य आपका, सेवा हमारी।</span>"
          </p>
        </div>
      </section>

      {/* Sevas */}
      <section id="sevas" className="px-6 py-14 bg-cream">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12 max-w-2xl">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">
              आपकी मासिक सेवाएँ
            </span>
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4">
              पाँच पवित्र अनुष्ठान — पूरे परिवार के लिए
            </h2>
            <div className="h-1 w-20 bg-gold" />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {sevas.map((s) => (
              <div
                key={s.num}
                className="group bg-background p-7 rounded-2xl border border-border hover:border-saffron/40 hover:-translate-y-1 hover:shadow-xl hover:shadow-saffron/10 transition-all"
              >
                <div className="relative size-14 mb-5">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-saffron to-gold rotate-6 opacity-90 group-hover:rotate-12 transition-transform" />
                  <div className="relative size-14 rounded-2xl bg-gradient-to-br from-saffron to-[oklch(0.66_0.2_38)] flex items-center justify-center text-white font-display text-2xl font-extrabold shadow-lg shadow-saffron/30">
                    {s.num}
                  </div>
                </div>
                <h3 className="font-display text-xl font-bold mb-3">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground mb-4">{s.desc}</p>
                <p className="italic text-xs text-saffron/90 border-l-2 border-saffron/40 pl-3">
                  {s.quote}
                </p>
              </div>
            ))}
          </div>

          {/* Full-width family banner */}
          <div className="mt-10 rounded-2xl bg-gradient-to-r from-saffron via-[oklch(0.66_0.2_38)] to-saffron text-white p-6 md:p-8 shadow-xl shadow-saffron/25 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-80 mb-2">
                ✨ परिवार सहित संकल्प
              </div>
              <h3 className="font-display font-extrabold text-xl md:text-2xl leading-snug">
                हर योजना में परिवार के 4 सदस्यों तक का नाम सम्मिलित
              </h3>
              <p className="text-sm opacity-90 mt-1">
                माता, पिता, पत्नी, संतान — सबके नाम एवं गोत्र से एक साथ संकल्प।
              </p>
            </div>
            <a
              href="#packages"
              className="bg-white text-saffron px-6 py-3 rounded-xl font-bold text-sm whitespace-nowrap hover:bg-cream transition-colors shadow-lg"
            >
              योजना देखें →
            </a>
          </div>
        </div>
      </section>

      {/* Packages */}
      <section id="packages" className="px-6 py-16 bg-background relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-saffron/[0.04] to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto relative">
          <div className="text-center mb-4">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">
              अपना संकल्प चुनें
            </span>
            <h2 className="font-display font-extrabold text-3xl md:text-5xl leading-[1.1] mb-4 text-balance">
              तीन पवित्र योजनाएँ —<br />
              <span className="text-saffron">हर श्रद्धा के लिए।</span>
            </h2>
            <div className="h-1 w-20 bg-gold mx-auto mb-4" />
            <div className="inline-flex items-center gap-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-3 py-1 text-xs font-semibold mb-4">
              🔥 इस माह 47 नए सदस्य जुड़े
            </div>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              हर योजना में आपके{" "}
              <span className="text-foreground font-semibold">परिवार के 4 सदस्यों तक</span> का नाम
              एवं गोत्र सम्मिलित।
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 md:gap-6 mt-12 items-stretch">
            {plans.map((p) => (
              <div
                key={p.id}
                className={`relative flex flex-col rounded-3xl p-6 md:p-8 transition-all ${
                  p.highlight
                    ? "bg-deep text-cream ring-2 ring-saffron shadow-2xl shadow-saffron/30 md:scale-[1.05] md:-translate-y-1"
                    : "bg-cream text-foreground ring-1 ring-border hover:ring-saffron/40 hover:-translate-y-1 hover:shadow-xl"
                }`}
                style={
                  p.highlight
                    ? {
                        boxShadow:
                          "0 0 0 1px oklch(0.72 0.18 50 / 0.4), 0 25px 50px -12px oklch(0.72 0.18 50 / 0.4)",
                      }
                    : undefined
                }
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-saffron to-gold text-white text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
                    ⭐ {p.tagline}
                  </span>
                )}
                {p.saving && (
                  <span className="absolute -top-3 right-4 bg-green-600 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
                    💰 {p.saving}
                  </span>
                )}
                {!p.highlight && (
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.25em] mb-3 ${
                      p.id === "varsh" ? "text-saffron" : "text-muted-foreground"
                    }`}
                  >
                    {p.tagline}
                  </span>
                )}
                <h3 className="font-display font-extrabold text-2xl mb-2">{p.name}</h3>
                <div className="flex items-baseline gap-1 mb-5">
                  <span className="font-display font-extrabold text-5xl text-saffron">
                    {p.price}
                  </span>
                  <span
                    className={`text-sm ${
                      p.highlight ? "opacity-70" : "text-muted-foreground"
                    }`}
                  >
                    {p.cycle}
                  </span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {p.features.map((f, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm leading-relaxed">
                      <span
                        className={`mt-0.5 size-5 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold ${
                          p.highlight
                            ? "bg-saffron text-white"
                            : "bg-saffron/15 text-saffron"
                        }`}
                      >
                        ✓
                      </span>
                      <span className={p.highlight ? "opacity-90" : ""}>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={`https://wa.me/919999999999?text=${encodeURIComponent(
                    `जय सियाराम 🙏🏻 मुझे ${p.name} योजना (${p.price}${p.cycle}) के लिए सदस्य बनना है।`,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold text-sm transition-all bg-gradient-to-r from-saffron to-[oklch(0.66_0.2_38)] text-white hover:shadow-xl hover:shadow-saffron/40 hover:-translate-y-0.5"
                >
                  <WhatsAppIcon className="size-4" />
                  सदस्य बनें
                </a>
              </div>
            ))}
          </div>

          <p className="text-center text-xs md:text-sm text-muted-foreground mt-8 font-mono uppercase tracking-wider">
            कभी भी रोकें • कोई प्रतिबद्धता नहीं • पूर्ण पारदर्शिता
          </p>
        </div>
      </section>

      {/* Journey */}
      <section id="journey" className="px-6 py-14 bg-cream">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">
              पुण्य की यात्रा
            </span>
            <h2 className="font-display font-bold text-3xl md:text-4xl">तीन सरल चरण</h2>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-8">
            {/* Dotted connector line */}
            <div
              aria-hidden
              className="hidden md:block absolute top-9 left-[16%] right-[16%] h-0.5"
              style={{
                backgroundImage:
                  "radial-gradient(circle, oklch(0.72 0.18 50 / 0.5) 1.5px, transparent 1.5px)",
                backgroundSize: "12px 2px",
                backgroundRepeat: "repeat-x",
              }}
            />
            {journey.map((step, i) => (
              <div
                key={i}
                className="relative bg-background rounded-2xl p-6 border border-border hover:border-saffron/40 hover:shadow-xl hover:shadow-saffron/10 transition-all flex flex-col items-center text-center"
              >
                <div className="relative mb-4">
                  <div className="size-16 md:size-18 rounded-full bg-gradient-to-br from-saffron to-[oklch(0.66_0.2_38)] text-white font-display font-extrabold text-2xl flex items-center justify-center shadow-xl shadow-saffron/40 ring-4 ring-cream">
                    {i + 1}
                  </div>
                </div>
                <h4 className="font-display font-bold text-lg md:text-xl mb-2 leading-snug">
                  {step.title}
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">{step.desc}</p>
                <p className="text-xs text-saffron font-medium italic mt-auto">{step.benefit}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="px-6 py-14">
        <div className="max-w-6xl mx-auto bg-gradient-to-br from-saffron to-[oklch(0.62_0.2_35)] text-white rounded-[2.5rem] px-6 py-12 md:px-14 md:py-14">
          <span className="font-mono text-xs uppercase tracking-[0.3em] opacity-80 block mb-3">
            भक्तों के अनुभव
          </span>
          <h2 className="font-display font-bold text-3xl md:text-4xl mb-10 max-w-2xl">
            लाखों श्रद्धालुओं की आस्था का साक्षी।
          </h2>

          {/* Mobile: horizontal scroll. Desktop: grid */}
          <div className="md:hidden flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 snap-x snap-mandatory scrollbar-none">
            {testimonials.map((t, i) => (
              <TestimonialCard t={t} key={i} mobile />
            ))}
          </div>
          <div className="hidden md:grid md:grid-cols-3 gap-6">
            {testimonials.slice(0, 3).map((t, i) => (
              <TestimonialCard t={t} key={i} />
            ))}
          </div>
          <div className="hidden md:grid md:grid-cols-2 gap-6 mt-6 max-w-4xl mx-auto">
            {testimonials.slice(3).map((t, i) => (
              <TestimonialCard t={t} key={i + 3} />
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-14">
        <div className="text-center mb-10">
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">
            शंका समाधान
          </span>
          <h2 className="font-display font-bold text-3xl md:text-4xl">
            अक्सर पूछे जाने वाले प्रश्न
          </h2>
        </div>
        <div className="space-y-2">
          {faqs.map((f, i) => {
            const open = openFaq === i;
            return (
              <button
                key={i}
                onClick={() => setOpenFaq(open ? null : i)}
                className={`w-full text-left rounded-xl px-5 py-5 transition-all ${
                  open
                    ? "bg-saffron/5 border-l-4 border-saffron shadow-sm"
                    : "border-l-4 border-transparent hover:bg-cream/60"
                } ${
                  f.highlighted && !open
                    ? "bg-saffron/5 border-l-saffron/40"
                    : ""
                }`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    {f.highlighted && (
                      <span className="bg-saffron text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0">
                        लोकप्रिय
                      </span>
                    )}
                    <h4 className="font-display font-bold text-base md:text-lg">{f.q}</h4>
                  </div>
                  <span
                    className={`text-saffron text-2xl shrink-0 transition-transform ${
                      open ? "rotate-45" : ""
                    }`}
                  >
                    +
                  </span>
                </div>
                {open && (
                  <p className="text-muted-foreground mt-3 leading-relaxed text-pretty text-sm md:text-base">
                    {f.a}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Final CTA */}
      <section id="subscribe" className="px-6 py-14">
        <div className="max-w-4xl mx-auto rounded-[2.5rem] p-12 md:p-16 text-center relative overflow-hidden text-white"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.55 0.2 45) 0%, oklch(0.42 0.18 35) 60%, oklch(0.32 0.15 30) 100%)",
          }}
        >
          {/* Om watermark */}
          <div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.08]"
          >
            <span className="text-[22rem] md:text-[28rem] leading-none font-display">🕉️</span>
          </div>

          <div className="relative">
            <div className="font-mono text-xs uppercase tracking-[0.3em] text-gold mb-6">
              🚩 जय श्री राम • जय बजरंगबली 🚩
            </div>
            <h2 className="font-display font-extrabold text-3xl md:text-5xl mb-6 leading-tight text-balance">
              अखंड पुण्य के भागीदार बनें।
            </h2>
            <p className="opacity-90 max-w-xl mx-auto mb-10 leading-relaxed">
              ₹251 मासिक से शुरू — सुंदरकांड, गृह शांति हवन, गौ सेवा, वानर सेवा एवं ब्राह्मण भोजन।
              परिवार के 4 सदस्यों तक का संकल्प। हर अनुष्ठान का Video Proof आपके WhatsApp पर।
            </p>
            <a
              href="#packages"
              className="inline-flex items-center gap-2 bg-white text-saffron px-10 py-5 rounded-xl text-lg font-extrabold hover:scale-105 transition-transform shadow-2xl"
            >
              अपनी योजना चुनें →
            </a>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-70 mt-8">
              कोई प्रतिबद्धता नहीं • कभी भी रोकें • पूर्ण पारदर्शिता
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-border bg-cream/40">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8 text-sm">
          <div>
            <div className="font-display font-extrabold text-xl text-saffron mb-2">
              🚩 पुण्यम सेवा
            </div>
            <p className="text-muted-foreground leading-relaxed">
              सनातन सेवा का सामूहिक यज्ञ — पुष्कर राज से, आपके परिवार तक।
            </p>
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              पंजीकृत संस्थान • पुष्कर राज • राजस्थान 305022
            </p>
          </div>

          <div>
            <div className="font-display font-bold text-foreground mb-3">संपर्क करें</div>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-[#25D366] font-semibold hover:underline"
            >
              <WhatsAppIcon className="size-4" />
              {WHATSAPP_NUMBER}
            </a>
            <p className="text-xs text-muted-foreground mt-2">WhatsApp पर 24×7 उपलब्ध</p>
            <div className="flex items-center gap-3 mt-4">
              <a
                href={WHATSAPP_URL}
                aria-label="WhatsApp"
                className="size-9 rounded-full bg-[#25D366]/10 text-[#25D366] flex items-center justify-center hover:bg-[#25D366] hover:text-white transition-colors"
              >
                <WhatsAppIcon className="size-4" />
              </a>
              <a
                href="#"
                aria-label="YouTube"
                className="size-9 rounded-full bg-red-100 text-red-600 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors"
              >
                <Youtube size={16} />
              </a>
              <a
                href="#"
                aria-label="Instagram"
                className="size-9 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center hover:bg-pink-600 hover:text-white transition-colors"
              >
                <Instagram size={16} />
              </a>
            </div>
          </div>

          <div>
            <div className="font-display font-bold text-foreground mb-3">सुरक्षा एवं भुगतान</div>
            <div className="inline-flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2 text-xs">
              <Shield size={14} className="text-green-600" />
              <span>Razorpay द्वारा सुरक्षित भुगतान</span>
            </div>
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              UPI • PhonePe • GPay • Debit/Credit Card — सभी विकल्प उपलब्ध।
            </p>
          </div>
        </div>

        <div className="max-w-5xl mx-auto mt-8 pt-6 border-t border-border text-center font-mono text-[10px] tracking-[0.3em] uppercase opacity-50">
          © 2026 पुण्यम सेवा संस्थान • पुष्कर राज • राजस्थान
        </div>
      </footer>

      {/* Sticky mobile bottom bar */}
      <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md bg-background/95 backdrop-blur-xl border border-saffron/30 rounded-2xl p-3 pl-5 shadow-2xl z-50 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
            परिवार सहित संकल्प
          </div>
          <div className="font-display text-lg font-extrabold text-saffron leading-none mt-0.5">
            ₹251 <span className="text-xs font-normal text-foreground">से शुरू</span>
          </div>
        </div>
        <a
          href="#packages"
          className="bg-gradient-to-r from-saffron to-[oklch(0.66_0.2_38)] text-white px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap shadow-lg shadow-saffron/30"
        >
          अभी जुड़ें →
        </a>
      </div>

      {/* Floating WhatsApp button */}
      <div className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-[60] flex flex-col items-end gap-3">
        {waOpen && (
          <div className="animate-incense bg-background border border-saffron/30 shadow-2xl rounded-2xl p-4 pr-3 max-w-[18rem] relative">
            <button
              onClick={() => setWaOpen(false)}
              aria-label="बंद करें"
              className="absolute top-2 right-2 size-6 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
            >
              <X size={14} />
            </button>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-saffron mb-2">
              जय सियाराम 🙏🏻
            </div>
            <p className="text-sm leading-relaxed text-foreground mb-4 pr-4">
              आप हमसे WhatsApp पर भी जुड़ सकते हैं — नि:संकोच संपर्क करें, हम आपकी सेवा में
              उपस्थित हैं।
            </p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-[#25D366] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity w-full justify-center"
            >
              <MessageCircle size={16} />
              WhatsApp पर जुड़ें
            </a>
          </div>
        )}
        <button
          onClick={() => setWaOpen((v) => !v)}
          aria-label="WhatsApp पर संपर्क करें"
          className="group inline-flex items-center gap-2 bg-[#25D366] text-white pl-3 pr-4 py-3 rounded-full shadow-2xl shadow-[#25D366]/40 hover:scale-105 transition-transform ring-4 ring-white/40 font-bold text-sm"
        >
          <WhatsAppIcon className="size-5" />
          <span className="hidden sm:inline">💬 जुड़ें</span>
        </button>
      </div>
    </div>
  );
}

function TestimonialCard({
  t,
  mobile = false,
}: {
  t: { q: string; n: string; city: string; initials: string };
  mobile?: boolean;
}) {
  return (
    <div
      className={`bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20 ${
        mobile ? "min-w-[85%] snap-center" : ""
      }`}
    >
      <div className="flex items-center gap-1 mb-3 text-gold">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={14} fill="currentColor" strokeWidth={0} />
        ))}
      </div>
      <p className="text-base md:text-lg font-display leading-relaxed mb-5">"{t.q}"</p>
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full bg-white text-saffron font-display font-extrabold flex items-center justify-center shadow-md">
          {t.initials}
        </div>
        <div>
          <div className="font-semibold text-sm">{t.n}</div>
          <div className="font-mono text-[10px] opacity-80 uppercase tracking-wider">
            {t.city}
          </div>
        </div>
      </div>
    </div>
  );
}
