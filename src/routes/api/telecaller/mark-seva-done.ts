import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { isInCallersTray } from "@/lib/telecaller-data.server";
import { stripMaskedFieldsDeep } from "@/lib/telecaller-logic";

// POST /api/telecaller/mark-seva-done
// Gate: requireTelecaller. Body: { subscription_id, note? }
//
// One-tap "iski seva ho gayi" — writes a seva_completions row for
// this ONE subscriber, independent of the monthly batch/WhatsApp-
// proof pipeline (sankalp_batches → proof_deliveries). Built for
// off-cycle/courtesy sevas that need to show up on her
// /my-subscription "Completed Sevas" count right away, without
// waiting on batch generation + segment assignment + delivery
// confirm-tap. Every mark is attributed (marked_by) and audited.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/telecaller/mark-seva-done")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        let body: { subscription_id?: unknown; note?: unknown };
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

        try {
          // C2: same fail-closed tray rule as the other person-write
          // surfaces — arbitrary uuids cannot be marked.
          const inTray = await isInCallersTray(auth.db, auth.callerId, auth.role !== "telecaller", {
            subscriptionId,
          });
          if (!inTray) return json({ error: "Yeh subscription aapki tray mein nahi hai" }, 403);

          const { data: sub, error: subErr } = await auth.db
            .from("subscriptions")
            .select("id,status")
            .eq("id", subscriptionId)
            .maybeSingle();
          if (subErr) return json({ error: subErr.message }, 500);
          if (!sub) return json({ error: "Subscription not found" }, 404);

          const note =
            typeof body.note === "string" && body.note.trim()
              ? body.note.trim().slice(0, 500)
              : null;

          const { data: inserted, error: insErr } = await auth.db
            .from("seva_completions")
            .insert({ subscription_id: sub.id, marked_by: auth.callerId, note })
            .select("id,completed_at")
            .single();
          if (insErr) return json({ error: insErr.message }, 500);

          await writeTelecallerAudit(
            auth.db,
            auth.callerId,
            "telecaller.seva.marked_done",
            "seva_completions",
            inserted.id as string,
            { subscription_id: sub.id, note },
          );

          return json(
            stripMaskedFieldsDeep({
              ok: true,
              id: inserted.id,
              completedAt: inserted.completed_at,
            }),
          );
        } catch (err) {
          console.error("telecaller/mark-seva-done error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
