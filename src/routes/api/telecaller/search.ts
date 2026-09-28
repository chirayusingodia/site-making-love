import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller } from "@/lib/supabase-admin.server";
import { loadTelecallerDataset } from "@/lib/telecaller-data.server";
import { stripMaskedFieldsDeep, type TelecallerQueueRow } from "@/lib/telecaller-logic";

// POST /api/telecaller/search
// Gate: requireTelecaller. Body: { q: string }
//
// The panel has no other way to find ONE specific person — every
// other surface is queue-shaped (§3), and a queue only shows someone
// who currently belongs there. A customer calling in and asking
// about her own sankalp needs a name/phone lookup that works
// regardless of queue membership. Subscribers are the SAME shared
// pipeline the subscriber queues already read (no tray restriction
// there today — see isInCallersTray's "shared subscription pipeline"
// case) so search mirrors that boundary. Leads stay tray-scoped:
// hers (assigned_to/created_by) unless she sits in a privileged seat.

const MAX_RESULTS = 12;

interface LeadSearchRow {
  id: string;
  full_name: string | null;
  phone: string;
  city: string | null;
  status: string;
  assigned_to: string | null;
  created_by: string | null;
}

export const Route = createFileRoute("/api/telecaller/search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        let body: { q?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const q = typeof body.q === "string" ? body.q.trim() : "";
        if (q.length < 2) {
          return json({ error: "Kam se kam 2 akshar likhein" }, 400);
        }
        // Escape ilike wildcards a free-text query might contain.
        const like = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
        const privileged = auth.role !== "telecaller";

        try {
          const leadQuery = auth.db
            .from("leads")
            .select("id,full_name,phone,city,status,assigned_to,created_by")
            .or(`full_name.ilike.${like},phone.ilike.${like}`)
            .order("created_at", { ascending: false })
            .limit(privileged ? MAX_RESULTS : MAX_RESULTS * 3);

          const [{ data: leadRows, error: leadErr }, dataset] = await Promise.all([
            leadQuery,
            loadTelecallerDataset(auth.db),
          ]);
          if (leadErr) return json({ error: leadErr.message }, 500);

          const leads = ((leadRows ?? []) as LeadSearchRow[])
            .filter(
              (l) =>
                privileged || l.assigned_to === auth.callerId || l.created_by === auth.callerId,
            )
            .slice(0, MAX_RESULTS)
            .map((l) => ({
              kind: "lead" as const,
              leadId: l.id,
              fullName: l.full_name,
              phone: l.phone,
              city: l.city,
              status: l.status,
            }));

          const needle = q.toLowerCase();
          const subscribers = dataset.rows
            .filter((r: TelecallerQueueRow) =>
              [r.fullName, r.sankalpName, r.phone, r.altPhone].some(
                (v) => typeof v === "string" && v.toLowerCase().includes(needle),
              ),
            )
            .slice(0, MAX_RESULTS)
            .map((r: TelecallerQueueRow) => ({
              kind: "subscriber" as const,
              subscriptionId: r.subscriptionId,
              profileId: r.profileId,
              fullName: r.fullName,
              sankalpName: r.sankalpName,
              phone: r.phone,
              altPhone: r.altPhone,
              subscriptionStatus: r.subscriptionStatus,
              planName: r.planName,
            }));

          return json(stripMaskedFieldsDeep({ leads, subscribers }));
        } catch (err) {
          console.error("telecaller/search error:", err);
          return json({ error: err instanceof Error ? err.message : "Search fail" }, 500);
        }
      },
    },
  },
});
