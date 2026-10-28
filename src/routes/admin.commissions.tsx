import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callAdminApi } from "@/lib/admin-api";
import { AlertTriangle, Loader2, Lock, LockOpen, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  StatusPill,
  TableScroll,
} from "@/components/admin/admin-ui";

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
    <div className="space-y-6">
      <PageHeader
        title="Commission engine"
        description="Reconciler idempotent hai — dobara chalane par zero duplicate banega. Locked month mein koi entry nahi likhi ja sakti."
      />

      {error && (
        <Notice tone="bad" icon={AlertTriangle}>
          <span className="break-words">{error}</span>
        </Notice>
      )}

      {/* Reconciler */}
      <Panel title="Reconciler">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => runReconcile(false)}
            disabled={busy !== null}
            className="gap-2 bg-orange-600 hover:bg-orange-700 text-white"
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
          <pre className="mt-3 rounded-lg border border-stone-200 bg-stone-50 text-stone-800 text-xs p-3 overflow-auto max-h-64">
            {JSON.stringify(summary, null, 2)}
          </pre>
        )}
      </Panel>

      {/* Periods */}
      <Panel title="Payout periods" flush>
        {!byPeriod ? (
          <div className="p-4 sm:p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : byPeriod.length === 0 && !periods?.length ? (
          <EmptyState title="Abhi koi commission entry nahi bani." />
        ) : (
          <TableScroll>
            <table className="w-full text-sm admin-table-fixed min-w-[560px]">
              <thead>
                <tr className="text-left text-xs text-stone-500 border-b border-stone-100">
                  <th className="font-medium px-4 sm:px-5 py-2.5">Period</th>
                  <th className="font-medium px-3 py-2.5 text-right">Net payable</th>
                  <th className="font-medium px-3 py-2.5 text-right">Entries</th>
                  <th className="font-medium px-3 py-2.5 text-right">Status</th>
                  <th className="font-medium px-4 sm:px-5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {(byPeriod ?? []).map((p) => {
                  const lockedRow = periods?.find((x) => x.period === p.period);
                  const locked = Boolean(lockedRow?.locked_at);
                  return (
                    <tr key={p.period}>
                      <td className="px-4 sm:px-5 py-2.5 font-mono text-xs text-stone-700">
                        {p.period}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-stone-900">
                        {inr(p.net)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-stone-600">
                        {p.count}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {locked ? (
                          <StatusPill tone="good">locked</StatusPill>
                        ) : (
                          <StatusPill tone="neutral">open</StatusPill>
                        )}
                      </td>
                      <td className="px-4 sm:px-5 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant={locked ? "outline" : "default"}
                          className={`h-9 md:h-7 text-xs gap-1 ${locked ? "" : "bg-orange-600 hover:bg-orange-700 text-white"}`}
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
                    <tr key={pr.period}>
                      <td className="px-4 sm:px-5 py-2.5 font-mono text-xs text-stone-700">
                        {pr.period}
                      </td>
                      <td className="px-3 py-2.5 text-right text-stone-400">—</td>
                      <td className="px-3 py-2.5 text-right text-stone-400">—</td>
                      <td className="px-3 py-2.5 text-right">
                        <StatusPill tone={pr.locked_at ? "good" : "neutral"}>
                          {pr.locked_at ? "locked" : "open"}
                        </StatusPill>
                      </td>
                      <td className="px-4 sm:px-5 py-2.5 text-right">
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
          </TableScroll>
        )}
      </Panel>
    </div>
  );
}
