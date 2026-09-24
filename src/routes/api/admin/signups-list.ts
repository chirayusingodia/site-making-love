import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin } from "@/lib/supabase-admin.server";

// POST /api/admin/signups-list
// Auth: staff (admin or owner). Body: none.
//
// Companion to /api/admin/login-method-counts — that endpoint gives
// the "Logins (Google / Phone)" tile its number but deliberately only
// returns counts. This returns the actual per-user rows (email +
// which provider(s) they signed in with + when they registered) so
// admin can see WHO the count on that tile is, not just how many.
//
// Same technique as login-method-counts.ts: auth.users isn't exposed
// through PostgREST, so we page through GoTrue's admin listUsers() on
// the service-role client. perPage 1000 keeps this a single round
// trip for the pre-launch user base; the loop still pages correctly
// if that ever changes.
//
// auth.users.phone is GoTrue's OWN phone field — it is only ever set
// for a phone-OTP identity. A Google signup who later gave her number
// at checkout has that number in public.profiles.phone, not here, so
// reading auth.users.phone alone showed "—" for most subscribed
// Google users. profiles.phone (collected at checkout, same source
// every other admin screen uses — see admin.subscribers.tsx) is the
// fallback.
interface SignupRow {
  id: string;
  email: string | null;
  phone: string | null;
  providers: string[];
  createdAt: string;
}

export const Route = createFileRoute("/api/admin/signups-list")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);

        try {
          const rows: SignupRow[] = [];
          const perPage = 1000;
          for (let page = 1; ; page++) {
            const { data, error } = await auth.db.auth.admin.listUsers({ page, perPage });
            if (error) throw error;

            const users = data?.users ?? [];
            for (const user of users) {
              const providers = new Set<string>(
                (user.identities ?? [])
                  .map((i) => i.provider)
                  .filter((p): p is string => Boolean(p)),
              );
              const primary = (user.app_metadata?.provider as string | undefined) ?? undefined;
              if (providers.size === 0 && primary) providers.add(primary);

              rows.push({
                id: user.id,
                email: user.email ?? null,
                phone: user.phone ?? null,
                providers: Array.from(providers),
                createdAt: user.created_at,
              });
            }

            if (users.length < perPage) break;
          }

          // Fill the gap above from profiles.phone — chunked (Postgres
          // caps IN-list size in practice) since the pre-launch user
          // count can still land in the low thousands.
          const missingIds = rows.filter((r) => !r.phone).map((r) => r.id);
          const profilePhoneById = new Map<string, string>();
          const CHUNK = 500;
          for (let i = 0; i < missingIds.length; i += CHUNK) {
            const chunk = missingIds.slice(i, i + CHUNK);
            const { data: profileRows, error: profileErr } = await auth.db
              .from("profiles")
              .select("id,phone")
              .in("id", chunk);
            if (profileErr) throw profileErr;
            for (const p of profileRows ?? []) {
              if (p.phone) profilePhoneById.set(p.id, p.phone as string);
            }
          }
          for (const r of rows) {
            if (!r.phone) r.phone = profilePhoneById.get(r.id) ?? null;
          }

          rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
          return json({ users: rows, total: rows.length });
        } catch (err) {
          console.error("admin/signups-list error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
