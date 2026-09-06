import { createFileRoute } from "@tanstack/react-router";
import { json, requireUser, getServiceClient } from "@/lib/supabase-admin.server";
import { normalizePhoneE164 } from "@/lib/phone";

// POST /api/profile/upsert-identity
// Auth: Bearer <supabase access token> (end user)
// Body: { full_name?: string, phone?: string }
//
// Checkout-inline auth (SESSION_CHECKOUT_INLINE_AUTH_PROMPT.md §4.1):
// a brand-new Google sign-in has no `profiles` row yet, so the
// UPDATE-only /api/profile/identity silently affects 0 rows. This is
// the same save call for both a first-time and a returning user —
// INSERT when no row exists, UPDATE (identical to identity.ts) when
// one already does.
//
// Phone gets the same no-OTP, trust-now treatment as the Google
// confirm step this replaces (api/auth/complete-google-profile.ts):
// not re-verified here either, so no new hole is opened. profiles.phone
// stays UNIQUE (core migration 001) — a collision is caught as a clean
// 409 instead of a raw DB error, with the same race backstop on 23505.
//
// Scoped to the checkout entry point only — /login's phone-OTP path
// keeps using /api/auth/reconcile-profile unchanged (that repair is
// keyed off the auth user's OTP-VERIFIED phone, a different trust
// level than the self-reported name/phone accepted here).

export const Route = createFileRoute("/api/profile/upsert-identity")({
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

        let fullName: string | undefined;
        if (typeof body?.full_name === "string") {
          const name = body.full_name.trim().slice(0, 120);
          if (!name) return json({ error: "Naam khali nahi ho sakta" }, 400);
          fullName = name;
        }

        let phone: string | undefined;
        if (typeof body?.phone === "string" && body.phone.trim()) {
          const normalized = normalizePhoneE164(body.phone);
          if (!normalized) return json({ error: "10-anki valid mobile number daalein" }, 400);
          phone = normalized;
        }

        if (fullName === undefined && phone === undefined) {
          return json({ error: "Kuch change nahi hua" }, 400);
        }

        const service = getServiceClient();

        // ── App-level duplicate check (DB UNIQUE is the backstop) ──
        if (phone) {
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

        const { data: existingProfile, error: lookupErr } = await service
          .from("profiles")
          .select("id")
          .eq("id", auth.userId)
          .maybeSingle();
        if (lookupErr) return json({ error: lookupErr.message }, 500);

        if (existingProfile) {
          const { error } = await auth.db
            .from("profiles")
            .update({
              ...(fullName !== undefined ? { full_name: fullName } : {}),
              ...(phone !== undefined ? { phone } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq("id", auth.userId);
          if (error) {
            if (error.code === "23505") {
              return json(
                { error: "Ye number pehle se kisi aur account mein hai.", code: "phone_taken" },
                409,
              );
            }
            return json({ error: error.message }, 500);
          }
          return json({ ok: true, created: false });
        }

        // No row yet — brand-new Google user. Pull the verified email
        // straight from the token, never from the client body.
        const bearer = request.headers.get("authorization") ?? "";
        const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
        const { data: userData } = await service.auth.getUser(token);
        const verifiedEmail = userData?.user?.email ?? null;

        const { error: insErr } = await auth.db.from("profiles").insert({
          id: auth.userId,
          ...(fullName ? { full_name: fullName } : {}),
          ...(phone ? { phone } : {}),
          ...(verifiedEmail ? { email: verifiedEmail } : {}),
        });

        if (insErr) {
          // Race: someone else claimed this phone (or created this same
          // row via a parallel request) between check and insert.
          if (insErr.code === "23505") {
            const { data: winner } = phone
              ? await service.from("profiles").select("id").eq("phone", phone).maybeSingle()
              : { data: null };
            if (winner && winner.id !== auth.userId) {
              return json(
                { error: "Ye number pehle se kisi aur account mein hai.", code: "phone_taken" },
                409,
              );
            }
            return json({ ok: true, created: true });
          }
          return json({ error: insErr.message }, 500);
        }

        return json({ ok: true, created: true });
      },
    },
  },
});
