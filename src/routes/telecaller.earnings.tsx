import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  BadgeIndianRupee,
  BookOpen,
  Loader2,
  Lock,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import { callAdminApi } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/telecaller/earnings")({
  component: EarningsPage,
});

// §11 — her commission ledger, HER rows only (the endpoint has no
// parameter that could widen it). Watching the trail grow is the
// behavioural point of the whole scheme.

interface EarningsResponse {
  thisMonth: {
    period: string;
    firstDealPaise: number;
    trailPaise: number;
    clawedBackPaise: number;
    totalNetPaise: number;
  };
  book: { payingNow: number; totalEver: number; droppedOffThisMonth: number };
  trailRate: { percent: number; since: string | null; reason: string | null };
  heldBonuses: { id: string; amountPaise: number; createdAt: string; maturesAtIso: string }[];
  payoutHistory: {
    period: string;
    earned: number;
    clawedBack: number;
    net: number;
    locked: boolean;
  }[];
  perSubscriberLines: {
    subscriptionId: string;
    total: number;
    firstEarn: number;
    trailEarn: number;
    lastPeriod: string;
  }[];
}

function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function EarningsPage() {
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await callAdminApi<EarningsResponse>("/api/telecaller/earnings"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Earnings load nahi hui");
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
            <BadgeIndianRupee className="w-5 h-5 text-indigo-700" />
            Meri Kamai
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Sirf aapki kamai — kisi aur ki nahi. Trail tab badhti hai jab log subscribe bane rehte
            hain.
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

      {/* This month */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Is maah — first deal", value: data?.thisMonth.firstDealPaise ?? 0 },
          { label: "Is maah — trail", value: data?.thisMonth.trailPaise ?? 0 },
          { label: "Clawback", value: -(data?.thisMonth.clawedBackPaise ?? 0) },
          { label: "Total (net)", value: data?.thisMonth.totalNetPaise ?? 0 },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-4"
          >
            {loading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <div
                className={`text-xl font-extrabold ${s.value < 0 ? "text-red-700" : "text-slate-900"}`}
              >
                {inr(s.value)}
              </div>
            )}
            <div className="text-[11px] text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Rate + book */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-indigo-900/10 bg-white shadow-2xs p-5">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-700" />
            Aapka trail rate
          </h2>
          {loading ? (
            <Skeleton className="h-8 w-20 mt-3" />
          ) : (
            <>
              <div className="text-3xl font-extrabold text-indigo-800 mt-2">
                {(data?.trailRate.percent ?? 1).toLocaleString("en-IN")}%
              </div>
              {data?.trailRate.since && (
                <p className="text-xs text-slate-500 mt-1">
                  {data.trailRate.reason === "promotion"
                    ? `Promotion mila — ${data.trailRate.since} se`
                    : `${data.trailRate.since} se laagoo`}
                </p>
              )}
              <p className="text-[11px] text-slate-400 mt-2">
                First-deal bonus sabke liye fixed 20% hai — promotion sirf trail badhati hai.
              </p>
            </>
          )}
        </div>
        <div className="rounded-2xl border border-indigo-900/10 bg-white shadow-2xs p-5">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-700" />
            Aapki book
          </h2>
          {loading ? (
            <Skeleton className="h-8 w-24 mt-3" />
          ) : (
            <div className="mt-2 space-y-1 text-sm">
              <div>
                Abhi trail de rahe hain:{" "}
                <b className="text-emerald-700">{data?.book.payingNow ?? 0}</b> subscribers
              </div>
              <div className="text-xs text-red-700 flex items-center gap-1">
                Is maah drop hue: <b>{data?.book.droppedOffThisMonth ?? 0}</b>{" "}
                <span className="text-slate-400">(yeh number hi sudharne wala ank hai)</span>
              </div>
              <div className="text-xs text-slate-500">
                Kabhi trail diye: {data?.book.totalEver ?? 0}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Held bonuses */}
      {data && data.heldBonuses.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 shadow-2xs p-5">
          <h2 className="text-base font-bold text-amber-900">
            Held bonuses ({data.heldBonuses.length}) — abhi payable NAHI
          </h2>
          <ul className="mt-2 space-y-1.5">
            {data.heldBonuses.map((b) => (
              <li key={b.id} className="flex justify-between text-xs text-amber-900">
                <span>{inr(b.amountPaise)}</span>
                <span>mature hoga: {b.maturesAtIso.slice(0, 10)} (30 din, no refund)</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Payout history */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-700" />
          Payout history
        </h2>
        {!loading && (!data || data.payoutHistory.length === 0) ? (
          <p className="text-xs text-slate-400 mt-2">Abhi koi entry nahi — pehla close karein!</p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
          <table className="mt-3 w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2">Period</th>
                <th className="pb-2 text-right">Kamai</th>
                <th className="pb-2 text-right">Clawback</th>
                <th className="pb-2 text-right">Net</th>
                <th className="pb-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.payoutHistory ?? []).map((p) => (
                <tr key={p.period} className="border-t border-slate-100">
                  <td className="py-1.5 font-mono text-xs">{p.period}</td>
                  <td className="py-1.5 text-right">{inr(p.earned)}</td>
                  <td className="py-1.5 text-right text-red-700">
                    {p.clawedBack ? `-${inr(p.clawedBack)}` : "—"}
                  </td>
                  <td className="py-1.5 text-right font-bold">{inr(p.net)}</td>
                  <td className="py-1.5 text-right text-xs">
                    {p.locked ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <Lock className="w-3 h-3" /> locked
                      </span>
                    ) : (
                      <span className="text-slate-400">open</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Per-subscriber lines */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
        <h2 className="text-base font-bold text-slate-900">Har subscriber se kya mila</h2>
        {!loading && (!data || data.perSubscriberLines.length === 0) ? (
          <p className="text-xs text-slate-400 mt-2">—</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {(data?.perSubscriberLines ?? []).map((l) => (
              <li
                key={l.subscriptionId}
                className="py-2 flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-mono text-[10px] text-slate-400 truncate max-w-[10rem]">
                  …{l.subscriptionId.slice(-8)}
                </span>
                <span className="text-xs text-slate-500">
                  first {inr(l.firstEarn)} · trail {inr(l.trailEarn)} · last {l.lastPeriod}
                </span>
                <span className="font-bold">{inr(l.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center text-slate-400 text-sm pb-6">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Data aa raha hai…
        </div>
      )}
    </div>
  );
}
