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
  AlertCircle,
  ReceiptText,
  Video,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CircleStop,
  Play,
  Copy,
  QrCode,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { callAdminApi, fetchMyRole } from "@/lib/admin-api";
import { todayIST } from "@/lib/offline-subscriptions-logic";
import { ymLabel } from "@/lib/finance-ui";
import { AddOfflineSubscriberDialog } from "@/components/admin/offline-dialogs";
import { OfflineSubscriberPanel } from "@/components/admin/offline-subscriber-panel";
import {
  EmptyState as AdminEmptyState,
  Notice,
  PageHeader,
  Panel,
  StatCard,
  StatusPill,
  TableScroll,
  type Tone,
} from "@/components/admin/admin-ui";

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
  // "autopay" | "offline_qr" (migration 042) — carries no amount, safe for admin.
  payment_mode: string | null;
}

/** Filters that are applied server-side before pagination. */
interface FilterState {
  status: string;
  planId: string;
  agentId: string;
  /** all | autopay | offline_qr */
  paymentMode: string;
  /** all | before_this_month (already a member last month) | this_month */
  joined: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  /** Call queue: subscriptions with 0 family members (Sankalp Pending). */
  sankalpPending: boolean;
  /**
   * [SESSION_STUCK_PENDING_CHECKOUT Part C] Ops queue: pending rows older
   * than STALE_PENDING_OPS_MINUTES — abandoned checkouts that will never
   * webhook-activate. Deliberately LONGER than the customer-facing reuse
   * window in checkout-ttl.ts (PENDING_REUSE_WINDOW_MINUTES = 3 min): by
   * 1h a real in-flight payment is long resolved, so anything left
   * pending is worth a proactive call.
   */
  stalePending: boolean;
}

const STALE_PENDING_OPS_MINUTES = 60;

const DEFAULT_FILTERS: FilterState = {
  status: "all",
  planId: "all",
  agentId: "all",
  paymentMode: "all",
  joined: "all",
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
  payment_mode: string | null;
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
  const map: Record<string, { label: string; tone: Tone }> = {
    active: { label: "Active", tone: "good" },
    paused: { label: "Paused", tone: "warn" },
    cancelled: { label: "Cancelled", tone: "neutral" },
    // Distinct from paused (amber, voluntary) AND cancelled (neutral,
    // final): red = urgent-but-recoverable.
    halted: { label: "Halted", tone: "bad" },
    pending: { label: "Pending", tone: "neutral" },
    expired: { label: "Expired", tone: "neutral" },
  };
  const m = map[status] ?? { label: status, tone: "neutral" as Tone };
  return <StatusPill tone={m.tone}>{m.label}</StatusPill>;
}

const FIELD_CLS =
  "h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20";

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
  if (filters.paymentMode !== "all") query = query.eq("payment_mode", filters.paymentMode);
  if (filters.joined !== "all") {
    // Start date vs the first of the current IST month. With Status = Active this
    // is "active last month AND still active" (before_this_month) or "new this month".
    const monthStart = `${todayIST(new Date()).slice(0, 7)}-01`;
    query =
      filters.joined === "this_month"
        ? query.gte("start_date", monthStart)
        : query.lt("start_date", monthStart);
  }
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

function Subscriber360Modal({
  sub,
  onClose,
  isOwner,
  onChanged,
}: {
  sub: Subscription360;
  onClose: () => void;
  isOwner: boolean;
  onChanged: () => void;
}) {
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
  // QR / offline subscribers have no mandate and no gateway link, so the
  // mandate-only actions (Resume, Send New Payment Link) never apply.
  const isOfflineQr = sub.payment_mode === "offline_qr";

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-xl shadow-xl w-[calc(100vw-2rem)] sm:w-full sm:max-w-3xl max-h-[90vh] flex flex-col border border-stone-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-stone-100">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-stone-900 break-words">
                {primary?.full_name || sub.profile_full_name || "Unknown Subscriber"}
              </h2>
              <StatusBadge status={sub.status} />
            </div>
            <p className="text-xs text-stone-500 mt-1 break-words">
              <span className="font-mono">{sub.subscription_id.slice(0, 8)}…</span> ·{" "}
              {sub.plan_name || "Unknown Plan"} · Started {fmtDate(sub.start_date)}
              {(sub.profile_alt_phone || sub.profile_phone) && (
                <>
                  {" "}
                  · <span className="font-mono">{sub.profile_alt_phone || sub.profile_phone}</span>
                </>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-stone-400 hover:text-stone-700 transition-colors p-2 -m-1 rounded-md hover:bg-stone-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-stone-100 px-2 sm:px-4 overflow-x-auto">
          <div role="tablist" className="flex">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-3 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                    active
                      ? "border-orange-600 text-stone-900"
                      : "border-transparent text-stone-500 hover:text-stone-800"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading360 && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}

          {!loading360 && tab === "overview" && (
            <div className="space-y-6">
              <Section title="Subscription record" icon={ReceiptText}>
                <Grid2>
                  <Detail label="Plan" value={sub.plan_name || "—"} />
                  <Detail
                    label="Billing"
                    value={sub.plan_billing_period === "yearly" ? "Annual" : "Monthly"}
                  />
                  {(!isOfflineQr || isOwner) && (
                    <Detail
                      label="Price"
                      value={sub.plan_price_paise != null ? fmtINR(sub.plan_price_paise) : "—"}
                    />
                  )}
                  <Detail label="Status" value={<StatusBadge status={sub.status} />} />
                  <Detail label="Start date" value={fmtDate(sub.start_date)} />
                  <Detail label="Next billing" value={fmtDate(sub.next_billing_date)} />
                  {isOfflineQr ? (
                    <Detail label="Payment mode" value="QR / Offline" />
                  ) : (
                    <>
                      <Detail
                        label="Mandate ID"
                        value={
                          sub.mandate_gateway_id
                            ? `${sub.mandate_gateway_id}${sub.mandate_gateway ? ` (${sub.mandate_gateway})` : ""}`
                            : "Not linked"
                        }
                        mono
                      />
                      <Detail label="Mandate status" value={sub.mandate_status || "—"} />
                    </>
                  )}
                  <Detail label="Channel" value={sub.acquisition_channel || "—"} />
                  {sub.status === "paused" && (
                    <Detail label="Paused at" value={fmtDate(sub.paused_at)} />
                  )}
                  {sub.status === "halted" && (
                    <Detail label="Halted at" value={fmtDate(sub.halted_at)} />
                  )}
                  {sub.status === "cancelled" && (
                    <>
                      <Detail label="Cancelled at" value={fmtDate(sub.cancelled_at)} />
                      <Detail label="Cancel reason" value={sub.cancel_reason || "—"} />
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
                      <Detail label="Calling number" value={sub.profile_alt_phone} mono />
                    )}
                  </Grid2>
                </Section>
              )}

              {/* Halted recovery — Razorpay exhausted its own retries
                  (~3 days). Resume pokes the mandate; if the mandate
                  itself is dead, re-issue a fresh organic link. */}
              {isOfflineQr && (
                <Section title="QR / Offline payment" icon={QrCode}>
                  <OfflineSubscriberPanel
                    subscriptionId={sub.subscription_id}
                    name={primary?.full_name || sub.profile_full_name || null}
                    status={sub.status}
                    nextBillingDate={sub.next_billing_date}
                    planPricePaise={sub.plan_price_paise}
                    planBillingPeriod={sub.plan_billing_period}
                    isOwner={isOwner}
                    onChanged={onChanged}
                  />
                </Section>
              )}

              {sub.status === "halted" && !isOfflineQr && (
                <Section title="Halted — recovery actions" icon={CircleStop}>
                  <Notice tone="bad" className="text-xs">
                    Razorpay ne retries exhaust kar diye hain. Resume se wahi mandate dobara charge
                    hota hai; fail hone par niche se naya payment link bhejein.
                  </Notice>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <Button
                      onClick={resumeSubscription}
                      disabled={resumeBusy}
                      size="sm"
                      className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5 h-9 sm:h-8"
                    >
                      {resumeBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      Resume subscription
                    </Button>
                    <Button
                      onClick={reissueLink}
                      disabled={reissueBusy}
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-9 sm:h-8"
                    >
                      {reissueBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Send new payment link
                    </Button>
                  </div>
                  {resumeMsg && (
                    <p
                      className={`text-xs mt-2 ${resumeMsg.ok ? "text-emerald-700" : "text-rose-700"}`}
                    >
                      {resumeMsg.text}
                    </p>
                  )}
                  {reissuedLink && (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 space-y-2">
                      <div className="flex items-start gap-2">
                        <code className="flex-1 min-w-0 text-xs break-all text-stone-800">
                          {reissuedLink}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigator.clipboard.writeText(reissuedLink)}
                          className="gap-1 h-8 text-xs shrink-0"
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </Button>
                      </div>
                      <p className="text-xs text-emerald-800">
                        Purana halted row cancelled (mandate_dead_reissued) — naya link organic,
                        kisi ko credit nahi.
                      </p>
                    </div>
                  )}
                  {reissueErr && <p className="text-xs text-rose-700 mt-2">{reissueErr}</p>}
                </Section>
              )}

              {(sub.agent_full_name || sub.coupon_code) && (
                <Section title="Attribution" icon={Tag}>
                  <Grid2>
                    {sub.agent_full_name && (
                      <>
                        <Detail label="Agent" value={sub.agent_full_name} />
                        <Detail label="Agent code" value={sub.agent_code || "—"} mono />
                      </>
                    )}
                    {sub.coupon_code && (
                      <>
                        <Detail label="Coupon code" value={sub.coupon_code} mono />
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

              <Section title={`Family members (${sub.family_members.length})`} icon={Users}>
                <div className="rounded-lg border border-stone-200 divide-y divide-stone-100">
                  {sub.family_members
                    .sort((a, b) => a.slot_number - b.slot_number)
                    .map((m) => (
                      <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="w-7 h-7 shrink-0 rounded-full bg-stone-100 flex items-center justify-center text-xs font-semibold text-stone-600">
                          {m.slot_number}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-stone-900 truncate">
                              {m.full_name}
                            </span>
                            {m.is_primary && <StatusPill tone="info">Primary</StatusPill>}
                          </div>
                          <div className="text-xs text-stone-500 flex flex-wrap gap-x-2 mt-0.5">
                            {m.gotra && <span>Gotra: {m.gotra}</span>}
                            {m.relation && <span>· {m.relation}</span>}
                            {m.dob && <span>· DOB: {fmtDate(m.dob)}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </Section>
            </div>
          )}

          {!loading360 && tab === "payments" && (
            <div>
              {!payments || payments.length === 0 ? (
                <EmptyState label="No payment records found." />
              ) : (
                <div className="rounded-lg border border-stone-200 divide-y divide-stone-100">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-start justify-between gap-3 px-3 sm:px-4 py-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-2 h-2 rounded-full flex-none mt-1.5 ${
                            p.status === "captured"
                              ? "bg-emerald-500"
                              : p.status === "failed"
                                ? "bg-rose-500"
                                : p.status === "refunded"
                                  ? "bg-sky-500"
                                  : "bg-stone-300"
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-stone-900 tabular-nums">
                            {fmtINR(p.amount_paise)}
                          </div>
                          <div className="text-xs text-stone-500 font-mono break-all">
                            {p.razorpay_payment_id || "no rzp id"} · {p.method || "—"}
                            {p.cycle_number != null ? ` · cycle ${p.cycle_number}` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-medium text-stone-700 capitalize">
                          {p.status}
                        </div>
                        <div className="text-xs text-stone-400 whitespace-nowrap">
                          {fmtDate(p.paid_at || p.created_at)}
                        </div>
                        {p.failure_reason && (
                          <div className="text-xs text-rose-600 mt-0.5 max-w-40">
                            {p.failure_reason}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading360 && tab === "proofs" && (
            <div>
              {!sevaProofs || sevaProofs.length === 0 ? (
                <EmptyState label="No seva proofs linked to this subscriber yet." />
              ) : (
                <div className="rounded-lg border border-stone-200 divide-y divide-stone-100">
                  {sevaProofs.map((proof) => (
                    <div
                      key={proof.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 sm:px-4 py-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <Video className="w-4 h-4 mt-0.5 shrink-0 text-stone-400" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-stone-900">
                            {proof.sevas?.name || "Seva"} — {MONTHS[(proof.month || 1) - 1]}{" "}
                            {proof.year}
                          </div>
                          <div className="text-xs text-stone-500 break-words">
                            {proof.sankalp_batches?.batch_type?.replace("_", " ") || "—"} batch ·{" "}
                            {proof.media_type === "video" ? "Video" : "Image"}
                            {proof.caption && ` · ${proof.caption}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-1 pl-7 sm:pl-0 shrink-0">
                        {proof.is_delivered ? (
                          <StatusPill tone="good">
                            Delivered {fmtDate(proof.delivered_at)}
                          </StatusPill>
                        ) : (
                          <StatusPill tone="warn">Pending delivery</StatusPill>
                        )}
                        <a
                          href={proof.media_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-orange-700 hover:underline"
                        >
                          View media ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading360 && tab === "history" && (
            <div>
              {!planHistory || planHistory.length === 0 ? (
                <EmptyState label="No plan changes recorded for this subscription." />
              ) : (
                <div className="rounded-lg border border-stone-200 divide-y divide-stone-100">
                  {planHistory.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-start justify-between gap-3 px-3 sm:px-4 py-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <ArrowUpRight className="w-4 h-4 mt-0.5 text-stone-400 flex-none" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-stone-900">
                            {h.old_plan?.name || "—"} → {h.new_plan?.name || "—"}
                          </div>
                          {h.changer?.full_name && (
                            <div className="text-xs text-stone-500">By {h.changer.full_name}</div>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-stone-500 whitespace-nowrap">
                        {fmtDate(h.changed_at)}
                      </div>
                    </div>
                  ))}
                </div>
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
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-stone-400" />
        <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-x-6 gap-y-3">{children}</div>;
}

function Detail({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-stone-500 mb-0.5">{label}</div>
      <div
        className={`text-sm text-stone-900 break-words ${mono ? "font-mono text-xs break-all" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <AdminEmptyState title={label} />;
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

  // Owner-only extras: Add offline subscriber, QR money buttons, QR amounts.
  const [isOwner, setIsOwner] = useState(false);
  const [addingOffline, setAddingOffline] = useState(false);
  useEffect(() => {
    void fetchMyRole().then((r) => setIsOwner(r === "owner"));
  }, []);

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
    filters.paymentMode !== "all" ||
    filters.joined !== "all" ||
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
      payment_mode: row.payment_mode,
      family_members: (fm || []) as FamilyMember[],
    });
    setLoad360Open(false);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const subscriberName = (row: SubscriberListRow) =>
    row.primary_member_name ||
    row.profile_full_name || <span className="text-stone-400 font-normal">No name on file</span>;

  const planPrice = (row: SubscriberListRow) =>
    row.plan_price_paise != null && (isOwner || row.payment_mode !== "offline_qr")
      ? fmtINR(row.plan_price_paise)
      : "";

  const statusPills = (row: SubscriberListRow) => (
    <>
      <StatusBadge status={row.status} />
      {row.payment_mode === "offline_qr" && <StatusPill tone="neutral">QR</StatusPill>}
      {row.family_member_count === 0 && row.status === "active" && (
        <StatusPill tone="bad">Details incomplete</StatusPill>
      )}
    </>
  );

  const checkboxCls = (on: boolean, tone: "rose" | "amber") =>
    `flex items-center gap-2 h-9 text-sm border rounded-md px-3 cursor-pointer select-none ${
      on
        ? tone === "rose"
          ? "border-rose-300 bg-rose-50 text-rose-800 font-medium"
          : "border-amber-300 bg-amber-50 text-amber-800 font-medium"
        : "border-stone-200 bg-white text-stone-700"
    }`;

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* 360 Modal */}
      {selected360 && (
        <Subscriber360Modal
          sub={selected360}
          onClose={() => set360(null)}
          isOwner={isOwner}
          onChanged={() => {
            set360(null);
            void fetchPage(page, filters);
          }}
        />
      )}

      {isOwner && (
        <AddOfflineSubscriberDialog
          open={addingOffline}
          onClose={() => setAddingOffline(false)}
          onDone={() => void fetchPage(page, filters)}
        />
      )}

      <PageHeader
        title="Subscribers"
        description={
          loading
            ? "Loading…"
            : `Showing ${rows.length > 0 ? page * PAGE_SIZE + 1 : 0}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} of ${totalCount.toLocaleString()} records`
        }
        actions={
          <>
            {isOwner && (
              <Button
                onClick={() => setAddingOffline(true)}
                size="sm"
                variant="outline"
                className="gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add offline subscriber
              </Button>
            )}
            <Button
              onClick={() => fetchPage(page, filters)}
              disabled={loading}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              onClick={() => exportCSVServerSide(filters, setExporting)}
              disabled={exporting || totalCount === 0}
              size="sm"
              className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5"
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
          </>
        }
      />

      {/* Error Banner */}
      {errorMsg && (
        <Notice tone="bad" icon={AlertCircle}>
          {errorMsg}
        </Notice>
      )}

      <SubscriberCounts />

      {/* Filters */}
      <Panel
        title="Filters"
        description="Applied server-side."
        actions={
          hasActiveFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="gap-1 text-orange-700"
            >
              <X className="w-3.5 h-3.5" /> Clear all
            </Button>
          ) : undefined
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {/* Search */}
          <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
            <input
              id="sub-search"
              type="text"
              placeholder="Name or phone…"
              value={pendingFilters.search}
              onChange={(e) => setPending((p) => ({ ...p, search: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && applyPendingFilters()}
              className={`${FIELD_CLS} pl-8 placeholder:text-stone-400`}
            />
          </div>

          {/* Status */}
          <select
            id="sub-filter-status"
            value={pendingFilters.status}
            onChange={(e) => setPending((p) => ({ ...p, status: e.target.value }))}
            className={FIELD_CLS}
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
            className={FIELD_CLS}
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
            className={FIELD_CLS}
          >
            <option value="all">All Agents</option>
            {agentOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name}
              </option>
            ))}
          </select>

          {/* Payment mode — autopay (mandate) vs QR / offline */}
          <select
            id="sub-filter-payment-mode"
            value={pendingFilters.paymentMode}
            onChange={(e) => setPending((p) => ({ ...p, paymentMode: e.target.value }))}
            className={FIELD_CLS}
          >
            <option value="all">All Payment Modes</option>
            <option value="autopay">Autopay</option>
            <option value="offline_qr">QR / Offline</option>
          </select>

          {/* Joined — "active last month" / "new this month" */}
          <select
            id="sub-filter-joined"
            value={pendingFilters.joined}
            onChange={(e) => setPending((p) => ({ ...p, joined: e.target.value }))}
            className={FIELD_CLS}
            title="Pair with Status = Active to see who was active last month and still is"
          >
            <option value="all">Joined: any time</option>
            <option value="before_this_month">Member before this month</option>
            <option value="this_month">New this month</option>
          </select>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-2">
            <input
              id="sub-filter-date-from"
              type="date"
              value={pendingFilters.dateFrom}
              onChange={(e) => setPending((p) => ({ ...p, dateFrom: e.target.value }))}
              title="Start date from"
              aria-label="Start date from"
              className={`${FIELD_CLS} min-w-0 px-2`}
            />
            <input
              id="sub-filter-date-to"
              type="date"
              value={pendingFilters.dateTo}
              onChange={(e) => setPending((p) => ({ ...p, dateTo: e.target.value }))}
              title="Start date to"
              aria-label="Start date to"
              className={`${FIELD_CLS} min-w-0 px-2`}
            />
          </div>

          {/* Details Incomplete call queue (0 family members) */}
          <label
            className={checkboxCls(pendingFilters.sankalpPending, "rose")}
            title="Subscriptions with 0 family members — sales call queue, oldest purchase first"
          >
            <input
              type="checkbox"
              checked={pendingFilters.sankalpPending}
              onChange={(e) => setPending((p) => ({ ...p, sankalpPending: e.target.checked }))}
              className="accent-rose-600"
            />
            <span className="truncate">Details Incomplete (0 members)</span>
          </label>

          {/* Stale Pending queue — abandoned checkouts [Part C] */}
          <label
            className={checkboxCls(pendingFilters.stalePending, "amber")}
            title={`Pending > ${STALE_PENDING_OPS_MINUTES} min — checkout opened but never paid; customer likely stuck. Follow up proactively.`}
          >
            <input
              type="checkbox"
              checked={pendingFilters.stalePending}
              onChange={(e) => setPending((p) => ({ ...p, stalePending: e.target.checked }))}
              className="accent-amber-600"
            />
            <span className="truncate">Stale Pending (abandoned checkout)</span>
          </label>
        </div>

        {/* Apply button — filters are pending until explicitly applied */}
        <div className="flex justify-end mt-3">
          <Button
            onClick={applyPendingFilters}
            size="sm"
            className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 text-white gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            Apply filters
          </Button>
        </div>
      </Panel>

      {/* List */}
      <Panel title="Subscriptions" flush>
        {loading ? (
          <div className="p-4 sm:p-5 space-y-2">
            {[...Array(PAGE_SIZE > 10 ? 8 : PAGE_SIZE)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <AdminEmptyState
            icon={Users}
            title={
              hasActiveFilters
                ? "No subscribers match the current filters."
                : errorMsg
                  ? "Query failed — check error above."
                  : "No subscriber records found."
            }
          />
        ) : (
          <>
            {/* Phone: stacked cards */}
            <ul className="md:hidden divide-y divide-stone-100">
              {rows.map((row) => {
                const isExpanded = expandedRows.has(row.subscription_id);
                const hasMoreMembers = row.family_member_count > 1;
                return (
                  <li key={row.subscription_id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-stone-900 break-words">
                          {subscriberName(row)}
                        </div>
                        {row.primary_member_gotra && (
                          <div className="text-xs text-stone-500">
                            Gotra: {row.primary_member_gotra}
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={() => open360(row)}
                        disabled={loading360Open}
                        size="sm"
                        variant="outline"
                        className="h-9 px-3 gap-1 shrink-0"
                      >
                        {loading360Open ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                        360°
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">{statusPills(row)}</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <div className="min-w-0">
                        <div className="text-stone-500">Plan</div>
                        <div className="text-stone-800 truncate">
                          {row.plan_name || "—"}
                          {row.plan_billing_period === "yearly" && (
                            <span className="ml-1 text-sky-700 font-medium">Annual</span>
                          )}
                        </div>
                        {planPrice(row) && (
                          <div className="text-stone-500 tabular-nums">{planPrice(row)}</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-stone-500">Contact</div>
                        {row.profile_phone ? (
                          <div className="font-mono text-stone-700 break-all">
                            {row.profile_phone}
                            {row.profile_alt_phone && (
                              <span className="font-sans text-stone-500"> (WhatsApp)</span>
                            )}
                          </div>
                        ) : (
                          !row.profile_alt_phone && <div className="text-stone-400">—</div>
                        )}
                        {row.profile_alt_phone && (
                          <div className="font-mono text-emerald-700 font-medium break-all">
                            {row.profile_alt_phone} (Call)
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-stone-500">Start</div>
                        <div className="text-stone-700">{fmtDate(row.start_date)}</div>
                      </div>
                      <div>
                        <div className="text-stone-500">Next billing</div>
                        <div className="text-stone-700">{fmtDate(row.next_billing_date)}</div>
                      </div>
                      {(row.agent_full_name || row.coupon_code) && (
                        <div className="col-span-2 min-w-0 flex flex-wrap gap-x-3 gap-y-0.5 text-stone-600">
                          {row.agent_full_name && (
                            <span className="inline-flex items-center gap-1">
                              <User className="w-3 h-3 text-stone-400" />
                              {row.agent_full_name}
                            </span>
                          )}
                          {row.coupon_code && (
                            <span className="inline-flex items-center gap-1 font-mono">
                              <Tag className="w-3 h-3 text-stone-400" />
                              {row.coupon_code}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-stone-600">
                      <span>
                        Family:{" "}
                        <span className="font-semibold text-stone-800">
                          {row.family_member_count}
                        </span>
                      </span>
                      {hasMoreMembers && (
                        <button
                          onClick={() => toggleExpanded(row.subscription_id)}
                          className="inline-flex items-center gap-0.5 font-medium text-orange-700 py-1"
                        >
                          {isExpanded ? "Hide" : "Show"}
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                    {isExpanded && <MemberChips subscriptionId={row.subscription_id} />}
                  </li>
                );
              })}
            </ul>

            {/* Tablet / desktop: table */}
            <TableScroll className="hidden md:block">
              <table className="w-full text-sm admin-table-fixed min-w-[960px]">
                <thead>
                  <tr className="text-left text-xs text-stone-500 border-b border-stone-100">
                    <th className="font-medium px-4 py-2.5">Subscriber</th>
                    <th className="font-medium px-3 py-2.5">Plan</th>
                    <th className="font-medium px-3 py-2.5">Status</th>
                    <th className="font-medium px-3 py-2.5">Start</th>
                    <th className="font-medium px-3 py-2.5">Next billing</th>
                    <th className="font-medium px-3 py-2.5">Agent / coupon</th>
                    <th className="font-medium px-3 py-2.5">Family</th>
                    <th className="px-4 py-2.5">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {rows.map((row) => {
                    const isExpanded = expandedRows.has(row.subscription_id);
                    const hasMoreMembers = row.family_member_count > 1;

                    return (
                      // [Pass-2 F13] keyed Fragment — keys on the inner <tr>
                      // don't key the list item React actually reconciles.
                      <Fragment key={row.subscription_id}>
                        <tr
                          className={`align-top hover:bg-stone-50/60 transition-colors ${isExpanded ? "bg-stone-50/60" : ""}`}
                        >
                          {/* Subscriber */}
                          <td className="px-4 py-3">
                            <div className="font-medium text-stone-900">{subscriberName(row)}</div>
                            {row.primary_member_gotra && (
                              <div className="text-xs text-stone-500">
                                Gotra: {row.primary_member_gotra}
                              </div>
                            )}
                            {row.profile_phone && (
                              <div className="text-xs text-stone-500 font-mono">
                                {row.profile_phone}
                                {row.profile_alt_phone && (
                                  <span className="font-sans text-stone-400"> (WhatsApp)</span>
                                )}
                              </div>
                            )}
                            {row.profile_alt_phone && (
                              <div className="text-xs text-emerald-700 font-mono font-medium">
                                {row.profile_alt_phone} (Call)
                              </div>
                            )}
                          </td>

                          {/* Plan */}
                          <td className="px-3 py-3">
                            <div className="text-stone-800">{row.plan_name || "—"}</div>
                            <div className="text-xs text-stone-500 tabular-nums">
                              {planPrice(row)}
                              {row.plan_billing_period === "yearly" && (
                                <span className="ml-1 text-sky-700 font-medium">Annual</span>
                              )}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-3 py-3">
                            <div className="flex flex-col items-start gap-1">
                              {statusPills(row)}
                            </div>
                          </td>

                          {/* Start */}
                          <td className="px-3 py-3 text-xs text-stone-600 whitespace-nowrap">
                            {fmtDate(row.start_date)}
                          </td>

                          {/* Next Billing */}
                          <td className="px-3 py-3 text-xs text-stone-600 whitespace-nowrap">
                            {fmtDate(row.next_billing_date)}
                          </td>

                          {/* Agent / Coupon */}
                          <td className="px-3 py-3">
                            {row.agent_full_name && (
                              <div className="flex items-center gap-1 text-xs text-stone-700">
                                <User className="w-3 h-3 text-stone-400" />
                                {row.agent_full_name}
                              </div>
                            )}
                            {row.coupon_code && (
                              <div className="flex items-center gap-1 text-xs text-stone-500 font-mono mt-0.5">
                                <Tag className="w-3 h-3 text-stone-400" />
                                {row.coupon_code}
                              </div>
                            )}
                            {!row.agent_full_name && !row.coupon_code && (
                              <span className="text-stone-300 text-xs">—</span>
                            )}
                          </td>

                          {/* Family count + expand */}
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-stone-700 tabular-nums">
                                {row.family_member_count}
                              </span>
                              {hasMoreMembers && (
                                <button
                                  onClick={() => toggleExpanded(row.subscription_id)}
                                  className="p-1 rounded text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
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
                          <td className="px-4 py-3 text-right">
                            <Button
                              onClick={() => open360(row)}
                              disabled={loading360Open}
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 gap-1 text-xs"
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
            </TableScroll>
          </>
        )}

        {/* Pagination footer */}
        {!loading && totalCount > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-stone-100">
            <p className="text-xs text-stone-500">
              Page {page + 1} of {totalPages} · {totalCount.toLocaleString()} total
            </p>
            <div className="flex items-center gap-1">
              <Button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                variant="outline"
                size="sm"
                className="h-9 w-9 sm:h-8 sm:w-8 p-0"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {/* Page number pills (hidden on phones — prev/next + "Page x of y" instead) */}
              <div className="hidden sm:flex items-center gap-1">
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
                      className={`h-8 w-8 p-0 text-xs tabular-nums ${
                        pageNum === page
                          ? "bg-orange-600 text-white border-orange-600 hover:bg-orange-700"
                          : "text-stone-600"
                      }`}
                    >
                      {pageNum + 1}
                    </Button>
                  );
                })}
              </div>
              <Button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
                variant="outline"
                size="sm"
                className="h-9 w-9 sm:h-8 sm:w-8 p-0"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ─── Expanded member row (lazy loads all members for one sub) ─

function MemberChips({ subscriptionId }: { subscriptionId: string }) {
  const [members, setMembers] = useState<FamilyMember[] | null>(null);

  useEffect(() => {
    supabase
      .from("family_members")
      .select("id, full_name, gotra, relation, slot_number, is_primary, dob")
      .eq("subscription_id", subscriptionId)
      .order("slot_number")
      .then(({ data }) => setMembers((data || []) as FamilyMember[]));
  }, [subscriptionId]);

  return members === null ? (
    <div className="flex items-center gap-2 text-xs text-stone-500">
      <Loader2 className="w-3 h-3 animate-spin" /> Loading members…
    </div>
  ) : (
    <div className="flex flex-wrap gap-1.5">
      {members.map((m) => (
        <span
          key={m.id}
          className="inline-flex items-center gap-1 bg-white border border-stone-200 text-stone-800 text-xs px-2 py-0.5 rounded-full"
        >
          <span className="font-medium">{m.full_name}</span>
          {m.gotra && <span className="text-stone-500">· {m.gotra}</span>}
          {m.is_primary && (
            <span className="text-[10px] font-semibold bg-sky-50 text-sky-700 px-1 rounded">P</span>
          )}
        </span>
      ))}
    </div>
  );
}

function ExpandedMembersRow({ subscriptionId }: { subscriptionId: string }) {
  return (
    <tr className="bg-stone-50/60">
      <td colSpan={8} className="px-4 pb-3 pt-0">
        <MemberChips subscriptionId={subscriptionId} />
      </td>
    </tr>
  );
}

// ─── Counts strip: active now, last month vs this month ──────
// Counts only (no ₹) → served to admins too. "Paying" = a payment covers that
// month; "Active now" is the live status.
interface TrendResponse {
  toYm: string;
  activeNow: number;
  months: { ym: string; paying: number; newSubs: number; cancelled: number; lapsed: number }[];
}

function SubscriberCounts() {
  const [data, setData] = useState<TrendResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    callAdminApi<TrendResponse>("/api/admin/subscribers/trend", { months: 2 })
      .then(setData)
      .catch(() => setFailed(true));
  }, []);
  if (failed) return null;
  const cur = data?.months[1];
  const prev = data?.months[0];
  const loading = data === null;
  const tile = (label: string, value: number | undefined, sub: string, className?: string) => (
    <StatCard
      label={label}
      value={value ?? "—"}
      hint={sub || undefined}
      loading={loading}
      className={className}
    />
  );
  const delta = cur && prev ? cur.paying - prev.paying : null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
      {tile("Active now", data?.activeNow, "status = active")}
      {tile(
        `Paying · ${prev ? ymLabel(prev.ym) : "last month"}`,
        prev?.paying,
        "a payment covers that month",
      )}
      {tile(
        `Paying · ${cur ? ymLabel(cur.ym) : "this month"}`,
        cur?.paying,
        delta === null ? "" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)} vs last month`,
      )}
      {tile(`New · ${prev ? ymLabel(prev.ym) : "last month"}`, prev?.newSubs, "joined that month")}
      {tile(
        `Cancelled · ${prev ? ymLabel(prev.ym) : "last month"}`,
        prev?.cancelled,
        prev ? `+ ${prev.lapsed} lapsed` : "",
        "col-span-2 md:col-span-1",
      )}
    </div>
  );
}
