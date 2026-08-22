import process from "node:process";

// ─────────────────────────────────────────────────────────────
// PUNYATA — Razorpay REST helpers (server-only)
//
// Minimal dependency-free client for the two calls create-checkout
// needs (Subscriptions API — UPI AutoPay / card auto-debit). Env is
// read PER CALL (module-scope reads break on request-scoped env).
//
// Activation discipline: this module only CREATES Razorpay
// subscriptions. Nothing here ever flips subscriptions.status —
// that remains webhook-exclusive.
// ─────────────────────────────────────────────────────────────

export interface RazorpaySubscription {
  id: string;
  status: string;
  customer_id?: string;
  short_url?: string;
  [k: string]: unknown;
}

function basicAuthHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay keys not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)");
  }
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

async function razorpayCall<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: basicAuthHeader(),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as
    (T & { error?: { description?: string } }) | null;
  if (!res.ok || !data) {
    const desc = data?.error?.description ?? `HTTP ${res.status}`;
    throw new Error(`Razorpay ${path} failed: ${desc}`);
  }
  return data;
}

/**
 * Creates a Razorpay Subscription against a dashboard-configured
 * Razorpay Plan. customer_notify=0: OUR frontend opens Razorpay
 * Checkout with the returned subscription id (prefilled name/phone),
 * which handles mandate setup + first charge.
 *
 * notes ride through to every webhook payload so support can trace
 * a Razorpay subscription back to its Punyata row.
 */
export function createRazorpaySubscription(input: {
  razorpayPlanId: string;
  subscriptionDbId: string;
  couponCode: string | null;
  totalCount?: number;
}): Promise<RazorpaySubscription> {
  return razorpayCall<RazorpaySubscription>("subscriptions", {
    plan_id: input.razorpayPlanId,
    total_count: input.totalCount ?? 12,
    customer_notify: 0,
    notes: {
      punyata_subscription_id: input.subscriptionDbId,
      ...(input.couponCode ? { coupon_code: input.couponCode } : {}),
    },
  });
}
