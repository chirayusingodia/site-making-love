import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller } from "@/lib/supabase-admin.server";
import { stripMaskedFieldsDeep, TC_CALLLOG_COLS, TC_PLAN_COLS } from "@/lib/telecaller-logic";

// POST /api/telecaller/lead
// Gate: requireTelecaller. Body: { lead_id }
//
// The lead call-card payload (§6.3 /telecaller/lead/$leadId).
// ANTI-GAMING GUARD (§9.2): she may open ONLY leads assigned to her
// or created by her — a lead she was never given cannot even be
// viewed, let alone worked or credited.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LeadRow {
  id: string;
  full_name: string | null;
  phone: string;
  city: string | null;
  notes: string | null;
  family_names: string[] | null;
  status: string;
  profile_id: string | null;
  subscription_id: string | null;
  attribution_token: string | null;
  source_agent_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  interested_plan_id: string | null;
  free_pooja_at: string | null;
  free_service_batch_cutoff: string | null;
  plans: { name: string; billing_period: string; price_paise: number } | null;
}

export const Route = createFileRoute("/api/telecaller/lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        let body: { lead_id?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const leadId =
          typeof body.lead_id === "string" && UUID_RE.test(body.lead_id) ? body.lead_id : "";
        if (!leadId) return json({ error: "lead_id must be a uuid" }, 400);

        try {
          const { data: lead, error } = await auth.db
            .from("leads")
            .select(
              `id,full_name,phone,city,notes,family_names,status,profile_id,subscription_id,
               attribution_token,source_agent_id,assigned_to,created_by,
               interested_plan_id,free_pooja_at,free_service_batch_cutoff,plans(${TC_PLAN_COLS})`,
            )
            .eq("id", leadId)
            .maybeSingle();
          if (error) return json({ error: error.message }, 500);
          const row = lead as unknown as LeadRow | null;
          if (!row) return json({ error: "Lead not found" }, 404);

          // §9.2 — never hers → not viewable.
          const hers = row.assigned_to === auth.callerId || row.created_by === auth.callerId;
          const privilegedSeat = auth.role === "admin" || auth.role === "owner";
          if (!hers && !privilegedSeat) {
            return json({ error: "Yeh lead aapko assign nahi hui" }, 403);
          }

          const historyRes = await auth.db
            .from("call_logs")
            .select(TC_CALLLOG_COLS)
            .eq("lead_id", leadId)
            .order("created_at", { ascending: false })
            .limit(50);
          if (historyRes.error) return json({ error: historyRes.error.message }, 500);

          return json(
            stripMaskedFieldsDeep({
              lead: {
                leadId: row.id,
                fullName: row.full_name,
                phone: row.phone,
                city: row.city,
                notes: row.notes,
                familyNames: Array.isArray(row.family_names) ? row.family_names : null,
                status: row.status,
                profileId: row.profile_id,
                subscriptionId: row.subscription_id,
                attributionToken: row.attribution_token,
                interestedPlanName: row.plans?.name ?? null,
                interestedPlanBillingPeriod: row.plans?.billing_period ?? null,
                freeSewaConfirmedAt: row.free_pooja_at,
                batchCutoff: row.free_service_batch_cutoff,
              },
              callHistory: historyRes.data ?? [],
            }),
          );
        } catch (err) {
          console.error("telecaller/lead error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
