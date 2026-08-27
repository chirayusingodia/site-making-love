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
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
  owner: { label: "Owner", cls: "bg-slate-900 text-white" },
  admin: { label: "Admin", cls: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
  telecaller: {
    label: "Telecaller",
    cls: "bg-sky-100 text-sky-800 border border-sky-200",
  },
  agent: { label: "Agent", cls: "bg-violet-100 text-violet-800 border border-violet-200" },
  user: { label: "User", cls: "bg-slate-100 text-slate-600 border border-slate-200" },
};

function RoleBadge({ role }: { role: string }) {
  const badge = ROLE_BADGE[role] ?? ROLE_BADGE.user;
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

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
    <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <UserPlus className="w-4 h-4 text-amber-700" />
          Naya Staff / Sales Agent banayein
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-white">
            OWNER
          </span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="grid gap-4 border-t border-slate-100 p-5 md:grid-cols-2">
          {/* 1. Roster row */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Sales Agent (roster)
            </h3>
            <p className="text-[11px] text-slate-500">
              Offline agent pehle roster mein aata hai; uska login alag step hai (neeche, role =
              Agent).
            </p>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Agent ka poora naam"
              className="w-full h-9 rounded-md border border-slate-300 px-3 text-sm focus:border-amber-500 focus:outline-none"
            />
            <input
              value={agentPhone}
              onChange={(e) => setAgentPhone(e.target.value.replace(/[^\d+]/g, "").slice(0, 13))}
              inputMode="numeric"
              placeholder="Phone (optional) — 9876543210"
              className="w-full h-9 rounded-md border border-slate-300 px-3 text-sm focus:border-amber-500 focus:outline-none"
            />
            <Button
              size="sm"
              disabled={agentBusy || agentName.trim().length < 3}
              onClick={addAgent}
              className="gap-1.5 bg-amber-700 hover:bg-amber-800 text-white"
            >
              {agentBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UserPlus className="w-3.5 h-3.5" />
              )}
              Roster mein add karein
            </Button>
            {agentMsg && (
              <p className={`text-[11px] ${agentMsg.ok ? "text-emerald-700" : "text-rose-700"}`}>
                {agentMsg.text}
              </p>
            )}
            {roster && roster.length > 0 && (
              <p className="text-[11px] text-slate-400 pt-1">
                Roster: {roster.filter((a) => a.is_active).length} active · {roster.length} total
              </p>
            )}
          </div>

          {/* 2. Login */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Login banayein (Telecaller / Agent / Admin)
            </h3>
            <p className="text-[11px] text-slate-500">
              Email par OTP se pehli baar /login par ghus sakte hain — koi password set nahi hota.
            </p>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="w-full h-9 rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-amber-500 focus:outline-none"
            >
              <option value="telecaller">Telecaller — call queue panel</option>
              <option value="agent">Sales Agent — leads upload portal</option>
              <option value="admin">Admin — operations access</option>
            </select>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Poora naam"
              className="w-full h-9 rounded-md border border-slate-300 px-3 text-sm focus:border-amber-500 focus:outline-none"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="email@example.com"
              className="w-full h-9 rounded-md border border-slate-300 px-3 text-sm focus:border-amber-500 focus:outline-none"
            />
            {role === "agent" && (
              <select
                value={salesAgentId}
                onChange={(e) => setSalesAgentId(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-amber-500 focus:outline-none"
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
              className="gap-1.5 bg-amber-700 hover:bg-amber-800 text-white"
            >
              {loginBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
              Login banayein
            </Button>
            {loginMsg && (
              <p className={`text-[11px] ${loginMsg.ok ? "text-emerald-700" : "text-rose-700"}`}>
                {loginMsg.text}
              </p>
            )}
            {role === "agent" && (
              <p className="text-[11px] text-amber-700">
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <UserCog className="w-5 h-5 text-amber-700" />
            Staff Roles
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-white">
              OWNER
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Kisi ko admin banayein ya admin hataayein. Owner roles yahan se change nahi hote (manual
            SQL only).
          </p>
        </div>
        <Button
          onClick={() => load()}
          variant="outline"
          size="sm"
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <CreateStaffSection onCreated={() => load(searchInput.trim() || undefined)} />

      {/* Search */}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Naam / email / phone se user khojein…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
          />
        </div>
        <Button type="submit" size="sm" className="gap-1.5">
          <Search className="w-3.5 h-3.5" /> Search
        </Button>
        {mode === "search" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchInput("");
              load();
            }}
          >
            Clear
          </Button>
        )}
      </form>

      {toast && (
        <div
          className={`flex items-center gap-2 text-xs px-4 py-3 rounded-xl border ${
            toast.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          {toast.ok ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0" />
          )}
          {toast.text}
          <button
            onClick={() => setToast(null)}
            className="ml-auto opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {loading && !rows ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5 overflow-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2">Name</th>
                <th className="pb-2">Email</th>
                <th className="pb-2">Phone</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Joined</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => {
                const isSelf = r.id === myId;
                const busy = busyId === r.id;
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-2 font-semibold">
                      {r.full_name ?? "(no name)"}
                      {isSelf && (
                        <span className="ml-1.5 text-[10px] not-italic px-1 rounded bg-amber-100 text-amber-800">
                          you
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-xs">{r.email ?? "—"}</td>
                    <td className="py-2 text-xs">{r.phone ?? "—"}</td>
                    <td className="py-2">
                      <RoleBadge role={r.role} />
                    </td>
                    <td className="py-2 text-xs">{r.created_at?.slice(0, 10)}</td>
                    <td className="py-2 text-right">
                      {r.role === "owner" ? (
                        <span className="text-[11px] text-slate-400 italic">manual SQL only</span>
                      ) : r.role === "admin" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || isSelf}
                          onClick={() => changeRole(r, "user")}
                          className="gap-1.5 text-rose-700 border-rose-200 hover:bg-rose-50 hover:text-rose-800"
                        >
                          {busy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ShieldOff className="w-3.5 h-3.5" />
                          )}
                          Remove Admin
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={busy || isSelf}
                          onClick={() => changeRole(r, "admin")}
                          className="gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
                        >
                          {busy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          )}
                          Make Admin
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!loading && rows?.length === 0 && !error && (
            <div className="text-slate-400 text-sm px-2 py-6 text-center">
              {mode === "search" ? "Koi user match nahi hua." : "Koi staff nahi mila."}
            </div>
          )}

          {mode === "staff" && totalUsers !== null && (
            <p className="text-[11px] text-slate-400 mt-3">
              Staff roster dikh raha hai · kul {totalUsers.toLocaleString("en-IN")} users database
              mein — Search se koi bhi user khojein.
            </p>
          )}
        </section>
      )}

      {!loading && error && !toast && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
          {error}
        </div>
      )}
    </div>
  );
}
