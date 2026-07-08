import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  Video,
  ShieldCheck,
  Sparkles,
  Users,
  ScrollText,
  ChevronDown,
} from "lucide-react";
import pushkarGhatImg from "@/assets/pushkar-ghat.jpg";
import havanImg from "@/assets/havan.jpg";
import gauImg from "@/assets/gau-seva.jpg";
import { plans, testimonials, faqs } from "@/lib/plans";
import { SiteChrome } from "@/components/site-chrome";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "पुण्यता — भारत का पुण्य साथी | तीर्थ गुरु पुष्करराज से मासिक सेवा" },
      { name: "description", content: "पुण्यता — अब भारत करेगा पुण्यता। तीर्थ गुरु पुष्करराज से आपके नाम एवं गोत्र से मासिक सुंदरकांड, हवन, आरती, गौ सेवा एवं ब्राह्मण भोज। WhatsApp पर Video Proof।" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <SiteChrome>
      <main className="max-w-2xl mx-auto px-4 pb-24 md:pb-16 pt-4 space-y-12">
        <Hero />
        <Mission />
        <HowItWorks />
        <TrustPreview />
        <KaliyugShloks />
        <FamilySection />
        <PlansPreview />
        <FaqSection />
        <ContactFooter />
      </main>
    </SiteChrome>
  );
}

function Hero() {
  return (
    <section className="animate-fade-up">
      <div className="inline-flex items-center gap-2 bg-success/10 text-success text-xs font-bold px-3 py-1.5 rounded-full">
        <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
        1,200+ परिवार इस सेवा से जुड़े हैं
      </div>
      <p className="mt-3 text-xs font-semibold text-brand tracking-wide uppercase">
        जय सियाराम • तीर्थ गुरु पुष्करराज से
      </p>
      <h1 className="mt-2 text-3xl md:text-4xl leading-tight font-bold text-foreground">
        पुण्य आपका,<br />सेवा हमारी। <span className="text-2xl">🕉️</span>
      </h1>
      <p className="mt-3 text-[15px] text-muted-foreground leading-relaxed">
        व्यस्तता के कारण खुद दान-पुण्य, हवन, पूजा नहीं कर पाते? पुण्यता आपके नाम एवं गोत्र से तीर्थ गुरु पुष्करराज में यह ज़िम्मेदारी निभाता है — हर सेवा का प्रमाण सीधे आपके WhatsApp पर।
      </p>
      <Link
        to="/plans"
        className="mt-5 inline-flex items-center gap-2 bg-brand text-white font-bold px-6 py-3.5 rounded-full hover:bg-brand-deep transition-colors shadow-lg shadow-brand/25"
      >
        See Plans — ₹251/Monthly से शुरू <ArrowRight size={18} />
      </Link>
    </section>
  );
}

function Mission() {
  return (
    <section className="card-soft p-6 border border-brand/10 space-y-3">
      <div className="text-xs font-bold uppercase tracking-widest text-brand">The Relief</div>
      <h2 className="text-xl font-bold leading-snug">
        व्यस्तता की वजह से पुण्य पीछे न रह जाए।
      </h2>
      <p className="text-[15px] text-foreground/80 leading-relaxed">
        शहर की दौड़-भाग में हर घर अपने दान-पुण्य, हवन और पूजा से दूर होता जा रहा है। पुण्यता यह ज़िम्मेदारी अपने ऊपर लेता है — आपके नाम, आपके गोत्र, आपके संकल्प से।
      </p>
      <p className="text-sm italic text-muted-foreground">
        "हम आपकी ज़िम्मेदारी नहीं लेते — हम उसे आपकी ओर से निभाते हैं।"
      </p>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: 1, t: "संकल्प (Sankalp)", d: "अपने नाम एवं गोत्र से मासिक संकल्प लें।", Icon: ScrollText },
    { n: 2, t: "सेवा (Seva)", d: "तीर्थ गुरु पुष्करराज में आपकी सेवा सम्पन्न होती है।", Icon: Sparkles },
    { n: 3, t: "प्रमाण (Pramaan)", d: "हर अनुष्ठान का Video Proof आपके WhatsApp पर।", Icon: ClipboardCheck },
  ];
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold text-center">कैसे काम करता है</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {steps.map(({ n, t, d, Icon }) => (
          <div key={n} className="card-soft p-5 text-center">
            <div className="w-12 h-12 rounded-full bg-brand-soft flex items-center justify-center mx-auto">
              <Icon size={22} className="text-brand" />
            </div>
            <div className="mt-3 text-xs font-bold text-brand">STEP {n}</div>
            <div className="mt-1 font-bold">{t}</div>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrustPreview() {
  const imgs = [pushkarGhatImg, havanImg, gauImg];
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <h2 className="text-2xl font-bold">Proof Gallery</h2>
        <Link to="/reviews" className="text-sm font-bold text-brand">See All →</Link>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {imgs.map((src, i) => (
          <div key={i} className="relative rounded-xl overflow-hidden aspect-square">
            <img src={src} alt="Proof" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute bottom-1.5 left-1.5 text-[10px] font-bold text-white bg-black/40 px-1.5 py-0.5 rounded">
              <Video size={10} className="inline mr-0.5" /> Video
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-center text-muted-foreground">
        हर सेवा का Live/Video Proof — WhatsApp पर हर माह।
      </p>
    </section>
  );
}

function KaliyugShloks() {
  const shloks = [
    {
      t: "श्रीरामचरितमानस",
      s: "कलिजुग केवल हरि गुन गाहा। गावत नर पावहिं भव थाहा॥",
      m: "कलियुग में केवल भगवान श्रीहरि के गुण गान से ही मनुष्य भवसागर से पार हो जाता है।",
    },
    {
      t: "श्रीमद्भगवद्गीता 17.20",
      s: "दातव्यमिति यद्दानं दीयतेऽनुपकारिणे।\nदेशे काले च पात्रे च तद्दानं सात्त्विकं स्मृतम्॥",
      m: "योग्य पात्र को, उचित स्थान और समय पर, बिना किसी प्रत्युपकार की आशा से दिया गया दान 'सात्त्विक दान' कहलाता है।",
    },
    {
      t: "शास्त्र वचन",
      s: "दानेन तुल्यं सुकृतं न कच्चित्।",
      m: "दान के समान कोई पुण्य नहीं है। यह पुण्य केवल इस जन्म तक सीमित नहीं — शास्त्रों के अनुसार आत्मा के साथ आगे भी चलता है।",
    },
  ];
  return (
    <section className="rounded-3xl overflow-hidden bg-gradient-to-b from-[#5B1A1A] to-[#3D0F0F] text-white p-6 space-y-5">
      <div className="text-center">
        <div className="text-xs font-bold uppercase tracking-widest text-[#F5A742]">कलियुग में दान-पुण्य</div>
        <h2 className="mt-2 text-2xl font-bold leading-snug">पुण्य ही एकमात्र संचित धन है।</h2>
      </div>
      <div className="space-y-3">
        {shloks.map((sh) => (
          <div key={sh.t} className="rounded-2xl bg-white/10 border border-white/15 p-4 space-y-2">
            <div className="text-[11px] font-bold text-[#F5A742] uppercase tracking-wider">{sh.t}</div>
            <p className="font-bold text-[15px] leading-relaxed whitespace-pre-line text-white">{sh.s}</p>
            <p className="text-sm text-white/80 leading-relaxed italic">{sh.m}</p>
          </div>
        ))}
      </div>
      <p className="text-center text-[13px] text-white/75 italic leading-relaxed pt-2">
        जब हम स्वयं दान-पुण्य नहीं कर पाते — तो पुण्यता यह पवित्र कर्तव्य आपके नाम से निभाता है।
      </p>
    </section>
  );
}

function FamilySection() {
  return (
    <section className="card-soft p-6 text-center space-y-3 border border-brand/10">
      <Users size={32} className="text-brand mx-auto" />
      <h2 className="text-xl font-bold">पूरे परिवार के लिए</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        एक सदस्यता — 4 सदस्यों तक का संकल्प। हर व्यक्ति का नाम एवं गोत्र संकल्प में बोला जाता है।
      </p>
      <div className="flex justify-center -space-x-2 pt-2">
        {["#F5A742", "#E85D1F", "#3FAE55", "#C0362C"].map((c, i) => (
          <div key={i} className="w-10 h-10 rounded-full border-2 border-white flex items-center justify-center text-white font-bold text-sm" style={{ background: c }}>
            {["P", "M", "S", "C"][i]}
          </div>
        ))}
      </div>
    </section>
  );
}

function PlansPreview() {
  return (
    <section className="space-y-5">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Plans</h2>
        <p className="text-sm text-muted-foreground mt-1">₹251/Monthly से शुरू • 4 सदस्यों तक</p>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {plans.map((p) => (
          <Link
            key={p.id}
            to="/plan/$planId"
            params={{ planId: p.id }}
            className="card-soft p-4 flex items-center gap-4 hover:shadow-md transition-shadow"
          >
            <img src={p.image} alt={p.name} className="w-20 h-20 rounded-2xl object-cover shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{p.name}</div>
              <div className="text-brand font-bold">
                {p.price}<span className="text-xs text-muted-foreground font-medium">{p.cycle}</span>
              </div>
              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                {p.serviceTags.join(" + ")}
              </div>
            </div>
            <ArrowRight size={18} className="text-brand shrink-0" />
          </Link>
        ))}
      </div>
      <div className="text-center">
        <Link to="/plans" className="inline-flex items-center gap-2 bg-brand text-white font-bold px-6 py-3 rounded-full hover:bg-brand-deep transition-colors">
          See Full Plans <ArrowRight size={16} />
        </Link>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        <ShieldCheck size={12} className="inline mr-1" />
        कोई Hidden Charges नहीं · कभी भी Cancel · 100% Secure via Razorpay
      </p>
    </section>
  );
}

function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="space-y-4 scroll-mt-32">
      <h2 className="text-2xl font-bold text-center">FAQ's</h2>
      <div className="card-soft overflow-hidden">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="border-b border-black/5 last:border-b-0">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full flex items-center justify-between text-left px-5 py-4 gap-3"
              >
                <span className="font-bold text-foreground">{f.q}</span>
                <ChevronDown size={20} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              <div className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ContactFooter() {
  return (
    <footer className="pt-4 pb-4 text-center space-y-2 text-sm text-muted-foreground">
      <div className="font-bold text-brand text-base">पुण्यता</div>
      <div>तीर्थ गुरु पुष्करराज, राजस्थान — 305022</div>
      <div className="flex justify-center gap-4 text-xs pt-2">
        <Link to="/about" className="hover:text-brand">About</Link>
        <Link to="/plans" className="hover:text-brand">Plans</Link>
        <Link to="/reviews" className="hover:text-brand">Reviews</Link>
      </div>
      <div className="text-xs">© 2026 पुण्यता · सर्वाधिकार सुरक्षित</div>
    </footer>
  );
}

// Backwards-compat re-exports for existing imports in other route files
export { Header, WhatsAppFloat, BottomNav, SiteChrome } from "@/components/site-chrome";
