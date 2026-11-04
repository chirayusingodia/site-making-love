import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { fetchAllRows } from "@/lib/supabase";
import {
  buildTelecallerReview,
  type ReviewCall,
  type ReviewEntry,
  type ReviewPerson,
} from "@/lib/telecaller-review-logic";

// POST /api/admin/commissions/telecaller-review      (OWNER ONLY)
// Body: { weeks?: 4 | 8 | 12 | 26 }  (default 8)
// Weekly conversions, earnings and call effort per telecaller.
const ALLOWED = new Set([4, 8, 12, 26]);

interface EntryRaw {
  profile_id: string;
  kind: "first_deal" | "trail";
  status: string;
  amount_paise: number;
  created_at: string;
  payments: { created_at: string } | { created_at: string }[] | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asRows<T>(builder: any): PromiseLike<{ data: T[] | null; error: { message: string } | null }> {
  return builder;
}

export const Route = createFileRoute("/api/admin/commissions/telecaller-review")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);
        const { db } = gate.auth;

        let body: { weeks?: unknown } = {};
        try {
          body = await request.json();
        } catch {
          /* optional */
        }
        const weekCount =
          typeof body.weeks === "number" && ALLOWED.has(body.weeks) ? body.weeks : 8;

        try {
          const nowMs = Date.now();
          // Two extra weeks of margin: a row is dated by its payment, and the
          // ledger row is created at/after it, so created_at >= windowStart is
          // a safe lower bound for everything inside the window.
          const windowStartIso = new Date(nowMs - (weekCount + 2) * 7 * 86_400_000).toISOString();

          const [entriesRes, callsRes, tcRes] = await Promise.all([
            fetchAllRows<EntryRaw>((from, to) =>
              asRows<EntryRaw>(
                db
                  .from("commission_entries")
                  .select("profile_id,kind,status,amount_paise,created_at,payments(created_at)")
                  .not("profile_id", "is", null)
                  .gte("created_at", windowStartIso)
                  .range(from, to),
              ),
            ),
            fetchAllRows<ReviewCall>((from, to) =>
              asRows<ReviewCall>(
                db
                  .from("call_logs")
                  .select("called_by,outcome,created_at")
                  .gte("created_at", windowStartIso)
                  .range(from, to),
              ),
            ),
            db.from("profiles").select("id,full_name,phone").eq("role", "telecaller"),
          ]);
          if (entriesRes.error) throw new Error(String(entriesRes.error));
          if (callsRes.error) throw new Error(String(callsRes.error));
          if (tcRes.error) throw new Error(tcRes.error.message);

          const telecallers = (tcRes.data ?? []) as ReviewPerson[];
          const known = new Set(telecallers.map((t) => t.id));
          const entries: ReviewEntry[] = (entriesRes.data as EntryRaw[]).map((e) => {
            const pay = Array.isArray(e.payments) ? e.payments[0] : e.payments;
            return {
              profile_id: e.profile_id,
              kind: e.kind,
              status: e.status,
              amount_paise: e.amount_paise,
              paid_at: pay?.created_at ?? null,
              created_at: e.created_at,
            };
          });
          // Only telecaller-seat people have calls; ignore admin/owner call rows
          // unless they also earned (keeps the board about the telecaller team).
          const earners = new Set(entries.map((e) => e.profile_id));
          const calls = (callsRes.data as ReviewCall[]).filter(
            (c) => known.has(c.called_by) || earners.has(c.called_by),
          );

          const missing = [...earners].filter((id) => !known.has(id));
          if (missing.length > 0) {
            const { data } = await db.from("profiles").select("id,full_name,phone").in("id", missing);
            for (const p of (data ?? []) as ReviewPerson[]) telecallers.push(p);
          }

          return json(buildTelecallerReview({ nowMs, weekCount, entries, calls, telecallers }));
        } catch (err) {
          console.error("commissions/telecaller-review error:", err);
          return json({ error: err instanceof Error ? err.message : "Review failed" }, 500);
        }
      },
    },
  },
});
