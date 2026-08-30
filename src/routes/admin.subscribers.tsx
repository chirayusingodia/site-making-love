import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { csvCell } from "@/lib/csv";
import {
  Search,
  Download,
  ChevronDown,
  ChevronUp,
  X,
  Eye,
  Users,
  CreditCard,
  Tag,
  User,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  XCircle,
  PauseCircle,
  AlertCircle,
  ReceiptText,
  Video,
  RefreshCw,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PhoneCall,
  CircleStop,
  Play,
  Copy,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { callAdminApi } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/subscribers")({
  component: AdminSubscribersPage,
});

// ─── Constants ───────────────────────────────────────────────

const PAGE_SIZE = 50;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Types ───────────────────────────────────────────────────

/** Row shape from subscriber_list_view — flat, one row per subscription. */
interface SubscriberListRow {
  subscription_id: string;
  user_id: string;
  status: string;
  start_date: string | null;
  next_billing_date: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  halted_at: string | null;
  cancel_reason: string | null;
  acquisition_channel: string | null;
  // Current payment mandate (migration 022) — gateway-neutral: the
  // subscription itself no longer carries any provider's id.
  mandate_gateway: string | null;
  mandate_gateway_id: string | null;
  mandate_status: string | null;
  sub_created_at: string;
  sub_updated_at: string;
  // Plan
  plan_id: string | null;
  plan_name: string | null;
  plan_price_paise: number | null;
  plan_billing_period: string | null;
  // Agent
  agent_id: string | null;
  agent_full_name: string | null;
  agent_code: string | null;
  // Coupon
  coupon_id: string | null;
  coupon_code: string | null;
  coupon_discount_type: string | null;
  coupon_discount_value: number | null;
  // Primary member
  primary_member_id: string | null;
  primary_member_name: string | null;
  primary_member_gotra: string | null;
  primary_member_relation: string | null;
  primary_member_slot: number | null;
  primary_member_is_primary: boolean | null;
  primary_member_dob: string | null;
  // Count
  family_member_count: number;
  // Account profile — contact fallback for pending subs (no
  // family_members row yet, but name+phone were required at checkout).
  profile_full_name: string | null;
  profile_phone: string | null;
  profile_email: string | null;
  // Separate calling number (only set when different from
  // profile_phone, which stays the WhatsApp number).
  profile_alt_phone: string | null;
}

/** Filters that are applied server-side before pagination. */
interface FilterState {
  status: string;
  planId: string;
  agentId: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  /** Call queue: subscriptions with 0 family members (Sankalp Pending). */
  sankalpPending: boolean;
  /**
   * [SESSION_STUCK_PENDING_CHECKOUT Part C] Ops queue: pending rows older
   * than STALE_PENDING_OPS_MINUTES — abandoned checkouts that will never
   * webhook-activate. Deliberately LONGER than the customer-facing reuse
   * window in checkout-ttl.ts (20 min): by 1h a real in-flight payment is
   * long resolved, so anything left pending is worth a proactive call.
   */
  stalePending: boolean;
}

const STALE_PENDING_OPS_MINUTES = 60;

const DEFAULT_FILTERS: FilterState = {
  status: "all",
  planId: "all",
  agentId: "all",
  search: "",
  dateFrom: "",
  dateTo: "",
  sankalpPending: false,
  stalePending: false,
};

// ─── 360 Modal Types (unchanged — still queries real tables) ──

interface FamilyMember {
  id: string;
  full_name: string;
  gotra: string | null;
  relation: string | null;
  slot_number: number;
  is_primary: boolean;
  dob: string | null;
}

interface Payment {
  id: string;
  amount_paise: number;
  status: string;
  method: string | null;
  cycle_number: number | null;
  paid_at: string | null;
  failure_reason: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
}

interface SevaProof {
  id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  is_delivered: boolean;
  delivered_at: string | null;
  month: number;
  year: number;
  batch_id: string | null;
  sankalp_batches?: { batch_type: string; batch_date: string } | null;
  sevas?: { name: string } | null;
}

interface PlanHistoryEntry {
  id: string;
  changed_at: string;
  old_plan?: { name: string } | null;
  new_plan?: { name: string } | null;
  changer?: { full_name: string | null } | null;
}

/** Full subscription record for the 360 modal (populated lazily). */
interface Subscription360 {
  subscription_id: string;
  user_id: string;
  status: string;
  start_date: string | null;
  next_billing_date: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  halted_at: string | null;
  cancel_reason: string | null;
  acquisition_channel: string | null;
  mandate_gateway: string | null;
  mandate_gateway_id: string | null;
  mandate_status: string | null;
  plan_name: string | null;
  plan_price_paise: number | null;
  plan_billing_period: string | null;
  agent_full_name: string | null;
  agent_code: string | null;
  coupon_code: string | null;
  coupon_discount_type: string | null;
  coupon_discount_value: number | null;
  profile_full_name: string | null;
  profile_phone: string | null;
  profile_email: string | null;
  profile_alt_phone: string | null;
  family_members: FamilyMember[];
  payments?: Payment[];
  seva_proofs?: SevaProof[];
  plan_history?: PlanHistoryEntry[];
}

// ─── Helpers ─────────────────────────────────────────────────

function fmtINR(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  // [Pass-2 F16] anchor date-only strings to IST midnight (UTC parse
  // rendered one day early west of UTC).
  const iso = d.length === 10 ? `${d}T00:00:00+05:30` : d;
  const dt = new Date(iso);
  return isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    active: {
      label: "Active",
      cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
      icon: CheckCircle2,
    },
    paused: {
      label: "Paused",
      cls: "bg-amber-50 text-amber-800 border-amber-200",
      icon: PauseCircle,
    },
    cancelled: {
      label: "Cancelled",
      cls: "bg-rose-50 text-rose-800 border-rose-200",
      icon: XCircle,
    },
    halted: {
      // Distinct from paused (amber, voluntary) AND cancelled (rose,
      // final): red = urgent-but-recoverable, CircleStop reads as
      // "stopped", not "crossed out".
      label: "Halted",
      cls: "bg-red-50 text-red-800 border-red-200",
      icon: CircleStop,
    },
    pending: { label: "Pending", cls: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
    expired: {
      label: "Expired",
      cls: "bg-slate-100 text-slate-500 border-slate-200",
      icon: AlertCircle,
    },
  };
  const m = map[status] ?? {
    label: status,
    cls: "bg-slate-100 text-slate-700 border-slate-200",
    icon: AlertCircle,
  };
  const Icon = m.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${m.cls}`}
    >
      <Icon className="w-3 h-3" />
      {m.label}
    </span>
  );
}

// ─── Server-side query builder ────────────────────────────────
// Centralised so list query, count query, and CSV query all apply
// identical filters consistently.

/** Call-queue urgency: Sankalp Pending AND Stale Pending sort OLDEST first. */
function orderForFilters(filters: FilterState) {
  return {
    column: "sub_created_at" as const,
    ascending: !filters.sankalpPending && !filters.stalePending,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, filters: FilterState): any {
  // A checkout creates a provisional `pending` subscription before any
  // payment succeeds. It is not a subscriber and must not appear in the
  // default subscriber list (or its CSV). Pending rows remain explicitly
  // accessible through the Pending status filter and Stale Pending ops
  // queue below.
  if (filters.stalePending) {
    const cutoff = new Date(Date.now() - STALE_PENDING_OPS_MINUTES * 60_000).toISOString();
    query = query.eq("status", "pending").lt("sub_created_at", cutoff);
  } else if (filters.status !== "all") {
    query = query.eq("status", filters.status);
  } else {
    query = query.neq("status", "pending");
  }
  if (filters.planId !== "all") query = query.eq("plan_id", filters.planId);
  if (filters.agentId !== "all") query = query.eq("agent_id", filters.agentId);
  if (filters.dateFrom) query = query.gte("start_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("start_date", filters.dateTo);
  if (filters.sankalpPending) {
    // Sankalp Pending call queue — derived, never a stored flag:
    // zero family_members rows on the subscription.
    query = query.eq("family_member_count", 0);
  }
  if (filters.search.trim()) {
    // Match primary_member_name OR the profile fallback (name/phone) —
    // pending subs have no family_members row yet, so name-only search
    // would never find them even though the subscriber has a real name
    // and phone number on file from checkout.
    // PostgREST .or() uses "," to separate conditions and "()" for
    // grouping, so strip those from the search term before interpolating.
    const term = filters.search.trim().replace(/[(),]/g, "");
    query = query.or(
      `primary_member_name.ilike.%${term}%,profile_full_name.ilike.%${term}%,` +
        `profile_phone.ilike.%${term}%,profile_alt_phone.ilike.%${term}%`,
    );
  }
  return query;
}

// ─── CSV Export (server-side full fetch) ─────────────────────
// Does NOT reuse the paginated client state.
// Fetches ALL matching rows directly from the DB, batched in 500s.

async function exportCSVServerSide(filters: FilterState, setExporting: (v: boolean) => void) {
  setExporting(true);
  try {
    const BATCH = 500;
    let offset = 0;
    const allRows: SubscriberListRow[] = [];

    while (true) {
      const ord = orderForFilters(filters);
      let q = supabase
        .from("subscriber_list_view")
        .select("*")
        .order(ord.column, { ascending: ord.ascending })
        .range(offset, offset + BATCH - 1);

      q = applyFilters(q as any, filters) as any;
      const { data, error } = await q;
      if (error) {
        console.error("CSV export batch error:", error);
        break;
      }
      const rows = (data || []) as SubscriberListRow[];
      allRows.push(...rows);
      if (rows.length < BATCH) break; // last page
      offset += BATCH;
    }

    if (allRows.length === 0) {
      alert("No matching subscribers to export.");
      return;
    }

    const headers = [
      "subscription_id",
      "primary_name",
      "primary_gotra",
      "whatsapp_phone",
      "calling_phone",
      "contact_email",
      "plan_name",
      "billing_period",
      "price_inr",
      "status",
      "start_date",
      "next_billing_date",
      "agent_name",
      "agent_code",
      "coupon_code",
      "family_member_count",
      "sub_created_at",
    ];

    const csvRows = allRows.map((r) =>
      [
        r.subscription_id,
        r.primary_member_name || r.profile_full_name || "",
        r.primary_member_gotra || "",
        r.profile_phone || "",
        r.profile_alt_phone || "",
        r.profile_email || "",
        r.plan_name || "",
        r.plan_billing_period || "",
        r.plan_price_paise != null ? (r.plan_price_paise / 100).toFixed(2) : "",
        r.status,
        r.start_date || "",
        r.next_billing_date || "",
        r.agent_full_name || "",
        r.agent_code || "",
        r.coupon_code || "",
        r.family_member_count,
        r.sub_created_at,
      ]
        .map(csvCell) // [Bug 4.9] injection-safe escape
        .join(","),
    );

    const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `punyata_subscribers_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    setExporting(false);
  }
}

// ─── Subscriber 360 Modal ─────────────────────────────────────
// UNTOUCHED from Session 2 — still queries real tables directly,
// scoped to a single subscription_id. Already fast.

function Subscriber360Modal({ sub, onClose }: { sub: Subscription360; onClose: () => void }) {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [sevaProofs, setSevaProofs] = useState<SevaProof[] | null>(null);
  const [planHistory, setPlanHistory] = useState<PlanHistoryEntry[] | null>(null);
  const [tab, setTab] = useState<"overview" | "payments" | "proofs" | "history">("overview");
  const [loading360, setLoading360] = useState(false);

  // Halted-subscription recovery actions (admin/owner only).
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeMsg, setResumeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reissueBusy, setReissueBusy] = useState(false);
  const [reissuedLink, setReissuedLink] = useState<string | null>(null);
  const [reissueErr, setReissueErr] = useState<string | null>(null);

  useEffect(() => {
    const fetchDetail = async () => {
      setLoading360(true);
      const [payRes, proofRes, histRes] = await Promise.all([
        supabase
          .from("payments")
          .select(
            "id, amount_paise, status, method, cycle_number, paid_at, failure_reason, razorpay_payment_id, created_at",
          )
          .eq("subscription_id", sub.subscription_id)
          .order("created_at", { ascending: false }),

        supabase
          .from("sankalp_batch_subscriptions")
          .select(
            `
            batch_id,
            sankalp_batches (
              id, batch_type, batch_date,
              seva_proofs: seva_proofs (
                id, media_url, media_type, caption, is_delivered, delivered_at,
                month, year, batch_id,
                sevas ( name )
              )
            )
          `,
          )
          .eq("subscription_id", sub.subscription_id),

        supabase
          .from("plan_history")
          .select(
            `
            id, changed_at,
            old_plan: plans!plan_history_old_plan_id_fkey ( name ),
            new_plan: plans!plan_history_new_plan_id_fkey ( name ),
            changer: profiles ( full_name )
          `,
          )
          .eq("subscription_id", sub.subscription_id)
          .order("changed_at", { ascending: false }),
      ]);

      setPayments(payRes.data || []);

      const proofsList: SevaProof[] = [];
      if (proofRes.data) {
        for (const sbs of proofRes.data) {
          const batch = sbs.sankalp_batches as any;
          if (batch?.seva_proofs) {
            for (const proof of batch.seva_proofs) {
              proofsList.push({
                ...proof,
                sankalp_batches: { batch_type: batch.batch_type, batch_date: batch.batch_date },
              });
            }
          }
        }
      }
      setSevaProofs(proofsList);
      setPlanHistory((histRes.data as unknown as PlanHistoryEntry[]) || []);
      setLoading360(false);
    };
    fetchDetail();
  }, [sub.subscription_id]);

  const primary = sub.family_members.find((m) => m.is_primary) || sub.family_members[0];

  async function resumeSubscription() {
    setResumeBusy(true);
    setResumeMsg(null);
    try {
      const res = await callAdminApi<{ message?: string }>("/api/admin/subscriptions/resume", {
        subscription_id: sub.subscription_id,
      });
      setResumeMsg({ ok: true, text: res.message ?? "Resume requested" });
    } catch (err) {
      const text = err instanceof Error ? err.message : "Resume call failed";
      setResumeMsg({
        ok: false,
        text: `${text} — mandate dead ho sakta hai; "Send New Payment Link" use karein.`,
      });
    } finally {
      setResumeBusy(false);
    }
  }

  async function reissueLink() {
    setReissueBusy(true);
    setReissueErr(null);
    setReissuedLink(null);
    try {
      const res = await callAdminApi<{ shareLink: string }>(
        "/api/admin/subscriptions/reissue-link",
        {
          subscription_id: sub.subscription_id,
        },
      );
      setReissuedLink(res.shareLink);
    } catch (err) {
      setReissueErr(err instanceof Error ? err.message : "Reissue failed");
    } finally {
      setReissueBusy(false);
    }
  }

  const tabs = [
    { key: "overview", label: "Overview", icon: User },
    {
      key: "payments",
      label: `Payments${payments ? ` (${payments.length})` : ""}`,
      icon: CreditCard,
    },
    {
      key: "proofs",
      label: `Seva Proofs${sevaProofs ? ` (${sevaProofs.length})` : ""}`,
      icon: Video,
    },
    {
      key: "history",
      label: `Plan History${planHistory ? ` (${planHistory.length})` : ""}`,
      icon: ArrowUpRight,
    },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-amber-900/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-amber-100 bg-[#FFFDF9]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                {primary?.full_name || sub.profile_full_name || "Unknown Subscriber"}
              </h2>
              <StatusBadge status={sub.status} />
            </div>
            <p className="text-xs text-amber-900/60 mt-0.5 font-mono">
              {sub.subscription_id.slice(0, 8)}… • {sub.plan_name || "Unknown Plan"} • Started{" "}
              {fmtDate(sub.start_date)}
              {(sub.profile_alt_phone || sub.profile_phone) && (
                <> • {sub.profile_alt_phone || sub.profile_phone}</>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded-lg hover:bg-amber-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-amber-100 px-6 bg-white">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.key
                    ? "border-amber-700 text-amber-900"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading360 && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full bg-amber-50" />
              ))}
            </div>
          )}

          {!loading360 && tab === "overview" && (
            <div className="space-y-5">
              <Section title="Subscription Record" icon={ReceiptText}>
                <Grid2>
                  <Detail label="Plan" value={sub.plan_name || "—"} />
                  <Detail
                    label="Billing"
                    value={sub.plan_billing_period === "yearly" ? "Annual" : "Monthly"}
                  />
                  <Detail
                    label="Price"
                    value={sub.plan_price_paise != null ? fmtINR(sub.plan_price_paise) : "—"}
                  />
                  <Detail label="Status" value={<StatusBadge status={sub.status} />} />
                  <Detail label="Start Date" value={fmtDate(sub.start_date)} />
                  <Detail label="Next Billing" value={fmtDate(sub.next_billing_date)} />
                  <Detail
                    label="Mandate ID"
                    value={
                      sub.mandate_gateway_id
                        ? `${sub.mandate_gateway_id}${sub.mandate_gateway ? ` (${sub.mandate_gateway})` : ""}`
                        : "Not linked"
                    }
                    mono
                  />
                  <Detail label="Mandate Status" value={sub.mandate_status || "—"} />
                  <Detail label="Channel" value={sub.acquisition_channel || "—"} />
                  {sub.status === "paused" && (
                    <Detail label="Paused At" value={fmtDate(sub.paused_at)} />
                  )}
                  {sub.status === "halted" && (
                    <Detail label="Halted At" value={fmtDate(sub.halted_at)} />
                  )}
                  {sub.status === "cancelled" && (
                    <>
                      <Detail label="Cancelled At" value={fmtDate(sub.cancelled_at)} />
                      <Detail label="Cancel Reason" value={sub.cancel_reason || "—"} />
                    </>
                  )}
                </Grid2>
              </Section>

              {(sub.profile_phone || sub.profile_email || sub.profile_alt_phone) && (
                <Section title="Contact" icon={User}>
                  <Grid2>
                    <Detail
                      label={sub.profile_alt_phone ? "WhatsApp" : "Phone"}
                      value={sub.profile_phone || "—"}
                      mono
                    />
                    <Detail label="Email" value={sub.profile_email || "—"} />
                    {sub.profile_alt_phone && (
                      <Detail label="Calling Number" value={sub.profile_alt_phone} mono />
                    )}
                  </Grid2>
                </Section>
              )}

              {/* Halted recovery — Razorpay exhausted its own retries
                  (~3 days). Resume pokes the mandate; if the mandate
                  itself is dead, re-issue a fresh organic link. */}
              {sub.status === "halted" && (
                <Section title="Halted — Recovery Actions" icon={CircleStop}>
                  <div className="rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 text-xs text-red-900">
                    Razorpay ne retries exhaust kar diye hain. Resume se wahi mandate dobara charge
                    hota hai; fail hone par niche se naya payment link bhejein.
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <Button
                      onClick={resumeSubscription}
                      disabled={resumeBusy}
                      size="sm"
                      className="bg-red-700 hover:bg-red-800 text-white gap-1.5 text-xs h-8"
                    >
                      {resumeBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      Resume Subscription
                    </Button>
                    <Button
                      onClick={reissueLink}
                      disabled={reissueBusy}
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-800 hover:bg-red-50 gap-1.5 text-xs h-8"
                    >
                      {reissueBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Send New Payment Link
                    </Button>
                  </div>
                  {resumeMsg && (
                    <p
                      className={`text-xs mt-2 ${resumeMsg.ok ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {resumeMsg.text}
                    </p>
                  )}
                  {reissuedLink && (
                    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center gap-2 flex-wrap">
                      <code className="text-[11px] break-all">{reissuedLink}</code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigator.clipboard.writeText(reissuedLink)}
                        className="gap-1 h-6 text-[11px]"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </Button>
                      <span className="text-[11px] text-emerald-800 font-semibold">
                        Purana halted row cancelled (mandate_dead_reissued) — naya link organic,
                        kisi ko credit nahi.
                      </span>
                    </div>
                  )}
                  {reissueErr && <p className="text-xs text-red-700 mt-2">{reissueErr}</p>}
                </Section>
              )}

              {(sub.agent_full_name || sub.coupon_code) && (
                <Section title="Attribution" icon={Tag}>
                  <Grid2>
                    {sub.agent_full_name && (
                      <>
                        <Detail label="Agent" value={sub.agent_full_name} />
                        <Detail label="Agent Code" value={sub.agent_code || "—"} mono />
                      </>
                    )}
                    {sub.coupon_code && (
                      <>
                        <Detail label="Coupon Code" value={sub.coupon_code} mono />
                        <Detail
                          label="Discount"
                          value={`${
                            sub.coupon_discount_type === "percent"
                              ? sub.coupon_discount_value + "%"
                              : fmtINR(Number(sub.coupon_discount_value) * 100)
                          }`}
                        />
                      </>
                    )}
                  </Grid2>
                </Section>
              )}

              <Section title={`Family Members (${sub.family_members.length})`} icon={Users}>
                <div className="space-y-2">
                  {sub.family_members
                    .sort((a, b) => a.slot_number - b.slot_number)
                    .map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 bg-amber-50/50 rounded-lg px-3 py-2.5 border border-amber-100"
                      >
                        <div className="w-7 h-7 rounded-full bg-amber-200 flex items-center justify-center text-xs font-bold text-amber-900">
                          {m.slot_number}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900 truncate">
                              {m.full_name}
                            </span>
                            {m.is_primary && (
                              <span className="text-[10px] bg-amber-700 text-white px-1.5 py-0.5 rounded font-semibold">
                                Primary
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-amber-900/60 flex gap-2 mt-0.5">
                            {m.gotra && <span>Gotra: {m.gotra}</span>}
                            {m.relation && <span>• {m.relation}</span>}
                            {m.dob && <span>• DOB: {fmtDate(m.dob)}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </Section>
            </div>
          )}

          {!loading360 && tab === "payments" && (
            <div className="space-y-2">
              {!payments || payments.length === 0 ? (
                <EmptyState label="No payment records found." />
              ) : (
                payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between bg-white border border-amber-100 rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full flex-none ${
                          p.status === "captured"
                            ? "bg-emerald-500"
                            : p.status === "failed"
                              ? "bg-rose-500"
                              : p.status === "refunded"
                                ? "bg-sky-500"
                                : "bg-slate-300"
                        }`}
                      />
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {fmtINR(p.amount_paise)}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {p.razorpay_payment_id || "no rzp id"} • {p.method || "—"}
                          {p.cycle_number != null ? ` • cycle ${p.cycle_number}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-semibold text-slate-700 capitalize">
                        {p.status}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {fmtDate(p.paid_at || p.created_at)}
                      </div>
                      {p.failure_reason && (
                        <div className="text-[10px] text-rose-600 mt-0.5">{p.failure_reason}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {!loading360 && tab === "proofs" && (
            <div className="space-y-2">
              {!sevaProofs || sevaProofs.length === 0 ? (
                <EmptyState label="No seva proofs linked to this subscriber yet." />
              ) : (
                sevaProofs.map((proof) => (
                  <div
                    key={proof.id}
                    className="flex items-center justify-between bg-white border border-amber-100 rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${proof.is_delivered ? "bg-emerald-100" : "bg-amber-100"}`}
                      >
                        <Video
                          className={`w-4 h-4 ${proof.is_delivered ? "text-emerald-700" : "text-amber-700"}`}
                        />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {proof.sevas?.name || "Seva"} — {MONTHS[(proof.month || 1) - 1]}{" "}
                          {proof.year}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {proof.sankalp_batches?.batch_type?.replace("_", " ") || "—"} batch •{" "}
                          {proof.media_type === "video" ? "🎬 Video" : "📷 Image"}
                          {proof.caption && ` • ${proof.caption}`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      {proof.is_delivered ? (
                        <span className="text-[11px] font-semibold text-emerald-700">
                          Delivered {fmtDate(proof.delivered_at)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-amber-600 font-semibold">
                          Pending Delivery
                        </span>
                      )}
                      <a
                        href={proof.media_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-sky-600 hover:underline"
                      >
                        View Media ↗
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {!loading360 && tab === "history" && (
            <div className="space-y-2">
              {!planHistory || planHistory.length === 0 ? (
                <EmptyState label="No plan changes recorded for this subscription." />
              ) : (
                planHistory.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between bg-white border border-amber-100 rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <ArrowUpRight className="w-4 h-4 text-amber-700 flex-none" />
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {h.old_plan?.name || "—"} → {h.new_plan?.name || "—"}
                        </div>
                        {h.changer?.full_name && (
                          <div className="text-[11px] text-slate-500">By {h.changer.full_name}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500">{fmtDate(h.changed_at)}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Layout Helpers ───────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-amber-700" />
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-3">{children}</div>;
}

function Detail({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-900/50 mb-0.5">
        {label}
      </div>
      <div className={`text-sm text-slate-900 ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="text-center py-10 text-sm text-slate-400">{label}</div>;
}

// ─── Main Page ────────────────────────────────────────────────

function AdminSubscribersPage() {
  // ── List state (from subscriber_list_view, paginated) ──
  const [rows, setRows] = useState<SubscriberListRow[]>([]);
  const [totalCount, setTotal] = useState<number>(0);
  const [page, setPage] = useState(0); // 0-indexed
  const [loading, setLoading] = useState(true);
  const [errorMsg, setError] = useState<string | null>(null);

  // ── Filter options loaded separately (all plans/agents from DB) ──
  const [planOptions, setPlanOptions] = useState<{ id: string; name: string }[]>([]);
  const [agentOptions, setAgentOptions] = useState<{ id: string; full_name: string }[]>([]);
  const [optionsLoaded, setOptLoaded] = useState(false);

  // ── Filters (applied server-side) ──
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [pendingFilters, setPending] = useState<FilterState>(DEFAULT_FILTERS);

  // ── UI state ──
  const [expandedRows, setExpanded] = useState<Set<string>>(new Set());
  const [selected360, set360] = useState<Subscription360 | null>(null);
  const [loading360Open, setLoad360Open] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ── Load filter option lists once on mount ──
  useEffect(() => {
    const loadOptions = async () => {
      const [plansRes, agentsRes] = await Promise.all([
        supabase.from("plans").select("id, name").eq("is_active", true).order("sort_order"),
        supabase
          .from("sales_agents")
          .select("id, full_name")
          .eq("is_active", true)
          .order("full_name"),
      ]);
      setPlanOptions(plansRes.data || []);
      setAgentOptions(agentsRes.data || []);
      setOptLoaded(true);
    };
    loadOptions();
  }, []);

  // ── Query 1: paginated list from subscriber_list_view ──
  // Filters applied server-side. Count fetched with `count: "exact"`.
  // Resets to page 0 whenever filters change.
  const fetchPage = useCallback(async (pageIndex: number, activeFilters: FilterState) => {
    setLoading(true);
    setError(null);
    try {
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const ord = orderForFilters(activeFilters);
      let q = supabase
        .from("subscriber_list_view")
        .select("*", { count: "exact" })
        .order(ord.column, { ascending: ord.ascending })
        .range(from, to);

      q = applyFilters(q as any, activeFilters) as any;

      const { data, error, count } = await q;
      if (error) {
        console.error("subscriber_list_view error:", error);
        setError(
          "Could not load subscribers. Check Supabase RLS and that subscriber_list_view exists.",
        );
        setRows([]);
        setTotal(0);
      } else {
        setRows((data || []) as SubscriberListRow[]);
        setTotal(count ?? 0);
      }
    } catch (err) {
      console.error(err);
      setError("Unexpected error loading subscribers.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Run on mount and whenever page/filters change
  useEffect(() => {
    fetchPage(page, filters);
  }, [page, filters, fetchPage]);

  // ── Apply filters (resets to page 0) ──
  const applyPendingFilters = () => {
    setPage(0);
    setExpanded(new Set());
    setFilters(pendingFilters);
  };

  const clearFilters = () => {
    const reset = DEFAULT_FILTERS;
    setPending(reset);
    setFilters(reset);
    setPage(0);
    setExpanded(new Set());
  };

  const hasActiveFilters =
    filters.status !== "all" ||
    filters.planId !== "all" ||
    filters.agentId !== "all" ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.search ||
    filters.sankalpPending ||
    filters.stalePending;

  // ── Open 360 modal: load full family_members lazily ──
  const open360 = async (row: SubscriberListRow) => {
    setLoad360Open(true);
    const { data: fm } = await supabase
      .from("family_members")
      .select("id, full_name, gotra, relation, slot_number, is_primary, dob, created_at")
      .eq("subscription_id", row.subscription_id)
      .order("slot_number");

    set360({
      subscription_id: row.subscription_id,
      user_id: row.user_id,
      status: row.status,
      start_date: row.start_date,
      next_billing_date: row.next_billing_date,
      paused_at: row.paused_at,
      cancelled_at: row.cancelled_at,
      halted_at: row.halted_at,
      cancel_reason: row.cancel_reason,
      acquisition_channel: row.acquisition_channel,
      mandate_gateway: row.mandate_gateway,
      mandate_gateway_id: row.mandate_gateway_id,
      mandate_status: row.mandate_status,
      plan_name: row.plan_name,
      plan_price_paise: row.plan_price_paise,
      plan_billing_period: row.plan_billing_period,
      agent_full_name: row.agent_full_name,
      agent_code: row.agent_code,
      coupon_code: row.coupon_code,
      coupon_discount_type: row.coupon_discount_type,
      coupon_discount_value: row.coupon_discount_value,
      profile_full_name: row.profile_full_name,
      profile_phone: row.profile_phone,
      profile_email: row.profile_email,
      profile_alt_phone: row.profile_alt_phone,
      family_members: (fm || []) as FamilyMember[],
    });
    setLoad360Open(false);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* 360 Modal */}
      {selected360 && <Subscriber360Modal sub={selected360} onClose={() => set360(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-5 rounded-2xl border border-amber-900/10 shadow-2xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Subscribers</h1>
          <p className="text-xs text-amber-900/60 mt-0.5">
            {loading
              ? "Loading…"
              : `Showing ${rows.length > 0 ? page * PAGE_SIZE + 1 : 0}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} of ${totalCount.toLocaleString()} records`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => fetchPage(page, filters)}
            disabled={loading}
            variant="outline"
            size="sm"
            className="border-amber-900/15 bg-amber-50/50 text-amber-900 gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={() => exportCSVServerSide(filters, setExporting)}
            disabled={exporting || totalCount === 0}
            size="sm"
            className="bg-amber-700 hover:bg-amber-800 text-white gap-1.5 text-xs"
          >
            {exporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Exporting…
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" /> Export CSV ({totalCount.toLocaleString()})
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-none" />
          {errorMsg}
        </div>
      )}

      {/* Filters */}
      <Card className="border border-amber-900/10 bg-white">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Filter className="w-4 h-4 text-amber-700" />
              Filters
              <span className="text-[10px] font-normal text-amber-900/50">
                (applied server-side)
              </span>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-amber-700 hover:underline flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {/* Search */}
            <div className="xl:col-span-2 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                id="sub-search"
                type="text"
                placeholder="Name or phone…"
                value={pendingFilters.search}
                onChange={(e) => setPending((p) => ({ ...p, search: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && applyPendingFilters()}
                className="w-full pl-8 pr-3 py-2 text-xs border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white placeholder-slate-400"
              />
            </div>

            {/* Status */}
            <select
              id="sub-filter-status"
              value={pendingFilters.status}
              onChange={(e) => setPending((p) => ({ ...p, status: e.target.value }))}
              className="text-xs border border-amber-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white text-slate-700"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="halted">Halted</option>
              <option value="cancelled">Cancelled</option>
              <option value="pending">Pending</option>
              <option value="expired">Expired</option>
            </select>

            {/* Plan */}
            <select
              id="sub-filter-plan"
              value={pendingFilters.planId}
              onChange={(e) => setPending((p) => ({ ...p, planId: e.target.value }))}
              className="text-xs border border-amber-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white text-slate-700"
            >
              <option value="all">All Plans</option>
              {planOptions.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>

            {/* Agent */}
            <select
              id="sub-filter-agent"
              value={pendingFilters.agentId}
              onChange={(e) => setPending((p) => ({ ...p, agentId: e.target.value }))}
              className="text-xs border border-amber-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white text-slate-700"
            >
              <option value="all">All Agents</option>
              {agentOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name}
                </option>
              ))}
            </select>

            {/* Sankalp Pending call queue */}
            <label
              className={`flex items-center gap-2 text-xs border rounded-lg px-2.5 py-2 cursor-pointer select-none ${
                pendingFilters.sankalpPending
                  ? "border-rose-300 bg-rose-50 text-rose-800 font-semibold"
                  : "border-amber-200 bg-white text-slate-700"
              }`}
              title="Subscriptions with 0 family members — sales call queue, oldest purchase first"
            >
              <input
                type="checkbox"
                checked={pendingFilters.sankalpPending}
                onChange={(e) => setPending((p) => ({ ...p, sankalpPending: e.target.checked }))}
                className="accent-rose-600"
              />
              Sankalp Pending (0 members)
            </label>

            {/* Stale Pending queue — abandoned checkouts [Part C] */}
            <label
              className={`flex items-center gap-2 text-xs border rounded-lg px-2.5 py-2 cursor-pointer select-none ${
                pendingFilters.stalePending
                  ? "border-amber-300 bg-amber-50 text-amber-800 font-semibold"
                  : "border-amber-200 bg-white text-slate-700"
              }`}
              title={`Pending > ${STALE_PENDING_OPS_MINUTES} min — checkout opened but never paid; customer likely stuck. Follow up proactively.`}
            >
              <input
                type="checkbox"
                checked={pendingFilters.stalePending}
                onChange={(e) => setPending((p) => ({ ...p, stalePending: e.target.checked }))}
                className="accent-amber-600"
              />
              Stale Pending (abandoned checkout)
            </label>

            {/* Date range */}
            <div className="xl:col-span-1 flex gap-2">
              <input
                id="sub-filter-date-from"
                type="date"
                value={pendingFilters.dateFrom}
                onChange={(e) => setPending((p) => ({ ...p, dateFrom: e.target.value }))}
                title="Start date from"
                className="flex-1 text-xs border border-amber-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white text-slate-700"
              />
              <input
                id="sub-filter-date-to"
                type="date"
                value={pendingFilters.dateTo}
                onChange={(e) => setPending((p) => ({ ...p, dateTo: e.target.value }))}
                title="Start date to"
                className="flex-1 text-xs border border-amber-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white text-slate-700"
              />
            </div>
          </div>

          {/* Apply button — filters are pending until explicitly applied */}
          <div className="flex justify-end mt-3">
            <Button
              onClick={applyPendingFilters}
              size="sm"
              className="bg-amber-700 hover:bg-amber-800 text-white text-xs h-7 px-4 gap-1.5"
            >
              <Search className="w-3 h-3" />
              Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="rounded-xl border border-amber-900/10 overflow-hidden bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-amber-100 bg-amber-50/60">
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                  Subscriber
                </th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                  Plan
                </th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                  Start
                </th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                  Next Billing
                </th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                  Agent / Coupon
                </th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">
                  Family
                </th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                [...Array(PAGE_SIZE > 10 ? 8 : PAGE_SIZE)].map((_, i) => (
                  <tr key={i} className="border-b border-amber-50">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="py-3 px-4">
                        <Skeleton className="h-4 w-full bg-amber-50" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-sm text-slate-400">
                    {hasActiveFilters
                      ? "No subscribers match the current filters."
                      : errorMsg
                        ? "Query failed — check error above."
                        : "No subscriber records found."}
                  </td>
                </tr>
              )}

              {!loading &&
                rows.map((row) => {
                  const isExpanded = expandedRows.has(row.subscription_id);
                  const hasMoreMembers = row.family_member_count > 1;

                  return (
                    // [Pass-2 F13] keyed Fragment — keys on the inner <tr>
                    // don't key the list item React actually reconciles.
                    <Fragment key={row.subscription_id}>
                      <tr
                        className={`border-b border-amber-50 hover:bg-amber-50/30 transition-colors ${isExpanded ? "bg-amber-50/20" : ""}`}
                      >
                        {/* Subscriber */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">
                            {row.primary_member_name || row.profile_full_name || (
                              <span className="text-slate-400 italic">No name on file</span>
                            )}
                          </div>
                          {row.primary_member_gotra && (
                            <div className="text-[11px] text-amber-900/60">
                              Gotra: {row.primary_member_gotra}
                            </div>
                          )}
                          {row.profile_phone && (
                            <div className="text-[11px] text-slate-500 font-mono">
                              {row.profile_phone}
                              {row.profile_alt_phone && (
                                <span className="text-amber-700"> (WhatsApp)</span>
                              )}
                            </div>
                          )}
                          {row.profile_alt_phone && (
                            <div className="text-[11px] text-emerald-700 font-mono font-semibold">
                              {row.profile_alt_phone} (Call)
                            </div>
                          )}
                        </td>

                        {/* Plan */}
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800">{row.plan_name || "—"}</div>
                          <div className="text-[11px] text-slate-400">
                            {row.plan_price_paise != null ? fmtINR(row.plan_price_paise) : ""}
                            {row.plan_billing_period === "yearly" && (
                              <span className="ml-1 text-sky-600 font-semibold">Annual</span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge status={row.status} />
                            {row.family_member_count === 0 && row.status === "active" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-rose-50 text-rose-700 border-rose-200">
                                <PhoneCall className="w-3 h-3" />
                                Sankalp Pending
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Start */}
                        <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                          {fmtDate(row.start_date)}
                        </td>

                        {/* Next Billing */}
                        <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                          {fmtDate(row.next_billing_date)}
                        </td>

                        {/* Agent / Coupon */}
                        <td className="py-3 px-4">
                          {row.agent_full_name && (
                            <div className="flex items-center gap-1 text-[11px] text-slate-700">
                              <User className="w-3 h-3 text-amber-600" />
                              {row.agent_full_name}
                            </div>
                          )}
                          {row.coupon_code && (
                            <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono mt-0.5">
                              <Tag className="w-3 h-3 text-emerald-600" />
                              {row.coupon_code}
                            </div>
                          )}
                          {!row.agent_full_name && !row.coupon_code && (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>

                        {/* Family count + expand */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-slate-700">
                              {row.family_member_count}
                            </span>
                            {hasMoreMembers && (
                              <button
                                onClick={() =>
                                  setExpanded((prev) => {
                                    const next = new Set(prev);
                                    next.has(row.subscription_id)
                                      ? next.delete(row.subscription_id)
                                      : next.add(row.subscription_id);
                                    return next;
                                  })
                                }
                                className="text-amber-700 hover:text-amber-900 transition-colors"
                                title={isExpanded ? "Collapse" : "Expand family members"}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 360 */}
                        <td className="py-3 px-4">
                          <Button
                            onClick={() => open360(row)}
                            disabled={loading360Open}
                            size="sm"
                            variant="outline"
                            className="text-[11px] h-7 px-2.5 border-amber-200 text-amber-900 hover:bg-amber-50 gap-1"
                          >
                            {loading360Open ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Eye className="w-3 h-3" />
                            )}
                            360°
                          </Button>
                        </td>
                      </tr>

                      {/* Expanded: load all members lazily for this row */}
                      {isExpanded && (
                        <ExpandedMembersRow
                          key={`${row.subscription_id}-exp`}
                          subscriptionId={row.subscription_id}
                        />
                      )}
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {!loading && totalCount > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-amber-100 bg-amber-50/30">
            <p className="text-xs text-amber-900/60">
              Page {page + 1} of {totalPages} · {totalCount.toLocaleString()} total
            </p>
            <div className="flex items-center gap-1">
              <Button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0 border-amber-200"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              {/* Page number pills */}
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) {
                  pageNum = i;
                } else if (page <= 3) {
                  pageNum = i;
                } else if (page >= totalPages - 4) {
                  pageNum = totalPages - 7 + i;
                } else {
                  pageNum = page - 3 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    disabled={loading}
                    variant={pageNum === page ? "default" : "outline"}
                    size="sm"
                    className={`h-7 w-7 p-0 text-xs ${
                      pageNum === page
                        ? "bg-amber-700 text-white border-amber-700 hover:bg-amber-800"
                        : "border-amber-200 text-slate-600"
                    }`}
                  >
                    {pageNum + 1}
                  </Button>
                );
              })}
              <Button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0 border-amber-200"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Expanded member row (lazy loads all members for one sub) ─

function ExpandedMembersRow({ subscriptionId }: { subscriptionId: string }) {
  const [members, setMembers] = useState<FamilyMember[] | null>(null);

  useEffect(() => {
    supabase
      .from("family_members")
      .select("id, full_name, gotra, relation, slot_number, is_primary, dob")
      .eq("subscription_id", subscriptionId)
      .order("slot_number")
      .then(({ data }) => setMembers((data || []) as FamilyMember[]));
  }, [subscriptionId]);

  return (
    <tr className="border-b border-amber-100 bg-amber-50/20">
      <td colSpan={8} className="px-4 pb-3 pt-0">
        {members === null ? (
          <div className="flex items-center gap-2 text-xs text-amber-900/50 mt-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading members…
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {members.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-900 text-[11px] px-2 py-0.5 rounded-full"
              >
                <span className="font-semibold">{m.full_name}</span>
                {m.gotra && <span className="text-amber-700/70">· {m.gotra}</span>}
                {m.is_primary && (
                  <span className="text-[9px] bg-amber-700 text-white px-1 rounded">P</span>
                )}
              </span>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}
