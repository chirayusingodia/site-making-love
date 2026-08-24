import { useEffect, useState } from "react";
import { fetchMyRole } from "@/lib/admin-api";
import { supabase } from "@/lib/supabase";

// Signed-in user's profiles.role for UI gating (sidebar links,
// masked placeholders). This is PRESENTATION-LEVEL only — every
// privileged data path is independently enforced server-side
// (RLS + requireAdmin/requireOwner in the /api handlers).
export function useUserRole(): { role: string | null; loading: boolean } {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMyRole()
      .then((r) => {
        if (!cancelled) setRole(r);
      })
      .catch(() => {
        if (!cancelled) setRole(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // [Pass-2 L14] role used to go stale until remount after a
    // sign-in/sign-out that happened while this consumer stayed
    // mounted (second tab, sidebar persisting across auth screens).
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        if (event === "SIGNED_OUT") setRole(null);
        setTick((t) => t + 1);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [tick]);

  return { role, loading };
}
