import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchAllRows, supabase } from "@/lib/supabase";
import {
  batchLabel,
  groupForPandit,
  saturdayHawanSevaIds,
  sevasForMember,
  type BatchKind,
  type PanditMember,
  type ScheduleRuleRow,
  type SevaLite,
} from "@/lib/sankalp-logic";
import { Printer, ArrowLeft, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/pandit/$batchId")({
  component: PanditListPage,
});

// ─────────────────────────────────────────────────────────────
// PANDIT-FACING VIEW — HARD RULE:
// This page renders ONLY seva name(s) + plain name-gotra lists.
// NEVER plan name, price, phone number, email, or any other PII.
// Keep it that way — Pandit ji sees exactly this and nothing else.
// ─────────────────────────────────────────────────────────────

interface BatchRow {
  id: string;
  batch_type: BatchKind;
  batch_date: string;
}

function PanditListPage() {
  const { batchId } = Route.useParams();
  const [batch, setBatch] = useState<BatchRow | null>(null);
  const [groups, setGroups] = useState<ReturnType<typeof groupForPandit>>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const { data: b, error: bErr } = await supabase
        .from("sankalp_batches")
        .select("id,batch_type,batch_date")
        .eq("id", batchId)
        .maybeSingle();
      if (bErr || !b) {
        setError(bErr?.message ?? "Batch not found");
        setLoading(false);
        return;
      }
      setBatch(b as BatchRow);

      const [sbsAll, sevasRes, psRes, rulesRes] = await Promise.all([
        fetchAllRows<{ subscription_id: string; is_catchup: boolean }>((from, to) =>
          supabase
            .from("sankalp_batch_subscriptions")
            .select("subscription_id,is_catchup")
            .eq("batch_id", batchId)
            .order("id")
            .range(from, to),
        ),
        supabase.from("sevas").select("id,name,slug,sort_order,is_active").order("sort_order"),
        supabase.from("plan_sevas").select("plan_id,seva_id"),
        supabase.from("seva_schedule_rules").select("seva_id,weekday,occurrence"),
      ]);
      const err =
        sbsAll.error ?? sevasRes.error?.message ?? psRes.error?.message ?? rulesRes.error?.message;
      if (err) {
        setError(err);
        setLoading(false);
        return;
      }

      const sbsRows = sbsAll.data;
      const subIds = sbsRows.map((r) => r.subscription_id);

      let subPlan = new Map<string, string>();
      const membersBySub = new Map<string, { name: string; gotra: string | null }[]>();
      // Chunked .in() — thousands of UUIDs in one filter exceed URL limits.
      for (let i = 0; i < subIds.length; i += 200) {
        const chunk = subIds.slice(i, i + 200);
        const { data: subData } = await supabase
          .from("subscriptions")
          .select("id,plan_id")
          .in("id", chunk);
        subPlan = new Map([
          ...subPlan,
          ...((subData as { id: string; plan_id: string }[]) ?? []).map(
            (s) => [s.id, s.plan_id] as const,
          ),
        ]);

        const { data: fmData } = await supabase
          .from("family_members")
          .select("subscription_id,full_name,gotra,slot_number")
          .in("subscription_id", chunk)
          .order("slot_number");
        for (const m of fmData ?? []) {
          const list = membersBySub.get(m.subscription_id) ?? [];
          list.push({ name: m.full_name, gotra: m.gotra });
          membersBySub.set(m.subscription_id, list);
        }
      }

      const sevas = (sevasRes.data as SevaLite[]) ?? [];
      const planSevas = psRes.data ?? [];
      const scheduleRules = (rulesRes.data as ScheduleRuleRow[]) ?? [];
      const hawanIds = saturdayHawanSevaIds(sevas, scheduleRules);

      const allMembers: PanditMember[] = sbsRows.map((r) => ({
        subscription_id: r.subscription_id,
        is_catchup: r.is_catchup,
        sevas: sevasForMember({
          kind: (b as BatchRow).batch_type,
          planId: subPlan.get(r.subscription_id) ?? "",
          planSevas,
          sevas,
          saturdayHawanSevaIds: hawanIds,
          scheduleRules,
          isCatchup: r.is_catchup,
        }),
        names: membersBySub.get(r.subscription_id) ?? [],
      }));

      // SANKALP PENDING RULE (signup-first checkout session §3b):
      // A subscription with ZERO family members has nothing correct to
      // recite yet — it is EXCLUDED from this Pandit-facing list. Its
      // sankalp_batch_subscriptions row still exists (created by
      // generate-batch), so it stays tracked; the moment anyone adds a
      // member via /profile, the next live batch picks it up.
      // NEVER fabricate a name from profiles.full_name.
      const members = allMembers.filter((m) => m.names.length > 0);
      setPendingCount(allMembers.length - members.length);

      setGroups(groupForPandit(members));
      setLoading(false);
    })();
  }, [batchId]);

  if (loading) return <Skeleton className="h-96 w-full rounded-2xl bg-amber-100/50" />;
  if (error || !batch) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-900 p-4 rounded-xl text-sm">
        {error ?? "Batch not found"}
      </div>
    );
  }

  const totalNames = groups.reduce((n, g) => n + g.names.length, 0);

  return (
    <div className="max-w-3xl mx-auto space-y-4 print:max-w-none">
      {/* Screen-only toolbar */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          to="/admin/proof-upload"
          className="text-xs font-medium text-amber-900/70 hover:text-amber-900 flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Proof Upload
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
        >
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
      </div>

      {/* Sankalp Pending notice — screen only, NEVER printed for Pandit ji */}
      {pendingCount > 0 && (
        <div className="print:hidden bg-amber-50 border border-amber-300 text-amber-900 p-3 rounded-xl text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            <strong>{pendingCount}</strong> subscription{pendingCount === 1 ? "" : "s"} in this
            batch have <strong>no family details yet</strong> (Sankalp Pending) — excluded from the
            list below. They stay tracked in this batch; call them via{" "}
            <Link to="/admin/subscribers" className="underline font-semibold">
              Subscribers → Sankalp Pending filter
            </Link>
            .
          </span>
        </div>
      )}

      {/* Printable sheet — seva names + name-gotra ONLY */}
      <div className="bg-white rounded-2xl border border-amber-900/10 p-8 font-serif print:border-0 print:p-0">
        <div className="text-center text-2xl text-amber-700">॥ श्री गणेशाय नमः ॥</div>
        <h1 className="text-center text-xl font-bold mt-1">संकल्प नामावली — Sankalp Name List</h1>
        <div className="text-center text-xs text-slate-500 mt-1 mb-6">
          {batchLabel(batch.batch_type, batch.batch_date)}
          {" • "}कुल नाम: {totalNames}
        </div>

        {groups.map((g, gi) => (
          <div key={g.key || gi} className="mb-8 break-inside-avoid">
            <div className="text-[11px] font-bold uppercase tracking-widest text-amber-800 border-b-2 border-amber-600 pb-1 mb-2 font-sans">
              सेवाएँ — Sevas in this Sankalp
            </div>
            <ul className="mb-4">
              {g.sevas.map((s) => (
                <li key={s.id} className="text-sm py-0.5">
                  🚩 {s.name}
                </li>
              ))}
              {g.sevas.length === 0 && <li className="text-sm text-slate-400">—</li>}
            </ul>

            <div className="text-[11px] font-bold uppercase tracking-widest text-amber-800 border-b-2 border-amber-600 pb-1 mb-2 font-sans">
              नाम एवं गोत्र — Names &amp; Gotra
            </div>
            <ol className="list-none">
              {g.names.map((n, i) => (
                <li
                  key={i}
                  className="flex justify-between gap-4 py-1 border-b border-dotted border-slate-300 text-sm"
                >
                  <span className="flex gap-2 min-w-0">
                    <span className="text-amber-800 font-bold w-8 shrink-0">{i + 1}.</span>
                    <span className="font-semibold">{n.name}</span>
                  </span>
                  <span className="text-slate-600 whitespace-nowrap">{n.gotra?.trim() || "—"}</span>
                </li>
              ))}
              {g.names.length === 0 && <li className="text-sm text-slate-400 py-2">No names.</li>}
            </ol>
          </div>
        ))}

        {groups.length === 0 && (
          <div className="text-center text-sm text-slate-400 py-8">
            No subscribers in this batch yet.
          </div>
        )}

        <div className="text-center text-[11px] text-slate-400 mt-8">
          पुण्यता — Sewa Hamari, Punya Aapka
        </div>
      </div>
    </div>
  );
}
