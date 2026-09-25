import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarCheck2,
  Clock,
  Loader2,
  RefreshCw,
  Target,
  UserPlus,
} from "lucide-react";
import { callAdminApi } from "@/lib/admin-api";
import { DAILY_LEAD_TARGET, OUTCOME_LABELS, type CallOutcome } from "@/lib/telecaller-logic";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/telecaller/PageHeader";
import { StatTile } from "@/components/telecaller/StatTile";

export const Route = createFileRoute("/telecaller/my-day")({
  component: MyDayPage,
});

interface MyDayResponse {
  date: string;
  callsLogged: number;
  completions: number;
  partials: number;
  refusals: number;
  dndSet: number;
  complaintsEscalated: number;
  leadsCreatedToday: number;
  outcomes: Record<string, number>;
  callbacksDue: number;
  callbacksUpcoming: {
    key: string;
    callbackAt: string;
    subscriptionId: string | null;
    profileId: string | null;
    due: boolean;
  }[];
}

function MyDayPage() {
  const [data, setData] = useState<MyDayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await callAdminApi<MyDayResponse>("/api/telecaller/my-day"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aaj ka data nahi mila");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={CalendarCheck2}
        title="Mera Din"
        subtitle="Aapke apne aankde — supervision nahi, self-measurement."
        actions={
          <Button onClick={load} variant="outline" size="sm" disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* Daily target board — queue 0 progress (§8.2). */}
      <div className="rounded-xl border border-indigo-900/10 bg-white shadow-2xs p-3.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-800 flex items-center gap-1.5">
            <Target className="w-4 h-4 text-indigo-700" />
            Aaj ke leads ka target
          </span>
          <Link
            to="/telecaller/queue/$queueKey"
            params={{ queueKey: "aaj_ke_leads" }}
            className="text-xs text-indigo-700 hover:underline"
          >
            Queue kholein →
          </Link>
        </div>
        <div className="mt-2 flex items-end gap-2">
          {loading ? (
            <Skeleton className="h-7 w-24" />
          ) : (
            <>
              <span className="text-3xl font-extrabold text-indigo-800">
                {data?.outcomes["connected_interested"] ?? 0}
              </span>
              <span className="text-sm text-slate-400 mb-1">/ {DAILY_LEAD_TARGET} interested</span>
            </>
          )}
        </div>
      </div>

      {/* The numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label="Calls aaj" value={data?.callsLogged ?? 0} loading={loading} />
        <StatTile label="Details poori" value={data?.completions ?? 0} loading={loading} />
        <StatTile
          label="Callbacks pending"
          value={data?.callbacksDue ?? 0}
          loading={loading}
          tone={data && data.callbacksDue > 0 ? "warning" : "default"}
        />
        <StatTile label="Leads banayi" value={data?.leadsCreatedToday ?? 0} loading={loading} />
      </div>

      {/* Outcome breakdown */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs p-4">
        <h2 className="text-sm font-bold text-slate-900">Outcomes</h2>
        {!loading && data && Object.keys(data.outcomes).length > 0 ? (
          <ul className="mt-2.5 space-y-1.5">
            {(Object.entries(data.outcomes) as [CallOutcome, number][]).map(([o, n]) => (
              <li key={o} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{OUTCOME_LABELS[o] ?? o}</span>
                <span className="font-bold text-slate-900">{n}</span>
              </li>
            ))}
          </ul>
        ) : (
          !loading && <p className="text-xs text-slate-400 mt-2">Aaj koi call log nahi hui.</p>
        )}
      </div>

      {/* Upcoming callbacks */}
      {data && data.callbacksUpcoming.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs p-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-700" />
            Aane wale callbacks
            {data.callbacksUpcoming.some((c) => c.due) && (
              <span className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                {data.callbacksUpcoming.filter((c) => c.due).length} miss ho gaye
              </span>
            )}
          </h2>
          <ul className="mt-3 space-y-1.5">
            {[...data.callbacksUpcoming]
              .sort((a, b) => Number(b.due) - Number(a.due))
              .map((c) => {
                const id = c.subscriptionId ?? (c.profileId ? `lead-${c.profileId}` : null);
                return (
                  <li
                    key={c.key}
                    className={`flex items-center justify-between text-sm rounded-lg px-2 py-1 ${
                      c.due ? "bg-red-50 border border-red-200" : ""
                    }`}
                  >
                    <span
                      className={`font-mono text-xs flex items-center gap-1.5 ${
                        c.due ? "text-red-800 font-semibold" : "text-slate-600"
                      }`}
                    >
                      {c.due && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                      {c.callbackAt.slice(0, 16).replace("T", " ")}
                      {c.due && <span className="font-sans">— time nikal gaya</span>}
                    </span>
                    {id && (
                      <Link
                        to="/telecaller/person/$subscriptionId"
                        params={{ subscriptionId: id }}
                        search={{ queue: "callback_due" }}
                        className="text-xs text-indigo-700 hover:underline flex-none"
                      >
                        Card kholein →
                      </Link>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      <div className="flex justify-center pb-4">
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/telecaller/new">
            <UserPlus className="w-3.5 h-3.5" /> Nayi lead banayein
          </Link>
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Data aa raha hai…
        </div>
      )}
    </div>
  );
}
