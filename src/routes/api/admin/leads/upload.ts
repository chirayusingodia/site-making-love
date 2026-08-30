import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { normalizePhoneE164 } from "@/lib/auth.server";
import { fetchAllRows } from "@/lib/supabase";
import { routingStamp } from "@/lib/agent-portal-logic";
import { nextBatchCutoff } from "@/lib/telecaller-logic";

// [Pass-2 P11] shape-check ids as real UUIDs — length===36 let any
// 36-char string through to a Postgres uuid-cast 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/admin/leads/upload
// Auth: staff (admin OR owner). Body:
//   { source_agent_id?: uuid, hospital_id?: uuid,
//     rows: [{ full_name?, phone, city?, notes?, interested_plan_slug? }] }
//
// §8.2 — owner/admin upload on the field agent's behalf.
//  • Phone normalized via normalizePhoneE164() BEFORE insert; an
//    un-normalizable number is a PER-ROW error, never a silent skip.
//  • Dedupe on upload, not silent insert: a phone matching an OPEN
//    lead, or a profiles row with an ACTIVE subscription, marks the
//    new row 'duplicate' and the uploader sees why — otherwise a
//    number gets worked, and PAID on, twice.
// §4.3 (Hospitals session): pass hospital_id (per batch) and the
// sourcing agent is DERIVED from the hospital's current allotment via
// current_hospital_agent() — unless an explicit source_agent_id is
// given, which overrides. Both hospital_id and source_agent_id are
// stamped on every inserted/duplicate row.

interface UploadRow {
  index: number;
  ok: boolean;
  leadId?: string;
  status?: "inserted" | "duplicate" | "assigned";
  reason?: string;
}

export const Route = createFileRoute("/api/admin/leads/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);

        let body: {
          source_agent_id?: unknown;
          hospital_id?: unknown;
          rows?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const explicitSourceAgentId =
          typeof body.source_agent_id === "string" && UUID_RE.test(body.source_agent_id)
            ? body.source_agent_id
            : null;
        const hospitalId =
          typeof body.hospital_id === "string" && UUID_RE.test(body.hospital_id)
            ? body.hospital_id
            : null;
        if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > 500) {
          return json({ error: "rows required (1-500 per batch)" }, 400);
        }

        try {
          const db = auth.db;

          // §4.3: derive the sourcing agent from the hospital's CURRENT
          // allotment — an explicit source_agent_id overrides. The RPC is
          // service-role only (C1 REVOKE in migration 014).
          let sourceAgentId = explicitSourceAgentId;
          if (!sourceAgentId && hospitalId) {
            const { data: derived, error: rpcErr } = await db.rpc("current_hospital_agent", {
              p_hospital: hospitalId,
            });
            if (rpcErr) return json({ error: `allotment lookup failed: ${rpcErr.message}` }, 500);
            sourceAgentId = (derived as string | null) ?? null;
          }
          if (hospitalId && !sourceAgentId && !explicitSourceAgentId) {
            return json(
              {
                error:
                  "Is hospital ka koi active agent allot nahi hai — pehle allot karein ya agent manually chunein",
              },
              422,
            );
          }
          // Validate the hospital exists when given — and [Pass-2 P11]
          // an explicit sourcing agent must exist and be ACTIVE, same
          // as hospital_id (previously stamped onto leads unchecked).
          if (hospitalId) {
            const { data: hosp } = await db
              .from("hospitals")
              .select("id")
              .eq("id", hospitalId)
              .maybeSingle();
            if (!hosp) return json({ error: "Hospital not found" }, 404);
          }
          if (explicitSourceAgentId) {
            const { data: agent } = await db
              .from("sales_agents")
              .select("id,is_active")
              .eq("id", explicitSourceAgentId)
              .maybeSingle();
            if (!agent || !agent.is_active) {
              return json({ error: "Sourcing agent not found or inactive" }, 404);
            }
          }

          // Migration 020: an ACTIVE lead_routing row for the resolved
          // sourcing agent sends every FRESH insert straight into that
          // telecaller's Aaj Ke Leads tray. Duplicates stay unstamped —
          // they must never surface in a caller's working queue.
          let stamp: ReturnType<typeof routingStamp> = null;
          if (sourceAgentId) {
            const { data: route, error: routeErr } = await db
              .from("lead_routing")
              .select("telecaller_id,is_active")
              .eq("sales_agent_id", sourceAgentId)
              .maybeSingle();
            if (routeErr && !/relation|does not exist/i.test(routeErr.message)) {
              return json({ error: `routing lookup failed: ${routeErr.message}` }, 500);
            }
            stamp = routingStamp(
              route
                ? { telecallerId: route.telecaller_id as string, isActive: route.is_active as boolean }
                : null,
            );
          }

          // Catalogue for dedupe decisions. [Pass-2 P7] both catalogues
          // page through the ~1000-row PostgREST cap — a truncated
          // catalogue let already-worked numbers pass dedupe and get
          // PAID twice, the exact fraud this upload guards against.
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
          // Active subscribers' profile ids → their phones.
          const activeUserIds = new Set(activeSubsAll.data.map((s) => s.user_id));
          const phoneByUserId = new Map<string, string>();
          // [Pass-2 P7] chunked .in() — thousands of UUIDs in one
          // filter exceed URL length limits.
          const activeUserIdList = [...activeUserIds];
          for (let i = 0; i < activeUserIdList.length; i += 200) {
            const { data: profs } = await db
              .from("profiles")
              .select("id,phone")
              .in("id", activeUserIdList.slice(i, i + 200));
            for (const p of profs ?? []) {
              if (p.phone) phoneByUserId.set(p.id as string, p.phone as string);
            }
          }
          const activePhones = new Set(phoneByUserId.values());

          const results: UploadRow[] = [];
          const inserts: Record<string, unknown>[] = [];

          for (let i = 0; i < (body.rows as unknown[]).length; i++) {
            const raw = (body.rows as Record<string, unknown>[])[i];
            const fullName =
              typeof raw.full_name === "string" && raw.full_name.trim()
                ? raw.full_name.trim().slice(0, 120)
                : null;
            const rawPhone = typeof raw.phone === "string" ? raw.phone : "";
            const phone = normalizePhoneE164(rawPhone);
            if (!phone) {
              results.push({
                index: i,
                ok: false,
                reason: `Row ${i + 1}: phone "${rawPhone}" sahi Indian number nahi hai`,
              });
              continue;
            }
            if (activePhones.has(phone)) {
              // Duplicate of a PAYING customer — mark, don't insert.
              const ins = await db
                .from("leads")
                .insert({
                  full_name: fullName,
                  phone,
                  city: typeof raw.city === "string" ? raw.city.trim().slice(0, 80) : null,
                  notes: typeof raw.notes === "string" ? raw.notes.slice(0, 1000) : null,
                  source_agent_id: sourceAgentId,
                  hospital_id: hospitalId,
                  status: "duplicate",
                  created_by: auth.staffId,
                })
                .select("id")
                .single();
              results.push({
                index: i,
                ok: true,
                leadId: ins.data?.id ?? undefined,
                status: "duplicate",
                reason: "Pehle se ACTIVE subscriber hai",
              });
              continue;
            }
            if (openLeadPhones.has(phone)) {
              const ins = await db
                .from("leads")
                .insert({
                  full_name: fullName,
                  phone,
                  city: typeof raw.city === "string" ? raw.city.trim().slice(0, 80) : null,
                  notes: typeof raw.notes === "string" ? raw.notes.slice(0, 1000) : null,
                  source_agent_id: sourceAgentId,
                  hospital_id: hospitalId,
                  status: "duplicate",
                  created_by: auth.staffId,
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
            openLeadPhones.add(phone); // within-batch dedupe too
            inserts.push({
              full_name: fullName,
              phone,
              city: typeof raw.city === "string" ? raw.city.trim().slice(0, 80) : null,
              notes: typeof raw.notes === "string" ? raw.notes.slice(0, 1000) : null,
              source_agent_id: sourceAgentId,
              // Keep the upload's hospital attribution on normal inserts too.
              // The duplicate branch already stamps this; omitting it here
              // silently broke hospital reporting for every fresh lead.
              hospital_id: hospitalId,
              // § Free Sewa gate: only agent-sourced leads are gated — a
              // pure admin upload with no agent stays exempt (label only,
              // does not delay visibility — see loadFreeSewaPendingLeads()).
              ...(sourceAgentId
                ? { free_service_batch_cutoff: nextBatchCutoff(new Date()).isoDate }
                : {}),
              created_by: auth.staffId,
              ...(stamp ?? {}),
            });
            results.push({ index: i, ok: true, status: stamp ? "assigned" : "inserted" });
          }

          let insertedCount = 0;
          if (inserts.length > 0) {
            const ins = await db.from("leads").insert(inserts).select("id");
            if (ins.error) return json({ error: ins.error.message }, 500);
            insertedCount = (ins.data ?? []).length;
          }

          await writeTelecallerAudit(db, auth.staffId, "admin.leads.uploaded", "leads", null, {
            total_rows: (body.rows as unknown[]).length,
            inserted: insertedCount,
            duplicates_or_errors: results.filter((r) => r.status !== "inserted" && r.status !== "assigned").length,
            source_agent_id: sourceAgentId,
            hospital_id: hospitalId,
            auto_assigned_to: stamp?.assigned_to ?? null,
          });

          return json({
            ok: true,
            inserted: insertedCount,
            results,
          });
        } catch (err) {
          console.error("admin/leads/upload error:", err);
          return json({ error: err instanceof Error ? err.message : "Upload failed" }, 500);
        }
      },
    },
  },
});
