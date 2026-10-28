import { createFileRoute, Outlet, Link, redirect, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Flame,
  CreditCard,
  Sparkles,
  Layers,
  ScrollText,
  BarChart3,
  PhoneCall,
  UserPlus,
  UserCog,
  BadgeIndianRupee,
  TrendingUp,
  Split,
  Menu,
  Search,
  ClipboardList,
  Image as ImageIcon,
  PenSquare,
  Mail,
  QrCode,
  IndianRupee,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { PunyataLogo } from "@/components/PunyataLogo";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
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

type NavItem = { label: string; href: string; icon: LucideIcon };
type NavGroup = { title?: string; items: NavItem[] };

// Sidebar groups. Owner-only groups are layer 1 of 3 — every owner
// route also has its own beforeLoad guard, and its API rejects
// non-owners with 403.
function buildNav(isOwner: boolean): NavGroup[] {
  const groups: NavGroup[] = [
    { items: [{ label: "Overview", href: "/admin/overview", icon: LayoutDashboard }] },
    {
      title: "Operations",
      items: [
        // Telecaller panel — owner/admin reach it read-write (§0), so
        // Chirayu can sit in the same queue and check the work.
        { label: "Call Queue", href: "/telecaller", icon: PhoneCall },
        { label: "Leads", href: "/admin/leads", icon: UserPlus },
        { label: "Sankalp Lists", href: "/admin/sankalp-lists", icon: ScrollText },
        // Proof upload IS the seva-proofs surface (there used to be two
        // nav items pointing at this same route).
        { label: "Seva Proofs", href: "/admin/proof-upload", icon: Flame },
        { label: "Ashirwad Patra", href: "/admin/ashirwad-patra", icon: Sparkles },
      ],
    },
    {
      title: "Customers",
      items: [
        { label: "Subscribers", href: "/admin/subscribers", icon: Users },
        { label: "Signups", href: "/admin/signups", icon: Mail },
        { label: "Payments", href: "/admin/payments", icon: CreditCard },
      ],
    },
    {
      // Admin/owner tier — content editing is lower-sensitivity than
      // financial reports.
      title: "Catalog & Content",
      items: [
        { label: "Plans & Sevas", href: "/admin/plans-sevas", icon: Layers },
        { label: "SEO & Content", href: "/admin/seo", icon: Search },
        { label: "Photos", href: "/admin/images", icon: ImageIcon },
        { label: "Content Studio", href: "/admin/content-studio", icon: PenSquare },
      ],
    },
  ];
  if (isOwner) {
    groups.push(
      {
        title: "Finance",
        items: [
          // Reports and Analytics are one page with tabs;
          // /admin/analytics redirects here.
          { label: "Reports & Analytics", href: "/admin/reports", icon: BarChart3 },
          { label: "Finance & P&L", href: "/admin/finance", icon: IndianRupee },
          { label: "QR Collections", href: "/admin/qr-collections", icon: QrCode },
          { label: "Commissions", href: "/admin/commissions", icon: BadgeIndianRupee },
          { label: "Performance", href: "/admin/performance", icon: TrendingUp },
        ],
      },
      {
        title: "Team & Settings",
        items: [
          { label: "Staff Roles", href: "/admin/staff", icon: UserCog },
          // Migration 020 — "kis agent ki lead kis telecaller ke paas".
          { label: "Lead Routing", href: "/admin/routing", icon: Split },
          { label: "Audit Log", href: "/admin/audit-log", icon: ClipboardList },
        ],
      },
    );
  }
  return groups;
}

function isActive(href: string, pathname: string) {
  if (href === "/admin/overview" && (pathname === "/admin" || pathname === "/admin/")) return true;
  return pathname === href || pathname.startsWith(href + "/");
}

// Shown only off-production so nobody mistakes staging data for live.
function envLabel(): string | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") return "Local";
  if (h.includes("staging") || h.includes("preview")) return "Staging";
  return null;
}

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role } = useUserRole();
  const [mobileOpen, setMobileOpen] = useState(false);
  const groups = buildNav(role === "owner");
  const current = groups.flatMap((g) => g.items).find((i) => isActive(i.href, pathname));
  const env = envLabel();

  // Close the mobile drawer on every route change.
  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="admin-ui min-h-screen text-stone-900">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 flex-col border-r border-stone-200 bg-white print:hidden">
        <SidebarBody groups={groups} pathname={pathname} role={role} env={env} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="admin-ui w-72 max-w-[85vw] p-0 bg-white border-stone-200 flex flex-col gap-0"
        >
          <SheetTitle className="sr-only">Admin navigation</SheetTitle>
          <SidebarBody groups={groups} pathname={pathname} role={role} env={env} />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 h-14 border-b border-stone-200 bg-white/90 backdrop-blur print:hidden">
          <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden -ml-1.5 inline-flex h-9 w-9 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1 truncate text-sm font-medium text-stone-700">
              {current?.label ?? "Admin"}
            </div>
            {env && (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {env}
              </span>
            )}
            <Link
              to="/"
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            >
              View site
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarBody({
  groups,
  pathname,
  role,
  env,
}: {
  groups: NavGroup[];
  pathname: string;
  role: string | null;
  env: string | null;
}) {
  return (
    <>
      <Link
        to="/admin/overview"
        className="h-14 shrink-0 flex items-center gap-2.5 px-5 border-b border-stone-100"
      >
        <PunyataLogo className="w-7 h-7 text-orange-600" />
        <span className="font-bold text-lg tracking-tight text-stone-900">पुण्यता</span>
        <span className="ml-auto text-[11px] font-semibold uppercase tracking-wider text-stone-400">
          Admin
        </span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {groups.map((g, gi) => (
          <div key={g.title ?? gi}>
            {g.title && (
              <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                {g.title}
              </div>
            )}
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`group flex items-center gap-3 rounded-md px-3 h-9 text-sm transition-colors ${
                      active
                        ? "bg-orange-50 text-orange-800 font-semibold"
                        : "text-stone-600 font-medium hover:bg-stone-100 hover:text-stone-900"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${active ? "text-orange-600" : "text-stone-400 group-hover:text-stone-600"}`}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-stone-100 px-5 py-3 flex items-center justify-between text-xs text-stone-500">
        <span className="capitalize">Signed in as {role ?? "…"}</span>
        {env && <span className="font-medium text-amber-700">{env}</span>}
      </div>
    </>
  );
}
