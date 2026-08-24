import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ShieldCheck, Loader2, Tag, X } from "lucide-react";
import { usePublicPlans, getPlanById } from "@/lib/plans";
import { Header, WhatsAppFloat } from "@/components/site-chrome";
import { useSessionProfile } from "@/hooks/use-session";
import { callUserApi, AuthApiError } from "@/lib/auth-api";
import { formatPhoneDisplay } from "@/lib/phone";

export const Route = createFileRoute("/checkout/$planId")({
  // §9.1: telecaller payment links arrive as /checkout/<slug>?att=<token>.
  validateSearch: (search: Record<string, unknown>): { att?: string } => ({
    att: typeof search.att === "string" ? search.att : undefined,
  }),
  component: CheckoutPage,
});

// ─────────────────────────────────────────────────────────────
// BUY STEP — post-login, one click.
//
// Funnel order (session prompt §1): login happens FIRST; this page
// assumes a session and bounces to /login?redirect=… when absent.
// Family/gotra/address entry deliberately does NOT happen here — it
// lives on /subscription-success + /profile after payment.
//
// "Confirm & Pay" → POST /api/subscriptions/create-checkout creates
// the pending subscription row + Razorpay Subscription → Razorpay
// Checkout opens for the plan amount → on success we show an
// interim "confirming" state and hand off to /subscription-success.
// Activation is WEBHOOK-ONLY — nothing here ever flips status.
// ─────────────────────────────────────────────────────────────

type PayState = "idle" | "creating" | "checkout" | "paid" | "error";

interface CreateCheckoutResponse {
  ok: true;
  subscriptionDbId: string;
  razorpaySubscriptionId: string;
  planName: string;
  planPricePaise: number;
  couponCode: string | null;
  razorpayKeyId: string | null;
}

interface CouponValidateResponse {
  ok: boolean;
  code?: string;
  discountPaise?: number;
  error?: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// [Bug 3.6] Shared display formatter — profile.tsx used to render the
// same stored number differently (it only handled a literal "+91…").
const formatPhone = formatPhoneDisplay;

function CheckoutPage() {
  const { planId } = Route.useParams();
  const { att: attToken } = Route.useSearch();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch, isRefetching } = usePublicPlans();
  const { userId, profile, loading: sessionLoading } = useSessionProfile();

  // Session gate — remember which plan they wanted via ?redirect
  // (and carry the attribution token through the login bounce).
  useEffect(() => {
    if (!sessionLoading && !userId) {
      const back = attToken
        ? `/checkout/${planId}?att=${encodeURIComponent(attToken)}`
        : `/checkout/${planId}`;
      navigate({ to: "/login", search: { redirect: back }, replace: true });
    }
  }, [sessionLoading, userId, planId, attToken, navigate]);

  const [couponInput, setCouponInput] = useState("");
  const [couponApplied, setCouponApplied] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [payState, setPayState] = useState<PayState>("idle");
  const [payError, setPayError] = useState<string | null>(null);

  if (isLoading || sessionLoading || !userId) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-md mx-auto px-4 pb-32 pt-4 space-y-4 animate-pulse">
          <div className="h-4 w-28 bg-black/10 rounded" />
          <div className="h-40 w-full bg-black/5 rounded-2xl" />
          <div className="h-24 w-full bg-black/5 rounded-2xl" />
        </main>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
          <h1 className="text-xl font-bold">Checkout load nahi ho paya</h1>
          <p className="text-sm text-muted-foreground">
            Live plan data fetch karne mein samasya aayi. Kripya punah prayas karein.
          </p>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="inline-flex items-center gap-2 bg-brand text-white text-xs font-bold px-5 py-2.5 rounded-full disabled:opacity-60"
          >
            {isRefetching ? "Retrying..." : "Retry"}
          </button>
        </main>
      </div>
    );
  }

  const plan = getPlanById(data.plans, planId);
  if (!plan) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold">Plan not found</h1>
          <Link to="/plans" className="mt-4 inline-block text-brand font-semibold">
            Back to Plans
          </Link>
        </main>
      </div>
    );
  }

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponBusy(true);
    setCouponMsg(null);
    try {
      const res = await callUserApi<CouponValidateResponse>("/api/coupons/validate", {
        code,
        plan_id: plan.slug,
      });
      if (res.ok) {
        setCouponApplied(res.code ?? code);
        setCouponMsg(
          "Coupon darj ho gaya — discount ki pushti team payment se pehle confirm karegi.",
        );
      } else {
        setCouponApplied(null);
        setCouponMsg(res.error ?? "Coupon valid nahi hai.");
      }
    } catch (err) {
      setCouponMsg(err instanceof AuthApiError ? err.message : "Coupon check nahi ho paya.");
    } finally {
      setCouponBusy(false);
    }
  };

  const startPayment = async () => {
    setPayError(null);
    setPayState("creating");
    try {
      const ready = await loadRazorpayScript();
      if (!ready || !window.Razorpay)
        throw new Error("Payment gateway load nahi hua — internet check karke retry karein.");

      const res = await callUserApi<CreateCheckoutResponse>("/api/subscriptions/create-checkout", {
        plan_id: plan.slug,
        ...(couponApplied ? { coupon_code: couponApplied } : {}),
        ...(attToken ? { att: attToken } : {}),
      });
      if (!res.razorpayKeyId)
        throw new Error("Payment keys configured nahi hain — thodi der baad try karein.");

      setPayState("checkout");
      const rzp = new window.Razorpay({
        key: res.razorpayKeyId,
        subscription_id: res.razorpaySubscriptionId,
        name: "Punyata",
        description: `${plan.name} — Sewa Hamari, Punya Aapka`,
        image: "/punyata-logo.svg",
        prefill: {
          name: profile?.full_name ?? "",
          contact: profile?.phone?.replace(/\D/g, "").slice(-10) ?? "",
        },
        notes: { punyata_subscription_id: res.subscriptionDbId },
        theme: { color: "#D85A30" },
        handler: () => {
          // Money received on Razorpay's side. We do NOT touch
          // subscriptions.status here — activation lands via webhook.
          setPayState("paid");
          setTimeout(() => {
            navigate({ to: "/subscription-success", search: { ref: res.subscriptionDbId } });
          }, 2200);
        },
        modal: {
          ondismiss: () => {
            setPayState("idle");
            setPayError("Payment cancel ho gaya — jab chahein dobara try karein.");
          },
        },
      });
      rzp.open();
    } catch (err) {
      setPayState("error");
      setPayError(err instanceof Error ? err.message : "Payment shuru nahi ho paya.");
    }
  };

  // ── Post-payment interim state ──
  if (payState === "paid") {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-success/15 text-success flex items-center justify-center mx-auto">
            <Check size={40} />
          </div>
          <h1 className="text-xl font-bold text-foreground">Payment mil gaya!</h1>
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Aapki sadasyata confirm ho rahi hai…
          </p>
        </main>
      </div>
    );
  }

  const paying = payState === "creating" || payState === "checkout";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-md mx-auto px-4 pb-32 pt-4 space-y-5">
        <Link
          to="/plan/$planId"
          params={{ planId: plan.id }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand mb-1"
        >
          <ArrowLeft size={16} /> Back to Plan
        </Link>

        {/* Plan summary */}
        <div className="card-soft p-5 space-y-3">
          <div className="flex items-baseline justify-between">
            <div className="font-bold text-lg text-foreground">{plan.name}</div>
            <div className="text-right">
              <span className="text-2xl font-bold text-brand">{plan.price}</span>
              <span className="text-xs text-muted-foreground font-medium">{plan.cycle}</span>
            </div>
          </div>
          {plan.strikePrice && (
            <div className="text-xs text-muted-foreground line-through -mt-2">
              {plan.strikePrice}
            </div>
          )}
          <div className="border-t border-black/5 pt-3 space-y-1.5">
            {plan.features.slice(0, 4).map((f) => (
              <div key={f} className="flex items-start gap-2 text-sm">
                <Check size={14} className="text-success shrink-0 mt-0.5" />
                <span className="text-foreground/85">{f}</span>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground">{plan.location}</div>
        </div>

        {/* Identity — already known, never re-asked */}
        <div className="card-soft p-4 space-y-2">
          <div className="text-sm font-bold text-brand">Aapki Details</div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Naam</span>
            <span className="font-semibold text-foreground">{profile?.full_name || "—"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Mobile</span>
            <span className="font-semibold text-foreground">
              {formatPhone(profile?.phone ?? null)}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground pt-1">
            Parivaar ke naam-gotra payment ke baad profile par add kiye jaate hain.
          </p>
        </div>

        {/* Optional coupon */}
        {!couponApplied ? (
          <div className="card-soft p-4 space-y-2">
            <label className="block text-sm font-bold text-foreground">
              <Tag size={13} className="inline mr-1 text-brand" /> Coupon Code (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="CODE"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                className="flex-1 px-4 py-2.5 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none uppercase text-foreground"
              />
              <button
                onClick={applyCoupon}
                disabled={!couponInput.trim() || couponBusy}
                className="px-4 py-2.5 rounded-xl bg-secondary text-foreground font-bold text-sm disabled:opacity-50"
              >
                {couponBusy ? <Loader2 size={16} className="animate-spin" /> : "Apply"}
              </button>
            </div>
            {couponMsg && <p className="text-xs text-destructive">{couponMsg}</p>}
          </div>
        ) : (
          <div className="card-soft p-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Tag size={15} className="text-success" />
              <span className="font-bold text-foreground">{couponApplied}</span>
              <span className="text-success text-xs font-semibold">darj ✓</span>
            </div>
            <button
              onClick={() => {
                setCouponApplied(null);
                setCouponInput("");
                setCouponMsg(null);
              }}
              aria-label="Remove coupon"
              className="text-muted-foreground hover:text-destructive"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Amount + pay */}
        <div className="card-soft p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-bold text-foreground">{plan.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-bold text-brand">
              {plan.price}
              <span className="text-xs text-muted-foreground font-medium">{plan.cycle}</span>
            </span>
          </div>
        </div>

        {payError && <p className="text-xs text-destructive text-center">{payError}</p>}

        <button
          onClick={startPayment}
          disabled={paying}
          className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-full transition-colors ${
            paying
              ? "bg-brand/70 text-white cursor-wait"
              : "bg-brand text-white hover:bg-brand-deep"
          }`}
        >
          {paying ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
          {paying ? "Razorpay khul raha hai…" : `Confirm & Pay ${plan.price}`}
        </button>

        <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          <ShieldCheck size={12} className="text-success" /> 100% Secure Payment via Razorpay · UPI
          AutoPay / Card
        </div>
      </main>
      <WhatsAppFloat />
    </div>
  );
}
