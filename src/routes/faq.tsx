import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { faqs } from "@/lib/plans";
import { SiteChrome } from "@/components/site-chrome";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — पुण्यता | अक्सर पूछे जाने वाले प्रश्न" },
      { name: "description", content: "पुण्यता की सेवाओं के बारे में अक्सर पूछे जाने वाले प्रश्न — refund, cancel, proof, gotra एवं अन्य।" },
    ],
  }),
  component: FaqPage,
});

function FaqPage() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <SiteChrome>
      <main className="max-w-2xl mx-auto px-4 pb-24 md:pb-16 pt-6 space-y-6">
        <header className="text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-brand">FAQ</div>
          <h1 className="mt-2 text-3xl font-bold">आपके प्रश्न</h1>
        </header>
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
        <div className="text-center">
          <Link to="/plans" className="inline-flex items-center gap-2 bg-brand text-white font-bold px-6 py-3 rounded-full">
            See Plans
          </Link>
        </div>
      </main>
    </SiteChrome>
  );
}
