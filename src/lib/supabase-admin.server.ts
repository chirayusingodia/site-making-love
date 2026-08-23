import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase helpers for /api routes. The .server.ts suffix
// keeps this module out of the client bundle. Env is read per-request
// (see config.server.ts — module-scope reads break on Workers).

export type StaffRole = "admin" | "owner";

/** Roles allowed through the telecaller panel gate (§8 checklist). */
export type TelecallerCallerRole = "telecaller" | StaffRole;

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

// ─── Telecaller panel gate (Session: Telecaller Panel) ───────

export interface TelecallerAuth {
  callerId: string;
  role: TelecallerCallerRole;
  db: SupabaseClient;
}

export function isTelecallerCallerRole(
  role: string | null | undefined,
): role is TelecallerCallerRole {
  return role === "telecaller" || isStaffRole(role);
}

/**
 * Gate for EVERY /api/telecaller/* endpoint. The caller's token is
 * validated against Supabase Auth, then profiles.role decides:
 *
 *   telecaller / admin / owner → allowed (owner + admin reach the
 *     panel read-write so Chirayu can sit in the same queue and
 *     check the work — §0)
 *   user / agent / anything else → null (handlers map to 401)
 *
 * The returned client is the SERVICE-ROLE client on purpose: the
 * telecaller has NO direct table grants (migration 012 adds none),
 * so every read/write flows through here where the explicit field
 * allowlists in telecaller-logic.ts are applied. Never widen this
 * gate to 'agent'; never let a handler select("*") behind it.
 */
export async function requireTelecaller(request: Request): Promise<TelecallerAuth | null> {
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

  if (!profile || !isTelecallerCallerRole(profile.role)) return null;
  return { callerId: user.id, role: profile.role, db };
}

/**
 * Audit-trail write for telecaller panel mutations (§5). Every
 * endpoint that writes ANYTHING calls this with before/after values
 * in `meta` — no exceptions. Runs on the service-role client (the
 * telecaller herself has no audit_logs grant by design).
 */
export async function writeTelecallerAudit(
  db: SupabaseClient,
  callerId: string,
  action: string,
  entity: string,
  entityId: string | null,
  meta: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.from("audit_logs").insert({
    admin_id: callerId,
    action,
    entity,
    entity_id: entityId,
    meta,
  });
  // An audit failure must fail the request — a silent write without
  // its trail is exactly what this table exists to prevent.
  if (error) throw new Error(`audit_logs insert failed: ${error.message}`);
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ─── End-user (non-staff) auth helpers ───────────────────────
// Signup-first checkout session: /api routes that act on the
// CALLER'S OWN data (profile, subscriptions, family_members) run
// under the caller's own JWT so RLS stays authoritative — the
// service role is used only where RLS cannot express the rule.

/**
 * A Supabase client that executes every query AS THE CALLER — their
 * access token rides on each request, so ordinary RLS policies
 * ("user reads/inserts/updates own") are the enforcement layer.
 * No service-role bypass. persistSession off: stateless request scope.
 */
export function getUserClient(accessToken: string): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL ?? "https://omjivlmfsikeqwndtlcn.supabase.co";
  // The anon key is public (ships in the browser bundle), so the VITE_
  // spelling is an equally valid fallback — without it, any deployment
  // that only sets the VITE_ var crashes requireUser() with
  // "supabaseKey is required" instead of serving the request.
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("Missing SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) env var");
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Resolves any signed-in end user (not just staff) from the
 * Authorization header. Returns null when the token is missing or
 * invalid — handlers map null to 401.
 */
export async function requireUser(
  request: Request,
): Promise<{ userId: string; db: SupabaseClient } | null> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  // Validate against Supabase Auth first; only then hand the token
  // to a user-scoped client for RLS-scoped reads/writes.
  const admin = getServiceClient();
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) return null;

  return { userId: user.id, db: getUserClient(token) };
}
