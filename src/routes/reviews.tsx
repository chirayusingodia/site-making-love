import { createFileRoute } from "@tanstack/react-router";
import { Star, Quote, ShieldCheck } from "lucide-react";
import { testimonials } from "@/lib/plans";
import { SiteChrome } from "@/components/site-chrome";
import { PhotoProofGallery, WhatsAppProofGallery } from "@/components/ProofGallery";
import { fetchPageSeo, pageSeoMeta } from "@/lib/page-seo";

export const Route = createFileRoute("/reviews")({
  head: async () => {
    const seo = await fetchPageSeo("/reviews");
    return {
      meta: pageSeoMeta(seo, {
        title: "Reviews — पुण्यता | भक्तों की राय",
        description: "पुण्यता के 1,200+ सदस्यों की सच्ची राय — WhatsApp Video Proof के बाद उनके अनुभव।",
      }),
      links: [{ rel: "canonical", href: "https://www.punyata.com/reviews" }],
    };
  },
  component: ReviewsPage,
});

function ReviewsPage() {
  return (
    <SiteChrome>
      <main className="max-w-4xl mx-auto px-4 pb-24 md:pb-16 pt-6 space-y-8">
        <header className="relative text-center">
          <div
            className="absolute -top-10 left-1/2 -translate-x-1/2 w-64 h-44 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(closest-side, rgba(245,167,66,0.22), rgba(245,167,66,0))" }}
          />
          <div className="relative">
            <div className="text-xs font-bold uppercase tracking-widest text-brand">Reviews</div>
            <h1 className="mt-2 text-3xl font-bold">भक्तों की राय</h1>
            <div className="mt-2.5 flex items-center justify-center gap-2">
              <span className="w-6 h-px bg-gradient-to-r from-transparent to-amber-accent" />
              <svg width="8" height="8" viewBox="0 0 8 8" className="shrink-0">
                <rect x="0" y="0" width="8" height="8" fill="#F5A742" transform="rotate(45 4 4)" />
              </svg>
              <span className="w-6 h-px bg-gradient-to-l from-transparent to-amber-accent" />
            </div>
            <p className="mt-2.5 text-[15px] text-muted-foreground max-w-xl mx-auto">
              1,200+ परिवारों की सच्ची प्रतिक्रिया — हर सेवा के Video Proof के बाद।
            </p>
          </div>

          <div className="relative mt-5 flex items-center justify-center gap-5 sm:gap-8 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5 text-amber-accent">
                {Array.from({ length: 5 }).map((_, k) => (
                  <Star key={k} size={15} fill="#F5A742" className="text-amber-accent" />
                ))}
              </div>
              <span className="text-sm font-bold text-foreground">4.9/5</span>
            </div>
            <span className="w-px h-4 bg-black/10" />
            <span className="text-sm font-bold text-foreground">1,200+ परिवार</span>
            <span className="w-px h-4 bg-black/10 hidden sm:block" />
            <div className="flex items-center gap-1.5 text-sm font-bold text-foreground">
              <ShieldCheck size={16} className="text-brand" />
              हर सेवा का Proof
            </div>
          </div>
        </header>

        <div className="bg-white/50 backdrop-blur-sm border border-[#F0DFC8]/65 rounded-3xl p-5 shadow-sm">
          <WhatsAppProofGallery />
        </div>

        <div className="bg-white/50 backdrop-blur-sm border border-[#F0DFC8]/65 rounded-3xl p-5 shadow-sm">
          <PhotoProofGallery showSeeAll={false} />
        </div>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">भक्तों के अनुभव</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {testimonials.map((t, i) => {
              const initials = t.n.split(" ").map((w) => w[0]).join("").slice(0, 2);
              return (
                <div key={i} className="card-soft p-5 relative">
                  <Quote size={26} className="absolute top-4 right-4 text-brand/10" fill="currentColor" strokeWidth={0} />
                  <div className="flex gap-0.5 text-amber-accent mb-2.5">
                    {Array.from({ length: 5 }).map((_, k) => (
                      <Star key={k} size={14} fill="#F5A742" className="text-amber-accent" />
                    ))}
                  </div>
                  <p className="text-foreground/85 leading-relaxed text-[14.5px] max-w-[85%]">"{t.q}"</p>
                  <div className="mt-4 pt-3.5 border-t border-black/5 flex items-center gap-3">
                    {t.avatarUrl ? (
                      <img
                        src={t.avatarUrl}
                        alt={t.n}
                        className="w-11 h-11 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand to-[#F5A742] text-white flex items-center justify-center font-bold">
                        {initials}
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-foreground">{t.n}</div>
                      <div className="text-sm text-muted-foreground">{t.city}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </SiteChrome>
  );
}
