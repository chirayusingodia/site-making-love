import { useEffect, useState } from "react";
import { fetchMyRole } from "@/lib/admin-api";

// Signed-in user's profiles.role for UI gating (sidebar links,
// masked placeholders). This is PRESENTATION-LEVEL only — every
// privileged data path is independently enforced server-side
// (RLS + requireAdmin/requireOwner in the /api handlers).
export function useUserRole(): { role: string | null; loading: boolean } {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
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
    return () => {
      cancelled = true;
    };
  }, []);

  return { role, loading };
}
