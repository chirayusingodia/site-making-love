import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles, ShieldCheck } from "lucide-react";
import { SiteChrome } from "@/components/site-chrome";

export const Route = createFileRoute("/my-subscription")({
  head: () => ({
    meta: [
      { title: "My Subscription — पुण्यता" },
      { name: "description", content: "अपनी सक्रिय सदस्यता, परिवारजनों की सूची एवं अगली सेवा तिथि देखें।" },
    ],
  }),
  component: MySubscriptionPage,
});

function MySubscriptionPage() {
  // Placeholder — auth not connected. Show empty-state.
  const hasActive = false;

  return (
    <SiteChrome>
      <main className="max-w-md mx-auto px-4 pb-24 md:pb-16 pt-8">
        {hasActive ? (
          <div className="space-y-5">
            <div className="card-soft p-5">
              <div className="text-xs font-bold text-brand">Active Plan</div>
              <div className="font-bold text-lg mt-1">गृह शांति ₹401/Monthly</div>
              <div className="text-xs text-muted-foreground mt-1">Next billing: 1st of next month</div>
            </div>
            <div className="card-soft p-5">
              <div className="text-sm font-bold">परिवार सदस्य</div>
              <p className="text-xs text-muted-foreground mt-1">4 सदस्य जोड़े गए</p>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-5">
            <div className="w-20 h-20 rounded-full bg-brand-soft flex items-center justify-center mx-auto">
              <Sparkles size={36} className="text-brand" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">कोई Active Subscription नहीं</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                अपनी पहली सेवा शुरू करने के लिए एक Plan चुनें।
              </p>
            </div>
            <Link
              to="/plans"
              className="inline-flex items-center gap-2 bg-brand text-white font-bold px-6 py-3.5 rounded-full hover:bg-brand-deep transition-colors"
            >
              See Plans <ArrowRight size={18} />
            </Link>
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck size={12} /> Login placeholder — backend not wired yet.
            </div>
          </div>
        )}
      </main>
    </SiteChrome>
  );
}
