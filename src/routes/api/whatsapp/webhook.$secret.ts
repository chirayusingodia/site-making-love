import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";
import { json, getServiceClient } from "@/lib/supabase-admin.server";
import {
  applyStatusUpdate,
  recordAndClassifyInbound,
  verifyWebhookSecret,
} from "@/lib/whatsapp-webhook.server";
import {
  processFlowSubmission,
  processInboundMessage,
  processReturningCustomerButton,
} from "@/lib/whatsapp-flow.server";

// POST /api/whatsapp/webhook/:secret
//
// Gupshup → Punyata inbound WhatsApp endpoint. Register
// https://<domain>/api/whatsapp/webhook/<GUPSHUP_WEBHOOK_SECRET> as
// the callback URL in the Gupshup console (§4/§5 of
// SESSION_WHATSAPP_FUNNEL_PROMPT.md).
//
// The secret lives in the PATH, not a header, because Gupshup's docs
// document no native way to attach a custom header to their callback
// config — see whatsapp-webhook.server.ts's file header for the two
// open items (auth mechanism, nfm_reply envelope shape) that need a
// live sandbox test before go-live.
//
// Response discipline mirrors /api/payments/webhook: a failure
// anywhere in processing must never turn into a non-200 (Gupshup
// retries on non-2xx and slow responses — a retry storm is worse than
// one dropped message). Auth failure is the one deliberate exception.
//
// Does NOT set subscriptions.status='active' — that stays
// Razorpay-webhook-only (house rule, §11).

export const Route = createFileRoute("/api/whatsapp/webhook/$secret")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const secret = process.env.GUPSHUP_WEBHOOK_SECRET;
        if (!secret) {
          return json({ error: "GUPSHUP_WEBHOOK_SECRET not configured" }, 500);
        }
        if (!verifyWebhookSecret(params.secret, secret)) {
          return json({ error: "Unauthorized" }, 401);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          // Can't be reprocessed by a retry either way — ack.
          return json({ received: true, ignored: "invalid_json" }, 200);
        }

        const db = getServiceClient();
        try {
          const dispatch = await recordAndClassifyInbound(db, body as never);
          if (dispatch === null) {
            return json({ received: true, ignored: "duplicate_delivery" }, 200);
          }
          switch (dispatch.case) {
            case "flow_reply":
              await processFlowSubmission(db, dispatch);
              break;
            case "button_reply":
              await processReturningCustomerButton(db, dispatch.waId, dispatch.buttonId);
              break;
            case "status":
              await applyStatusUpdate(db, dispatch);
              break;
            case "message":
              await processInboundMessage(db, dispatch.waId, dispatch.text);
              break;
            case "unhandled":
              break;
          }
          return json({ received: true }, 200);
        } catch (err) {
          // Hard rule (same as Razorpay webhook): a failure anywhere
          // in processing must never turn into a non-200.
          console.error("whatsapp webhook processing error:", err);
          try {
            await db.from("audit_logs").insert({
              admin_id: null,
              action: "whatsapp.webhook.processing_failed",
              entity: "wa_messages",
              entity_id: null,
              meta: { error: err instanceof Error ? err.message : String(err) },
            });
          } catch {
            /* audit is best-effort */
          }
          return json({ received: true, ignored: "processing_error" }, 200);
        }
      },
    },
  },
});
