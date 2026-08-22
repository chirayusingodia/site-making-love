import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, LogIn, PartyPopper } from "lucide-react";
import { Header, WhatsAppFloat } from "@/components/site-chrome";
import {
  FamilyAddressForm,
  type ExistingAddress,
  type ExistingMember,
} from "@/components/profile-completion";
import { supabase } from "@/lib/supabase";
import { useSessionProfile } from "@/hooks/use-session";

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

  useEffect(() => {
    if (!ref || !userId) {
      setLoading(false);
      return;
    }
    (async () => {
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
      setMembers((fmRes.data as ExistingMember[]) ?? []);
      setAddress((profRes.data as ExistingAddress | null) ?? null);
      setLoading(false);
    })();
  }, [ref, userId]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-md mx-auto px-4 pb-24 pt-8 space-y-6">
        {/* Success banner */}
        <div className="card-soft p-6 text-center space-y-3 border-2 border-success/30">
          <div className="w-16 h-16 rounded-full bg-success/15 text-success flex items-center justify-center mx-auto">
            <PartyPopper size={30} />
          </div>
          <h1 className="text-xl font-bold text-foreground">
            🎉 आपकी सदस्यता सफलतापूर्वक शुरू हो गई!
          </h1>
          <p className="text-sm text-muted-foreground">
            Payment mil gaya. Aapki seva ka sankalp ab Pushkar mein liya jayega — har seva ka video
            proof aapke WhatsApp par milega.
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

            {loading || sessionLoading ? (
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
