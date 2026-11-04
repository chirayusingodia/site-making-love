import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { fetchPayrollData } from "@/lib/telecaller-payroll.server";
import { buildXlsx, type XlsxCell } from "@/lib/xlsx-write";

// POST /api/admin/commissions/payroll-export   (OWNER ONLY)
// Body: { period }. Returns { filename, base64 } — monthly salary sheet
// (one row per telecaller) + a per-subscriber detail sheet + payout history.
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const rs = (paise: number) => Math.round(paise) / 100;
const STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  partial: "Partly paid",
  held_only: "Held (30-day window)",
  no_earnings: "No earnings",
};

export const Route = createFileRoute("/api/admin/commissions/payroll-export")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);

        let body: { period?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const period = typeof body.period === "string" && PERIOD_RE.test(body.period) ? body.period : "";
        if (!period) return json({ error: "period must be YYYY-MM" }, 400);

        try {
          const d = await fetchPayrollData(gate.auth.db, period);
          const salary: XlsxCell[][] = [
            ["Telecaller", "Phone", "New conversions (₹80)", "Trail subscribers (₹20)", "Earned ₹", "Clawback ₹", "Payable now ₹", "Held ₹", "Paid ₹", "Status"],
            ...d.rows
              .filter((r) => r.status !== "no_earnings")
              .map((r): XlsxCell[] => [
                r.name, r.phone, r.newConversions, r.trailSubscribers, rs(r.earnedPaise),
                rs(r.clawbackPaise), rs(r.payablePaise), rs(r.heldPaise), rs(r.paidPaise),
                STATUS_LABEL[r.status] ?? r.status,
              ]),
            ["TOTAL", null, d.totals.newConversions, null, rs(d.totals.earnedPaise), null, rs(d.totals.payablePaise), rs(d.totals.heldPaise), rs(d.totals.paidPaise), null],
          ];
          const detail: XlsxCell[][] = [
            ["Telecaller", "Subscriber", "Subscriber phone", "Type", "Amount ₹", "Status"],
            ...d.rows.flatMap((r) =>
              r.lines.map((l): XlsxCell[] => [
                r.name, l.subscriberName, l.subscriberPhone,
                l.kind === "first_deal" ? "New conversion" : "Monthly trail",
                rs(l.amountPaise), l.status,
              ]),
            ),
          ];
          const history: XlsxCell[][] = [
            ["Paid on", "Telecaller", "For month", "Amount ₹", "Method", "Reference", "Note"],
            ...d.payouts
              .filter((p) => p.payout_period === period)
              .map((p): XlsxCell[] => [
                p.paid_at.slice(0, 10), p.telecallerName, p.payout_period, rs(p.amount_paise),
                p.method, p.reference_no, p.note,
              ]),
          ];
          const bytes = await buildXlsx([
            { name: `Salary ${period}`, rows: salary },
            { name: "Subscriber detail", rows: detail },
            { name: "Payments made", rows: history },
          ]);
          return json({
            filename: `punyata-telecaller-payroll-${period}.xlsx`,
            base64: Buffer.from(bytes).toString("base64"),
          });
        } catch (err) {
          console.error("commissions/payroll-export error:", err);
          return json({ error: err instanceof Error ? err.message : "Export failed" }, 500);
        }
      },
    },
  },
});
