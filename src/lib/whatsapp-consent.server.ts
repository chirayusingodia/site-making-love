// ─────────────────────────────────────────────────────────────
// PUNYATA — WhatsApp consent (§3.4 of SESSION_WHATSAPP_FUNNEL_PROMPT.md)
//
// Nothing in this codebase recorded WhatsApp opt-in/opt-out before
// this session. Hospital-sourced leads never opted in; sending
// business-initiated templates to un-consented numbers drives
// block/report rates, which is what Meta uses to set the WABA's
// quality rating — a degraded rating cuts the daily send limit for
// EVERY subscriber, not just the new ones. One bad batch can degrade
// the whole channel. Enforced in sendWhatsApp() (one gate, impossible
// to forget at a call site), not repeated at every caller.
// ─────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ConsentState {
  optedIn: boolean;
  optedOut: boolean;
}

export async function getConsentState(
  db: SupabaseClient,
  opts: { profileId?: string | null; phone?: string | null },
): Promise<ConsentState> {
  if (!opts.profileId && !opts.phone) return { optedIn: false, optedOut: false };
  let query = db.from("profiles").select("wa_opt_in_at,wa_opt_out_at");
  query = opts.profileId ? query.eq("id", opts.profileId) : query.eq("phone", opts.phone as string);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`profiles consent lookup failed: ${error.message}`);
  return {
    optedIn: Boolean(data?.wa_opt_in_at),
    optedOut: Boolean(data?.wa_opt_out_at),
  };
}

/** §3.4.2 — telecall / website / inbound_message are the three
 *  legitimate ways consent is recorded. Idempotent: re-recording
 *  consent for an already-opted-in profile just refreshes the
 *  timestamp/source, it never errors. */
export async function recordOptIn(
  db: SupabaseClient,
  profileId: string,
  source: "telecall" | "website" | "inbound_message",
): Promise<void> {
  const { error } = await db
    .from("profiles")
    .update({ wa_opt_in_at: new Date().toISOString(), wa_opt_in_source: source })
    .eq("id", profileId);
  if (error) throw new Error(`profiles opt-in write failed: ${error.message}`);
}

export async function recordOptOut(db: SupabaseClient, profileId: string): Promise<void> {
  const { error } = await db
    .from("profiles")
    .update({ wa_opt_out_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) throw new Error(`profiles opt-out write failed: ${error.message}`);
}

// §3.4.3 — case- and whitespace-insensitive. Devanagari entries are
// exact strings (Hindi has no case), matched after trim only.
const OPT_OUT_KEYWORDS = ["stop", "band", "band karo", "band kariye", "unsubscribe", "हटाओ", "बंद"];

/** Pure — matches inbound free text against the opt-out keyword list.
 *  Whitespace-insensitive means collapsed-and-trimmed, not "ignore all
 *  spaces", so "band karo" still matches as a phrase. */
export function isOptOutMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalised = text.trim().toLowerCase().replace(/\s+/g, " ");
  return OPT_OUT_KEYWORDS.some((kw) => normalised === kw.toLowerCase());
}
