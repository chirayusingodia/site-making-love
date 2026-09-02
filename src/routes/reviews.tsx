import { createFileRoute } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { testimonials } from "@/lib/plans";
import { SiteChrome } from "@/components/site-chrome";
import { ProofGallery } from "@/components/ProofGallery";
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
      <main className="max-w-3xl mx-auto px-4 pb-24 md:pb-16 pt-6 space-y-6">
        <header className="text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-brand">Reviews</div>
          <h1 className="mt-2 text-3xl font-bold">भक्तों की राय</h1>
          <p className="mt-2 text-[15px] text-muted-foreground max-w-xl mx-auto">
            1,200+ परिवारों की सच्ची प्रतिक्रिया — हर सेवा के Video Proof के बाद।
          </p>
        </header>

        <div className="bg-white/50 backdrop-blur-sm border border-[#F0DFC8]/65 rounded-3xl p-5 shadow-sm">
          <ProofGallery />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {testimonials.map((t, i) => {
            const initials = t.n.split(" ").map((w) => w[0]).join("").slice(0, 2);
            return (
              <div key={i} className="card-soft p-5">
                <div className="flex gap-0.5 text-amber-accent mb-2">
                  {Array.from({ length: 5 }).map((_, k) => (
                    <Star key={k} size={14} fill="#F5A742" className="text-amber-accent" />
                  ))}
                </div>
                <p className="text-foreground/80 leading-relaxed text-[15px]">"{t.q}"</p>
                <div className="mt-4 pt-3 border-t border-black/5 flex items-center gap-3">
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
      </main>
    </SiteChrome>
  );
}
