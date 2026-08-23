import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarCheck2, Clock, Loader2, RefreshCw, Target, UserPlus } from "lucide-react";
import { callAdminApi } from "@/lib/admin-api";
import { DAILY_LEAD_TARGET, OUTCOME_LABELS, type CallOutcome } from "@/lib/telecaller-logic";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarCheck2 className="w-5 h-5 text-indigo-700" />
            Mera Din
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Aapke apne aankde — supervision nahi, self-measurement.
          </p>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* Daily target board — queue 0 progress (§8.2). */}
      <div className="rounded-2xl border border-indigo-900/10 bg-white shadow-2xs p-4">
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Calls aaj", value: data?.callsLogged ?? 0 },
          { label: "Details poori", value: data?.completions ?? 0 },
          { label: "Callbacks pending", value: data?.callbacksDue ?? 0 },
          { label: "Leads banayi", value: data?.leadsCreatedToday ?? 0 },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-4"
          >
            {loading ? (
              <Skeleton className="h-6 w-12" />
            ) : (
              <div className="text-2xl font-extrabold text-slate-900">{s.value}</div>
            )}
            <div className="text-[11px] text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Outcome breakdown */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
        <h2 className="text-base font-bold text-slate-900">Outcomes</h2>
        {!loading && data && Object.keys(data.outcomes).length > 0 ? (
          <ul className="mt-3 space-y-1.5">
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
        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-700" />
            Aane wale callbacks
          </h2>
          <ul className="mt-3 space-y-1.5">
            {data.callbacksUpcoming.map((c) => {
              const id = c.subscriptionId ?? (c.profileId ? `lead-${c.profileId}` : null);
              return (
                <li key={c.key} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 font-mono text-xs">
                    {c.callbackAt.slice(0, 16).replace("T", " ")}
                  </span>
                  {id && (
                    <Link
                      to="/telecaller/person/$subscriptionId"
                      params={{ subscriptionId: id }}
                      search={{ queue: "callback_due" }}
                      className="text-xs text-indigo-700 hover:underline"
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
