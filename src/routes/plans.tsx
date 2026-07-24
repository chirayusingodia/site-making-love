import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, X, MapPin, Video, BookOpen, Flame, Heart, Users, Sun as SunIcon } from "lucide-react";
import { ComparisonTable } from "@/components/ComparisonTable";
import { plans, sevaList, acharyas, type Plan } from "@/lib/plans";
import { SiteChrome } from "@/components/site-chrome";
import { SlidingImageCard, type Slide } from "@/components/SlidingImageCard";
import { LottieIcon } from "@/components/LottieIcon";
import { CountUp } from "@/components/CountUp";
import { PizzaComparison } from "@/components/PizzaComparison";
import checkmark from "@/assets/lottie/checkmark.json";
import giftBox from "@/assets/lottie/gift-box.json";
import diya from "@/assets/lottie/diya.json";
import pushkarGhatImg from "@/assets/pushkar-ghat.jpg";
import { useTranslation } from "@/lib/translations";

const planSlides: Record<string, { title: string; subtitle: string }[]> = {
  basic: [
    { title: "Sankalp • Aapke Naam Se", subtitle: "Har mahina naam-gotra se sankalp" },
    { title: "Chadava • Maa Ke Charno Mein", subtitle: "Pushp aur naivedya arpan" },
    { title: "Aarti • Divya Deepak", subtitle: "Har seva ke saath poorna aarti" },
  ],
  grah: [
    { title: "Hawan • Agni Devta Ka Aashirwad", subtitle: "Vaidik mantron se grah shanti" },
    { title: "Sundarkand Paath • Sankat Haran", subtitle: "Bigade kaam banane wala paath" },
    { title: "Gau Seva • Gau Mata Ka Punya", subtitle: "Chara aur gud arpan" },
  ],
  varsh: [
    { title: "Vanara Seva • Bajrangbali Ka Ashirwad", subtitle: "Kela evam chana arpan" },
    { title: "Saadhu Santo Ko Bhojan • Anna Daan", subtitle: "Saadhu santon ko bhojan aur satkar" },
    { title: "Poore Saal Ka Punya, Ek Sath", subtitle: "12 mahine ka akhand sankalp" },
  ],
};

export const Route = createFileRoute("/plans")({
  head: () => ({
    meta: [
      { title: "Plans — पुण्यता | ₹251/Monthly से मासिक सुंदरकांड, हवन, आरती एवं दान-पुण्य" },
      { name: "description", content: "पुण्यता के 3 पैक — मूल संकल्प, गृह शांति एवं वार्षिक महासंकल्प। Pooja + Chadava + Hawan + Aarti + Daan + Sewa एक साथ। तीर्थ गुरु पुष्करराज से।" },
    ],
  }),
  component: PlansPage,
});

const iconMap = { BookOpen, Flame, Sun: SunIcon, Wind: Heart, Heart, Users };

function PlansPage() {
  const visiblePlans = plans.filter((p) => p.isVisible !== false);

  return (
    <SiteChrome>
      <main className="max-w-3xl mx-auto px-4 pb-24 md:pb-16 pt-4 space-y-12">
        <header className="text-center animate-fade-up">
          <div className="text-xs font-bold uppercase tracking-widest text-brand">Choose Your Sankalp</div>
          <h1 className="mt-2 text-3xl font-bold">Punyata Plans</h1>
          <p className="mt-2 text-[15px] text-muted-foreground max-w-xl mx-auto">
            हर पैक में — Pooja + Chadava + Daan + Sewa + Aarti। एक ही सदस्यता में 4 परिवारजनों तक का संकल्प।
          </p>
        </header>

        {/* Plan cards */}
        <section
          className={`grid grid-cols-1 gap-5 ${
            visiblePlans.length === 1 ? "md:grid-cols-1" :
            visiblePlans.length === 2 ? "md:grid-cols-2" :
            "md:grid-cols-3"
          }`}
        >
          {visiblePlans.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </section>

        {/* Shared Plan Comparison Table */}
        <ComparisonTable />

        {/* Sundarkand Mahatmya */}
        <section className="rounded-3xl overflow-hidden bg-gradient-to-b from-[#5B1A1A] to-[#3D0F0F] text-white">
          <div className="p-6 space-y-4">
            <div className="text-xs font-bold uppercase tracking-widest text-[#F5A742]">सुंदरकांड का महात्म्य</div>
            <h2 className="text-2xl font-bold text-white leading-snug">जहाँ सुंदरकांड, वहाँ संकट का नाश।</h2>
            <blockquote className="text-[15px] italic text-white/85 border-l-2 border-[#F5A742] pl-3 leading-relaxed">
              "सुंदरकांड का पाठ करने वाले के घर में न दरिद्रता रहती है, न रोग, न शोक, न भय।"
            </blockquote>
            <p className="text-[14.5px] text-white/80 leading-relaxed">
              श्री राम चरितमानस का सुंदरकांड — एकमात्र ऐसा कांड है जिसमें श्री हनुमान जी ने स्वयं अपने पराक्रम से असंभव को संभव कर दिखाया। यह पाठ साक्षात हनुमान जी का आवाहन है — बिगड़े काम बनते हैं, ग्रह दोष शांत होते हैं, और परिवार में सकारात्मक ऊर्जा का संचार होता है।
            </p>
            <div className="rounded-2xl bg-white/10 border border-white/15 p-4 space-y-2">
              <div className="text-xs text-white/70">आज के समय में सुंदरकांड की लागत</div>
              <div className="text-3xl font-bold text-[#F5A742]">₹7,000–11,000</div>
              <div className="text-xs text-white/70">सामान्य आचार्य शुल्क</div>
              <p className="text-[14px] text-white/85 leading-relaxed pt-2 border-t border-white/10">
                इसलिए श्री हनुमान जी की कृपा से हमने संकल्प लिया — यह पुण्य हर घर तक पहुँचे। सामूहिक संकल्प के माध्यम से मात्र{" "}
                <span className="font-bold text-[#F5A742]">₹251</span> में आपके नाम और गोत्र से सुंदरकांड पाठ।
              </p>
            </div>
          </div>
          <img src={pushkarGhatImg} alt="तीर्थ गुरु पुष्करराज" className="w-full h-48 object-cover" />
        </section>

        {/* Our Sevas */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-center">Our Sevas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sevaList.map((s) => {
              const Icon = (iconMap as any)[s.iconKey] || BookOpen;
              return (
                <div key={s.title} className="card-soft p-4 flex gap-3 items-start">
                  <div className="w-14 h-14 rounded-2xl bg-brand-soft flex items-center justify-center shrink-0">
                    <Icon size={26} className="text-brand" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-foreground">{s.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Acharyas */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-center">हमारे आचार्य</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {acharyas.map((a) => (
              <div key={a.name} className="card-soft p-5">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand to-[#F5A742] text-white flex items-center justify-center font-bold text-xl">
                  {a.initials}
                </div>
                <h4 className="mt-3 font-bold text-foreground text-[17px]">{a.name}</h4>
                <div className="text-xs font-semibold text-brand mt-0.5">{a.role}</div>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{a.bio}</p>
                <p className="mt-3 text-sm italic text-foreground/80 border-l-2 border-brand pl-3">"{a.quote}"</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </SiteChrome>
  );
}



function PlanCard({ plan }: { plan: (typeof plans)[number] }) {
  const badgeColor =
    plan.badge?.kind === "popular"
      ? "bg-gradient-to-r from-[#FDD9C3] to-[#F5A742] text-[#7A3A00]"
      : plan.badge?.kind === "save"
        ? "bg-success text-white"
        : "bg-gradient-to-r from-[#FDD9C3] to-[#F5A742] text-[#7A3A00]";

  const { t, lang } = useTranslation();

  const slides = (plan.slides ?? []).map((slide) => ({
    src: slide.src,
    alt: slide.title,
    title: slide.title,
    subtitle: slide.subtitle,
    step: slide.step,
  }));

  return (
    <article className="card-soft card-lift overflow-hidden relative animate-fade-up flex flex-col">
      <div className="relative">
        {plan.ribbon && <PlanRibbon text={plan.ribbon} />}
        {plan.badge && (
          <div className={`absolute top-3 right-3 z-20 px-3 py-1.5 rounded-full text-xs font-bold ${badgeColor} shadow-md`}>
            {plan.badge.label}
          </div>
        )}
        {slides.length > 0 ? (
          <SlidingImageCard slides={slides} aspectRatio="4/5" rounded="rounded-none" />
        ) : (
          <img src={plan.image} alt={plan.name} className="w-full h-48 object-cover" />
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col justify-between">
        <div className="space-y-3.5">
          {/* Service tag pill row */}
          <div className="inline-flex items-center gap-1.5 bg-brand-soft border border-brand/20 text-brand text-[11px] font-bold px-3 py-1.5 rounded-full self-start">
            🪔 {plan.serviceTags.join(" + ")}
          </div>

          <h3 className="text-base font-extrabold leading-snug text-foreground text-left">
            {plan.heading}
          </h3>
          
          <p className="text-xs text-muted-foreground leading-normal text-left">
            {plan.subheading}
          </p>

          {/* Visual Pizza/Dinner Comparison */}
          <PizzaComparison planId={plan.id} price={plan.price} cycle={plan.cycle} />

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 bg-[#5B1A1A] text-[#F5A742] text-[10px] font-bold px-2 py-1 rounded-full">
              Daan-Punya एक साथ
            </span>
            <span className="inline-flex items-center gap-1 bg-success/10 text-success text-[10px] font-bold px-2 py-1 rounded-full">
              <Video size={10} /> Video Proof
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">{plan.tagline}</p>

          <div className="flex items-center gap-1.5 text-xs">
            <MapPin size={12} className="text-brand" />
            <span className="text-foreground">{plan.location}</span>
          </div>

          <div className="border-t border-black/5 pt-4 space-y-2">
            {plan.features.map((f) => {
              const lower = f.toLowerCase();
              const isPrasadBox = lower.includes("prasad box") || lower.includes("prasad & certificate");
              
              let iconElement = <Check size={16} className="text-success shrink-0 mt-0.5" />;
              
              if (isPrasadBox) {
                iconElement = (
                  <LottieIcon
                    animationData={giftBox}
                    size={24}
                    playOnView
                    loop={false}
                    className="shrink-0 -mt-0.5"
                    fallback={<Check size={16} className="text-success shrink-0 mt-0.5" />}
                  />
                );
              } else if (lower.includes("sundarkand") || lower.includes("सुंदरकांड")) {
                iconElement = <BookOpen size={16} className="text-brand shrink-0 mt-0.5" />;
              } else if (lower.includes("hawan") || lower.includes("हवन") || lower.includes("aarti") || lower.includes("आरती")) {
                iconElement = <Flame size={16} className="text-[#D85A30] shrink-0 mt-0.5" />;
              } else if (lower.includes("gau") || lower.includes("गौ") || lower.includes("vanar") || lower.includes("वानर")) {
                iconElement = <Heart size={16} className="text-[#3FAE55] shrink-0 mt-0.5" />;
              } else if (lower.includes("bhojan") || lower.includes("भोजन") || lower.includes("sant") || lower.includes("साधु")) {
                iconElement = <Users size={16} className="text-brand shrink-0 mt-0.5" />;
              } else if (lower.includes("proof") || lower.includes("प्रमाण") || lower.includes("video") || lower.includes("whatsapp")) {
                iconElement = <Video size={16} className="text-[#25D366] shrink-0 mt-0.5" />;
              }
              
              return (
                <div key={f} className="flex items-start gap-2.5 text-sm">
                  {iconElement}
                  <span className="text-foreground/85 text-xs">{f}</span>
                </div>
              );
            })}
          </div>
        </div>

        <Link
          to="/plan/$planId"
          params={{ planId: plan.id }}
          className="mt-5 w-full flex items-center justify-center gap-2 bg-brand text-white font-bold py-3 rounded-full hover:bg-brand-deep transition-colors primary-btn-glow"
        >
          {lang === "hindi" ? "पुण्य शुरू करें" : "Punya Start Kare"} <ArrowRight size={18} />
        </Link>
      </div>
    </article>
  );
}

function PlanRibbon({ text }: { text: string }) {
  const match = text.match(/^(\d+)\+(.*)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const rest = match[2];
    return (
      <div className="ribbon flex items-center justify-center gap-1 font-bold">
        <CountUp value={num} suffix="+" />
        <span>{rest}</span>
      </div>
    );
  }
  return <div className="ribbon">{text}</div>;
}


