import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase helpers for /api routes. The .server.ts suffix
// keeps this module out of the client bundle. Env is read per-request
// (see config.server.ts — module-scope reads break on Workers).

export type StaffRole = "admin" | "owner";

export function getServiceClient(): SupabaseClient {
  // URL is not a secret — same fallback as the client bundle uses.
  const url = process.env.VITE_SUPABASE_URL ?? "https://omjivlmfsikeqwndtlcn.supabase.co";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── Role decisions (pure — unit-tested in scratch/) ─────────
// Two-tier staff hierarchy (Session 6.5):
//   OWNER = superset of admin + all financial visibility.
//   ADMIN = full operational access, ZERO financial visibility.
// Anything an admin may call, an owner may also call.

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return role === "admin" || role === "owner";
}

export function isOwnerRole(role: string | null | undefined): role is "owner" {
  return role === "owner";
}

export interface StaffAuth {
  staffId: string;
  role: StaffRole;
  db: SupabaseClient;
}

/**
 * Resolves the caller's staff identity. Expects the user's Supabase
 * access token in the Authorization header ("Bearer <token>"). The
 * token is validated against Supabase Auth, then the profiles row is
 * read for the role. Returns:
 *   null                      — no/invalid token (caller should 401)
 *   { staffId, role, db }     — authenticated; role may still fail a
 *                               downstream gate (caller decides 403)
 */
async function resolveStaff(request: Request): Promise<StaffAuth | null> {
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

  if (!profile || !isStaffRole(profile.role)) return null;
  return { staffId: user.id, role: profile.role, db };
}

/**
 * Verifies the caller is privileged staff (admin OR owner). Mirrors
 * the RLS is_admin() rule exactly (widened to owner in migration 007).
 * Returns null unless the caller is staff — existing handlers map
 * null to 401. Returns the caller's role so handlers that serve both
 * roles can branch (e.g. field-stripping financial columns for admin).
 */
export async function requireAdmin(request: Request): Promise<StaffAuth | null> {
  return resolveStaff(request);
}

/**
 * Owner-only gate. Distinguishes failure modes so handlers can answer
 * precisely:
 *   { ok: false, status: 401 } — no/invalid token, or not staff
 *   { ok: false, status: 403 } — authenticated staff, but not owner
 *   { ok: true, auth }         — caller's profiles.role === 'owner'
 */
export async function requireOwner(
  request: Request,
): Promise<{ ok: true; auth: StaffAuth } | { ok: false; status: 401 | 403; error: string }> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { ok: false, status: 401, error: "Auth required" };

  const db = getServiceClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);
  if (error || !user) return { ok: false, status: 401, error: "Auth required" };

  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !isStaffRole(profile.role)) {
    return { ok: false, status: 401, error: "Auth required" };
  }
  if (!isOwnerRole(profile.role)) {
    return { ok: false, status: 403, error: "Owner access required" };
  }
  return { ok: true, auth: { staffId: user.id, role: "owner", db } };
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
