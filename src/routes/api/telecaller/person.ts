import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller } from "@/lib/supabase-admin.server";
import { fetchPersonCard, isInCallersTray } from "@/lib/telecaller-data.server";
import { stripMaskedFieldsDeep } from "@/lib/telecaller-logic";

// POST /api/telecaller/person
// Gate: requireTelecaller. Body: { subscription_id? , profile_id? , queue? }
//
// The call-card payload (§6.4): allowlisted person/subscription/
// plan-name/payment-status-word fields, full family members, her
// own call history for this person, this month's proof-delivery
// flags, and the auto-advance target in the queue she came from.
// A bare lead is addressed by profile_id (no subscription yet).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/telecaller/person")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        let body: { subscription_id?: unknown; profile_id?: unknown; queue?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const subscriptionId =
          typeof body.subscription_id === "string" && UUID_RE.test(body.subscription_id)
            ? body.subscription_id
            : undefined;
        const profileId =
          typeof body.profile_id === "string" && UUID_RE.test(body.profile_id)
            ? body.profile_id
            : undefined;
        if (!subscriptionId && !profileId) {
          return json({ error: "subscription_id or profile_id required" }, 400);
        }

        try {
          // C2: same fail-closed tray rule as log-call — arbitrary
          // uuids cannot be probed for contact data.
          const inTray = await isInCallersTray(auth.db, auth.callerId, auth.role !== "telecaller", {
            subscriptionId,
            profileId,
          });
          if (!inTray) return json({ error: "Yeh person aapki tray mein nahi hai" }, 403);

          const payload = await fetchPersonCard(auth.db, {
            subscriptionId,
            profileId,
            queue: body.queue,
          });
          if (!payload) return json({ error: "Person not found" }, 404);
          return json(stripMaskedFieldsDeep(payload));
        } catch (err) {
          console.error("telecaller/person error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
