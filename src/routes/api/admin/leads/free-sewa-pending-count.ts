import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin } from "@/lib/supabase-admin.server";
import { loadFreeSewaPendingCount } from "@/lib/telecaller-data.server";

// POST /api/admin/leads/free-sewa-pending-count
// Auth: staff (admin or owner). Body: none.
//
// Dashboard tile — total leads across all telecallers still awaiting
// free-sewa confirmation (§ Free Sewa gate). Not a financial figure, so
// admin-visible like the other operational counts on /admin/overview.
export const Route = createFileRoute("/api/admin/leads/free-sewa-pending-count")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);

        try {
          const count = await loadFreeSewaPendingCount(auth.db);
          return json({ count });
        } catch (err) {
          console.error("admin/leads/free-sewa-pending-count error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
