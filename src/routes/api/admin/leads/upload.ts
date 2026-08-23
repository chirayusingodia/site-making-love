import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { normalizePhoneE164 } from "@/lib/auth.server";

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
  status?: "inserted" | "duplicate";
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
          typeof body.source_agent_id === "string" && body.source_agent_id.length === 36
            ? body.source_agent_id
            : null;
        const hospitalId =
          typeof body.hospital_id === "string" && body.hospital_id.length === 36
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
          // Validate the hospital exists when given.
          if (hospitalId) {
            const { data: hosp } = await db
              .from("hospitals")
              .select("id")
              .eq("id", hospitalId)
              .maybeSingle();
            if (!hosp) return json({ error: "Hospital not found" }, 404);
          }

          // Catalogue for dedupe decisions.
          const [openLeadsRes, activeSubsRes] = await Promise.all([
            db
              .from("leads")
              .select("phone,status")
              .in("status", ["new", "assigned", "in_progress", "link_sent"]),
            db.from("subscriptions").select("user_id,status").eq("status", "active"),
          ]);
          if (openLeadsRes.error) return json({ error: openLeadsRes.error.message }, 500);
          if (activeSubsRes.error) return json({ error: activeSubsRes.error.message }, 500);

          const openLeadPhones = new Set(
            (openLeadsRes.data as { phone: string }[]).map((l) => l.phone),
          );
          // Active subscribers' profile ids → their phones.
          const activeUserIds = new Set(
            (activeSubsRes.data as { user_id: string }[]).map((s) => s.user_id),
          );
          const phoneByUserId = new Map<string, string>();
          if (activeUserIds.size > 0) {
            const { data: profs } = await db
              .from("profiles")
              .select("id,phone")
              .in("id", [...activeUserIds]);
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
              hospital_id: hospitalId,
              created_by: auth.staffId,
            });
            results.push({ index: i, ok: true, status: "inserted" });
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
            duplicates_or_errors: results.filter((r) => r.status !== "inserted").length,
            source_agent_id: sourceAgentId,
            hospital_id: hospitalId,
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
