import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "node:crypto";
import { json, requireTelecaller, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { resolveActivePlan } from "@/lib/subscriptions-checkout.server";
import { stripMaskedFieldsDeep } from "@/lib/telecaller-logic";

// POST /api/telecaller/referral-link
// Gate: requireTelecaller.
// Body: { plan_id_or_slug }
//
// Self-serve counterpart to /api/telecaller/send-payment-link: NOT
// tied to any one lead. She picks a plan, gets back ONE stable
// share link for herself + that plan, forever — she pastes/sends it
// however she likes (WhatsApp, SMS, in person). Whoever completes
// checkout through it gets her telecaller_id stamped exactly like
// the lead-token flow (create-checkout.ts resolves
// telecaller_referral_links.token the same way it resolves
// leads.attribution_token), so it feeds the SAME commission ledger
// (migration 013, §9/§10) — no separate payout mechanism to build.
//
// Idempotent: re-requesting the same plan returns the SAME token/
// link rather than minting a new one (UNIQUE(telecaller_id, plan_id)
// on telecaller_referral_links, migration 040).
export const Route = createFileRoute("/api/telecaller/referral-link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        let body: { plan_id_or_slug?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const planIdOrSlug =
          typeof body.plan_id_or_slug === "string" ? body.plan_id_or_slug.trim() : "";
        if (!planIdOrSlug) return json({ error: "Plan chunein" }, 400);

        try {
          const plan = await resolveActivePlan(auth.db, planIdOrSlug);
          if (!plan) return json({ error: "Plan not found or inactive" }, 404);

          // Reuse an existing link for this (telecaller, plan) pair first.
          const { data: existing, error: existingErr } = await auth.db
            .from("telecaller_referral_links")
            .select("token")
            .eq("telecaller_id", auth.callerId)
            .eq("plan_id", plan.id)
            .maybeSingle();
          if (existingErr) return json({ error: existingErr.message }, 500);

          let token = existing?.token ?? null;
          if (!token) {
            token = randomUUID();
            const { error: insertErr } = await auth.db
              .from("telecaller_referral_links")
              .insert({ telecaller_id: auth.callerId, plan_id: plan.id, token });
            if (insertErr) {
              // Unique-violation race: someone else's concurrent request for
              // the same (telecaller, plan) already won — read that one back.
              if (insertErr.code === "23505") {
                const { data: won, error: wonErr } = await auth.db
                  .from("telecaller_referral_links")
                  .select("token")
                  .eq("telecaller_id", auth.callerId)
                  .eq("plan_id", plan.id)
                  .maybeSingle();
                if (wonErr) return json({ error: wonErr.message }, 500);
                token = won?.token ?? null;
              } else {
                return json({ error: insertErr.message }, 500);
              }
            }
          }
          if (!token) return json({ error: "Link ban nahi paya" }, 500);

          const origin = new URL(request.url).origin;
          const shareLink = `${origin}/checkout/${encodeURIComponent(plan.slug)}?att=${encodeURIComponent(token)}`;
          const message =
            `Namaste 🙏 Punyata se judein — plan: ${plan.name}. ` +
            `Yahan se login karke payment poora karein: ${shareLink}`;
          // No fixed phone here — this is HER generic link, not a
          // specific customer's. wa.me with no number opens the
          // contact/chat picker instead of a single fixed chat.
          const waLink = `https://wa.me/?text=${encodeURIComponent(message)}`;

          await writeTelecallerAudit(
            auth.db,
            auth.callerId,
            "telecaller.referral_link.generated",
            "telecaller_referral_links",
            null,
            { plan: plan.name, plan_id: plan.id },
          );

          return json(
            stripMaskedFieldsDeep({
              ok: true,
              planName: plan.name,
              planSlug: plan.slug,
              shareLink,
              waLink,
            }),
          );
        } catch (err) {
          console.error("telecaller/referral-link error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
