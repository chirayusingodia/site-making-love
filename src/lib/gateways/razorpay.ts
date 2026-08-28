import process from "node:process";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  GatewayError,
  type CreateMandateInput,
  type CreateRefundInput,
  type GatewayMandate,
  type GatewayRefund,
  type MandateStatus,
  type PaymentGatewayAdapter,
} from "./types";

// ─────────────────────────────────────────────────────────────
// PUNYATA — Razorpay adapter (server-only)
//
// The ONLY Razorpay client in the product. Replaces the former
// src/lib/razorpay.server.ts: two parallel clients for one provider
// is how retry/timeout/error-classification policy drifts apart.
//
// Speaks the PaymentGatewayAdapter contract, so callers never see a
// Razorpay-shaped response — only normalised mandates and statuses.
// Env is read PER CALL (module-scope reads break on request-scoped
// env in Workers/serverless).
//
// ACTIVATION DISCIPLINE (unchanged, load-bearing): nothing in this
// module ever writes subscriptions.status. It creates, reads, cancels
// and resumes mandates at Razorpay and reports what Razorpay said.
// Only the webhook handler promotes a subscription to 'active'.
// ─────────────────────────────────────────────────────────────

/**
 * Razorpay's hard ceiling on a subscription's computed end_time:
 * 4765046400 = 2120-12-31T00:00:00Z. A FIXED CALENDAR DATE, not a
 * window relative to when the subscription starts — the distinction
 * that broke every checkout on 2026-08-28. Tenure is derived against
 * this by totalCountForTenure(); never hardcode a year count.
 */
export const RAZORPAY_MAX_END_TIME_SECONDS = 4765046400;

/**
 * Razorpay's SEPARATE ceiling on UPI Autopay mandate validity: 30
 * years from creation, enforced on the computed expire_at whenever UPI
 * is a payment method on offer. This is what broke checkout again on
 * 2026-08-28, hours after the end_time fix above landed — the 50-year
 * policy tenure sailed past the 2120 wall with headroom to spare, then
 * hit this unrelated, much tighter, RELATIVE limit the moment a
 * customer picked "UPI - Google Pay":
 *   "expire_at cannot be more than 30 years for upi"
 * UPI is recommended at checkout for every subscription and Razorpay
 * computes one total_count for the whole subscription object, so this
 * cap must be treated as gateway-wide, not UPI-specific — see
 * tenureFitsGatewayCeiling() / totalCountForTenure() in tenure.ts.
 */
export const RAZORPAY_UPI_MAX_TENURE_YEARS = 30;

/**
 * NPCI's ceiling on a UPI Autopay mandate's per-cycle amount: ₹99,999
 * for a general-category merchant. (Lending/insurance/mutual-fund MCCs
 * get ₹2,00,000 instead — Punyata is registered as neither, so the
 * lower figure is the real one.) Exceeding it gets a mandate REJECTED
 * outright, same failure class as RAZORPAY_UPI_MAX_TENURE_YEARS —
 * checked below for the identical reason.
 */
export const RAZORPAY_UPI_MAX_MANDATE_AMOUNT_PAISE = 99_999_00;

/**
 * NPCI's Additional Factor Authentication (AFA) threshold: ₹15,000 per
 * cycle. This one does NOT reject the mandate — a plan priced above it
 * still creates fine — but every debit above it stops being silent:
 * the customer must open their UPI app and enter their PIN for THAT
 * charge, same as a one-off payment. A "recurring" plan priced above
 * this is recurring in name only, so treat it as a pricing constraint,
 * not a gateway error to catch. NOT enforced here — there is nothing
 * to reject — but kept beside the hard ceiling above so both NPCI
 * rules affecting mandate amount live in one place. Re-check this
 * before ever pricing a plan at or above ₹15,000/cycle.
 */
export const RAZORPAY_UPI_AFA_FREE_AMOUNT_PAISE = 15_000_00;

/** A hung gateway must trip the breaker, not hang the request until
 *  the serverless function is killed (which would leave the customer
 *  staring at a spinner and teach us nothing). */
const REQUEST_TIMEOUT_MS = 15_000;

const GATEWAY_ID = "razorpay";

function basicAuthHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new GatewayError(
      GATEWAY_ID,
      "Razorpay keys not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)",
      { retryable: true },
    );
  }
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

/**
 * Decides whether a Razorpay failure justifies failing over to
 * another gateway.
 *
 *   retryable  — 5xx / 429 / timeouts / transport faults (Razorpay is
 *                unwell) and 401/403 (credentials rejected, account
 *                frozen or blocked — EXACTLY the scenario a second
 *                gateway exists for).
 *   NOT        — 4xx request faults (400/404/422). Our payload is
 *                wrong, so every other gateway would reject it the
 *                same way; failing over would only multiply the
 *                error and hide the bug. The 2026-08-28 end_time
 *                rejection was a 400 and correctly lands here.
 */
function isRetryableStatus(httpStatus: number): boolean {
  if (httpStatus === 429) return true;
  if (httpStatus === 401 || httpStatus === 403) return true;
  return httpStatus >= 500;
}

async function razorpayCall<T>(
  path: string,
  body: Record<string, unknown>,
  method: "POST" | "GET" = "POST",
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`https://api.razorpay.com/v1/${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: basicAuthHeader(),
      },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // Network failure, DNS, or our own timeout — provider-side as far
    // as we can tell, so always worth trying the next gateway.
    if (err instanceof GatewayError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new GatewayError(GATEWAY_ID, `Razorpay ${path} unreachable: ${reason}`, {
      retryable: true,
    });
  }

  const data = (await res.json().catch(() => null)) as
    (T & { error?: { description?: string } }) | null;

  if (!res.ok || !data) {
    const desc = data?.error?.description ?? `HTTP ${res.status}`;
    throw new GatewayError(GATEWAY_ID, `Razorpay ${path} failed: ${desc}`, {
      retryable: isRetryableStatus(res.status),
      httpStatus: res.status,
    });
  }
  return data;
}

interface RazorpaySubscriptionResponse {
  id?: string;
  status?: string;
  customer_id?: string;
  short_url?: string;
  [k: string]: unknown;
}

/**
 * Razorpay's subscription statuses map 1:1 onto our normalised
 * vocabulary, which is why the map reads as an identity — it is not
 * redundant: it is the assertion that we have checked, and the place
 * a future provider-side addition gets handled.
 *
 * UNKNOWN statuses deliberately normalise to 'pending' — a LIVE
 * status. Downstream, live mandates are PRESERVED (never auto-
 * cancelled) while terminal ones get discarded, so guessing "live"
 * fails safe: at worst we keep an object that needed retiring. Had
 * the default been 'created', an unrecognised-but-working mandate
 * would be cancelled out from under a paying customer.
 */
const STATUS_MAP: Record<string, MandateStatus> = {
  created: "created",
  authenticated: "authenticated",
  active: "active",
  pending: "pending",
  halted: "halted",
  paused: "paused",
  cancelled: "cancelled",
  completed: "completed",
  expired: "expired",
};

export function normalizeRazorpayStatus(raw: string | undefined | null): MandateStatus {
  if (!raw) return "pending";
  const mapped = STATUS_MAP[raw];
  if (mapped) return mapped;
  console.warn(
    `razorpay: unrecognised subscription status "${raw}" — treating as live ('pending') so it is preserved rather than cancelled`,
  );
  return "pending";
}

function toGatewayMandate(res: RazorpaySubscriptionResponse): GatewayMandate {
  if (!res.id) {
    throw new GatewayError(GATEWAY_ID, "Razorpay returned a subscription with no id", {
      retryable: true,
    });
  }
  return {
    gateway: GATEWAY_ID,
    gatewayMandateId: res.id,
    gatewayCustomerId: typeof res.customer_id === "string" ? res.customer_id : null,
    status: normalizeRazorpayStatus(typeof res.status === "string" ? res.status : null),
    shortUrl: typeof res.short_url === "string" ? res.short_url : null,
  };
}

export const razorpayAdapter: PaymentGatewayAdapter = {
  id: GATEWAY_ID,
  displayName: "Razorpay",
  maxEndTimeSeconds: RAZORPAY_MAX_END_TIME_SECONDS,
  maxRelativeTenureYears: RAZORPAY_UPI_MAX_TENURE_YEARS,
  maxRecurringAmountPaise: RAZORPAY_UPI_MAX_MANDATE_AMOUNT_PAISE,
  checkoutStrategy: "razorpay_sdk",

  isConfigured() {
    return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  },

  publicKey() {
    return process.env.RAZORPAY_KEY_ID ?? null;
  },

  /**
   * Creates a Razorpay Subscription against a dashboard-configured
   * Razorpay Plan. customer_notify=0: OUR frontend opens Razorpay
   * Checkout with the returned id (prefilled name/phone), which
   * handles mandate setup + first charge.
   *
   * notes ride through to every webhook payload so support can trace
   * a Razorpay subscription back to its Punyata rows.
   */
  async createMandate(input: CreateMandateInput): Promise<GatewayMandate> {
    if (!Number.isInteger(input.totalCount) || input.totalCount < 1) {
      // Non-retryable on purpose: a bad tenure is OUR bug and every
      // gateway would reject it. Failing over would bury it.
      throw new GatewayError(
        GATEWAY_ID,
        `refusing to create a mandate with total_count=${input.totalCount}`,
        { retryable: false },
      );
    }
    const res = await razorpayCall<RazorpaySubscriptionResponse>("subscriptions", {
      plan_id: input.gatewayPlanId,
      total_count: input.totalCount,
      customer_notify: 0,
      notes: {
        punyata_subscription_id: input.subscriptionDbId,
        ...(input.mandateDbId ? { punyata_mandate_id: input.mandateDbId } : {}),
        ...(input.couponCode ? { coupon_code: input.couponCode } : {}),
      },
    });
    return toGatewayMandate(res);
  },

  /**
   * Read-only reconnaissance. An abandoned checkout sheet stays
   * `created` on Razorpay's side forever and fires ZERO webhooks, so
   * local status alone can never tell us whether a mandate is worth
   * reopening — this is how we ask.
   */
  async fetchMandate(gatewayMandateId: string): Promise<GatewayMandate> {
    const res = await razorpayCall<RazorpaySubscriptionResponse>(
      `subscriptions/${encodeURIComponent(gatewayMandateId)}`,
      {},
      "GET",
    );
    return toGatewayMandate(res);
  },

  /**
   * Retires a mandate at Razorpay. Callers treat this as best-effort
   * cleanup: a failed cancel only leaves the same orphan that would
   * have existed anyway.
   */
  async cancelMandate(gatewayMandateId: string): Promise<void> {
    await razorpayCall<RazorpaySubscriptionResponse>(
      `subscriptions/${encodeURIComponent(gatewayMandateId)}/cancel`,
      { cancel_at_cycle_end: false },
    );
  },

  /**
   * Asks Razorpay to charge a halted/paused mandate again.
   * POST /v1/subscriptions/:id/resume {"resume_at":"now"}.
   * A dead mandate (expired card / revoked UPI Autopay) rejects with
   * 400 — surfaced verbatim so callers fall back to issuing a fresh
   * checkout link instead of retrying.
   */
  async resumeMandate(gatewayMandateId: string): Promise<GatewayMandate> {
    const res = await razorpayCall<RazorpaySubscriptionResponse>(
      `subscriptions/${encodeURIComponent(gatewayMandateId)}/resume`,
      { resume_at: "now" },
    );
    return toGatewayMandate(res);
  },

  /**
   * POST /v1/payments/:id/refund. amountPaise omitted = full refund
   * of whatever is still refundable. Razorpay enforces the ceiling
   * itself and rejects with 400; callers surface that verbatim rather
   * than duplicating the rule.
   *
   * Refund discipline: this only ASKS. payments.status='refunded' is
   * written exclusively by the 'refund.processed' webhook handler.
   */
  async createRefund(input: CreateRefundInput): Promise<GatewayRefund> {
    const res = await razorpayCall<{
      id?: string;
      payment_id?: string;
      amount?: number;
      status?: string;
    }>(`payments/${encodeURIComponent(input.gatewayPaymentId)}/refund`, {
      ...(typeof input.amountPaise === "number" ? { amount: input.amountPaise } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    });
    if (!res.id) {
      throw new GatewayError(GATEWAY_ID, "Razorpay returned a refund with no id", {
        retryable: true,
      });
    }
    return {
      gateway: GATEWAY_ID,
      gatewayRefundId: res.id,
      gatewayPaymentId: res.payment_id ?? input.gatewayPaymentId,
      amountPaise: typeof res.amount === "number" ? res.amount : (input.amountPaise ?? 0),
      status: res.status ?? "unknown",
    };
  },

  /**
   * Verifies X-Razorpay-Signature against the RAW body. Secret comes
   * from RAZORPAY_WEBHOOK_SECRET; the comparison itself lives in the
   * exported pure function below so there is exactly ONE copy of this
   * logic in the product.
   */
  verifyWebhookSignature(rawBody: string, headers: Headers): boolean {
    return verifyRazorpayWebhookSignature(
      rawBody,
      headers.get("x-razorpay-signature"),
      process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
    );
  },
};

/**
 * HMAC-SHA256 of the RAW request body, hex-encoded, compared to the
 * signature header with timingSafeEqual — never ===. Returns false
 * (never throws) on a missing signature/secret, a length mismatch, or
 * a digest mismatch.
 *
 * Exported as a pure function so it is unit-testable without a
 * Request (scratch/verify_webhook.ts) and so the adapter method above
 * stays a one-line delegation rather than a second implementation.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
