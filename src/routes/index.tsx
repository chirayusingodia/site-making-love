import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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
  Plus,
} from "lucide-react";
import { usePublicPlans, faqs } from "@/lib/plans";
import { PizzaComparison } from "@/components/PizzaComparison";
import { SiteChrome } from "@/components/site-chrome";
import { SlidingImageCard, type Slide } from "@/components/SlidingImageCard";
import { PunyaMeter } from "@/components/home/PunyaMeter";
import { useRevealOnScroll } from "@/hooks/use-reveal-on-scroll";
import { useTranslation } from "@/lib/translations";
import { LottieIcon } from "@/components/LottieIcon";
import { CountUp } from "@/components/CountUp";
import { ProofGallery } from "@/components/ProofGallery";
import { motion } from "framer-motion";
import namaste from "@/assets/lottie/namaste.json";
import diya from "@/assets/lottie/diya.json";
import whatsapp from "@/assets/lottie/whatsapp.json";
import lockSecure from "@/assets/lottie/lock-secure.json";
import heroPushkar from "@/assets/hero/pushkar-ghats.jpg";
import sundarkandSlideImg from "@/assets/plans/basic_seva.png";
import hawanSlideImg from "@/assets/sevas/hawan.png";
import gauSevaSlideImg from "@/assets/sevas/gau_seva.png";
import sadhuBhojanSlideImg from "@/assets/sevas/sadhu_bhojan.png";
import vanarSevaSlideImg from "@/assets/plans/varsh_1.png";
import deepdaanSlideImg from "@/assets/sevas/sarovar_deepdaan.png";
import heroWhatsapp from "@/assets/hero/whatsapp-proof.jpg";
import punyataStaticLogo from "@/assets/punyata-logo.svg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "पुण्यता — भारत का पुण्य साथी | तीर्थ गुरु पुष्करराज से मासिक सेवा" },
      { name: "description", content: "पुण्यता — अब भारत करेगा पुण्यता। तीर्थ गुरु पुष्करराज से आपके नाम एवं गोत्र से मासिक सुंदरकांड, हवन, आरती, गौ सेवा एवं साधु संतों को भोजन। WhatsApp पर Video Proof।" },
    ],
  }),
  component: HomePage,
});

const heroSlides: Slide[] = [
  { src: heroPushkar, alt: "तीर्थ गुरु पुष्करराज — पवित्र सरोवर एवं संध्या दीपदर्शन", title: "", subtitle: "" },
  { src: sundarkandSlideImg, alt: "आपके नाम व गोत्र से संकल्पबद्ध सुंदरकांड पाठ", title: "", subtitle: "" },
  { src: hawanSlideImg, alt: "वैदिक आहुति — गृह शांति एवं सर्व रोग निवारण हवन", title: "", subtitle: "" },
  { src: gauSevaSlideImg, alt: "गौ माता सेवा — हरा चारा एवं गुड़ अर्पण", title: "", subtitle: "" },
  { src: sadhuBhojanSlideImg, alt: "साधु संतों को भोजन — पुष्कर क्षेत्र सात्विक भोजन सत्कार", title: "", subtitle: "" },
  { src: vanarSevaSlideImg, alt: "वानर सेवा — श्री हनुमान जी के प्रिय फल व चना अर्पण", title: "", subtitle: "" },
  { src: deepdaanSlideImg, alt: "सरोवर दीपदान — पुष्कर सरोवर में मोक्ष प्रदायक दीप अर्पण", title: "", subtitle: "" },
  { src: heroWhatsapp, alt: "100% पारदर्शिता — हर सेवा का WhatsApp Video Proof", title: "", subtitle: "" },
];

function HomePage() {
  useRevealOnScroll();
  return (
    <SiteChrome>
      {/* Full-width hero carousel — sits above the headline */}
      <div className="w-full bg-background">
        <div className="max-w-5xl mx-auto md:px-4 md:pt-4">
          <SlidingImageCard slides={heroSlides} aspectRatio="video" rounded="md:rounded-3xl rounded-none" />
        </div>
      </div>
      <main className="max-w-2xl mx-auto px-4 pb-24 md:pb-16 pt-6 space-y-12">
        <Hero />
        <PunyaMeter />
        <Mission />
        <PlansPreview />
        <HowItWorks />
        <TrustPreview />
        <KaliyugShloks />
        <FamilySection />
        <FaqSection />
        <ContactFooter />
      </main>
    </SiteChrome>
  );
}

function Hero() {
  const { t, lang } = useTranslation();
  return (
    <section className="animate-fade-up">
      <div className="inline-flex items-center gap-2 bg-success/10 text-success text-xs font-bold px-3 py-1.5 rounded-full">
        <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
        {lang === "hindi" ? (
          <>
            <CountUp value={1200} /> परिवार इस सेवा से जुड़े हैं
          </>
        ) : (
          <>
            <CountUp value={1200} /> Families Connected With Us
          </>
        )}
      </div>
      <p className="mt-3 text-xs font-semibold text-brand tracking-wide uppercase">
        {t("hero_sub")}
      </p>
      <h1 className="mt-2 text-3xl md:text-4xl leading-tight font-bold text-foreground">
        {lang === "hindi" ? (
          <>पुण्य आपका,<br />सेवा हमारी। <span className="text-2xl">🕉️</span></>
        ) : (
          <>Punya Yours,<br />Service Ours. <span className="text-2xl">🕉️</span></>
        )}
      </h1>
      <p className="mt-3 text-[15px] text-muted-foreground leading-relaxed">
        {t("hero_desc")}
      </p>
      <Link
        to="/plans"
        className="mt-5 inline-flex items-center gap-2 bg-brand text-white font-bold px-6 py-3.5 rounded-full shadow-lg shadow-brand/25 btn-glow"
      >
        {t("hero_cta")} <ArrowRight size={18} />
      </Link>
    </section>
  );
}

function Mission() {
  const { t } = useTranslation();
  return (
    <section className="card-soft p-6 border border-brand/10 space-y-3">
      <div className="text-xs font-bold uppercase tracking-widest text-brand">{t("mission_relief")}</div>
      <h2 className="text-xl font-bold leading-snug">
        {t("mission_title")}
      </h2>
      <p className="text-[15px] text-foreground/80 leading-relaxed">
        {t("mission_desc")}
      </p>
      <p className="text-sm italic text-muted-foreground">
        {t("mission_quote")}
      </p>
    </section>
  );
}

const howItWorksContainerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
} as const;

const howItWorksCardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut",
    },
  },
} as const;

function HowItWorks() {
  const { t } = useTranslation();
  const steps = [
    { n: 1, t: t("hiw_step_1_title"), d: t("hiw_step_1_desc"), LottieData: namaste, loop: false, playOnView: true, fallback: <ScrollText size={32} className="text-brand" /> },
    { n: 2, t: t("hiw_step_2_title"), d: t("hiw_step_2_desc"), LottieData: diya, loop: true, playOnView: false, fallback: <Sparkles size={32} className="text-brand" /> },
    { n: 3, t: t("hiw_step_3_title"), d: t("hiw_step_3_desc"), LottieData: whatsapp, loop: true, playOnView: false, fallback: <ClipboardCheck size={32} className="text-brand" /> },
  ];
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold text-center">{t("hiw_title")}</h2>
      <motion.div
        variants={howItWorksContainerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        {steps.map(({ n, t: stepTitle, d, LottieData, loop, playOnView, fallback }) => (
          <motion.div
            key={n}
            variants={howItWorksCardVariants}
            className="card-soft p-5 text-center flex flex-col items-center justify-between"
          >
            <div className="w-20 h-20 bg-brand-soft rounded-full flex items-center justify-center">
              <LottieIcon
                animationData={LottieData}
                size={80}
                loop={loop}
                playOnView={playOnView}
                className="mx-auto"
                fallback={fallback}
              />
            </div>
            <div className="mt-3 text-xs font-bold text-brand">{t("hiw_step")} {n}</div>
            <div className="mt-1 font-bold">{stepTitle}</div>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{d}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

function TrustPreview() {
  return <ProofGallery />;
}

function KaliyugShloks() {
  const { t, lang } = useTranslation();
  const shloks = [
    {
      t: lang === "hindi" ? "श्रीरामचरितमानस" : "Ramcharitmanas",
      s: "कलिजुग केवल हरि गुन गाहा। गावत नर पावहिं भव थाहा॥",
      m: lang === "hindi" 
        ? "कलियुग में केवल भगवान श्रीहरि के गुण गान से ही मनुष्य भवसागर से पार हो जाता है।"
        : "In Kaliyug, simply singing the glories of Lord Hari carries a person across the ocean of worldly existence.",
    },
    {
      t: lang === "hindi" ? "श्रीमद्भगवद्गीता 17.20" : "Bhagavad Gita 17.20",
      s: "दातव्यमिति यद्दानं दीयतेऽनुपकारिणे।\nदेशे काले च पात्रे च तद्दानं सात्त्विकं स्मृतम्॥",
      m: lang === "hindi"
        ? "योग्य पात्र को, उचित स्थान और समय पर, बिना किसी प्रत्युपकार की आशा से दिया गया दान 'सात्त्विक दान' कहलाता है।"
        : "Charity given to a worthy person, at the right place and time, without expecting anything in return, is considered pure (Sattvik).",
    },
    {
      t: lang === "hindi" ? "शास्त्र वचन" : "Scriptures Say",
      s: "दानेन तुल्यं सुकृतं न कच्चित्।",
      m: lang === "hindi"
        ? "दान के समान कोई पुण्य नहीं है। यह पुण्य केवल इस जन्म तक सीमित नहीं — शास्त्रों के अनुसार आत्मा के साथ आगे भी चलता है।"
        : "There is no merit equal to charity. According to the scriptures, this merit is not limited to this life; it travels onward with the soul.",
    },
  ];
  return (
    <section className="rounded-3xl overflow-hidden bg-gradient-to-b from-[#5B1A1A] to-[#3D0F0F] text-white p-6 space-y-5">
      <div className="text-center">
        <div className="text-xs font-bold uppercase tracking-widest text-[#F5A742]">{t("kaliyug_badge")}</div>
        <h2 className="mt-2 text-2xl font-bold leading-snug">{t("kaliyug_title")}</h2>
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
        {t("kaliyug_footer")}
      </p>
    </section>
  );
}

function FamilySection() {
  const { t } = useTranslation();
  return (
    <section className="card-soft p-6 text-center space-y-3 border border-brand/10">
      <Users size={32} className="text-brand mx-auto" />
      <h2 className="text-xl font-bold">{t("family_title")}</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {t("family_desc")}
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
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isRefetching } = usePublicPlans();
  const visiblePlans = (data?.plans ?? []).filter((p) => p.isVisible !== false);

  return (
    <section id="plans" className="space-y-6 scroll-mt-20">
      <div className="text-center">
        <h2 className="text-2xl font-bold">{t("nav_plans")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("plans_sub")}</p>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card-soft overflow-hidden animate-pulse">
              <div className="aspect-video w-full bg-black/5" />
              <div className="p-4 space-y-3">
                <div className="h-4 w-3/4 bg-black/10 rounded" />
                <div className="h-3 w-full bg-black/5 rounded" />
                <div className="h-3 w-2/3 bg-black/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="card-soft border border-destructive/30 p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-foreground">Plans abhi load nahi ho paye.</p>
          <p className="text-xs text-muted-foreground">
            Live plan data fetch karne mein samasya aayi. Kripya punah prayas karein.
          </p>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="inline-flex items-center gap-2 bg-brand text-white text-xs font-bold px-5 py-2.5 rounded-full disabled:opacity-60"
          >
            {isRefetching ? "Retrying..." : "Retry"}
          </button>
        </div>
      ) : (
      <div
        className={`grid grid-cols-1 gap-6 ${
          visiblePlans.length === 1 ? "md:grid-cols-1" :
          visiblePlans.length === 2 ? "md:grid-cols-2" :
          "md:grid-cols-3"
        }`}
      >
        {visiblePlans.map((p) => {
          const isPopular = p.id === "grah";
          const isAnnual = p.id === "varsh";
          return (
            <Link
              key={p.id}
              to="/plan/$planId"
              params={{ planId: p.id }}
              className={`card-soft card-lift overflow-hidden flex flex-col relative group border ${
                isPopular ? "border-brand ring-2 ring-brand/10" : "border-black/5"
              }`}
            >
              {isPopular && (
                <div className="absolute top-3 right-3 z-10 bg-brand text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                  POPULAR
                </div>
              )}
              {isAnnual && (
                <div className="absolute top-3 right-3 z-10 bg-success text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                  SAVE
                </div>
              )}
              
              {/* Image Area */}
              <div className="relative aspect-video w-full overflow-hidden bg-muted">
                <img
                  src={p.image}
                  alt={p.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3.5">
                <div className="space-y-2">
                  <h3 className="font-extrabold text-sm text-foreground group-hover:text-brand transition-colors line-clamp-2">
                    {p.heading}
                  </h3>
                  
                  <p className="text-[11px] text-muted-foreground leading-normal line-clamp-2">
                    {p.subheading}
                  </p>
                </div>

                {/* Visual Pizza/Dinner Comparison */}
                <PizzaComparison planId={p.id} price={p.price} cycle={p.cycle} size="sm" />

                <div className="text-[11px] text-muted-foreground leading-normal border-t border-black/5 pt-2.5">
                  <div className="font-bold text-[9px] text-foreground/70 uppercase tracking-wider mb-0.5">सेवा सूची:</div>
                  {p.serviceTags.join(" + ")}
                </div>

                <div className="pt-2.5 border-t border-black/5 flex items-center justify-between text-[11px] font-bold text-brand group-hover:translate-x-1 transition-transform duration-200">
                  <span>विवरण देखें</span>
                  <div className="w-6 h-6 rounded-full bg-brand-soft flex items-center justify-center text-brand">
                    <ArrowRight size={12} />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      )}
      <div className="text-center">
        <Link to="/plans" className="inline-flex items-center gap-2 bg-brand text-white font-bold px-6 py-3 rounded-full hover:bg-brand-deep transition-colors primary-btn-glow">
          See Full Plans <ArrowRight size={16} />
        </Link>
      </div>
      <div className="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
        <LottieIcon
          animationData={lockSecure}
          size={20}
          loop
          autoplay
          className="shrink-0 animate-pulse"
          fallback={<ShieldCheck size={12} className="text-success shrink-0" />}
        />
        <span>{t("plans_footer")}</span>
      </div>
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
                <Plus size={20} className={`text-muted-foreground shrink-0 transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`} />
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
      <div className="flex flex-col items-center justify-center gap-1.5">
        <img src={punyataStaticLogo} alt="Punyata Logo" className="w-10 h-10" />
        <div className="font-bold text-brand text-base leading-none">पुण्यता</div>
      </div>
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
