import { supabase } from "@/lib/supabase";

// Authenticated caller for privileged /api/admin/* endpoints.
// Sends the current session's access token as a Bearer token; the
// server validates it against Supabase Auth + profiles.role.

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new AdminApiError("Not signed in — admin session required.", 401);
  }
  return session.access_token;
}

export async function callAdminApi<T>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new AdminApiError(data.error ?? `Request failed (${res.status})`, res.status);
  return data;
}

/**
 * Reads the signed-in user's profiles.role. Own profile is readable
 * via RLS ("profiles: user reads own"), so this works for any
 * authenticated caller; returns null when signed out.
 */
export async function fetchMyRole(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();
  return (data?.role as string | undefined) ?? null;
}
