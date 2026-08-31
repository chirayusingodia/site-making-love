import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import {
  PhoneCall,
  UserPlus,
  CalendarCheck2,
  ScrollText,
  BadgeIndianRupee,
  Menu,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { PunyataLogo } from "@/components/PunyataLogo";
import { fetchMyRole } from "@/lib/admin-api";

export const Route = createFileRoute("/telecaller")({
  // ssr:false for the SAME reason as the /admin shell: the role
  // guard below reads the browser-only localStorage session, so
  // running it during SSR bounced every hard navigation to /login.
  // The client re-runs this guard after hydration with the real
  // session; requireTelecaller on the APIs stays layer 3.
  ssr: false,
  // THREE-LAYER GUARD, layer 1 (route shell) — layers 2 and 3 are
  // per-page guards where needed and the requireTelecaller gate on
  // every /api/telecaller/* endpoint. Not signed in → /login; a
  // plain user or agent has no business here → /; admin/owner are
  // WELCOME (read-write — Chirayu sits in the same queue).
  beforeLoad: async () => {
    const role = await fetchMyRole();
    if (role === null) {
      throw redirect({ to: "/login", search: { redirect: undefined } });
    }
    if (role !== "telecaller" && role !== "admin" && role !== "owner") {
      throw redirect({ to: "/" });
    }
  },
  component: TelecallerLayout,
});

function TelecallerLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const navItems = [
    { label: "Call Queues", href: "/telecaller/queues", icon: PhoneCall },
    { label: "New Lead", href: "/telecaller/new", icon: UserPlus },
    { label: "My Day", href: "/telecaller/my-day", icon: CalendarCheck2 },
    // §11 — watching her own trail grow is the behavioural point of
    // the whole scheme.
    { label: "Meri Kamai", href: "/telecaller/earnings", icon: BadgeIndianRupee },
    { label: "Script", href: "/telecaller/script", icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-[#F7F8FC] text-slate-900 flex flex-col font-sans">
      {/* Header — SAME shell as /admin, DELIBERATELY DIFFERENT accent:
          indigo, not amber. A caller handed either login must tell
          at a glance which surface she is on (§6.2). */}
      <header className="sticky top-0 z-40 border-b border-indigo-900/10 bg-white/90 backdrop-blur-md px-4 lg:px-8 py-3 flex items-center justify-between shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 group">
            <PunyataLogo className="w-8 h-8 text-amber-600 transition-transform group-hover:scale-105" />
            <span className="font-extrabold text-xl tracking-tight text-slate-900 font-serif">
              पुण्यता
            </span>
          </Link>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5 bg-indigo-500/10 text-indigo-800 px-2.5 py-1 rounded-full text-xs font-semibold border border-indigo-500/20">
            <PhoneCall className="w-3.5 h-3.5 text-indigo-600" />
            Telecaller Portal
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-indigo-900/60 bg-indigo-50 px-3 py-1.5 rounded-md border border-indigo-900/5">
            ₹ nahi dikhega — status aur dates hi kaafi hain
          </div>
          <Link
            to="/"
            className="text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200 transition-colors shadow-2xs"
          >
            ← Back to Site
          </Link>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto px-4 lg:px-8 py-6 gap-6">
        {/* Collapsed accordion below md so the nav list doesn't push the
            queue/call content off-screen on a phone; always-open at md+. */}
        <aside className="w-full md:w-60 flex-none print:hidden">
          <details className="md:hidden group rounded-lg border border-indigo-900/10 bg-white/70 mb-3">
            <summary className="flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-indigo-900 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <Menu className="w-4 h-4 text-indigo-700" />
                Menu
              </span>
              <ChevronDown className="w-4 h-4 text-indigo-700 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-2 pb-2">
              <TelecallerNavList navItems={navItems} pathname={pathname} />
            </div>
          </details>
          <div className="hidden md:block space-y-1">
            <TelecallerNavList navItems={navItems} pathname={pathname} />
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function TelecallerNavList({
  navItems,
  pathname,
}: {
  navItems: { label: string; href: string; icon: LucideIcon }[];
  pathname: string;
}) {
  return (
    <>
      <div className="px-3 py-2 text-xs font-bold text-indigo-900/50 uppercase tracking-wider">
        Call Work
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href === "/telecaller/queues" &&
              (pathname === "/telecaller" ||
                pathname.startsWith("/telecaller/queue") ||
                pathname.startsWith("/telecaller/person")));
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all min-h-11 ${
                isActive
                  ? "bg-indigo-700 text-white shadow-sm shadow-indigo-900/20"
                  : "text-slate-700 hover:bg-indigo-900/5 hover:text-indigo-950"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-indigo-100" : "text-indigo-700/70"}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
