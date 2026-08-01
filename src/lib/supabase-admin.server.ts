import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase helpers for /api routes. The .server.ts suffix
// keeps this module out of the client bundle. Env is read per-request
// (see config.server.ts — module-scope reads break on Workers).

export function getServiceClient(): SupabaseClient {
  // URL is not a secret — same fallback as the client bundle uses.
  const url =
    process.env.VITE_SUPABASE_URL ?? "https://omjivlmfsikeqwndtlcn.supabase.co";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Verifies the caller is an admin. Expects the user's Supabase access
 * token in the Authorization header ("Bearer <token>"). The token is
 * validated against Supabase Auth, then the profiles row is checked
 * for role='admin' — mirroring the RLS is_admin() rule exactly.
 * Returns the admin's user id on success, null otherwise.
 */
export async function requireAdmin(request: Request): Promise<{
  adminId: string;
  db: SupabaseClient;
} | null> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const db = getServiceClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;
  return { adminId: user.id, db };
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
