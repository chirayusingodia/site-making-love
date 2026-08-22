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
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setUser(u ?? null);
      setUserId(u?.id ?? null);
      if (u) {
        const p = await fetchMyProfile().catch(() => null);
        if (!cancelled) setProfile(p);
      } else if (!cancelled) {
        setProfile(null);
      }
      if (!cancelled) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUserId(null);
        setUser(null);
        setProfile(null);
      }
      // SIGNED_IN / TOKEN_REFRESHED are covered by the next render's
      // callers refetching what they need; profile re-read happens on
      // explicit refresh().
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
