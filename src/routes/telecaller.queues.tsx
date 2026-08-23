import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarClock, Flame, Loader2, PhoneCall, RefreshCw } from "lucide-react";
import { callAdminApi } from "@/lib/admin-api";
import { QUEUE_META, TELECALLER_QUEUE_KEYS, type QueuesResponse } from "@/lib/telecaller-logic";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/telecaller/queues")({
  component: TelecallerQueuesPage,
});

// The queue stack (§3) — the panel's home page. NOT a dashboard:
// live counts, one "start calling" CTA, and the batch-cutoff
// countdown that turns an abstract list into a deadline.

function fmtHours(h: number | null): string {
  if (h === null) return "—";
  if (h >= 48) return `${Math.floor(h / 24)} din`;
  if (h >= 1) return `${Math.floor(h)} ghante`;
  return "< 1 ghanta";
}

const QUEUE_ACCENTS: Record<string, string> = {
  sankalp_pending: "border-l-red-500 hover:bg-red-50/40",
  cutoff_risk: "border-l-orange-500 hover:bg-orange-50/40",
  payment_failed: "border-l-amber-500 hover:bg-amber-50/40",
  abandoned_checkout: "border-l-sky-500 hover:bg-sky-50/40",
  never_bought: "border-l-cyan-500 hover:bg-cyan-50/40",
  paused: "border-l-violet-500 hover:bg-violet-50/40",
  recently_cancelled: "border-l-fuchsia-500 hover:bg-fuchsia-50/40",
  callback_due: "border-l-indigo-600 hover:bg-indigo-50/40",
  incomplete_details: "border-l-teal-500 hover:bg-teal-50/40",
  missing_prasad_address: "border-l-emerald-500 hover:bg-emerald-50/40",
  welcome_call: "border-l-green-500 hover:bg-green-50/40",
  renewal_ahead: "border-l-blue-500 hover:bg-blue-50/40",
};

function TelecallerQueuesPage() {
  const [data, setData] = useState<QueuesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await callAdminApi<QueuesResponse>("/api/telecaller/queues"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Queue load nahi hui");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // First queue with work = where "start calling" goes.
  const firstBusy = data?.queues.find((q) => q.count > 0) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-indigo-700" />
            Call Queues
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Sabse upar wali queue sabse zaroori hai — ek click, aur dialling shuru.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={load} variant="outline" size="sm" disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {firstBusy && (
            <Button asChild size="sm" className="bg-indigo-700 hover:bg-indigo-800 gap-1.5">
              <Link to="/telecaller/queue/$queueKey" params={{ queueKey: firstBusy.key }}>
                Start Calling <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Batch cutoff countdown widget (§7.5) */}
      <div className="rounded-2xl border border-indigo-900/10 bg-white shadow-2xs p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-none">
          <CalendarClock className="w-5 h-5 text-indigo-700" />
        </div>
        {loading ? (
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3 w-72" />
          </div>
        ) : data?.nextBatch ? (
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-900">
              Agla Sankalp batch:{" "}
              {data.nextBatch.kind === "second_tuesday" ? "Second Tuesday" : "Last Saturday"} —{" "}
              {data.nextBatch.isoDate}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Naam isse pehle bhare hon chahiye —{" "}
              <span className="font-semibold text-indigo-800">
                ~{fmtHours(data.cutoffHoursRemaining)} baaki
              </span>
              . Sankalp Pending:{" "}
              <span className="font-semibold text-red-700">
                {data.queues.find((q) => q.key === "sankalp_pending")?.count ?? 0}
              </span>{" "}
              subscribers.
            </div>
          </div>
        ) : null}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* The stack itself — priority order = array order. */}
      <div className="grid gap-2.5">
        {loading &&
          TELECALLER_QUEUE_KEYS.map((k) => (
            <Skeleton key={k} className="h-[68px] w-full rounded-2xl" />
          ))}
        {!loading &&
          data &&
          data.queues.map((q) => (
            <Link
              key={q.key}
              to="/telecaller/queue/$queueKey"
              params={{ queueKey: q.key }}
              className={`block rounded-2xl border border-slate-200 border-l-4 bg-white px-4 py-3 transition-colors shadow-2xs ${
                QUEUE_ACCENTS[q.key] ?? "hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    {q.count > 0 && q.key === "sankalp_pending" && (
                      <Flame className="w-4 h-4 text-red-500" />
                    )}
                    {QUEUE_META[q.key].title}
                  </div>
                  <div className="text-xs text-slate-500 truncate mt-0.5">
                    {QUEUE_META[q.key].why}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <span
                    className={`min-w-9 text-center px-2 py-1 rounded-lg text-sm font-extrabold ${
                      q.count > 0 ? "bg-indigo-700 text-white" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {q.count}
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-300" />
                </div>
              </div>
            </Link>
          ))}
        {!loading && error === null && firstBusy === null && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm px-4 py-6 text-center">
            🎉 Saari queues khaali hain — aaj ka kaam poora!
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Queues aa rahi hain…
        </div>
      )}
    </div>
  );
}
