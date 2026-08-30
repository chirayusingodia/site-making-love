import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  ShieldCheck,
  Loader2,
  Tag,
  X,
  Lock,
  RefreshCcw,
  CalendarX,
  BadgeCheck,
  MapPin,
} from "lucide-react";
import { usePublicPlans, getPlanById } from "@/lib/plans";
import { Header, WhatsAppFloat } from "@/components/site-chrome";
import { useSessionProfile } from "@/hooks/use-session";
import { callUserApi, AuthApiError } from "@/lib/auth-api";
import { normalizePhoneE164 } from "@/lib/phone";
import { useTranslation } from "@/lib/translations";

// Coupon entry is parked for now — flip this back on to restore the
// "Coupon Code (optional)" card on /checkout without touching the
// surrounding logic (couponApplied/applyCoupon stay wired up so this
// is a one-line revert).
const COUPON_UI_ENABLED = false;

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

// Gateway-neutral checkout contract (migration 022). The server picks
// the provider — including failing over when the preferred one is
// unwell — and tells us how to open it via `checkoutStrategy`. Nothing
// here assumes Razorpay beyond the branch that handles its SDK.
interface CreateCheckoutResponse {
  ok: true;
  subscriptionDbId: string;
  mandateId: string;
  gateway: string;
  gatewayMandateId: string;
  gatewayPublicKey: string | null;
  checkoutStrategy: "razorpay_sdk" | "hosted_redirect" | string;
  hostedCheckoutUrl: string | null;
  planName: string;
  planPricePaise: number;
  couponCode: string | null;
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

function CheckoutPage() {
  const { planId } = Route.useParams();
  const { att: attToken } = Route.useSearch();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isRefetching } = usePublicPlans();
  const { userId, profile, loading: sessionLoading, refresh: refreshProfile } = useSessionProfile();

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
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Naam/mobile shown here are editable — a typo'd name or a wrong
  // number entered at signup shouldn't force a trip to /profile
  // before someone can pay. Seeded once from the loaded profile, then
  // left alone (so refresh() after a save doesn't clobber more typing).
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [identitySeeded, setIdentitySeeded] = useState(false);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  useEffect(() => {
    if (!identitySeeded && profile) {
      setNameInput(profile.full_name ?? "");
      setPhoneInput(profile.phone ? profile.phone.replace(/\D/g, "").slice(-10) : "");
      setIdentitySeeded(true);
    }
  }, [profile, identitySeeded]);

  // Persists whichever of naam/mobile actually changed. Phone is
  // UNIQUE across profiles (same as the Google sign-in confirm step),
  // so a collision comes back as a clear message, not a raw DB error.
  // Returns false only when there is an edit that could NOT be saved
  // (invalid number, or the API call failed) — callers use this to
  // decide whether it's safe to carry on (e.g. open the Razorpay modal).
  const saveIdentity = async (): Promise<boolean> => {
    const trimmedName = nameInput.trim();
    const currentName = profile?.full_name ?? "";
    const currentPhoneDigits = profile?.phone ? profile.phone.replace(/\D/g, "").slice(-10) : "";
    const typedPhoneDigits = phoneInput.replace(/\D/g, "");

    const payload: { full_name?: string; phone?: string } = {};
    if (trimmedName && trimmedName !== currentName) payload.full_name = trimmedName;
    if (typedPhoneDigits && typedPhoneDigits !== currentPhoneDigits) {
      if (!normalizePhoneE164(typedPhoneDigits)) {
        setIdentityError(t("checkout_phone_required"));
        return false;
      }
      payload.phone = typedPhoneDigits;
    }
    if (Object.keys(payload).length === 0) {
      setIdentityError(null);
      return true;
    }

    setIdentitySaving(true);
    setIdentityError(null);
    try {
      await callUserApi("/api/profile/identity", payload);
      refreshProfile();
      return true;
    } catch (err) {
      setIdentityError(
        err instanceof AuthApiError ? err.message : t("checkout_identity_save_error"),
      );
      return false;
    } finally {
      setIdentitySaving(false);
    }
  };

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
          <h1 className="text-xl font-bold">{t("checkout_load_error_title")}</h1>
          <p className="text-sm text-muted-foreground">{t("checkout_load_error_desc")}</p>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="inline-flex items-center gap-2 bg-brand text-white text-xs font-bold px-5 py-2.5 rounded-full disabled:opacity-60"
          >
            {isRefetching ? t("checkout_retrying") : t("checkout_retry")}
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
          <h1 className="text-2xl font-bold">{t("checkout_plan_not_found")}</h1>
          <Link to="/plans" className="mt-4 inline-block text-brand font-semibold">
            {t("checkout_back_to_plans")}
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
    // Naam/mobile are mandatory before payment — required either
    // already on the profile or freshly typed here.
    if (!nameInput.trim()) {
      setIdentityError(t("checkout_name_required"));
      return;
    }
    if (!normalizePhoneE164(phoneInput.replace(/\D/g, ""))) {
      setIdentityError(t("checkout_phone_required"));
      return;
    }
    // Make sure a just-typed name/number correction is not left
    // sitting locally when payment opens.
    const identityOk = await saveIdentity();
    if (!identityOk) return;
    setPayState("creating");
    try {
      // Create the mandate FIRST, then load the SDK the chosen gateway
      // actually needs. Loading Razorpay's script before knowing the
      // gateway would both waste a request and hard-wire this flow to
      // one provider again.
      const res = await callUserApi<CreateCheckoutResponse>("/api/subscriptions/create-checkout", {
        plan_id: plan.slug,
        ...(couponApplied ? { coupon_code: couponApplied } : {}),
        ...(attToken ? { att: attToken } : {}),
      });

      // Redirect-style gateways: hand the customer straight to the
      // provider-hosted page. No SDK involved.
      if (res.checkoutStrategy === "hosted_redirect") {
        if (!res.hostedCheckoutUrl) throw new Error(t("checkout_gateway_error"));
        setPayState("checkout");
        window.location.href = res.hostedCheckoutUrl;
        return;
      }

      if (res.checkoutStrategy !== "razorpay_sdk") {
        // A gateway this build has no frontend branch for. Fail loudly
        // rather than silently opening the wrong SDK with the wrong key.
        throw new Error(t("checkout_gateway_error"));
      }

      const ready = await loadRazorpayScript();
      if (!ready || !window.Razorpay) throw new Error(t("checkout_gateway_error"));
      if (!res.gatewayPublicKey) throw new Error(t("checkout_keys_error"));

      setPayState("checkout");
      const rzp = new window.Razorpay({
        key: res.gatewayPublicKey,
        subscription_id: res.gatewayMandateId,
        name: "Punyata",
        description: `${plan.name} — Sewa Hamari, Punya Aapka`,
        image: "/punyata-logo.svg",
        prefill: {
          name: nameInput.trim() || profile?.full_name || "",
          contact:
            phoneInput.replace(/\D/g, "") || profile?.phone?.replace(/\D/g, "").slice(-10) || "",
          email: profile?.email || "",
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
            setPayError(t("checkout_cancelled_msg"));
          },
        },
      });
      rzp.open();
    } catch (err) {
      setPayState("error");
      setPayError(err instanceof Error ? err.message : t("checkout_generic_error"));
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
          <h1 className="text-xl font-bold text-foreground">{t("checkout_paid_title")}</h1>
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            {t("checkout_paid_sub")}
          </p>
        </main>
      </div>
    );
  }

  const paying = payState === "creating" || payState === "checkout";
  const identityMissing = !nameInput.trim() || !normalizePhoneE164(phoneInput.replace(/\D/g, ""));

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-md mx-auto px-4 pb-32 pt-4 space-y-5">
        <Link
          to="/plan/$planId"
          params={{ planId: plan.id }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand mb-1"
        >
          <ArrowLeft size={16} /> {t("checkout_back")}
        </Link>

        {/* Trust strip — sets a "safe & secure" tone before any form field */}
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              icon: RefreshCcw,
              title: t("checkout_trust_refund_title"),
              desc: t("checkout_trust_refund_desc"),
            },
            {
              icon: CalendarX,
              title: t("checkout_trust_cancel_title"),
              desc: t("checkout_trust_cancel_desc"),
            },
            {
              icon: Lock,
              title: t("checkout_trust_secure_title"),
              desc: t("checkout_trust_secure_desc"),
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl bg-success/10 border border-success/20 px-2.5 py-3 text-center space-y-1"
            >
              <Icon size={18} className="text-success mx-auto" />
              <div className="text-[11px] font-bold text-foreground leading-tight">{title}</div>
              <div className="text-[9.5px] text-muted-foreground leading-tight">{desc}</div>
            </div>
          ))}
        </div>

        {/* Plan summary */}
        <div className="card-soft overflow-hidden">
          <div className="bg-gradient-to-r from-brand to-[#F5A742] px-5 py-4 flex items-baseline justify-between">
            <div className="font-bold text-lg text-white">{plan.name}</div>
            <div className="text-right">
              <span className="text-2xl font-bold text-white">{plan.price}</span>
              <span className="text-xs text-white/80 font-medium">{plan.cycle}</span>
            </div>
          </div>
          <div className="p-5 space-y-3">
            {plan.strikePrice && (
              <div className="text-xs text-muted-foreground line-through -mt-1">
                {plan.strikePrice}
              </div>
            )}
            <div className="space-y-2">
              {plan.features.slice(0, 4).map((f) => (
                <div key={f} className="flex items-start gap-2.5 text-sm">
                  <div className="mt-0.5 w-4 h-4 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                    <Check size={11} className="text-success" strokeWidth={3} />
                  </div>
                  <span className="text-foreground/85">{f}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border-t border-black/5 pt-3">
              <MapPin size={12} className="text-brand shrink-0" />
              {plan.location}
            </div>
          </div>
        </div>

        {/* Identity — editable: naam ya number galat ho toh yahin se
            theek ho jaaye, bina /profile par gaye. Same trust-now
            approach as the Google sign-in confirm step — no OTP re-
            verification, phone's UNIQUE constraint is the backstop. */}
        <div className="card-soft p-4 space-y-2.5">
          <div className="text-sm font-bold text-brand flex items-center gap-1.5">
            <BadgeCheck size={15} /> {t("checkout_your_details")}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("checkout_name_label")}</label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={saveIdentity}
              placeholder={t("checkout_name_placeholder")}
              className="w-full px-3 py-2 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-sm font-semibold text-foreground"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("checkout_phone_label")}</label>
            <input
              type="tel"
              inputMode="numeric"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
              onBlur={saveIdentity}
              placeholder={t("checkout_phone_placeholder")}
              className="w-full px-3 py-2 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-sm font-semibold text-foreground"
            />
          </div>
          {identitySaving && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" /> {t("checkout_saving")}
            </p>
          )}
          {identityError && <p className="text-[11px] text-destructive">{identityError}</p>}
          <p className="text-[11px] text-muted-foreground pt-1">{t("checkout_family_note")}</p>
        </div>

        {/* Coupon entry — parked (COUPON_UI_ENABLED at top of file) */}
        {COUPON_UI_ENABLED &&
          (!couponApplied ? (
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
          ))}

        {/* Amount + pay */}
        <div className="card-soft p-4 space-y-2 text-sm">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            {t("checkout_order_summary")}
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-muted-foreground">{t("checkout_plan_label")}</span>
            <span className="font-bold text-foreground">{plan.name}</span>
          </div>
          <div className="flex justify-between border-t border-black/5 pt-2">
            <span className="text-muted-foreground">{t("checkout_amount_label")}</span>
            <span className="font-bold text-brand">
              {plan.price}
              <span className="text-xs text-muted-foreground font-medium">{plan.cycle}</span>
            </span>
          </div>
        </div>

        {payError && <p className="text-xs text-destructive text-center">{payError}</p>}

        {/* Mandatory terms acknowledgment — required before payment starts */}
        <label className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl bg-secondary/60 border border-black/5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 w-4 h-4 shrink-0 rounded border-black/20 accent-brand"
          />
          <span className="text-[12.5px] text-foreground/75 leading-relaxed">
            {t("checkout_terms_confirm")}{" "}
            <Link
              to="/terms-and-conditions"
              target="_blank"
              className="text-brand font-semibold underline"
              onClick={(e) => e.stopPropagation()}
            >
              {t("checkout_terms_tc")}
            </Link>{" "}
            {t("checkout_terms_and")}{" "}
            <Link
              to="/refund-policy"
              target="_blank"
              className="text-brand font-semibold underline"
              onClick={(e) => e.stopPropagation()}
            >
              {t("checkout_terms_refund")}
            </Link>{" "}
            {t("checkout_terms_read")}
          </span>
        </label>

        <button
          onClick={startPayment}
          disabled={paying || !agreedToTerms || identityMissing}
          className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-full transition-colors shadow-[0_8px_24px_rgba(216,90,48,0.25)] ${
            paying
              ? "bg-brand/70 text-white cursor-wait shadow-none"
              : !agreedToTerms || identityMissing
                ? "bg-brand/40 text-white cursor-not-allowed shadow-none"
                : "bg-brand text-white hover:bg-brand-deep"
          }`}
        >
          {paying ? <Loader2 size={18} className="animate-spin" /> : <Lock size={16} />}
          {paying ? t("checkout_opening_gateway") : `${t("checkout_pay_button")} ${plan.price}`}
        </button>

        <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          <ShieldCheck size={12} className="text-success" /> {t("checkout_secure_footer")}
        </div>
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-brand">
          <ShieldCheck size={12} /> {t("trust_years_badge")}
        </div>
      </main>
      <WhatsAppFloat />
    </div>
  );
}
