import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { computeMrr, sumCapturedPayments } from "@/lib/financials-logic";
import { monthWindow } from "@/lib/reports-logic";
import { fetchAllRows } from "@/lib/supabase";

// POST /api/admin/overview-financials
// Body: {} (no params — always the current IST month)
//
// OWNER-ONLY. The Overview Dashboard's ₹ figures (MRR, this-month
// captured revenue) are computed HERE with the service-role client
// and returned only when the caller's profiles.role === 'owner'.
// The dashboard's non-financial counts (active/paused/failed/
// pending-proof counts) remain client-side head-count queries —
// this endpoint exists so an admin-role browser never receives the
// raw price/amount rows that MRR and revenue are derived from.
//
// Responses:
//   200 — { mrrPaise, monthlyPlansActiveCount, yearlyPlansActiveCount,
//           capturedRevenuePaise, capturedPaymentsCount, month }
//   401 — no/invalid token, or not staff
//   403 — authenticated staff but not owner ("Owner access required")

export const Route = createFileRoute("/api/admin/overview-financials")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);
        const { db } = gate.auth;

        try {
          // Current month in IST (the dashboard reports IST months).
          const istNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
          const month = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, "0")}`;
          const { monthStart, monthEnd } = monthWindow(month);

          // [Pass-2 P7] PostgREST caps single responses at ~1000 rows —
          // both aggregates MUST page (fetchAllRows) or MRR/revenue
          // silently under-report past a thousand subscribers.
          const [subsAll, capturedAll] = await Promise.all([
            fetchAllRows<{
              plans: { price_paise?: number; billing_period?: string } | null;
            }>((from, to) =>
              db
                .from("subscriptions")
                .select("id, plans(price_paise, billing_period)")
                .eq("status", "active")
                .range(from, to),
            ),
            fetchAllRows<{ amount_paise: number | null }>((from, to) =>
              db
                .from("payments")
                .select("amount_paise")
                .eq("status", "captured")
                .gte("paid_at", monthStart)
                .lte("paid_at", monthEnd)
                .range(from, to),
            ),
          ]);

          if (subsAll.error) throw new Error(`subscriptions: ${subsAll.error}`);
          if (capturedAll.error) throw new Error(`payments: ${capturedAll.error}`);

          const activeSubs = subsAll.data.map((row) => {
            const plan = row.plans as unknown as {
              price_paise?: number;
              billing_period?: string;
            } | null;
            return {
              plan_price_paise: plan?.price_paise ?? null,
              plan_billing_period: plan?.billing_period ?? null,
            };
          });

          const mrr = computeMrr(activeSubs);
          const captured = sumCapturedPayments(capturedAll.data);

          return json({
            ...mrr,
            ...captured,
            month,
          });
        } catch (err) {
          console.error("overview-financials error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
