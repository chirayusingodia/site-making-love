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
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/admin/admin-ui";

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

  if (loading)
    return <Skeleton className="h-96 w-full max-w-3xl mx-auto rounded-xl bg-stone-100" />;
  if (error || !batch) {
    return (
      <Notice tone="bad" icon={AlertTriangle} className="max-w-3xl mx-auto">
        {error ?? "Batch not found"}
      </Notice>
    );
  }

  const totalNames = groups.reduce((n, g) => n + g.names.length, 0);

  return (
    <div className="max-w-3xl mx-auto space-y-4 print:max-w-none">
      {/* Screen-only toolbar */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 -ml-2 text-stone-600 hover:text-stone-900"
        >
          <Link to="/admin/proof-upload">
            <ArrowLeft className="w-4 h-4" /> Back to Proof Upload
          </Link>
        </Button>
        <Button
          onClick={() => window.print()}
          size="sm"
          className="h-9 gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
        >
          <Printer className="w-4 h-4" /> Print
        </Button>
      </div>

      {/* Sankalp Pending notice — screen only, NEVER printed for Pandit ji */}
      {pendingCount > 0 && (
        <Notice tone="warn" icon={AlertTriangle} className="print:hidden">
          <span>
            <strong>{pendingCount}</strong> subscription{pendingCount === 1 ? "" : "s"} in this
            batch have <strong>no family details yet</strong> (Sankalp Pending) — excluded from the
            list below. They stay tracked in this batch; call them via{" "}
            <Link to="/admin/subscribers" className="underline font-semibold">
              Subscribers → Sankalp Pending filter
            </Link>
            .
          </span>
        </Notice>
      )}

      {/* Printable sheet — seva names + name-gotra ONLY */}
      <div className="admin-card px-4 py-6 sm:p-8 font-serif print:border-0 print:p-0 print:shadow-none print:rounded-none">
        <div className="text-center text-2xl text-amber-700">॥ श्री गणेशाय नमः ॥</div>
        <h1 className="text-center text-lg sm:text-xl font-bold mt-1 text-stone-900">
          संकल्प नामावली — Sankalp Name List
        </h1>
        <div className="text-center text-xs text-stone-500 mt-1 mb-6">
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
              {g.sevas.length === 0 && <li className="text-sm text-stone-400">—</li>}
            </ul>

            <div className="text-[11px] font-bold uppercase tracking-widest text-amber-800 border-b-2 border-amber-600 pb-1 mb-2 font-sans">
              नाम एवं गोत्र — Names &amp; Gotra
            </div>
            <ol className="list-none">
              {g.names.map((n, i) => (
                <li
                  key={i}
                  className="flex justify-between gap-4 py-1 border-b border-dotted border-stone-300 text-sm"
                >
                  <span className="flex gap-2 min-w-0">
                    <span className="text-amber-800 font-bold w-8 shrink-0">{i + 1}.</span>
                    <span className="font-semibold break-words min-w-0">{n.name}</span>
                  </span>
                  <span className="text-stone-600 text-right shrink-0 max-w-[45%] break-words sm:whitespace-nowrap">
                    {n.gotra?.trim() || "—"}
                  </span>
                </li>
              ))}
              {g.names.length === 0 && <li className="text-sm text-stone-400 py-2">No names.</li>}
            </ol>
          </div>
        ))}

        {groups.length === 0 && (
          <div className="text-center text-sm text-stone-400 py-8">
            No subscribers in this batch yet.
          </div>
        )}

        <div className="text-center text-[11px] text-stone-400 mt-8">
          पुण्यता — Sewa Hamari, Punya Aapka
        </div>
      </div>
    </div>
  );
}
