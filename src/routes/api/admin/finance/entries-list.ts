import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { isRealDate, isUuid } from "@/lib/finance-requests";

// POST /api/admin/finance/entries-list        (OWNER ONLY)
// Body: { from, to (YYYY-MM-DD), categoryId?, entryType?, q?,
//         includeDeleted?, page?, pageSize? }
// Paged ledger, newest first. `total` is the exact match count.

const PAGE_SIZE_MAX = 100;

export const Route = createFileRoute("/api/admin/finance/entries-list")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);
        const { db } = gate.auth;

        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        if (!isRealDate(body.from) || !isRealDate(body.to) || body.from > body.to) {
          return json({ error: "from / to tareekh (YYYY-MM-DD) sahi nahi hain" }, 400);
        }
        if (body.categoryId !== undefined && body.categoryId !== null && !isUuid(body.categoryId)) {
          return json({ error: "categoryId sahi nahi hai" }, 400);
        }
        if (
          body.entryType !== undefined &&
          body.entryType !== null &&
          body.entryType !== "expense" &&
          body.entryType !== "income"
        ) {
          return json({ error: "entryType expense ya income hona chahiye" }, 400);
        }
        const page = typeof body.page === "number" && body.page >= 1 ? Math.floor(body.page) : 1;
        const pageSize =
          typeof body.pageSize === "number" && body.pageSize >= 1
            ? Math.min(PAGE_SIZE_MAX, Math.floor(body.pageSize))
            : 50;

        try {
          let query = db
            .from("finance_entries")
            .select(
              "id,entry_date,category_id,amount_paise,description,counterparty,payment_method,reference_no," +
                "receipt_url,amortize_months,seva_id,created_at,updated_at,deleted_at,delete_reason," +
                "finance_categories!inner(name,entry_type,pnl_group,is_archived)",
              { count: "exact" },
            )
            .gte("entry_date", body.from)
            .lte("entry_date", body.to);

          if (body.includeDeleted !== true) query = query.is("deleted_at", null);
          if (typeof body.categoryId === "string") query = query.eq("category_id", body.categoryId);
          if (typeof body.entryType === "string") {
            query = query.eq("finance_categories.entry_type", body.entryType);
          }
          if (typeof body.q === "string" && body.q.trim()) {
            // Strip characters that would break PostgREST's or() grammar / LIKE.
            const q = body.q
              .replace(/[,()%*\\]/g, " ")
              .trim()
              .slice(0, 80);
            if (q) query = query.or(`description.ilike.%${q}%,counterparty.ilike.%${q}%`);
          }

          const fromIdx = (page - 1) * pageSize;
          const { data, error, count } = await query
            .order("entry_date", { ascending: false })
            .order("created_at", { ascending: false })
            .range(fromIdx, fromIdx + pageSize - 1);
          if (error) return json({ error: error.message }, 500);
          return json({ entries: data ?? [], total: count ?? 0, page, pageSize });
        } catch (err) {
          console.error("finance/entries-list error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
