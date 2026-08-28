import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { getAdapter } from "@/lib/gateways/registry";
import { getCurrentMandate } from "@/lib/mandates.server";

// POST /api/admin/subscriptions/resume
// Gate: requireAdmin (owner or admin). NEVER exposed to telecallers —
// resuming pokes a money-adjacent mandate; her path for a halted
// subscriber is the fresh payment link (Part C), not this.
// Body: { subscription_id }
//
// Asks the gateway to try charging the subscription's CURRENT mandate
// again. This route does NOT touch subscriptions.status: the webhook
// ('subscription.resumed'/'subscription.charged') is the only producer
// of 'active', per razorpay-webhook.server.ts's header discipline. A
// failed resume (dead mandate → gateway 4xx) is returned to the caller
// verbatim so the admin falls back to the reissue-link flow.
//
// GATEWAY NEUTRALITY (migration 022): the mandate carries its own
// gateway, so resume dispatches to whichever provider actually issued
// it — not to whichever is primary today. No failover: resuming is an
// operation on ONE existing mandate at ONE provider; if that mandate is
// dead, the answer is a fresh checkout (reissue-link), not another
// provider poking an id it has never seen.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/admin/subscriptions/resume")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);

        let body: { subscription_id?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const subscriptionId =
          typeof body.subscription_id === "string" && UUID_RE.test(body.subscription_id)
            ? body.subscription_id
            : null;
        if (!subscriptionId) return json({ error: "subscription_id zaroori hai" }, 400);

        const { data: sub, error: subErr } = await auth.db
          .from("subscriptions")
          .select("id,status,user_id")
          .eq("id", subscriptionId)
          .maybeSingle();
        if (subErr) return json({ error: subErr.message }, 500);
        if (!sub) return json({ error: "Subscription not found" }, 404);

        // Not a general "make active" button — only Razorpay's own
        // halted state may be resumed through here.
        if (sub.status !== "halted") {
          return json(
            { error: `Sirf halted subscriptions resume hote hain (current: ${sub.status})` },
            409,
          );
        }
        const mandate = await getCurrentMandate(auth.db, sub.id);
        if (!mandate) {
          return json({ error: "Subscription kisi payment mandate se linked nahi hai" }, 400);
        }

        let adapter;
        try {
          adapter = getAdapter(mandate.gateway);
        } catch {
          return json(
            {
              error: `Is mandate ka gateway (${mandate.gateway}) is build mein supported nahi hai`,
            },
            501,
          );
        }

        try {
          const resumed = await adapter.resumeMandate(mandate.gateway_mandate_id);

          await writeTelecallerAudit(
            auth.db,
            auth.staffId,
            "admin.subscription.resume_attempted",
            "subscriptions",
            sub.id,
            {
              user_id: sub.user_id,
              gateway: mandate.gateway,
              gateway_mandate_id: mandate.gateway_mandate_id,
              result: "ok",
              gateway_status: resumed.status,
              previous_status: sub.status,
            },
          );

          // Status stays untouched here — the webhook flips it to
          // 'active' when the gateway confirms.
          return json({
            ok: true,
            gateway: mandate.gateway,
            gatewayStatus: resumed.status,
            message: "Resume requested — status updates once gateway confirms",
          });
        } catch (err) {
          // Pass the gateway's rejection through verbatim (e.g. dead
          // mandate 400) so the admin knows to fall back to Part C.
          const message = err instanceof Error ? err.message : "Resume call failed";
          await writeTelecallerAudit(
            auth.db,
            auth.staffId,
            "admin.subscription.resume_attempted",
            "subscriptions",
            sub.id,
            {
              user_id: sub.user_id,
              gateway: mandate.gateway,
              gateway_mandate_id: mandate.gateway_mandate_id,
              result: "failed",
              error: message,
              previous_status: sub.status,
            },
          );
          console.error("admin/subscriptions/resume error:", err);
          return json({ error: message }, 502);
        }
      },
    },
  },
});
