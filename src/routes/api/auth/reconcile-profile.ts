import { createFileRoute } from "@tanstack/react-router";
import { json, requireUser, getServiceClient } from "@/lib/supabase-admin.server";

// POST /api/auth/reconcile-profile
// Auth: Bearer <supabase access token>. Body: { full_name?: string }
//
// [Pass-2 P13] Guarantees the signed-in auth user has a profiles row,
// repairing the phone-squatting collision that Google sign-up created:
//
//   1. A Google user could attach ANY yet-unregistered mobile number
//      (no OTP by documented design). That number then sat on THEIR
//      profile while unverified.
//   2. When the real owner later signed up via phone OTP, GoTrue gave
//      them a fresh auth user with that phone — but profiles.phone is
//      UNIQUE, so their profile INSERT failed. The old client path
//      swallowed that error, leaving an authenticated-but-profile-less
//      account only support could untangle.
//
// Phone-OTP verification proves ownership of the number MORE strongly
// than a Google-flow self-report, so reconciliation favours the
// verified owner: any OTHER profile still holding the number is
// stripped of it (its other columns survive — the Google identity
// merely loses its unverified claim), then our own row is inserted.

export const Route = createFileRoute("/api/auth/reconcile-profile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return json({ error: "Login required" }, 401);

        let fullName: string | null = null;
        try {
          const body = (await request.json()) as { full_name?: unknown };
          if (typeof body?.full_name === "string" && body.full_name.trim()) {
            fullName = body.full_name.trim().slice(0, 120);
          }
        } catch {
          // Body optional — nothing else client-sent is trusted.
        }

        const bearer = request.headers.get("authorization") ?? "";
        const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
        const service = getServiceClient();

        // Verified attributes straight from the token's user record.
        const { data: userData } = await service.auth.getUser(token);
        const user = userData?.user;
        if (!user) return json({ error: "Login required" }, 401);
        const phone = (user.phone ?? "").trim() || null;

        // Already have a profile? Nothing to repair.
        const { data: existing } = await service
          .from("profiles")
          .select("id")
          .eq("id", auth.userId)
          .maybeSingle();
        if (existing) return json({ ok: true, created: false });

        // Verified phone owner wins: evict any squatter's UNVERIFIED
        // claim on this number before inserting our row.
        if (phone) {
          const { error: evictErr } = await service
            .from("profiles")
            .update({ phone: null })
            .eq("phone", phone)
            .neq("id", auth.userId);
          if (evictErr) {
            console.error("reconcile-profile evict failed:", evictErr.message);
            return json({ error: "Profile repair fail hui — thodi der baad try karein." }, 500);
          }
        }

        const { error: insErr } = await service.from("profiles").insert({
          id: auth.userId,
          ...(fullName ? { full_name: fullName } : {}),
          ...(phone ? { phone } : {}),
          ...(user.email ? { email: user.email } : {}),
        });

        if (insErr) {
          if (insErr.code === "23505") {
            // A squatter re-took the number between evict and insert —
            // run the eviction once more and retry exactly once.
            if (phone) {
              await service.from("profiles").update({ phone: null }).eq("phone", phone);
              const { error: retryErr } = await service.from("profiles").insert({
                id: auth.userId,
                ...(fullName ? { full_name: fullName } : {}),
                ...(phone ? { phone } : {}),
                ...(user.email ? { email: user.email } : {}),
              });
              if (!retryErr) return json({ ok: true, created: true });
            }
          }
          console.error("reconcile-profile insert failed:", insErr.message);
          return json({ error: "Profile ban nahi payi — thodi der baad try karein." }, 500);
        }

        return json({ ok: true, created: true });
      },
    },
  },
});
