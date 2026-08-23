import process from "node:process";

// ─────────────────────────────────────────────────────────────
// PUNYATA — Razorpay REST helpers (server-only)
//
// Minimal dependency-free client for the Razorpay calls our server
// routes need (Subscriptions API — UPI AutoPay / card auto-debit).
// Env is read PER CALL (module-scope reads break on request-scoped env).
//
// Activation discipline: this module CREATES subscriptions and can
// ask Razorpay to RESUME one; nothing here ever flips
// subscriptions.status — that remains webhook-exclusive.
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
  /** MANDATORY — Razorpay requires total_count (max tenure 100 years).
   *  Callers derive it from totalCountForBillingPeriod(); no silent
   *  default here so a forgotten value fails to compile, never
   *  quietly becomes a short-lived mandate again. */
  totalCount: number;
}): Promise<RazorpaySubscription> {
  return razorpayCall<RazorpaySubscription>("subscriptions", {
    plan_id: input.razorpayPlanId,
    total_count: input.totalCount,
    customer_notify: 0,
    notes: {
      punyata_subscription_id: input.subscriptionDbId,
      ...(input.couponCode ? { coupon_code: input.couponCode } : {}),
    },
  });
}

/**
 * Resumes a halted/paused Razorpay subscription whose mandate is
 * still alive. Endpoint + body verified against Razorpay's current
 * Subscriptions API docs on 2026-08-23:
 *   POST /v1/subscriptions/:id/resume   body {"resume_at":"now"}
 * A dead mandate (expired card / revoked UPI Autopay) rejects with
 * 400 — callers surface that error verbatim and fall back to issuing
 * a fresh checkout link instead of retrying.
 *
 * Activation discipline intact: this only asks Razorpay to try
 * charging again. Our subscriptions.status flips back via the
 * webhook ('subscription.resumed'/'subscription.charged'), never here.
 */
export function resumeRazorpaySubscription(razorpaySubId: string): Promise<RazorpaySubscription> {
  return razorpayCall<RazorpaySubscription>(
    `subscriptions/${encodeURIComponent(razorpaySubId)}/resume`,
    { resume_at: "now" },
  );
}

export interface RazorpayRefund {
  id: string; // rfnd_...
  payment_id: string;
  amount: number; // paise, this refund's amount
  status: string; // 'processed' | 'pending' | 'failed'
  [k: string]: unknown;
}

/**
 * Issues a refund against a captured payment via Razorpay's Payments
 * API: POST /v1/payments/:id/refund.
 *
 * amountPaise omitted = full refund of whatever is still refundable
 * on that payment. Razorpay itself enforces the ceiling (can't refund
 * more than was captured, can't refund an already-fully-refunded
 * payment) and rejects with 400 — callers surface that verbatim
 * rather than trying to pre-validate the same rule twice.
 *
 * Activation/refund discipline: this only ASKS Razorpay to refund.
 * Nothing here ever writes payments.status='refunded' — that remains
 * exclusive to razorpay-webhook.server.ts's 'refund.processed'
 * handler, mirroring how resumeRazorpaySubscription never sets
 * subscriptions.status itself.
 */
export function createRazorpayRefund(input: {
  razorpayPaymentId: string;
  amountPaise?: number;
  notes?: Record<string, string>;
}): Promise<RazorpayRefund> {
  return razorpayCall<RazorpayRefund>(
    `payments/${encodeURIComponent(input.razorpayPaymentId)}/refund`,
    {
      ...(typeof input.amountPaise === "number" ? { amount: input.amountPaise } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    },
  );
}
