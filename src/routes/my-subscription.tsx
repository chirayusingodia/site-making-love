import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Clock,
  Users,
  MapPin,
  LogIn,
  AlertCircle,
  XCircle,
  CircleStop,
  RotateCcw,
} from "lucide-react";
import { SiteChrome } from "@/components/site-chrome";
import { useSessionProfile } from "@/hooks/use-session";
import { supabase } from "@/lib/supabase";
import { pendingCheckoutIsStale } from "@/lib/checkout-ttl";

export const Route = createFileRoute("/my-subscription")({
  head: () => ({
    meta: [
      { title: "My Subscription — पुण्यता" },
      {
        name: "description",
        content: "अपनी सक्रिय सदस्यता, परिवारजनों की सूची एवं अगली सेवा तिथि देखें।",
      },
    ],
  }),
  component: MySubscriptionPage,
});

// ─────────────────────────────────────────────────────────────
// MY SUBSCRIPTION — real data via RLS (no placeholders).
//
// Reads the caller's own subscriptions + family_members. Status is
// rendered HONESTLY (SESSION_STUCK_PENDING_CHECKOUT, Bug B): a fresh
// pending row shows grey "Confirming…", a stale one (past the
// checkout reuse window in checkout-ttl.ts — the same threshold the
// server uses to stop re-handing back dead razorpay ids) shows an
// explicit "payment complete nahi hua" state with a working retry
// action into /checkout/$planId. cancelled/expired/halted get their
// own labels mirroring admin.subscribers.tsx's StatusBadge vocabulary
// instead of folding into "Confirming…". Activation itself stays
// webhook-only; this page simply reflects whatever status exists.
// ─────────────────────────────────────────────────────────────

interface SubRow {
  id: string;
  status: string;
  start_date: string | null;
  next_billing_date: string | null;
  created_at: string;
  plans: { name: string; billing_period: string; price_paise: number; slug: string } | null;
}

interface MemberRow {
  id: string;
  slot_number: number;
  full_name: string;
  gotra: string | null;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  // [Pass-2 F16] anchor date-only strings to IST midnight — a bare
  // YYYY-MM-DD parses as UTC and displayed one day early for viewers
  // west of UTC.
  const iso = d.length === 10 ? `${d}T00:00:00+05:30` : d;
  const dt = new Date(iso);
  return isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      });
}

// [Bug B] Honest status pill — colours/icons mirror admin.subscribers.tsx's
// StatusBadge so customer-facing and admin-facing language for the same
// status match (paused=amber voluntary, cancelled=rose final,
// halted=red recoverable, expired=grey). "pending" splits on the shared
// checkout-ttl threshold: fresh → reassuring "Confirming…", stale → an
// explicit failure state, never the same grey spinner-equivalent.
function statusPill(status: string, pendingStale: boolean) {
  if (status === "active") {
    return { label: "Active", cls: "bg-success/10 text-success", icon: ShieldCheck };
  }
  if (status === "pending") {
    return pendingStale
      ? {
          label: "Payment Pending",
          cls: "bg-amber-50 text-amber-800 border border-amber-200",
          icon: AlertCircle,
        }
      : { label: "Confirming…", cls: "bg-secondary text-muted-foreground", icon: Clock };
  }
  if (status === "cancelled")
    return {
      label: "Cancelled",
      cls: "bg-rose-50 text-rose-800 border border-rose-200",
      icon: XCircle,
    };
  if (status === "halted")
    return {
      label: "Halted",
      cls: "bg-red-50 text-red-800 border border-red-200",
      icon: CircleStop,
    };
  if (status === "expired")
    return {
      label: "Expired",
      cls: "bg-slate-100 text-slate-500 border border-slate-200",
      icon: AlertCircle,
    };
  return { label: status, cls: "bg-secondary text-muted-foreground", icon: AlertCircle };
}

function MySubscriptionPage() {
  const { userId, loading: sessionLoading } = useSessionProfile();
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [membersBySub, setMembersBySub] = useState<Record<string, MemberRow[]>>({});
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!userId) {
      setSubs([]);
      setLoadingData(false);
      return;
    }
    (async () => {
      setLoadingData(true);
      const subsRes = await supabase
        .from("subscriptions")
        .select(
          "id,status,start_date,next_billing_date,created_at,plans(name,slug,billing_period,price_paise)",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      const rows = (subsRes.data as unknown as SubRow[]) ?? [];
      setSubs(rows);

      const map: Record<string, MemberRow[]> = {};
      await Promise.all(
        rows.map(async (r) => {
          const fm = await supabase
            .from("family_members")
            .select("id,slot_number,full_name,gotra")
            .eq("subscription_id", r.id)
            .order("slot_number");
          map[r.id] = (fm.data as MemberRow[]) ?? [];
        }),
      );
      setMembersBySub(map);
      setLoadingData(false);
    })();
  }, [userId]);

  if (sessionLoading || (userId && loadingData)) {
    return (
      <SiteChrome>
        <main className="max-w-md mx-auto px-4 pb-24 pt-8 space-y-4 animate-pulse">
          <div className="h-28 w-full bg-black/5 rounded-2xl" />
          <div className="h-20 w-full bg-black/5 rounded-2xl" />
        </main>
      </SiteChrome>
    );
  }

  if (!userId) {
    return (
      <SiteChrome>
        <main className="max-w-md mx-auto px-4 pb-24 pt-8">
          <div className="text-center space-y-5">
            <div className="w-20 h-20 rounded-full bg-brand-soft flex items-center justify-center mx-auto">
              <Sparkles size={36} className="text-brand" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Login karein</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Apni sadasyata dekhne ke liye mobile OTP se login karein.
              </p>
            </div>
            <Link
              to="/login"
              search={{ redirect: "/my-subscription" }}
              className="inline-flex items-center gap-2 bg-brand text-white font-bold px-6 py-3.5 rounded-full hover:bg-brand-deep transition-colors"
            >
              <LogIn size={18} /> Login
            </Link>
          </div>
        </main>
      </SiteChrome>
    );
  }

  const current =
    subs.find((s) => s.status === "active") ?? subs.find((s) => s.status === "pending") ?? subs[0];

  if (!current) {
    return (
      <SiteChrome>
        <main className="max-w-md mx-auto px-4 pb-24 pt-8">
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
          </div>
        </main>
      </SiteChrome>
    );
  }

  const members = membersBySub[current.id] ?? [];
  const plan = current.plans;

  // [Bug B] one honest read of "what kind of non-active is this?" —
  // computed once, used by pill + copy + retry CTA below.
  const pendingStale = current.status === "pending" && pendingCheckoutIsStale(current.created_at);
  const pill = statusPill(current.status, pendingStale);
  const PillIcon = pill.icon;

  const statusCopy: string | null =
    current.status === "pending"
      ? pendingStale
        ? "Payment complete nahi hua — dobara try karein."
        : "Payment mil gaya — activation webhook se poora hota hai, kuch hi minute mein."
      : current.status === "cancelled"
        ? "Yeh sadasyata cancel ho gayi hai."
        : current.status === "expired"
          ? "Yeh sadasyata expire ho gayi hai — naya plan chunein."
          : current.status === "halted"
            ? "Payment ki samasya ki wajah se seva ruki hai — hamari team aapse sampark karegi."
            : null;

  return (
    <SiteChrome>
      <main className="max-w-md mx-auto px-4 pb-24 pt-8 space-y-5">
        {/* Status card */}
        <div className="card-soft p-5 space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-brand">Current Plan</div>
            <span
              className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${pill.cls}`}
            >
              <PillIcon size={12} /> {pill.label}
            </span>
          </div>
          <div className="font-bold text-lg mt-1">
            {plan?.name ?? "—"}
            {plan && (
              <span className="text-sm text-muted-foreground font-medium ml-1">
                {/* [Pass-2 F9] exact-to-the-paisa display, matching formatINR. */}₹
                {(plan.price_paise / 100).toLocaleString("en-IN", {
                  minimumFractionDigits: plan.price_paise % 100 !== 0 ? 2 : 0,
                  maximumFractionDigits: 2,
                })}
                /{plan.billing_period === "yearly" ? "Yearly" : "Monthly"}
              </span>
            )}
          </div>
          {statusCopy && (
            <div
              className={`text-xs mt-1 ${pendingStale ? "text-amber-800 font-semibold" : "text-muted-foreground"}`}
            >
              {statusCopy}
            </div>
          )}
          {!statusCopy && current.status === "active" && (
            <div className="text-xs text-muted-foreground mt-1">
              Next billing: {fmtDate(current.next_billing_date)}
            </div>
          )}
          {pendingStale && plan?.slug && (
            // [Bug B] the explicit next action — lands on the normal
            // checkout for this plan; server-side (Part A) discards the
            // dead pending row and creates a fresh Razorpay subscription
            // on this very click.
            <Link
              to="/checkout/$planId"
              params={{ planId: plan.slug }}
              className="mt-3 inline-flex items-center gap-2 bg-brand text-white text-sm font-bold px-5 py-2.5 rounded-full hover:bg-brand-deep transition-colors"
            >
              <RotateCcw size={15} /> Payment Dobara Karein <ArrowRight size={15} />
            </Link>
          )}
        </div>

        {/* Family members */}
        <div className="card-soft p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Users
                size={16}
                className={members.length === 0 ? "text-brand" : "text-foreground"}
              />
              परिवार सदस्य
            </div>
            <span className="text-xs text-muted-foreground">{members.length}/4</span>
          </div>

          {members.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-brand/40 bg-brand-soft/30 p-4 text-center space-y-2">
              <p className="text-xs text-foreground/80 font-semibold">Sankalp Pending</p>
              <p className="text-[11px] text-muted-foreground">
                Naam-gotra abhi add nahi hue. Hamari team call karke help bhi karti hai — ya aap
                khud abhi add kar sakte hain.
              </p>
              <Link
                to="/profile"
                className="inline-flex items-center gap-1.5 bg-brand text-white text-xs font-bold px-4 py-2 rounded-full mt-1"
              >
                Details Add Karein <ArrowRight size={13} />
              </Link>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex justify-between text-sm border-b border-black/5 pb-2 last:border-0 last:pb-0"
                >
                  <span className="font-semibold text-foreground">{m.full_name}</span>
                  <span className="text-muted-foreground">{m.gotra?.trim() || "गोत्र अज्ञात"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Address on file */}
        <AddressCard />

        <Link
          to="/profile"
          className="w-full flex items-center justify-center gap-2 bg-secondary text-foreground font-bold py-3.5 rounded-full hover:bg-muted transition-colors"
        >
          Profile Poore Karein <ArrowRight size={18} />
        </Link>
      </main>
    </SiteChrome>
  );
}

function AddressCard() {
  // [Bug 3.8] Used to re-run supabase.auth.getUser() + a profiles
  // query of its own with no unmount guard; useSessionProfile()
  // already resolved exactly this data for the parent page.
  const { profile } = useSessionProfile();
  const addr = {
    address_line1: profile?.address_line1 ?? null,
    state: profile?.state ?? null,
    pincode: profile?.pincode ?? null,
  };

  const filled = addr.address_line1?.trim();

  return (
    <div className="card-soft p-5 flex items-start gap-3">
      <MapPin size={16} className={filled ? "text-success mt-0.5" : "text-brand mt-0.5"} />
      <div className="min-w-0">
        <div className="text-sm font-bold">Prasad Address</div>
        {filled ? (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {addr.address_line1}
            {addr.state ? `, ${addr.state}` : ""} {addr.pincode ? `- ${addr.pincode}` : ""}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">
            Abhi add nahi hua — Premium Annual prasad delivery ke liye zaroori.
          </p>
        )}
      </div>
    </div>
  );
}
