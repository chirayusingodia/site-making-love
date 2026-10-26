import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { fetchAllRows } from "@/lib/supabase";
import { isUuid, parseCategoryBody } from "@/lib/finance-requests";

// POST /api/admin/finance/categories        (OWNER ONLY)
// Body: { action: 'list' }
//     | { action: 'upsert', id?, name, entryType, pnlGroup, sortOrder? }
//     | { action: 'archive', id, archived }
//
// Categories can be added, renamed and archived — never deleted. Once a
// category has entries its entry_type / pnl_group are frozen (409):
// flipping a group would silently rewrite every past P&L.

async function entryCounts(
  db: import("@supabase/supabase-js").SupabaseClient,
): Promise<{ counts: Map<string, number> } | { error: string }> {
  const res = await fetchAllRows<{ category_id: string }>((from, to) =>
    db.from("finance_entries").select("category_id").is("deleted_at", null).range(from, to),
  );
  if (res.error) return { error: res.error };
  const counts = new Map<string, number>();
  for (const r of res.data) counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1);
  return { counts };
}

export const Route = createFileRoute("/api/admin/finance/categories")({
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

        try {
          if (body.action === "list") {
            const { data, error } = await db
              .from("finance_categories")
              .select("id,name,entry_type,pnl_group,sort_order,is_archived")
              .order("pnl_group")
              .order("sort_order")
              .order("name");
            if (error) return json({ error: error.message }, 500);
            const c = await entryCounts(db);
            if ("error" in c) return json({ error: c.error }, 500);
            return json({
              categories: (data ?? []).map((r) => ({
                ...r,
                entry_count: c.counts.get(r.id as string) ?? 0,
              })),
            });
          }

          if (body.action === "upsert") {
            const parsed = parseCategoryBody(body);
            if (!parsed.ok) return json({ error: parsed.error }, 400);
            const v = parsed.value;

            if (body.id === undefined || body.id === null) {
              const { data, error } = await db
                .from("finance_categories")
                .insert({
                  name: v.name,
                  entry_type: v.entryType,
                  pnl_group: v.pnlGroup,
                  ...(v.sortOrder !== null ? { sort_order: v.sortOrder } : {}),
                })
                .select("id")
                .single();
              if (error) {
                if (error.code === "23505")
                  return json({ error: "Is naam ki category pehle se hai" }, 409);
                return json({ error: error.message }, 500);
              }
              await writeTelecallerAudit(
                db,
                staffId,
                "finance.category.created",
                "finance_categories",
                data.id,
                {
                  name: v.name,
                  entry_type: v.entryType,
                  pnl_group: v.pnlGroup,
                },
              );
              return json({ ok: true, id: data.id });
            }

            if (!isUuid(body.id)) return json({ error: "id sahi nahi hai" }, 400);
            const { data: before, error: beforeErr } = await db
              .from("finance_categories")
              .select("id,name,entry_type,pnl_group,sort_order")
              .eq("id", body.id)
              .maybeSingle();
            if (beforeErr) return json({ error: beforeErr.message }, 500);
            if (!before) return json({ error: "Category nahi mili" }, 404);

            if (before.entry_type !== v.entryType || before.pnl_group !== v.pnlGroup) {
              const c = await entryCounts(db);
              if ("error" in c) return json({ error: c.error }, 500);
              if ((c.counts.get(body.id) ?? 0) > 0) {
                return json(
                  {
                    error:
                      "Is category mein entries hain — type/group badal nahi sakte, sirf naam badlein",
                  },
                  409,
                );
              }
            }
            const { error } = await db
              .from("finance_categories")
              .update({
                name: v.name,
                entry_type: v.entryType,
                pnl_group: v.pnlGroup,
                ...(v.sortOrder !== null ? { sort_order: v.sortOrder } : {}),
              })
              .eq("id", body.id);
            if (error) {
              if (error.code === "23505")
                return json({ error: "Is naam ki category pehle se hai" }, 409);
              return json({ error: error.message }, 500);
            }
            await writeTelecallerAudit(
              db,
              staffId,
              "finance.category.updated",
              "finance_categories",
              body.id,
              {
                before,
                after: {
                  name: v.name,
                  entry_type: v.entryType,
                  pnl_group: v.pnlGroup,
                  sort_order: v.sortOrder,
                },
              },
            );
            return json({ ok: true, id: body.id });
          }

          if (body.action === "archive") {
            if (!isUuid(body.id)) return json({ error: "id sahi nahi hai" }, 400);
            if (typeof body.archived !== "boolean")
              return json({ error: "archived true/false hona chahiye" }, 400);
            const { data, error } = await db
              .from("finance_categories")
              .update({ is_archived: body.archived })
              .eq("id", body.id)
              .select("id");
            if (error) return json({ error: error.message }, 500);
            if (!data || data.length === 0) return json({ error: "Category nahi mili" }, 404);
            await writeTelecallerAudit(
              db,
              staffId,
              body.archived ? "finance.category.archived" : "finance.category.unarchived",
              "finance_categories",
              body.id,
              { archived: body.archived },
            );
            return json({ ok: true, id: body.id, archived: body.archived });
          }

          return json({ error: "action list | upsert | archive hona chahiye" }, 400);
        } catch (err) {
          console.error("finance/categories error:", err);
          return json({ error: err instanceof Error ? err.message : "Request failed" }, 500);
        }
      },
    },
  },
});
