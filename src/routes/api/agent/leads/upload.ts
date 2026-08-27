import { createFileRoute } from "@tanstack/react-router";
import { json, requireAgent, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { fetchAllRows } from "@/lib/supabase";
import {
  AGENT_MAX_BATCH,
  sanitizeAgentLeadRow,
  routingStamp,
  type SanitizedLeadRow,
} from "@/lib/agent-portal-logic";

// POST /api/agent/leads/upload
// Gate: requireAgent (profiles.role='agent' + sales_agent_id link).
// Body: { rows: [{ fullName?, phone, city?, notes?, familyNames?[] }] }
//
// The field agent uploads the numbers SHE collected (§8 flow, portal
// edition): same dedupe discipline as the admin paste-upload (an open
// lead or an ACTIVE subscriber is marked 'duplicate', never silently
// re-worked), and the sourcing agent is ALWAYS herself.
//
// Owner routing applies at insert time: if lead_routing has an ACTIVE
// route for her, every inserted row lands in that telecaller's
// Aaj Ke Leads tray immediately; otherwise it waits in the 'new' pool
// for the daily assignment.
interface UploadResultRow {
  index: number;
  ok: boolean;
  status?: "inserted" | "duplicate" | "assigned";
  leadId?: string;
  reason?: string;
}

export const Route = createFileRoute("/api/agent/leads/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAgent(request);
        if (!auth) return json({ error: "Agent login required" }, 401);
        if (!auth.salesAgentId) {
          return json(
            { error: "Aapki agent ID linked nahi hai — Chirayu se contact karein." },
            403,
          );
        }

        let body: { rows?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        if (
          !Array.isArray(body.rows) ||
          body.rows.length === 0 ||
          body.rows.length > AGENT_MAX_BATCH
        ) {
          return json({ error: `rows required (1-${AGENT_MAX_BATCH} per batch)` }, 400);
        }

        try {
          const db = auth.db;

          // Same dedupe catalogues as the admin upload — a number must
          // not get worked (and PAID on) twice. Paged past the ~1000
          // PostgREST cap exactly like leads/upload does.
          const [openLeadsAll, activeSubsAll] = await Promise.all([
            fetchAllRows<{ phone: string }>((from, to) =>
              db
                .from("leads")
                .select("phone,status")
                .in("status", ["new", "assigned", "in_progress", "link_sent"])
                .range(from, to),
            ),
            fetchAllRows<{ user_id: string }>((from, to) =>
              db
                .from("subscriptions")
                .select("user_id,status")
                .eq("status", "active")
                .range(from, to),
            ),
          ]);
          if (openLeadsAll.error) return json({ error: openLeadsAll.error }, 500);
          if (activeSubsAll.error) return json({ error: activeSubsAll.error }, 500);

          const openLeadPhones = new Set(openLeadsAll.data.map((l) => l.phone));
          const phoneByUserId = new Map<string, string>();
          for (let i = 0; i < activeSubsAll.data.length; i += 200) {
            const chunk = activeSubsAll.data.slice(i, i + 200).map((s) => s.user_id);
            const { data: profs } = await db.from("profiles").select("id,phone").in("id", chunk);
            for (const p of profs ?? []) {
              if (p.phone) phoneByUserId.set(p.id as string, p.phone as string);
            }
          }
          const activePhones = new Set(phoneByUserId.values());

          // Owner's route for THIS agent decides instant assignment.
          // Pre-migration-020 tolerance: a missing lead_routing table
          // degrades to "no route" instead of failing every upload.
          const { data: route, error: routeErr } = await db
            .from("lead_routing")
            .select("telecaller_id,is_active")
            .eq("sales_agent_id", auth.salesAgentId)
            .maybeSingle();
          if (routeErr && !/relation|schema cache|does not exist/i.test(routeErr.message)) {
            return json({ error: `routing lookup failed: ${routeErr.message}` }, 500);
          }
          const stamp = routingStamp(
            route
              ? {
                  telecallerId: route.telecaller_id as string,
                  isActive: route.is_active as boolean,
                }
              : null,
          );

          const results: UploadResultRow[] = [];
          const inserts: Record<string, unknown>[] = [];

          const rowsIn = body.rows as unknown[];
          for (let i = 0; i < rowsIn.length; i++) {
            const res = sanitizeAgentLeadRow(rowsIn[i] as never);
            if (!res.ok) {
              results.push({ index: i, ok: false, reason: res.reason });
              continue;
            }
            const clean: SanitizedLeadRow = res.row;

            if (activePhones.has(clean.phone)) {
              const ins = await db
                .from("leads")
                .insert({
                  full_name: clean.full_name,
                  phone: clean.phone,
                  city: clean.city,
                  notes: clean.notes,
                  family_names: clean.family_names,
                  source_agent_id: auth.salesAgentId,
                  status: "duplicate",
                  created_by: auth.userId,
                })
                .select("id")
                .single();
              results.push({
                index: i,
                ok: true,
                leadId: ins.data?.id ?? undefined,
                status: "duplicate",
                reason: "Yeh number pehle se PAYING customer hai",
              });
              continue;
            }
            if (openLeadPhones.has(clean.phone)) {
              const ins = await db
                .from("leads")
                .insert({
                  full_name: clean.full_name,
                  phone: clean.phone,
                  city: clean.city,
                  notes: clean.notes,
                  family_names: clean.family_names,
                  source_agent_id: auth.salesAgentId,
                  status: "duplicate",
                  created_by: auth.userId,
                })
                .select("id")
                .single();
              results.push({
                index: i,
                ok: true,
                leadId: ins.data?.id ?? undefined,
                status: "duplicate",
                reason: "Is number par lead pehle se OPEN hai",
              });
              continue;
            }
            openLeadPhones.add(clean.phone); // within-batch dedupe too
            inserts.push({
              full_name: clean.full_name,
              phone: clean.phone,
              city: clean.city,
              notes: clean.notes,
              family_names: clean.family_names,
              source_agent_id: auth.salesAgentId,
              created_by: auth.userId,
              ...(stamp ?? {}),
            });
            results.push({
              index: i,
              ok: true,
              status: stamp ? "assigned" : "inserted",
            });
          }

          let insertedCount = 0;
          if (inserts.length > 0) {
            const ins = await db.from("leads").insert(inserts).select("id");
            if (ins.error) return json({ error: ins.error.message }, 500);
            insertedCount = (ins.data ?? []).length;
          }

          await writeTelecallerAudit(db, auth.userId, "agent.leads.uploaded", "leads", null, {
            sales_agent_id: auth.salesAgentId,
            total_rows: rowsIn.length,
            inserted: insertedCount,
            duplicates_or_errors: results.filter(
              (r) => r.status !== "inserted" && r.status !== "assigned",
            ).length,
            auto_assigned_to: stamp?.assigned_to ?? null,
          });

          return json({
            ok: true,
            inserted: insertedCount,
            routedToTelecaller: Boolean(stamp),
            results,
          });
        } catch (err) {
          console.error("agent/leads/upload error:", err);
          return json({ error: err instanceof Error ? err.message : "Upload failed" }, 500);
        }
      },
    },
  },
});
