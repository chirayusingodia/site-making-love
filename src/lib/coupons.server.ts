import type { SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────
// PUNYATA — Coupon validation (server-only)
//
// Shared by POST /api/coupons/validate (preview) and the
// create-checkout flow (attribution). Pure decision logic is kept
// separate from the DB read so it stays testable.
//
// MONEY DISCIPLINE (do not hide from the user):
// Razorpay Subscriptions charge the FIXED plan price of the
// dashboard-configured Razorpay Plan. A Punyata coupon therefore
// RECORDS attribution (subscriptions.coupon_id) but does NOT change
// the charged amount unless Chirayu links a matching Razorpay Offer
// to that plan in the dashboard (v3 §9 documents exactly this open
// risk). Callers receive both numbers so no UI can claim a discount
// that was not actually charged.
// ─────────────────────────────────────────────────────────────

export interface CouponRow {
  id: string;
  code: string;
  discount_type: "flat" | "percent";
  discount_value: number;
  applicable_plans: string[] | null;
  visibility: "public" | "private" | "agent";
  is_customer_facing: boolean;
  assigned_to_user_id: string | null;
  max_redemptions: number | null;
  times_redeemed: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
}

export type CouponRejection =
  | "not_found"
  | "inactive"
  | "expired"
  | "not_yet_valid"
  | "plan_not_eligible"
  | "redemption_limit"
  | "not_visible_to_user";

export interface CouponDecision {
  ok: boolean;
  rejection?: CouponRejection;
  coupon?: CouponRow;
  /** Discount computed against the given plan price, capped at it. */
  discountPaise: number;
  /**
   * What the customer will ACTUALLY be charged at checkout:
   * plan price minus discount ONLY when the discount is enforced;
   * today subscriptions always charge the full Razorpay plan price.
   */
  chargePaise: number;
}

/** Pure — no I/O. nowMs lets callers pin "today" (tests). */
export function decideCoupon(input: {
  coupon: CouponRow | null;
  planId: string;
  planPricePaise: number;
  userId: string | null;
  nowMs?: number;
}): CouponDecision {
  const { coupon, planId, planPricePaise, userId } = input;
  const nowMs = input.nowMs ?? Date.now();
  const chargePaise = planPricePaise;

  if (!coupon) return { ok: false, rejection: "not_found", discountPaise: 0, chargePaise };
  if (!coupon.is_active) return { ok: false, rejection: "inactive", discountPaise: 0, chargePaise };
  if (coupon.valid_from && new Date(coupon.valid_from).getTime() > nowMs) {
    return { ok: false, rejection: "not_yet_valid", discountPaise: 0, chargePaise };
  }
  if (coupon.valid_until && new Date(coupon.valid_until).getTime() < nowMs) {
    return { ok: false, rejection: "expired", discountPaise: 0, chargePaise };
  }
  if (
    coupon.applicable_plans !== null &&
    Array.isArray(coupon.applicable_plans) &&
    !coupon.applicable_plans.includes(planId)
  ) {
    return { ok: false, rejection: "plan_not_eligible", discountPaise: 0, chargePaise };
  }
  if (coupon.max_redemptions !== null && coupon.times_redeemed >= coupon.max_redemptions) {
    return { ok: false, rejection: "redemption_limit", discountPaise: 0, chargePaise };
  }

  // Visibility: public+customer-facing coupons are open to all signed-in
  // users; anything narrower must be assigned to THIS user.
  // §2.3 (Hospitals session): the agent-visibility widening is REMOVED —
  // there is no such thing as an agent coupon anymore. A
  // visibility='agent' row now simply fails not_visible_to_user for
  // everyone, which is the correct outcome.
  const publiclyUsable = coupon.visibility === "public" && coupon.is_customer_facing;
  const personallyAssigned = userId !== null && coupon.assigned_to_user_id === userId;
  if (!publiclyUsable && !personallyAssigned) {
    return { ok: false, rejection: "not_visible_to_user", discountPaise: 0, chargePaise };
  }

  const rawDiscount =
    coupon.discount_type === "flat"
      ? Math.round(coupon.discount_value * 100)
      : Math.round((planPricePaise * coupon.discount_value) / 100);
  const discountPaise = Math.max(0, Math.min(rawDiscount, planPricePaise));

  return { ok: true, coupon, discountPaise, chargePaise };
}

/** DB fetch + decision in one call. Codes compare case-insensitively. */
export async function validateCouponForPlan(
  db: SupabaseClient,
  input: {
    code: string;
    planId: string;
    planPricePaise: number;
    userId: string | null;
  },
): Promise<CouponDecision> {
  const code = input.code.trim().toUpperCase();
  if (!code)
    return {
      ok: false,
      rejection: "not_found",
      discountPaise: 0,
      chargePaise: input.planPricePaise,
    };

  const { data, error } = await db
    .from("coupons")
    .select(
      "id,code,discount_type,discount_value,applicable_plans,visibility,is_customer_facing," +
        "assigned_to_user_id,max_redemptions,times_redeemed,valid_from,valid_until,is_active",
    )
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(`coupon lookup failed: ${error.message}`);

  return decideCoupon({
    coupon: (data as CouponRow | null) ?? null,
    planId: input.planId,
    planPricePaise: input.planPricePaise,
    userId: input.userId,
  });
}
