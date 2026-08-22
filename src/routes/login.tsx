import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck, Loader2 } from "lucide-react";
import { Header } from "@/components/site-chrome";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { requestOtp, verifyOtp, ensureMyProfile, AuthApiError } from "@/lib/auth-api";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
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
// ─────────────────────────────────────────────────────────────

type Step = "form" | "otp" | "verifying";

function LoginPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resentAt, setResentAt] = useState<Date | null>(null);
  const otpSentFor = useRef<string | null>(null);

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

  const sendOtp = async () => {
    setError(null);
    setBusy(true);
    try {
      await requestOtp(name.trim(), phoneDigits);
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
      await ensureMyProfile(name.trim() || null).catch(() => {});
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
      await requestOtp("", otpSentFor.current);
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
        <h1 className="text-2xl font-bold text-foreground">
          {step === "form" ? "Login / Sign Up" : "OTP Daalein"}
        </h1>

        {step === "form" && (
          <div className="mt-5 space-y-4 animate-fade-in">
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
              <label className="block text-sm font-bold text-foreground mb-1">मोबाइल नंबर</label>
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
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              disabled={!nameValid || !phoneValid || busy}
              onClick={sendOtp}
              className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-full transition-colors ${
                nameValid && phoneValid && !busy
                  ? "bg-brand text-white hover:bg-brand-deep"
                  : "bg-secondary text-muted-foreground cursor-not-allowed"
              }`}
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : null}
              OTP Bhejein <ArrowRight size={18} />
            </button>
            <div className="flex items-center gap-1.5 justify-center text-[11px] text-muted-foreground pt-2">
              <ShieldCheck size={13} className="text-success" /> Aapka number safe hai — sirf seva
              updates ke liye.
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
      </main>
    </div>
  );
}
