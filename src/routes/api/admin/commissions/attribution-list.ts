import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";

// POST /api/admin/commissions/attribution-list      (OWNER ONLY)
// Body: { filter?: 'all'|'unassigned'|'assigned', telecallerId?: uuid, search?: string }
//
// The checkpoint: every subscriber who has ever been a real
// (non-pending) subscription, with the telecaller credited for them
// and whether commission has already been generated — which is what
// locks the assignment (see assign-telecaller).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 300;

interface SubRow {
  id: string;
  user_id: string;
  status: string;
  telecaller_id: string | null;
  attribution_source: string | null;
  created_at: string;
  plans: { name: string } | { name: string }[] | null;
}

export const Route = createFileRoute("/api/admin/commissions/attribution-list")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);
        const { db } = gate.auth;

        let b: { filter?: unknown; telecallerId?: unknown; search?: unknown } = {};
        try {
          b = await request.json();
        } catch {
          /* optional */
        }
        const filter = b.filter === "unassigned" || b.filter === "assigned" ? b.filter : "all";
        const telecallerId =
          typeof b.telecallerId === "string" && UUID_RE.test(b.telecallerId) ? b.telecallerId : null;
        const search = typeof b.search === "string" ? b.search.trim().slice(0, 60) : "";

        try {
          const { data: tcs, error: tcErr } = await db
            .from("profiles")
            .select("id,full_name,phone")
            .eq("role", "telecaller");
          if (tcErr) return json({ error: tcErr.message }, 500);
          const telecallers = (tcs ?? []) as { id: string; full_name: string | null; phone: string | null }[];

          // Search resolves to user ids first (name / phone live on profiles).
          let userIds: string[] | null = null;
          if (search) {
            const safe = search.replace(/[%,()]/g, " ");
            const { data: hits, error: sErr } = await db
              .from("profiles")
              .select("id")
              .or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%`)
              .limit(200);
            if (sErr) return json({ error: sErr.message }, 500);
            userIds = ((hits ?? []) as { id: string }[]).map((h) => h.id);
            if (userIds.length === 0) return json({ rows: [], telecallers, truncated: false });
          }

          let q = db
            .from("subscriptions")
            .select("id,user_id,status,telecaller_id,attribution_source,created_at,plans(name)")
            .neq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(LIMIT + 1);
          if (filter === "unassigned") q = q.is("telecaller_id", null);
          if (filter === "assigned") q = q.not("telecaller_id", "is", null);
          if (telecallerId) q = q.eq("telecaller_id", telecallerId);
          if (userIds) q = q.in("user_id", userIds);
          const { data: subsRaw, error: subErr } = await q;
          if (subErr) return json({ error: subErr.message }, 500);
          const truncated = (subsRaw?.length ?? 0) > LIMIT;
          const subs = ((subsRaw ?? []) as unknown as SubRow[]).slice(0, LIMIT);

          const uids = [...new Set(subs.map((s) => s.user_id))];
          const subIds = subs.map((s) => s.id);
          const [{ data: profs }, { data: ents }] = await Promise.all([
            uids.length
              ? db.from("profiles").select("id,full_name,phone").in("id", uids)
              : Promise.resolve({ data: [] }),
            subIds.length
              ? db
                  .from("commission_entries")
                  .select("subscription_id")
                  .in("subscription_id", subIds)
                  .not("profile_id", "is", null)
              : Promise.resolve({ data: [] }),
          ]);
          const pById = new Map(
            ((profs ?? []) as { id: string; full_name: string | null; phone: string | null }[]).map(
              (p) => [p.id, p],
            ),
          );
          const locked = new Set(((ents ?? []) as { subscription_id: string }[]).map((e) => e.subscription_id));
          const tcById = new Map(telecallers.map((t) => [t.id, t.full_name ?? "Unnamed telecaller"]));

          return json({
            truncated,
            telecallers,
            rows: subs.map((s) => {
              const p = pById.get(s.user_id);
              const plan = Array.isArray(s.plans) ? s.plans[0] : s.plans;
              return {
                subscriptionId: s.id,
                name: p?.full_name?.trim() || "Subscriber",
                phone: p?.phone ?? null,
                plan: plan?.name ?? null,
                status: s.status,
                since: s.created_at,
                telecallerId: s.telecaller_id,
                telecallerName: s.telecaller_id ? (tcById.get(s.telecaller_id) ?? "Unnamed telecaller") : null,
                source: s.attribution_source,
                commissionGenerated: locked.has(s.id),
              };
            }),
          });
        } catch (err) {
          console.error("commissions/attribution-list error:", err);
          return json({ error: err instanceof Error ? err.message : "List failed" }, 500);
        }
      },
    },
  },
});
