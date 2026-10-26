import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { isUuid, parseReason } from "@/lib/finance-requests";

// POST /api/admin/finance/entries-delete        (OWNER ONLY)
// Body: { id, reason }   reason: 3-300 chars, required
// SOFT delete only (deleted_at + deleted_by + delete_reason); the row
// stays in the table and in the audit log with its full snapshot.

export const Route = createFileRoute("/api/admin/finance/entries-delete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);
        const { db, staffId } = gate.auth;

        let body: { id?: unknown; reason?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        if (!isUuid(body.id)) return json({ error: "id zaroori hai" }, 400);
        const reason = parseReason(body.reason);
        if (!reason.ok) return json({ error: reason.error }, 400);

        try {
          const { data: before, error: beforeErr } = await db
            .from("finance_entries")
            .select(
              "entry_date,category_id,amount_paise,description,counterparty,payment_method,reference_no,deleted_at",
            )
            .eq("id", body.id)
            .maybeSingle();
          if (beforeErr) return json({ error: beforeErr.message }, 500);
          if (!before) return json({ error: "Entry nahi mili" }, 404);
          if (before.deleted_at) return json({ error: "Entry pehle se delete hai" }, 409);

          const { data, error } = await db
            .from("finance_entries")
            .update({
              deleted_at: new Date().toISOString(),
              deleted_by: staffId,
              delete_reason: reason.value,
            })
            .eq("id", body.id)
            .is("deleted_at", null)
            .select("id");
          if (error) return json({ error: error.message }, 500);
          if (!data || data.length === 0) return json({ error: "Entry pehle se delete hai" }, 409);

          await writeTelecallerAudit(
            db,
            staffId,
            "finance.entry.deleted",
            "finance_entries",
            body.id,
            {
              reason: reason.value,
              entry: before,
            },
          );
          return json({ ok: true, id: body.id });
        } catch (err) {
          console.error("finance/entries-delete error:", err);
          return json({ error: err instanceof Error ? err.message : "Delete failed" }, 500);
        }
      },
    },
  },
});
