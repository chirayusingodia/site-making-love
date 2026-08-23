import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { PhoneCall, UserPlus, CalendarCheck2, ScrollText, BadgeIndianRupee } from "lucide-react";
import { PunyataLogo } from "@/components/PunyataLogo";
import { fetchMyRole } from "@/lib/admin-api";

export const Route = createFileRoute("/telecaller")({
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
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-indigo-900/60 bg-indigo-50 px-3 py-1.5 rounded-md border border-indigo-900/5">
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
        <aside className="w-full md:w-60 flex-none space-y-1 print:hidden">
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
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-indigo-700 text-white shadow-sm shadow-indigo-900/20"
                      : "text-slate-700 hover:bg-indigo-900/5 hover:text-indigo-950"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${isActive ? "text-indigo-100" : "text-indigo-700/70"}`}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
