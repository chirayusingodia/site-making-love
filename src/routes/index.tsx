import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  Play,
  Pause,
  Music2,
  Check,
  CheckCheck,
} from "lucide-react";
import heroImg from "@/assets/pushkar-hero.jpg";
import havanImg from "@/assets/havan.jpg";
import gauSevaImg from "@/assets/gau-seva.jpg";
import pushkarGhatImg from "@/assets/pushkar-ghat.jpg";

const WHATSAPP_NUMBER = "+91 80058 28548";
const WHATSAPP_RAW = "918005828548";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_RAW}?text=${encodeURIComponent(
  "जय सियाराम 🙏 मुझे पुण्यम सेवा से जुड़ना है।",
)}`;
const AUDIO_URL =
  "https://upload.wikimedia.org/wikipedia/commons/2/20/Hanuman_Chalisa_-_Hari_Om_Sharan.ogg";

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
      {
        property: "og:title",
        content: "पुण्यम सेवा — तीर्थ गुरु पुष्करराज से मासिक सेवा",
      },
      {
        property: "og:description",
        content: "सनातन सेवा का सामूहिक यज्ञ — पूर्ण पारदर्शिता के साथ।",
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
    desc: "तीर्थ गुरु पुष्करराज के पवित्र स्थलों पर वानरों को केला एवं चना — श्री हनुमान जी के प्रिय।",
    quote: "हनुमान सम नहिं बड़भागी।",
  },
  {
    num: "5",
    title: "ब्राह्मण भोजन",
    desc: "विद्वान ब्राह्मणों को सात्विक भोजन एवं यथायोग्य सत्कार — पितृ आशीर्वाद।",
    quote: "ब्राह्मणो भोजितो येन तेन तृप्ताः पितामहाः।",
  },
];

type Plan = {
  id: string;
  name: string;
  price: string;
  priceNum: number;
  cycle: string;
  tagline: string;
  highlight: boolean;
  saving: string | null;
  strikePrice?: string;
  features: string[];
};

const plans: Plan[] = [
  {
    id: "basic",
    name: "मूल संकल्प",
    price: "₹251",
    priceNum: 251,
    cycle: "/ माह",
    tagline: "हर घर तक राम नाम",
    highlight: false,
    saving: null,
    features: [
      "📖 सुंदरकांड पाठ — महीने के पहले मंगलवार को (आपके नाम और गोत्र सहित संकल्प)",
      "🐒 वानर सेवा — बंदरों को केला और चना",
      "🐄 गौ सेवा — गौ माता को चारा",
      "🍽️ ब्राह्मण भोजन — 5 ब्राह्मणों को भोजन",
      "📲 हर सेवा का वीडियो/फोटो प्रूफ WhatsApp पर",
      "👨‍👩‍👧‍👦 परिवार के 4 सदस्यों तक का संकल्प",
    ],
  },
  {
    id: "grah",
    name: "गृह शांति (Premium)",
    price: "₹401",
    priceNum: 401,
    cycle: "/ माह",
    tagline: "सबसे लोकप्रिय",
    highlight: true,
    saving: null,
    features: [
      "📖 सुंदरकांड पाठ — महीने में 2 बार (पहला मंगलवार + अंतिम शनिवार)",
      "🔥 गृह शांति हवन — हर महीने (अतिरिक्त सेवा)",
      "🐒 वानर सेवा + 🐄 गौ सेवा + 🍽️ ब्राह्मण भोजन",
      "👨‍👩‍👧‍👦 परिवार के 4 सदस्यों तक का संकल्प",
      "📲 सभी प्रूफ WhatsApp पर",
      "₹251 पैक की सभी सेवाएं सम्मिलित",
    ],
  },
  {
    id: "varsh",
    name: "वार्षिक महासंकल्प",
    price: "₹4101",
    priceNum: 4101,
    cycle: "/ वर्ष",
    tagline: "सर्वाधिक पुण्यदायी",
    highlight: false,
    saving: "₹711 की बचत",
    strikePrice: "₹4,812",
    features: [
      "✨ ₹401 वाले पैक की सभी सेवाएं — पूरे एक साल के लिए",
      "📖 12 माह × 2 सुंदरकांड पाठ (कुल 24 पाठ)",
      "🔥 गृह शांति हवन — हर माह (कुल 12 हवन)",
      "🐒🐄🍽️ वानर + गौ + ब्राह्मण भोजन — हर माह",
      "👨‍👩‍👧‍👦 परिवार के 4 सदस्यों तक का संकल्प",
      "💰 ₹401 × 12 = ₹4,812 की बजाय मात्र ₹4,101",
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
    title: "तीर्थ गुरु पुष्करराज में अनुष्ठान",
    desc: "हमारे आचार्य आपके नाम से सुंदरकांड, हवन एवं समस्त सेवाएँ सम्पन्न करते हैं।",
    benefit: "विद्वान वैदिक ब्राह्मणों द्वारा शास्त्र-सम्मत विधि।",
  },
  {
    title: "WhatsApp पर Video Proof",
    desc: "प्रत्येक अनुष्ठान का Live या Video Proof सीधे आपके WhatsApp पर।",
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
    q: "व्यस्तता के कारण मैं स्वयं तीर्थ गुरु पुष्करराज नहीं जा सकती थी। पुण्यम सेवा ने यह सम्भव कर दिया।",
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
    q: "पहली सेवा कब शुरू होगी?",
    a: "आपकी सदस्यता शुरू होते ही वानर सेवा, गौ सेवा और ब्राह्मण भोजन उसी सप्ताह से शुरू हो जाते हैं। सुंदरकांड पाठ हर महीने के पहले मंगलवार को होता है — अगर आप महीने के बीच में जुड़ते हैं, तो आपकी पहली सुंदरकांड सेवा अगले महीने के पहले मंगलवार को होगी। ₹401/₹4101 पैक में दूसरी सुंदरकांड सेवा उसी महीने के अंतिम शनिवार को होती है।",
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

const pandits = [
  {
    name: "पं. रामस्वरूप शर्मा",
    role: "मुख्य आचार्य — तीर्थ गुरु पुष्करराज",
    detail:
      "22 वर्षों से तीर्थ गुरु पुष्करराज में सेवारत। हवन विशेषज्ञ। काशी विद्यापीठ से वेद-शास्त्र में स्नातक।",
    quote: "सेवा ही हमारा धर्म है।",
    color: "from-saffron to-[oklch(0.6_0.2_38)]",
  },
  {
    name: "पं. विनायक जी",
    role: "सुंदरकांड प्रमुख",
    detail: "8 वर्षों से सुंदरकांड पाठ में विशेषज्ञ। सस्वर एवं संकल्प-सम्मत पाठ के आचार्य।",
    quote: "राम नाम सबसे बड़ा मंत्र।",
    color: "from-gold to-saffron",
  },
  {
    name: "पं. गोविंद प्रसाद तिवारी",
    role: "गौ सेवा एवं अनुष्ठान प्रमुख",
    detail:
      "15 वर्षों से गौशाला सेवा। वानर सेवा एवं ब्राह्मण भोज के संयोजक। स्थानीय मंदिर समिति के सदस्य।",
    quote: "गौ माता की सेवा में ही समस्त देवताओं की सेवा है।",
    color: "from-deep to-saffron",
  },
];

const gallery = [
  { label: "सुंदरकांड पाठ", grad: "from-[#FF6B35] to-[#8B1A1A]" },
  { label: "गृह शांति हवन", grad: "from-[#C9A84C] to-[#FF6B35]" },
  { label: "गौ माता सेवा", grad: "from-[#8B1A1A] to-[#C9A84C]" },
  { label: "वानर सेवा", grad: "from-[#FF6B35] to-[#C9A84C]" },
  { label: "ब्राह्मण भोजन", grad: "from-[#8B1A1A] to-[#FF6B35]" },
  { label: "विशेष संकल्प", grad: "from-[#C9A84C] to-[#8B1A1A]" },
];

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
  const [shown, setShown] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("punyam_intro_seen")) return;
    setShown(true);
    sessionStorage.setItem("punyam_intro_seen", "1");
    const fadeT = setTimeout(() => setFading(true), 1200);
    const hideT = setTimeout(() => setShown(false), 1800);
    return () => {
      clearTimeout(fadeT);
      clearTimeout(hideT);
    };
  }, []);

  if (!shown) return null;
  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-deep transition-opacity duration-700 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center gap-8">
        <div className="relative">
          <div className="diya-flame" />
          <div
            className="w-32 h-10 rounded-b-[50%] rounded-t-md"
            style={{
              background: "linear-gradient(to bottom, #C9A84C 0%, #8B5A2B 60%, #4a2c14 100%)",
              boxShadow: "0 8px 28px rgba(0,0,0,0.6)",
            }}
          />
        </div>
        <p className="font-display text-2xl md:text-3xl text-cream text-center px-6">
          🕉️ सभी को जय सिया राम
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
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.classList.add("animate-fade-up");
            el.style.opacity = "";
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function CountersSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [vals, setVals] = useState([0, 0, 0, 0]);
  const targets = [1247, 3891, 6235, 892];
  const items = [
    { icon: "🕉️", label: "सुंदरकांड पाठ सम्पन्न" },
    { icon: "🐄", label: "गौ माताओं को चारा अर्पित" },
    { icon: "🍽️", label: "ब्राह्मणों को भोजन" },
    { icon: "👨‍👩‍👧‍👦", label: "परिवार जुड़े" },
  ];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(el);
          const start = performance.now();
          const dur = 2000;
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / dur);
            const ease = 1 - Math.pow(1 - p, 3);
            setVals(targets.map((t) => Math.round(t * ease)));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="px-6 py-14 bg-gradient-to-br from-saffron via-[oklch(0.62_0.2_38)] to-deep text-white"
    >
      <div className="max-w-6xl mx-auto">
        <h2 className="font-display font-extrabold text-3xl md:text-4xl text-center mb-10 text-white">
          अब तक की सेवाएँ
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {items.map((it, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-5 md:p-6 text-center border-2 border-gold/60 shadow-xl hover-lift"
            >
              <div className="text-3xl md:text-4xl mb-2 text-saffron">{it.icon}</div>
              <div className="font-display font-extrabold text-3xl md:text-4xl text-maroon">
                {vals[i].toLocaleString("en-IN")}
              </div>
              <div className="text-xs md:text-sm text-muted-foreground mt-1 leading-snug">
                {it.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NameInput() {
  const [name, setName] = useState("");
  const display = name.trim() ? `${name.trim()} जी` : "आपके";
  return (
    <div className="mt-8 max-w-md mx-auto">
      <input
        type="text"
        value={name}
        maxLength={50}
        onChange={(e) => setName(e.target.value)}
        placeholder="अपना नाम यहाँ लिखें..."
        className="w-full px-5 py-3 rounded-xl border-2 border-saffron/60 bg-cream text-deep placeholder:text-deep/40 focus:outline-none focus:border-saffron focus:ring-4 focus:ring-saffron/15 text-base text-center"
        style={{ fontFamily: "'Tiro Devanagari Hindi','Noto Sans Devanagari',serif" }}
      />
      <p className="mt-3 text-center font-display italic text-maroon text-lg md:text-xl leading-snug">
        {display} के नाम एवं गोत्र से सुंदरकांड पाठ सम्पन्न होगा 🙏
      </p>
    </div>
  );
}

function WhatsAppProofSection() {
  const messages = [
    {
      text: "🙏 जय श्री राम, [भक्त जी], इस माह आपके नाम एवं गोत्र से सुंदरकांड पाठ सम्पन्न हुआ।",
      thumbGrad: "from-[#8B1A1A] to-[#FF6B35]",
      time: "10:23 AM",
    },
    {
      text: "🔥 गृह शांति हवन सम्पन्न — आपके परिवार की मंगल कामना सहित।",
      thumbGrad: "from-[#C9A84C] to-[#8B1A1A]",
      time: "10:24 AM",
    },
    {
      text: "🐄 गौ माता सेवा सम्पन्न — आपके नाम से चारा एवं गुड़ अर्पित।",
      thumbGrad: "from-[#FF6B35] to-[#C9A84C]",
      time: "10:25 AM",
    },
    {
      text: "🐒 वानर सेवा सम्पन्न — तीर्थ गुरु पुष्करराज के पवित्र स्थल पर।",
      thumbGrad: "from-[#8B1A1A] to-[#C9A84C]",
      time: "10:26 AM",
    },
  ];
  return (
    <section className="px-6 py-14 bg-cream">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-display font-extrabold text-2xl md:text-4xl text-maroon mb-3">
            📱 आपको ऐसा Proof मिलेगा WhatsApp पर
          </h2>
          <div className="h-1 w-20 bg-gold mx-auto" />
        </div>
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div className="mx-auto w-full max-w-[320px] bg-[#0b141a] rounded-[2rem] p-2 shadow-2xl border-4 border-gray-800">
            <div className="bg-[#25D366] text-white px-4 py-3 rounded-t-[1.5rem] flex items-center gap-3">
              <div className="size-10 rounded-full bg-white/20 flex items-center justify-center text-lg">
                🚩
              </div>
              <div>
                <div className="font-bold text-sm">पुण्यम सेवा 🚩</div>
                <div className="text-[10px] opacity-80">online</div>
              </div>
            </div>
            <div
              className="px-3 py-4 space-y-2 max-h-[480px] overflow-hidden"
              style={{
                background:
                  "#e5ddd5 url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><circle cx=%2220%22 cy=%2220%22 r=%221%22 fill=%22%23d8d0c8%22/></svg>')",
              }}
            >
              {messages.map((m, i) => (
                <div key={i} className="bg-[#dcf8c6] rounded-lg p-2 max-w-[85%] shadow-sm">
                  <div
                    className={`h-20 rounded-md mb-2 bg-gradient-to-br ${m.thumbGrad} relative overflow-hidden`}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Play size={28} className="text-white drop-shadow-lg" fill="white" />
                    </div>
                    <div className="absolute inset-0 backdrop-blur-[2px] bg-black/10" />
                  </div>
                  <p className="text-[11px] text-gray-800 leading-snug">{m.text}</p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[9px] text-gray-500">{m.time}</span>
                    <CheckCheck size={12} className="text-blue-500" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-lg md:text-xl text-deep leading-relaxed">
              हर माह के <span className="font-bold text-saffron">पहले सप्ताह</span> में आपके
              WhatsApp पर सभी 4 सेवाओं का Proof भेजा जाता है।
            </p>
            <ul className="mt-6 space-y-3 text-sm md:text-base">
              {[
                "हर वीडियो में आपका नाम और गोत्र बोला जाता है",
                "Live या रिकॉर्डेड वीडियो — आपकी सुविधा अनुसार",
                "फोटो प्रमाण भी साथ में",
                "Family group में भी share कर सकते हैं",
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 size-5 rounded-full bg-saffron/15 text-saffron flex items-center justify-center">
                    <Check size={12} />
                  </span>
                  <span className="text-deep/85">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function PanditsSection() {
  return (
    <section className="px-6 py-14">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-display font-extrabold text-2xl md:text-4xl text-maroon">
            🙏 हमारे आचार्य — जो आपकी सेवा करते हैं
          </h2>
          <div className="h-1 w-20 bg-gold mx-auto mt-4" />
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {pandits.map((p, i) => (
            <div
              key={i}
              className="bg-cream rounded-2xl p-6 border-2 border-gold/40 shadow-md hover-lift text-center"
            >
              <div
                className={`mx-auto size-24 rounded-full bg-gradient-to-br ${p.color} text-white text-4xl flex items-center justify-center shadow-lg mb-4 ring-4 ring-gold/30`}
              >
                🧘
              </div>
              <h3 className="font-display font-bold text-xl text-maroon mb-1">{p.name}</h3>
              <div className="text-xs uppercase tracking-wider text-saffron font-semibold mb-3">
                {p.role}
              </div>
              <p className="text-sm text-deep/80 leading-relaxed mb-4">{p.detail}</p>
              <p className="italic font-display text-saffron text-sm border-t border-gold/30 pt-3">
                "{p.quote}"
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GallerySection() {
  return (
    <section className="px-6 py-14 bg-cream">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-3">
          <h2 className="font-display font-extrabold text-2xl md:text-4xl text-maroon">
            📹 पिछले माह की सेवाओं की झलक
          </h2>
        </div>
        <p className="text-center text-sm text-muted-foreground mb-10">
          जून 2026 — 312 परिवारों के लिए सम्पन्न
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
          {gallery.map((g, i) => (
            <div
              key={i}
              className={`relative aspect-square rounded-2xl overflow-hidden bg-gradient-to-br ${g.grad} hover-lift cursor-pointer group`}
            >
              <div className="absolute inset-0 backdrop-blur-[3px] bg-black/20" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="size-14 md:size-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                  <Play size={24} className="text-saffron ml-1" fill="currentColor" />
                </div>
              </div>
              <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
                <div className="text-white font-display font-bold text-sm md:text-base">
                  {g.label}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-center mt-8 text-deep text-sm md:text-base">
          📲 सदस्य बनने पर यह सभी Videos आपके WhatsApp पर आती हैं।
        </p>
      </div>
    </section>
  );
}

function AudioPlayer() {
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play().catch(() => {});
      setPlaying(true);
    }
  };

  return (
    <div className="fixed bottom-24 left-4 md:bottom-6 md:left-6 z-[60]">
      {expanded ? (
        <div className="bg-cream border-2 border-gold/50 rounded-2xl p-4 shadow-2xl w-64 animate-modal">
          <div className="flex items-center justify-between mb-2">
            <div className="font-display font-bold text-maroon text-sm">🎵 सुंदरकांड चौपाई</div>
            <button
              onClick={() => setExpanded(false)}
              className="size-6 rounded-full hover:bg-saffron/15 flex items-center justify-center"
            >
              <X size={14} />
            </button>
          </div>
          <audio ref={audioRef} src={AUDIO_URL} preload="none" onEnded={() => setPlaying(false)} />
          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              className="size-11 rounded-full bg-saffron text-white flex items-center justify-center shadow-md hover:scale-105 transition-transform"
            >
              {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>
            <div className="text-xs text-deep/70 leading-tight">
              {playing ? "बज रहा है..." : "Play दबाएं"}
              <div className="text-[10px] opacity-60">हनुमान चालीसा</div>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className="bg-cream border-2 border-gold/50 text-maroon px-4 py-2.5 rounded-full shadow-lg hover:scale-105 transition-transform flex items-center gap-2 text-sm font-semibold"
        >
          <Music2 size={16} className="text-saffron" />
          <span className="hidden sm:inline">सुंदरकांड सुनें</span>
        </button>
      )}
    </div>
  );
}

type ModalState = { open: boolean; plan: Plan | null };

function SubscribeModal({
  state,
  onClose,
}: {
  state: ModalState;
  onClose: () => void;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", gotra: "", phone: "", city: "" });
  const [agree, setAgree] = useState(false);
  const [today] = useState(() =>
    new Date().toLocaleDateString("hi-IN", { day: "numeric", month: "long", year: "numeric" }),
  );

  useEffect(() => {
    if (state.open) {
      setStep(1);
      setForm({ name: "", gotra: "", phone: "", city: "" });
      setAgree(false);
    }
  }, [state.open]);

  if (!state.open || !state.plan) return null;
  const plan = state.plan;

  const nextFromStep1 = () => {
    if (!form.name.trim() || !form.phone.trim()) return;
    setStep(2);
  };

  const submitToWhatsApp = () => {
    const msg = `जय सियाराम 🙏 मुझे ${plan.name} योजना (${plan.price}${plan.cycle}) के लिए सदस्य बनना है।\n\nनाम: ${form.name}\nगोत्र: ${form.gotra || "कश्यप"}\nशहर: ${form.city || "—"}\n\nकृपया मुझे जोड़ें। 🚩`;
    window.open(`https://wa.me/${WHATSAPP_RAW}?text=${encodeURIComponent(msg)}`, "_blank");
    setStep(3);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4">
      <div className="bg-cream w-full md:max-w-lg md:rounded-3xl rounded-t-3xl shadow-2xl animate-modal border-t-4 md:border-4 border-gold/50 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gold/30">
          <div>
            <div className="text-xs uppercase tracking-wider text-saffron font-bold">
              {plan.name} • {plan.price}
              {plan.cycle}
            </div>
            <div className="font-display font-extrabold text-xl text-maroon">
              {step === 1 && "अपना परिचय दें"}
              {step === 2 && "अपनी योजना confirm करें"}
              {step === 3 && "🎉 संकल्प पंजीकृत हुआ!"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-9 rounded-full hover:bg-saffron/15 flex items-center justify-center text-maroon"
            aria-label="बंद करें"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 md:p-6">
          {/* progress */}
          <div className="flex items-center gap-2 mb-5">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`flex-1 h-1.5 rounded-full ${s <= step ? "bg-saffron" : "bg-gold/30"}`}
              />
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-3">
              <Field
                label="पूरा नाम *"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
                placeholder="अपना पूरा नाम"
              />
              <Field
                label="गोत्र"
                value={form.gotra}
                onChange={(v) => setForm({ ...form, gotra: v })}
                placeholder="गोत्र न पता हो तो 'कश्यप' लिखें"
              />
              <Field
                label="मोबाइल नंबर *"
                value={form.phone}
                onChange={(v) => setForm({ ...form, phone: v.replace(/[^0-9]/g, "").slice(0, 10) })}
                placeholder="10 अंकों का मोबाइल"
                type="tel"
              />
              <Field
                label="शहर"
                value={form.city}
                onChange={(v) => setForm({ ...form, city: v })}
                placeholder="आपका शहर"
              />
              <button
                onClick={nextFromStep1}
                disabled={!form.name.trim() || form.phone.length < 10}
                className="w-full mt-2 bg-saffron text-white py-3.5 rounded-xl font-bold disabled:opacity-50 hover:shadow-lg transition-all"
              >
                अगला चरण →
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border-2 border-gold/40 p-4">
                <div className="font-display font-bold text-lg text-maroon">{plan.name}</div>
                <div className="text-saffron font-extrabold text-2xl">
                  {plan.price}
                  <span className="text-sm text-deep/60 font-normal">{plan.cycle}</span>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-deep/80">
                  {plan.features.slice(0, 4).map((f, i) => (
                    <li key={i}>• {f}</li>
                  ))}
                </ul>
              </div>
              <label className="flex items-start gap-3 text-sm text-deep cursor-pointer">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="mt-1 size-5 accent-saffron"
                />
                <span>
                  मैं सहमत हूँ कि यह सेवा मेरे नाम एवं गोत्र से सम्पन्न की जाएगी ✓
                </span>
              </label>
              <button
                onClick={submitToWhatsApp}
                disabled={!agree}
                className="w-full bg-[#25D366] text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 hover:shadow-lg transition-all"
              >
                <WhatsAppIcon className="size-5" />
                WhatsApp पर जोड़ें →
              </button>
              <button
                onClick={() => setStep(1)}
                className="w-full text-deep/60 text-sm hover:text-saffron"
              >
                ← पिछला चरण
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-cream border-4 border-gold rounded-2xl p-6 text-center relative">
                <div className="text-4xl mb-2">🕉️</div>
                <div className="font-mono text-xs uppercase tracking-[0.25em] text-saffron mb-2">
                  संकल्प प्रमाण पत्र
                </div>
                <div className="h-px bg-gold/40 my-3" />
                <p className="font-display text-base md:text-lg text-deep leading-relaxed">
                  <strong className="text-maroon">{form.name || "भक्त"} जी</strong> के नाम एवं
                  गोत्र (<em>{form.gotra || "कश्यप"}</em>) से दिनांक{" "}
                  <strong>{today}</strong> को तीर्थ गुरु पुष्करराज में सुंदरकांड पाठ एवं समस्त
                  सेवाएँ सम्पन्न की जाएंगी।
                </p>
                <div className="h-px bg-gold/40 my-3" />
                <div className="text-xs italic text-saffron">
                  पुण्यम सेवा संस्थान, तीर्थ गुरु पुष्करराज 🚩
                </div>
              </div>
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator
                      .share({
                        title: "मेरा संकल्प प्रमाण पत्र — पुण्यम सेवा",
                        text: `${form.name} जी के नाम से तीर्थ गुरु पुष्करराज में सुंदरकांड संकल्प।`,
                      })
                      .catch(() => {});
                  }
                }}
                className="w-full bg-saffron text-white py-3 rounded-xl font-bold"
              >
                📸 Screenshot लें और WhatsApp पर Share करें
              </button>
              <p className="text-xs text-center text-deep/60">
                यह प्रमाण पत्र आपके WhatsApp पर भी भेजा जाएगा।
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-maroon mb-1.5 uppercase tracking-wider">
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl border-2 border-gold/40 bg-white text-deep placeholder:text-deep/40 focus:outline-none focus:border-saffron focus:ring-4 focus:ring-saffron/15"
      />
    </label>
  );
}

function ExitPopup({ onOpenPackages }: { onOpenPackages: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("punyam_exit_seen")) return;
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) {
        sessionStorage.setItem("punyam_exit_seen", "1");
        setShow(true);
        document.removeEventListener("mouseout", onLeave);
      }
    };
    const t = setTimeout(() => document.addEventListener("mouseout", onLeave), 4000);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mouseout", onLeave);
    };
  }, []);
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-deep text-cream rounded-3xl p-8 md:p-10 max-w-md w-full text-center border-4 border-gold/60 shadow-2xl animate-modal relative">
        <button
          onClick={() => setShow(false)}
          className="absolute top-3 right-3 size-9 rounded-full hover:bg-white/10 flex items-center justify-center text-cream"
          aria-label="बंद करें"
        >
          <X size={18} />
        </button>
        <div className="text-6xl mb-4">🙏</div>
        <h3 className="font-display font-extrabold text-2xl md:text-3xl mb-3 text-gold">
          रुकिए — हनुमान जी की कृपा से वंचित न रहें
        </h3>
        <p className="opacity-90 mb-6 leading-relaxed">
          मात्र ₹251 में आपके नाम से मासिक सुंदरकांड पाठ। पहला महीना कभी भी रोक सकते हैं।
        </p>
        <button
          onClick={() => {
            setShow(false);
            onOpenPackages();
          }}
          className="w-full bg-saffron text-white py-3.5 rounded-xl font-extrabold hover:scale-[1.02] transition-transform"
        >
          योजना देखें →
        </button>
        <button
          onClick={() => setShow(false)}
          className="mt-3 text-xs text-cream/60 hover:text-cream underline"
        >
          नहीं, मुझे रुचि नहीं
        </button>
      </div>
    </div>
  );
}

function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [waOpen, setWaOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [modal, setModal] = useState<ModalState>({ open: false, plan: null });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const openModal = (plan: Plan) => setModal({ open: true, plan });
  const openDefault = () => openModal(plans[0]);
  const scrollToPackages = () => {
    document.getElementById("packages")?.scrollIntoView({ behavior: "smooth" });
  };

  const heroRef = useFadeUpOnView<HTMLDivElement>();
  const sundarkandRef = useFadeUpOnView<HTMLDivElement>();
  const sevasRef = useFadeUpOnView<HTMLDivElement>();
  const packagesRef = useFadeUpOnView<HTMLDivElement>();

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-saffron/20 pb-32 md:pb-0">
      <IntroOverlay />

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.05] -z-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(139,26,26,0.5) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* Nav */}
      <nav
        className={`sticky top-0 z-40 transition-all ${
          scrolled
            ? "bg-cream/85 backdrop-blur-xl border-b border-gold/40 shadow-sm"
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
            <a href="#pandits" className="hover:text-saffron transition-colors">आचार्य</a>
            <a href="#faq" className="hover:text-saffron transition-colors">प्रश्न</a>
          </div>
          <button
            onClick={openDefault}
            className="bg-gradient-to-r from-saffron to-[oklch(0.6_0.21_38)] text-white px-4 md:px-5 py-2 rounded-full text-xs md:text-sm font-semibold hover:shadow-lg hover:shadow-saffron/40 transition-all shrink-0"
          >
            अभी जुड़ें →
          </button>
        </div>
        <div className="md:hidden flex gap-4 overflow-x-auto px-4 pb-2 text-xs font-medium uppercase tracking-wide opacity-80 scrollbar-none">
          <a href="#sundarkand" className="whitespace-nowrap hover:text-saffron">सुंदरकांड</a>
          <a href="#sevas" className="whitespace-nowrap hover:text-saffron">सेवाएँ</a>
          <a href="#packages" className="whitespace-nowrap hover:text-saffron">योजनाएँ</a>
          <a href="#pandits" className="whitespace-nowrap hover:text-saffron">आचार्य</a>
          <a href="#faq" className="whitespace-nowrap hover:text-saffron">प्रश्न</a>
        </div>
      </nav>

      {/* Hero */}
      <section
        id="top"
        className="relative px-6 pt-14 md:pt-20 pb-16 md:pb-20 text-center overflow-hidden"
      >
        <div className="max-w-4xl mx-auto" ref={heroRef}>
          <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 rounded-full px-4 py-1.5 text-xs md:text-sm font-semibold mb-6">
            <span className="size-2 rounded-full bg-green-500 animate-pulse" />
            अभी 1,200+ परिवार इस सेवा से जुड़े हैं
          </div>

          <span className="font-mono text-xs uppercase tracking-[0.3em] text-gold mb-4 block">
            🚩 जय सियाराम • तीर्थ गुरु पुष्करराज से
          </span>

          <h1 className="font-display font-extrabold text-5xl md:text-7xl lg:text-[5.5rem] leading-[1.05] mb-6 text-balance text-maroon">
            हर घर में सुंदरकांड,
            <br />
            <span className="inline-flex items-center gap-3 justify-center">
              <span className="bg-gradient-to-r from-saffron via-[oklch(0.7_0.2_40)] to-gold bg-clip-text text-transparent">
                हर मन में राम।
              </span>
              <span className="text-3xl md:text-5xl animate-flame inline-block">🪔</span>
            </span>
          </h1>

          <p className="text-base md:text-xl text-muted-foreground max-w-2xl mx-auto mb-6 text-pretty leading-relaxed">
            व्यस्तता के कारण स्वयं अनुष्ठान नहीं कर पाते? संस्थान आपके{" "}
            <span className="text-deep font-medium">नाम एवं गोत्र</span> से तीर्थ गुरु पुष्करराज
            में मासिक सुंदरकांड पाठ, गृह शांति हवन, गौ सेवा एवं ब्राह्मण भोज सम्पन्न करवाता है।
          </p>

          <NameInput />

          <div className="flex flex-col items-center gap-5 mt-8">
            <button
              onClick={openDefault}
              className="bg-gradient-to-r from-saffron to-[oklch(0.6_0.21_38)] text-white px-8 py-4 rounded-2xl text-lg font-bold shadow-xl shadow-saffron/30 hover:shadow-saffron/50 hover:-translate-y-0.5 transition-all"
            >
              योजना चुनें — ₹251 से शुरू →
            </button>

            <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 text-xs md:text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Lock size={14} className="text-saffron" /> 100% Secure Payment
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Video size={14} className="text-saffron" /> Video Proof हर माह
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Ban size={14} className="text-saffron" /> कोई Hidden Charges नहीं
              </span>
            </div>
          </div>
        </div>

        <div className="mt-12 max-w-6xl mx-auto rounded-3xl overflow-hidden ring-1 ring-gold/30 shadow-2xl">
          <img
            src={heroImg}
            alt="तीर्थ गुरु पुष्करराज — सूर्योदय के समय मंदिर एवं घाट"
            width={1920}
            height={896}
            className="w-full aspect-[21/9] object-cover"
          />
        </div>
      </section>

      <Divider />

      <CountersSection />

      <Divider symbol="✦" />

      {/* Manifesto */}
      <section className="px-6 py-10">
        <div className="max-w-3xl mx-auto text-center">
          <p className="font-display text-xl md:text-3xl leading-relaxed text-balance text-maroon">
            "बालाजी की असीम कृपा और प्रेरणा से हम राम नाम और सुंदरकांड के इस मिशन में निरंतर लगे
            और जुड़े हैं — यह कोई व्यवसाय नहीं, यह{" "}
            <span className="text-saffron">सनातन सेवा का सामूहिक यज्ञ</span> है।"
          </p>
          <p className="font-mono text-xs uppercase tracking-[0.3em] mt-6 opacity-50">
            पूर्ण पारदर्शिता • हर पैसे का हिसाब • Video Proof
          </p>
        </div>
      </section>

      <Divider />

      {/* Sundarkand */}
      <section
        id="sundarkand"
        className="px-6 py-14 bg-deep text-cream relative overflow-hidden"
      >
        <div
          aria-hidden
          className="absolute -right-32 -top-32 w-[36rem] h-[36rem] opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,200,120,0.8) 0, transparent 60%)",
            borderRadius: "50%",
          }}
        />
        <div ref={sundarkandRef} className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center relative">
          <div className="rounded-3xl overflow-hidden ring-1 ring-gold/20 shadow-2xl order-2 lg:order-1">
            <img
              src={pushkarGhatImg}
              alt="तीर्थ गुरु पुष्करराज घाट — सूर्योदय के समय दीप अर्पण एवं आरती"
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
              होता है।
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

      <Divider />

      {/* Daan */}
      <section className="px-6 py-14">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">
              तीर्थ गुरु पुष्करराज में दान का माहात्म्य
            </span>
            <h2 className="font-display font-bold text-3xl md:text-5xl leading-tight mb-6 text-balance text-maroon">
              तीर्थ गुरु पुष्करराज —<br />
              <span className="text-saffron">जहाँ एक दान, सहस्र पुण्य।</span>
            </h2>
            <div className="h-1 w-20 bg-gold mx-auto" />
          </div>

          <p className="text-lg leading-relaxed text-muted-foreground max-w-3xl mx-auto text-center mb-12">
            पद्म पुराण के अनुसार तीर्थ गुरु पुष्करराज समस्त तीर्थों का राजा है — स्वयं ब्रह्मा जी
            का यज्ञ स्थल। यहाँ किया गया एक दान अन्य स्थानों पर किए सहस्र दानों के समान फलदायी होता
            है।
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="group rounded-2xl overflow-hidden border-2 border-gold/40 bg-white hover-lift">
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
                <h3 className="font-display font-bold text-xl md:text-2xl mb-3 text-maroon">
                  गौ माता को हरा चारा
                </h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-4">
                  शास्त्रों में गौ माता में तैंतीस कोटि देवताओं का वास माना गया है। हरा चारा अर्पण
                  करने से पितृ दोष शांत होते हैं, लक्ष्मी का वास होता है।
                </p>
                <p className="italic font-display text-saffron text-sm md:text-base border-l-2 border-saffron pl-3">
                  "गावो विश्वस्य मातरः" — गाय ही सम्पूर्ण विश्व की माता हैं।
                </p>
              </div>
            </div>

            <div className="group rounded-2xl overflow-hidden border-2 border-saffron/40 bg-saffron/5 hover-lift">
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
                <h3 className="font-display font-bold text-xl md:text-2xl mb-3 text-maroon">
                  मंगलवार को वानरों को केला
                </h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-3">
                  मंगलवार श्री हनुमान जी का दिन है। इस दिन वानरों को केला, चना और गुड़ खिलाना
                  साक्षात हनुमान जी की सेवा मानी जाती है।
                </p>
                <p className="italic font-display text-saffron text-sm md:text-base border-l-2 border-saffron pl-3">
                  "हनुमान सम नहिं बड़भागी" — हर मंगलवार आपके नाम से वानर सेवा।
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Divider />

      <WhatsAppProofSection />

      <Divider symbol="✦" />

      {/* Sevas */}
      <section id="sevas" className="px-6 py-14 bg-cream">
        <div ref={sevasRef} className="max-w-6xl mx-auto">
          <div className="mb-12 max-w-2xl">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">
              आपकी मासिक सेवाएँ
            </span>
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4 text-maroon">
              पाँच पवित्र अनुष्ठान — पूरे परिवार के लिए
            </h2>
            <div className="h-1 w-20 bg-gold" />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {sevas.map((s) => (
              <div
                key={s.num}
                className="group bg-white p-7 rounded-2xl border-2 border-gold/30 hover:border-saffron/60 hover-lift transition-all"
              >
                <div className="relative size-14 mb-5">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-saffron to-gold rotate-6 opacity-90 group-hover:rotate-12 transition-transform" />
                  <div className="relative size-14 rounded-2xl bg-gradient-to-br from-saffron to-[oklch(0.6_0.21_38)] flex items-center justify-center text-white font-display text-2xl font-extrabold shadow-lg shadow-saffron/30">
                    {s.num}
                  </div>
                </div>
                <h3 className="font-display text-xl font-bold mb-3 text-maroon">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground mb-4">{s.desc}</p>
                <p className="italic text-xs text-saffron/90 border-l-2 border-saffron/40 pl-3">
                  {s.quote}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-2xl bg-gradient-to-r from-saffron via-[oklch(0.6_0.21_38)] to-saffron text-white p-6 md:p-8 shadow-xl shadow-saffron/25 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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
            <button
              onClick={scrollToPackages}
              className="bg-white text-saffron px-6 py-3 rounded-xl font-bold text-sm whitespace-nowrap hover:bg-cream transition-colors shadow-lg"
            >
              योजना देखें →
            </button>
          </div>
        </div>
      </section>

      <Divider />

      <GallerySection />

      <Divider symbol="✦" />

      <PanditsSection id="pandits" />

      <Divider />

      {/* Packages */}
      <section id="packages" className="px-6 py-16 bg-background relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-saffron/[0.04] to-transparent pointer-events-none" />
        <div ref={packagesRef} className="max-w-6xl mx-auto relative">
          <div className="text-center mb-4">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">
              अपना संकल्प चुनें
            </span>
            <h2 className="font-display font-extrabold text-3xl md:text-5xl leading-[1.1] mb-4 text-balance text-maroon">
              तीन पवित्र योजनाएँ —<br />
              <span className="text-saffron">हर श्रद्धा के लिए।</span>
            </h2>
            <div className="h-1 w-20 bg-gold mx-auto mb-4" />
            <div className="inline-flex items-center gap-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-3 py-1 text-xs font-semibold mb-4">
              🔥 इस माह 47 नए सदस्य जुड़े
            </div>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              हर योजना में आपके{" "}
              <span className="text-deep font-semibold">परिवार के 4 सदस्यों तक</span> का नाम एवं
              गोत्र सम्मिलित।
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 md:gap-6 mt-12 items-stretch">
            {plans.map((p) => (
              <div
                key={p.id}
                className={`relative flex flex-col rounded-3xl p-6 md:p-8 transition-all ${
                  p.highlight
                    ? "bg-deep text-cream ring-2 ring-saffron shadow-2xl shadow-saffron/30 md:scale-[1.05] md:-translate-y-1"
                    : "bg-white text-foreground ring-2 ring-gold/40 hover:ring-saffron/50 hover-lift"
                }`}
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
                <h3
                  className={`font-display font-extrabold text-2xl mb-2 ${
                    p.highlight ? "" : "text-maroon"
                  }`}
                >
                  {p.name}
                </h3>
                <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                  {p.strikePrice && (
                    <span className="text-base line-through opacity-60">{p.strikePrice}</span>
                  )}
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
                {p.id === "varsh" && (
                  <div className="text-xs text-green-700 font-semibold mb-4 bg-green-50 border border-green-200 rounded-md px-2 py-1 inline-block">
                    ₹401 × 12 = ₹4,812 → आपकी बचत ₹711
                  </div>
                )}
                <ul className={`space-y-3 mb-8 flex-1 ${p.id === "varsh" ? "mt-3" : "mt-4"}`}>
                  {p.features.map((f, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm leading-relaxed">
                      <span
                        className={`mt-0.5 size-5 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold ${
                          p.highlight ? "bg-saffron text-white" : "bg-saffron/15 text-saffron"
                        }`}
                      >
                        ✓
                      </span>
                      <span className={p.highlight ? "opacity-90" : ""}>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => openModal(p)}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold text-sm transition-all bg-gradient-to-r from-saffron to-[oklch(0.6_0.21_38)] text-white hover:shadow-xl hover:shadow-saffron/40 hover:-translate-y-0.5"
                >
                  <WhatsAppIcon className="size-4" />
                  सदस्य बनें
                </button>
              </div>
            ))}
          </div>

          <p className="text-center text-xs md:text-sm text-muted-foreground mt-8 font-mono uppercase tracking-wider">
            कभी भी रोकें • कोई Hidden Charges नहीं • पूर्ण पारदर्शिता
          </p>
        </div>
      </section>

      <Divider />

      {/* Journey */}
      <section id="journey" className="px-6 py-14 bg-cream">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">
              पुण्य की यात्रा
            </span>
            <h2 className="font-display font-bold text-3xl md:text-4xl text-maroon">तीन सरल चरण</h2>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-8">
            <div
              aria-hidden
              className="hidden md:block absolute top-9 left-[16%] right-[16%] h-0.5"
              style={{
                backgroundImage:
                  "radial-gradient(circle, oklch(0.74 0.12 80 / 0.7) 1.5px, transparent 1.5px)",
                backgroundSize: "12px 2px",
                backgroundRepeat: "repeat-x",
              }}
            />
            {journey.map((step, i) => (
              <div
                key={i}
                className="relative bg-white rounded-2xl p-6 border-2 border-gold/30 hover:border-saffron/40 hover-lift transition-all flex flex-col items-center text-center"
              >
                <div className="relative mb-4">
                  <div className="size-16 md:size-18 rounded-full bg-gradient-to-br from-saffron to-[oklch(0.6_0.21_38)] text-white font-display font-extrabold text-2xl flex items-center justify-center shadow-xl shadow-saffron/40 ring-4 ring-cream">
                    {i + 1}
                  </div>
                </div>
                <h4 className="font-display font-bold text-lg md:text-xl mb-2 leading-snug text-maroon">
                  {step.title}
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">{step.desc}</p>
                <p className="text-xs text-saffron font-medium italic mt-auto">{step.benefit}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider symbol="✦" />

      {/* Testimonials */}
      <section id="testimonials" className="px-6 py-14">
        <div className="max-w-6xl mx-auto bg-gradient-to-br from-saffron to-[oklch(0.45_0.18_28)] text-white rounded-[2.5rem] px-6 py-12 md:px-14 md:py-14">
          <span className="font-mono text-xs uppercase tracking-[0.3em] opacity-80 block mb-3">
            भक्तों के अनुभव
          </span>
          <h2 className="font-display font-bold text-3xl md:text-4xl mb-10 max-w-2xl">
            लाखों श्रद्धालुओं की आस्था का साक्षी।
          </h2>

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

      <Divider />

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-14">
        <div className="text-center mb-10">
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">
            शंका समाधान
          </span>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-maroon">
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
                } ${f.highlighted && !open ? "bg-saffron/5 border-l-saffron/40" : ""}`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    {f.highlighted && (
                      <span className="bg-saffron text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0">
                        लोकप्रिय
                      </span>
                    )}
                    <h4 className="font-display font-bold text-base md:text-lg text-maroon">
                      {f.q}
                    </h4>
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

      <Divider />

      {/* Final CTA */}
      <section id="subscribe" className="px-6 py-14">
        <div
          className="max-w-4xl mx-auto rounded-[2.5rem] p-12 md:p-16 text-center relative overflow-hidden text-white"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.55 0.2 45) 0%, oklch(0.42 0.18 35) 60%, oklch(0.32 0.15 30) 100%)",
          }}
        >
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
            <button
              onClick={openDefault}
              className="inline-flex items-center gap-2 bg-white text-saffron px-10 py-5 rounded-xl text-lg font-extrabold hover:scale-105 transition-transform shadow-2xl"
            >
              सदस्य बनें →
            </button>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-70 mt-8">
              कोई Hidden Charges नहीं • कभी भी रोकें • पूर्ण पारदर्शिता
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 bg-deep text-cream">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8 text-sm">
          <div>
            <div className="font-display font-extrabold text-xl text-saffron mb-2">
              🚩 पुण्यम सेवा
            </div>
            <p className="text-cream/80 leading-relaxed">
              सनातन सेवा का सामूहिक यज्ञ — तीर्थ गुरु पुष्करराज से, आपके परिवार तक।
            </p>
            <p className="text-xs text-cream/60 mt-3 leading-relaxed">
              पुण्यम सेवा संस्थान, तीर्थ गुरु पुष्करराज, राजस्थान — 305022
            </p>
          </div>

          <div>
            <div className="font-display font-bold text-gold mb-3">संपर्क करें</div>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-[#25D366] font-semibold hover:underline"
            >
              📞 {WHATSAPP_NUMBER}
            </a>
            <p className="text-xs text-cream/70 mt-2">WhatsApp पर 24×7 उपलब्ध</p>
            <div className="flex items-center gap-3 mt-4">
              <a
                href={WHATSAPP_URL}
                aria-label="WhatsApp"
                className="size-9 rounded-full bg-[#25D366] text-white flex items-center justify-center hover:scale-105 transition-transform"
              >
                <WhatsAppIcon className="size-4" />
              </a>
              <a
                href="#"
                aria-label="YouTube"
                className="size-9 rounded-full bg-red-600 text-white flex items-center justify-center hover:scale-105 transition-transform"
              >
                <Youtube size={16} />
              </a>
              <a
                href="#"
                aria-label="Instagram"
                className="size-9 rounded-full bg-pink-600 text-white flex items-center justify-center hover:scale-105 transition-transform"
              >
                <Instagram size={16} />
              </a>
            </div>
          </div>

          <div>
            <div className="font-display font-bold text-gold mb-3">विश्वास एवं भुगतान</div>
            <div className="space-y-2 text-xs text-cream/80">
              <div className="inline-flex items-center gap-2">
                <Shield size={14} className="text-green-400" />
                <span>🔒 Razorpay द्वारा सुरक्षित</span>
              </div>
              <div className="inline-flex items-center gap-2">
                <Video size={14} className="text-saffron" />
                <span>📹 Video Proof गारंटी</span>
              </div>
              <div className="inline-flex items-center gap-2">
                <Ban size={14} className="text-gold" />
                <span>❌ कोई Hidden Charge नहीं</span>
              </div>
            </div>
            <p className="text-xs text-cream/60 mt-3 leading-relaxed">
              UPI • PhonePe • GPay • Debit/Credit Card
            </p>
          </div>
        </div>

        <div className="max-w-5xl mx-auto mt-8 pt-6 border-t border-gold/20 text-center font-mono text-[10px] tracking-[0.3em] uppercase text-cream/50">
          © 2026 पुण्यम सेवा संस्थान • सर्वाधिकार सुरक्षित
        </div>
      </footer>

      {/* Sticky mobile bottom bar */}
      <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md bg-white/95 backdrop-blur-xl border-2 border-saffron/40 rounded-2xl p-3 pl-5 shadow-2xl z-50 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
            ₹251 से शुरू • कभी भी रोकें
          </div>
          <div className="font-display text-base font-extrabold text-maroon leading-none mt-0.5">
            परिवार सहित संकल्प
          </div>
        </div>
        <button
          onClick={openDefault}
          className="bg-gradient-to-r from-saffron to-[oklch(0.6_0.21_38)] text-white px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap shadow-lg shadow-saffron/30"
        >
          अभी जुड़ें →
        </button>
      </div>

      {/* Floating WhatsApp */}
      <div className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-[60] flex flex-col items-end gap-3">
        {waOpen && (
          <div className="animate-modal bg-white border-2 border-gold/40 shadow-2xl rounded-2xl p-4 pr-3 max-w-[18rem] relative">
            <button
              onClick={() => setWaOpen(false)}
              aria-label="बंद करें"
              className="absolute top-2 right-2 size-6 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
            >
              <X size={14} />
            </button>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-saffron mb-2">
              💬 अभी जुड़ें
            </div>
            <p className="text-sm leading-relaxed text-deep mb-4 pr-4">
              आप हमसे WhatsApp पर भी जुड़ सकते हैं — नि:संकोच संपर्क करें।
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
          title="💬 अभी जुड़ें"
          className="group relative inline-flex items-center justify-center size-14 bg-[#25D366] text-white rounded-full shadow-2xl shadow-[#25D366]/40 hover:scale-105 transition-transform ring-4 ring-white/40 animate-pulse-ring"
        >
          <WhatsAppIcon className="size-6" />
        </button>
      </div>

      <AudioPlayer />

      <SubscribeModal state={modal} onClose={() => setModal({ open: false, plan: null })} />

      <ExitPopup onOpenPackages={scrollToPackages} />
    </div>
  );
}

function PanditsSection({ id }: { id?: string }) {
  return (
    <section id={id} className="px-6 py-14">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-display font-extrabold text-2xl md:text-4xl text-maroon">
            🙏 हमारे आचार्य — जो आपकी सेवा करते हैं
          </h2>
          <div className="h-1 w-20 bg-gold mx-auto mt-4" />
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {pandits.map((p, i) => (
            <div
              key={i}
              className="bg-cream rounded-2xl p-6 border-2 border-gold/40 shadow-md hover-lift text-center"
            >
              <div
                className={`mx-auto size-24 rounded-full bg-gradient-to-br ${p.color} text-white text-4xl flex items-center justify-center shadow-lg mb-4 ring-4 ring-gold/30`}
              >
                🧘
              </div>
              <h3 className="font-display font-bold text-xl text-maroon mb-1">{p.name}</h3>
              <div className="text-xs uppercase tracking-wider text-saffron font-semibold mb-3">
                {p.role}
              </div>
              <p className="text-sm text-deep/80 leading-relaxed mb-4">{p.detail}</p>
              <p className="italic font-display text-saffron text-sm border-t border-gold/30 pt-3">
                "{p.quote}"
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
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
