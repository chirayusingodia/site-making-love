import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Loader2,
  User,
  Users,
  FileText,
  Bell,
  HelpCircle,
} from "lucide-react";
import { Header } from "@/components/site-chrome";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { requestOtp, verifyOtp, reconcileMyProfile, AuthApiError } from "@/lib/auth-api";
import { turnstileEnabled, renderTurnstile, type RenderedTurnstile } from "@/lib/turnstile";

export const Route = createFileRoute("/login")({
  // Explicit optional return type keeps every existing ?redirect-only
  // call site valid; ?prefill= arrives only from /complete-profile §1c.
  validateSearch: (search: Record<string, unknown>): { redirect?: string; prefill?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    prefill: typeof search.prefill === "string" ? search.prefill : undefined,
  }),
  component: LoginPage,
});

// ─────────────────────────────────────────────────────────────
// LOGIN = SIGNUP (one combined form)
//
// Full Name + Mobile Number → OTP → verified. New numbers get a
// profile created server-side; known numbers just log in and the
// typed name is ignored. After success the user returns to
// ?redirect=... (e.g. the plan's buy step) or to /profile.
//
// Second path (additive, session brief §1a): "Continue with Google"
// above the phone form. Both paths end in the same place; the Google
// round-trip routes through /complete-profile (see that file). When
// the confirm step meets an already-registered number it sends the
// person BACK here with ?prefill=<digits> to use the normal OTP flow.
//
// OTP-request spam guard: when VITE_TURNSTILE_SITE_KEY is set, a
// Cloudflare Turnstile token rides on every /api/auth/request-otp
// call (Layer 2). Tokens are single-use — the widget resets after
// each attempt, including resends, which is why its host stays
// MOUNTED (off-screen, not display:none) through the OTP step.
// ─────────────────────────────────────────────────────────────

type Step = "form" | "otp" | "verifying";

// Temporarily off: Google login + the OTP-less /complete-profile step
// is the only signup/login path for now. Flip back to `true` to
// restore phone+OTP as an alternate path — nothing else needs to
// change, the OTP request/verify code below stays intact.
const PHONE_OTP_LOGIN_ENABLED = false;

/** Keeps only a plausible 10-digit Indian mobile from ?prefill=. */
function sanitizePrefill(raw: string | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : "";
}

function LoginPage() {
  const { redirect, prefill } = Route.useSearch();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(sanitizePrefill(prefill));
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resentAt, setResentAt] = useState<Date | null>(null);
  const otpSentFor = useRef<string | null>(null);

  // ── Turnstile state (no-op unless site key configured) ───────
  const captchaEnabled = turnstileEnabled();
  const captchaHostRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<RenderedTurnstile | null>(null);
  const tokenRef = useRef(""); // mirrors latest valid token
  const [captchaReady, setCaptchaReady] = useState(!captchaEnabled);

  useEffect(() => {
    if (!captchaEnabled || !captchaHostRef.current) return;
    let disposed = false;
    let rendered: RenderedTurnstile | null = null;
    renderTurnstile(
      captchaHostRef.current,
      (token) => {
        if (!disposed) {
          tokenRef.current = token;
          setCaptchaReady(true);
        }
      },
      () => {
        if (!disposed) {
          tokenRef.current = "";
          setCaptchaReady(false);
        }
      },
    )
      .then((r) => {
        if (disposed) {
          window.turnstile?.remove(r.widgetId);
          return;
        }
        rendered = r;
        widgetRef.current = r;
      })
      .catch(() => {
        // Script blocked (ad-blocker/network). Server-side Layer 3
        // rate limits still protect the route; sends will surface
        // the generic captcha-hint error instead of succeeding
        // blindly when the secret enforces it.
      });
    return () => {
      disposed = true;
      if (rendered) window.turnstile?.remove(rendered.widgetId);
      widgetRef.current = null;
    };
  }, [captchaEnabled]);

  /** Fresh-token gate before any send. Tokens are single-use; the
   *  caller MUST reset() after each request regardless of outcome. */
  const consumeCaptchaToken = async (): Promise<string> => {
    if (!captchaEnabled) return "";
    for (let waited = 0; waited < 4000 && !tokenRef.current; waited += 250) {
      await new Promise((r) => setTimeout(r, 250));
    }
    const token = tokenRef.current;
    tokenRef.current = "";
    setCaptchaReady(false);
    widgetRef.current?.reset(); // start solving the NEXT token now
    return token;
  };

  // Safe internal redirect targets only — never bounce off-site.
  const fallback = "/profile";
  const target =
    redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : fallback;

  // Deep-link back after a fresh verification in another tab.
  useEffect(() => {
    document.title = "Login — पुण्यता";
  }, []);

  const phoneDigits = phone.replace(/\D/g, "");
  const nameValid = name.trim().length >= 3;
  const phoneValid = /^[6-9]\d{9}$/.test(phoneDigits);

  const sendBlocked = !nameValid || !phoneValid || busy || !captchaReady;

  const sendOtp = async () => {
    setError(null);
    setBusy(true);
    try {
      const captchaToken = await consumeCaptchaToken();
      if (captchaEnabled && !captchaToken) {
        setError("Security check poori nahi hui — thodi der baad phir try karein.");
        return;
      }
      await requestOtp(name.trim(), phoneDigits, captchaToken || undefined);
      otpSentFor.current = phoneDigits;
      setStep("otp");
      setResentAt(new Date());
    } catch (err) {
      setError(
        err instanceof AuthApiError || err instanceof Error ? err.message : "Kuch galat ho gaya",
      );
    } finally {
      setBusy(false);
    }
  };

  const doVerify = async (code: string) => {
    if (!otpSentFor.current || code.length < 6) return;
    setStep("verifying");
    setError(null);
    try {
      await verifyOtp(otpSentFor.current, code);
      // Recover any pre-session legacy auth user missing its profile row.
      // [Pass-2 P13] the server route also repairs the phone-squatting
      // collision (verified OTP owner evicts an unverified Google claim)
      // — failures are logged, never silently swallowed: a profile-less
      // session is exactly the support-ticket factory this replaces.
      await reconcileMyProfile(name.trim() || null).catch((e) => {
        console.warn("profile reconciliation failed:", e);
      });
      navigate({ to: target, replace: true });
    } catch (err) {
      setOtp("");
      setStep("otp");
      setError(
        err instanceof Error
          ? err.message.includes("expired")
            ? "OTP expire ho gaya — naya OTP bhejein."
            : err.message.includes("Invalid") || err.message.includes("invalid")
              ? "Galat OTP — dobara check karein."
              : err.message
          : "Verification fail hui",
      );
    }
  };

  const resend = async () => {
    if (!otpSentFor.current) return;
    setBusy(true);
    setError(null);
    try {
      const captchaToken = await consumeCaptchaToken();
      if (captchaEnabled && !captchaToken) {
        // Widget is off-screen on this step; send the user back to
        // the form where it is visible to complete the check.
        setStep("form");
        setError("Pehle security check poori karein — phir naya OTP bhejein.");
        return;
      }
      await requestOtp("", otpSentFor.current, captchaToken || undefined);
      setResentAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTP dubara nahi bheja ja saka");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-md mx-auto px-4 pb-24 pt-8">
        {step === "form" && (
          <div className="text-center animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-brand-soft flex items-center justify-center mx-auto">
              <User size={36} className="text-brand" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-foreground">Login / Sign Up</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Login करें और अपनी सभी सेवाएँ एवं Proof एक ही जगह देखें।
            </p>
          </div>
        )}
        {step !== "form" && (
          <h1 className="text-2xl font-bold text-foreground">OTP Daalein</h1>
        )}

        {step === "form" && (
          <div className="mt-5 space-y-4 animate-fade-in">
            <GoogleAuthButton redirect={target} onError={(msg) => setError(msg)} />
            {error && <p className="text-xs text-destructive">{error}</p>}

            {PHONE_OTP_LOGIN_ENABLED && (
              <>
                <div className="flex items-center gap-3 py-1" aria-hidden="true">
                  <span className="h-px flex-1 bg-black/10" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    ya phone number se
                  </span>
                  <span className="h-px flex-1 bg-black/10" />
                </div>
                <p className="text-sm text-muted-foreground -mt-1">
                  नया नंबर हो तो account बन जाएगा, पुराना हो तो सीधे login — दोनों इसी form से।
                </p>
                <div>
                  <label className="block text-sm font-bold text-foreground mb-1">पूरा नाम</label>
                  <input
                    type="text"
                    placeholder="जैसे — राधा शर्मा"
                    value={name}
                    autoComplete="name"
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-foreground mb-1">
                    मोबाइल नंबर
                  </label>
                  <div className="flex items-center gap-0">
                    <span className="px-4 py-3 rounded-l-xl border border-r-0 border-black/10 bg-secondary font-semibold text-foreground">
                      +91
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      placeholder="9876543210"
                      value={phoneDigits}
                      autoComplete="tel-national"
                      maxLength={10}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      className="w-full px-4 py-3 rounded-r-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    OTP isi number par aayega. Seva ka proof bhi yahin WhatsApp hoga.
                  </p>
                </div>
                {!captchaReady && (
                  <p className="text-xs text-muted-foreground text-center">
                    Security check chal raha hai…
                  </p>
                )}
                <button
                  disabled={sendBlocked}
                  onClick={sendOtp}
                  className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-full transition-colors ${
                    !sendBlocked
                      ? "bg-brand text-white hover:bg-brand-deep"
                      : "bg-secondary text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : null}
                  OTP Bhejein <ArrowRight size={18} />
                </button>
              </>
            )}

            <div className="flex items-center gap-1.5 justify-center text-[11px] text-muted-foreground pt-2">
              <ShieldCheck size={13} className="text-success" /> Aapka number safe hai — sirf seva
              updates ke liye.
            </div>

            <div className="card-soft mt-8 divide-y divide-black/5">
              {[
                {
                  icon: ShieldCheck,
                  title: "Seva Proof",
                  desc: "Har seva ka photo/video proof yahin aur WhatsApp par",
                },
                {
                  icon: Users,
                  title: "Parivaar Sankalp",
                  desc: "Apne parivaar ke sabhi sadasyon ka naam-gotra ek jagah",
                },
                {
                  icon: FileText,
                  title: "Subscription & Billing",
                  desc: "Apni membership aur agli billing date kabhi bhi dekhein",
                },
                {
                  icon: Bell,
                  title: "Seva Updates",
                  desc: "Aane wali sevaon ki jaankari sabse pehle paayein",
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3 px-4 py-4">
                  <div className="w-9 h-9 rounded-full bg-brand-soft flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-brand" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground text-sm">{title}</div>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="card-soft mt-4 divide-y divide-black/5">
              {[
                { icon: HelpCircle, label: "Help / Support", href: "#" },
                { icon: FileText, label: "Terms & Privacy", href: "/terms-and-conditions" },
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
        )}

        {(step === "otp" || step === "verifying") && (
          <div className="mt-5 space-y-4 animate-fade-in">
            <p className="text-sm text-muted-foreground -mt-1">
              +91 {otpSentFor.current} par bheja gaya 6-anki OTP daalein.
            </p>
            <InputOTP
              maxLength={6}
              value={otp}
              disabled={step === "verifying"}
              onChange={(v) => {
                setOtp(v);
                if (v.length === 6) doVerify(v);
              }}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            {error && <p className="text-xs text-destructive">{error}</p>}
            {step === "verifying" && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> Verify ho raha hai…
              </p>
            )}
            <button
              onClick={resend}
              disabled={busy}
              className="w-full text-sm font-semibold text-brand py-2 disabled:opacity-60"
            >
              Naya OTP bhejein
            </button>
            <button
              onClick={() => {
                setStep("form");
                setOtp("");
                setError(null);
              }}
              className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-brand"
            >
              <ArrowLeft size={14} /> Number badlein
            </button>
          </div>
        )}

        {/* Turnstile host — OUTSIDE the step conditionals so the
            widget (and its single-use token supply for resends)
            survives the form → OTP transition. Visible on the form
            step; off-screen but ALIVE on later steps. */}
        <div
          ref={captchaHostRef}
          style={step === "form" ? undefined : { position: "fixed", left: -9999, top: 0 }}
          className={`flex justify-center ${step === "form" ? "mt-4" : ""}`}
        />
      </main>
    </div>
  );
}
