import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";

// GET/POST /api/admin/staff/list
// Auth: OWNER only — this is the full user directory (emails, phones).
// Body/query: { search?: string } (ilike across full_name / email / phone).
//
// Default (no search): current STAFF roster (owners + admins) plus a
// count of every profile so the UI can say how many users exist.
// With search: up to 50 matching profiles, any role.
//
// Served on the SERVICE-ROLE client because "profiles: user reads own"
// RLS would hide other rows from the caller's JWT; requireOwner() is
// the authorization layer here (same discipline as payments/list).
const MAX_SEARCH = 100;

interface StaffRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  created_at: string;
}

async function handle(request: Request) {
  const gate = await requireOwner(request);
  if (!gate.ok) return json({ error: gate.error }, gate.status);
  const { db } = gate.auth;

  const url = new URL(request.url);
  let body: { search?: unknown } = {};
  try {
    if (request.method === "POST") body = await request.json();
  } catch {
    /* optional */
  }
  const rawSearch =
    typeof body.search === "string" ? body.search : url.searchParams.get("search");
  const search = rawSearch?.trim().slice(0, MAX_SEARCH) ?? "";

  try {
    if (search) {
      const like = `%${search.replace(/[%_]/g, (c) => `\\${c}`)}%`;
      const { data, error } = await db
        .from("profiles")
        .select("id, full_name, email, phone, role, created_at")
        .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, rows: data as StaffRow[], mode: "search" });
    }

    // No search: the staff roster + how many profiles exist overall.
    const [staffRes, countRes] = await Promise.all([
      db
        .from("profiles")
        .select("id, full_name, email, phone, role, created_at")
        .in("role", ["owner", "admin"])
        .order("created_at", { ascending: true }),
      db.from("profiles").select("id", { count: "exact", head: true }),
    ]);
    if (staffRes.error) return json({ error: staffRes.error.message }, 500);
    if (countRes.error) return json({ error: countRes.error.message }, 500);

    return json({
      ok: true,
      rows: staffRes.data as StaffRow[],
      mode: "staff",
      totalUsers: countRes.count ?? 0,
    });
  } catch (err) {
    console.error("staff/list error:", err);
    return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
  }
}

export const Route = createFileRoute("/api/admin/staff/list")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
