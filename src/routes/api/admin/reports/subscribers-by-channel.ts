import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";

// POST /api/admin/reports/subscribers-by-channel
// Body: none.
//
// OWNER-ONLY (same tier as the other /reports/* endpoints — this is
// acquisition/marketing-spend-adjacent data). Buckets every subscription
// that ever left `pending` by acquisition_channel — 'telecall',
// 'coupon:<code>', a marketing channel ('instagram', 'facebook',
// 'google_ads', 'whatsapp', 'organic', 'direct', 'referral:<host>' — see
// src/lib/attribution.ts), or null (bucketed as "organic/direct" below,
// covering traffic from before this feature existed too).
//
// Row count is small pre-scale, so grouping happens here in JS rather
// than via a dedicated SQL view/function.

export const Route = createFileRoute("/api/admin/reports/subscribers-by-channel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);

        try {
          const { data, error } = await gate.auth.db
            .from("subscriptions")
            .select("acquisition_channel")
            .neq("status", "pending");
          if (error) return json({ error: error.message }, 500);

          const counts = new Map<string, number>();
          for (const row of (data ?? []) as { acquisition_channel: string | null }[]) {
            const key = row.acquisition_channel?.trim() || "organic/direct";
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }

          const channels = [...counts.entries()]
            .map(([channel, count]) => ({ channel, count }))
            .sort((a, b) => b.count - a.count);

          return json({ channels, total: data?.length ?? 0 });
        } catch (err) {
          console.error("reports/subscribers-by-channel error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
