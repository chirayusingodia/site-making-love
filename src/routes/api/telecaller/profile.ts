import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { validateTelecallerProfileEdit } from "@/lib/family-validation";
import { stripMaskedFieldsDeep, TC_PROFILE_COLS } from "@/lib/telecaller-logic";

// POST /api/telecaller/profile
// Gate: requireTelecaller. Body: { profile_id, ...allowlisted fields }
//
// On-behalf profile completion (§5.3): full_name, city, state,
// address_line1, address_line2, pincode, preferred_language — and
// NOTHING else. `phone` is rejected by the shared validator: it is
// the identity key (UNIQUE, mirrors auth.users) and changing it
// would be an account takeover; a wrong number becomes a
// wrong_number call outcome + owner escalation instead.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/telecaller/profile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const profileId =
          typeof body.profile_id === "string" && UUID_RE.test(body.profile_id)
            ? body.profile_id
            : "";
        if (!profileId) return json({ error: "profile_id must be a uuid" }, 400);

        // The validator sees ONLY the edit fields — profile_id is
        // addressing, not an edit.
        const editBody = { ...body };
        delete editBody.profile_id;
        const validated = validateTelecallerProfileEdit(editBody);
        if (!validated.ok) return json({ error: validated.error }, 400);

        try {
          const { data: before, error: beforeErr } = await auth.db
            .from("profiles")
            .select(TC_PROFILE_COLS)
            .eq("id", profileId)
            .maybeSingle();
          if (beforeErr) return json({ error: beforeErr.message }, 500);
          if (!before) return json({ error: "Profile not found" }, 404);

          const patch = Object.fromEntries(
            Object.entries(validated.value).filter(([, v]) => v !== undefined),
          );
          const { data: after, error: updErr } = await auth.db
            .from("profiles")
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq("id", profileId)
            .select(TC_PROFILE_COLS)
            .single();
          if (updErr) return json({ error: updErr.message }, 500);

          await writeTelecallerAudit(
            auth.db,
            auth.callerId,
            "telecaller.profile.update",
            "profiles",
            profileId,
            { fields: Object.keys(patch), before, after },
          );

          return json(stripMaskedFieldsDeep({ ok: true, person: after }));
        } catch (err) {
          console.error("telecaller/profile error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
