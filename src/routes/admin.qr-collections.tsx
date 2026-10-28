import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  History,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Undo2,
  Wallet,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { callAdminApi } from "@/lib/admin-api";
import { fmtDate, fmtINR } from "@/lib/reports-logic";
import { buildOwnerReminderLink, type DueState } from "@/lib/offline-subscriptions-logic";
import {
  AddOfflineSubscriberDialog,
  RecordPaymentDialog,
  StopSubscriptionDialog,
  VoidPaymentDialog,
  type RecordPaymentTarget,
} from "@/components/admin/offline-dialogs";
import {
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatCard,
  StatusPill,
  type Tone,
} from "@/components/admin/admin-ui";

export const Route = createFileRoute("/admin/qr-collections")({
  // OWNER-ONLY (shows ₹ amounts — same gate discipline as /admin/commissions).
  beforeLoad: async () => {
    const { fetchMyRole } = await import("@/lib/admin-api");
    const role = await fetchMyRole();
    if (role !== "owner")
      throw redirect({ to: "/admin/overview", search: { notice: "owner-required" } });
  },
  component: QrCollectionsPage,
});

interface RegisterRow {
  subscriptionId: string;
  name: string | null;
  phone: string | null;
  planName: string | null;
  status: string;
  dueState: DueState;
  nextBillingDate: string | null;
  anchorDay: number | null;
  planPricePaise: number | null;
  planBillingPeriod: string | null;
  expectedPaise: number;
  paymentsCount: number;
  lastPayment: {
    paymentId: string;
    amountPaise: number | null;
    paidAt: string | null;
    method: string | null;
    referenceNo: string | null;
    monthsCovered: number;
    periodEnd: string;
  } | null;
}

interface RegisterResponse {
  month: string;
  today: string;
  upiVpa: string | null;
  totals: {
    expectedThisMonth: number;
    collectedThisMonth: number;
    lapsedCount: number;
    overdueCount: number;
  };
  rows: RegisterRow[];
}

interface HistoryItem {
  payment_id: string;
  months_covered: number;
  period_start: string;
  period_end: string;
  reference_no: string | null;
  proof_url: string | null;
  notes: string | null;
  created_at: string;
  payments:
    | {
        amount_paise: number | null;
        paid_at: string | null;
        method: string | null;
        cycle_number: number | null;
      }
    | {
        amount_paise: number | null;
        paid_at: string | null;
        method: string | null;
        cycle_number: number | null;
      }[];
}

const CHIP: Record<DueState, { label: string; tone: Tone }> = {
  paid: { label: "Paid", tone: "good" },
  due_soon: { label: "Due soon", tone: "warn" },
  overdue_grace: { label: "Overdue (grace)", tone: "bad" },
  lapsed: { label: "Lapsed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  not_offline: { label: "—", tone: "neutral" },
};

const FILTERS: { key: "all" | DueState; label: string }[] = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "due_soon", label: "Due soon" },
  { key: "overdue_grace", label: "Overdue" },
  { key: "lapsed", label: "Lapsed" },
  { key: "cancelled", label: "Cancelled" },
];

const METHOD_LABEL: Record<string, string> = {
  upi_qr: "UPI QR",
  cash: "Cash",
  bank_transfer: "Bank",
};

function currentMonth(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 7);
}

function QrCollectionsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<RegisterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | DueState>("all");
  const [search, setSearch] = useState("");

  const [adding, setAdding] = useState(false);
  const [recordTarget, setRecordTarget] = useState<RecordPaymentTarget | null>(null);
  const [voidTarget, setVoidTarget] = useState<{ paymentId: string; label: string } | null>(null);
  const [stopTarget, setStopTarget] = useState<{ subscriptionId: string; label: string } | null>(
    null,
  );
  const [historyFor, setHistoryFor] = useState<RegisterRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await callAdminApi<RegisterResponse>("/api/admin/offline/register", { month }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Register load nahi hua");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => {
      if (filter !== "all" && r.dueState !== filter) return false;
      if (!q) return true;
      const digits = q.replace(/\D/g, "");
      return (
        (r.name ?? "").toLowerCase().includes(q) ||
        (digits !== "" && (r.phone ?? "").replace(/\D/g, "").includes(digits))
      );
    });
  }, [data, filter, search]);

  const t = data?.totals;
  const pct =
    t && t.expectedThisMonth > 0
      ? Math.round((t.collectedThisMonth / t.expectedThisMonth) * 100)
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="QR Collections"
        description="Offline (QR / cash / bank) subscribers — monthly payments, due dates aur lapse."
        actions={
          <>
            <Input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="h-9 w-full sm:w-40 text-sm"
              aria-label="Month"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              className="h-9 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setAdding(true)}
              className="h-9 gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
            >
              <Plus className="w-3.5 h-3.5" /> Add offline subscriber
            </Button>
          </>
        }
      />

      {error && <Notice tone="bad">{error}</Notice>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard
          label="Expected this month"
          value={t ? fmtINR(t.expectedThisMonth) : "—"}
          loading={loading && !t}
        />
        <StatCard
          label="Collected this month"
          value={t ? fmtINR(t.collectedThisMonth) : "—"}
          loading={loading && !t}
        />
        <StatCard
          label="Collection %"
          value={pct === null ? "—" : `${pct}%`}
          loading={loading && !t}
        />
        <StatCard
          label="Overdue (grace)"
          value={t ? String(t.overdueCount) : "—"}
          loading={loading && !t}
          status={t && t.overdueCount > 0 ? { tone: "bad", text: "Follow up" } : undefined}
        />
        <StatCard
          label="Lapsed"
          value={t ? String(t.lapsedCount) : "—"}
          loading={loading && !t}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <Panel flush title="Subscribers" description="Naam par tap karein — payment history khulegi.">
        <div className="flex flex-col md:flex-row md:items-center gap-3 px-4 sm:px-5 py-3 border-b border-stone-100">
          <SegmentedTabs
            value={filter}
            onChange={setFilter}
            items={FILTERS.map((f) => ({ value: f.key, label: f.label }))}
            className="min-w-0"
          />
          <div className="relative w-full md:ml-auto md:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or phone…"
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>

        <div className="divide-y divide-stone-100">
          {loading &&
            [...Array(4)].map((_, i) => (
              <div key={i} className="p-4 sm:px-5">
                <Skeleton className="h-16 w-full bg-stone-100 rounded-lg" />
              </div>
            ))}

          {!loading && rows.length === 0 && (
            <EmptyState
              icon={Wallet}
              title={
                data?.rows.length
                  ? "Is filter mein koi subscriber nahi."
                  : 'Abhi koi offline subscriber nahi hai — "Add offline subscriber" se shuru karein.'
              }
            />
          )}

          {!loading &&
            rows.map((r) => {
              const chip = CHIP[r.dueState];
              const live = r.status === "active" || r.status === "halted";
              const label = r.name || r.phone || r.subscriptionId.slice(0, 8);
              const waLink =
                r.phone && r.nextBillingDate && live
                  ? buildOwnerReminderLink({
                      name: r.name ?? "",
                      phone: r.phone,
                      dueDate: r.nextBillingDate,
                      amountPaise: r.expectedPaise,
                      vpa: data?.upiVpa,
                    })
                  : null;
              return (
                <div
                  key={r.subscriptionId}
                  className="px-4 sm:px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-3"
                >
                  <button
                    type="button"
                    onClick={() => setHistoryFor(r)}
                    className="text-left flex-1 min-w-0 group"
                    aria-label={`Payment history of ${label}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-stone-900 group-hover:underline break-all">
                        {label}
                      </span>
                      <StatusPill tone={chip.tone}>{chip.label}</StatusPill>
                    </div>
                    <div className="text-xs text-stone-500 mt-1">
                      {r.phone ?? "—"} · {r.planName ?? "—"} · expected {fmtINR(r.expectedPaise)}/mo
                    </div>
                  </button>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] lg:w-[26rem]">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-stone-500">Next due</div>
                      <div className="text-stone-800 tabular-nums">
                        {fmtDate(r.nextBillingDate)}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-stone-500">Last paid</div>
                      {r.lastPayment ? (
                        <div className="text-stone-800 tabular-nums">
                          {fmtDate(r.lastPayment.paidAt)} ·{" "}
                          {r.lastPayment.amountPaise != null
                            ? fmtINR(r.lastPayment.amountPaise)
                            : "—"}
                          <div className="text-xs text-stone-500 break-all">
                            {METHOD_LABEL[r.lastPayment.method ?? ""] ?? r.lastPayment.method}
                            {r.lastPayment.referenceNo ? ` · ${r.lastPayment.referenceNo}` : ""}
                          </div>
                        </div>
                      ) : (
                        <div className="text-stone-400">—</div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 lg:justify-end lg:max-w-[18rem]">
                    {live && (
                      <Button
                        size="sm"
                        className="h-9 sm:h-8 text-xs gap-1 bg-orange-600 hover:bg-orange-700 text-white"
                        onClick={() =>
                          setRecordTarget({
                            subscriptionId: r.subscriptionId,
                            name: r.name,
                            status: r.status,
                            nextBillingDate: r.nextBillingDate,
                            anchorDay: r.anchorDay,
                            planPricePaise: r.planPricePaise,
                            planBillingPeriod: r.planBillingPeriod,
                          })
                        }
                      >
                        <Wallet className="w-3.5 h-3.5" /> Record payment
                      </Button>
                    )}
                    {live && r.lastPayment && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 sm:h-8 text-xs gap-1"
                        onClick={() =>
                          setVoidTarget({ paymentId: r.lastPayment!.paymentId, label })
                        }
                      >
                        <Undo2 className="w-3.5 h-3.5" /> Void last
                      </Button>
                    )}
                    {waLink && (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-9 sm:h-8 text-xs gap-1"
                      >
                        <a href={waLink} target="_blank" rel="noreferrer">
                          <MessageCircle className="w-3.5 h-3.5" /> Remind
                        </a>
                      </Button>
                    )}
                    {live && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 sm:h-8 text-xs gap-1 text-rose-700 border-rose-200 hover:bg-rose-50 hover:text-rose-800"
                        onClick={() => setStopTarget({ subscriptionId: r.subscriptionId, label })}
                      >
                        <XCircle className="w-3.5 h-3.5" /> Stop
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </Panel>

      <AddOfflineSubscriberDialog
        open={adding}
        onClose={() => setAdding(false)}
        onDone={() => void load()}
      />
      <RecordPaymentDialog
        target={recordTarget}
        onClose={() => setRecordTarget(null)}
        onDone={() => void load()}
      />
      <VoidPaymentDialog
        paymentId={voidTarget?.paymentId ?? null}
        label={voidTarget?.label ?? ""}
        onClose={() => setVoidTarget(null)}
        onDone={() => void load()}
      />
      <StopSubscriptionDialog
        subscriptionId={stopTarget?.subscriptionId ?? null}
        label={stopTarget?.label ?? ""}
        onClose={() => setStopTarget(null)}
        onDone={() => void load()}
      />
      <HistorySheet
        row={historyFor}
        onClose={() => setHistoryFor(null)}
        onChanged={() => void load()}
      />
    </div>
  );
}

function HistorySheet({
  row,
  onClose,
  onChanged,
}: {
  row: RegisterRow | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!row) return;
    setItems(null);
    setErr(null);
    callAdminApi<{ payments: HistoryItem[] }>("/api/admin/offline/history", {
      subscriptionId: row.subscriptionId,
    })
      .then((r) => setItems(r.payments))
      .catch((e) => setErr(e instanceof Error ? e.message : "History load nahi hui"));
  }, [row, tick]);

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-stone-900">
            <History className="w-4 h-4 text-stone-400" /> Payment history
          </SheetTitle>
          <SheetDescription className="break-all">{row?.name ?? row?.phone ?? ""}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2.5 px-4 pb-6">
          {!items && !err && <Loader2 className="w-5 h-5 animate-spin text-stone-400" />}
          {err && <Notice tone="bad">{err}</Notice>}
          {items?.length === 0 && <p className="text-sm text-stone-400">Koi payment nahi.</p>}
          {items?.map((h) => {
            const p = Array.isArray(h.payments) ? h.payments[0] : h.payments;
            if (editing === h.payment_id) {
              return (
                <EditPaymentForm
                  key={h.payment_id}
                  item={h}
                  method={p?.method ?? "upi_qr"}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    setTick((t) => t + 1);
                    onChanged();
                  }}
                />
              );
            }
            return (
              <div key={h.payment_id} className="admin-card p-3 text-xs space-y-1">
                <div className="flex justify-between gap-2 text-sm font-semibold text-stone-900 tabular-nums">
                  <span>{p?.amount_paise != null ? fmtINR(p.amount_paise) : "—"}</span>
                  <span>{fmtDate(p?.paid_at ?? null)}</span>
                </div>
                <div className="text-stone-600">
                  {METHOD_LABEL[p?.method ?? ""] ?? p?.method} · {h.months_covered} mo ·{" "}
                  {fmtDate(h.period_start)} → {fmtDate(h.period_end)}
                </div>
                {h.reference_no && (
                  <div className="font-mono text-[11px] text-stone-500 break-all">
                    UTR {h.reference_no}
                  </div>
                )}
                {h.notes && <div className="text-stone-500 break-words">{h.notes}</div>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                  {h.proof_url && (
                    <a
                      href={h.proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-orange-700 hover:underline"
                    >
                      Screenshot
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing(h.payment_id)}
                    className="font-medium text-orange-700 hover:underline"
                  >
                    Edit method / UTR / note
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Owner corrects HOW a payment was made (e.g. an imported one whose method was
// unknown). Amount / dates stay locked — those move due dates (use Void).
function EditPaymentForm({
  item,
  method: initialMethod,
  onCancel,
  onSaved,
}: {
  item: HistoryItem;
  method: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [method, setMethod] = useState(initialMethod);
  const [utr, setUtr] = useState(item.reference_no ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await callAdminApi("/api/admin/offline/update-payment", {
        paymentId: item.payment_id,
        method,
        referenceNo: utr.trim() || undefined,
        proofUrl: item.proof_url || undefined,
        notes: notes.trim() || undefined,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update nahi hua");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-stone-300 bg-stone-50 p-3 text-xs space-y-2.5">
      <label className="block space-y-1">
        <span className="font-medium text-stone-600">Method</span>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="w-full h-9 border border-stone-200 rounded-md px-2 bg-white text-sm"
        >
          {Object.entries(METHOD_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="font-medium text-stone-600">UTR / reference</span>
        <Input
          value={utr}
          maxLength={64}
          onChange={(e) => setUtr(e.target.value)}
          className="h-9 text-sm bg-white"
        />
      </label>
      <label className="block space-y-1">
        <span className="font-medium text-stone-600">Note</span>
        <Input
          value={notes}
          maxLength={1000}
          onChange={(e) => setNotes(e.target.value)}
          className="h-9 text-sm bg-white"
        />
      </label>
      {err && <p className="text-rose-700">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="h-9 sm:h-8 text-xs bg-orange-600 hover:bg-orange-700 text-white"
          disabled={busy}
          onClick={save}
        >
          {busy && <Loader2 className="w-3 h-3 animate-spin mr-1" />}Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-9 sm:h-8 text-xs"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
