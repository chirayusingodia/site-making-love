import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Header } from "@/components/site-chrome";
import { completeGoogleProfile, fetchMyProfile, AuthApiError, signOut } from "@/lib/auth-api";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/complete-profile")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: CompleteProfilePage,
});

// ─────────────────────────────────────────────────────────────
// COMPLETE PROFILE = first-ever-Google-sign-in confirm step
//
// The OAuth redirect lands HERE (GoogleAuthButton sets redirectTo).
// This route is the single checkpoint from the session brief §2:
//   • no session            → back to /login (nothing happened)
//   • session + profile row  → RETURNING Google user → straight to
//                              ?redirect target (buy step) — no
//                              confirm screen, ever
//   • session + NO profile   → first-timer: one small step —
//                              "Apna mobile number confirm karein".
//                              Name pre-filled from Google (editable),
//                              phone required + format-validated but
//                              deliberately NOT OTP-verified (§1b):
//                              real verification stays with the
//                              existing telecaller call queue.
//
// Duplicate collision (§1c): server answers 409 code=phone_taken →
// clear message + routed into phone-OTP login with ?prefill=<digits>.
// Account merging is explicitly out of scope.
//
// Built as a dedicated ROUTE (not a login modal) so the OAuth
// redirectTo has exactly one honest destination regardless of which
// surface started the sign-in.
// ─────────────────────────────────────────────────────────────

type Phase = "resolving" | "form" | "submitting";

function CompleteProfilePage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("resolving");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  // Same-number checkbox: default TRUE (the common case) — unticking
  // reveals a second field for the actual calling number, since
  // `phone` above stays the WhatsApp number (seva proofs ride on it).
  const [sameAsWhatsapp, setSameAsWhatsapp] = useState(true);
  const [altPhone, setAltPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phoneTaken, setPhoneTaken] = useState(false);
  const decided = useRef(false);

  // Safe internal redirect targets only — never bounce off-site.
  const fallback = "/profile";
  const target =
    redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : fallback;

  useEffect(() => {
    document.title = "Mobile number confirm karein — पुण्यता";
  }, []);

  // detectSessionInUrl finishes asynchronously after the OAuth bounce;
  // poll getSession briefly instead of racing it.
  useEffect(() => {
    if (decided.current) return;
    let cancelled = false;
    (async () => {
      let sessionUser: { id: string; metaName: string } | null = null;
      for (let waited = 0; waited < 5000; waited += 300) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          const meta = session.user.user_metadata as
            { full_name?: string; name?: string } | undefined;
          sessionUser = {
            id: session.user.id,
            metaName: meta?.full_name ?? meta?.name ?? "",
          };
          break;
        }
        await new Promise((r) => setTimeout(r, 300));
        if (cancelled) return;
      }

      if (cancelled || decided.current) return;
      decided.current = true;

      if (!sessionUser) {
        // Round-trip never completed (user aborted at Google, or deep-
        // linked here directly). Nothing to confirm — start over.
        navigate({ to: "/login", search: { redirect: target }, replace: true });
        return;
      }

      const profile = await fetchMyProfile().catch(() => null);
      if (cancelled) return;
      if (profile) {
        // Returning Google user — skip straight ahead, per §1c/§7.
        navigate({ to: target, replace: true });
        return;
      }
      setFullName(sessionUser.metaName);
      setPhase("form");
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, target]);

  const phoneDigits = phone.replace(/\D/g, "");
  const phoneValid = /^[6-9]\d{9}$/.test(phoneDigits);
  const altPhoneDigits = altPhone.replace(/\D/g, "");
  const altPhoneValid = sameAsWhatsapp || /^[6-9]\d{9}$/.test(altPhoneDigits);

  const submit = async () => {
    setError(null);
    setPhoneTaken(false);
    setPhase("submitting");
    try {
      await completeGoogleProfile(
        fullName.trim(),
        phoneDigits,
        sameAsWhatsapp ? undefined : altPhoneDigits,
      );
      navigate({ to: target, replace: true });
    } catch (err) {
      setPhase("form");
      if (err instanceof AuthApiError && err.status === 409) {
        setPhoneTaken(true); // §1c routing below
        return;
      }
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Kuch galat ho gaya — thodi der baad try karein.",
      );
    }
  };

  const wrongAccount = async () => {
    await signOut().catch(() => {});
    navigate({ to: "/login", search: { redirect: target }, replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-md mx-auto px-4 pb-24 pt-8">
        <h1 className="text-2xl font-bold text-foreground">Apna mobile number confirm karein</h1>

        {phase === "resolving" && (
          <p className="mt-5 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Aapki details check ho rahi hain…
          </p>
        )}

        {(phase === "form" || phase === "submitting") && (
          <div className="mt-5 space-y-4 animate-fade-in">
            <p className="text-sm text-muted-foreground -mt-1">
              Google se aap verify ho gaye hain. Bas apna mobile number confirm kar dein — isi par
              seva ki updates aur sankalp ki jaankari aayegi.
            </p>
            <div>
              <label className="block text-sm font-bold text-foreground mb-1">
                पूरा नाम{" "}
                <span className="font-normal text-muted-foreground">(badal sakte hain)</span>
              </label>
              <input
                type="text"
                placeholder="जैसे — राधा शर्मा"
                value={fullName}
                autoComplete="name"
                onChange={(e) => setFullName(e.target.value)}
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
                  disabled={phoneTaken}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="w-full px-4 py-3 rounded-r-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground disabled:bg-secondary disabled:text-muted-foreground"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Koi OTP nahi aayega — number sirf record ke liye. Seva ka proof bhi isi WhatsApp
                number par aayega.
              </p>
            </div>

            <label className="flex items-start gap-2.5 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={sameAsWhatsapp}
                onChange={(e) => {
                  setSameAsWhatsapp(e.target.checked);
                  if (e.target.checked) setAltPhone("");
                }}
                className="mt-0.5 w-4 h-4 accent-brand"
              />
              <span>Mera WhatsApp number hi calling number hai</span>
            </label>

            {!sameAsWhatsapp && (
              <div className="animate-fade-in">
                <label className="block text-sm font-bold text-foreground mb-1">
                  Calling Number
                </label>
                <div className="flex items-center gap-0">
                  <span className="px-4 py-3 rounded-l-xl border border-r-0 border-black/10 bg-secondary font-semibold text-foreground">
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="9876543210"
                    value={altPhoneDigits}
                    autoComplete="tel-national"
                    maxLength={10}
                    onChange={(e) => setAltPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    className="w-full px-4 py-3 rounded-r-xl border border-black/10 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-foreground"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Team isi number par call karegi — WhatsApp update upar wale number par hi aayenge.
                </p>
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
            {phoneTaken && (
              <div className="space-y-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                <p className="text-xs text-destructive font-semibold">
                  Ye number pehle se registered hai — OTP se login karein.
                </p>
                <button
                  onClick={() =>
                    navigate({
                      to: "/login",
                      search: { redirect: target, prefill: phoneDigits },
                      replace: true,
                    })
                  }
                  className="w-full flex items-center justify-center gap-2 font-bold py-3 rounded-full bg-brand text-white hover:bg-brand-deep transition-colors"
                >
                  OTP se login karein
                </button>
                <button
                  onClick={() => {
                    setPhoneTaken(false);
                    setPhone("");
                  }}
                  className="w-full text-xs text-muted-foreground hover:text-brand"
                >
                  Alag number daalna hai
                </button>
              </div>
            )}
            {!phoneTaken && (
              <button
                disabled={!phoneValid || !altPhoneValid || phase === "submitting"}
                onClick={submit}
                className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-full transition-colors ${
                  phoneValid && altPhoneValid && phase !== "submitting"
                    ? "bg-brand text-white hover:bg-brand-deep"
                    : "bg-secondary text-muted-foreground cursor-not-allowed"
                }`}
              >
                {phase === "submitting" ? <Loader2 size={18} className="animate-spin" /> : null}
                Confirm karein
              </button>
            )}
            <button
              onClick={wrongAccount}
              className="w-full text-xs text-muted-foreground hover:text-brand"
            >
              Galat Google account? Dobara choose karein
            </button>
            <div className="flex items-center gap-1.5 justify-center text-[11px] text-muted-foreground pt-2">
              <ShieldCheck size={13} className="text-success" /> Aapka number safe hai — sirf seva
              updates ke liye.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
