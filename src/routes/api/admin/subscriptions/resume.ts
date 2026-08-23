import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { resumeRazorpaySubscription } from "@/lib/razorpay.server";

// POST /api/admin/subscriptions/resume
// Gate: requireAdmin (owner or admin). NEVER exposed to telecallers —
// resuming pokes a money-adjacent mandate; her path for a halted
// subscriber is the fresh payment link (Part C), not this.
// Body: { subscription_id }
//
// Asks Razorpay to try charging again on an existing mandate
// (POST /v1/subscriptions/:id/resume {"resume_at":"now"}, docs
// verified 2026-08-23). This route does NOT touch subscriptions.status:
// the webhook ('subscription.resumed'/'subscription.charged') is the
// only producer of 'active', per razorpay-webhook.server.ts's header
// discipline. A failed resume (dead mandate → Razorpay 400) is
// returned to the caller verbatim so the admin falls back to the
// reissue-link flow.

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
          .select("id,status,razorpay_sub_id,user_id")
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
        if (!sub.razorpay_sub_id) {
          return json({ error: "Subscription Razorpay se linked nahi hai" }, 400);
        }

        try {
          const rzp = await resumeRazorpaySubscription(sub.razorpay_sub_id);

          await writeTelecallerAudit(
            auth.db,
            auth.staffId,
            "admin.subscription.resume_attempted",
            "subscriptions",
            sub.id,
            {
              user_id: sub.user_id,
              razorpay_sub_id: sub.razorpay_sub_id,
              result: "ok",
              razorpay_status: rzp.status ?? null,
              previous_status: sub.status,
            },
          );

          // Status stays untouched here — the webhook flips it to
          // 'active' when Razorpay confirms.
          return json({
            ok: true,
            razorpayStatus: rzp.status ?? null,
            message: "Resume requested — status updates once Razorpay confirms",
          });
        } catch (err) {
          // Pass Razorpay's rejection through verbatim (e.g. dead
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
              razorpay_sub_id: sub.razorpay_sub_id,
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
