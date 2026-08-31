import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callAdminApi } from "@/lib/admin-api";
import { Loader2, Lock, LockOpen, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/commissions")({
  // OWNER-ONLY (financial data — same gate discipline as /admin/reports).
  beforeLoad: async () => {
    const { fetchMyRole } = await import("@/lib/admin-api");
    const role = await fetchMyRole();
    if (role !== "owner")
      throw redirect({ to: "/admin/overview", search: { notice: "owner-required" } });
  },
  component: AdminCommissionsPage,
});

// §10.4–§10.5 owner controls: the idempotent reconciler trigger and
// the payout-period lock. Admin sees NONE of this — it is financial.

interface ReconcileSummary {
  dryRun?: boolean;
  capturedPaymentsScanned?: number;
  attributionsResolved?: number;
  draftsGenerated?: number;
  inserted?: number;
  firstDealEntries?: number;
  trailEntries?: number;
  skippedLocked?: number;
  reversalsInserted?: number;
  flipsApplied?: number;
  holdsMatured?: number;
  openPeriod?: string;
}

interface PeriodRow {
  period: string;
  locked_at: string | null;
}

function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function AdminCommissionsPage() {
  const [periods, setPeriods] = useState<PeriodRow[] | null>(null);
  const [byPeriod, setByPeriod] = useState<{ period: string; net: number; count: number }[] | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReconcileSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Direct RLS-scoped reads on the OWNER-only surface.
    const [{ data: periodRows }, entriesRes] = await Promise.all([
      supabase.from("commission_payout_periods").select("period,locked_at"),
      (async () =>
        await supabase
          .from("commission_entries")
          .select("payout_period,amount_paise")
          .order("payout_period"))(),
    ]);
    setPeriods((periodRows as PeriodRow[]) ?? []);
    const buckets = new Map<string, { net: number; count: number }>();
    for (const e of (entriesRes.data as { payout_period: string; amount_paise: number }[]) ?? []) {
      const b = buckets.get(e.payout_period) ?? { net: 0, count: 0 };
      b.net += e.amount_paise;
      // [Bug 2.6] Count EVERY ledger row (reversals included) — the
      // old `amount_paise > 0` filter made the Entries figure diverge
      // from the Net figure whenever clawbacks were active.
      b.count += 1;
      buckets.set(e.payout_period, b);
    }
    setByPeriod(
      [...buckets.entries()]
        .map(([period, v]) => ({ period, ...v }))
        .sort((a, b) => b.period.localeCompare(a.period)),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runReconcile(dryRun: boolean) {
    setBusy(dryRun ? "dry" : "reconcile");
    setError(null);
    try {
      setSummary(
        await callAdminApi<ReconcileSummary>("/api/admin/commissions/reconcile", { dryRun }),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconcile fail");
    } finally {
      setBusy(null);
    }
  }

  async function toggleLock(period: string, lock: boolean) {
    setBusy(`lock-${period}`);
    setError(null);
    try {
      await callAdminApi("/api/admin/commissions/lock", { period, lock });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lock fail");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          Commission Engine
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-white">
            OWNER
          </span>
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Reconciler idempotent hai — dobara chalane par zero duplicate banega. Locked month mein
          koi entry nahi likhi ja sakti.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* Reconciler */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5 space-y-3">
        <h2 className="text-base font-bold text-slate-900">Reconciler</h2>
        <div className="flex gap-2">
          <Button
            onClick={() => runReconcile(false)}
            disabled={busy !== null}
            className="gap-2 bg-amber-700 hover:bg-amber-800"
          >
            {busy === "reconcile" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4" />
            )}
            Run reconcile
          </Button>
          <Button
            onClick={() => runReconcile(true)}
            disabled={busy !== null}
            variant="outline"
            className="gap-2"
          >
            {busy === "dry" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Dry run
          </Button>
        </div>
        {summary && (
          <pre className="mt-2 rounded-lg bg-slate-900 text-emerald-300 text-[11px] p-3 overflow-auto max-h-64">
            {JSON.stringify(summary, null, 2)}
          </pre>
        )}
      </section>

      {/* Periods */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
        <h2 className="text-base font-bold text-slate-900 mb-3">Payout periods</h2>
        {!byPeriod ? (
          <Skeleton className="h-24 w-full" />
        ) : byPeriod.length === 0 && !periods?.length ? (
          <p className="text-xs text-slate-400">Abhi koi commission entry nahi bani.</p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2">Period</th>
                <th className="pb-2 text-right">Net payable</th>
                <th className="pb-2 text-right">Entries</th>
                <th className="pb-2 text-right">Status</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {(byPeriod ?? []).map((p) => {
                const lockedRow = periods?.find((x) => x.period === p.period);
                const locked = Boolean(lockedRow?.locked_at);
                return (
                  <tr key={p.period} className="border-t border-slate-100">
                    <td className="py-1.5 font-mono text-xs">{p.period}</td>
                    <td className="py-1.5 text-right font-bold">{inr(p.net)}</td>
                    <td className="py-1.5 text-right text-xs">{p.count}</td>
                    <td className="py-1.5 text-right text-xs">
                      {locked ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <Lock className="w-3 h-3" /> locked
                        </span>
                      ) : (
                        <span className="text-slate-400">open</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      <Button
                        size="sm"
                        variant={locked ? "outline" : "default"}
                        className={`h-9 md:h-7 text-xs gap-1 ${locked ? "" : "bg-amber-700 hover:bg-amber-800"}`}
                        disabled={busy !== null}
                        onClick={() => toggleLock(p.period, !locked)}
                      >
                        {busy === `lock-${p.period}` ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : locked ? (
                          <LockOpen className="w-3 h-3" />
                        ) : (
                          <Lock className="w-3 h-3" />
                        )}
                        {locked ? "Unlock" : "Lock & pay"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {(periods ?? [])
                .filter((pr) => !(byPeriod ?? []).some((b) => b.period === pr.period))
                .map((pr) => (
                  <tr key={pr.period} className="border-t border-slate-100">
                    <td className="py-1.5 font-mono text-xs">{pr.period}</td>
                    <td className="py-1.5 text-right">—</td>
                    <td className="py-1.5 text-right">—</td>
                    <td className="py-1.5 text-right text-xs">
                      {pr.locked_at ? "locked" : "open"}
                    </td>
                    <td className="py-1.5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 md:h-7 text-xs gap-1"
                        disabled={busy !== null}
                        onClick={() => toggleLock(pr.period, !pr.locked_at)}
                      >
                        {pr.locked_at ? (
                          <LockOpen className="w-3 h-3" />
                        ) : (
                          <Lock className="w-3 h-3" />
                        )}
                        {pr.locked_at ? "Unlock" : "Lock"}
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}
