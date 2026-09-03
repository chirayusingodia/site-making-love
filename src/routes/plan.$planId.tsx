import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, MapPin, Video, Star, ShieldCheck, ScrollText, ListChecks, Quote, Sparkles } from "lucide-react";
import { ChadhavaHeartBadge, AuthenticityTrust } from "@/components/TrustAuthenticity";
import { usePublicPlans, getPlanById, fetchPublicPlansData, type Plan } from "@/lib/plans";
import { Header, WhatsAppFloat } from "@/components/site-chrome";
import { SevaFlow } from "@/components/SevaFlow";
import { SlidingImageCard, type Slide } from "@/components/SlidingImageCard";
import { CountUp } from "@/components/CountUp";
import { useTranslation } from "@/lib/translations";
import { LottieIcon } from "@/components/LottieIcon";
import { PizzaComparison } from "@/components/PizzaComparison";
import { ComparisonTable } from "@/components/ComparisonTable";
import diya from "@/assets/lottie/diya.json";
import { motion } from "framer-motion";
import { CldImage, IMAGE_SIZES } from "@/components/CldImage";
import { fetchPageSeo, pageSeoMeta } from "@/lib/page-seo";

export const Route = createFileRoute("/plan/$planId")({
  head: async ({ params }) => {
    const [seo, planData] = await Promise.all([
      fetchPageSeo(`/plan/${params.planId}`),
      fetchPublicPlansData().catch(() => null),
    ]);
    const plan = planData ? getPlanById(planData.plans, params.planId) : undefined;

    const fallbackTitle = plan
      ? `${plan.name} — पुण्यता | ${plan.price}${plan.cycle}`
      : "Plan — पुण्यता";
    const fallbackDescription = plan
      ? (plan.tagline || plan.subheading || plan.heading).slice(0, 155)
      : "पुण्यता की मासिक सेवा योजना।";

    const meta: Array<Record<string, unknown>> = pageSeoMeta(seo, {
      title: fallbackTitle,
      description: fallbackDescription,
    });

    // Product schema — always live from the `plans` table (no
    // description column there; tagline/highlight_text stand in).
    if (plan) {
      meta.push({
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "Product",
          name: plan.name,
          description: plan.tagline || plan.subheading || plan.heading,
          offers: {
            "@type": "Offer",
            price: plan.priceNumeric,
            priceCurrency: "INR",
            availability: "https://schema.org/InStock",
            url: `https://www.punyata.com/plan/${params.planId}`,
          },
        },
      });
    }

    return {
      meta,
      links: [{ rel: "canonical", href: `https://www.punyata.com/plan/${params.planId}` }],
    };
  },
  component: PlanDetailPage,
});

function PlanDetailPage() {
  const { planId } = Route.useParams();
  const { data, isLoading, isError, refetch, isRefetching } = usePublicPlans();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-2xl mx-auto px-4 pb-32 pt-4 space-y-4 animate-pulse">
          <div className="h-4 w-28 bg-black/10 rounded" />
          <div className="card-soft overflow-hidden">
            <div className="aspect-video bg-black/5" />
            <div className="p-5 space-y-3">
              <div className="h-5 w-3/4 bg-black/10 rounded" />
              <div className="h-3 w-full bg-black/5 rounded" />
              <div className="h-8 w-32 bg-black/10 rounded" />
            </div>
          </div>
          <div className="h-24 w-full bg-black/5 rounded-2xl" />
          <div className="h-24 w-full bg-black/5 rounded-2xl" />
        </main>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
          <h1 className="text-xl font-bold">Plan load nahi ho paya</h1>
          <p className="text-sm text-muted-foreground">
            Live plan data fetch karne mein samasya aayi. Kripya punah prayas karein.
          </p>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="inline-flex items-center gap-2 bg-brand text-white text-xs font-bold px-5 py-2.5 rounded-full disabled:opacity-60"
          >
            {isRefetching ? "Retrying..." : "Retry"}
          </button>
        </main>
      </div>
    );
  }

  const plan: Plan | undefined = getPlanById(data.plans, planId);
  if (!plan) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold">Plan not found</h1>
          <Link to="/" className="mt-4 inline-block text-brand font-semibold">Back to Plans</Link>
        </main>
      </div>
    );
  }
  return <PlanDetail plan={plan} allPlans={data.plans} />;
}

function PlanDetail({ plan, allPlans }: { plan: Plan; allPlans: Plan[] }) {
  const { lang } = useTranslation();
  const slides: Slide[] = plan.slides.map((s) => ({
    image: s.image,
    alt: s.title,
    title: s.title,
    subtitle: s.subtitle,
    step: s.step,
    stepClass: s.stepClass,
    titleClass: s.titleClass,
    subtitleClass: s.subtitleClass,
    scrimClass: s.scrimClass,
  }));

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-2xl mx-auto px-4 pb-32 pt-4">
        <Link to="/plans" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand mb-3">
          <ArrowLeft size={16} /> Back to Plans
        </Link>

        {/* Hero Carousel */}
        <div className="card-soft overflow-hidden flex flex-col">
          {slides.length > 0 ? (
            <SlidingImageCard
              slides={slides}
              aspectRatio="video"
              rounded="rounded-none"
              sizes={IMAGE_SIZES.card}
              priority
            />
          ) : (
            <CldImage
              publicId={plan.image.publicId}
              fallback={plan.image.fallback}
              alt={plan.name}
              width={plan.image.w}
              height={plan.image.h}
              sizes={IMAGE_SIZES.card}
              crop="fill"
              priority
              className="w-full h-56 object-cover"
            />
          )}
          <div className="p-5">
            <h1 className="text-xl font-extrabold text-foreground leading-snug">{plan.heading}</h1>
            <p className="text-xs text-muted-foreground mt-1.5 leading-normal">{plan.subheading}</p>
            <div className="flex items-baseline gap-3 mt-3">
              <span className="text-3xl font-bold text-brand">{plan.price}</span>
              <span className="text-muted-foreground">{plan.cycle}</span>
              {plan.strikePrice && <span className="text-sm text-muted-foreground line-through">{plan.strikePrice}</span>}
            </div>
            

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 bg-brand-soft text-brand font-semibold px-3 py-1.5 rounded-full">
                <ShieldCheck size={14} /> <CountUp value={1200} /> {lang === "hindi" ? "परिवार जुड़े" : "Families Connected"}
              </span>
              <span className="inline-flex items-center gap-1 bg-success/10 text-success font-semibold px-3 py-1.5 rounded-full">
                <Video size={14} /> WhatsApp Video Proof
              </span>
              <span className="inline-flex items-center gap-1 bg-secondary text-foreground font-semibold px-3 py-1.5 rounded-full">
                <MapPin size={14} /> {plan.location}
              </span>
            </div>
          </div>
        </div>

        {/* Description — the lead section, so its card surfaces the key
            benefits up front before the reader even gets to the prose. */}
        <section className="mt-7">
          <div className="card-soft p-5 space-y-4 border border-brand/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-brand-soft flex items-center justify-center shrink-0">
                <ScrollText size={16} className="text-brand" />
              </div>
              <h2 className="text-lg font-bold text-foreground">इस संकल्प के बारे में</h2>
            </div>

            {plan.detail.benefits.length > 0 && (
              <div className="rounded-2xl bg-brand-soft/60 p-4 space-y-2">
                {plan.detail.benefits.map((b) => (
                  <div key={b} className="flex items-start gap-2.5 text-sm">
                    <Check size={15} className="text-brand shrink-0 mt-0.5" strokeWidth={3} />
                    <span className="text-foreground/90 font-medium leading-snug">{b}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 pt-3 border-t border-black/5">
              {plan.detail.description.map((p, i) => (
                <p key={i} className="text-[15px] text-foreground/85 leading-relaxed">
                  {p}
                </p>
              ))}
            </div>
          </div>
        </section>

        {/* Included Sevas */}
        <section className="mt-7 space-y-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-soft flex items-center justify-center shrink-0">
              <ListChecks size={16} className="text-brand" />
            </div>
            <h2 className="text-lg font-bold text-foreground">इस पैक में शामिल सेवाएँ</h2>
          </div>
          <div className="card-soft divide-y divide-black/5">
            {plan.detail.sevas.map((s) => (
              <div key={s.title} className="p-4 flex gap-3 items-start">
                <div className="w-7 h-7 rounded-full bg-success/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={14} className="text-success" strokeWidth={3} />
                </div>
                <div>
                  <div className="font-bold text-foreground">{s.title}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">{s.note}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Dynamic seva flow — reads current plan's actual sevas */}
        <SevaFlow sevaTitles={plan.detail.sevas.map((s) => s.title)} />

        {/* Aapki Sewa Kaise Sampann Hoti Hai section */}
        <section className="mt-8 space-y-4">
          <h2 className="text-lg font-bold text-center text-[#5B1A1A]">
            {lang === "hindi" ? "आपकी सेवा कैसे संपन्न होती है" : "How Your Seva is Performed"}
          </h2>
          
          <motion.div
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: { staggerChildren: 0.15 }
              }
            }}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            className="space-y-4 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-[2px] before:bg-brand/20"
          >
            {[
              {
                step: "1",
                title: lang === "hindi" ? "सदस्यता लें (Subscribe)" : "Subscribe",
                desc: lang === "hindi" ? "अपनी इच्छानुसार मासिक या वार्षिक संकल्प सदस्यता चुनें।" : "Choose your desired monthly or yearly sankalp subscription."
              },
              {
                step: "2",
                title: lang === "hindi" ? "संकल्प और पूजन (Puja & Sankalp)" : "Name & Gotra Sankalp",
                desc: lang === "hindi" ? "तीर्थ गुरु पुष्करराज में पंडित जी आपके नाम-गोत्र से वैदिक विधि-विधान से पूजा और संकल्प करेंगे।" : "Pandit ji performs puja and speaks your name and gotra in the sankalp at Pushkarraj."
              },
              {
                step: "3",
                title: lang === "hindi" ? "वीडियो प्रमाण (Video Proof)" : "Recording the Proof",
                desc: lang === "hindi" ? "संकल्प और सेवा का स्पष्ट वीडियो प्रमाण रिकॉर्ड किया जाएगा।" : "A clear, personalized video proof is recorded for every seva."
              },
              {
                step: "4",
                title: lang === "hindi" ? "व्हाट्सएप पर प्राप्ति (WhatsApp Delivery)" : "WhatsApp Delivery",
                desc: lang === "hindi" ? "पूजा का वीडियो और प्रसाद की जानकारी सीधे आपके WhatsApp पर भेजी जाएगी।" : "The verification video is sent directly to your phone."
              }
            ].map((s) => (
              <motion.div
                key={s.step}
                variants={{
                  hidden: { opacity: 0, x: -10 },
                  visible: { opacity: 1, x: 0, transition: { duration: 0.4 } }
                }}
                className="flex gap-4 relative z-10"
              >
                <div className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                  {s.step}
                </div>
                <div className="card-soft p-4 flex-1">
                  <h3 className="font-extrabold text-foreground text-sm leading-snug">{s.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Visual Pizza/Dinner Comparison */}
          <PizzaComparison planId={plan.id} price={plan.price} cycle={plan.cycle} size="lg" />
        </section>

        {/* Blessings & Benefits */}
        <section className="mt-7 space-y-3.5">
          <div className="flex items-center gap-2.5">
            <LottieIcon
              animationData={diya}
              size={30}
              loop
              autoplay
              fallback={<div className="w-8 h-8 rounded-xl bg-brand-soft flex items-center justify-center shrink-0"><Check size={16} className="text-brand" /></div>}
            />
            <h2 className="text-lg font-bold text-foreground">इस संकल्प के फायदे</h2>
          </div>
          <div className="relative rounded-2xl bg-gradient-to-b from-[#FFF6EE] to-[#FDECDC] border border-brand/15 p-5 space-y-3">
            <Sparkles size={18} className="absolute top-4 right-4 text-[#F5A742]" />
            {plan.tagline && (
              <div className="text-[14.5px] font-bold text-[#B8460F] pr-6 leading-snug">
                {plan.tagline}
              </div>
            )}
            {plan.detail.benefits.map((b) => (
              <div key={b} className="flex items-start gap-2.5 text-[15px]">
                <div className="w-[22px] h-[22px] rounded-full bg-success flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={12} strokeWidth={3.5} className="text-white" />
                </div>
                <span className="text-foreground/90 font-semibold leading-snug">{b}</span>
              </div>
            ))}
          </div>
          <ChadhavaHeartBadge />
        </section>

        {/* Authenticity / Trust */}
        <section className="mt-7">
          <AuthenticityTrust />
        </section>

        {/* Reviews */}
        <section className="mt-7 space-y-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-soft flex items-center justify-center shrink-0">
              <Quote size={16} className="text-brand" />
            </div>
            <h2 className="text-lg font-bold text-foreground">इस पैक के भक्तों की राय</h2>
          </div>
          <div className="space-y-3">
            {plan.detail.reviews.map((r, i) => (
              <div key={i} className="card-soft card-lift p-4">
                <div className="flex items-center gap-1 text-amber-accent">
                  {Array.from({ length: r.stars }).map((_, k) => (
                    <Star key={k} size={14} fill="#F5A742" className="text-amber-accent" />
                  ))}
                </div>
                <p className="text-sm text-foreground/85 mt-2 leading-relaxed">"{r.q}"</p>
                <div className="text-xs text-muted-foreground mt-2 font-semibold">— {r.n}, {r.city}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground italic text-center">
            * Placeholder reviews — wire real reviews when backend is connected.
          </p>
        </section>

        {/* Related plans */}
        <section className="mt-8">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl bg-brand-soft flex items-center justify-center shrink-0">
              <ArrowRight size={16} className="text-brand" />
            </div>
            <h2 className="text-lg font-bold text-foreground">अन्य पैक देखें</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-2">
            {allPlans.filter((p) => p.id !== plan.id && p.isVisible !== false).map((p) => (
              <Link key={p.id} to="/plan/$planId" params={{ planId: p.id }} className="card-soft p-3 w-[260px] min-w-[260px] shrink-0 flex flex-col justify-between border border-black/5 hover:border-brand/20 transition-all">
                <div>
                  <div className="h-28 overflow-hidden rounded-xl bg-muted">
                    <CldImage
                      publicId={p.image.publicId}
                      fallback={p.image.fallback}
                      alt={p.name}
                      width={p.image.w}
                      height={p.image.h}
                      sizes={IMAGE_SIZES.thumb}
                      crop="fill"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="mt-2 font-extrabold text-sm text-foreground line-clamp-1">{p.name}</div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-tight h-7">{p.subheading}</p>
                </div>
                <div className="mt-2 pt-2 border-t border-black/5 flex items-baseline justify-between">
                  <span className="text-brand font-black text-sm">{p.price}<span className="text-[10px] text-muted-foreground font-semibold">{p.cycle}</span></span>
                  <span className="text-[10px] font-bold text-brand hover:underline">View →</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Plan Comparison Section */}
        <div className="pt-8 border-t border-black/5 mt-8 pb-12">
          <ComparisonTable />
        </div>
      </main>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-black/5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3 pb-[env(safe-area-inset-bottom,0.5rem)]">
          <div>
            <div className="text-xs text-muted-foreground">कुल राशि</div>
            <div className="font-bold text-foreground">{plan.price}<span className="text-sm text-muted-foreground font-medium">{plan.cycle}</span></div>
          </div>
          <Link
            to="/checkout/$planId"
            params={{ planId: plan.id }}
            className="flex items-center justify-center gap-2 bg-brand text-white font-bold px-6 py-3 rounded-full hover:bg-brand-deep transition-colors text-sm shadow-md shadow-brand/10 btn-glow primary-btn-glow"
          >
            {lang === "hindi" ? "पुण्य शुरू करें" : "Punya Start Kare"} <ArrowRight size={18} />
          </Link>
        </div>
      </div>

      <WhatsAppFloat />
    </div>
  );
}
