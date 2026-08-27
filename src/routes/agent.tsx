import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { Upload, ListChecks } from "lucide-react";
import { PunyataLogo } from "@/components/PunyataLogo";
import { fetchMyRole } from "@/lib/admin-api";

export const Route = createFileRoute("/agent")({
  // ssr:false for the SAME reason as /admin and /telecaller: the role
  // guard reads the browser-only localStorage session, which is always
  // null during SSR. requireAgent on every /api/agent/* call stays
  // layer 3.
  ssr: false,
  // THREE-LAYER GUARD, layer 1 (route shell). Not signed in → /login
  // (with a return redirect); admin/owner/telecaller/user → site root.
  // The agent portal is the ONE surface an 'agent' role may call —
  // and the only one it is ever offered.
  beforeLoad: async () => {
    const role = await fetchMyRole();
    if (role === null) {
      throw redirect({ to: "/login", search: { redirect: "/agent" } });
    }
    if (role !== "agent") throw redirect({ to: "/" });
  },
  component: AgentLayout,
});

function AgentLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const navItems = [
    { label: "Leads Upload", href: "/agent", icon: Upload },
    { label: "Meri Leads", href: "/agent/my-leads", icon: ListChecks },
  ];

  return (
    <div className="min-h-screen bg-[#FBF9FF] text-slate-900 flex flex-col font-sans">
      {/* Header — same shell as /admin (amber) and /telecaller (indigo),
          DELIBERATELY THIRD accent: violet. A field agent handed this
          login must tell at a glance which surface she is on. */}
      <header className="sticky top-0 z-40 border-b border-violet-900/10 bg-white/90 backdrop-blur-md px-4 lg:px-8 py-3 flex items-center justify-between shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 group">
            <PunyataLogo className="w-8 h-8 text-amber-600 transition-transform group-hover:scale-105" />
            <span className="font-extrabold text-xl tracking-tight text-slate-900 font-serif">
              पुण्यता
            </span>
          </Link>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5 bg-violet-500/10 text-violet-800 px-2.5 py-1 rounded-full text-xs font-semibold border border-violet-500/20">
            <Upload className="w-3.5 h-3.5 text-violet-600" />
            Agent Portal
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-violet-900/60 bg-violet-50 px-3 py-1.5 rounded-md border border-violet-900/5">
            Aapke numbers seedha telecaller ki list mein
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
          <div className="px-3 py-2 text-xs font-bold text-violet-900/50 uppercase tracking-wider">
            Field Work
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-violet-700 text-white shadow-sm shadow-violet-900/20"
                      : "text-slate-700 hover:bg-violet-900/5 hover:text-violet-950"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${isActive ? "text-violet-100" : "text-violet-700/70"}`}
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
