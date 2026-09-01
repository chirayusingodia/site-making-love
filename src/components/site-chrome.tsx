import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { User, Home, Sparkles, MessageSquareText, Info } from "lucide-react";
import { PunyataLogo } from "@/components/PunyataLogo";
import { useLanguage, useTranslation, LANG_KEY, type Lang } from "@/lib/translations";
import { captureAttributionOnce } from "@/lib/attribution";

const WHATSAPP_RAW = "918005828548";
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_RAW}?text=${encodeURIComponent(
  "Jai Siyaram, मुझे पुण्यता से जुड़ना है।",
)}`;

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/plans", label: "Plans" },
  { to: "/sevas", label: "Our Sevas" },
  { to: "/reviews", label: "Reviews" },
  { to: "/about", label: "About Us" },
  { to: "/faq", label: "FAQ" },
] as const;

function LanguageToggle() {
  const lang = useLanguage();
  const update = (v: Lang) => {
    try { localStorage.setItem(LANG_KEY, v); } catch {}
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-lang", v);
    }
    window.dispatchEvent(new CustomEvent("punyata:lang-change", { detail: v }));
  };
  return (
    <div
      role="group"
      aria-label="Language toggle"
      className="inline-flex items-center bg-white border border-black/10 rounded-full p-0.5 shadow-sm"
    >
      {(["hindi", "english"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => update(v)}
          className={`px-2.5 md:px-3.5 py-1.5 text-[11px] md:text-xs font-bold rounded-full transition-all capitalize ${
            lang === v
              ? "bg-brand text-white shadow"
              : "text-foreground/60 hover:text-brand"
          }`}
          aria-pressed={lang === v}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

export function Header() {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={`sticky top-0 z-40 bg-[#FDF1EC]/90 backdrop-blur-lg border-b border-black/5 transition-all duration-300 ${
        scrolled ? "py-0 shadow-[0_4px_16px_rgba(139,79,40,0.08)]" : ""
      }`}
    >
      <div className={`max-w-5xl mx-auto flex items-center justify-between px-4 gap-2 md:gap-3 transition-all duration-300 ${scrolled ? "py-2" : "py-3"}`}>
        <Link to="/" className="flex items-center gap-2 md:gap-3 shrink-0 group">
          <PunyataLogo
            className={`transition-all duration-300 group-hover:scale-105 ${scrolled ? "w-12 h-12 md:w-13 md:h-13" : "w-15 h-15 md:w-16 md:h-16"}`}
          />
          <span
            className={`font-extrabold text-brand tracking-tight leading-none transition-all duration-300 ${scrolled ? "text-2xl md:text-3xl" : "text-3xl md:text-5xl"}`}
            style={{ fontFamily: "'Poppins', 'Noto Sans Devanagari', system-ui, sans-serif" }}
          >
            पुण्यता
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="px-3 py-2 text-sm font-semibold text-foreground/80 rounded-full hover:bg-brand-soft hover:text-brand transition-colors"
              activeProps={{ className: "px-3 py-2 text-sm font-bold text-brand bg-brand-soft rounded-full" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <LanguageToggle />
          <Link to="/profile" className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-black text-white flex items-center justify-center" aria-label="Account">
            <User size={18} />
          </Link>
        </div>
      </div>

      {/* Mobile pill nav */}
      <div className="lg:hidden max-w-5xl mx-auto px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-none">
        {NAV_LINKS.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="pill"
            activeProps={{ className: "pill active" }}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </header>
  );
}

const BOTTOM_TABS = [
  { to: "/", label: "Home", Icon: Home, exact: true },
  { to: "/my-subscription", label: "My Subscription", Icon: Sparkles, exact: false },
  { to: "/reviews", label: "Reviews", Icon: MessageSquareText, exact: false },
  { to: "/about", label: "About Us", Icon: Info, exact: false },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-black/5 md:hidden pb-[env(safe-area-inset-bottom,0)]">
      <div className="max-w-2xl mx-auto flex items-stretch justify-around px-2 py-2">
        {BOTTOM_TABS.map(({ to, label, Icon, exact }) => {
          const on = exact ? pathname === to : pathname.startsWith(to);
          return (
            <Link key={to} to={to} className="flex flex-col items-center gap-1 py-1 px-2 flex-1">
              <Icon size={22} className={on ? "text-brand" : "text-muted-foreground"} />
              <span className={`text-[10px] font-semibold leading-tight text-center ${on ? "text-brand" : "text-muted-foreground"}`}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function WhatsAppFloat() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp par sampark karein"
      className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 w-14 h-14 rounded-full bg-whatsapp text-white flex items-center justify-center shadow-[0_10px_28px_rgba(37,211,102,0.45)] animate-pulse-ring hover:scale-105 transition-transform"
    >
      <svg viewBox="0 0 32 32" width="30" height="30" fill="currentColor" aria-hidden="true">
        <path d="M16.004 3C9.377 3 4 8.373 4 15c0 2.386.703 4.606 1.919 6.475L4 29l7.72-1.877A11.94 11.94 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3Zm.002 21.7c-1.86 0-3.646-.487-5.204-1.409l-.373-.22-4.583 1.115 1.146-4.47-.243-.386A9.66 9.66 0 0 1 6.3 15c0-5.348 4.35-9.7 9.706-9.7 5.355 0 9.704 4.352 9.704 9.7 0 5.348-4.35 9.7-9.704 9.7Zm5.316-7.264c-.29-.145-1.716-.847-1.982-.944-.266-.097-.46-.145-.653.146-.194.29-.75.943-.92 1.137-.17.194-.34.218-.63.073-.29-.146-1.223-.451-2.33-1.437-.861-.768-1.443-1.717-1.612-2.007-.169-.29-.018-.447.127-.591.13-.13.29-.34.435-.51.145-.17.194-.29.29-.484.097-.194.049-.363-.024-.508-.073-.146-.653-1.575-.895-2.157-.236-.567-.476-.49-.653-.5l-.556-.01c-.194 0-.508.073-.774.363-.266.29-1.016.993-1.016 2.422 0 1.43 1.04 2.81 1.185 3.005.145.194 2.05 3.13 4.966 4.39.694.3 1.235.48 1.657.614.696.221 1.33.19 1.83.115.558-.083 1.716-.702 1.958-1.38.242-.678.242-1.259.169-1.38-.073-.121-.267-.194-.557-.34Z" />
      </svg>
    </a>
  );
}

export function SiteChrome({ children }: { children: React.ReactNode }) {
  // First-touch marketing attribution (§ Attribution) — capture once per
  // visitor, read back at checkout so a subscriber days later still
  // credits whichever ad/link actually brought them in.
  useEffect(() => {
    captureAttributionOnce();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {children}
      <WhatsAppFloat />
      <BottomNav />
    </div>
  );
}
