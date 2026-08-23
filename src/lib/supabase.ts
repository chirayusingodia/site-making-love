import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string) ||
  "https://omjivlmfsikeqwndtlcn.supabase.co";

const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
  "sb_anon_key_placeholder";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Signup-first checkout: the phone-OTP session must survive
    // reloads and auto-refresh across its full lifetime. persist +
    // localStorage are defaults; stated explicitly so nobody "simplifies"
    // them away. The 30-day length is the Supabase project's Auth
    // refresh-token setting (v3 §14) — NOT configurable here.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// PostgREST silently caps every response at ~1000 rows. Any query
// whose result can grow past that (subscriber-scale tables) MUST
// page through ranges instead of trusting a single response —
// otherwise data is silently truncated with no error.
export async function fetchAllRows<T>(
  makeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<{ data: T[]; error: string | null }> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error) return { data: out, error: error.message };
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return { data: out, error: null };
  }
}
