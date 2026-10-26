import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { isUuid, parseEntryBody } from "@/lib/finance-requests";
import { todayIST } from "@/lib/offline-subscriptions-logic";

// POST /api/admin/finance/entries-upsert        (OWNER ONLY)
// Body: the entry fields (entryDate, categoryId, amountPaise,
//       description, counterparty?, paymentMethod?, referenceNo?,
//       receiptUrl?, amortizeMonths?, sevaId?) + `id` to edit.
//
// Create rejects an ARCHIVED category; editing an entry that already
// sits in a since-archived category is allowed as long as the category
// is unchanged. Every edit writes an audit row with a before/after diff.

const COLUMN_OF = {
  entryDate: "entry_date",
  categoryId: "category_id",
  amountPaise: "amount_paise",
  description: "description",
  counterparty: "counterparty",
  paymentMethod: "payment_method",
  referenceNo: "reference_no",
  receiptUrl: "receipt_url",
  amortizeMonths: "amortize_months",
  sevaId: "seva_id",
} as const;

export const Route = createFileRoute("/api/admin/finance/entries-upsert")({
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

        const parsed = parseEntryBody(body, todayIST(new Date()));
        if (!parsed.ok) return json({ error: parsed.error }, 400);
        const v = parsed.value;
        const row = {
          entry_date: v.entryDate,
          category_id: v.categoryId,
          amount_paise: v.amountPaise,
          description: v.description,
          counterparty: v.counterparty,
          payment_method: v.paymentMethod,
          reference_no: v.referenceNo,
          receipt_url: v.receiptUrl,
          amortize_months: v.amortizeMonths,
          seva_id: v.sevaId,
        };

        const isEdit = body.id !== undefined && body.id !== null;
        if (isEdit && !isUuid(body.id)) return json({ error: "id sahi nahi hai" }, 400);

        try {
          const { data: cat, error: catErr } = await db
            .from("finance_categories")
            .select("id,is_archived")
            .eq("id", v.categoryId)
            .maybeSingle();
          if (catErr) return json({ error: catErr.message }, 500);
          if (!cat) return json({ error: "Category nahi mili" }, 404);

          if (!isEdit) {
            if (cat.is_archived)
              return json({ error: "Yeh category archived hai — naya entry nahi ban sakta" }, 409);
            const { data, error } = await db
              .from("finance_entries")
              .insert({ ...row, created_by: staffId })
              .select("id")
              .single();
            if (error) return json({ error: error.message }, 500);
            await writeTelecallerAudit(
              db,
              staffId,
              "finance.entry.created",
              "finance_entries",
              data.id,
              row,
            );
            return json({ ok: true, id: data.id });
          }

          const id = body.id as string;
          const { data: before, error: beforeErr } = await db
            .from("finance_entries")
            .select(
              "entry_date,category_id,amount_paise,description,counterparty,payment_method,reference_no,receipt_url,amortize_months,seva_id,deleted_at",
            )
            .eq("id", id)
            .maybeSingle();
          if (beforeErr) return json({ error: beforeErr.message }, 500);
          if (!before) return json({ error: "Entry nahi mili" }, 404);
          if (before.deleted_at) return json({ error: "Deleted entry edit nahi ho sakti" }, 409);
          if (cat.is_archived && before.category_id !== v.categoryId) {
            return json({ error: "Yeh category archived hai" }, 409);
          }

          const diffBefore: Record<string, unknown> = {};
          const diffAfter: Record<string, unknown> = {};
          for (const col of Object.values(COLUMN_OF)) {
            const prev = (before as Record<string, unknown>)[col] ?? null;
            const next = (row as Record<string, unknown>)[col] ?? null;
            if (prev !== next) {
              diffBefore[col] = prev;
              diffAfter[col] = next;
            }
          }
          if (Object.keys(diffAfter).length === 0) return json({ ok: true, id, unchanged: true });

          const { data: updated, error } = await db
            .from("finance_entries")
            .update({ ...row, updated_by: staffId, updated_at: new Date().toISOString() })
            .eq("id", id)
            .is("deleted_at", null)
            .select("id");
          if (error) return json({ error: error.message }, 500);
          if (!updated || updated.length === 0)
            return json({ error: "Entry abhi delete ho gayi" }, 409);
          await writeTelecallerAudit(db, staffId, "finance.entry.updated", "finance_entries", id, {
            before: diffBefore,
            after: diffAfter,
          });
          return json({ ok: true, id });
        } catch (err) {
          console.error("finance/entries-upsert error:", err);
          return json({ error: err instanceof Error ? err.message : "Save failed" }, 500);
        }
      },
    },
  },
});
