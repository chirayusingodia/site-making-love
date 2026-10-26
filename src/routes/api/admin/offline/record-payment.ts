import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import {
  computeCoverage,
  dueState,
  mapOfflineRpcError,
  paidAtFromDate,
  parseRecordPaymentBody,
  todayIST,
} from "@/lib/offline-subscriptions-logic";

// POST /api/admin/offline/record-payment        (OWNER ONLY)
// Body: { subscriptionId, expectedStatus, expectedNextBillingDate | null,
//         amountPaise, paidOn, monthsCovered, method,
//         referenceNo?, proofUrl?, notes? }
//
// Records one QR/cash/bank payment and advances the due date. The
// expected* pair is the optimistic-concurrency guard: the RPC raises
// `stale` (→ 409) if the subscription moved since the owner's screen
// loaded, so two tabs can never double-advance the due date.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute("/api/admin/offline/record-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);
        const { db, staffId } = gate.auth;

        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const subscriptionId =
          typeof body.subscriptionId === "string" && UUID_RE.test(body.subscriptionId)
            ? body.subscriptionId
            : null;
        if (!subscriptionId) return json({ error: "subscriptionId zaroori hai" }, 400);

        const expectedStatus = typeof body.expectedStatus === "string" ? body.expectedStatus : null;
        if (expectedStatus !== "active" && expectedStatus !== "halted") {
          return json({ error: "expectedStatus active ya halted hona chahiye" }, 400);
        }
        const rawExpectedDate = body.expectedNextBillingDate;
        const expectedNextBillingDate =
          typeof rawExpectedDate === "string" && DATE_RE.test(rawExpectedDate)
            ? rawExpectedDate
            : null;
        if (rawExpectedDate != null && expectedNextBillingDate === null) {
          return json({ error: "expectedNextBillingDate sahi nahi hai" }, 400);
        }

        const today = todayIST(new Date());
        const pay = parseRecordPaymentBody(body, today);
        if (!pay.ok) return json({ error: pay.error }, 400);
        const p = pay.value;

        try {
          const { data: sub, error: subErr } = await db
            .from("subscriptions")
            .select("id,status,payment_mode,next_billing_date,offline_anchor_day,plan_id")
            .eq("id", subscriptionId)
            .maybeSingle();
          if (subErr) return json({ error: subErr.message }, 500);
          if (!sub) return json({ error: "Subscription nahi mili" }, 404);
          if (sub.payment_mode !== "offline_qr") {
            return json({ error: "Yeh QR subscription nahi hai" }, 409);
          }
          if (sub.status !== "active" && sub.status !== "halted") {
            return json(
              { error: `Is subscription par payment record nahi ho sakta (${sub.status})` },
              409,
            );
          }

          const coverage = computeCoverage({
            status: sub.status as string,
            nextBillingDate: (sub.next_billing_date as string | null) ?? null,
            anchorDay: (sub.offline_anchor_day as number | null) ?? null,
            paidOn: p.paidOn,
            monthsCovered: p.monthsCovered,
          });

          const { data: rpc, error: rpcErr } = await db.rpc("record_offline_payment", {
            p_subscription_id: subscriptionId,
            p_actor: staffId,
            p_expected_status: expectedStatus,
            p_expected_next_billing_date: expectedNextBillingDate,
            p_amount_paise: p.amountPaise,
            p_paid_at: paidAtFromDate(p.paidOn),
            p_method: p.method,
            p_months: p.monthsCovered,
            p_period_start: coverage.periodStart,
            p_period_end: coverage.periodEnd,
            p_anchor_day: coverage.anchorDay,
            p_reference_no: p.referenceNo,
            p_proof_url: p.proofUrl,
            p_notes: p.notes,
            p_reactivate: coverage.reactivate,
          });
          if (rpcErr) {
            const mapped = mapOfflineRpcError(rpcErr);
            if (mapped.status === 500) console.error("offline/record-payment rpc error:", rpcErr);
            return json({ error: mapped.message }, mapped.status);
          }

          const out = rpc as {
            payment_id: string;
            status: string;
            next_billing_date: string;
            reactivated: boolean;
          };
          return json({
            ok: true,
            paymentId: out.payment_id,
            status: out.status,
            nextBillingDate: out.next_billing_date,
            reactivated: out.reactivated,
            dueState: dueState({
              status: out.status,
              paymentMode: "offline_qr",
              nextBillingDate: out.next_billing_date,
              today,
            }),
          });
        } catch (err) {
          console.error("offline/record-payment error:", err);
          return json({ error: err instanceof Error ? err.message : "Record failed" }, 500);
        }
      },
    },
  },
});
