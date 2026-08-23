import { createFileRoute } from "@tanstack/react-router";
import { json, requireUser } from "@/lib/supabase-admin.server";
import { validateProfileAddress } from "@/lib/family-validation";

// POST /api/profile/address
// Auth: Bearer <supabase access token> (end user)
// Body: { address_line1, address_line2?, state?, pincode }
//
// Upserts the prasad shipping address on the CALLER'S OWN profiles
// row (Premium Annual delivery). Runs under the caller's JWT —
// RLS policy "profiles: user updates own" is the enforcement layer.
//
// Validation lives in lib/family-validation.ts — shared with the
// telecaller's on-behalf editor so both surfaces stay in step.

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

        const validated = validateProfileAddress(body);
        if (!validated.ok) return json({ error: validated.error }, 400);

        const { error } = await auth.db
          .from("profiles")
          .update({
            ...validated.value,
            updated_at: new Date().toISOString(),
          })
          .eq("id", auth.userId);
        if (error) return json({ error: error.message }, 500);

        return json({ ok: true });
      },
    },
  },
});
