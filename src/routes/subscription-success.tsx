import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, LogIn, PartyPopper, AlertCircle } from "lucide-react";
import { Header, WhatsAppFloat } from "@/components/site-chrome";
import {
  FamilyAddressForm,
  type ExistingAddress,
  type ExistingMember,
} from "@/components/profile-completion";
import { supabase } from "@/lib/supabase";
import { useSessionProfile } from "@/hooks/use-session";
import { fireSubscribeConversion } from "@/lib/ad-conversions";

export const Route = createFileRoute("/subscription-success")({
  validateSearch: (search: Record<string, unknown>) => ({
    ref: typeof search.ref === "string" ? search.ref : undefined,
  }),
  component: SubscriptionSuccessPage,
});

// ─────────────────────────────────────────────────────────────
// POST-PURCHASE LANDING (session prompt §1 step 5)
//
// Banner first ("subscription active"), THEN the optional family +
// address form — the same shared component /profile reuses. Both
// actions land on /my-subscription. Family details are explicitly
// deferrable; a sales agent may also complete them over the phone.
//
// NOTE: the banner reflects the PAYMENT being received (checkout
// callback). Actual status='active' lands via the Razorpay webhook;
// /my-subscription shows the honest live state.
// ─────────────────────────────────────────────────────────────

function SubscriptionSuccessPage() {
  const { ref } = Route.useSearch();
  const navigate = useNavigate();
  const { userId, loading: sessionLoading } = useSessionProfile();
  const [members, setMembers] = useState<ExistingMember[]>([]);
  const [address, setAddress] = useState<ExistingAddress | null>(null);
  const [loading, setLoading] = useState(true);
  // [Pass-2 F1] stays false until the fetch for the CURRENT ref+userId
  // has landed — the render gate below therefore never mounts
  // <FamilyAddressForm> on stale-empty state (the form seeds via a
  // lazy initializer and ignores later prop changes, so a premature
  // mount meant saved members were invisible AND prunable on save).
  const [dataReady, setDataReady] = useState(false);
  // StrictMode/dev re-mounts this effect twice; a conversion pixel must
  // fire exactly once per real success, never per render.
  const conversionFired = useRef(false);

  useEffect(() => {
    if (!ref || !userId) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      // [Bug 3.3] `ref` came straight from the URL and drove the
      // family_members query with no application-level ownership check
      // — only RLS stood between any logged-in user and another
      // subscriber's names/gotra. Verify the subscription is OURS
      // first (RLS scopes this read AND the .eq below double-gates).
      // Also carries plan price — needed for the conversion event value,
      // nowhere else on this page.
      const { data: owned } = await supabase
        .from("subscriptions")
        .select("id,plans(name,price_paise)")
        .eq("id", ref)
        .eq("user_id", userId)
        .maybeSingle();

      if (owned && !conversionFired.current) {
        conversionFired.current = true;
        const plan = (owned as unknown as { plans: { name: string; price_paise: number } | null })
          .plans;
        fireSubscribeConversion({
          valuePaise: plan?.price_paise ?? 0,
          planName: plan?.name,
        });
      }

      if (!owned) {
        if (active) {
          setMembers([]);
          setAddress(null);
          setLoading(false);
          setDataReady(true);
        }
        return;
      }

      const [fmRes, profRes] = await Promise.all([
        supabase
          .from("family_members")
          .select("id,slot_number,full_name,gotra,relation,dob")
          .eq("subscription_id", ref)
          .order("slot_number"),
        supabase
          .from("profiles")
          .select("address_line1,address_line2,state,pincode")
          .eq("id", userId)
          .maybeSingle(),
      ]);
      if (!active) return;
      setMembers((fmRes.data as ExistingMember[]) ?? []);
      setAddress((profRes.data as ExistingAddress | null) ?? null);
      setLoading(false);
      setDataReady(true);
    })();
    return () => {
      active = false;
    };
  }, [ref, userId]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-md mx-auto px-4 pb-24 pt-8 space-y-6">
        {/* Success banner — celebrated ONLY when this is the real
            post-payment hand-off (?ref=… set by the Razorpay callback).
            The abandoned-checkout path never routes here (dismiss keeps
            you on /checkout), but a manually typed bare URL must not
            read as "Payment mil gaya" when nothing was paid
            (SESSION_STUCK_PENDING_CHECKOUT §3). */}
        <div
          className={`card-soft p-6 text-center space-y-3 ${ref ? "border-2 border-success/30" : ""}`}
        >
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
              ref ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"
            }`}
          >
            {ref ? <PartyPopper size={30} /> : <AlertCircle size={30} />}
          </div>
          <h1 className="text-xl font-bold text-foreground">
            {ref ? "🎉 आपकी सदस्यता सफलतापूर्वक शुरू हो गई!" : "Sadasyata sthiti"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {ref ? (
              <>
                Payment mil gaya. Aapki seva ka sankalp ab Pushkar mein liya jayega — har seva ka
                video proof aapke WhatsApp par milega.
              </>
            ) : (
              <>
                Payment reference nahi mila. Agar payment ho gaya hai, sadasyata ki live status{" "}
                <Link to="/my-subscription" className="text-brand font-semibold">
                  Meri Sadasyata
                </Link>{" "}
                par dikhegi.
              </>
            )}
          </p>
        </div>

        {/* Completion form — same component as /profile */}
        {!sessionLoading && !userId ? (
          <div className="card-soft p-5 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Details add karne ke liye login zaroori hai.
            </p>
            <Link
              to="/login"
              search={{ redirect: ref ? `/subscription-success?ref=${ref}` : "/profile" }}
              className="inline-flex items-center gap-2 bg-brand text-white font-bold px-5 py-2.5 rounded-full text-sm"
            >
              <LogIn size={16} /> Login karein
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h2 className="font-bold text-foreground">Apni details poore karein</h2>
              <p className="text-xs text-muted-foreground">
                Parivaar ke naam-gotra aur prasad address add karein — ya baad mein bhi kar sakte
                hain.
              </p>
            </div>

            {loading || sessionLoading || !dataReady ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-24 w-full bg-black/5 rounded-2xl" />
                <div className="h-40 w-full bg-black/5 rounded-2xl" />
              </div>
            ) : ref ? (
              <FamilyAddressForm
                subscriptionId={ref}
                initialMembers={members}
                initialAddress={address}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Form dikhane ke liye payment reference nahi mila — aap{" "}
                <Link to="/profile" className="text-brand font-semibold">
                  profile
                </Link>{" "}
                se details add kar sakte hain.
              </p>
            )}
          </>
        )}

        {/* Explicit skip */}
        <button
          onClick={() => navigate({ to: "/my-subscription", replace: true })}
          className="w-full text-center text-sm font-semibold text-muted-foreground hover:text-brand py-2"
        >
          Main yeh baad mein karunga →
        </button>

        <Link
          to="/my-subscription"
          className="w-full flex items-center justify-center gap-2 bg-secondary text-foreground font-bold py-3.5 rounded-full hover:bg-muted transition-colors"
        >
          Meri Sadasyata Dekhein <ArrowRight size={18} />
        </Link>
      </main>
      <WhatsAppFloat />
    </div>
  );
}
