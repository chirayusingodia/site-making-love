import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AlertTriangle, ChevronRight } from "lucide-react";

// "Needs Chirayu" (§5.6) — escalated call_logs surfaced on
// /admin/overview. Admin-surface direct query under RLS (policy:
// call_logs: admin read); retention decisions belong to the owner,
// so pause/cancel requests and complaints land here instead of
// being actioned by the telecaller.

interface EscalatedRow {
  id: string;
  outcome: string;
  notes: string | null;
  queue: string | null;
  created_at: string;
  subscription_id: string | null;
  profile_id: string | null;
  lead_id: string | null;
}

export function NeedsChirayuCard() {
  const [rows, setRows] = useState<EscalatedRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("call_logs")
        .select("id,outcome,notes,queue,created_at,subscription_id,profile_id,lead_id")
        .eq("escalated", true)
        .order("created_at", { ascending: false })
        .limit(8);
      if (!cancelled) setRows((data ?? []) as EscalatedRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (rows === null || rows.length === 0) return null;

  return (
    <section className="bg-white rounded-2xl border border-red-200 shadow-2xs p-5">
      <h2 className="text-base font-bold text-red-900 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-600" />
        Needs Chirayu ({rows.length})
      </h2>
      <p className="text-[11px] text-red-900/60 mt-0.5">
        Telecaller escalations — cancel/pause requests aur complaints. Retention ka faisla aapka
        hai.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => {
          const personHref = r.subscription_id
            ? `/telecaller/person/${r.subscription_id}`
            : r.profile_id
              ? `/telecaller/person/lead-${r.profile_id}`
              : null;
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-700 min-w-0 truncate">
                <span className="font-mono text-[10px] text-slate-400 mr-2">
                  {r.created_at.slice(0, 16).replace("T", " ")}
                </span>
                <span className="font-semibold capitalize">{r.outcome.replace(/_/g, " ")}</span>
                {r.queue ? <span className="text-slate-400"> · {r.queue}</span> : null}
                {r.notes ? <span className="italic"> — {r.notes}</span> : null}
              </span>
              {personHref && (
                <a
                  href={personHref}
                  className="flex-none text-indigo-700 hover:underline inline-flex items-center"
                >
                  kholein <ChevronRight className="w-3 h-3" />
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
