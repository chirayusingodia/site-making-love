import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  Loader2,
  PhoneCall,
  RefreshCw,
  StickyNote,
  Target,
  Users,
} from "lucide-react";
import { callAdminApi } from "@/lib/admin-api";
import {
  isTelecallerQueueKey,
  QUEUE_META,
  DAILY_LEAD_TARGET,
  type TelecallerLeadRow,
  type TelecallerQueueRow,
} from "@/lib/telecaller-logic";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/telecaller/queue/$queueKey")({
  beforeLoad: async ({ params }) => {
    // THREE-LAYER GUARD, layer 2 (per-route): an unknown queue key
    // never even mounts.
    if (!isTelecallerQueueKey(params.queueKey)) {
      throw redirect({ to: "/telecaller/queues" });
    }
  },
  component: QueueWorkListPage,
});

interface ListResponse {
  queue: string;
  total: number;
  items: (TelecallerQueueRow | TelecallerLeadRow)[];
  nextCursor: string | null;
}

const isLead = (item: TelecallerQueueRow | TelecallerLeadRow): item is TelecallerLeadRow =>
  "leadId" in item;

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  pending: { label: "Pending", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  paused: { label: "Paused", cls: "bg-violet-50 text-violet-800 border-violet-200" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function QueueWorkListPage() {
  const { queueKey } = Route.useParams();
  const meta = QUEUE_META[queueKey as keyof typeof QUEUE_META];
  const leadQueue = queueKey === "aaj_ke_leads" || queueKey === "free_sewa_pending";
  const targetQueue = queueKey === "aaj_ke_leads"; // daily quota applies to conversion calls only

  const [items, setItems] = useState<(TelecallerQueueRow | TelecallerLeadRow)[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPage = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const res = await callAdminApi<ListResponse>("/api/telecaller/queue/list", {
          queue: queueKey,
          ...(reset || !cursor ? {} : { cursor }),
        });
        setTotal(res.total);
        setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
        setCursor(res.nextCursor);
        if (!res.nextCursor) setExhausted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "List load nahi hui");
      } finally {
        setLoading(false);
      }
    },
    [queueKey, cursor],
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setExhausted(false);
    loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-indigo-700" />
            {meta?.title ?? queueKey}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {meta?.why} · <span className="font-semibold text-slate-700">{total}</span> log
            {targetQueue && total > 0 && (
              <>
                {" · "}
                <Target className="inline w-3.5 h-3.5 text-indigo-600 -mt-0.5" /> target:{" "}
                {DAILY_LEAD_TARGET}
                {total >= DAILY_LEAD_TARGET && (
                  <span className="ml-1 text-emerald-700 font-semibold">— aaj ka quota poora!</span>
                )}
              </>
            )}
          </p>
        </div>
        <Button
          onClick={() => {
            setItems([]);
            setCursor(null);
            setExhausted(false);
            loadPage(true);
          }}
          variant="outline"
          size="sm"
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid gap-2.5">
        {items.map((row) =>
          isLead(row) ? (
            <LeadListItem key={row.leadId} lead={row} queueKey={queueKey} />
          ) : (
            <SubscriberListItem
              key={row.subscriptionId ?? row.profileId}
              row={row}
              queueKey={queueKey}
            />
          ),
        )}
        {!loading && items.length === 0 && !error && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm px-4 py-6 text-center">
            🎉 Yeh queue khaali hai.
          </div>
        )}
        {loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
      </div>

      {!loading && !exhausted && items.length > 0 && (
        <div className="flex justify-center pt-1 pb-4">
          {/* [Pass-2 F5] disabled while a fetch is in flight — belt and
              braces against duplicate page appends even if the
              surrounding conditional render ever changes. */}
          <Button
            onClick={() => loadPage(false)}
            disabled={loading}
            variant="outline"
            size="sm"
            className="gap-1"
          >
            Aage ke {Math.min(50, Math.max(0, total - items.length))}{" "}
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
      {loading && items.length > 0 && (
        <div className="flex items-center justify-center text-slate-400 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Load ho raha hai…
        </div>
      )}
    </div>
  );
}

// ─── Row renderers ───────────────────────────────────────────

const LEAD_STATUS_CLS: Record<string, string> = {
  new: "bg-slate-100 text-slate-600 border-slate-200",
  assigned: "bg-indigo-50 text-indigo-800 border-indigo-200",
  in_progress: "bg-amber-50 text-amber-800 border-amber-200",
  link_sent: "bg-sky-50 text-sky-800 border-sky-200",
  converted: "bg-emerald-50 text-emerald-800 border-emerald-200",
  not_interested: "bg-rose-50 text-rose-700 border-rose-200",
  unreachable: "bg-orange-50 text-orange-800 border-orange-200",
  wrong_number: "bg-red-50 text-red-700 border-red-200",
  duplicate: "bg-slate-100 text-slate-500 border-slate-200",
  expired: "bg-slate-100 text-slate-400 border-slate-200",
};

function LeadListItem({ lead, queueKey }: { lead: TelecallerLeadRow; queueKey: string }) {
  return (
    <Link
      to="/telecaller/lead/$leadId"
      params={{ leadId: lead.leadId }}
      search={{ queue: queueKey }}
      className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors shadow-2xs group"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-900">
              {lead.fullName ?? "(naam nahi)"}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${
                LEAD_STATUS_CLS[lead.status] ?? LEAD_STATUS_CLS.new
              }`}
            >
              {lead.status}
            </span>
            {lead.interestedPlanName && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                {lead.interestedPlanName}
              </Badge>
            )}
            {queueKey === "aaj_ke_leads" && lead.freeSewaConfirmedAt && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 border-emerald-200 bg-emerald-50 text-emerald-800"
              >
                Free Sewa ✓
              </Badge>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
            <span>{lead.phone}</span>
            {lead.city && (
              <>
                <span className="text-slate-300">·</span>
                <span>{lead.city}</span>
              </>
            )}
            {/* Migration 020 — family names the field agent collected.
                They are the sankalp script for this call. */}
            {lead.familyNames && lead.familyNames.length > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <Users className="w-3 h-3 inline text-indigo-500" />
                <span className="text-indigo-900">{lead.familyNames.join(", ")}</span>
              </>
            )}
            {lead.notes && (
              <>
                <span className="text-slate-300">·</span>
                <StickyNote className="w-3 h-3 inline text-amber-500" />
                <span className="italic truncate max-w-[24rem]">{lead.notes}</span>
              </>
            )}
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 flex-none" />
      </div>
    </Link>
  );
}

function SubscriberListItem({ row, queueKey }: { row: TelecallerQueueRow; queueKey: string }) {
  const badge = (row.subscriptionStatus && STATUS_BADGE[row.subscriptionStatus]) ?? null;
  return (
    <Link
      to="/telecaller/person/$subscriptionId"
      params={{ subscriptionId: row.subscriptionId ?? row.profileId }}
      search={{ queue: queueKey }}
      className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors shadow-2xs group"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-900">
              {row.fullName ?? "(naam nahi)"}
            </span>
            {badge && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${badge.cls}`}
              >
                {badge.label}
              </span>
            )}
            {row.preferredLanguage && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 uppercase">
                {row.preferredLanguage}
              </Badge>
            )}
            {row.doNotCall && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">
                DND
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
            <span className={row.altPhone ? "font-semibold text-emerald-700" : undefined}>
              {row.altPhone ?? row.phone ?? "—"}
            </span>
            {row.planName && (
              <>
                <span className="text-slate-300">·</span>
                <span>
                  {row.planName}
                  {row.planBillingPeriod ? ` (${row.planBillingPeriod})` : ""}
                </span>
              </>
            )}
            {queueKey === "recently_cancelled" && row.cancelReason && (
              <>
                <span className="text-slate-300">·</span>
                <span className="italic">karan: {row.cancelReason}</span>
              </>
            )}
            {(queueKey === "sankalp_pending" ||
              queueKey === "cutoff_risk" ||
              queueKey === "incomplete_details") && (
              <>
                <span className="text-slate-300">·</span>
                <span>{row.familyMemberCount}/4 naam</span>
              </>
            )}
            {queueKey === "callback_due" && (
              <>
                <span className="text-slate-300">·</span>
                <span>last: {fmtDate(row.lastCalledAt)}</span>
              </>
            )}
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 flex-none" />
      </div>
    </Link>
  );
}
