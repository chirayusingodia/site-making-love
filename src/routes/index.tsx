import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  User,
  ChevronDown,
  ArrowRight,
  Check,
  MapPin,
  MessageCircle,
  Home,
  Sparkles,
  ClipboardCheck,
  Video,
  BookOpen,
  Flame,
  Heart,
  Users,
  Wind,
  ShieldCheck,
} from "lucide-react";
import heroImg from "@/assets/pushkar-hero.jpg";
import havanImg from "@/assets/havan.jpg";
import gauSevaImg from "@/assets/gau-seva.jpg";
import pushkarGhatImg from "@/assets/pushkar-ghat.jpg";

const WHATSAPP_RAW = "918005828548";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_RAW}?text=${encodeURIComponent(
  "Jai Siyaram, मुझे पुण्यता से जुड़ना है।",
)}`;

// ---------------------- Data ----------------------
type Plan = {
  id: "basic" | "grah" | "varsh";
  name: string;
  tagline: string;
  price: string;
  cycle: string;
  strikePrice?: string;
  image: string;
  ribbon?: string;
  badge?: { label: string; kind: "popular" | "save" | "max" };
  location: string;
  features: string[];
  extra: string[];
};

const plans: Plan[] = [
  {
    id: "basic",
    name: "मूल संकल्प",
    tagline: "सेवा की शुरुआत — ₹251/माह में मासिक सुंदरकांड, गौ सेवा, वानर सेवा एवं ब्राह्मण भोजन।",
    price: "₹251",
    cycle: "/माह",
    image: heroImg,
    ribbon: "800+ परिवार जुड़े",
    location: "तीर्थ गुरु पुष्करराज, पुष्कर",
    features: [
      "सुंदरकांड पाठ — हर माह",
      "गौ सेवा + वानर सेवा",
      "ब्राह्मण भोजन — 5 ब्राह्मण",
      "WhatsApp Video Proof",
    ],
    extra: ["परिवार के 4 सदस्यों का संकल्प"],
  },
  {
    id: "grah",
    name: "गृह शांति",
    tagline: "सम्पूर्ण पारिवारिक सेवा — 2 सुंदरकांड, हवन एवं हनुमान जी सिंदूर सेवा हर माह।",
    price: "₹401",
    cycle: "/माह",
    image: havanImg,
    ribbon: "500+ परिवार जुड़े",
    badge: { label: "सबसे लोकप्रिय", kind: "popular" },
    location: "तीर्थ गुरु पुष्करराज, पुष्कर",
    features: [
      "सुंदरकांड — 2× हर माह",
      "गृह शांति हवन — हर माह",
      "हनुमान जी सिंदूर सेवा",
      "WhatsApp Video Proof सभी सेवाओं का",
    ],
    extra: ["परिवार के 4 सदस्यों का संकल्प"],
  },
  {
    id: "varsh",
    name: "वार्षिक महासंकल्प",
    tagline: "पूरे वर्ष का संकल्प — ₹401 वाली सभी सेवाएं 12 माह + हनुमान जी चोला सेवा।",
    price: "₹4,101",
    cycle: "/वर्ष",
    strikePrice: "₹4,812",
    image: pushkarGhatImg,
    ribbon: "सर्वाधिक पुण्यदायी",
    badge: { label: "₹711 की बचत", kind: "save" },
    location: "तीर्थ गुरु पुष्करराज, पुष्कर",
    features: [
      "₹401 प्लान की सभी सेवाएं — 12 माह",
      "सुंदरकांड — 24 पाठ (2/माह)",
      "हनुमान जी चोला सेवा — वार्षिक",
      "WhatsApp Video Proof हर अनुष्ठान का",
    ],
    extra: ["परिवार के 4 सदस्यों का संकल्प"],
  },
];

type Seva = {
  title: string;
  desc: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  image: string;
};

const sevas: Seva[] = [
  {
    title: "सुंदरकांड पाठ",
    desc: "आपके नाम एवं गोत्र से संकल्पपूर्वक सस्वर सुंदरकांड — श्री हनुमान जी की कृपा हेतु।",
    Icon: BookOpen,
    image: pushkarGhatImg,
  },
  {
    title: "गृह शांति हवन",
    desc: "विद्वान आचार्यों द्वारा वैदिक मंत्रों से गृह शांति हवन — परिवार की मंगल कामना सहित।",
    Icon: Flame,
    image: havanImg,
  },
  {
    title: "गौ माता सेवा",
    desc: "स्थानीय गौशालाओं में गौ माता को हरा चारा एवं गुड़ का अर्पण — सीधा पुण्य।",
    Icon: Wind,
    image: gauSevaImg,
  },
  {
    title: "वानर सेवा",
    desc: "तीर्थ गुरु पुष्करराज में वानरों को केला एवं चना — श्री हनुमान जी के प्रिय।",
    Icon: Heart,
    image: heroImg,
  },
  {
    title: "ब्राह्मण भोजन",
    desc: "विद्वान ब्राह्मणों को सात्विक भोजन एवं यथायोग्य सत्कार — पितृ आशीर्वाद।",
    Icon: Users,
    image: pushkarGhatImg,
  },
];

const testimonials = [
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

const faqs = [
  {
    q: "इतने सस्ते में कैसे करवा पा रहे हो यह सब?",
    a: "सभी के नाम का संकल्प साथ में लिया जाएगा। हर व्यक्ति का नाम और गोत्र अलग-अलग बोला जाएगा, लेकिन पंडित जी एक ही बार में सबके संकल्प सामूहिक रूप से ले लेंगे। इसीलिए यह सेवा सभी के लिए सुलभ और सस्ती रखी गई है।",
  },
  {
    q: "पहली सेवा कब शुरू होगी?",
    a: "आपकी सदस्यता शुरू होते ही वानर सेवा, गौ सेवा और ब्राह्मण भोजन उसी सप्ताह से शुरू हो जाते हैं। सुंदरकांड पाठ हर महीने के पहले मंगलवार को होता है — अगर आप महीने के बीच में जुड़ते हैं, तो आपकी पहली सुंदरकांड सेवा अगले महीने के पहले मंगलवार को होगी।",
  },
  {
    q: "Refund Policy क्या है?",
    a: "अगर किसी कारणवश सेवा न हो सके तो पूरा धन वापस किया जाएगा।",
  },
  {
    q: "क्या मुझे प्रत्येक सेवा का प्रमाण मिलेगा?",
    a: "जी हाँ। प्रत्येक अनुष्ठान — सुंदरकांड, हवन, गौ सेवा, वानर सेवा एवं ब्राह्मण भोज — का Live या Video Proof सीधे आपके WhatsApp पर भेजा जाता है।",
  },
  {
    q: "क्या यह कोई business है?",
    a: "नहीं। यह सनातन सेवा का एक सामूहिक यज्ञ है। आपकी सेवा राशि का एक-एक पैसा सीधे गौ-माता के चारे, वानरों के फल, ब्राह्मण भोज एवं अनुष्ठान सामग्री में लगाया जाता है।",
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

const FILTERS = [
  { id: "plans", label: "Plans" },
  { id: "sevas", label: "Our Sevas" },
  { id: "reviews", label: "Reviews" },
  { id: "faq", label: "FAQ" },
] as const;

// ---------------------- Route ----------------------
export const Route = createFileRoute("/")({
  component: HomePage,
});

// ---------------------- Components ----------------------
function Header() {
  return (
    <header className="sticky top-0 z-40 bg-[#FDF1EC]/85 backdrop-blur-lg border-b border-black/5">
      <div className="max-w-2xl mx-auto flex items-center justify-between px-4 py-3">
        <a href="#top" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-brand text-white flex items-center justify-center font-bold text-lg">
            <span>🕉️</span>
          </div>
          <span className="text-xl font-bold text-brand tracking-tight">पुण्यता</span>
        </a>
        <div className="flex items-center gap-2">
          <button className="w-10 h-10 rounded-full bg-white border border-black/10 flex items-center justify-center hover:border-brand transition-colors" aria-label="Search">
            <Search size={18} className="text-foreground" />
          </button>
          <button className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center" aria-label="Account">
            <User size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

function FilterPills({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  return (
    <div className="sticky top-[60px] z-30 bg-[#FDF1EC]/90 backdrop-blur-md border-b border-black/5">
      <div className="max-w-2xl mx-auto px-4 py-3 flex gap-2 overflow-x-auto scrollbar-none">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              onChange(f.id);
              document.getElementById(f.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={`pill ${active === f.id ? "active" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const badgeColor =
    plan.badge?.kind === "popular"
      ? "bg-gradient-to-r from-[#FDD9C3] to-[#F5A742] text-[#7A3A00]"
      : plan.badge?.kind === "save"
        ? "bg-success text-white"
        : "bg-gradient-to-r from-[#FDD9C3] to-[#F5A742] text-[#7A3A00]";

  return (
    <article className="card-soft overflow-hidden relative animate-fade-up">
      <div className="relative">
        {plan.ribbon && <div className="ribbon">{plan.ribbon}</div>}
        {plan.badge && (
          <div className={`absolute top-3 right-3 z-2 px-3 py-1.5 rounded-full text-xs font-bold ${badgeColor} shadow-md`}>
            {plan.badge.label}
          </div>
        )}
        <img src={plan.image} alt={plan.name} className="w-full h-52 object-cover" />
        <div className="absolute bottom-3 left-3 flex items-center bg-white rounded-full shadow-lg pr-4 pl-1 py-1">
          <span className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm mr-2">₹</span>
          <span className="font-bold text-foreground">
            {plan.price}
            <span className="text-muted-foreground font-medium text-sm">{plan.cycle}</span>
          </span>
          {plan.strikePrice && (
            <span className="ml-2 text-xs text-muted-foreground line-through">{plan.strikePrice}</span>
          )}
        </div>
      </div>

      <div className="p-5">
        <h3 className="text-xl font-bold text-foreground leading-tight">{plan.name}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed line-clamp-2">{plan.tagline}</p>

        <div className="mt-4 space-y-2.5">
          <div className="flex items-center gap-2 text-sm">
            <MapPin size={16} className="text-brand shrink-0" />
            <span className="text-foreground">{plan.location}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Video size={16} className="text-success shrink-0" />
            <span className="text-foreground">WhatsApp Video Proof</span>
          </div>
        </div>

        <div className="mt-4 border-t border-black/5 pt-4 space-y-2">
          {plan.features.map((f) => (
            <div key={f} className="flex items-start gap-2 text-sm">
              <Check size={16} className="text-success shrink-0 mt-0.5" />
              <span className="text-foreground/85">{f}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="flex -space-x-2">
            {["#F5A742", "#7B4FA3", "#3FAE55", "#E8425A"].map((c, i) => (
              <div key={i} className="w-7 h-7 rounded-full border-2 border-white" style={{ background: c }} />
            ))}
          </div>
          <span className="text-sm font-bold text-brand">1,200+ परिवार जुड़े</span>
        </div>

        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 w-full flex items-center justify-center gap-2 bg-brand text-white font-bold py-3.5 rounded-full hover:bg-brand/90 transition-colors"
        >
          Choose This Plan <ArrowRight size={18} />
        </a>
      </div>
    </article>
  );
}

function SevaCard({ seva }: { seva: Seva }) {
  const { Icon } = seva;
  return (
    <div className="card-soft p-4 flex gap-3 items-start">
      <div className="w-14 h-14 rounded-2xl bg-brand-soft flex items-center justify-center shrink-0">
        <Icon size={26} className="text-brand" />
      </div>
      <div className="flex-1">
        <h4 className="font-bold text-foreground">{seva.title}</h4>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{seva.desc}</p>
      </div>
    </div>
  );
}

function TestimonialCard({ t }: { t: (typeof testimonials)[number] }) {
  const initials = t.n
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  return (
    <div className="card-soft p-5 min-w-[85%] snap-start">
      <p className="text-foreground/80 leading-relaxed text-[15px]">{t.q}</p>
      <div className="mt-5 pt-4 border-t border-black/5 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand to-[#a473c9] text-white flex items-center justify-center font-bold">
          {initials}
        </div>
        <div>
          <div className="font-bold text-foreground">{t.n}</div>
          <div className="text-sm text-muted-foreground">{t.city}</div>
        </div>
      </div>
    </div>
  );
}

function ReviewsCarousel() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const handler = () => {
      const idx = Math.round(el.scrollLeft / (el.clientWidth * 0.87));
      setActive(Math.min(idx, testimonials.length - 1));
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, []);

  return (
    <div>
      <div ref={scrollerRef} className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-none pb-2 -mx-4 px-4">
        {testimonials.map((t, i) => (
          <TestimonialCard key={i} t={t} />
        ))}
      </div>
      <div className="mt-4 flex justify-center items-center gap-1.5">
        {testimonials.map((_, i) => (
          <span
            key={i}
            className={`h-2 rounded-full transition-all ${i === active ? "w-6 bg-brand" : "w-2 bg-black/15"}`}
          />
        ))}
      </div>
    </div>
  );
}

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="card-soft overflow-hidden">
      {faqs.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className={`border-b border-black/5 last:border-b-0`}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className="w-full flex items-center justify-between text-left px-5 py-4 gap-3"
            >
              <span className="font-bold text-foreground">{f.q}</span>
              <ChevronDown
                size={20}
                className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            <div
              className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BottomNav({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  const tabs = [
    { id: "plans", label: "Home", Icon: Home },
    { id: "sevas", label: "My Sevas", Icon: Sparkles },
    { id: "reviews", label: "Proofs", Icon: ClipboardCheck },
    { id: "faq", label: "Account", Icon: User },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-black/5 md:hidden">
      <div className="max-w-2xl mx-auto flex items-stretch justify-around px-2 py-2 pb-[env(safe-area-inset-bottom,0.5rem)]">
        {tabs.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <button
              key={id}
              onClick={() => {
                onChange(id);
                document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="flex flex-col items-center gap-1 py-1 px-3 flex-1"
            >
              <Icon size={22} className={on ? "text-brand" : "text-muted-foreground"} />
              <span className={`text-[11px] font-semibold ${on ? "text-brand" : "text-muted-foreground"}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function WhatsAppFloat() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp"
      className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-40 w-14 h-14 rounded-full bg-whatsapp text-white flex items-center justify-center shadow-xl animate-pulse-ring"
    >
      <MessageCircle size={26} fill="white" />
    </a>
  );
}

// ---------------------- Page ----------------------
function HomePage() {
  const [active, setActive] = useState<string>("plans");

  const sectionIds = useMemo(() => FILTERS.map((f) => f.id), []);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [sectionIds]);

  return (
    <div id="top" className="min-h-screen bg-background">
      <Header />
      <FilterPills active={active} onChange={setActive} />

      <main className="max-w-2xl mx-auto px-4 pb-32 md:pb-16 pt-4 space-y-10">
        {/* Hero intro */}
        <section className="animate-fade-up">
          <div className="inline-flex items-center gap-2 bg-success/10 text-success text-xs font-bold px-3 py-1.5 rounded-full">
            <ShieldCheck size={14} /> 1,200+ परिवार जुड़े हैं
          </div>
          <h1 className="mt-3 text-3xl leading-tight font-bold text-foreground">
            हर घर में सुंदरकांड,<br />हर मन में राम।
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground leading-relaxed">
            तीर्थ गुरु पुष्करराज से आपके नाम एवं गोत्र से मासिक सुंदरकांड, हवन, गौ सेवा एवं ब्राह्मण भोज।
          </p>
        </section>

        {/* Plans */}
        <section id="plans" className="space-y-5 scroll-mt-32">
          <h2 className="text-2xl font-bold text-center">Plans</h2>
          <div className="space-y-5">
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p} />
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground pt-2">
            कोई Hidden Charges नहीं · कभी भी Cancel · 100% Secure via Razorpay
          </p>
        </section>

        {/* Sevas */}
        <section id="sevas" className="space-y-4 scroll-mt-32">
          <h2 className="text-2xl font-bold text-center">Our Sevas</h2>
          <div className="space-y-3">
            {sevas.map((s) => (
              <SevaCard key={s.title} seva={s} />
            ))}
          </div>
        </section>

        {/* Reviews */}
        <section id="reviews" className="space-y-4 scroll-mt-32">
          <h2 className="text-2xl font-bold text-center">Reviews</h2>
          <ReviewsCarousel />
        </section>

        {/* FAQ */}
        <section id="faq" className="space-y-4 scroll-mt-32">
          <h2 className="text-2xl font-bold text-center">FAQ's</h2>
          <FaqAccordion />
        </section>

        {/* Footer */}
        <footer className="pt-8 text-center space-y-2 text-sm text-muted-foreground">
          <div className="font-bold text-brand text-base">पुण्यता</div>
          <div>तीर्थ गुरु पुष्करराज, राजस्थान — 305022</div>
          <div>© 2026 पुण्यता · सर्वाधिकार सुरक्षित</div>
        </footer>
      </main>

      <WhatsAppFloat />
      <BottomNav active={active} onChange={setActive} />
    </div>
  );
}
