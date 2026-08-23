import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { isInCallersTray } from "@/lib/telecaller-data.server";
import { stripMaskedFieldsDeep } from "@/lib/telecaller-logic";

// POST /api/telecaller/proof-resend
// Gate: requireTelecaller. Body: { subscription_id, note? }
//
// §7.7 — she cannot upload proofs, but "customer ne is maah ka
// WhatsApp proof nahi mila" previously had NOWHERE to go. This
// creates the task: a notifications row (channel whatsapp, status
// pending) the admin sees in their queue, plus the usual audit row.
// One-to-one request per subscription — no broadcast surface.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/telecaller/proof-resend")({
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
          // C2: fail-closed tray rule, same as the other person surfaces.
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

          const note =
            typeof body.note === "string" && body.note.trim()
              ? body.note.trim().slice(0, 500)
              : null;

          const { error: insErr } = await auth.db.from("notifications").insert({
            user_id: sub.user_id,
            type: "proof_resend_request",
            channel: "whatsapp",
            status: "pending",
            message: `Proof re-send requested${note ? `: ${note}` : ""}`,
            meta: { subscription_id: sub.id, requested_by: auth.callerId },
          });
          if (insErr) return json({ error: insErr.message }, 500);

          await writeTelecallerAudit(
            auth.db,
            auth.callerId,
            "telecaller.proof_resend.requested",
            "notifications",
            sub.id,
            { subscription_id: sub.id, note },
          );

          return json(stripMaskedFieldsDeep({ ok: true }));
        } catch (err) {
          console.error("telecaller/proof-resend error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
