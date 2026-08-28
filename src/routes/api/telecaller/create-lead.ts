import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { normalizePhoneE164 } from "@/lib/auth.server";
import { LEAD_CREATE_DAILY_LIMIT, stripMaskedFieldsDeep } from "@/lib/telecaller-logic";

// POST /api/telecaller/create-lead
// Gate: requireTelecaller. Body: { full_name, phone }
//
// Creates a brand-new pipeline lead (§5.4), assigned to the caller
// for today. A lead is deliberately NOT an auth user or a profile:
// entering a phone number must never make it look like the customer
// signed up or give the number a customer card.
//  • Reuses normalizePhoneE164() — never a second phone parser.
//  • Existing open lead → returns that lead; no duplicate work item.
//  • Sends NO OTP — creating a lead is a database row, not a login.
//    There is no OTP field anywhere in this panel, by design: if a
//    caller could log in as the customer every audit trail here
//    would be worthless.
//  • Rate-limited to LEAD_CREATE_DAILY_LIMIT per telecaller per
//    IST day (fat-finger + bored-caller brake).

const IST_OFFSET_MS = 5.5 * 3_600_000;

export const Route = createFileRoute("/api/telecaller/create-lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        let body: { full_name?: unknown; phone?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const rawName = typeof body.full_name === "string" ? body.full_name.trim() : "";
        if (rawName.length < 2 || rawName.length > 120) {
          return json({ error: "Naam 2 se 120 akshar ke beech hona chahiye" }, 400);
        }
        const phone = normalizePhoneE164(typeof body.phone === "string" ? body.phone : "");
        if (!phone) return json({ error: "Sahi Indian mobile number daalein" }, 400);

        try {
          // Daily rate limit (IST day boundaries).
          const istDay = new Date(Date.now() + IST_OFFSET_MS);
          const dayStartIso = new Date(
            Date.parse(`${istDay.toISOString().slice(0, 10)}T00:00:00Z`) - IST_OFFSET_MS,
          ).toISOString();
          const { count: createdToday, error: cntErr } = await auth.db
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("created_by", auth.callerId)
            .gte("created_at", dayStartIso);
          if (cntErr) return json({ error: cntErr.message }, 500);
          if ((createdToday ?? 0) >= LEAD_CREATE_DAILY_LIMIT) {
            return json(
              {
                error: `Aaj ki limit poori ho gayi (${LEAD_CREATE_DAILY_LIMIT} leads) — kal continue karein`,
              },
              429,
            );
          }

          // Idempotency: an open lead for this number wins. This is a
          // pipeline lookup only — profiles/auth are intentionally untouched.
          const { data: existing, error: lookupErr } = await auth.db
            .from("leads")
            .select("id,full_name,phone,status,assigned_to,created_by")
            .eq("phone", phone)
            .in("status", ["new", "assigned", "in_progress", "link_sent"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (lookupErr) return json({ error: lookupErr.message }, 500);
          if (existing) {
            if (existing.assigned_to !== auth.callerId && existing.created_by !== auth.callerId) {
              return json({ error: "Is number ki lead kisi aur caller ke paas hai" }, 409);
            }
            await writeTelecallerAudit(
              auth.db,
              auth.callerId,
              "telecaller.lead.lookup_existing",
              "leads",
              existing.id,
              { phone },
            );
            return json(stripMaskedFieldsDeep({ existed: true, lead: existing }));
          }

          const { data: lead, error: leadErr } = await auth.db
            .from("leads")
            .insert({
              full_name: rawName.slice(0, 120),
              phone,
              assigned_to: auth.callerId,
              assigned_on: istDay.toISOString().slice(0, 10),
              status: "assigned",
              created_by: auth.callerId,
            })
            .select("id,full_name,phone,status")
            .single();
          if (leadErr) {
            return json({ error: leadErr.message }, 500);
          }

          await writeTelecallerAudit(
            auth.db,
            auth.callerId,
            "telecaller.lead.create",
            "leads",
            lead.id,
            { full_name: lead.full_name, phone },
          );

          return json(stripMaskedFieldsDeep({ existed: false, lead }));
        } catch (err) {
          console.error("telecaller/create-lead error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
