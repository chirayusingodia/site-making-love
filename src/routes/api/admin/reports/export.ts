import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { fetchMonthlyReportData, fetchPendingSevasReportData } from "@/lib/reports-data.server";
import {
  buildPendingSevasCsv,
  buildRevenueCsv,
  buildSevaCsv,
  buildSubscribersCsv,
  computePendingSevas,
  computeRevenueReport,
  computeSevaReport,
  computeSubscriberReport,
  csvFilename,
  isReportKey,
  isValidMonth,
} from "@/lib/reports-logic";

// POST /api/admin/reports/export
// Body: { month: "YYYY-MM", report: "subscribers" | "revenue" | "seva" | "pending" }
//
// OWNER-ONLY. Generates the CSV for any of the four reports
// SERVER-SIDE (same shared derivations the page renders from —
// src/lib/reports-logic.ts — so CSV output can never drift from
// the on-screen numbers). Rejects 403 for any authenticated
// non-owner (including admin): revenue CSVs contain ₹ figures and
// admin has zero financial visibility.
//
// Responses:
//   200 — { filename, csv }
//   400 — invalid month / report key
//   401 — no/invalid token, or not staff
//   403 — authenticated staff but not owner ("Owner access required")

export const Route = createFileRoute("/api/admin/reports/export")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);

        let month: unknown;
        let report: unknown;
        try {
          const body = await request.json();
          month = body?.month;
          report = body?.report;
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        if (!isValidMonth(month)) {
          return json({ error: "month must be YYYY-MM" }, 400);
        }
        if (!isReportKey(report)) {
          return json({ error: "report must be one of: subscribers, revenue, seva, pending" }, 400);
        }

        try {
          const monthly = await fetchMonthlyReportData(gate.auth.db, month);
          const subscriberReport = computeSubscriberReport(
            monthly.subs,
            monthly.monthPayments,
            monthly.resumedCount,
            month,
          );

          let csv: string;
          if (report === "subscribers") {
            csv = buildSubscribersCsv(month, subscriberReport);
          } else if (report === "revenue") {
            csv = buildRevenueCsv(
              month,
              computeRevenueReport(monthly.monthPayments, monthly.subs, subscriberReport),
            );
          } else if (report === "seva") {
            csv = buildSevaCsv(month, computeSevaReport(monthly.proofs));
          } else {
            const pending = await fetchPendingSevasReportData(gate.auth.db, month);
            const membership = new Map<string, Set<string>>(
              Object.entries(pending.membership).map(([k, v]) => [k, new Set(v)]),
            );
            csv = buildPendingSevasCsv(
              month,
              computePendingSevas(monthly.subs, pending.batches, membership, month),
            );
          }

          return json({ filename: csvFilename(report, month), csv });
        } catch (err) {
          console.error("reports/export error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
