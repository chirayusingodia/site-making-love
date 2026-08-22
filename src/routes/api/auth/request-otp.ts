import { createFileRoute } from "@tanstack/react-router";
import { json, getServiceClient } from "@/lib/supabase-admin.server";
import { requestOtpForPhone } from "@/lib/auth.server";

// POST /api/auth/request-otp
// Body: { name?: string, phone: string }
//
// Combined login/signup gate. Creates the auth user + profiles row
// for a brand-new number, ignores `name` for known numbers, and
// sends the OTP via Supabase Auth phone provider (SMS/voice).
// Response never reveals whether the number existed beyond the
// isNewUser convenience flag (the OTP itself gates everything).

export const Route = createFileRoute("/api/auth/request-otp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { name?: unknown; phone?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const name = typeof body?.name === "string" ? body.name : "";
        if (typeof body?.phone !== "string" || body.phone.trim().length < 10) {
          return json({ error: "Valid mobile number required" }, 400);
        }

        try {
          const db = getServiceClient();
          const result = await requestOtpForPhone(db, name, body.phone);
          return json({ ok: true, ...result });
        } catch (err) {
          console.error("request-otp error:", err);
          const message = err instanceof Error ? err.message : "OTP request failed";
          // Normalisation errors are caller mistakes; everything else
          // is ours (config/provider) — still surfaced for the retry UI.
          return json(
            {
              error: /Invalid Indian mobile/.test(message)
                ? message
                : "OTP bhej nahi paye — thodi der baad try karein.",
            },
            /Invalid Indian mobile/.test(message) ? 400 : 500,
          );
        }
      },
    },
  },
});
