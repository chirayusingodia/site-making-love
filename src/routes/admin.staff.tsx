import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callAdminApi } from "@/lib/admin-api";
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  UserCog,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Notice, PageHeader, Panel, TableScroll } from "@/components/admin/admin-ui";

export const Route = createFileRoute("/admin/staff")({
  // OWNER-ONLY both layers (§6.1) — same discipline as
  // /admin/commissions and /admin/reports. The API 403 is layer 3.
  beforeLoad: async () => {
    const { fetchMyRole } = await import("@/lib/admin-api");
    const role = await fetchMyRole();
    if (role !== "owner") {
      throw redirect({ to: "/admin/overview", search: { notice: "owner-required" } });
    }
  },
  component: AdminStaffPage,
});

// Owner-only staff management: make someone admin, remove someone
// admin. Owner rows are locked here BY DESIGN — promotion to owner is
// the audited manual SQL step (migration 006), so the last owner can
// never be demoted into a lockout from a browser.

interface StaffRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  created_at: string;
}

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  owner: { label: "Owner", cls: "bg-stone-900 text-white" },
  admin: { label: "Admin", cls: "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200" },
  telecaller: { label: "Telecaller", cls: "bg-sky-50 text-sky-700" },
  agent: { label: "Agent", cls: "bg-violet-50 text-violet-700" },
  user: { label: "User", cls: "bg-stone-100 text-stone-600" },
};

function RoleBadge({ role }: { role: string }) {
  const badge = ROLE_BADGE[role] ?? ROLE_BADGE.user;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${badge.cls}`}
    >
      {badge.label}
    </span>
  );
}

const inputCls =
  "w-full h-9 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-800 placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20";

// ─── Migration 020 — creation surfaces ──────────────────────────
//
// The APIs (/api/admin/sales-agents/create, /api/admin/staff/
// create-staff) shipped first; this is their owner-facing UI:
//   1. Add a field agent to the sales_agents roster (offline person),
//   2. Mint an actual LOGIN (telecaller / agent / admin) — agent
//      logins must be linked to a roster row so portal uploads
//      attribute to a real person.
// Telecaller logins are what "multiple telecallers" means in
// practice: one login per seat, each sees only her own queues.

interface AgentRosterRow {
  id: string;
  full_name: string | null;
  agent_code: string | null;
  is_active: boolean;
}

function CreateStaffSection({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<AgentRosterRow[] | null>(null);

  // "Add Sales Agent" form
  const [agentName, setAgentName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentMsg, setAgentMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // "Create login" form
  const [role, setRole] = useState<"telecaller" | "agent" | "admin">("telecaller");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [salesAgentId, setSalesAgentId] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginMsg, setLoginMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadRoster = useCallback(async () => {
    try {
      const res = await callAdminApi<{ rows: AgentRosterRow[] }>(
        "/api/admin/sales-agents/list",
        {},
      );
      setRoster(res.rows);
    } catch {
      setRoster([]);
    }
  }, []);

  useEffect(() => {
    if (open) loadRoster();
  }, [open, loadRoster]);

  async function addAgent() {
    setAgentBusy(true);
    setAgentMsg(null);
    try {
      const res = await callAdminApi<{ note?: string }>("/api/admin/sales-agents/create", {
        fullName: agentName.trim(),
        ...(agentPhone.trim() ? { phone: agentPhone.trim() } : {}),
      });
      setAgentMsg({
        ok: true,
        text: res.note ?? `${agentName.trim()} roster mein add ho gaya.`,
      });
      setAgentName("");
      setAgentPhone("");
      await loadRoster();
      onCreated();
    } catch (err) {
      setAgentMsg({ ok: false, text: err instanceof Error ? err.message : "Create fail" });
    } finally {
      setAgentBusy(false);
    }
  }

  async function createLogin() {
    setLoginBusy(true);
    setLoginMsg(null);
    try {
      const res = await callAdminApi<{ note?: string }>("/api/admin/staff/create-staff", {
        role,
        fullName: fullName.trim(),
        email: email.trim(),
        ...(role === "agent" && salesAgentId ? { salesAgentId } : {}),
      });
      setLoginMsg({ ok: true, text: res.note ?? "Login ban gaya." });
      setFullName("");
      setEmail("");
      setSalesAgentId("");
      onCreated();
    } catch (err) {
      setLoginMsg({ ok: false, text: err instanceof Error ? err.message : "Create fail" });
    } finally {
      setLoginBusy(false);
    }
  }

  const activeAgents = (roster ?? []).filter((a) => a.is_active);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const loginReady =
    fullName.trim().length >= 3 && emailOk && (role !== "agent" || salesAgentId !== "");

  return (
    <section className="admin-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-stone-50/60"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 min-w-0 text-[15px] font-semibold text-stone-900">
          <UserPlus className="w-4 h-4 shrink-0 text-stone-400" />
          Naya Staff / Sales Agent banayein
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="grid gap-6 border-t border-stone-100 p-4 sm:p-5 md:grid-cols-2">
          {/* 1. Roster row */}
          <div className="space-y-2.5 min-w-0">
            <h3 className="text-sm font-semibold text-stone-900">Sales Agent (roster)</h3>
            <p className="text-xs text-stone-500">
              Offline agent pehle roster mein aata hai; uska login alag step hai (neeche, role =
              Agent).
            </p>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Agent ka poora naam"
              className={inputCls}
            />
            <input
              value={agentPhone}
              onChange={(e) => setAgentPhone(e.target.value.replace(/[^\d+]/g, "").slice(0, 13))}
              inputMode="numeric"
              placeholder="Phone (optional) — 9876543210"
              className={inputCls}
            />
            <Button
              size="sm"
              disabled={agentBusy || agentName.trim().length < 3}
              onClick={addAgent}
              className="h-9 gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
            >
              {agentBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UserPlus className="w-3.5 h-3.5" />
              )}
              Roster mein add karein
            </Button>
            {agentMsg && (
              <p
                className={`text-xs break-words ${agentMsg.ok ? "text-emerald-700" : "text-rose-700"}`}
              >
                {agentMsg.text}
              </p>
            )}
            {roster && roster.length > 0 && (
              <p className="text-xs text-stone-400 pt-1">
                Roster: {roster.filter((a) => a.is_active).length} active · {roster.length} total
              </p>
            )}
          </div>

          {/* 2. Login */}
          <div className="space-y-2.5 min-w-0 md:border-l md:border-stone-100 md:pl-6">
            <h3 className="text-sm font-semibold text-stone-900">
              Login banayein (Telecaller / Agent / Admin)
            </h3>
            <p className="text-xs text-stone-500">
              Email par OTP se pehli baar /login par ghus sakte hain — koi password set nahi hota.
            </p>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className={`${inputCls} px-2`}
            >
              <option value="telecaller">Telecaller — call queue panel</option>
              <option value="agent">Sales Agent — leads upload portal</option>
              <option value="admin">Admin — operations access</option>
            </select>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Poora naam"
              className={inputCls}
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="email@example.com"
              className={inputCls}
            />
            {role === "agent" && (
              <select
                value={salesAgentId}
                onChange={(e) => setSalesAgentId(e.target.value)}
                className={`${inputCls} px-2`}
              >
                <option value="">— Kaunsa roster agent? —</option>
                {activeAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name ?? a.id} ({a.agent_code ?? "no code"})
                  </option>
                ))}
              </select>
            )}
            <Button
              size="sm"
              disabled={loginBusy || !loginReady}
              onClick={createLogin}
              className="h-9 gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
            >
              {loginBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
              Login banayein
            </Button>
            {loginMsg && (
              <p
                className={`text-xs break-words ${loginMsg.ok ? "text-emerald-700" : "text-rose-700"}`}
              >
                {loginMsg.text}
              </p>
            )}
            {role === "agent" && (
              <p className="text-xs text-amber-700">
                Agent login ke baad Lead Routing page se chunein ki uski leads kaunsa telecaller
                ginega.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function AdminStaffPage() {
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [mode, setMode] = useState<"staff" | "search">("staff");
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setMyId(data.session?.user?.id ?? null))
      .catch(() => setMyId(null));
  }, []);

  const load = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await callAdminApi<{
        rows: StaffRow[];
        mode: "staff" | "search";
        totalUsers?: number;
      }>("/api/admin/staff/list", search ? { search } : {});
      setRows(res.rows);
      setMode(res.mode);
      setTotalUsers(res.totalUsers ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Staff list nahi mili");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function runSearch() {
    load(searchInput.trim() || undefined);
  }

  async function changeRole(row: StaffRow, nextRole: "admin" | "user") {
    const name = row.full_name || row.email || row.id;
    const verb = nextRole === "admin" ? "ADMIN banayein" : "admin se hataayein";
    if (!window.confirm(`Pakka? ${name} ko ${verb}?`)) return;

    setBusyId(row.id);
    setError(null);
    setToast(null);
    try {
      await callAdminApi("/api/admin/staff/set-role", { userId: row.id, role: nextRole });
      setToast({
        ok: true,
        text: nextRole === "admin" ? `${name} ab ADMIN hai.` : `${name} ka admin access hat gaya.`,
      });
      await load(searchInput.trim() || undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Role change fail";
      setError(msg);
      setToast({ ok: false, text: msg });
    } finally {
      setBusyId(null);
    }
  }

  // Same action cell for the mobile card list and the desktop table.
  function renderAction(r: StaffRow) {
    const isSelf = r.id === myId;
    const busy = busyId === r.id;
    if (r.role === "owner") {
      return <span className="text-xs text-stone-400 italic">manual SQL only</span>;
    }
    if (r.role === "admin") {
      return (
        <Button
          size="sm"
          variant="outline"
          disabled={busy || isSelf}
          onClick={() => changeRole(r, "user")}
          className="h-9 sm:h-8 gap-1.5 text-rose-700 border-rose-200 hover:bg-rose-50 hover:text-rose-800"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ShieldOff className="w-3.5 h-3.5" />
          )}
          Remove Admin
        </Button>
      );
    }
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={busy || isSelf}
        onClick={() => changeRole(r, "admin")}
        className="h-9 sm:h-8 gap-1.5"
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <ShieldCheck className="w-3.5 h-3.5" />
        )}
        Make Admin
      </Button>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Roles"
        description="Kisi ko admin banayein ya admin hataayein. Owner roles yahan se change nahi hote (manual SQL only)."
        actions={
          <Button
            onClick={() => load()}
            variant="outline"
            size="sm"
            disabled={loading}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      <CreateStaffSection onCreated={() => load(searchInput.trim() || undefined)} />

      {toast && (
        <div
          className={`flex items-start gap-2.5 text-sm px-3.5 py-3 rounded-lg border ${
            toast.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          {toast.ok ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 opacity-80" />
          ) : (
            <XCircle className="w-4 h-4 mt-0.5 shrink-0 opacity-80" />
          )}
          <span className="min-w-0 break-words">{toast.text}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-auto -my-1 -mr-1 inline-flex w-7 h-7 shrink-0 items-center justify-center rounded-md opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading && !rows ? (
        <Skeleton className="h-64 w-full rounded-xl bg-stone-100" />
      ) : (
        <Panel
          flush
          title={mode === "search" ? "Search results" : "Staff"}
          description={
            mode === "staff" && totalUsers !== null
              ? `Staff roster dikh raha hai · kul ${totalUsers.toLocaleString("en-IN")} users database mein — Search se koi bhi user khojein.`
              : undefined
          }
        >
          {/* Search */}
          <form
            className="flex flex-wrap gap-2 px-4 sm:px-5 py-3 border-b border-stone-100"
            onSubmit={(e) => {
              e.preventDefault();
              runSearch();
            }}
          >
            <div className="relative w-full sm:flex-1 sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Naam / email / phone se user khojein…"
                className={`${inputCls} pl-9`}
              />
            </div>
            <Button type="submit" size="sm" className="h-9 gap-1.5">
              <Search className="w-3.5 h-3.5" /> Search
            </Button>
            {mode === "search" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => {
                  setSearchInput("");
                  load();
                }}
              >
                Clear
              </Button>
            )}
          </form>

          {/* Mobile: stacked cards */}
          <ul className="md:hidden divide-y divide-stone-100">
            {(rows ?? []).map((r) => {
              const isSelf = r.id === myId;
              return (
                <li key={r.id} className="px-4 py-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-stone-900 break-words">
                        {r.full_name ?? "(no name)"}
                        {isSelf && <SelfTag />}
                      </div>
                      <div className="text-xs text-stone-500 break-all">{r.email ?? "—"}</div>
                      <div className="text-xs text-stone-500">
                        {r.phone ?? "—"} · Joined {r.created_at?.slice(0, 10)}
                      </div>
                    </div>
                    <RoleBadge role={r.role} />
                  </div>
                  <div>{renderAction(r)}</div>
                </li>
              );
            })}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block">
            <TableScroll>
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-stone-500 bg-stone-50/60 border-b border-stone-100">
                    <th className="px-4 sm:px-5 py-2.5 font-medium">Name</th>
                    <th className="px-3 py-2.5 font-medium">Email</th>
                    <th className="px-3 py-2.5 font-medium">Phone</th>
                    <th className="px-3 py-2.5 font-medium">Role</th>
                    <th className="px-3 py-2.5 font-medium">Joined</th>
                    <th className="px-4 sm:px-5 py-2.5 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {(rows ?? []).map((r) => {
                    const isSelf = r.id === myId;
                    return (
                      <tr key={r.id} className="hover:bg-stone-50/60">
                        <td className="px-4 sm:px-5 py-2.5 font-medium text-stone-900 whitespace-nowrap">
                          {r.full_name ?? "(no name)"}
                          {isSelf && <SelfTag />}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-stone-600 break-all">
                          {r.email ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-stone-600 whitespace-nowrap">
                          {r.phone ?? "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <RoleBadge role={r.role} />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-stone-600 tabular-nums whitespace-nowrap">
                          {r.created_at?.slice(0, 10)}
                        </td>
                        <td className="px-4 sm:px-5 py-2.5 text-right whitespace-nowrap">
                          {renderAction(r)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          </div>

          {!loading && rows?.length === 0 && !error && (
            <EmptyState
              icon={UserCog}
              title={mode === "search" ? "Koi user match nahi hua." : "Koi staff nahi mila."}
            />
          )}
        </Panel>
      )}

      {!loading && error && !toast && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}

function SelfTag() {
  return (
    <span className="ml-1.5 inline-flex items-center rounded px-1.5 py-px text-[11px] font-medium bg-stone-100 text-stone-600 align-middle">
      you
    </span>
  );
}
