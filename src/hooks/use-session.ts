import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { fetchMyProfile, type MyProfile } from "@/lib/auth-api";

// ─────────────────────────────────────────────────────────────
// PUNYATA — session hook for end-user pages
//
// Single source of "who is logged in" for /login, /checkout,
// /profile, /my-subscription. Presentation-level only — every data
// path stays independently enforced by RLS + requireUser.
//
// Session persistence itself is the Supabase JS default
// (persistSession + localStorage + autoRefreshToken); the 30-day
// lifetime is the project's Auth refresh-token setting, not code.
// ─────────────────────────────────────────────────────────────

export interface SessionState {
  /** null when signed out; undefined while still resolving */
  userId: string | null | undefined;
  user: User | null;
  profile: MyProfile | null;
  loading: boolean;
}

export function useSessionProfile(): SessionState & { refresh: () => void } {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      // `getUser()` validates against Supabase Auth over the network. If
      // that request is kept pending by a browser/proxy, it never resolves
      // and every consumer of this hook remains on its skeleton forever.
      // The persisted session is enough to render the app; RLS still
      // verifies every subsequent data request. Bound the local read too,
      // so a broken storage/auth adapter can never trap the UI in loading.
      const sessionResult = await Promise.race([
        supabase.auth.getSession(),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8_000)),
      ]);
      if (cancelled) return;
      const u = sessionResult?.data.session?.user ?? null;
      setUser(u ?? null);
      setUserId(u?.id ?? null);
      // Profile enrichment must not block the page shell. It may fail or
      // arrive later, while the authenticated UI stays usable.
      setLoading(false);
      if (u) {
        const p = await fetchMyProfile().catch(() => null);
        if (!cancelled) setProfile(p);
      } else if (!cancelled) {
        setProfile(null);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUserId(null);
        setUser(null);
        setProfile(null);
      }
      // [Pass-2 L14] SIGNED_IN now re-resolves immediately: sign-in from
      // a second tab (or while this consumer stayed mounted on the
      // profile page's login prompt) used to leave userId/profile stale
      // until an explicit refresh() or remount.
      if (event === "SIGNED_IN") {
        setTick((t) => t + 1);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [tick]);

  return {
    userId,
    user,
    profile,
    loading,
    refresh: () => setTick((t) => t + 1),
  };
}
