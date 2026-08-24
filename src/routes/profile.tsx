import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  User,
  ArrowRight,
  LogIn,
  LogOut,
  HelpCircle,
  FileText,
  ShieldCheck,
  Users,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { Header, WhatsAppFloat } from "@/components/site-chrome";
import { useSessionProfile } from "@/hooks/use-session";
import { signOut } from "@/lib/auth-api";
import { formatPhoneDisplay } from "@/lib/phone";
import { supabase } from "@/lib/supabase";
import { FamilyAddressForm, type ExistingMember } from "@/components/profile-completion";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

// ─────────────────────────────────────────────────────────────
// PROFILE — real session + real data (no placeholders).
//
// Shows the caller's own profile row and their subscriptions via
// RLS. When the current subscription has ZERO family members the
// permanent "Complete your family details" section is surfaced —
// the SAME shared form used by /subscription-success.
// ─────────────────────────────────────────────────────────────

interface SubRow {
  id: string;
  status: string;
  start_date: string | null;
  next_billing_date: string | null;
  plans: { name: string; billing_period: string; price_paise: number } | null;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function ProfilePage() {
  const { userId, profile, loading } = useSessionProfile();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-md mx-auto px-4 py-8 space-y-4 animate-pulse">
          <div className="h-24 w-full bg-black/5 rounded-2xl" />
          <div className="h-20 w-full bg-black/5 rounded-2xl" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-md mx-auto px-4 py-8">
        {userId ? <LoggedInView /> : <LoggedOutView />}
      </main>
      <WhatsAppFloat />
    </div>
  );
}

function LoggedOutView() {
  const navigate = useNavigate();
  return (
    <div className="text-center space-y-6">
      <div className="w-24 h-24 rounded-full bg-brand-soft flex items-center justify-center mx-auto">
        <User size={44} className="text-brand" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-foreground">अपना खाता देखें</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Login करें और अपनी सभी सेवाएँ एवं Proof एक ही जगह देखें।
        </p>
      </div>

      <button
        onClick={() => navigate({ to: "/login", search: { redirect: "/profile" } })}
        className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold py-3.5 rounded-full hover:bg-brand-deep transition-colors"
      >
        <LogIn size={18} /> Mobile OTP se Login karein
      </button>

      <div className="card-soft mt-8 divide-y divide-black/5">
        {[
          { icon: HelpCircle, label: "Help / Support", href: "#" },
          { icon: FileText, label: "Terms & Privacy", href: "#" },
        ].map(({ icon: Icon, label, href }) => (
          <a
            key={label}
            href={href}
            className="flex items-center gap-3 px-4 py-4 hover:bg-secondary/50 transition-colors"
          >
            <Icon size={20} className="text-muted-foreground" />
            <span className="font-semibold text-foreground flex-1">{label}</span>
            <ArrowRight size={16} className="text-muted-foreground" />
          </a>
        ))}
      </div>
    </div>
  );
}

function LoggedInView() {
  // [Bug 3.8] Reuse the session already resolved by the hook instead
  // of a second supabase.auth.getUser(), and guard every setState
  // against a post-unmount resolution.
  const { userId, profile, refresh } = useSessionProfile();
  const navigate = useNavigate();
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [membersBySub, setMembersBySub] = useState<Record<string, ExistingMember[]>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [formOpenFor, setFormOpenFor] = useState<string | null>(null);

  const loadData = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      setLoadingData(true);
      if (!userId) {
        setSubs([]);
        setMembersBySub({});
        setLoadingData(false);
        return;
      }
      const subsRes = await supabase
        .from("subscriptions")
        .select("id,status,start_date,next_billing_date,plans(name,billing_period,price_paise)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      const rows = (subsRes.data as unknown as SubRow[]) ?? [];
      if (!isCancelled()) setSubs(rows);

      const counts: Record<string, ExistingMember[]> = {};
      await Promise.all(
        rows.map(async (r) => {
          const fm = await supabase
            .from("family_members")
            .select("id,slot_number,full_name,gotra,relation,dob")
            .eq("subscription_id", r.id)
            .order("slot_number");
          counts[r.id] = (fm.data as ExistingMember[]) ?? [];
        }),
      );
      if (!isCancelled()) setMembersBySub(counts);
      if (!isCancelled()) setLoadingData(false);
    },
    [userId],
  );

  useEffect(() => {
    // [Bug 3.8] Guard against setState-after-unmount on slow loads.
    let cancelled = false;
    loadData(() => cancelled).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const initials =
    (profile?.full_name ?? "")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "🙏";

  // Current = first active, else first pending, else most recent.
  const current =
    subs.find((s) => s.status === "active") ?? subs.find((s) => s.status === "pending") ?? subs[0];
  const currentMembers = current ? (membersBySub[current.id] ?? []) : [];

  return (
    <div className="space-y-6">
      {/* Identity */}
      <div className="card-soft p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand to-[#F5A742] text-white flex items-center justify-center font-bold text-2xl shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-lg text-foreground truncate">
            {profile?.full_name || "Punyata Sadasya"}
          </div>
          <div className="text-sm text-muted-foreground truncate">
            {formatPhoneDisplay(profile?.phone)}
          </div>
          {current && (
            <div
              className={`mt-1 inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${
                current.status === "active"
                  ? "bg-success/10 text-success"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {current.status === "active" ? (
                <>
                  <ShieldCheck size={12} /> Active
                </>
              ) : (
                <>
                  <Clock size={12} /> Payment confirm ho raha hai…
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Current subscription */}
      {loadingData ? (
        <div className="h-20 w-full bg-black/5 rounded-2xl animate-pulse" />
      ) : current ? (
        <div className="card-soft divide-y divide-black/5">
          <div className="px-4 py-4">
            <div className="text-xs text-muted-foreground">Current Plan</div>
            <div className="font-bold text-foreground mt-0.5">
              {current.plans?.name ?? "—"}
              {current.plans && (
                <span className="text-xs text-muted-foreground font-medium ml-1">
                  ₹{Math.round(current.plans.price_paise / 100).toLocaleString("en-IN")}/
                  {current.plans.billing_period === "yearly" ? "Yearly" : "Monthly"}
                </span>
              )}
            </div>
          </div>
          <div className="px-4 py-4">
            <div className="text-xs text-muted-foreground">Next Billing</div>
            <div className="font-bold text-foreground mt-0.5">
              {fmtDate(current.next_billing_date)}
            </div>
          </div>
        </div>
      ) : (
        <div className="card-soft p-5 text-center space-y-3">
          <p className="text-sm text-muted-foreground">Abhi koi sadasyata nahi hai.</p>
          <Link
            to="/plans"
            className="inline-flex items-center gap-2 bg-brand text-white font-bold px-5 py-2.5 rounded-full text-sm"
          >
            Plans Dekhein <ArrowRight size={16} />
          </Link>
        </div>
      )}

      {/* Permanent completion section — same shared form */}
      {current && (
        <div className="card-soft overflow-hidden">
          <button
            onClick={() => setFormOpenFor((v) => (v === current.id ? null : current.id))}
            className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-secondary/40 transition-colors"
          >
            <div className="flex items-start gap-3 min-w-0">
              <Users
                size={20}
                className={
                  currentMembers.length === 0 ? "text-brand mt-0.5" : "text-muted-foreground mt-0.5"
                }
              />
              <div className="min-w-0">
                <div className="font-semibold text-foreground">
                  {currentMembers.length === 0
                    ? "Apne parivaar ki details poore karein"
                    : `Parivaar ke Sankalp Details (${currentMembers.length}/4)`}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {currentMembers.length === 0
                    ? "Naam-gotra add karein taaki har seva mein aapka sankalp liya ja sake."
                    : currentMembers.map((m) => m.full_name).join(", ")}
                </p>
              </div>
            </div>
            {formOpenFor === current.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {formOpenFor === current.id && (
            <div className="px-4 pb-4 border-t border-black/5 pt-4">
              <FamilyAddressForm
                subscriptionId={current.id}
                initialMembers={currentMembers}
                initialAddress={
                  profile
                    ? {
                        address_line1: profile.address_line1,
                        address_line2: profile.address_line2,
                        state: profile.state,
                        pincode: profile.pincode,
                      }
                    : null
                }
                onSaved={() => {
                  refresh();
                  loadData();
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Quick links */}
      <div className="card-soft divide-y divide-black/5">
        <Link
          to="/my-subscription"
          className="flex items-center gap-3 px-4 py-4 hover:bg-secondary/50 transition-colors"
        >
          <ShieldCheck size={20} className="text-muted-foreground" />
          <span className="font-semibold text-foreground flex-1">My Subscription</span>
          <ArrowRight size={16} className="text-muted-foreground" />
        </Link>
        {[
          { icon: HelpCircle, label: "Help / Support" },
          { icon: FileText, label: "Terms & Privacy" },
        ].map(({ icon: Icon, label }) => (
          <button
            key={label}
            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-secondary/50 transition-colors"
          >
            <Icon size={20} className="text-muted-foreground" />
            <span className="font-semibold text-foreground flex-1 text-left">{label}</span>
            <ArrowRight size={16} className="text-muted-foreground" />
          </button>
        ))}
      </div>

      <button
        onClick={async () => {
          await signOut();
          refresh();
          navigate({ to: "/", replace: true });
        }}
        className="w-full flex items-center justify-center gap-2 text-sm text-destructive font-semibold py-3"
      >
        <LogOut size={16} /> Log out
      </button>
    </div>
  );
}
