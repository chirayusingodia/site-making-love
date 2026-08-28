// ─────────────────────────────────────────────────────────────
// PUNYATA — pending-checkout honesty threshold
//
// Single source of truth for "how long is 'still confirming' honest".
// A genuinely in-flight Razorpay Checkout resolves via webhook within
// seconds to low minutes; past this window a locally-`pending` row is
// treated as ABANDONED rather than "still on the payment sheet":
//   • subscriptions-checkout.server.ts stops blindly re-handing back
//     the same dead razorpay_sub_id (SESSION_STUCK_PENDING_CHECKOUT,
//     Bug A) and instead re-verifies/discards;
//   • my-subscription.tsx switches from grey "Confirming…" to an
//     explicit "Payment complete nahi hua — dobara try karein" state
//     with a retry action (Bug B).
// One number in one place on purpose — never hardcode a second copy.
// ─────────────────────────────────────────────────────────────

export const PENDING_REUSE_WINDOW_MINUTES = 3;

export function pendingCheckoutIsStale(createdAtIso: string | null | undefined): boolean {
  if (!createdAtIso) return true;
  const ts = Date.parse(createdAtIso);
  // Unparseable timestamps count as stale — fail safe, never reuse
  // something we cannot age-verify.
  return Number.isNaN(ts) || Date.now() - ts > PENDING_REUSE_WINDOW_MINUTES * 60_000;
}
