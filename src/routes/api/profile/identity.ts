import { createFileRoute } from "@tanstack/react-router";
import { json, requireUser, getServiceClient } from "@/lib/supabase-admin.server";
import { normalizePhoneE164 } from "@/lib/phone";

// POST /api/profile/identity
// Auth: Bearer <supabase access token> (end user)
// Body: { full_name?: string, phone?: string }
//
// Lets the caller correct their OWN naam/mobile from /checkout — a
// typo'd name or a wrong number entered at signup shouldn't force a
// trip through /profile before someone can pay. Runs under the
// caller's own JWT ("profiles: user updates own" — same RLS grant
// api/profile/address.ts already relies on).
//
// Phone deliberately gets the SAME no-OTP, trust-now treatment as the
// Google sign-in confirm step (api/auth/complete-google-profile.ts):
// phone-OTP login isn't re-verified here either, so there is no new
// hole opened by letting someone edit it at checkout too. profiles.phone
// stays UNIQUE (core migration 001) — a collision is caught as a clean
// 409 instead of a raw DB error, with the same race backstop on 23505.

export const Route = createFileRoute("/api/profile/identity")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return json({ error: "Login required" }, 401);

        let body: { full_name?: unknown; phone?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const update: { full_name?: string; phone?: string } = {};

        if (typeof body?.full_name === "string") {
          const name = body.full_name.trim().slice(0, 120);
          if (!name) return json({ error: "Naam khali nahi ho sakta" }, 400);
          update.full_name = name;
        }

        let phone: string | null = null;
        if (typeof body?.phone === "string" && body.phone.trim()) {
          phone = normalizePhoneE164(body.phone);
          if (!phone) return json({ error: "10-anki valid mobile number daalein" }, 400);
          update.phone = phone;
        }

        if (Object.keys(update).length === 0) {
          return json({ error: "Kuch change nahi hua" }, 400);
        }

        // ── App-level duplicate check (DB UNIQUE is the backstop) ──
        if (phone) {
          const service = getServiceClient();
          const { data: existing, error: dupErr } = await service
            .from("profiles")
            .select("id")
            .eq("phone", phone)
            .maybeSingle();
          if (dupErr)
            return json({ error: "Phone check fail hui — thodi der baad try karein." }, 500);
          if (existing && existing.id !== auth.userId) {
            return json(
              { error: "Ye number pehle se kisi aur account mein hai.", code: "phone_taken" },
              409,
            );
          }
        }

        const { error } = await auth.db
          .from("profiles")
          .update({ ...update, updated_at: new Date().toISOString() })
          .eq("id", auth.userId);

        if (error) {
          // Race: someone else claimed this phone between check and write.
          if (error.code === "23505") {
            return json(
              { error: "Ye number pehle se kisi aur account mein hai.", code: "phone_taken" },
              409,
            );
          }
          return json({ error: error.message }, 500);
        }

        return json({ ok: true });
      },
    },
  },
});
