import { createFileRoute, Outlet, Link, redirect, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Flame,
  Video,
  CreditCard,
  Shield,
  Sparkles,
  AlertCircle,
  Layers,
  ScrollText,
  BarChart3,
  PhoneCall,
  UserPlus,
  BadgeIndianRupee,
  TrendingUp,
} from "lucide-react";
import { PunyataLogo } from "@/components/PunyataLogo";
import { Badge } from "@/components/ui/badge";
import { useUserRole } from "@/hooks/use-user-role";
import { fetchMyRole } from "@/lib/admin-api";

export const Route = createFileRoute("/admin")({
  // SSR has no access to the browser's localStorage session, so
  // supabase.auth.getSession() is ALWAYS null on the server — the
  // role guard below would 307-bounce every hard navigation to
  // /admin straight to "/" even for a verified owner. ssr:false
  // skips this route (and, by inheritance, every /admin/* child)
  // during SSR and re-runs the full load cycle — guard included —
  // on the client, where the real session exists. The API gates
  // stay EXACTLY as they are — this is still layer 1 of 3.
  ssr: false,
  // 🚩 §6.1 gap fixed: this shell previously rendered for ANYONE and
  // relied on API 401/403 to keep the tables empty. With a
  // lower-privilege staff role in the system that is no longer
  // acceptable — a telecaller could load /admin/plans-sevas and see
  // the chrome, the nav, the field labels. Redirect non-staff:
  //   telecaller → her panel; user/agent/anonymous → site root.
  // The API gates stay EXACTLY as they are — this is layer 1 of 3.
  beforeLoad: async () => {
    const role = await fetchMyRole();
    if (role === "telecaller") throw redirect({ to: "/telecaller" });
    if (role !== "admin" && role !== "owner") throw redirect({ to: "/" });
  },
  component: AdminLayout,
});

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role } = useUserRole();

  const navItems = [
    { label: "Overview", href: "/admin/overview", icon: LayoutDashboard },
    // Telecaller panel — owner/admin reach it read-write (§0), so
    // Chirayu can sit in the same queue and check the work.
    { label: "Call Queue", href: "/telecaller", icon: PhoneCall, badge: "New" },
    { label: "Subscribers", href: "/admin/subscribers", icon: Users },
    { label: "Plans & Sevas", href: "/admin/plans-sevas", icon: Layers },
    { label: "Sankalp Lists", href: "/admin/sankalp-lists", icon: ScrollText, badge: "New" },
    { label: "Proof Upload", href: "/admin/proof-upload", icon: Flame, badge: "Session 4" },
    // [Pass-2 F2] was "/admin/proofs" — a route that never existed;
    // every click landed on the 404 page. Proof upload IS the seva
    // proofs surface, so both labels now point there.
    { label: "Seva Proofs", href: "/admin/proof-upload", icon: Video },
    { label: "Payments", href: "/admin/payments", icon: CreditCard, badge: "Session 6" },
    // Reports is OWNER-ONLY (financial data). Hidden until the role
    // resolves and confirmed 'owner' — the route itself is also
    // guarded in beforeLoad, and the API rejects non-owners with 403.
    ...(role === "owner"
      ? [{ label: "Reports", href: "/admin/reports", icon: BarChart3, badge: "Owner" }]
      : []),
    // Part B — lead pipeline (staff) + commission controls (owner).
    { label: "Leads", href: "/admin/leads", icon: UserPlus, badge: "Part B" },
    ...(role === "owner"
      ? [
          {
            label: "Commissions",
            href: "/admin/commissions",
            icon: BadgeIndianRupee,
            badge: "Owner",
          },
          // §6.1 (Hospitals session): performance leaderboard is
          // OWNER-only — nav lives inside this owner block (layer 1);
          // the route beforeLoad is layer 2 and the API 403 is layer 3.
          {
            label: "Performance",
            href: "/admin/performance",
            icon: TrendingUp,
            badge: "Owner",
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-slate-900 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-amber-900/10 bg-[#FFFDF9]/90 backdrop-blur-md px-4 lg:px-8 py-3 flex items-center justify-between shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 group">
            <PunyataLogo className="w-8 h-8 text-amber-600 transition-transform group-hover:scale-105" />
            <span className="font-extrabold text-xl tracking-tight text-amber-900 font-serif">
              पुण्यता
            </span>
          </Link>
          <span className="text-amber-900/30">|</span>
          <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-800 px-2.5 py-1 rounded-full text-xs font-semibold border border-amber-500/20">
            <Shield className="w-3.5 h-3.5 text-amber-600" />
            Admin Portal
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-xs text-amber-800/70 bg-amber-100/50 px-3 py-1.5 rounded-md border border-amber-900/5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Staging Environment
          </div>
          <Link
            to="/"
            className="text-xs font-medium text-amber-900/70 hover:text-amber-900 bg-white hover:bg-amber-50 px-3 py-1.5 rounded-md border border-amber-900/10 transition-colors shadow-2xs"
          >
            ← Back to Site
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto px-4 lg:px-8 py-6 gap-6">
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-60 flex-none space-y-1 print:hidden">
          <div className="px-3 py-2 text-xs font-bold text-amber-900/50 uppercase tracking-wider">
            Management
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href === "/admin/overview" && pathname === "/admin");
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-amber-700 text-white shadow-sm shadow-amber-900/20"
                      : "text-amber-900/80 hover:bg-amber-900/5 hover:text-amber-950"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 ${isActive ? "text-amber-200" : "text-amber-700/70"}`}
                    />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        isActive
                          ? "bg-amber-800 text-amber-100"
                          : "bg-amber-100 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
