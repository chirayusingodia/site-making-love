import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin } from "@/lib/supabase-admin.server";
import { fetchAllRows } from "@/lib/supabase";
import { addMonthsYm, type PaymentLite } from "@/lib/finance-logic";
import { toPaymentLite } from "@/lib/finance-data.server";
import { buildSubscriberTrend, type SubLite } from "@/lib/subscriber-trend-logic";
import { todayIST } from "@/lib/offline-subscriptions-logic";
import { monthWindow } from "@/lib/reports-logic";

// POST /api/admin/subscribers/trend        (admin OR owner)
// Body: { months?: 1-24, toYm?: 'YYYY-MM' }  (default 12 months ending at the current IST month)
//
// Subscriber COUNTS per month — paying, new, cancelled, lapsed — plus how
// many are active right now. Counts only, no ₹: payment rows are read here
// with the service role but amounts are never returned, which is why admins
// (zero financial visibility) may call it.

const LOOKBACK = 24; // a QR prepay / yearly plan can cover months well before the window

export const Route = createFileRoute("/api/admin/subscribers/trend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);

        let body: { months?: unknown; toYm?: unknown } = {};
        try {
          body = await request.json();
        } catch {
          /* empty body is fine */
        }
        const months =
          typeof body.months === "number" && body.months >= 1 && body.months <= 24
            ? Math.floor(body.months)
            : 12;
        const nowYm = todayIST(new Date()).slice(0, 7);
        const requested = typeof body.toYm === "string" ? body.toYm : "";
        const toYm =
          /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) && requested <= nowYm ? requested : nowYm;
        const fromYm = addMonthsYm(toYm, -(months - 1));
        const paymentsFrom = new Date(
          monthWindow(addMonthsYm(fromYm, -LOOKBACK)).monthStart,
        ).toISOString();

        try {
          const [subsRes, paysRes] = await Promise.all([
            fetchAllRows<SubLite>((from, to) =>
              auth.db
                .from("subscriptions")
                .select("id,status,start_date,cancelled_at,halted_at")
                .neq("status", "pending")
                .range(from, to),
            ),
            fetchAllRows<Parameters<typeof toPaymentLite>[0]>((from, to) =>
              auth.db
                .from("payments")
                .select(
                  "id,subscription_id,amount_paise,status,paid_at,refunded_at,refund_amount_paise,gateway," +
                    "subscriptions(plans(billing_period)),offline_payment_details(period_start,months_covered)",
                )
                .eq("status", "captured")
                .gte("paid_at", paymentsFrom)
                .range(from, to),
            ),
          ]);
          if (subsRes.error) throw new Error(`subscriptions: ${subsRes.error}`);
          if (paysRes.error) throw new Error(`payments: ${paysRes.error}`);

          const payments: PaymentLite[] = paysRes.data.map(toPaymentLite);
          const trend = buildSubscriberTrend({ subs: subsRes.data, payments, fromYm, toYm });
          return json({ fromYm, toYm, ...trend });
        } catch (err) {
          console.error("subscribers/trend error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
