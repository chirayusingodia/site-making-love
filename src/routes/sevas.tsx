import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Flame, Sun, Wind, Heart, Users, Sparkles, AlertTriangle, RefreshCw } from "lucide-react";
import { usePublicPlans } from "@/lib/plans";
import { SiteChrome } from "@/components/site-chrome";
import { SlidingImageCard, type Slide } from "@/components/SlidingImageCard";

import { IMAGE_SIZES } from "@/components/CldImage";
import { SITE_IMAGES, type SiteImage } from "@/lib/site-images";

export const Route = createFileRoute("/sevas")({
  head: () => ({
    meta: [
      { title: "Our Sevas — पुण्यता | सुंदरकांड, हवन, आरती, गौ सेवा, वानर सेवा" },
      { name: "description", content: "पुण्यता की सभी सेवाओं की विस्तृत सूची — सुंदरकांड पाठ, गृह शांति हवन, आरती, गौ माता सेवा, वानर सेवा एवं साधु संतों को भोजन।" },
    ],
    links: [{ rel: "canonical", href: "https://www.punyata.com/sevas" }],
  }),
  component: SevasPage,
});

const iconMap: Record<string, any> = { BookOpen, Flame, Sun, Wind, Heart, Users, Sparkles };

type SevaStaticMedia = { images: SiteImage[]; captions: string[] };

// Presentation-only media per seva slug (images/captions are design assets).
// Seva names/descriptions themselves come live from the `sevas` table.
// Slugs not listed here render without a photo panel — no composition data here.
const sevaMedia: Record<string, SevaStaticMedia> = {
  "sundarkand-path": {
    images: [SITE_IMAGES.sevaSundarkand],
    captions: ["सुंदरकांड पाठ — आपके नाम व गोत्र से संकट हरण पाठ"],
  },
  "gau-seva": {
    images: [SITE_IMAGES.sevaGau],
    captions: ["गौ माता सेवा — हरा चारा एवं गुड़ अर्पण"],
  },
  "vanar-seva": {
    images: [SITE_IMAGES.sevaVanar],
    captions: ["वानर सेवा — श्री हनुमान जी के प्रिय फल व चना अर्पण"],
  },
  "saadhu-santo-ko-bhojan": {
    images: [SITE_IMAGES.sevaSadhuBhojan],
    captions: ["साधु संतों को भोजन — पुष्कर क्षेत्र साधु सत्कार"],
  },
  "griha-shanti-hawan": {
    images: [SITE_IMAGES.sevaHawan],
    captions: ["गृह शांति हवन — वैदिक आहुति"],
  },
  "sarv-rog-nivaran-hawan": {
    images: [SITE_IMAGES.sevaHawan],
    captions: ["सर्व रोग निवारण हवन — वैदिक आहुति"],
  },
};

function SevasPage() {
  const { data, isLoading, isError, refetch, isRefetching } = usePublicPlans();
  const sevaList = data?.sevaList ?? [];

  return (
    <SiteChrome>
      <main className="max-w-4xl mx-auto px-4 pb-24 md:pb-16 pt-6 space-y-10">
        <header className="text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-brand">Our Sevas</div>
          <h1 className="mt-2 text-3xl font-bold">पुण्यता की सेवाएँ</h1>
          <p className="mt-2 text-[15px] text-muted-foreground max-w-xl mx-auto">
            तीर्थ गुरु पुष्करराज में आपके नाम एवं गोत्र से सम्पन्न होने वाली सभी सेवाएँ — पूर्ण पारदर्शिता और WhatsApp Video Proof के साथ।
          </p>
        </header>

        {isLoading ? (
          <div className="space-y-10">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card-soft overflow-hidden grid md:grid-cols-2 gap-0 animate-pulse">
                <div className="aspect-[4/5] bg-black/5" />
                <div className="p-6 space-y-3">
                  <div className="h-5 w-1/2 bg-black/10 rounded" />
                  <div className="h-3 w-full bg-black/5 rounded" />
                  <div className="h-3 w-4/5 bg-black/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="card-soft border border-destructive/30 p-8 text-center space-y-3">
            <AlertTriangle size={32} className="text-destructive mx-auto" />
            <p className="text-sm font-semibold text-foreground">Seva सूची abhi load nahi ho payi.</p>
            <p className="text-xs text-muted-foreground">
              Live seva data fetch karne mein samasya aayi. Kripya punah prayas karein.
            </p>
            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="inline-flex items-center gap-2 bg-brand text-white text-xs font-bold px-5 py-2.5 rounded-full disabled:opacity-60"
            >
              <RefreshCw size={14} className={isRefetching ? "animate-spin" : ""} />
              {isRefetching ? "Retrying..." : "Retry"}
            </button>
          </div>
        ) : (
          <div className="space-y-10">
            {sevaList.map((s, idx) => {
              const Icon = iconMap[s.iconKey] || BookOpen;
              const media = sevaMedia[s.slug];
              const slides: Slide[] = media
                ? media.images.map((img, i) => ({
                    image: img,
                    alt: `${s.title} — ${media.captions[i] ?? s.title}`,
                    title: media.captions[i] ?? s.title,
                    subtitle: s.title,
                  }))
                : [];
              const reverse = idx % 2 === 1;
              return (
                <section
                  key={s.slug}
                  className={`card-soft card-lift overflow-hidden grid md:grid-cols-2 gap-0 ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}
                >
                  <div className="md:p-4">
                    {slides.length > 0 && (
                      <SlidingImageCard slides={slides} aspectRatio="4/5" rounded="md:rounded-2xl rounded-none" sizes={IMAGE_SIZES.card} />
                    )}
                  </div>
                  <div className="p-6 flex flex-col justify-center gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-brand-soft flex items-center justify-center shrink-0">
                        <Icon size={24} className="text-brand" />
                      </div>
                      <h2 className="text-xl font-bold text-foreground">{s.title}</h2>
                    </div>
                    <p className="text-[15px] text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </SiteChrome>
  );
}
