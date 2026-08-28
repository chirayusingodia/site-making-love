import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller } from "@/lib/supabase-admin.server";
import { stripMaskedFieldsDeep } from "@/lib/telecaller-logic";
import { fetchAllRows } from "@/lib/supabase";

// POST /api/telecaller/my-day
// Gate: requireTelecaller.
//
// Her OWN day, self-measured (§7.8): calls logged today (IST),
// outcome breakdown, sankalp completions, callbacks she promised
// that are still upcoming or overdue, and leads she created
// today. Supervision is not the point — her own number on the
// board is.

const IST_OFFSET_MS = 5.5 * 3_600_000;

interface MyCallLog {
  id: string;
  subscription_id: string | null;
  profile_id: string | null;
  outcome: string;
  callback_at: string | null;
  escalated: boolean;
  created_at: string;
}

export const Route = createFileRoute("/api/telecaller/my-day")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        try {
          const istDay = new Date(Date.now() + IST_OFFSET_MS);
          const ymd = istDay.toISOString().slice(0, 10);
          const dayStartIso = new Date(
            Date.parse(`${ymd}T00:00:00Z`) - IST_OFFSET_MS,
          ).toISOString();

          const [logsRes, leadsRes] = await Promise.all([
            fetchAllRows<MyCallLog>((from, to) =>
              auth.db
                .from("call_logs")
                .select("id,subscription_id,profile_id,outcome,callback_at,escalated,created_at")
                .eq("called_by", auth.callerId)
                .gte("created_at", dayStartIso)
                .order("created_at", { ascending: false })
                .range(from, to),
            ),
            auth.db
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("created_by", auth.callerId)
              .gte("created_at", dayStartIso),
          ]);
          if (logsRes.error) return json({ error: logsRes.error }, 500);
          if (leadsRes.error) return json({ error: leadsRes.error.message }, 500);

          const logs = logsRes.data;
          const nowMs = Date.now();
          const outcomes: Record<string, number> = {};
          for (const l of logs) outcomes[l.outcome] = (outcomes[l.outcome] ?? 0) + 1;

          // Callbacks SHE promised and that are still open: latest log
          // per person is a callback_requested — due if its time has
          // passed, upcoming otherwise.
          interface PersonKeyed {
            key: string;
            callbackAt: string;
            subscriptionId: string | null;
            profileId: string | null;
          }
          const latestByPerson = new Map<string, MyCallLog>();
          for (const l of logs) {
            const key = l.profile_id ?? l.subscription_id ?? l.id;
            if (!latestByPerson.has(key)) latestByPerson.set(key, l);
          }
          const callbacks = [...latestByPerson.values()]
            .filter((l) => l.outcome === "callback_requested" && l.callback_at)
            .map((l): PersonKeyed & { due: boolean } => ({
              key: l.profile_id ?? l.subscription_id!,
              callbackAt: l.callback_at!,
              subscriptionId: l.subscription_id,
              profileId: l.profile_id,
              due: Date.parse(l.callback_at!) <= nowMs,
            }))
            .sort((a, b) => a.callbackAt.localeCompare(b.callbackAt));

          return json(
            stripMaskedFieldsDeep({
              date: ymd,
              callsLogged: logs.length,
              completions: outcomes["connected_completed"] ?? 0,
              partials: outcomes["connected_partial"] ?? 0,
              refusals: outcomes["connected_refused"] ?? 0,
              dndSet: outcomes["do_not_call"] ?? 0,
              complaintsEscalated: logs.filter((l) => l.escalated).length,
              leadsCreatedToday: leadsRes.count ?? 0,
              outcomes,
              callbacksDue: callbacks.filter((c) => c.due).length,
              callbacksUpcoming: callbacks.filter((c) => !c.due),
            }),
          );
        } catch (err) {
          console.error("telecaller/my-day error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
