import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { CheckoutError, createCheckoutForUser } from "@/lib/subscriptions-checkout.server";

// POST /api/admin/subscriptions/reissue-link
// Gate: requireAdmin. Body: { subscription_id }
//
// Part C fallback: the halted subscription's underlying mandate is
// dead (expired card / revoked UPI Autopay) so resume cannot work.
// The only path forward is a FRESH subscription + new checkout link:
//
//   1. Confirm the old row is actually 'halted' (not a general reset).
//   2. Mark it 'cancelled' with cancel_reason='mandate_dead_reissued'
//      BEFORE creating the new one, so reports never see two live-ish
//      rows for one subscriber (owner performance leaderboard sums
//      active books per telecaller/agent — a stale halted row would
//      confuse that math).
//   3. createCheckoutForUser() with NO salesAgentId/telecallerId and
//      no coupon — organic re-signup credits NOBODY (existing
//      attribution rule). All house rules inside createCheckoutForUser
//      apply unchanged.
//
// This route never touches subscriptions.status of the NEW row beyond
// what createCheckoutForUser already does ('pending'); activation
// stays webhook-exclusive.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/admin/subscriptions/reissue-link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);

        let body: { subscription_id?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const oldSubscriptionId =
          typeof body.subscription_id === "string" && UUID_RE.test(body.subscription_id)
            ? body.subscription_id
            : null;
        if (!oldSubscriptionId) return json({ error: "subscription_id zaroori hai" }, 400);

        try {
          const { data: oldSub, error: subErr } = await auth.db
            .from("subscriptions")
            .select("id,user_id,status,plan_id")
            .eq("id", oldSubscriptionId)
            .maybeSingle();
          if (subErr) return json({ error: subErr.message }, 500);
          if (!oldSub) return json({ error: "Subscription not found" }, 404);
          if (oldSub.status !== "halted") {
            return json(
              { error: `Sirf halted subscriptions reissue hote hain (current: ${oldSub.status})` },
              409,
            );
          }

          // Plan slug for the shareable checkout URL (slug aliases are
          // what public URLs use; createCheckoutForUser resolves both).
          const { data: plan, error: planErr } = await auth.db
            .from("plans")
            .select("id,slug,name,is_active")
            .eq("id", oldSub.plan_id)
            .maybeSingle();
          if (planErr) return json({ error: planErr.message }, 500);
          if (!plan || !plan.is_active) {
            return json({ error: "Plan abhi active nahi hai — naya link nahi ban sakta" }, 400);
          }

          // ── Retire the dead row FIRST ────────────────────────
          const nowIso = new Date().toISOString();
          // [Bug 1.1] The atomic race guard IS the conditional update:
          // Postgres matches `.eq("status","halted")` for exactly ONE
          // racer — the loser's UPDATE affects zero rows, detected via
          // .select(). (The old re-read compared cancel_reason against
          // the same literal the OTHER racer had just written, so it
          // could never detect the race and both admins proceeded to
          // create two subscriptions.)
          const { data: retiredRows, error: cancelErr } = await auth.db
            .from("subscriptions")
            .update({
              status: "cancelled",
              cancelled_at: nowIso,
              cancel_reason: "mandate_dead_reissued",
              updated_at: nowIso,
            })
            .eq("id", oldSub.id)
            .eq("status", "halted")
            .select("id");
          if (cancelErr) return json({ error: cancelErr.message }, 500);

          if (!retiredRows || retiredRows.length === 0) {
            // Someone else already cancelled/resumed this row between
            // our read and write — bail instead of double-reissuing.
            return json({ error: "Doosre admin ne pehle hi iska reissue kar diya tha" }, 409);
          }

          // ── Fresh checkout — organic, credits nobody ─────────
          const outcome = await createCheckoutForUser({
            adminDb: auth.db,
            userId: oldSub.user_id,
            planIdOrSlug: plan.slug,
          });

          const origin = new URL(request.url).origin;
          const shareLink = `${origin}/checkout/${encodeURIComponent(plan.slug)}`;

          await auth.db.from("notifications").insert({
            user_id: oldSub.user_id,
            type: "payment_link_sent",
            channel: "whatsapp",
            status: "pending",
            message: `Namaste 🙏 Punyata se judein — aapka plan: ${outcome.planName}. Yahan se payment poora karein: ${shareLink}`,
            meta: {
              subscription_db_id: outcome.subscriptionDbId,
              replaced_subscription_id: oldSub.id,
              plan_slug: plan.slug,
              sent_via: "admin_reissue",
            },
          });

          await writeTelecallerAudit(
            auth.db,
            auth.staffId,
            "admin.subscription.reissue_link",
            "subscriptions",
            outcome.subscriptionDbId,
            {
              user_id: oldSub.user_id,
              replaced_subscription_id: oldSub.id,
              plan: outcome.planName,
              attribution: "none_organic",
            },
          );

          return json({
            ok: true,
            newSubscriptionId: outcome.subscriptionDbId,
            planName: outcome.planName,
            shareLink,
          });
        } catch (err) {
          if (err instanceof CheckoutError) return json({ error: err.message }, err.status);
          console.error("admin/subscriptions/reissue-link error:", err);
          return json({ error: err instanceof Error ? err.message : "Reissue failed" }, 500);
        }
      },
    },
  },
});
