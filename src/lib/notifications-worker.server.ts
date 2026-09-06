// ─────────────────────────────────────────────────────────────
// PUNYATA — notifications worker (§6.2 of
// SESSION_WHATSAPP_FUNNEL_PROMPT.md)
//
// `notifications` has been write-only since it was created — two
// insert call sites (send-payment-link.ts, mandates.server.ts;
// PLUS two more found during this session's §0 recheck:
// reissue-link.ts and proof-resend.ts — the spec's "exactly two"
// undercounts it, see this session's summary) and ZERO readers. This
// file is the reader. Modelled on mandates.server.ts /
// renew-mandates.ts: same claim-guard idiom, same batch cap, same
// "never skip silently" discipline.
// ─────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "@/lib/whatsapp-send.server";

const MAX_ATTEMPTS = 3;

interface PendingNotification {
  id: string;
  user_id: string;
  to_phone: string | null;
  template_name: string | null;
  template_vars: Record<string, string> | null;
  attempts: number;
  meta: Record<string, unknown> | null;
}

/**
 * §6.2 recipient resolution: to_phone → subscriptions.delivery_phone
 * (via meta.subscription_db_id) → profiles.phone of user_id → failed.
 * Never a silent skip — the caller marks the row failed with a clear
 * last_error when nothing resolves (this is the §10.1/§10.3 fix).
 */
export async function resolveNotificationRecipient(
  db: SupabaseClient,
  notif: PendingNotification,
): Promise<{ phone: string } | { error: string }> {
  if (notif.to_phone) return { phone: notif.to_phone };

  const subscriptionId =
    typeof notif.meta?.subscription_db_id === "string" ? notif.meta.subscription_db_id : null;
  if (subscriptionId) {
    const { data: sub, error } = await db
      .from("subscriptions")
      .select("delivery_phone")
      .eq("id", subscriptionId)
      .maybeSingle();
    if (error) return { error: `subscriptions lookup failed: ${error.message}` };
    if (sub?.delivery_phone) return { phone: sub.delivery_phone };
  }

  const { data: profile, error: profErr } = await db
    .from("profiles")
    .select("phone")
    .eq("id", notif.user_id)
    .maybeSingle();
  if (profErr) return { error: `profiles lookup failed: ${profErr.message}` };
  if (profile?.phone) return { phone: profile.phone };

  return { error: "No phone resolvable (to_phone, delivery_phone, profiles.phone all empty)" };
}

export async function processNotificationBatch(
  db: SupabaseClient,
  batchSize: number,
): Promise<{ processed: number; sent: number; failed: number }> {
  const { data: pending, error: fetchErr } = await db
    .from("notifications")
    .select("id,user_id,to_phone,template_name,template_vars,attempts,meta")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(batchSize);
  if (fetchErr) throw new Error(`notifications fetch failed: ${fetchErr.message}`);

  let sent = 0;
  let failed = 0;

  for (const notif of (pending ?? []) as PendingNotification[]) {
    // Claim guard: two concurrent runs cannot both send this row —
    // same race-guard idiom as send-payment-link.ts's halted-row claim.
    const { data: claimed, error: claimErr } = await db
      .from("notifications")
      .update({ status: "sending" })
      .eq("id", notif.id)
      .eq("status", "pending")
      .select("id");
    if (claimErr) throw new Error(`notifications claim failed: ${claimErr.message}`);
    if (!claimed || claimed.length === 0) continue; // another run claimed it first

    const recipient = await resolveNotificationRecipient(db, notif);
    if ("error" in recipient) {
      await db
        .from("notifications")
        .update({
          status: "failed",
          last_error: recipient.error,
          updated_at: new Date().toISOString(),
        })
        .eq("id", notif.id);
      failed++;
      continue;
    }

    if (!notif.template_name) {
      await db
        .from("notifications")
        .update({
          status: "failed",
          last_error: "No template_name set — cannot send business-initiated message",
          updated_at: new Date().toISOString(),
        })
        .eq("id", notif.id);
      failed++;
      continue;
    }

    const result = await sendWhatsApp(db, {
      toPhone: recipient.phone,
      template: {
        name: notif.template_name,
        templateId: notif.template_name, // Gupshup template id === registered name in our console usage
        vars: Object.values(notif.template_vars ?? {}).map(String),
      },
      profileId: notif.user_id,
    });

    if (result.ok) {
      await db
        .from("notifications")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", notif.id);
      sent++;
    } else {
      const attempts = notif.attempts + 1;
      await db
        .from("notifications")
        .update({
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          last_error: result.error,
          updated_at: new Date().toISOString(),
        })
        .eq("id", notif.id);
      failed++;
    }
  }

  return { processed: (pending ?? []).length, sent, failed };
}
