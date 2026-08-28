import type { BillingPeriod } from "./tenure";

// ─────────────────────────────────────────────────────────────
// PUNYATA — Payment gateway abstraction (server-only contracts)
//
// WHY THIS LAYER EXISTS
// Razorpay used to be welded into the subscription row itself
// (subscriptions.razorpay_sub_id). A blocked account, a compliance
// freeze, or an outage meant Punyata could sell nothing and had
// nowhere to record a mandate raised elsewhere. Every gateway now
// implements this one interface; the rest of the product speaks only
// this vocabulary and never names a provider.
//
// WHAT IS AND ISN'T ABSTRACTED
//   Abstracted  — OUTBOUND calls (create/fetch/cancel/resume/refund),
//                 the normalised status vocabulary, the calendar
//                 ceiling, and webhook signature verification. This is
//                 where failover has to happen, so this is what the
//                 registry can retry across providers.
//   NOT abstracted — inbound webhook PAYLOAD shapes. Those are
//                 irreducibly provider-specific, so each gateway keeps
//                 its own parser + its own route; they all converge by
//                 writing the same normalised rows. Pretending one
//                 payload schema fits every provider is how financial
//                 edge cases get silently dropped.
// ─────────────────────────────────────────────────────────────

export type GatewayId = string;

/**
 * The ONE status vocabulary the product understands. Every adapter
 * maps its provider's words onto this list, so no consumer anywhere
 * branches per-gateway. Mirrors the CHECK constraint on
 * subscription_mandates.status — keep the two in lockstep.
 */
export type MandateStatus =
  | "created" // raised, customer has not authorised it yet
  | "authenticated" // mandate approved, first charge not settled
  | "active" // charging normally
  | "pending" // a charge failed; provider is retrying
  | "halted" // provider gave up retrying
  | "paused"
  | "cancelled"
  | "completed" // all cycles consumed — tenure served out
  | "expired";

/** Statuses in which a mandate may still yield money. */
export const LIVE_MANDATE_STATUSES: readonly MandateStatus[] = [
  "authenticated",
  "active",
  "pending",
  "halted",
];

/** Statuses from which a mandate will never charge again. */
export const TERMINAL_MANDATE_STATUSES: readonly MandateStatus[] = [
  "cancelled",
  "completed",
  "expired",
];

export function isLiveMandateStatus(status: MandateStatus): boolean {
  return LIVE_MANDATE_STATUSES.includes(status);
}

export function isTerminalMandateStatus(status: MandateStatus): boolean {
  return TERMINAL_MANDATE_STATUSES.includes(status);
}

// ─── Normalised results ──────────────────────────────────────

export interface GatewayMandate {
  gateway: GatewayId;
  gatewayMandateId: string;
  gatewayCustomerId: string | null;
  status: MandateStatus;
  /** Provider-hosted payment page, when the provider offers one. */
  shortUrl: string | null;
}

export interface GatewayRefund {
  gateway: GatewayId;
  gatewayRefundId: string;
  gatewayPaymentId: string;
  amountPaise: number;
  status: string;
}

export interface CreateMandateInput {
  /** This plan's id AT THIS GATEWAY (plan_gateway_refs.gateway_plan_id). */
  gatewayPlanId: string;
  /** Punyata subscriptions.id — rides along so every webhook payload
   *  can be traced back to a local row by support. */
  subscriptionDbId: string;
  /** Punyata subscription_mandates.id, when known at creation time. */
  mandateDbId?: string | null;
  couponCode?: string | null;
  /** Debit cycles. Callers MUST derive this from totalCountForTenure() —
   *  never a literal (that is precisely the 2026-08-28 bug). */
  totalCount: number;
}

export interface CreateRefundInput {
  gatewayPaymentId: string;
  /** Omit for "refund everything still refundable". */
  amountPaise?: number;
  notes?: Record<string, string>;
}

/**
 * Thrown by adapters so the registry can tell "this gateway is
 * broken, try the next one" apart from "this request was invalid, and
 * every gateway will reject it identically".
 */
export class GatewayError extends Error {
  readonly gateway: GatewayId;
  /** true = provider-side/transport fault → worth failing over.
   *  false = our request was bad (unknown plan, bad amount, tenure out
   *  of range) → failing over would just reproduce the same error. */
  readonly retryable: boolean;
  /**
   * Whether this failure should count toward the gateway's circuit
   * breaker. Defaults to true.
   *
   * Set false for "this gateway cannot serve THIS request, but it is
   * perfectly healthy" — e.g. its calendar ceiling leaves no room for
   * a legal mandate tenure. Such a case must fail over WITHOUT
   * penalising the provider, or a routine unsupported-request would
   * eventually trip the breaker on a working gateway and take it out
   * of rotation for everyone.
   */
  readonly countsAgainstHealth: boolean;
  readonly httpStatus: number | null;

  constructor(
    gateway: GatewayId,
    message: string,
    opts: {
      retryable: boolean;
      httpStatus?: number | null;
      countsAgainstHealth?: boolean;
    } = { retryable: true },
  ) {
    super(message);
    this.name = "GatewayError";
    this.gateway = gateway;
    this.retryable = opts.retryable;
    this.countsAgainstHealth = opts.countsAgainstHealth ?? true;
    this.httpStatus = opts.httpStatus ?? null;
  }
}

// ─── The interface every gateway implements ──────────────────

export interface PaymentGatewayAdapter {
  readonly id: GatewayId;
  readonly displayName: string;

  /**
   * The provider's absolute ceiling on a mandate's computed end_time,
   * in unix SECONDS — or null when the provider has none. A PROVIDER
   * FACT, deliberately living in code beside the calls it constrains
   * rather than in a config row that can drift out of sync with the
   * API it describes.
   */
  readonly maxEndTimeSeconds: number | null;

  /** False when this deployment lacks the provider's credentials. A
   *  gateway that cannot be called must never be selected. */
  isConfigured(): boolean;

  /** Public/publishable key handed to the browser SDK, if any. */
  publicKey(): string | null;

  /** Tells the frontend which checkout SDK to drive. */
  readonly checkoutStrategy: "razorpay_sdk" | "hosted_redirect";

  createMandate(input: CreateMandateInput): Promise<GatewayMandate>;
  fetchMandate(gatewayMandateId: string): Promise<GatewayMandate>;
  cancelMandate(gatewayMandateId: string): Promise<void>;
  resumeMandate(gatewayMandateId: string): Promise<GatewayMandate>;
  createRefund(input: CreateRefundInput): Promise<GatewayRefund>;

  /** Verifies an inbound webhook against the provider's scheme. */
  verifyWebhookSignature(rawBody: string, headers: Headers): boolean;
}

export type { BillingPeriod };
