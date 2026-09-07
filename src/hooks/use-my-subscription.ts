import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSessionProfile } from "@/hooks/use-session";

// ─────────────────────────────────────────────────────────────
// PUNYATA — current-subscription summary for chrome & banners
//
// A SMALL, cached read of "does this user have a membership, and
// which one" — shared by the header member-chip, the bottom-nav dot,
// the home welcome banner and the profile row so none of them fire
// their own query. The full My Subscription page still fetches its
// own richer detail (members, patras, proofs).
//
// "current" mirrors my-subscription.tsx: prefer an active row, then a
// pending one, else the most recent. RLS scopes every row to the
// caller; this is presentation only.
// ─────────────────────────────────────────────────────────────

export interface CurrentSubscription {
  id: string;
  status: string;
  start_date: string | null;
  next_billing_date: string | null;
  created_at: string;
  plan: {
    name: string;
    slug: string;
    billing_period: string;
    price_paise: number;
  } | null;
}

interface SubRow {
  id: string;
  status: string;
  start_date: string | null;
  next_billing_date: string | null;
  created_at: string;
  plans: { name: string; slug: string; billing_period: string; price_paise: number } | null;
}

async function fetchCurrentSubscription(userId: string): Promise<CurrentSubscription | null> {
  const res = await supabase
    .from("subscriptions")
    .select("id,status,start_date,next_billing_date,created_at,plans(name,slug,billing_period,price_paise)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const rows = (res.data as unknown as SubRow[]) ?? [];
  const row =
    rows.find((r) => r.status === "active") ??
    rows.find((r) => r.status === "pending") ??
    rows[0];
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    start_date: row.start_date,
    next_billing_date: row.next_billing_date,
    created_at: row.created_at,
    plan: row.plans,
  };
}

export interface MySubscriptionState {
  subscription: CurrentSubscription | null;
  /** true only for a confirmed live membership (drives the "सदस्य" cue). */
  hasActive: boolean;
  loading: boolean;
}

export function useMySubscription(): MySubscriptionState {
  const { userId, loading: sessionLoading } = useSessionProfile();

  const query = useQuery({
    queryKey: ["my-subscription-summary", userId],
    queryFn: () => fetchCurrentSubscription(userId as string),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const subscription = userId ? (query.data ?? null) : null;
  return {
    subscription,
    hasActive: subscription?.status === "active",
    loading: sessionLoading || (!!userId && query.isLoading),
  };
}
