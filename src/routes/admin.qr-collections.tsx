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

const CHIP: Record<DueState, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  due_soon: { label: "Due soon", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  overdue_grace: { label: "Overdue (grace)", cls: "bg-red-50 text-red-800 border-red-200" },
  lapsed: { label: "Lapsed", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  cancelled: { label: "Cancelled", cls: "bg-slate-50 text-slate-400 border-slate-200" },
  not_offline: { label: "—", cls: "bg-slate-50 text-slate-400 border-slate-200" },
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

function KpiTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-amber-900/10 bg-white p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/60">
        {label}
      </div>
      <div className={`text-xl font-bold mt-1 ${tone ?? "text-slate-900"}`}>{value}</div>
    </div>
  );
}

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
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-5 rounded-2xl border border-amber-900/10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">QR Collections</h1>
          <p className="text-xs text-amber-900/60 mt-0.5">
            Offline (QR / cash / bank) subscribers — monthly payments, due dates aur lapse. Owner
            only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="h-9 w-40 text-xs"
            aria-label="Month"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setAdding(true)}
            className="gap-1.5 text-xs bg-amber-700 hover:bg-amber-800 text-white"
          >
            <Plus className="w-3.5 h-3.5" /> Add offline subscriber
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiTile label="Expected this month" value={t ? fmtINR(t.expectedThisMonth) : "—"} />
        <KpiTile
          label="Collected this month"
          value={t ? fmtINR(t.collectedThisMonth) : "—"}
          tone="text-emerald-700"
        />
        <KpiTile label="Collection %" value={pct === null ? "—" : `${pct}%`} />
        <KpiTile
          label="Overdue (grace)"
          value={t ? String(t.overdueCount) : "—"}
          tone="text-red-700"
        />
        <KpiTile label="Lapsed" value={t ? String(t.lapsedCount) : "—"} tone="text-slate-600" />
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                filter === f.key
                  ? "bg-amber-700 text-white border-amber-700"
                  : "bg-white text-slate-700 border-amber-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative md:ml-auto md:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or phone…"
            className="pl-8 h-9 text-xs"
          />
        </div>
      </div>

      <div className="space-y-2.5">
        {loading &&
          [...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full bg-amber-50 rounded-xl" />
          ))}

        {!loading && rows.length === 0 && (
          <div className="bg-white border border-amber-900/10 rounded-xl p-10 text-center text-sm text-slate-400">
            {data?.rows.length
              ? "Is filter mein koi subscriber nahi."
              : 'Abhi koi offline subscriber nahi hai — "Add offline subscriber" se shuru karein.'}
          </div>
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
                className="bg-white border border-amber-900/10 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center gap-3"
              >
                <button
                  type="button"
                  onClick={() => setHistoryFor(r)}
                  className="text-left flex-1 min-w-0 group"
                  aria-label={`Payment history of ${label}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 group-hover:underline">
                      {label}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${chip.cls}`}
                    >
                      {chip.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {r.phone ?? "—"} · {r.planName ?? "—"} · expected {fmtINR(r.expectedPaise)}/mo
                  </div>
                </button>

                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs lg:w-[26rem]">
                  <div>
                    <div className="text-[10px] uppercase text-slate-400 font-semibold">
                      Next due
                    </div>
                    <div className="font-medium text-slate-800">{fmtDate(r.nextBillingDate)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-400 font-semibold">
                      Last paid
                    </div>
                    {r.lastPayment ? (
                      <div className="font-medium text-slate-800">
                        {fmtDate(r.lastPayment.paidAt)} ·{" "}
                        {r.lastPayment.amountPaise != null
                          ? fmtINR(r.lastPayment.amountPaise)
                          : "—"}
                        <div className="text-[10px] text-slate-500 font-normal">
                          {METHOD_LABEL[r.lastPayment.method ?? ""] ?? r.lastPayment.method}
                          {r.lastPayment.referenceNo ? ` · ${r.lastPayment.referenceNo}` : ""}
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-400">—</div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 lg:justify-end">
                  {live && (
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1 bg-amber-700 hover:bg-amber-800 text-white"
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
                      className="h-8 text-xs gap-1"
                      onClick={() => setVoidTarget({ paymentId: r.lastPayment!.paymentId, label })}
                    >
                      <Undo2 className="w-3.5 h-3.5" /> Void last
                    </Button>
                  )}
                  {waLink && (
                    <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1">
                      <a href={waLink} target="_blank" rel="noreferrer">
                        <MessageCircle className="w-3.5 h-3.5" /> Remind
                      </a>
                    </Button>
                  )}
                  {live && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1 text-red-700 border-red-200"
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
          <SheetTitle className="flex items-center gap-2">
            <History className="w-4 h-4" /> Payment history
          </SheetTitle>
          <SheetDescription>{row?.name ?? row?.phone ?? ""}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2.5 px-4 pb-6">
          {!items && !err && <Loader2 className="w-5 h-5 animate-spin text-amber-700" />}
          {err && <p className="text-xs text-red-700">{err}</p>}
          {items?.length === 0 && <p className="text-sm text-slate-400">Koi payment nahi.</p>}
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
              <div
                key={h.payment_id}
                className="rounded-lg border border-amber-100 p-3 text-xs space-y-0.5"
              >
                <div className="flex justify-between font-semibold text-slate-900">
                  <span>{p?.amount_paise != null ? fmtINR(p.amount_paise) : "—"}</span>
                  <span>{fmtDate(p?.paid_at ?? null)}</span>
                </div>
                <div className="text-slate-600">
                  {METHOD_LABEL[p?.method ?? ""] ?? p?.method} · {h.months_covered} mo ·{" "}
                  {fmtDate(h.period_start)} → {fmtDate(h.period_end)}
                </div>
                {h.reference_no && (
                  <div className="font-mono text-[11px] text-slate-500">UTR {h.reference_no}</div>
                )}
                {h.notes && <div className="text-slate-500">{h.notes}</div>}
                {h.proof_url && (
                  <a
                    href={h.proof_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-800 underline"
                  >
                    Screenshot
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setEditing(h.payment_id)}
                  className="mt-1 text-amber-800 underline"
                >
                  Edit method / UTR / note
                </button>
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
    <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-3 text-xs space-y-2">
      <label className="block space-y-1">
        <span className="font-semibold text-slate-700">Method</span>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="w-full border border-amber-200 rounded-md px-2 py-1.5 bg-white"
        >
          {Object.entries(METHOD_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="font-semibold text-slate-700">UTR / reference</span>
        <Input
          value={utr}
          maxLength={64}
          onChange={(e) => setUtr(e.target.value)}
          className="h-8 text-xs"
        />
      </label>
      <label className="block space-y-1">
        <span className="font-semibold text-slate-700">Note</span>
        <Input
          value={notes}
          maxLength={1000}
          onChange={(e) => setNotes(e.target.value)}
          className="h-8 text-xs"
        />
      </label>
      {err && <p className="text-red-700">{err}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-7 text-xs bg-amber-700 hover:bg-amber-800 text-white"
          disabled={busy}
          onClick={save}
        >
          {busy && <Loader2 className="w-3 h-3 animate-spin mr-1" />}Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
