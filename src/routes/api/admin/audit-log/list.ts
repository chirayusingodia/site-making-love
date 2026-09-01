import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";

// POST /api/admin/audit-log/list
// Body: { page?, pageSize?, dateFrom?, dateTo?, action?, entity?, adminId?, search? }
//
// OWNER-ONLY, read-only. Serves the paginated audit_logs table for
// /admin/audit-log. Never add a mutation endpoint alongside this one —
// the table is append-only by design.
//
// Responses:
//   200 — { rows, total }
//   401 — no/invalid token, or not staff
//   403 — authenticated staff but not owner

interface AuditRow {
  id: string;
  created_at: string;
  action: string;
  entity: string;
  entity_id: string | null;
  admin_id: string | null;
  meta: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/admin/audit-log/list")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) ?? {};
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const page = Math.max(1, Number(body.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(body.pageSize) || 25));
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = gate.auth.db
          .from("audit_logs")
          .select("id, created_at, action, entity, entity_id, admin_id, meta", { count: "exact" })
          .order("created_at", { ascending: false });

        if (typeof body.dateFrom === "string" && body.dateFrom) {
          query = query.gte("created_at", body.dateFrom);
        }
        if (typeof body.dateTo === "string" && body.dateTo) {
          query = query.lte("created_at", body.dateTo);
        }
        if (typeof body.action === "string" && body.action) {
          query = query.eq("action", body.action);
        }
        if (typeof body.entity === "string" && body.entity) {
          query = query.eq("entity", body.entity);
        }
        if (typeof body.adminId === "string" && body.adminId) {
          query = query.eq("admin_id", body.adminId);
        }
        const search = typeof body.search === "string" ? body.search.trim() : "";
        if (search) {
          // entity_id is a uuid column — only filter on it when the
          // search term is actually shaped like one, else Postgres
          // errors on an invalid uuid literal. meta::text ILIKE works
          // for any search term (PostgREST supports the column::type
          // cast syntax directly in a filter).
          const clauses = [`meta::text.ilike.%${search}%`];
          if (UUID_RE.test(search)) clauses.push(`entity_id.eq.${search}`);
          query = query.or(clauses.join(","));
        }

        const { data, error, count } = await query.range(from, to);
        if (error) {
          console.error("audit-log/list error:", error);
          return json({ error: error.message }, 500);
        }

        const rows = (data ?? []) as AuditRow[];
        const adminIds = [...new Set(rows.map((r) => r.admin_id).filter((id): id is string => !!id))];
        let names = new Map<string, string>();
        if (adminIds.length > 0) {
          const { data: profiles } = await gate.auth.db
            .from("profiles")
            .select("id, full_name")
            .in("id", adminIds);
          names = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? p.id as string]));
        }

        return json({
          rows: rows.map((r) => ({
            ...r,
            admin_name: r.admin_id ? (names.get(r.admin_id) ?? r.admin_id) : "System",
          })),
          total: count ?? rows.length,
        });
      },
    },
  },
});
