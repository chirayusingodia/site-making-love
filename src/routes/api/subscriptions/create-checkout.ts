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

        let body: { plan_id?: unknown; coupon_code?: unknown };
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

        try {
          const outcome = await createCheckoutForUser({
            adminDb: getServiceClient(),
            userId: auth.userId,
            planIdOrSlug: body.plan_id.trim(),
            couponCode,
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
