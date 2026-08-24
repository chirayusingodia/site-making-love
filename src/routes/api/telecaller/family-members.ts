import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { isInCallersTray } from "@/lib/telecaller-data.server";
import { validateFamilyMembers } from "@/lib/family-validation";
import { stripMaskedFieldsDeep, TC_FAMILY_COLS } from "@/lib/telecaller-logic";

// POST /api/telecaller/family-members
// Gate: requireTelecaller. Body: { subscription_id, members: [...] }
//
// On-behalf family-member upsert (§5.2). The existing user route
// CANNOT be reused — it is requireUser() + RLS-scoped to the
// caller's own subscriptions. This one runs on the service role,
// validates through the SHARED validator in family-validation.ts
// (same rules, same Hinglish copy), refuses cancelled
// subscriptions, and audits before/after rows.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/telecaller/family-members")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        let body: { subscription_id?: unknown; members?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const subscriptionId =
          typeof body.subscription_id === "string" && UUID_RE.test(body.subscription_id)
            ? body.subscription_id
            : "";
        if (!subscriptionId) return json({ error: "subscription_id must be a uuid" }, 400);

        const validated = validateFamilyMembers(body.members);
        if (!validated.ok) return json({ error: validated.error }, 400);

        try {
          // C2: fail-closed — she edits sankalp names only inside her tray.
          const inTray = await isInCallersTray(auth.db, auth.callerId, auth.role !== "telecaller", {
            subscriptionId,
          });
          if (!inTray) return json({ error: "Yeh subscription aapki tray mein nahi hai" }, 403);

          const { data: sub, error: subErr } = await auth.db
            .from("subscriptions")
            .select("id,user_id,status")
            .eq("id", subscriptionId)
            .maybeSingle();
          if (subErr) return json({ error: subErr.message }, 500);
          if (!sub) return json({ error: "Subscription not found" }, 404);
          if (sub.status === "cancelled") {
            return json(
              { error: "Cancelled subscription par edit nahi hota — owner ko bataayein" },
              409,
            );
          }

          // Prior rows for the audit trail (before).
          const { data: beforeRows, error: beforeErr } = await auth.db
            .from("family_members")
            .select(TC_FAMILY_COLS)
            .eq("subscription_id", subscriptionId)
            .order("slot_number");
          if (beforeErr) return json({ error: beforeErr.message }, 500);

          const rows = validated.value.map((m) => ({
            subscription_id: subscriptionId,
            slot_number: m.slot_number,
            full_name: m.full_name,
            gotra: m.gotra,
            relation: m.relation,
            is_primary: m.slot_number === 1,
            ...(m.dob ? { dob: m.dob } : {}),
          }));

          const { error: upsertErr, data: afterRows } = await auth.db
            .from("family_members")
            .upsert(rows, { onConflict: "subscription_id,slot_number" })
            .select(TC_FAMILY_COLS);
          if (upsertErr) return json({ error: upsertErr.message }, 500);

          // [Bug 3.1] Mirror of the user route: prune slots that fell
          // out of the renumbered list so removed names can't linger
          // as phantom duplicates in the Pandit sankalp list.
          const { error: pruneErr } = await auth.db
            .from("family_members")
            .delete()
            .eq("subscription_id", subscriptionId)
            .gt("slot_number", rows.length);
          if (pruneErr) return json({ error: pruneErr.message }, 500);

          await writeTelecallerAudit(
            auth.db,
            auth.callerId,
            "telecaller.family_members.upsert",
            "family_members",
            subscriptionId,
            { before: beforeRows ?? [], after: afterRows ?? rows },
          );

          return json(stripMaskedFieldsDeep({ ok: true, saved: rows.length }));
        } catch (err) {
          console.error("telecaller/family-members error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
