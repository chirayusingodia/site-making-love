import { createFileRoute } from "@tanstack/react-router";
import { json, requireUser } from "@/lib/supabase-admin.server";
import { validateFamilyMembers } from "@/lib/family-validation";

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
//
// Validation lives in lib/family-validation.ts — the SAME copy the
// telecaller's on-behalf route uses, so both surfaces can never
// drift apart.

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

        const validated = validateFamilyMembers(body.members);
        if (!validated.ok) return json({ error: validated.error }, 400);
        const rows = validated.value.map((m) => ({
          subscription_id: subscriptionId,
          slot_number: m.slot_number,
          full_name: m.full_name,
          gotra: m.gotra,
          relation: m.relation,
          is_primary: m.slot_number === 1,
          // Absent dob stays ABSENT — an upsert without the key must
          // not wipe a previously saved value.
          ...(m.dob ? { dob: m.dob } : {}),
        }));

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

        // [Bug 3.1] The form renumbers remaining members 1..N after a
        // removal, so any stored slot > N is now a phantom duplicate
        // (it used to surface in the Pandit sankalp list and got its
        // name recited in the puja). Prune everything beyond N — zero
        // members remains a valid state ("Sankalp Pending").
        // RLS: "family_members: user deletes own" (migration 018).
        const { error: pruneErr } = await auth.db
          .from("family_members")
          .delete()
          .eq("subscription_id", subscriptionId)
          .gt("slot_number", rows.length);
        if (pruneErr) return json({ error: pruneErr.message }, 500);

        return json({ ok: true, saved: rows.length });
      },
    },
  },
});
