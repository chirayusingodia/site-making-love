import { createFileRoute } from "@tanstack/react-router";
import { json, requireUser } from "@/lib/supabase-admin.server";
import { validateCouponForPlan } from "@/lib/coupons.server";

// POST /api/coupons/validate
// Auth: Bearer <supabase access token>
// Body: { code: string, plan_id: string }
//
// Preview-only. Returns whether the coupon applies to this plan for
// this caller plus the computed discount. The charged amount at
// checkout remains the Razorpay plan price until a matching Razorpay
// Offer is linked in the dashboard (see coupons.server.ts note) —
// the response states both numbers so no UI can over-promise.

export const Route = createFileRoute("/api/coupons/validate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return json({ error: "Login required" }, 401);

        let body: { code?: unknown; plan_id?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        if (typeof body?.code !== "string" || typeof body?.plan_id !== "string") {
          return json({ error: "code and plan_id required" }, 400);
        }

        try {
          // Plan lookup via service role (public-read table anyway).
          const plan = await auth.db
            .from("plans")
            .select("id,name,price_paise,is_active")
            .eq("slug", body.plan_id.trim())
            .maybeSingle();
          if (!plan.data?.is_active) {
            return json({ error: "Plan not found" }, 404);
          }

          const decision = await validateCouponForPlan(auth.db, {
            code: body.code,
            planId: plan.data.id,
            planPricePaise: plan.data.price_paise,
            userId: auth.userId,
          });

          if (!decision.ok) {
            const messages: Record<string, string> = {
              not_found: "Coupon code nahi mila.",
              inactive: "Yeh coupon abhi active nahi hai.",
              expired: "Yeh coupon ki validity khatam ho gayi.",
              not_yet_valid: "Yeh coupon abhi valid nahi hua.",
              plan_not_eligible: "Yeh coupon is plan par lagoo nahi hota.",
              redemption_limit: "Is coupon ke redemptions poore ho gaye.",
              not_visible_to_user: "Yeh coupon aapke liye valid nahi hai.",
            };
            return json(
              {
                ok: false,
                rejection: decision.rejection,
                error: messages[decision.rejection ?? "not_found"],
              },
              200,
            );
          }

          return json({
            ok: true,
            code: decision.coupon!.code,
            discountType: decision.coupon!.discount_type,
            discountValue: decision.coupon!.discount_value,
            discountPaise: decision.discountPaise,
            chargePaise: decision.chargePaise,
          });
        } catch (err) {
          console.error("coupon validate error:", err);
          return json({ error: err instanceof Error ? err.message : "Validation failed" }, 500);
        }
      },
    },
  },
});
