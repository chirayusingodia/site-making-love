import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin } from "@/lib/supabase-admin.server";

// POST /api/admin/login-method-counts
// Auth: staff (admin or owner). Body: none.
//
// Dashboard tile — how many people have SIGNED IN, split by auth
// method (Google vs Phone/OTP), regardless of whether they ever
// subscribed. This is a pure login/registration count, not a
// subscription figure, so it is admin-visible like the other
// operational counts on /admin/overview.
//
// The auth.users table is not exposed through PostgREST (no
// `.from("auth.users")`), so we page through GoTrue's admin
// listUsers() on the service-role client and bucket each user by
// provider. A user's identities[] lists every linked provider; we
// prefer that over app_metadata.provider so a user who linked both
// Google and phone is counted under each. `total` counts distinct
// users (deduped), so google + phone can exceed total when identities
// are linked — that is intentional and reflected in the labels.
export const Route = createFileRoute("/api/admin/login-method-counts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);

        try {
          let google = 0;
          let phone = 0;
          let other = 0;
          let total = 0;

          // GoTrue admin listUsers is 1-indexed and paginated; loop
          // until a short page signals the end. perPage 1000 keeps the
          // round-trips minimal for the pre-launch user base.
          const perPage = 1000;
          for (let page = 1; ; page++) {
            const { data, error } = await auth.db.auth.admin.listUsers({ page, perPage });
            if (error) throw error;

            const users = data?.users ?? [];
            for (const user of users) {
              total++;

              // Every provider this user can sign in with. Falls back
              // to app_metadata.provider when identities is empty.
              const providers = new Set<string>(
                (user.identities ?? [])
                  .map((i) => i.provider)
                  .filter((p): p is string => Boolean(p)),
              );
              const primary = (user.app_metadata?.provider as string | undefined) ?? undefined;
              if (providers.size === 0 && primary) providers.add(primary);

              let matched = false;
              if (providers.has("google")) {
                google++;
                matched = true;
              }
              if (providers.has("phone")) {
                phone++;
                matched = true;
              }
              if (!matched) other++;
            }

            if (users.length < perPage) break;
          }

          return json({ google, phone, other, total });
        } catch (err) {
          console.error("admin/login-method-counts error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
