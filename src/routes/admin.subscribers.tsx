import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  Search,
  Download,
  ChevronDown,
  ChevronUp,
  X,
  Eye,
  Users,
  CreditCard,
  Calendar,
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/subscribers")({
  component: AdminSubscribersPage,
});

// ─── Types ───────────────────────────────────────────────────

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

interface Subscription {
  id: string;
  user_id: string;
  status: string;
  start_date: string | null;
  next_billing_date: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  acquisition_channel: string | null;
  razorpay_sub_id: string | null;
  created_at: string;
  updated_at: string;
  plans: { id: string; name: string; price_paise: number; billing_period: string } | null;
  sales_agents: { id: string; full_name: string; agent_code: string } | null;
  coupons: { id: string; code: string; discount_type: string; discount_value: number } | null;
  family_members: FamilyMember[];
  // Loaded lazily for 360 view:
  payments?: Payment[];
  seva_proofs?: SevaProof[];
  plan_history?: PlanHistoryEntry[];
}

// ─── Helpers ─────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtINR(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    active:    { label: "Active",    cls: "bg-emerald-50 text-emerald-800 border-emerald-200", icon: CheckCircle2 },
    paused:    { label: "Paused",    cls: "bg-amber-50 text-amber-800 border-amber-200",      icon: PauseCircle },
    cancelled: { label: "Cancelled", cls: "bg-rose-50 text-rose-800 border-rose-200",         icon: XCircle },
    pending:   { label: "Pending",   cls: "bg-slate-100 text-slate-700 border-slate-200",     icon: Clock },
    expired:   { label: "Expired",   cls: "bg-slate-100 text-slate-500 border-slate-200",     icon: AlertCircle },
  };
  const m = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-700 border-slate-200", icon: AlertCircle };
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${m.cls}`}>
      <Icon className="w-3 h-3" />
      {m.label}
    </span>
  );
}

// ─── CSV Export ──────────────────────────────────────────────

function exportCSV(rows: Subscription[]) {
  const headers = [
    "subscription_id", "primary_name", "phone", "plan_name", "billing_period",
    "status", "start_date", "next_billing_date", "agent", "coupon_code",
    "family_members_count", "family_names_gotras", "created_at",
  ];
  const csvRows = rows.map((s) => {
    const primary = s.family_members.find((m) => m.is_primary) || s.family_members[0];
    const allMembers = s.family_members
      .sort((a, b) => a.slot_number - b.slot_number)
      .map((m) => `${m.full_name}${m.gotra ? ` (${m.gotra})` : ""}`)
      .join(" | ");
    return [
      s.id,
      primary?.full_name || "—",
      "—", // phone lives in profiles — not joined here; placeholder
      s.plans?.name || "—",
      s.plans?.billing_period || "—",
      s.status,
      s.start_date || "—",
      s.next_billing_date || "—",
      s.sales_agents?.full_name || "—",
      s.coupons?.code || "—",
      s.family_members.length,
      `"${allMembers}"`,
      s.created_at,
    ].join(",");
  });
  const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `punyata_subscribers_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Subscriber 360 Modal ────────────────────────────────────

function Subscriber360Modal({
  sub,
  onClose,
}: {
  sub: Subscription;
  onClose: () => void;
}) {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [sevaProofs, setSevaProofs] = useState<SevaProof[] | null>(null);
  const [planHistory, setPlanHistory] = useState<PlanHistoryEntry[] | null>(null);
  const [tab, setTab] = useState<"overview" | "payments" | "proofs" | "history">("overview");
  const [loading360, setLoading360] = useState(false);

  useEffect(() => {
    const fetchDetail = async () => {
      setLoading360(true);
      const [payRes, proofRes, histRes] = await Promise.all([
        // Query 3: Payment history for this subscription
        supabase
          .from("payments")
          .select("id, amount_paise, status, method, cycle_number, paid_at, failure_reason, razorpay_payment_id, created_at")
          .eq("subscription_id", sub.id)
          .order("created_at", { ascending: false }),

        // Query 4: Seva proofs delivered to this subscriber via sankalp_batch_subscriptions
        // path: sankalp_batch_subscriptions (sub_id) → sankalp_batches → seva_proofs (batch_id)
        supabase
          .from("sankalp_batch_subscriptions")
          .select(`
            batch_id,
            sankalp_batches (
              id, batch_type, batch_date,
              seva_proofs: seva_proofs (
                id, media_url, media_type, caption, is_delivered, delivered_at,
                month, year, batch_id,
                sevas ( name )
              )
            )
          `)
          .eq("subscription_id", sub.id),

        // Query 5: Plan history for this subscription
        supabase
          .from("plan_history")
          .select(`
            id, changed_at,
            old_plan: plans!plan_history_old_plan_id_fkey ( name ),
            new_plan: plans!plan_history_new_plan_id_fkey ( name ),
            changer: profiles ( full_name )
          `)
          .eq("subscription_id", sub.id)
          .order("changed_at", { ascending: false }),
      ]);

      setPayments(payRes.data || []);

      // Flatten the nested seva_proofs from the batch join
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
      setPlanHistory(histRes.data as PlanHistoryEntry[] || []);
      setLoading360(false);
    };
    fetchDetail();
  }, [sub.id]);

  const primary = sub.family_members.find((m) => m.is_primary) || sub.family_members[0];

  const tabs = [
    { key: "overview", label: "Overview", icon: User },
    { key: "payments", label: `Payments${payments ? ` (${payments.length})` : ""}`, icon: CreditCard },
    { key: "proofs", label: `Seva Proofs${sevaProofs ? ` (${sevaProofs.length})` : ""}`, icon: Video },
    { key: "history", label: `Plan History${planHistory ? ` (${planHistory.length})` : ""}`, icon: ArrowUpRight },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-amber-900/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-amber-100 bg-[#FFFDF9]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">{primary?.full_name || "Unknown Subscriber"}</h2>
              <StatusBadge status={sub.status} />
            </div>
            <p className="text-xs text-amber-900/60 mt-0.5 font-mono">
              {sub.id.slice(0, 8)}…  •  {sub.plans?.name || "Unknown Plan"}  •  Started {fmtDate(sub.start_date)}
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
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full bg-amber-50" />)}
            </div>
          )}

          {!loading360 && tab === "overview" && (
            <div className="space-y-5">
              {/* Subscription Record */}
              <Section title="Subscription Record" icon={ReceiptText}>
                <Grid2>
                  <Detail label="Plan" value={sub.plans?.name || "—"} />
                  <Detail label="Billing" value={sub.plans?.billing_period === "yearly" ? "Annual" : "Monthly"} />
                  <Detail label="Price" value={sub.plans ? fmtINR(sub.plans.price_paise) : "—"} />
                  <Detail label="Status" value={<StatusBadge status={sub.status} />} />
                  <Detail label="Start Date" value={fmtDate(sub.start_date)} />
                  <Detail label="Next Billing" value={fmtDate(sub.next_billing_date)} />
                  <Detail label="Razorpay Sub ID" value={sub.razorpay_sub_id || "Not linked"} mono />
                  <Detail label="Channel" value={sub.acquisition_channel || "—"} />
                  {sub.status === "paused" && <Detail label="Paused At" value={fmtDate(sub.paused_at)} />}
                  {sub.status === "cancelled" && (
                    <>
                      <Detail label="Cancelled At" value={fmtDate(sub.cancelled_at)} />
                      <Detail label="Cancel Reason" value={sub.cancel_reason || "—"} />
                    </>
                  )}
                </Grid2>
              </Section>

              {/* Attribution */}
              {(sub.sales_agents || sub.coupons) && (
                <Section title="Attribution" icon={Tag}>
                  <Grid2>
                    {sub.sales_agents && (
                      <>
                        <Detail label="Agent" value={sub.sales_agents.full_name} />
                        <Detail label="Agent Code" value={sub.sales_agents.agent_code} mono />
                      </>
                    )}
                    {sub.coupons && (
                      <>
                        <Detail label="Coupon Code" value={sub.coupons.code} mono />
                        <Detail
                          label="Discount"
                          value={`${sub.coupons.discount_type === "percent" ? sub.coupons.discount_value + "%" : fmtINR(Number(sub.coupons.discount_value) * 100)}`}
                        />
                      </>
                    )}
                  </Grid2>
                </Section>
              )}

              {/* Family Members */}
              <Section title={`Family Members (${sub.family_members.length})`} icon={Users}>
                <div className="space-y-2">
                  {sub.family_members
                    .sort((a, b) => a.slot_number - b.slot_number)
                    .map((m) => (
                      <div key={m.id} className="flex items-center gap-3 bg-amber-50/50 rounded-lg px-3 py-2.5 border border-amber-100">
                        <div className="w-7 h-7 rounded-full bg-amber-200 flex items-center justify-center text-xs font-bold text-amber-900">
                          {m.slot_number}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900 truncate">{m.full_name}</span>
                            {m.is_primary && (
                              <span className="text-[10px] bg-amber-700 text-white px-1.5 py-0.5 rounded font-semibold">Primary</span>
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
                      <div className={`w-2 h-2 rounded-full flex-none ${
                        p.status === "captured" ? "bg-emerald-500" :
                        p.status === "failed" ? "bg-rose-500" :
                        p.status === "refunded" ? "bg-sky-500" :
                        "bg-slate-300"
                      }`} />
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{fmtINR(p.amount_paise)}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {p.razorpay_payment_id || "no rzp id"} • {p.method || "—"}
                          {p.cycle_number != null ? ` • cycle ${p.cycle_number}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-semibold text-slate-700 capitalize">{p.status}</div>
                      <div className="text-[11px] text-slate-400">{fmtDate(p.paid_at || p.created_at)}</div>
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
                      <div className={`p-2 rounded-lg ${proof.is_delivered ? "bg-emerald-100" : "bg-amber-100"}`}>
                        <Video className={`w-4 h-4 ${proof.is_delivered ? "text-emerald-700" : "text-amber-700"}`} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {proof.sevas?.name || "Seva"} — {MONTHS[(proof.month || 1) - 1]} {proof.year}
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
                        <span className="text-[11px] font-semibold text-emerald-700">Delivered {fmtDate(proof.delivered_at)}</span>
                      ) : (
                        <span className="text-[11px] text-amber-600 font-semibold">Pending Delivery</span>
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
                  <div key={h.id} className="flex items-center justify-between bg-white border border-amber-100 rounded-xl px-4 py-3">
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

// ─── Small layout helpers ─────────────────────────────────────

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
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
      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-900/50 mb-0.5">{label}</div>
      <div className={`text-sm text-slate-900 ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-10 text-sm text-slate-400">{label}</div>
  );
}

// ─── Expandable Family Members row ───────────────────────────

function FamilyMembersExpanded({ members }: { members: FamilyMember[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {members
        .sort((a, b) => a.slot_number - b.slot_number)
        .map((m) => (
          <span key={m.id} className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-900 text-[11px] px-2 py-0.5 rounded-full">
            <span className="font-semibold">{m.full_name}</span>
            {m.gotra && <span className="text-amber-700/70">· {m.gotra}</span>}
          </span>
        ))}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────

function AdminSubscribersPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterAgent, setFilterAgent] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Available plan/agent options (derived from data)
  const [planOptions, setPlanOptions] = useState<{ id: string; name: string }[]>([]);
  const [agentOptions, setAgentOptions] = useState<{ id: string; full_name: string }[]>([]);

  // Expand/360
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selected360, setSelected360] = useState<Subscription | null>(null);

  // ── Query 1: Main subscriptions list ──
  // Joins: plans, sales_agents, coupons, family_members
  // ⚠ Performance note: family_members is a nested select — at scale (>500 subs),
  // consider using a DB view or pagination. Flag for Session 6.
  const fetchSubscribers = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select(`
          id, user_id, status, start_date, next_billing_date,
          paused_at, cancelled_at, cancel_reason, acquisition_channel,
          razorpay_sub_id, created_at, updated_at,
          plans ( id, name, price_paise, billing_period ),
          sales_agents ( id, full_name, agent_code ),
          coupons ( id, code, discount_type, discount_value ),
          family_members (
            id, full_name, gotra, relation, slot_number, is_primary, dob, created_at
          )
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Subscriptions fetch error:", error);
        setErrorMsg("Could not load subscribers — check Supabase connection and ANON key.");
        setSubs([]);
      } else {
        const rows = (data || []) as Subscription[];
        setSubs(rows);

        // Build filter option lists from data
        const plans = new Map<string, { id: string; name: string }>();
        const agents = new Map<string, { id: string; full_name: string }>();
        for (const s of rows) {
          if (s.plans) plans.set(s.plans.id, { id: s.plans.id, name: s.plans.name });
          if (s.sales_agents) agents.set(s.sales_agents.id, { id: s.sales_agents.id, full_name: s.sales_agents.full_name });
        }
        setPlanOptions([...plans.values()]);
        setAgentOptions([...agents.values()]);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Unexpected error loading subscribers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSubscribers(); }, []);

  // ── Client-side filtering (server-side pagination deferred to Session 6) ──
  const filteredSubs = useMemo(() => {
    return subs.filter((s) => {
      if (filterStatus !== "all" && s.status !== filterStatus) return false;
      if (filterPlan !== "all" && s.plans?.id !== filterPlan) return false;
      if (filterAgent !== "all" && s.sales_agents?.id !== filterAgent) return false;
      if (filterDateFrom && s.start_date && s.start_date < filterDateFrom) return false;
      if (filterDateTo && s.start_date && s.start_date > filterDateTo) return false;
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        const primary = s.family_members.find((m) => m.is_primary) || s.family_members[0];
        const nameMatch = primary?.full_name?.toLowerCase().includes(q);
        const idMatch = s.id.toLowerCase().includes(q);
        const couponMatch = s.coupons?.code?.toLowerCase().includes(q);
        if (!nameMatch && !idMatch && !couponMatch) return false;
      }
      return true;
    });
  }, [subs, filterStatus, filterPlan, filterAgent, filterDateFrom, filterDateTo, filterSearch]);

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const hasActiveFilters = filterStatus !== "all" || filterPlan !== "all" || filterAgent !== "all" || filterDateFrom || filterDateTo || filterSearch;

  const clearFilters = () => {
    setFilterStatus("all");
    setFilterPlan("all");
    setFilterAgent("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterSearch("");
  };

  return (
    <div className="space-y-5">
      {/* 360 Modal */}
      {selected360 && (
        <Subscriber360Modal sub={selected360} onClose={() => setSelected360(null)} />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-5 rounded-2xl border border-amber-900/10 shadow-2xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Subscribers</h1>
          <p className="text-xs text-amber-900/60 mt-0.5">
            {loading ? "Loading…" : `${filteredSubs.length} of ${subs.length} records`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={fetchSubscribers}
            disabled={loading}
            variant="outline"
            size="sm"
            className="border-amber-900/15 bg-amber-50/50 text-amber-900 gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={() => exportCSV(filteredSubs)}
            disabled={filteredSubs.length === 0}
            size="sm"
            className="bg-amber-700 hover:bg-amber-800 text-white gap-1.5 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV ({filteredSubs.length})
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
            </div>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-amber-700 hover:underline flex items-center gap-1">
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
                placeholder="Name, sub ID, coupon…"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white placeholder-slate-400"
              />
            </div>

            {/* Status */}
            <select
              id="sub-filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs border border-amber-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white text-slate-700"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="cancelled">Cancelled</option>
              <option value="pending">Pending</option>
              <option value="expired">Expired</option>
            </select>

            {/* Plan */}
            <select
              id="sub-filter-plan"
              value={filterPlan}
              onChange={(e) => setFilterPlan(e.target.value)}
              className="text-xs border border-amber-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white text-slate-700"
            >
              <option value="all">All Plans</option>
              {planOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {/* Agent */}
            <select
              id="sub-filter-agent"
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="text-xs border border-amber-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white text-slate-700"
            >
              <option value="all">All Agents</option>
              {agentOptions.map((a) => (
                <option key={a.id} value={a.id}>{a.full_name}</option>
              ))}
            </select>

            {/* Date Range — start_date */}
            <div className="xl:col-span-1 flex gap-2">
              <div className="flex-1">
                <input
                  id="sub-filter-date-from"
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  title="Start date from"
                  className="w-full text-xs border border-amber-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white text-slate-700"
                />
              </div>
              <div className="flex-1">
                <input
                  id="sub-filter-date-to"
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  title="Start date to"
                  className="w-full text-xs border border-amber-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white text-slate-700"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="rounded-xl border border-amber-900/10 overflow-hidden bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-amber-100 bg-amber-50/60">
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">Subscriber</th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">Plan</th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">Status</th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">Start</th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">Next Billing</th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">Agent / Coupon</th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-amber-900/60 uppercase tracking-wider">Family</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-amber-50">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="py-3 px-4">
                        <Skeleton className="h-4 w-full bg-amber-50" />
                      </td>
                    ))}
                  </tr>
                ))
              )}

              {!loading && filteredSubs.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-sm text-slate-400">
                    {hasActiveFilters ? "No subscribers match the current filters." : "No subscriber records found in Supabase."}
                  </td>
                </tr>
              )}

              {!loading && filteredSubs.map((sub) => {
                const primary = sub.family_members.find((m) => m.is_primary) || sub.family_members[0];
                const isExpanded = expandedRows.has(sub.id);
                const hasExtraMembers = sub.family_members.length > 1;

                return (
                  <>
                    <tr
                      key={sub.id}
                      className={`border-b border-amber-50 hover:bg-amber-50/30 transition-colors ${isExpanded ? "bg-amber-50/20" : ""}`}
                    >
                      {/* Subscriber (primary family member name) */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{primary?.full_name || <span className="text-slate-400 italic">No members</span>}</div>
                        {primary?.gotra && <div className="text-[11px] text-amber-900/60">Gotra: {primary.gotra}</div>}
                      </td>

                      {/* Plan */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{sub.plans?.name || "—"}</div>
                        <div className="text-[11px] text-slate-400">
                          {sub.plans ? fmtINR(sub.plans.price_paise) : ""}
                          {sub.plans?.billing_period === "yearly" && (
                            <span className="ml-1 text-sky-600 font-semibold">Annual</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <StatusBadge status={sub.status} />
                      </td>

                      {/* Start Date */}
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">{fmtDate(sub.start_date)}</td>

                      {/* Next Billing */}
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">{fmtDate(sub.next_billing_date)}</td>

                      {/* Agent / Coupon */}
                      <td className="py-3 px-4">
                        {sub.sales_agents && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-700">
                            <User className="w-3 h-3 text-amber-600" />
                            {sub.sales_agents.full_name}
                          </div>
                        )}
                        {sub.coupons && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono mt-0.5">
                            <Tag className="w-3 h-3 text-emerald-600" />
                            {sub.coupons.code}
                          </div>
                        )}
                        {!sub.sales_agents && !sub.coupons && <span className="text-slate-300 text-xs">—</span>}
                      </td>

                      {/* Family members (expandable) */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-700">{sub.family_members.length}</span>
                          {hasExtraMembers && (
                            <button
                              onClick={() => toggleExpand(sub.id)}
                              className="text-amber-700 hover:text-amber-900 transition-colors"
                              title={isExpanded ? "Collapse" : "Expand family members"}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4">
                        <Button
                          onClick={() => setSelected360(sub)}
                          size="sm"
                          variant="outline"
                          className="text-[11px] h-7 px-2.5 border-amber-200 text-amber-900 hover:bg-amber-50 gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          360°
                        </Button>
                      </td>
                    </tr>

                    {/* Expanded family members row */}
                    {isExpanded && (
                      <tr key={`${sub.id}-expanded`} className="border-b border-amber-100 bg-amber-50/20">
                        <td colSpan={8} className="px-4 pb-3 pt-0">
                          <FamilyMembersExpanded members={sub.family_members} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Performance Note Footer */}
        {!loading && subs.length > 200 && (
          <div className="px-4 py-2.5 border-t border-amber-100 bg-amber-50/40 text-[11px] text-amber-900/60 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-none" />
            <span>
              ⚠ Performance flag: {subs.length} records loaded client-side with nested family_members join. 
              Add server-side pagination + cursor in Session 6 to maintain &lt;200ms load times at scale.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
