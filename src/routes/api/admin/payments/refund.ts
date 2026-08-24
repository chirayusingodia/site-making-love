import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { createRazorpayRefund } from "@/lib/razorpay.server";

// POST /api/admin/payments/refund
//
// Gate: requireOwner — NOT requireAdmin. Refunds move real money out of
// the account; the two-tier staff model (supabase-admin.server.ts) draws
// the line exactly there: ADMIN has full operational access but ZERO
// financial visibility (amount_paise/razorpay_payment_id are masked for
// them in the Payments List), OWNER is the only role with financial
// visibility. A refund button gated to admin would let the visibility-
// restricted role authorise money movement it isn't even shown — so
// this stays owner-only even though resume.ts (a non-financial mandate
// retry) allows admin.
//
// Body: { payment_id: <our uuid>, amount_paise?: number, reason?: string }
// amount_paise omitted = full refund of whatever Razorpay still
// considers refundable on that payment.
//
// Refund discipline mirrors activation discipline: this route asks
// Razorpay to refund and audits the attempt, but NEVER writes
// payments.status/refund_status/refunded_at itself — only the webhook's
// 'refund.processed' handler (razorpay-webhook.server.ts) does that,
// once Razorpay confirms the money actually moved. A failed call here
// (e.g. already fully refunded, or amount exceeds what's left) is
// passed back to the caller verbatim.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/admin/payments/refund")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);
        const auth = gate.auth;

        let body: { payment_id?: unknown; amount_paise?: unknown; reason?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const paymentId =
          typeof body.payment_id === "string" && UUID_RE.test(body.payment_id)
            ? body.payment_id
            : null;
        if (!paymentId) return json({ error: "payment_id zaroori hai" }, 400);

        let amountPaise: number | undefined;
        if (body.amount_paise !== undefined) {
          if (typeof body.amount_paise !== "number" || !(body.amount_paise > 0)) {
            return json({ error: "amount_paise ek positive number hona chahiye" }, 400);
          }
          amountPaise = body.amount_paise;
        }
        const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;

        const { data: pay, error: payErr } = await auth.db
          .from("payments")
          .select(
            "id,subscription_id,razorpay_payment_id,amount_paise,status,refund_status,refund_amount_paise",
          )
          .eq("id", paymentId)
          .maybeSingle();
        if (payErr) return json({ error: payErr.message }, 500);
        if (!pay) return json({ error: "Payment not found" }, 404);

        if (!pay.razorpay_payment_id) {
          return json({ error: "Payment Razorpay se linked nahi hai" }, 400);
        }
        if (pay.status !== "captured") {
          return json(
            { error: `Sirf captured payments refund ho sakte hain (current: ${pay.status})` },
            409,
          );
        }
        if (pay.refund_status === "full") {
          return json({ error: "Yeh payment already fully refunded hai" }, 409);
        }
        // [Bug 1.10] Validate against the REMAINING refundable amount
        // (original minus already-refunded paise), not the original —
        // the old guard let a second partial refund pass locally and
        // only Razorpay's own ceiling caught it.
        const refundedSoFar = pay.refund_amount_paise ?? 0;
        const refundablePaise = Math.max(0, (pay.amount_paise ?? 0) - refundedSoFar);
        if (
          typeof amountPaise === "number" &&
          amountPaise > refundablePaise &&
          pay.refund_status !== "full"
        ) {
          return json(
            {
              error: `Refund amount refundable limit se zyada hai (bacha hua: ₹${(refundablePaise / 100).toFixed(2)})`,
            },
            400,
          );
        }

        try {
          const rzp = await createRazorpayRefund({
            razorpayPaymentId: pay.razorpay_payment_id,
            ...(amountPaise !== undefined ? { amountPaise } : {}),
            notes: {
              punyata_payment_id: pay.id,
              ...(reason ? { reason } : {}),
            },
          });

          await writeTelecallerAudit(
            auth.db,
            auth.staffId,
            "owner.payment.refund_attempted",
            "payments",
            pay.id,
            {
              subscription_id: pay.subscription_id,
              razorpay_payment_id: pay.razorpay_payment_id,
              requested_amount_paise: amountPaise ?? pay.amount_paise,
              reason,
              result: "ok",
              razorpay_refund_id: rzp.id,
              razorpay_status: rzp.status ?? null,
            },
          );

          // payments.status/refund_status stay untouched here — the
          // webhook flips them once Razorpay confirms via refund.processed.
          return json({
            ok: true,
            razorpayRefundId: rzp.id,
            razorpayStatus: rzp.status ?? null,
            message: "Refund requested — payment record updates once Razorpay confirms",
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Refund call failed";
          await writeTelecallerAudit(
            auth.db,
            auth.staffId,
            "owner.payment.refund_attempted",
            "payments",
            pay.id,
            {
              subscription_id: pay.subscription_id,
              razorpay_payment_id: pay.razorpay_payment_id,
              requested_amount_paise: amountPaise ?? pay.amount_paise,
              reason,
              result: "failed",
              error: message,
            },
          );
          console.error("admin/payments/refund error:", err);
          return json({ error: message }, 502);
        }
      },
    },
  },
});
