// ─────────────────────────────────────────────────────────────
// PUNYATA — signup Flow submission processing (§7.3 of
// SESSION_WHATSAPP_FUNNEL_PROMPT.md)
//
// Field names below are OURS to define — this project authors the
// static Flow JSON (whatsapp/flows/signup.flow.json) and therefore
// controls each component's `name`, which is exactly the key it
// appears under in the parsed response_json. Keep the two files in
// sync: fm{1..4}_name/_gotra/_relation, address_line1/_line2/state/
// pincode, delivery_phone, full_name, gotra.
//
// §7.3 order, do not reorder:
//   1. resolve identity (whatsapp-identity.server.ts)
//   2. validateFamilyMembers() — on failure, ask to retry, never
//      persist a half-valid family set
//   3. upsert profiles (name, address; never overwrite phone)
//   4. createCheckoutForUser() — the ONE checkout creator, no
//      parallel path
//   5. write family_members + delivery_phone on the new subscription
//   6. queue punyata_payment_link into notifications
// ─────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateFamilyMembers } from "@/lib/family-validation";
import { normalizePhoneForWa } from "@/lib/sankalp-logic";
import {
  copyFamilyMembers,
  createOrAdoptWhatsAppProfile,
  resolveWhatsAppIdentity,
} from "@/lib/whatsapp-identity.server";
import { createCheckoutForUser, resolveActivePlan } from "@/lib/subscriptions-checkout.server";
import { sendWhatsApp } from "@/lib/whatsapp-send.server";
import { isOptOutMessage, recordOptIn, recordOptOut } from "@/lib/whatsapp-consent.server";

// §6.3 template button ids — OURS to define when submitting
// punyata_returning_confirm to the Gupshup console. Keep in sync with
// whatever the console actually assigns; if Gupshup auto-generates
// ids instead of honouring ours, read the real ids back from one live
// template send/reply round-trip and update these two constants.
export const RETURNING_CONFIRM_KEEP_BUTTON_ID = "keep_family";
export const RETURNING_CONFIRM_CHANGE_BUTTON_ID = "change_family";

interface FlowReplyDispatch {
  waId: string;
  response: Record<string, unknown>;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * §8.3 — resolve the lead the same way create-checkout.ts:67-76
 * already does: lead → assigned_to/created_by = telecaller,
 * source_agent_id = field agent. A bogus/missing token never blocks
 * the submission; it just attributes nothing.
 */
async function resolveAttribution(
  db: SupabaseClient,
  flowToken: string | null,
): Promise<{
  telecallerId: string | null;
  sourcingAgentId: string | null;
  leadId: string | null;
  interestedPlanId: string | null;
}> {
  if (!flowToken)
    return { telecallerId: null, sourcingAgentId: null, leadId: null, interestedPlanId: null };
  const { data: lead } = await db
    .from("leads")
    .select("id,assigned_to,created_by,source_agent_id,interested_plan_id")
    .eq("attribution_token", flowToken)
    .maybeSingle();
  return {
    telecallerId: lead?.assigned_to ?? lead?.created_by ?? null,
    sourcingAgentId: lead?.source_agent_id ?? null,
    leadId: lead?.id ?? null,
    interestedPlanId: lead?.interested_plan_id ?? null,
  };
}

export async function processFlowSubmission(
  db: SupabaseClient,
  dispatch: FlowReplyDispatch,
): Promise<void> {
  const { waId, response } = dispatch;
  const flowToken = str(response.flow_token);

  // ── 1. Resolve identity ──
  const identity = await resolveWhatsAppIdentity(db, waId);
  const fullName = str(response.full_name) ?? "";

  let profileId: string;
  if (identity.kind === "new") {
    profileId = await createOrAdoptWhatsAppProfile(db, identity.phone, fullName);
  } else {
    profileId = identity.profileId;
  }

  // §3.4.2 — messaging us first IS consent. Stamped here rather than
  // in the webhook dispatcher because a brand-new customer has no
  // profileId until identity resolution/creation just above runs.
  await recordOptIn(db, profileId, "inbound_message");

  // ── 2. Validate family members — never persist a half-valid set ──
  const members = [];
  for (let slot = 1; slot <= 4; slot++) {
    const name = str(response[`fm${slot}_name`]);
    if (!name) continue;
    members.push({
      slot_number: slot,
      full_name: name,
      gotra: str(response[`fm${slot}_gotra`]),
      relation: str(response[`fm${slot}_relation`]),
      dob: null,
    });
  }
  const validated = validateFamilyMembers(members);
  if (!validated.ok) {
    // Within the session window (the customer just submitted the
    // Flow), so a free-form retry ask is legal — no approved template
    // needed for this one.
    await sendWhatsApp(db, {
      toPhone: waId,
      text: `${validated.error} — dobara try karein 🙏`,
      profileId,
    });
    return;
  }

  // ── 3. Upsert profiles (name, address; NEVER phone) ──
  const addressPatch: Record<string, unknown> = {};
  if (fullName) addressPatch.full_name = fullName;
  const addressLine1 = str(response.address_line1);
  if (addressLine1) {
    addressPatch.address_line1 = addressLine1;
    addressPatch.address_line2 = str(response.address_line2);
    addressPatch.state = str(response.state);
    addressPatch.pincode = str(response.pincode);
  }
  if (Object.keys(addressPatch).length > 0) {
    addressPatch.updated_at = new Date().toISOString();
    const { error: profErr } = await db.from("profiles").update(addressPatch).eq("id", profileId);
    if (profErr) throw new Error(`profiles update failed: ${profErr.message}`);
  }

  // ── attribution + plan ──
  const attribution = await resolveAttribution(db, flowToken);
  if (!attribution.interestedPlanId) {
    await sendWhatsApp(db, {
      toPhone: waId,
      text: "Plan detail nahi mil paayi — hamari team aapko call karegi 🙏",
      profileId,
    });
    await db.from("audit_logs").insert({
      admin_id: null,
      action: "whatsapp.flow.no_plan_resolved",
      entity: "leads",
      entity_id: attribution.leadId,
      meta: { flow_token: flowToken ? `${flowToken.slice(0, 8)}…` : null },
    });
    return;
  }
  const plan = await resolveActivePlan(db, attribution.interestedPlanId);
  if (!plan) {
    await sendWhatsApp(db, {
      toPhone: waId,
      text: "Plan abhi available nahi hai — team call karegi 🙏",
      profileId,
    });
    return;
  }

  // ── 4. createCheckoutForUser — the ONE checkout creator ──
  //
  // §7.3's double-submission guard ("a customer can tap the Flow
  // button twice... check for an existing pending subscription for
  // the resolved profile and reuse it, the same reuse path as §10.2")
  // is satisfied BY createCheckoutForUser itself: it already looks up
  // `existingPending` by user_id + plan_id before creating a row, and
  // reuses it when found and not stale (subscriptions-checkout.server.ts
  // ~line 230). Do not add a second, parallel pending-lookup here —
  // that would be exactly the "second checkout creator" §11 forbids.
  const outcome = await createCheckoutForUser({
    adminDb: db,
    userId: profileId,
    planIdOrSlug: plan.id,
    acquisitionChannel: "whatsapp",
    salesAgentId: attribution.sourcingAgentId,
    telecallerId: attribution.telecallerId,
  });

  // ── 5. family_members + delivery_phone on the new subscription ──
  const deliveryPhoneRaw = str(response.delivery_phone);
  const deliveryPhone = deliveryPhoneRaw ? normalizePhoneForWa(deliveryPhoneRaw) : null;
  if (deliveryPhone) {
    await db
      .from("subscriptions")
      .update({ delivery_phone: deliveryPhone })
      .eq("id", outcome.subscriptionDbId);
  }
  const familyRows = validated.value.map((m) => ({
    subscription_id: outcome.subscriptionDbId,
    slot_number: m.slot_number,
    full_name: m.full_name,
    gotra: m.gotra,
    relation: m.relation,
    is_primary: m.slot_number === 1,
    ...(m.dob ? { dob: m.dob } : {}),
  }));
  if (familyRows.length > 0) {
    const { error: fmErr } = await db
      .from("family_members")
      .upsert(familyRows, { onConflict: "subscription_id,slot_number" });
    if (fmErr) throw new Error(`family_members insert failed: ${fmErr.message}`);
  }

  // ── 6. Queue punyata_payment_link ──
  const { error: notifErr } = await db.from("notifications").insert({
    user_id: profileId,
    type: "payment_link_sent",
    channel: "whatsapp",
    status: "pending",
    message: `Plan: ${plan.name}`,
    to_phone: deliveryPhone ?? waId,
    template_name: "punyata_payment_link",
    template_vars: { plan_name: plan.name, subscription_id: outcome.subscriptionDbId },
    meta: {
      subscription_db_id: outcome.subscriptionDbId,
      plan_slug: plan.id,
      source: "whatsapp_flow",
    },
  });
  if (notifErr) throw new Error(`notifications insert failed: ${notifErr.message}`);
}

/**
 * §8.2 — a returning customer's reply to punyata_returning_confirm's
 * two buttons. Correlated to a lead (and therefore a plan) via the
 * most recent OUTBOUND wa_messages row carrying that template for
 * this phone — NOT via a Flow token (a plain button tap carries none)
 * and NOT via undocumented postback-text fields (Gupshup's
 * `postbackTexts` shape is not confirmed — see whatsapp-send.server.ts
 * TODO if that becomes worth using later).
 */
export async function processReturningCustomerButton(
  db: SupabaseClient,
  waId: string,
  buttonId: string | null,
): Promise<void> {
  const { data: lastPrompt } = await db
    .from("wa_messages")
    .select("lead_id")
    .eq("phone", waId)
    .eq("direction", "out")
    .eq("template_name", "punyata_returning_confirm")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const leadId = lastPrompt?.lead_id ?? null;

  const identity = await resolveWhatsAppIdentity(db, waId);
  if (identity.kind !== "returning") {
    // Stale/duplicate button tap after the number's identity somehow
    // changed underneath it — nothing safe to do but ask her to call.
    await sendWhatsApp(db, { toPhone: waId, text: "Kripya humein call karein 🙏" });
    return;
  }
  // §3.4.2 — messaging us first is consent.
  await recordOptIn(db, identity.profileId, "inbound_message");

  if (buttonId === RETURNING_CONFIRM_CHANGE_BUTTON_ID) {
    // §7.2 — "Badalna hai": open the same static Flow, empty. Rare
    // branch, accept the friction. Queuing punyata_plan_offer (the
    // same template that carries the Flow button) reuses the one
    // send path rather than a parallel one.
    await db.from("notifications").insert({
      user_id: identity.profileId,
      type: "payment_link_sent",
      channel: "whatsapp",
      status: "pending",
      message: "Flow reopened for family details",
      to_phone: waId,
      template_name: "punyata_plan_offer",
      meta: { lead_id: leadId, source: "whatsapp_returning_change" },
    });
    return;
  }

  if (buttonId !== RETURNING_CONFIRM_KEEP_BUTTON_ID) return; // unknown button — ignore, do not guess

  let interestedPlanId: string | null = null;
  let telecallerId: string | null = null;
  let sourcingAgentId: string | null = null;
  if (leadId) {
    const { data: lead } = await db
      .from("leads")
      .select("interested_plan_id,assigned_to,created_by,source_agent_id")
      .eq("id", leadId)
      .maybeSingle();
    interestedPlanId = lead?.interested_plan_id ?? null;
    telecallerId = lead?.assigned_to ?? lead?.created_by ?? null;
    sourcingAgentId = lead?.source_agent_id ?? null;
  }
  if (!interestedPlanId) {
    await sendWhatsApp(db, {
      toPhone: waId,
      text: "Plan detail nahi mil paayi — team call karegi 🙏",
      profileId: identity.profileId,
    });
    return;
  }
  const plan = await resolveActivePlan(db, interestedPlanId);
  if (!plan) {
    await sendWhatsApp(db, {
      toPhone: waId,
      text: "Plan abhi available nahi hai — team call karegi 🙏",
      profileId: identity.profileId,
    });
    return;
  }

  const outcome = await createCheckoutForUser({
    adminDb: db,
    userId: identity.profileId,
    planIdOrSlug: plan.id,
    acquisitionChannel: "whatsapp",
    salesAgentId: sourcingAgentId,
    telecallerId: telecallerId,
  });

  await copyFamilyMembers(db, identity.priorFamilyMembers, outcome.subscriptionDbId);

  await db.from("notifications").insert({
    user_id: identity.profileId,
    type: "payment_link_sent",
    channel: "whatsapp",
    status: "pending",
    message: `Plan: ${plan.name}`,
    to_phone: waId,
    template_name: "punyata_payment_link",
    template_vars: { plan_name: plan.name, subscription_id: outcome.subscriptionDbId },
    meta: {
      subscription_db_id: outcome.subscriptionDbId,
      plan_slug: plan.id,
      source: "whatsapp_returning_keep",
    },
  });
}

/**
 * §3.4.2/§3.4.3 — a plain inbound text message. Two consent duties,
 * neither of which is Flow/button-specific:
 *   - "messaging us first is consent" — stamp opt-in if this resolves
 *     to a known profile (a brand-new number that has never signed up
 *     has nothing to stamp yet; it gets its opt-in at Flow submission).
 *   - opt-out keyword match — record it and send ONE confirmation.
 *     The confirmation is sent BEFORE recordOptOut() runs, while
 *     consent still reads as opted-in, or sendWhatsApp's own opt-out
 *     gate would refuse the very message that confirms the opt-out.
 * §9.2's "customer replied" badge is a further read against
 * wa_messages this function's caller already wrote — no separate flag
 * column, see whatsapp-webhook.server.ts's history for why.
 */
export async function processInboundMessage(
  db: SupabaseClient,
  waId: string,
  text: string | null,
): Promise<void> {
  const identity = await resolveWhatsAppIdentity(db, waId);
  const profileId = identity.kind === "returning" ? identity.profileId : null;

  if (isOptOutMessage(text)) {
    if (profileId) {
      await sendWhatsApp(db, {
        toPhone: waId,
        text: "Theek hai, hum aapko WhatsApp par message nahi bhejenge 🙏",
        profileId,
      });
      await recordOptOut(db, profileId);
      await db.from("audit_logs").insert({
        admin_id: null,
        action: "whatsapp.consent.opted_out",
        entity: "profiles",
        entity_id: profileId,
        meta: { via: "inbound_keyword", text },
      });
    }
    // An opt-out from a number with no known profile has nothing to
    // record against — nothing to do but not treat it as consent.
    return;
  }

  if (profileId) {
    await recordOptIn(db, profileId, "inbound_message");
  }
}
