import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { normalizePhoneE164 } from "@/lib/auth.server";
import { LEAD_CREATE_DAILY_LIMIT, stripMaskedFieldsDeep } from "@/lib/telecaller-logic";

// POST /api/telecaller/create-lead
// Gate: requireTelecaller. Body: { full_name, phone }
//
// Creates a brand-new customer (§5.4): auth user + profiles row
// stamped created_by_staff = <telecaller uuid>.
//  • Reuses normalizePhoneE164() — never a second phone parser.
//  • Existing phone → returns the EXISTING person, name untouched.
//    A lookup must never rename an existing account.
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
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("created_by_staff", auth.callerId)
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

          // Idempotency: known number wins, exactly like the login flow.
          const { data: existing, error: lookupErr } = await auth.db
            .from("profiles")
            .select("id,full_name,phone")
            .eq("phone", phone)
            .maybeSingle();
          if (lookupErr) return json({ error: lookupErr.message }, 500);
          if (existing) {
            await writeTelecallerAudit(
              auth.db,
              auth.callerId,
              "telecaller.lead.lookup_existing",
              "profiles",
              existing.id,
              { phone },
            );
            return json(stripMaskedFieldsDeep({ existed: true, person: existing }));
          }

          // Auth user first (phone unconfirmed — confirmation happens
          // when the CUSTOMER later logs in with their own OTP), then
          // its profile row with the staff-attribution stamp.
          const { data: created, error: createErr } = await auth.db.auth.admin.createUser({
            phone,
            phone_confirm: false,
            user_metadata: { full_name: rawName },
          });
          if (createErr || !created?.user) {
            const msg = createErr?.message ?? "";
            // Auth user exists without a profile row (partial legacy
            // state): we cannot resolve their uuid by phone, and we
            // must NOT send an OTP to recover it — escalate instead.
            if (/already|registered|exists/i.test(msg)) {
              return json(
                {
                  error: "Number registered hai par profile nahi mila — owner ko bataayein",
                },
                409,
              );
            }
            return json({ error: `user create failed: ${msg}` }, 500);
          }

          const { data: person, error: profErr } = await auth.db
            .from("profiles")
            .insert({
              id: created.user.id,
              full_name: rawName.slice(0, 120),
              phone,
              created_by_staff: auth.callerId,
            })
            .select("id,full_name,phone")
            .single();
          if (profErr) {
            // Unique-phone race → someone else won; surface as existing.
            if (/duplicate key|unique/i.test(profErr.message)) {
              const { data: winner } = await auth.db
                .from("profiles")
                .select("id,full_name,phone")
                .eq("phone", phone)
                .maybeSingle();
              return json(stripMaskedFieldsDeep({ existed: true, person: winner }));
            }
            return json({ error: profErr.message }, 500);
          }

          await writeTelecallerAudit(
            auth.db,
            auth.callerId,
            "telecaller.lead.create",
            "profiles",
            person.id,
            { full_name: person.full_name, phone },
          );

          return json(stripMaskedFieldsDeep({ existed: false, person }));
        } catch (err) {
          console.error("telecaller/create-lead error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
