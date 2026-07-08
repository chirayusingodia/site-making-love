import { Link, useRouterState } from "@tanstack/react-router";
import { Search, User, Home, Sparkles, MessageSquareText, Info, MessageCircle } from "lucide-react";

const WHATSAPP_RAW = "918005828548";
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_RAW}?text=${encodeURIComponent(
  "Jai Siyaram, मुझे पुण्यता से जुड़ना है।",
)}`;

const NAV_LINKS = [
  { to: "/plans", label: "Plans" },
  { to: "/sevas", label: "Our Sevas" },
  { to: "/reviews", label: "Reviews" },
  { to: "/faq", label: "FAQ" },
] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-[#FDF1EC]/85 backdrop-blur-lg border-b border-black/5">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3 gap-3">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-brand text-white flex items-center justify-center font-bold text-lg">
            <span>🕉️</span>
          </div>
          <span className="text-xl font-bold text-brand tracking-tight">पुण्यता</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
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
          <button
            className="w-10 h-10 rounded-full bg-white border border-black/10 flex items-center justify-center hover:border-brand transition-colors"
            aria-label="Search"
          >
            <Search size={18} className="text-foreground" />
          </button>
          <Link to="/profile" className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center" aria-label="Account">
            <User size={18} />
          </Link>
        </div>
      </div>

      {/* Mobile pill nav */}
      <div className="md:hidden max-w-5xl mx-auto px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-none">
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
      aria-label="WhatsApp"
      className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 w-14 h-14 rounded-full bg-whatsapp text-white flex items-center justify-center shadow-xl animate-pulse-ring"
    >
      <MessageCircle size={26} fill="white" />
    </a>
  );
}

export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      {children}
      <WhatsAppFloat />
      <BottomNav />
    </div>
  );
}
