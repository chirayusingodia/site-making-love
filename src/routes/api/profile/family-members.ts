import { createFileRoute } from "@tanstack/react-router";
import { json, requireUser } from "@/lib/supabase-admin.server";

// POST /api/profile/family-members
// Auth: Bearer <supabase access token> (end user)
// Body: {
//   subscription_id: string,
//   members: [{ slot_number: 1..4, full_name, gotra?, relation?, dob? }]
// }
//
// Upserts up to 4 family members on ONE of the caller's OWN
// subscriptions. Runs under the caller's JWT so RLS policies
// ("family_members: user inserts/updates own", which join through
// subscriptions.user_id) are the enforcement layer — the route
// additionally pre-reads the subscription through the same scoped
// client to return a clean 404 instead of an RLS violation.
//
// Zero family members remains a VALID subscription state (Sankalp
// Pending) — this endpoint is how a subscriber (or a sales agent
// guiding them over the phone) fills them in later, at which point
// the next live batch generation picks them up automatically.

interface MemberInput {
  slot_number: number;
  full_name: string;
  gotra?: string | null;
  relation?: string | null;
  dob?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/profile/family-members")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return json({ error: "Login required" }, 401);

        let body: { subscription_id?: unknown; members?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const subscriptionId = typeof body.subscription_id === "string" ? body.subscription_id : "";
        if (!UUID_RE.test(subscriptionId)) {
          return json({ error: "subscription_id must be a uuid" }, 400);
        }
        if (!Array.isArray(body.members) || body.members.length === 0 || body.members.length > 4) {
          return json({ error: "1 se 4 members required" }, 400);
        }

        // Normalise + validate BEFORE touching the DB.
        const seen = new Set<number>();
        const rows: Record<string, unknown>[] = [];
        for (const raw of body.members as Record<string, unknown>[]) {
          const slot = typeof raw.slot_number === "number" ? Math.trunc(raw.slot_number) : NaN;
          const name = typeof raw.full_name === "string" ? raw.full_name.trim() : "";
          if (!(slot >= 1 && slot <= 4))
            return json({ error: "slot_number 1-4 hona chahiye" }, 400);
          if (seen.has(slot)) return json({ error: `slot ${slot} duplicate hai` }, 400);
          seen.add(slot);
          if (!name || name.length < 2)
            return json({ error: `Slot ${slot}: naam zaroori hai` }, 400);

          const gotra =
            typeof raw.gotra === "string" && raw.gotra.trim()
              ? raw.gotra.trim().slice(0, 60)
              : null;
          const relation =
            typeof raw.relation === "string" && raw.relation.trim()
              ? raw.relation.trim().slice(0, 40)
              : null;
          let dob: string | null = null;
          if (typeof raw.dob === "string" && raw.dob.trim()) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.dob.trim())) {
              return json({ error: `Slot ${slot}: dob YYYY-MM-DD format mein ho` }, 400);
            }
            dob = raw.dob.trim();
          }

          rows.push({
            subscription_id: subscriptionId,
            slot_number: slot,
            full_name: name.slice(0, 120),
            gotra,
            relation,
            is_primary: slot === 1,
            ...(dob ? { dob } : {}),
          });
        }

        // Ownership gate — same client, so RLS scopes this read too.
        const { data: owned, error: ownErr } = await auth.db
          .from("subscriptions")
          .select("id")
          .eq("id", subscriptionId)
          .maybeSingle();
        if (ownErr) return json({ error: ownErr.message }, 500);
        if (!owned) return json({ error: "Subscription not found" }, 404);

        // Upsert per (subscription_id, slot_number): re-submitting the
        // form edits existing slots in place rather than erroring.
        const { error: upsertErr } = await auth.db
          .from("family_members")
          .upsert(rows, { onConflict: "subscription_id,slot_number" });
        if (upsertErr) return json({ error: upsertErr.message }, 500);

        return json({ ok: true, saved: rows.length });
      },
    },
  },
});
