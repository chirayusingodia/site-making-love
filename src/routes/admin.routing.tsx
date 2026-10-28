import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
  PhoneCall,
  RefreshCw,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { callAdminApi, getAccessToken } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Notice, PageHeader, Panel, StatusPill } from "@/components/admin/admin-ui";

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
    <div className="space-y-6">
      <PageHeader
        title="Lead routing"
        description={
          <>
            Har sales agent ke liye chunein — uske numbers kaunsa telecaller ginega. Routing ON hone
            par lead upload hote hi usi ki{" "}
            <span className="font-medium text-stone-700">Aaj Ke Leads</span> list mein; bina routing
            ke daily assignment pool mein.
          </>
        }
        actions={
          <Button
            onClick={() => load()}
            variant="outline"
            size="sm"
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      {toast && (
        <Notice tone={toast.ok ? "good" : "bad"} icon={toast.ok ? CheckCircle2 : XCircle}>
          <div className="flex items-start gap-3">
            <span className="min-w-0 flex-1 break-words">{toast.text}</span>
            <button
              onClick={() => setToast(null)}
              className="-my-1 -mr-1 shrink-0 rounded p-1 opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </Notice>
      )}

      {loading && !data ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <Panel title="Agent → telecaller" flush>
          {(data?.agents ?? []).length === 0 ? (
            <EmptyState
              icon={UserRound}
              title="Koi sales agent roster mein nahi. Staff Roles page se pehle agent add karein."
            />
          ) : (
            <div>
              {/* Column header — desktop only; rows stack as cards below md. */}
              <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_auto] md:gap-4 px-5 py-2.5 text-xs font-medium text-stone-500 border-b border-stone-100">
                <span>Sales agent</span>
                <span>Current routing</span>
                <span>Kaunsa telecaller</span>
                <span className="text-right">Action</span>
              </div>
              <ul className="divide-y divide-stone-100">
                {(data?.agents ?? []).map((a) => {
                  const route = routeByAgent.get(a.id);
                  const active = route?.isActive === true;
                  const draft = drafts[a.id] ?? "";
                  const unchanged = (active ? route!.telecallerId : "") === draft;
                  const busy = busyAgent === a.id;
                  return (
                    <li
                      key={a.id}
                      className="grid grid-cols-1 gap-2.5 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_auto] md:items-center md:gap-4 md:px-5 md:py-3"
                    >
                      <div className="flex items-center gap-2 min-w-0 font-medium text-stone-900">
                        <UserRound className="w-4 h-4 text-stone-400 shrink-0" />
                        <span className="truncate">{a.fullName ?? "(no name)"}</span>
                      </div>
                      <div className="min-w-0 text-xs">
                        {active ? (
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <StatusPill tone="good">{route!.telecallerName}</StatusPill>
                            <span className="text-stone-500">ko instant</span>
                          </span>
                        ) : route ? (
                          <StatusPill tone="warn">
                            band ({route.telecallerName}) — pool mein
                          </StatusPill>
                        ) : (
                          <span className="text-stone-500">
                            Routing nahi — daily pool mein jaati hain
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <PhoneCall className="w-3.5 h-3.5 text-stone-400 flex-none" />
                        <select
                          value={draft}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [a.id]: e.target.value }))
                          }
                          aria-label={`Telecaller for ${a.fullName ?? a.id}`}
                          className="w-full min-w-0 h-9 rounded-md border border-stone-300 bg-white px-2 text-sm focus:border-orange-500 focus:outline-none"
                        >
                          <option value="">— Daily assignment pool (routing band) —</option>
                          {telecallers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.fullName ?? t.id}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="md:text-right">
                        <Button
                          size="sm"
                          disabled={busy || unchanged || telecallers.length === 0}
                          onClick={() => saveRoute(a.id, a.fullName ?? a.id, draft)}
                          className="h-9 w-full gap-1.5 bg-orange-600 hover:bg-orange-700 text-white md:w-auto"
                        >
                          {busy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          )}
                          Save
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="space-y-2 border-t border-stone-100 px-4 sm:px-5 py-3">
            {!loading && data && data.agents.length > 0 && telecallers.length === 0 && (
              <p className="text-xs text-amber-700">
                Koi telecaller seat nahi mili — Staff Roles se pehle telecaller login banayein.
              </p>
            )}
            <p className="text-xs text-stone-500">
              Routing sirf NAYI uploads par lagti hai. Pehle se list mein padi leads daily
              assignment se hi jayengi. Route band karne par agle uploads pool mein jaate hain —
              purani assigned leads wapas nahi aati.
            </p>
          </div>
        </Panel>
      )}

      {!loading && error && !toast && (
        <Notice tone="bad" icon={XCircle}>
          <span className="break-words">{error}</span>
        </Notice>
      )}
    </div>
  );
}
