import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { isInCallersTray } from "@/lib/telecaller-data.server";
import { CheckoutError, createCheckoutForUser } from "@/lib/subscriptions-checkout.server";
import { buildWaLink } from "@/lib/sankalp-logic";
import { stripMaskedFieldsDeep } from "@/lib/telecaller-logic";

// POST /api/telecaller/send-payment-link
// Gate: requireTelecaller.
// Body: { profile_id? , subscription_id? , lead_id? , plan_id_or_slug,
//         attribution_token? }
//
// §5.5 — she NEVER touches money. The checkout is created through
// the EXISTING createCheckoutForUser() so every house rule there
// applies automatically. Her browser receives the share link and
// NOTHING else — no amount, no Razorpay IDs.
//
// §2.1 (Hospitals session): COUPONS ARE GONE from this flow — there
// is no coupon_code parameter, no agent-coupon allowlist, no discount
// of any kind. Attribution rides ONLY on the link's attribution token
// plus the lead's sourcing agent. Public customer-facing website
// coupons remain a separate feature on the ordinary checkout.
//
// §4.1 (Hospitals session): the SOURCING AGENT credited is the FIELD
// AGENT who sourced the LEAD (leads.source_agent_id) — never derived
// from the telecaller's own phone, which used to credit her as an
// agent on her own sale. Resolution order: explicit lead_id →
// attribution_token → most recent open lead for the target phone.
//
// C2/H9 tray discipline: the resolved lead MUST belong to this caller
// (assigned to or created by her), and its token/profile must match
// the payment target. Mismatches are rejected, not silently repaired.
//
// Halted targets (follow-up): when subscription_id points at a HALTED
// subscription, that row is retired first (cancelled,
// cancel_reason='mandate_dead_reissued', race-guarded) before the new
// checkout is created — her normal lead/tray attribution still applies
// here; only /api/admin/subscriptions/reissue-link is organic/no-credit.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LeadRow {
  id: string;
  attribution_token: string | null;
  source_agent_id: string | null;
  profile_id: string | null;
  status: string;
}

export const Route = createFileRoute("/api/telecaller/send-payment-link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        let body: {
          profile_id?: unknown;
          subscription_id?: unknown;
          lead_id?: unknown;
          plan_id_or_slug?: unknown;
          attribution_token?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const planIdOrSlug =
          typeof body.plan_id_or_slug === "string" ? body.plan_id_or_slug.trim() : "";
        if (!planIdOrSlug) return json({ error: "Plan chunein" }, 400);

        // A coupon has NO place in this flow — reject loudly rather
        // than silently ignore, so old clients fail visibly.
        if ("coupon_code" in body) {
          return json({ error: "Is flow mein coupon nahi hota — link hi attribution hai" }, 400);
        }

        try {
          // ── Resolve WHO pays ────────────────────────────────────
          let userId = "";
          let targetProfileId: string | null =
            typeof body.profile_id === "string" && UUID_RE.test(body.profile_id)
              ? body.profile_id
              : null;
          const targetSubscriptionId: string | null =
            typeof body.subscription_id === "string" && UUID_RE.test(body.subscription_id)
              ? body.subscription_id
              : null;
          // Set when THIS send retires a halted subscription first
          // (follow-up fix: mirrors reissue-link.ts so a halted row is
          // never left sitting beside the fresh pending one).
          let retiredHaltedSubId: string | null = null;

          if (targetProfileId) {
            userId = targetProfileId; // profiles.id mirrors auth.users id
          } else if (targetSubscriptionId) {
            const { data: sub, error } = await auth.db
              .from("subscriptions")
              .select("id,user_id,status")
              .eq("id", targetSubscriptionId)
              .maybeSingle();
            if (error) return json({ error: error.message }, 500);
            if (!sub) return json({ error: "Subscription not found" }, 404);
            userId = sub.user_id;
            targetProfileId = sub.user_id;

            // Halted target → retire it BEFORE creating the new
            // subscription (same fields + race guard as the admin
            // reissue route). Any other status leaves current behavior
            // untouched — this route serves non-reissue sends too.
            if (sub.status === "halted") {
              const nowIso = new Date().toISOString();
              // [Bug 1.1 twin] Same atomic guard as reissue-link.ts:
              // zero affected rows means someone else already retired
              // this halted row — creating a SECOND checkout link for
              // the same customer is exactly the double-reissue bug.
              const { data: retired, error: cancelErr } = await auth.db
                .from("subscriptions")
                .update({
                  status: "cancelled",
                  cancelled_at: nowIso,
                  cancel_reason: "mandate_dead_reissued",
                  updated_at: nowIso,
                })
                .eq("id", sub.id)
                .eq("status", "halted")
                .select("id");
              if (cancelErr) return json({ error: cancelErr.message }, 500);
              if (!retired || retired.length === 0) {
                return json(
                  {
                    error:
                      "Yeh subscription kisi aur ne abhi resume/reissue kar diya — page refresh karke dobara try karein",
                  },
                  409,
                );
              }
              retiredHaltedSubId = sub.id;
            }
          } else {
            return json({ error: "profile_id ya subscription_id zaroori hai" }, 400);
          }

          // ── §4.1: resolve THE LEAD (explicit → token → open-by-phone)
          const requestedToken =
            typeof body.attribution_token === "string" && body.attribution_token.trim()
              ? body.attribution_token.trim()
              : null;
          const requestedLeadId =
            typeof body.lead_id === "string" && UUID_RE.test(body.lead_id) ? body.lead_id : null;

          let lead: LeadRow | null = null;
          if (requestedLeadId) {
            const { data } = await auth.db
              .from("leads")
              .select("id,attribution_token,source_agent_id,profile_id,status")
              .eq("id", requestedLeadId)
              .maybeSingle();
            lead = (data as unknown as LeadRow | null) ?? null;
          }
          if (!lead && requestedToken) {
            const { data } = await auth.db
              .from("leads")
              .select("id,attribution_token,source_agent_id,profile_id,status")
              .eq("attribution_token", requestedToken)
              .maybeSingle();
            lead = (data as unknown as LeadRow | null) ?? null;
          }
          if (!lead && targetProfileId) {
            // Most recent still-open lead for this person's phone.
            const { data: prof } = await auth.db
              .from("profiles")
              .select("phone")
              .eq("id", targetProfileId)
              .maybeSingle();
            if (prof?.phone) {
              const { data } = await auth.db
                .from("leads")
                .select("id,attribution_token,source_agent_id,profile_id,status")
                .eq("phone", prof.phone)
                .in("status", ["new", "assigned", "in_progress", "link_sent"])
                .order("created_at", { ascending: false })
                .limit(1);
              lead = ((data ?? []) as unknown as LeadRow[])[0] ?? null;
            }
          }

          // ── C2/H9: the lead must be HERS and must MATCH the target ──
          if (lead) {
            if (lead.profile_id && targetProfileId && lead.profile_id !== targetProfileId) {
              return json({ error: "Lead ka customer aur payment target alag hain" }, 403);
            }
            if (
              requestedToken &&
              lead.attribution_token &&
              lead.attribution_token !== requestedToken
            ) {
              return json({ error: "Attribution token is lead se match nahi karta" }, 403);
            }
          }

          const inTray = await isInCallersTray(auth.db, auth.callerId, auth.role !== "telecaller", {
            leadId: lead?.id ?? null,
            profileId: targetProfileId,
            subscriptionId: targetSubscriptionId,
          });
          if (!inTray) {
            return json({ error: "Yeh lead/person aapki tray mein nahi hai" }, 403);
          }

          // ── Attribution: the FIELD agent who sourced the lead ────
          const salesAgentId = lead?.source_agent_id ?? null;
          const effectiveToken = lead?.attribution_token ?? requestedToken;

          // ── Create the checkout (ALL house rules inherited) ─────
          const outcome = await createCheckoutForUser({
            adminDb: auth.db,
            userId,
            planIdOrSlug,
            acquisitionChannel: "telecall",
            salesAgentId,
          });

          // ── Share links (no Razorpay ids in ANY of this) ────────
          const origin = new URL(request.url).origin;
          const shareLink =
            `${origin}/checkout/${encodeURIComponent(planIdOrSlug)}` +
            (effectiveToken ? `?att=${encodeURIComponent(effectiveToken)}` : "");
          const message =
            `Namaste 🙏 Punyata se judein — aapka plan: ${outcome.planName}. ` +
            `Yahan se payment poora karein: ${shareLink}`;
          const { data: targetPhoneRow } = await auth.db
            .from("profiles")
            .select("phone")
            .eq("id", userId)
            .maybeSingle();
          const waLink = targetPhoneRow?.phone ? buildWaLink(targetPhoneRow.phone, message) : "";

          await auth.db.from("notifications").insert({
            user_id: userId,
            type: "payment_link_sent",
            channel: "whatsapp",
            status: "pending",
            message,
            meta: {
              subscription_db_id: outcome.subscriptionDbId,
              plan_slug: planIdOrSlug,
              sent_via: "telecaller_panel",
            },
          });

          await writeTelecallerAudit(
            auth.db,
            auth.callerId,
            "telecaller.payment_link.sent",
            "subscriptions",
            outcome.subscriptionDbId,
            {
              user_id: userId,
              plan: outcome.planName,
              lead_id: lead?.id ?? null,
              sourcing_agent_credited: salesAgentId,
              attribution_token: effectiveToken ? `${effectiveToken.slice(0, 8)}…` : null,
              // Present only when this send retired a halted row
              // (cancel_reason='mandate_dead_reissued') before creating
              // the new subscription above.
              ...(retiredHaltedSubId
                ? {
                    replaced_subscription_id: retiredHaltedSubId,
                    replaced_cancel_reason: "mandate_dead_reissued",
                  }
                : {}),
            },
          );

          return json(
            stripMaskedFieldsDeep({
              ok: true,
              planName: outcome.planName,
              shareLink,
              waLink,
            }),
          );
        } catch (err) {
          if (err instanceof CheckoutError) return json({ error: err.message }, err.status);
          console.error("telecaller/send-payment-link error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
