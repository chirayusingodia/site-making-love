import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, MapPin, Video, Star, ShieldCheck } from "lucide-react";
import { getPlan, plans, sevaList, type Plan } from "@/lib/plans";
import { Header, WhatsAppFloat } from "@/components/site-chrome";
import { SevaFlow } from "@/components/SevaFlow";
import { SlidingImageCard, type Slide } from "@/components/SlidingImageCard";
import { CountUp } from "@/components/CountUp";
import { useTranslation } from "@/lib/translations";

// Import local hero images
import h1 from "@/assets/plan-detail/hero_1.png";
import h2 from "@/assets/plan-detail/hero_2.png";
import h3 from "@/assets/plan-detail/hero_3.png";
import h4 from "@/assets/plan-detail/hero_4.png";
import h5 from "@/assets/plan-detail/hero_5.png";
import h6 from "@/assets/plan-detail/hero_6.png";
import h7 from "@/assets/plan-detail/hero_7.png";
import h8 from "@/assets/plan-detail/hero_8.png";
import h9 from "@/assets/plan-detail/hero_9.png";
import h10 from "@/assets/plan-detail/hero_10.png";

const heroImages = [h1, h2, h3, h4, h5, h6, h7, h8, h9, h10];

export const Route = createFileRoute("/plan/$planId")({
  component: PlanDetailPage,
});

function PlanDetailPage() {
  const { planId } = Route.useParams();
  const plan: Plan | undefined = getPlan(planId);
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
  return <PlanDetail plan={plan} />;
}

function PlanDetail({ plan }: { plan: Plan }) {
  const { lang } = useTranslation();
  const slides: Slide[] = plan.slides.map((s) => ({
    src: s.src,
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
            <SlidingImageCard slides={slides} aspectRatio="video" rounded="rounded-none" />
          ) : (
            <img src={plan.image} alt={plan.name} className="w-full h-56 object-cover" />
          )}
          <div className="p-5">
            <h1 className="text-2xl font-bold text-foreground">{plan.detail.hero}</h1>
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

        {/* Description */}
        <section className="mt-6 space-y-3">
          <h2 className="text-lg font-bold">इस संकल्प के बारे में</h2>
          {plan.detail.description.map((p, i) => (
            <p key={i} className="text-[15px] text-foreground/85 leading-relaxed">{p}</p>
          ))}
        </section>

        {/* Included Sevas */}
        <section className="mt-6 space-y-3">
          <h2 className="text-lg font-bold">इस पैक में शामिल सेवाएँ</h2>
          <div className="card-soft divide-y divide-black/5">
            {plan.detail.sevas.map((s) => (
              <div key={s.title} className="p-4 flex gap-3">
                <Check size={18} className="text-success shrink-0 mt-0.5" />
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

        {/* Benefits */}
        <section className="mt-6 space-y-3">
          <h2 className="text-lg font-bold">इस संकल्प के फायदे</h2>
          <div className="card-soft p-5 space-y-2.5">
            {plan.detail.benefits.map((b) => (
              <div key={b} className="flex items-start gap-2 text-[15px]">
                <span className="text-brand mt-1">•</span>
                <span className="text-foreground/85 leading-relaxed">{b}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Reviews */}
        <section className="mt-6 space-y-3">
          <h2 className="text-lg font-bold">इस पैक के भक्तों की राय</h2>
          <div className="space-y-3">
            {plan.detail.reviews.map((r, i) => (
              <div key={i} className="card-soft p-4">
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
          <h2 className="text-lg font-bold mb-3">अन्य पैक देखें</h2>
          <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4">
            {plans.filter((p) => p.id !== plan.id).map((p) => (
              <Link key={p.id} to="/plan/$planId" params={{ planId: p.id }} className="card-soft p-3 min-w-[60%] shrink-0">
                <img src={p.image} className="w-full h-24 object-cover rounded-xl" alt={p.name} />
                <div className="mt-2 font-bold text-sm">{p.name}</div>
                <div className="text-brand font-bold text-sm">{p.price}<span className="text-xs text-muted-foreground">{p.cycle}</span></div>
              </Link>
            ))}
          </div>
        </section>
      </main>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-black/5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3 pb-[env(safe-area-inset-bottom,0.5rem)]">
          <div>
            <div className="text-xs text-muted-foreground">कुल राशि</div>
            <div className="font-bold text-foreground">{plan.price}<span className="text-sm text-muted-foreground font-medium">{plan.cycle}</span></div>
          </div>
          <Link to="/checkout/$planId" params={{ planId: plan.id }} className="bg-brand text-white font-bold px-6 py-3.5 rounded-full flex items-center gap-2 hover:bg-brand-deep transition-colors">
            Proceed to Book <ArrowRight size={18} />
          </Link>
        </div>
      </div>

      <WhatsAppFloat />
    </div>
  );
}
