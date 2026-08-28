import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, X, MapPin, Video, BookOpen, Flame, Heart, Users, Sun as SunIcon, AlertTriangle, RefreshCw } from "lucide-react";
import { ComparisonTable } from "@/components/ComparisonTable";
import { usePublicPlans, acharyas, type Plan } from "@/lib/plans";
import { SiteChrome } from "@/components/site-chrome";
import { SlidingImageCard, type Slide } from "@/components/SlidingImageCard";
import { LottieIcon } from "@/components/LottieIcon";
import { CountUp } from "@/components/CountUp";
import { PizzaComparison } from "@/components/PizzaComparison";
import checkmark from "@/assets/lottie/checkmark.json";
import giftBox from "@/assets/lottie/gift-box.json";
import diya from "@/assets/lottie/diya.json";
import { CldImage, IMAGE_SIZES } from "@/components/CldImage";
import { SITE_IMAGES } from "@/lib/site-images";
import { useTranslation } from "@/lib/translations";

export const Route = createFileRoute("/plans")({
  head: () => ({
    meta: [
      { title: "Plans — पुण्यता | ₹251/Monthly से मासिक सुंदरकांड, हवन, आरती एवं दान-पुण्य" },
      { name: "description", content: "पुण्यता के 3 पैक — मूल संकल्प, गृह शांति एवं वार्षिक महासंकल्प। Pooja + Chadava + Hawan + Aarti + Daan + Sewa एक साथ। तीर्थ गुरु पुष्करराज से।" },
    ],
    links: [{ rel: "canonical", href: "https://www.punyata.com/plans" }],
  }),
  component: PlansPage,
});

const iconMap = { BookOpen, Flame, Sun: SunIcon, Wind: Heart, Heart, Users };

function PlansPage() {
  const { data, isLoading, isError, refetch, isRefetching } = usePublicPlans();
  const visiblePlans = (data?.plans ?? []).filter((p) => p.isVisible !== false);
  const sevaList = data?.sevaList ?? [];
  // Live cheapest monthly plan price for the Sundarkand Mahatmya section (no hardcoded ₹)
  const cheapestMonthly = visiblePlans
    .filter((p) => p.billingPeriod === "monthly")
    .sort((a, b) => a.priceNumeric - b.priceNumeric)[0];

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

        {/* Plan cards — live from Supabase plans + plan_sevas */}
        {isLoading ? (
          <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card-soft overflow-hidden animate-pulse">
                <div className="aspect-[4/5] bg-black/5" />
                <div className="p-5 space-y-3">
                  <div className="h-4 w-2/3 bg-black/10 rounded" />
                  <div className="h-3 w-full bg-black/5 rounded" />
                  <div className="h-3 w-5/6 bg-black/5 rounded" />
                  <div className="h-10 w-full bg-black/10 rounded-full" />
                </div>
              </div>
            ))}
          </section>
        ) : isError ? (
          <section className="card-soft border border-destructive/30 p-8 text-center space-y-3">
            <AlertTriangle size={32} className="text-destructive mx-auto" />
            <p className="text-sm font-semibold text-foreground">Plans abhi load nahi ho paye.</p>
            <p className="text-xs text-muted-foreground">
              Live plan data fetch karne mein samasya aayi. Kripya punah prayas karein.
            </p>
            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="inline-flex items-center gap-2 bg-brand text-white text-xs font-bold px-5 py-2.5 rounded-full disabled:opacity-60"
            >
              <RefreshCw size={14} className={isRefetching ? "animate-spin" : ""} />
              {isRefetching ? "Retrying..." : "Retry"}
            </button>
          </section>
        ) : (
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
        )}

        {/* Shared Plan Comparison Table */}
        <ComparisonTable />

        {/* Sundarkand Mahatmya */}
        <section className="card-soft overflow-hidden">
          {/* Hero band: photo with a warm scrim carrying the title */}
          <div className="relative">
            <CldImage
              publicId={SITE_IMAGES.pushkarGhat.publicId}
              fallback={SITE_IMAGES.pushkarGhat.fallback}
              alt={SITE_IMAGES.pushkarGhat.alt}
              width={SITE_IMAGES.pushkarGhat.w}
              height={SITE_IMAGES.pushkarGhat.h}
              sizes={IMAGE_SIZES.fullBleed}
              crop="fill"
              className="w-full h-56 md:h-64 object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#5B1A1A]/90 via-[#5B1A1A]/45 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#F5A742]">सुंदरकांड का महात्म्य</div>
              <h2 className="text-2xl md:text-3xl font-bold text-white leading-snug drop-shadow-sm">
                जहाँ सुंदरकांड, वहाँ संकट का नाश।
              </h2>
            </div>
          </div>

          <div className="p-6 md:p-8 space-y-5">
            <blockquote className="relative text-[17px] md:text-[19px] leading-relaxed text-[#5B1A1A] font-medium pl-5">
              <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-[#F5A742] to-[#E85D1F]" />
              "सुंदरकांड का पाठ करने वाले के घर में न दरिद्रता रहती है, न रोग, न शोक, न भय।"
            </blockquote>

            <p className="text-[15px] text-foreground/75 leading-relaxed">
              श्री राम चरितमानस का सुंदरकांड — एकमात्र ऐसा कांड है जिसमें श्री हनुमान जी ने स्वयं अपने पराक्रम से असंभव को संभव कर दिखाया। यह पाठ साक्षात हनुमान जी का आवाहन है — बिगड़े काम बनते हैं, ग्रह दोष शांत होते हैं, और परिवार में सकारात्मक ऊर्जा का संचार होता है।
            </p>

            {/* Cost comparison */}
            <div className="rounded-2xl bg-[#FFF6EE] border border-[#F5A742]/30 p-5 md:p-6 space-y-5">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    आज के समय में सुंदरकांड की लागत
                  </div>
                  <div className="text-2xl font-bold text-foreground/45 line-through decoration-[#C0362C]/50 decoration-2">
                    ₹7,000–11,000
                  </div>
                  <div className="text-xs text-muted-foreground">सामान्य आचार्य शुल्क</div>
                </div>

                <div className="hidden sm:block self-stretch w-px bg-[#F5A742]/30" />

                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-brand">
                    सामूहिक संकल्प से
                  </div>
                  <div className="text-4xl font-bold text-brand leading-none">
                    {cheapestMonthly ? cheapestMonthly.price : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">आपके नाम और गोत्र से</div>
                </div>
              </div>

              <p className="text-[15px] text-foreground/75 leading-relaxed pt-4 border-t border-[#F5A742]/25">
                इसलिए श्री हनुमान जी की कृपा से हमने संकल्प लिया — यह पुण्य हर घर तक पहुँचे।
              </p>
            </div>
          </div>
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



function PlanCard({ plan }: { plan: Plan }) {
  const badgeColor =
    plan.badge?.kind === "popular"
      ? "bg-gradient-to-r from-[#FDD9C3] to-[#F5A742] text-[#7A3A00]"
      : plan.badge?.kind === "save"
        ? "bg-success text-white"
        : "bg-gradient-to-r from-[#FDD9C3] to-[#F5A742] text-[#7A3A00]";

  const { t, lang } = useTranslation();

  const slides: Slide[] = (plan.slides ?? []).map((slide) => ({
    image: slide.image,
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
          <SlidingImageCard slides={slides} aspectRatio="4/5" rounded="rounded-none" sizes={IMAGE_SIZES.card} />
        ) : (
          <CldImage
            publicId={plan.image.publicId}
            fallback={plan.image.fallback}
            alt={plan.name}
            width={plan.image.w}
            height={plan.image.h}
            sizes={IMAGE_SIZES.card}
            crop="fill"
            className="w-full h-48 object-cover"
          />
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

// [Bug 3.10] The CountUp path requires the explicit "N+ text"
// convention (digits, plus, WHITESPACE). The old regex matched ANY
// "digits+anything", so content like "2+1 ऑफर" silently re-rendered
// through the animated counter branch.
const RIBBON_COUNTUP_RE = /^(\d{1,6})\+\s+(.+)$/;

function PlanRibbon({ text }: { text: string }) {
  const match = text.match(RIBBON_COUNTUP_RE);
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


