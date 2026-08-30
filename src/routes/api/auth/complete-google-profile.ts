import { createFileRoute } from "@tanstack/react-router";
import { json, requireUser, getServiceClient } from "@/lib/supabase-admin.server";
import { normalizePhoneE164 } from "@/lib/auth.server";

// POST /api/auth/complete-google-profile
// Auth: Bearer <supabase access token> (the Google-OAuth session that
//       just landed in the browser — NOT re-authenticated, §4)
// Body: { full_name?, phone, alt_phone? }
//
// alt_phone: only sent when the "WhatsApp number aur calling number
// same hai?" checkbox is unticked — `phone` stays the WhatsApp number
// (seva proofs ride on it), alt_phone is the separate number to
// actually dial. Omitted/empty means "same as phone".
//
// First-ever-Google-sign-in confirm step. The Google identity is
// already authenticated; this only attaches a real, usable Indian
// mobile number to it. Deliberate trade-off (session brief §1b):
// NO OTP is sent here — trust now, verify-by-human later via the
// existing telecaller/Sankalp-Pending call queue.
//
// Duplicate-account collision (§1c): if the phone already belongs to
// ANOTHER profile row (created via phone-OTP login), we refuse with
// code "phone_taken" — never a second profile for one number. Merging
// the two auth identities is explicitly out of scope.
//
// RLS stays authoritative: the INSERT runs under the CALLER'S OWN JWT
// ("profiles: user inserts own" → id = auth.uid() enforced by Postgres,
// not by this handler). Only the duplicate LOOKUP needs service role —
// an ordinary user cannot read other people's rows to run that check.

export const Route = createFileRoute("/api/auth/complete-google-profile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return json({ error: "Login required" }, 401);

        let body: { full_name?: unknown; phone?: unknown; alt_phone?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        if (typeof body?.phone !== "string" || body.phone.trim().length < 10) {
          return json({ error: "10-anki valid mobile number daalein" }, 400);
        }
        const phone = normalizePhoneE164(body.phone);
        if (!phone) {
          return json({ error: "Valid 10-digit Indian mobile number daalein" }, 400);
        }
        const fullName =
          typeof body?.full_name === "string" ? body.full_name.trim().slice(0, 120) : "";

        // Separate calling number — only when it differs from the
        // WhatsApp number above. Same format rules apply.
        let altPhone: string | null = null;
        if (typeof body?.alt_phone === "string" && body.alt_phone.trim()) {
          altPhone = normalizePhoneE164(body.alt_phone);
          if (!altPhone) {
            return json({ error: "Calling number bhi valid 10-anki hona chahiye" }, 400);
          }
        }

        const service = getServiceClient();

        // Verified attributes straight from the token's user record —
        // never trust a client-sent email.
        const bearer = request.headers.get("authorization") ?? "";
        const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
        const { data: userData } = await service.auth.getUser(token);
        const verifiedEmail = userData?.user?.email ?? null;

        // ── App-level duplicate check (DB UNIQUE is the backstop) ──
        const { data: existingByPhone, error: dupErr } = await service
          .from("profiles")
          .select("id")
          .eq("phone", phone)
          .maybeSingle();
        if (dupErr)
          return json({ error: "Phone check fail hui — thodi der baad try karein." }, 500);

        if (existingByPhone) {
          if (existingByPhone.id === auth.userId) {
            // Idempotent: this Google identity already completed the step.
            return json({ ok: true, alreadyLinked: true });
          }
          return json(
            {
              error: "Ye number pehle se registered hai — OTP se login karein.",
              code: "phone_taken",
            },
            409,
          );
        }

        // ── Insert under the caller's own grant (RLS-enforced) ─────
        const { error: insErr } = await auth.db.from("profiles").insert({
          id: auth.userId,
          ...(fullName ? { full_name: fullName } : {}),
          phone,
          ...(altPhone ? { alt_phone: altPhone } : {}),
          ...(verifiedEmail ? { email: verifiedEmail } : {}),
        });

        if (insErr) {
          // Race: someone claimed this phone between check and insert.
          // The UNIQUE constraint fired — resolve who won, honestly.
          if (insErr.code === "23505") {
            const { data: winner } = await service
              .from("profiles")
              .select("id")
              .eq("phone", phone)
              .maybeSingle();
            if (winner && winner.id !== auth.userId) {
              return json(
                {
                  error: "Ye number pehle se registered hai — OTP se login karein.",
                  code: "phone_taken",
                },
                409,
              );
            }
            // Winner was ourselves (double-submit) → done.
            return json({ ok: true, alreadyLinked: true });
          }
          console.error("complete-google-profile insert failed:", insErr.message);
          return json({ error: "Profile ban nahi payi — thodi der baad try karein." }, 500);
        }

        return json({ ok: true });
      },
    },
  },
});
