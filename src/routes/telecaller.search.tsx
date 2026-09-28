import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Search, Users } from "lucide-react";
import { callAdminApi } from "@/lib/admin-api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/telecaller/search")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: TelecallerSearchPage,
});

interface LeadResult {
  kind: "lead";
  leadId: string;
  fullName: string | null;
  phone: string;
  city: string | null;
  status: string;
}

interface SubscriberResult {
  kind: "subscriber";
  subscriptionId: string | null;
  profileId: string;
  fullName: string | null;
  sankalpName: string | null;
  phone: string | null;
  altPhone: string | null;
  subscriptionStatus: string | null;
  planName: string | null;
}

interface SearchResponse {
  leads: LeadResult[];
  subscribers: SubscriberResult[];
}

function TelecallerSearchPage() {
  const { q } = Route.useSearch();
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q || q.trim().length < 2) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    callAdminApi<SearchResponse>("/api/telecaller/search", { q })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Search fail");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  const total = (data?.leads.length ?? 0) + (data?.subscribers.length ?? 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Search className="w-5 h-5 text-indigo-700" />
          Search
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {q ? (
            <>
              "<span className="font-semibold text-slate-700">{q}</span>" ke liye result
            </>
          ) : (
            "Naam ya phone number header se search karein"
          )}
        </p>
      </div>

      {(!q || q.trim().length < 2) && !loading && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs px-4 py-6 text-center text-sm text-slate-400">
          Kam se kam 2 akshar likhein search box mein.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {loading && (
        <div className="grid gap-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && data && q && q.trim().length >= 2 && (
        <div className="grid gap-2.5">
          {total === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs px-4 py-6 text-center text-sm text-slate-400">
              Kuch nahi mila.
            </div>
          )}
          {data.leads.map((l) => (
            <Link
              key={l.leadId}
              to="/telecaller/lead/$leadId"
              params={{ leadId: l.leadId }}
              className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors shadow-2xs group"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900">
                      {l.fullName ?? "(naam nahi)"}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                      Lead
                    </Badge>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border font-semibold bg-slate-100 text-slate-600 border-slate-200">
                      {l.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                    <span>{l.phone}</span>
                    {l.city && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span>{l.city}</span>
                      </>
                    )}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 flex-none" />
              </div>
            </Link>
          ))}
          {data.subscribers.map((s) => (
            <Link
              key={s.subscriptionId ?? s.profileId}
              to="/telecaller/person/$subscriptionId"
              params={{ subscriptionId: s.subscriptionId ?? s.profileId }}
              search={{ queue: undefined }}
              className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors shadow-2xs group"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900">
                      {s.sankalpName ?? s.fullName ?? "(naam nahi)"}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4 border-indigo-200 bg-indigo-50 text-indigo-800"
                    >
                      <Users className="w-2.5 h-2.5 mr-1" />
                      Subscriber
                    </Badge>
                    {s.subscriptionStatus && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border font-semibold bg-slate-100 text-slate-600 border-slate-200">
                        {s.subscriptionStatus}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                    <span>{s.altPhone ?? s.phone ?? "—"}</span>
                    {s.planName && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span>{s.planName}</span>
                      </>
                    )}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 flex-none" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Dhoond rahe hain…
        </div>
      )}
    </div>
  );
}
