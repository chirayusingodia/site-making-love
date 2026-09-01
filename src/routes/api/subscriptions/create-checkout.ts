import { createFileRoute } from "@tanstack/react-router";
import { json, getServiceClient, requireUser } from "@/lib/supabase-admin.server";
import { createCheckoutForUser, CheckoutError } from "@/lib/subscriptions-checkout.server";

// POST /api/subscriptions/create-checkout
// Auth: Bearer <supabase access token> (end user — post-login buy step)
// Body: { plan_id: string (slug or uuid), coupon_code?: string }
//
// Creates the caller's OWN `pending` subscriptions row + a payment
// MANDATE for it through the gateway registry, and returns what the
// frontend needs to open that gateway's checkout (gateway id, mandate
// id, publishable key, strategy). status='active' is NEVER set here —
// activation is webhook-driven only.
//
// The response is gateway-neutral: the frontend switches on
// `checkoutStrategy`, so failing over to another provider needs no
// change to this route.

export const Route = createFileRoute("/api/subscriptions/create-checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return json({ error: "Login required" }, 401);

        // Name + phone are mandatory before a subscription can be
        // created — /checkout's "Confirm & Pay" is disabled until both
        // are filled, but that's a UI courtesy, not a security boundary.
        // Enforce it here too so a direct API call can't skip identity.
        const { data: identityProfile, error: identityErr } = await auth.db
          .from("profiles")
          .select("full_name,phone")
          .eq("id", auth.userId)
          .maybeSingle();
        if (identityErr) return json({ error: identityErr.message }, 500);
        if (!identityProfile?.full_name?.trim() || !identityProfile?.phone) {
          return json({ error: "Pehle naam aur mobile number bharein." }, 400);
        }

        let body: {
          plan_id?: unknown;
          coupon_code?: unknown;
          att?: unknown;
          marketing?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        if (typeof body?.plan_id !== "string" || !body.plan_id.trim()) {
          return json({ error: "plan_id required" }, 400);
        }
        const couponCode =
          typeof body?.coupon_code === "string" && body.coupon_code.trim()
            ? body.coupon_code
            : null;

        // §9.1 path 1 — attribution token from a telecaller's payment
        // link (?att=…). Resolves to (telecaller, source agent) and both
        // are stamped write-once on the subscription at creation.
        // §4.2 (Hospitals session): the AGENT stamped is the FIELD agent
        // who sourced the lead (leads.source_agent_id) — never anyone else.
        // A bogus token never blocks the purchase; it attributes nothing.
        let telecallerId: string | null = null;
        let sourcingAgentId: string | null = null;
        if (typeof body?.att === "string" && body.att.trim()) {
          const adminDb = getServiceClient();
          const { data: lead } = await adminDb
            .from("leads")
            .select("id,assigned_to,created_by,source_agent_id")
            .eq("attribution_token", body.att.trim())
            .maybeSingle();
          telecallerId = lead?.assigned_to ?? lead?.created_by ?? null;
          sourcingAgentId = lead?.source_agent_id ?? null;
        }

        // Marketing-channel attribution (§ Attribution) — first-touch data
        // the browser captured on landing (src/lib/attribution.ts). Purely
        // descriptive: never touches commission/staff attribution above.
        // A malformed/missing object just means no channel gets stamped —
        // never blocks the purchase.
        let marketing: {
          channel?: string;
          utmSource?: string | null;
          utmMedium?: string | null;
          utmCampaign?: string | null;
          utmContent?: string | null;
          utmTerm?: string | null;
          gclid?: string | null;
          fbclid?: string | null;
          landingPath?: string | null;
        } | null = null;
        if (body?.marketing && typeof body.marketing === "object") {
          const m = body.marketing as Record<string, unknown>;
          marketing = {
            channel: typeof m.channel === "string" ? m.channel.slice(0, 100) : undefined,
            utmSource: typeof m.utmSource === "string" ? m.utmSource.slice(0, 200) : null,
            utmMedium: typeof m.utmMedium === "string" ? m.utmMedium.slice(0, 200) : null,
            utmCampaign: typeof m.utmCampaign === "string" ? m.utmCampaign.slice(0, 200) : null,
            utmContent: typeof m.utmContent === "string" ? m.utmContent.slice(0, 200) : null,
            utmTerm: typeof m.utmTerm === "string" ? m.utmTerm.slice(0, 200) : null,
            gclid: typeof m.gclid === "string" ? m.gclid.slice(0, 200) : null,
            fbclid: typeof m.fbclid === "string" ? m.fbclid.slice(0, 200) : null,
            landingPath: typeof m.landingPath === "string" ? m.landingPath.slice(0, 300) : null,
          };
        }

        try {
          const outcome = await createCheckoutForUser({
            adminDb: getServiceClient(),
            userId: auth.userId,
            planIdOrSlug: body.plan_id.trim(),
            couponCode,
            ...(telecallerId ? { telecallerId } : {}),
            ...(sourcingAgentId ? { salesAgentId: sourcingAgentId } : {}),
            ...(marketing ? { marketing } : {}),
          });
          // The gateway's publishable key rides inside `outcome`
          // (gatewayPublicKey), resolved from whichever provider
          // actually issued the mandate — never read from a
          // provider-specific env var here, which would hand the
          // browser Razorpay's key for a Cashfree mandate.
          return json({ ok: true, ...outcome });
        } catch (err) {
          if (err instanceof CheckoutError) {
            return json({ error: err.message }, err.status);
          }
          console.error("create-checkout error:", err);
          return json({ error: err instanceof Error ? err.message : "Checkout failed" }, 500);
        }
      },
    },
  },
});
