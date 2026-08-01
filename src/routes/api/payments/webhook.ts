import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";
import { json, getServiceClient } from "@/lib/supabase-admin.server";
import { processWebhookEvent, verifyWebhookSignature } from "@/lib/razorpay-webhook.server";

// POST /api/payments/webhook
//
// Razorpay → Punyata subscription lifecycle endpoint. THE ONLY code
// path in the product that ever sets subscriptions.status='active'.
//
// Security: HMAC-SHA256 over the RAW request body, verified against
// RAZORPAY_WEBHOOK_SECRET before anything is parsed or written.
// The signature header is X-Razorpay-Signature.
//
// Response discipline (Razorpay retries non-2xx for ~24h):
//   401 — signature missing/invalid (do NOT retry: it's an attack
//         or misconfiguration; retries would also fail)
//   200 — event processed, or deliberately ignored (unknown event,
//         unknown subscription) — ack so Razorpay stops retrying
//   500 — genuine processing error (DB down etc.) — retry welcome
//
// Env required (Vercel): RAZORPAY_WEBHOOK_SECRET,
// SUPABASE_SERVICE_ROLE_KEY (+ VITE_SUPABASE_URL fallback).

export const Route = createFileRoute("/api/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!secret) {
          // Misconfiguration is OUR bug, not Razorpay's — 500 so
          // ops notices in Vercel logs and Razorpay retries later.
          return json({ error: "RAZORPAY_WEBHOOK_SECRET not configured" }, 500);
        }

        // Raw body FIRST — parsing before verification would both
        // break the HMAC and process untrusted input.
        const rawBody = await request.text();
        const signature = request.headers.get("x-razorpay-signature");

        if (!verifyWebhookSignature(rawBody, signature, secret)) {
          return json({ error: "Invalid signature" }, 401);
        }

        let body: unknown;
        try {
          body = JSON.parse(rawBody);
        } catch {
          // Signature was valid but body isn't JSON — ack, don't retry.
          return json({ error: "Invalid JSON body" }, 400);
        }

        try {
          const db = getServiceClient();
          const result = await processWebhookEvent(db, body);
          return json({ received: true, ...result });
        } catch (err) {
          console.error("webhook processing error:", err);
          return json({ error: err instanceof Error ? err.message : "Processing failed" }, 500);
        }
      },
    },
  },
});
