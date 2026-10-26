import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { fetchAllRows } from "@/lib/supabase";
import {
  defaultAmountPaise,
  dueState,
  todayIST,
  type DueState,
} from "@/lib/offline-subscriptions-logic";
import { isValidMonth, monthWindow } from "@/lib/reports-logic";

// POST /api/admin/offline/register        (OWNER ONLY)
// Body: { month?: 'YYYY-MM' }   (defaults to the current IST month)
//
// The QR Collections register: one row per offline subscription (any
// status except pending) with its due state, last payment and expected
// amount, plus month totals.
//
//   expectedThisMonth  = monthly-equivalent price of every subscription
//                        still owed money (status active | halted)
//   collectedThisMonth = captured offline payments paid in that IST month
//
// Every query pages through fetchAllRows (PostgREST caps single
// responses at ~1000 rows).

interface SubRow {
  id: string;
  user_id: string;
  status: string;
  next_billing_date: string | null;
  halted_at: string | null;
  offline_anchor_day: number | null;
  created_at: string;
  plans: { name: string | null; price_paise: number | null; billing_period: string | null } | null;
}

interface DetailRow {
  payment_id: string;
  subscription_id: string;
  months_covered: number;
  period_start: string;
  period_end: string;
  reference_no: string | null;
  proof_url: string | null;
  created_at: string;
  payments: { amount_paise: number | null; paid_at: string | null; method: string | null } | null;
}

export const Route = createFileRoute("/api/admin/offline/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);
        const { db } = gate.auth;

        let body: { month?: unknown } = {};
        try {
          body = await request.json();
        } catch {
          /* empty body is fine */
        }
        const today = todayIST(new Date());
        const month =
          body.month === undefined || body.month === null ? today.slice(0, 7) : body.month;
        if (!isValidMonth(month)) return json({ error: "month must be YYYY-MM" }, 400);
        const { monthStart, monthEnd } = monthWindow(month);
        const startMs = new Date(monthStart).getTime();
        const endMs = new Date(monthEnd).getTime();

        try {
          const [subsRes, detailsRes] = await Promise.all([
            fetchAllRows<SubRow>((from, to) =>
              db
                .from("subscriptions")
                .select(
                  "id,user_id,status,next_billing_date,halted_at,offline_anchor_day,created_at,plans(name,price_paise,billing_period)",
                )
                .eq("payment_mode", "offline_qr")
                .neq("status", "pending")
                .order("created_at", { ascending: false })
                .range(from, to),
            ),
            fetchAllRows<DetailRow>((from, to) =>
              db
                .from("offline_payment_details")
                .select(
                  "payment_id,subscription_id,months_covered,period_start,period_end,reference_no,proof_url,created_at,payments!inner(amount_paise,paid_at,method)",
                )
                .order("created_at", { ascending: false })
                .range(from, to),
            ),
          ]);
          if (subsRes.error) throw new Error(`subscriptions: ${subsRes.error}`);
          if (detailsRes.error) throw new Error(`details: ${detailsRes.error}`);

          // profiles has no direct FK from subscriptions (user_id -> auth.users),
          // so names/phones are read in id chunks.
          const userIds = [...new Set(subsRes.data.map((s) => s.user_id))];
          const profiles = new Map<string, { full_name: string | null; phone: string | null }>();
          for (let i = 0; i < userIds.length; i += 200) {
            const { data, error } = await db
              .from("profiles")
              .select("id,full_name,phone")
              .in("id", userIds.slice(i, i + 200));
            if (error) throw new Error(`profiles: ${error.message}`);
            for (const r of data ?? []) {
              profiles.set(r.id as string, {
                full_name: (r.full_name as string | null) ?? null,
                phone: (r.phone as string | null) ?? null,
              });
            }
          }

          const bySub = new Map<string, DetailRow[]>();
          for (const d of detailsRes.data) {
            const arr = bySub.get(d.subscription_id) ?? [];
            arr.push(d);
            bySub.set(d.subscription_id, arr);
          }

          let expectedThisMonth = 0;
          let collectedThisMonth = 0;
          let lapsedCount = 0;
          let overdueCount = 0;

          // Collected this month: every offline payment paid inside the IST month.
          for (const d of detailsRes.data) {
            const paidAt = d.payments?.paid_at;
            if (!paidAt) continue;
            const t = new Date(paidAt).getTime();
            if (t >= startMs && t <= endMs) collectedThisMonth += d.payments?.amount_paise ?? 0;
          }

          const rows = subsRes.data.map((s) => {
            const state: DueState = dueState({
              status: s.status,
              paymentMode: "offline_qr",
              nextBillingDate: s.next_billing_date,
              today,
            });
            const expectedPaise = defaultAmountPaise(
              s.plans?.price_paise ?? 0,
              s.plans?.billing_period ?? null,
              1,
            );
            if (s.status === "active" || s.status === "halted") expectedThisMonth += expectedPaise;
            if (state === "lapsed") lapsedCount++;
            if (state === "overdue_grace") overdueCount++;

            const history = bySub.get(s.id) ?? [];
            const last = history[0] ?? null; // newest first
            const profile = profiles.get(s.user_id);
            return {
              subscriptionId: s.id,
              userId: s.user_id,
              name: profile?.full_name ?? null,
              phone: profile?.phone ?? null,
              planName: s.plans?.name ?? null,
              status: s.status,
              dueState: state,
              nextBillingDate: s.next_billing_date,
              anchorDay: s.offline_anchor_day,
              planPricePaise: s.plans?.price_paise ?? null,
              planBillingPeriod: s.plans?.billing_period ?? null,
              expectedPaise,
              paymentsCount: history.length,
              lastPayment: last
                ? {
                    paymentId: last.payment_id,
                    amountPaise: last.payments?.amount_paise ?? null,
                    paidAt: last.payments?.paid_at ?? null,
                    method: last.payments?.method ?? null,
                    referenceNo: last.reference_no,
                    monthsCovered: last.months_covered,
                    periodEnd: last.period_end,
                  }
                : null,
            };
          });

          return json({
            month,
            today,
            // Optional UPI id printed in the owner-only WhatsApp reminder.
            upiVpa: process.env.OFFLINE_UPI_VPA ?? null,
            totals: { expectedThisMonth, collectedThisMonth, lapsedCount, overdueCount },
            rows,
          });
        } catch (err) {
          console.error("offline/register error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
