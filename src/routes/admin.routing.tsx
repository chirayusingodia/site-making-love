import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
  PhoneCall,
  RefreshCw,
  Split,
  UserRound,
  XCircle,
} from "lucide-react";
import { callAdminApi, getAccessToken } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/routing")({
  // OWNER-ONLY, three layers (§6.1) — this page decides whose tray
  // fills, the same policy the API enforces with requireOwner.
  beforeLoad: async () => {
    const { fetchMyRole } = await import("@/lib/admin-api");
    const role = await fetchMyRole();
    if (role !== "owner") {
      throw redirect({ to: "/admin/overview", search: { notice: "owner-required" } });
    }
  },
  component: LeadRoutingPage,
});

// ─────────────────────────────────────────────────────────────
// Lead Routing (migration 020) — "kis agent ki lead kis telecaller
// ke paas jayegi". One ACTIVE row per sales agent names the
// telecaller who receives that agent's uploads INSTANTLY (status
// 'assigned' at insert time). No route → the lead waits in the
// 'new' pool for the daily manual assignment. Clearing a route
// falls back to that pool; nothing is ever deleted.
// ─────────────────────────────────────────────────────────────

interface AgentOption {
  id: string;
  fullName: string | null;
}

interface RouteRow {
  id: string;
  salesAgentId: string;
  agentName: string;
  telecallerId: string;
  telecallerName: string;
  isActive: boolean;
}

interface RoutingResponse {
  ok: boolean;
  routes: RouteRow[];
  agents: AgentOption[];
  telecallers: AgentOption[];
}

function LeadRoutingPage() {
  const [data, setData] = useState<RoutingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  // Draft selection per agent id; saving compares against current.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyAgent, setBusyAgent] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/admin/leads/routing", {
        headers: { authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as RoutingResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setData(body);
      // Seed drafts with the CURRENT route so a save without a change
      // is a no-op rather than an accidental re-assign.
      const seeded: Record<string, string> = {};
      for (const r of body.routes) {
        if (r.isActive) seeded[r.salesAgentId] = r.telecallerId;
      }
      setDrafts(seeded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Routing list nahi mili");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveRoute(agentId: string, agentName: string, telecallerId: string) {
    setBusyAgent(agentId);
    setToast(null);
    try {
      await callAdminApi<{ ok: boolean; cleared: boolean }>("/api/admin/leads/routing", {
        salesAgentId: agentId,
        ...(telecallerId ? { telecallerId } : {}),
      });
      setToast({
        ok: true,
        text: telecallerId
          ? `${agentName} ki leads ab seedha unke telecaller ke paas jayengi.`
          : `${agentName} ki leads daily assignment pool mein wapas.`,
      });
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Routing save fail";
      setError(msg);
      setToast({ ok: false, text: msg });
    } finally {
      setBusyAgent(null);
    }
  }

  // Who receives leads — every callable seat (telecaller/admin/owner).
  const telecallers = data?.telecallers ?? [];
  const routeByAgent = new Map((data?.routes ?? []).map((r) => [r.salesAgentId, r]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Split className="w-5 h-5 text-amber-700" />
            Lead Routing
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-white">
              OWNER
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Har sales agent ke liye chunein — uske numbers kaunsa telecaller ginega. Routing ON hone
            par lead upload hote hi usi ki <span className="font-semibold">Aaj Ke Leads</span> list
            mein; bina routing ke daily assignment pool mein.
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

      {loading && !data ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5 overflow-auto">
          {(data?.agents ?? []).length === 0 ? (
            <div className="text-slate-400 text-sm py-8 text-center">
              Koi sales agent roster mein nahi. Staff Roles page se pehle agent add karein.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="pb-2">Sales Agent</th>
                  <th className="pb-2">Current Routing</th>
                  <th className="pb-2 w-1/3">Kaunsa Telecaller</th>
                  <th className="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {(data?.agents ?? []).map((a) => {
                  const route = routeByAgent.get(a.id);
                  const active = route?.isActive === true;
                  const draft = drafts[a.id] ?? "";
                  const unchanged = (active ? route!.telecallerId : "") === draft;
                  const busy = busyAgent === a.id;
                  return (
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="py-3">
                        <div className="flex items-center gap-2 font-semibold">
                          <UserRound className="w-4 h-4 text-violet-600" />
                          {a.fullName ?? "(no name)"}
                        </div>
                      </td>
                      <td className="py-3">
                        {active ? (
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="font-semibold text-emerald-800">
                              {route!.telecallerName}
                            </span>
                            <span className="text-slate-400">ko instant</span>
                          </span>
                        ) : route ? (
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            <span className="text-amber-800">
                              band ({route.telecallerName}) — pool mein
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Routing nahi — daily pool mein jaati hain
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2">
                          <PhoneCall className="w-3.5 h-3.5 text-slate-400 flex-none" />
                          <select
                            value={draft}
                            onChange={(e) =>
                              setDrafts((prev) => ({ ...prev, [a.id]: e.target.value }))
                            }
                            className="w-full max-w-xs h-9 rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-amber-500 focus:outline-none"
                          >
                            <option value="">— Daily assignment pool (routing band) —</option>
                            {telecallers.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.fullName ?? t.id}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          size="sm"
                          disabled={busy || unchanged || telecallers.length === 0}
                          onClick={() => saveRoute(a.id, a.fullName ?? a.id, draft)}
                          className="gap-1.5 bg-amber-700 hover:bg-amber-800 text-white"
                        >
                          {busy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          )}
                          Save
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!loading && data && data.agents.length > 0 && telecallers.length === 0 && (
            <p className="text-[11px] text-amber-700 mt-3">
              Koi telecaller seat nahi mili — Staff Roles se pehle telecaller login banayein.
            </p>
          )}
          <p className="text-[11px] text-slate-400 mt-3">
            Routing sirf NAYI uploads par lagti hai. Pehle se list mein padi leads daily assignment
            se hi jayengi. Route band karne par agle uploads pool mein jaate hain — purani assigned
            leads wapas nahi aati.
          </p>
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
