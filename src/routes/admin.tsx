import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, Flame, Video, CreditCard, Shield, Sparkles, AlertCircle } from "lucide-react";
import { PunyataLogo } from "@/components/PunyataLogo";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const navItems = [
    { label: "Overview", href: "/admin/overview", icon: LayoutDashboard },
    { label: "Subscribers", href: "/admin/subscribers", icon: Users },
    { label: "Sankalp Batches", href: "/admin/batches", icon: Flame, badge: "Session 4" },
    { label: "Seva Proofs", href: "/admin/proofs", icon: Video, badge: "Session 0.5" },
    { label: "Payments", href: "/admin/payments", icon: CreditCard, badge: "Session 5" },
  ];

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-slate-900 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-amber-900/10 bg-[#FFFDF9]/90 backdrop-blur-md px-4 lg:px-8 py-3 flex items-center justify-between shadow-xs">
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
        <aside className="w-full md:w-60 flex-none space-y-1">
          <div className="px-3 py-2 text-xs font-bold text-amber-900/50 uppercase tracking-wider">
            Management
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href === "/admin/overview" && pathname === "/admin");
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
                    <Icon className={`w-4 h-4 ${isActive ? "text-amber-200" : "text-amber-700/70"}`} />
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
