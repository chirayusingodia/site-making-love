// ─────────────────────────────────────────────────────────────
// PUNYATA — WhatsApp 24-hour customer-service-window rule
//
// Meta enforces this on India numbers (WhatsApp Business Platform):
// a free-form ("session") message is legal ONLY inside the 24h
// window opened by the customer's most recent inbound message.
// Outside that window every send MUST be an approved template.
// This is §1.3 / §6.1 of SESSION_WHATSAPP_FUNNEL_PROMPT.md — a
// legal/policy constraint, enforced in code, not documentation.
//
// Pure function: given "when did the customer last write to us"
// and "now", decide if a free-form send is currently legal. The
// caller (whatsapp-send.server.ts) is responsible for looking up
// the most recent inbound wa_messages row and passing its
// created_at here — this file has no DB access on purpose, so it
// stays trivially unit-testable.
// ─────────────────────────────────────────────────────────────

export const WHATSAPP_SESSION_WINDOW_HOURS = 24;

export function isWithinSessionWindow(
  lastInboundAtIso: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!lastInboundAtIso) return false;
  const ts = Date.parse(lastInboundAtIso);
  // Unparseable timestamp counts as "no window" — fail safe, never
  // allow a free-form send on a value we cannot age-verify.
  if (Number.isNaN(ts)) return false;
  const ageMs = nowMs - ts;
  if (ageMs < 0) return false; // clock skew / future timestamp: refuse
  return ageMs < WHATSAPP_SESSION_WINDOW_HOURS * 60 * 60 * 1000;
}
