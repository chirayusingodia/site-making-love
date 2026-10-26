import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { parsePnlRequest } from "@/lib/finance-requests";
import { fetchPnlData } from "@/lib/finance-data.server";
import { toLedgerSheet, toPnlSheet, type LedgerRowLite } from "@/lib/finance-logic";
import { buildXlsx } from "@/lib/xlsx-write";

// POST /api/admin/finance/export        (OWNER ONLY)
// Body: { fromYm, toYm, basis }
// Returns { filename, base64 } — an .xlsx with a P&L sheet and a Ledger
// sheet, filename punyata-pnl-<from>_<to>.xlsx. Built from the SAME
// fetchPnlData the dashboard uses, so the file can never drift from the
// on-screen numbers.

export const Route = createFileRoute("/api/admin/finance/export")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const parsed = parsePnlRequest(body);
        if (!parsed.ok) return json({ error: parsed.error }, 400);

        try {
          const data = await fetchPnlData(gate.auth.db, { ...parsed.value, compare: null });
          const ledger: LedgerRowLite[] = data.ledger.map((r) => {
            const cat = Array.isArray(r.finance_categories)
              ? r.finance_categories[0]
              : r.finance_categories;
            return {
              entry_date: r.entry_date,
              category_name: cat?.name ?? "",
              entry_type: cat?.entry_type ?? "expense",
              amount_paise: r.amount_paise,
              description: r.description,
              counterparty: r.counterparty,
              payment_method: r.payment_method,
              reference_no: r.reference_no,
              amortize_months: r.amortize_months,
            };
          });
          const bytes = await buildXlsx([
            { name: `P&L (${data.basis})`, rows: toPnlSheet(data.pnl, data.categories) },
            { name: "Ledger", rows: toLedgerSheet(ledger) },
          ]);
          return json({
            filename: `punyata-pnl-${data.fromYm}_${data.toYm}.xlsx`,
            base64: Buffer.from(bytes).toString("base64"),
          });
        } catch (err) {
          console.error("finance/export error:", err);
          return json({ error: err instanceof Error ? err.message : "Export failed" }, 500);
        }
      },
    },
  },
});
