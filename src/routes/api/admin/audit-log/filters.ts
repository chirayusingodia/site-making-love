import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";

// POST /api/admin/audit-log/filters
// OWNER-ONLY, read-only. Distinct action/entity values and the staff
// list for the /admin/audit-log filter dropdowns.
//
// Responses:
//   200 — { actions: string[], entities: string[], admins: {id, full_name}[] }
//   401 / 403 — see list.ts

const MAX_ROWS = 20_000; // generous cap for a filter-dropdown scan, not a data export

export const Route = createFileRoute("/api/admin/audit-log/filters")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);

        const actions = new Set<string>();
        const entities = new Set<string>();
        const adminIds = new Set<string>();

        for (let from = 0; from < MAX_ROWS; from += 1000) {
          const { data, error } = await gate.auth.db
            .from("audit_logs")
            .select("action, entity, admin_id")
            .range(from, from + 999);
          if (error) return json({ error: error.message }, 500);
          const rows = data ?? [];
          for (const row of rows) {
            if (row.action) actions.add(row.action as string);
            if (row.entity) entities.add(row.entity as string);
            if (row.admin_id) adminIds.add(row.admin_id as string);
          }
          if (rows.length < 1000) break;
        }

        let admins: { id: string; full_name: string | null }[] = [];
        if (adminIds.size > 0) {
          const { data: profiles, error: profErr } = await gate.auth.db
            .from("profiles")
            .select("id, full_name")
            .in("id", [...adminIds]);
          if (profErr) return json({ error: profErr.message }, 500);
          admins = (profiles ?? []) as typeof admins;
        }

        return json({
          actions: [...actions].sort(),
          entities: [...entities].sort(),
          admins: admins.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")),
        });
      },
    },
  },
});
