import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner, writeTelecallerAudit } from "@/lib/supabase-admin.server";

// POST /api/admin/commissions/assign-telecaller      (OWNER ONLY)
// Body: { subscriptionId, telecallerId: uuid | null }
//
// The attribution checkpoint: the owner links (or unlinks) the
// telecaller who generated a subscriber. Sets attribution_source =
// 'manual' (the one writer of that value). The next reconcile then
// writes ₹80 / ₹20 for that telecaller.
//
// Refused once ANY telecaller commission row exists on the subscription:
// ledger rows are immutable and first_deal is once-ever, so re-pointing
// a sale after pay was generated would orphan money. Fix those by hand.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/admin/commissions/assign-telecaller")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);
        const { db, staffId } = gate.auth;

        let b: { subscriptionId?: unknown; telecallerId?: unknown };
        try {
          b = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const subscriptionId =
          typeof b.subscriptionId === "string" && UUID_RE.test(b.subscriptionId) ? b.subscriptionId : "";
        if (!subscriptionId) return json({ error: "subscriptionId zaroori hai" }, 400);
        const telecallerId =
          b.telecallerId === null
            ? null
            : typeof b.telecallerId === "string" && UUID_RE.test(b.telecallerId)
              ? b.telecallerId
              : undefined;
        if (telecallerId === undefined) return json({ error: "telecallerId sahi nahi hai" }, 400);

        try {
          const { data: sub, error: subErr } = await db
            .from("subscriptions")
            .select("id,telecaller_id")
            .eq("id", subscriptionId)
            .maybeSingle();
          if (subErr) return json({ error: subErr.message }, 500);
          if (!sub) return json({ error: "Subscription nahi mili" }, 404);

          const { count, error: cErr } = await db
            .from("commission_entries")
            .select("id", { count: "exact", head: true })
            .eq("subscription_id", subscriptionId)
            .not("profile_id", "is", null);
          if (cErr) return json({ error: cErr.message }, 500);
          if ((count ?? 0) > 0) {
            return json(
              { error: "Is subscriber par telecaller commission ban chuki hai — ab telecaller badla nahi ja sakta." },
              409,
            );
          }

          if (telecallerId) {
            const { data: prof, error: pErr } = await db
              .from("profiles")
              .select("role")
              .eq("id", telecallerId)
              .maybeSingle();
            if (pErr) return json({ error: pErr.message }, 500);
            if (!prof || prof.role !== "telecaller") {
              return json({ error: "Yeh profile telecaller nahi hai" }, 400);
            }
          }

          const { error: upErr } = await db
            .from("subscriptions")
            .update({
              telecaller_id: telecallerId,
              attribution_source: "manual",
              attributed_at: new Date().toISOString(),
            })
            .eq("id", subscriptionId);
          if (upErr) return json({ error: upErr.message }, 500);

          await writeTelecallerAudit(db, staffId, "admin.commissions.telecaller_assigned", "subscriptions", subscriptionId, {
            from: sub.telecaller_id,
            to: telecallerId,
          });
          return json({ ok: true });
        } catch (err) {
          console.error("commissions/assign-telecaller error:", err);
          return json({ error: err instanceof Error ? err.message : "Assign failed" }, 500);
        }
      },
    },
  },
});
