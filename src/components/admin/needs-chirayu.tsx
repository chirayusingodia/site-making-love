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
    <section className="admin-card overflow-hidden border-rose-200">
      <header className="flex items-start gap-2.5 px-4 sm:px-5 pt-4 pb-3 border-b border-stone-100">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-stone-900">
            Needs Chirayu
            <span className="ml-2 inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 tabular-nums align-middle">
              {rows.length}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-stone-500">
            Telecaller escalations — cancel/pause requests aur complaints. Retention ka faisla aapka
            hai.
          </p>
        </div>
      </header>
      <ul className="divide-y divide-stone-100">
        {rows.map((r) => {
          const personHref = r.subscription_id
            ? `/telecaller/person/${r.subscription_id}`
            : r.profile_id
              ? `/telecaller/person/lead-${r.profile_id}`
              : null;
          return (
            <li
              key={r.id}
              className="flex flex-col gap-1.5 px-4 sm:px-5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-medium capitalize text-stone-900">
                    {r.outcome.replace(/_/g, " ")}
                  </span>
                  {r.queue ? <span className="text-xs text-stone-500">{r.queue}</span> : null}
                  <span className="text-xs tabular-nums text-stone-400">
                    {r.created_at.slice(0, 16).replace("T", " ")}
                  </span>
                </div>
                {r.notes ? (
                  <p className="mt-0.5 text-xs text-stone-600 break-words line-clamp-2">
                    {r.notes}
                  </p>
                ) : null}
              </div>
              {personHref && (
                <a
                  href={personHref}
                  className="self-start sm:self-center shrink-0 inline-flex items-center gap-0.5 text-xs font-medium text-orange-700 hover:underline min-h-9 sm:min-h-0"
                >
                  kholein <ChevronRight className="w-3.5 h-3.5" />
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
