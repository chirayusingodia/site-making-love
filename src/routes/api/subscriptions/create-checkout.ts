import { createFileRoute } from "@tanstack/react-router";
import { json, getServiceClient, requireUser } from "@/lib/supabase-admin.server";
import { createCheckoutForUser, CheckoutError } from "@/lib/subscriptions-checkout.server";
import process from "node:process";

// POST /api/subscriptions/create-checkout
// Auth: Bearer <supabase access token> (end user — post-login buy step)
// Body: { plan_id: string (slug or uuid), coupon_code?: string }
//
// Creates the caller's OWN `pending` subscriptions row + the matching
// Razorpay Subscription, links the two, and returns what the frontend
// needs to open Razorpay Checkout. status='active' is NEVER set here —
// activation is webhook-driven only.

export const Route = createFileRoute("/api/subscriptions/create-checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return json({ error: "Login required" }, 401);

        // Name + phone are mandatory before a subscription can be
        // created — /checkout's "Confirm & Pay" is disabled until both
        // are filled, but that's a UI courtesy, not a security boundary.
        // Enforce it here too so a direct API call can't skip identity.
        const { data: identityProfile, error: identityErr } = await auth.db
          .from("profiles")
          .select("full_name,phone")
          .eq("id", auth.userId)
          .maybeSingle();
        if (identityErr) return json({ error: identityErr.message }, 500);
        if (!identityProfile?.full_name?.trim() || !identityProfile?.phone) {
          return json({ error: "Pehle naam aur mobile number bharein." }, 400);
        }

        let body: { plan_id?: unknown; coupon_code?: unknown; att?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        if (typeof body?.plan_id !== "string" || !body.plan_id.trim()) {
          return json({ error: "plan_id required" }, 400);
        }
        const couponCode =
          typeof body?.coupon_code === "string" && body.coupon_code.trim()
            ? body.coupon_code
            : null;

        // §9.1 path 1 — attribution token from a telecaller's payment
        // link (?att=…). Resolves to (telecaller, source agent) and both
        // are stamped write-once on the subscription at creation.
        // §4.2 (Hospitals session): the AGENT stamped is the FIELD agent
        // who sourced the lead (leads.source_agent_id) — never anyone else.
        // A bogus token never blocks the purchase; it attributes nothing.
        let telecallerId: string | null = null;
        let sourcingAgentId: string | null = null;
        if (typeof body?.att === "string" && body.att.trim()) {
          const adminDb = getServiceClient();
          const { data: lead } = await adminDb
            .from("leads")
            .select("id,assigned_to,created_by,source_agent_id")
            .eq("attribution_token", body.att.trim())
            .maybeSingle();
          telecallerId = lead?.assigned_to ?? lead?.created_by ?? null;
          sourcingAgentId = lead?.source_agent_id ?? null;
        }

        try {
          const outcome = await createCheckoutForUser({
            adminDb: getServiceClient(),
            userId: auth.userId,
            planIdOrSlug: body.plan_id.trim(),
            couponCode,
            ...(telecallerId ? { telecallerId } : {}),
            ...(sourcingAgentId ? { salesAgentId: sourcingAgentId } : {}),
          });
          return json({
            ok: true,
            ...outcome,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? null,
          });
        } catch (err) {
          if (err instanceof CheckoutError) {
            return json({ error: err.message }, err.status);
          }
          console.error("create-checkout error:", err);
          return json({ error: err instanceof Error ? err.message : "Checkout failed" }, 500);
        }
      },
    },
  },
});
