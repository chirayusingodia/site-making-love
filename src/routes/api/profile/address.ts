import { createFileRoute } from "@tanstack/react-router";
import { json, requireUser } from "@/lib/supabase-admin.server";

// POST /api/profile/address
// Auth: Bearer <supabase access token> (end user)
// Body: { address_line1, address_line2?, state?, pincode }
//
// Upserts the prasad shipping address on the CALLER'S OWN profiles
// row (Premium Annual delivery). Runs under the caller's JWT —
// RLS policy "profiles: user updates own" is the enforcement layer.

export const Route = createFileRoute("/api/profile/address")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return json({ error: "Login required" }, 401);

        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const line1 = typeof body.address_line1 === "string" ? body.address_line1.trim() : "";
        const line2 = typeof body.address_line2 === "string" ? body.address_line2.trim() : "";
        const state = typeof body.state === "string" ? body.state.trim() : "";
        const pincode = typeof body.pincode === "string" ? body.pincode.replace(/\D/g, "") : "";

        if (line1.length < 5) return json({ error: "Address kam se kam 5 akshar ka ho" }, 400);
        if (!state) return json({ error: "State zaroori hai" }, 400);
        if (!/^\d{6}$/.test(pincode)) return json({ error: "Pincode 6 anko ka hona chahiye" }, 400);

        const { error } = await auth.db
          .from("profiles")
          .update({
            address_line1: line1.slice(0, 240),
            address_line2: line2.slice(0, 240) || null,
            state: state.slice(0, 80),
            pincode,
            updated_at: new Date().toISOString(),
          })
          .eq("id", auth.userId);
        if (error) return json({ error: error.message }, 500);

        return json({ ok: true });
      },
    },
  },
});
