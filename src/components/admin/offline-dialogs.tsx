import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { callAdminApi } from "@/lib/admin-api";
import { CloudinaryImageButton } from "@/components/admin/CloudinaryImageButton";
import {
  OFFLINE_METHODS,
  computeCoverage,
  defaultAmountPaise,
  fmtDueDate,
  todayIST,
  type OfflineMethod,
} from "@/lib/offline-subscriptions-logic";

// Shared OWNER-ONLY dialogs for offline (QR / cash / bank) subscribers —
// used by /admin/qr-collections and by the Subscribers detail panel. All
// date/coverage maths comes from offline-subscriptions-logic (the same
// functions the server runs), so what the owner previews is what is saved.

const selectCls =
  "w-full text-sm border border-amber-200 rounded-md px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white text-slate-700";

const METHOD_LABEL: Record<OfflineMethod, string> = {
  upi_qr: "UPI QR",
  cash: "Cash",
  bank_transfer: "Bank transfer",
};

const MONTH_CHIPS = [1, 2, 3, 6, 12];

const rupeesToPaise = (v: string): number => Math.round(parseFloat(v) * 100);
const paiseToRupees = (p: number): string =>
  p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2);

// ─── Payment fields (shared by Record + Add) ─────────────────

interface PaymentFormState {
  amount: string;
  paidOn: string;
  months: number;
  method: OfflineMethod;
  referenceNo: string;
  proofUrl: string;
  notes: string;
}

function usePaymentForm(planPricePaise: number | null, planPeriod: string | null) {
  const [form, setForm] = useState<PaymentFormState>({
    amount: "",
    paidOn: todayIST(new Date()),
    months: 1,
    method: "upi_qr",
    referenceNo: "",
    proofUrl: "",
    notes: "",
  });
  // The amount follows plan × months until the owner types their own.
  const [amountTouched, setAmountTouched] = useState(false);

  useEffect(() => {
    if (amountTouched || planPricePaise == null) return;
    setForm((f) => ({
      ...f,
      amount: paiseToRupees(defaultAmountPaise(planPricePaise, planPeriod, f.months)),
    }));
  }, [planPricePaise, planPeriod, form.months, amountTouched]);

  const set = <K extends keyof PaymentFormState>(k: K, v: PaymentFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return {
    form,
    set,
    setAmount: (v: string) => {
      setAmountTouched(true);
      set("amount", v);
    },
    payload: () => ({
      amountPaise: rupeesToPaise(form.amount),
      paidOn: form.paidOn,
      monthsCovered: form.months,
      method: form.method,
      referenceNo: form.referenceNo.trim() || undefined,
      proofUrl: form.proofUrl || undefined,
      notes: form.notes.trim() || undefined,
    }),
  };
}

function PaymentFields({
  state,
  folderKey,
}: {
  state: ReturnType<typeof usePaymentForm>;
  folderKey: string;
}) {
  const { form, set, setAmount } = state;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="qr-amount">Amount received (₹)</Label>
          <Input
            id="qr-amount"
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="199"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="qr-paid-on">Paid on</Label>
          <Input
            id="qr-paid-on"
            type="date"
            max={todayIST(new Date())}
            value={form.paidOn}
            onChange={(e) => set("paidOn", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Months covered</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {MONTH_CHIPS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => set("months", m)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                form.months === m
                  ? "bg-amber-700 text-white border-amber-700"
                  : "bg-white text-slate-700 border-amber-200"
              }`}
            >
              {m}
            </button>
          ))}
          <Input
            type="number"
            min={1}
            max={24}
            value={form.months}
            onChange={(e) => set("months", Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
            className="w-20 h-8 text-xs"
            aria-label="Months covered"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="qr-method">Method</Label>
          <select
            id="qr-method"
            className={selectCls}
            value={form.method}
            onChange={(e) => set("method", e.target.value as OfflineMethod)}
          >
            {OFFLINE_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="qr-utr">UTR / reference (optional)</Label>
          <Input
            id="qr-utr"
            value={form.referenceNo}
            onChange={(e) => set("referenceNo", e.target.value)}
            placeholder="UPI reference number"
            maxLength={64}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Screenshot (optional)</Label>
        <div className="flex items-center gap-3">
          <CloudinaryImageButton
            folder={`punyata-finance/qr-proofs/${folderKey}`}
            label={form.proofUrl ? "Replace screenshot" : "Upload screenshot"}
            onUploaded={(url) => set("proofUrl", url)}
          />
          {form.proofUrl && (
            <a
              href={form.proofUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-amber-800 underline"
            >
              View uploaded
            </a>
          )}
        </div>
        <p className="text-[10px] text-slate-500">
          Cloudinary links are unguessable but public — don&apos;t upload anything showing a full
          bank account number.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="qr-notes">Note (internal)</Label>
        <Textarea
          id="qr-notes"
          rows={2}
          value={form.notes}
          maxLength={1000}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
    </div>
  );
}

// ─── Record payment ──────────────────────────────────────────

export interface RecordPaymentTarget {
  subscriptionId: string;
  name: string | null;
  status: string; // 'active' | 'halted'
  nextBillingDate: string | null;
  anchorDay: number | null;
  planPricePaise: number | null;
  planBillingPeriod: string | null;
}

export function RecordPaymentDialog({
  target,
  onClose,
  onDone,
}: {
  target: RecordPaymentTarget | null;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {target && (
          <RecordPaymentBody
            key={target.subscriptionId}
            target={target}
            onClose={onClose}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentBody({
  target,
  onClose,
  onDone,
}: {
  target: RecordPaymentTarget;
  onClose: () => void;
  onDone: () => void;
}) {
  const pay = usePaymentForm(target.planPricePaise, target.planBillingPeriod);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const preview = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pay.form.paidOn)) return null;
    return computeCoverage({
      status: target.status,
      nextBillingDate: target.nextBillingDate,
      anchorDay: target.anchorDay,
      paidOn: pay.form.paidOn,
      monthsCovered: pay.form.months,
    });
  }, [pay.form.paidOn, pay.form.months, target]);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await callAdminApi("/api/admin/offline/record-payment", {
        subscriptionId: target.subscriptionId,
        expectedStatus: target.status,
        expectedNextBillingDate: target.nextBillingDate,
        ...pay.payload(),
      });
      onDone();
      onClose();
    } catch (e) {
      const status = (e as { status?: number }).status;
      setStale(status === 409);
      setErr(e instanceof Error ? e.message : "Payment record nahi hui");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Record QR payment</DialogTitle>
        <DialogDescription>
          {target.name || "Subscriber"} ·{" "}
          {target.status === "halted" ? "Lapsed (halted)" : "Active"}
          {target.nextBillingDate ? ` · due ${fmtDueDate(target.nextBillingDate)}` : ""}
        </DialogDescription>
      </DialogHeader>

      <PaymentFields state={pay} folderKey={target.subscriptionId.slice(0, 8)} />

      {preview && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          Cover: <b>{fmtDueDate(preview.periodStart)}</b> → <b>{fmtDueDate(preview.periodEnd)}</b>
          {" · "}Status: {target.status === "halted" ? "Halted" : "Active"} → <b>Active</b>
          {preview.reactivate ? " (service resumes)" : ""}
        </div>
      )}

      {err && (
        <p className="text-xs text-red-700">
          {err}
          {stale && (
            <>
              {" "}
              <button
                type="button"
                className="underline font-semibold"
                onClick={() => {
                  onDone();
                  onClose();
                }}
              >
                Refresh
              </button>
            </>
          )}
        </p>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={busy || !pay.form.amount}
          className="bg-amber-700 hover:bg-amber-800 text-white"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
          Save payment
        </Button>
      </DialogFooter>
    </>
  );
}

// ─── Reason dialogs (Void / Stop) ────────────────────────────

function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setErr(null);
    }
  }, [open]);

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request fail ho gayi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="reason-text">Reason (required, 3–300 characters)</Label>
          <Textarea
            id="reason-text"
            rows={3}
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {err && <p className="text-xs text-red-700">{err}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button
            onClick={go}
            disabled={busy || reason.trim().length < 3}
            className={
              destructive
                ? "bg-red-700 hover:bg-red-800 text-white"
                : "bg-amber-700 hover:bg-amber-800 text-white"
            }
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VoidPaymentDialog({
  paymentId,
  label,
  onClose,
  onDone,
}: {
  paymentId: string | null;
  label: string;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <ReasonDialog
      open={!!paymentId}
      title="Void last payment"
      description={`${label} — sirf galat entry ke liye. Due date pichhli state par laut jayegi (pehli payment void karne par subscription cancel ho jati hai).`}
      confirmLabel="Void payment"
      destructive
      onClose={onClose}
      onConfirm={async (reason) => {
        await callAdminApi("/api/admin/offline/void-payment", { paymentId, reason });
        onDone();
      }}
    />
  );
}

export function StopSubscriptionDialog({
  subscriptionId,
  label,
  onClose,
  onDone,
}: {
  subscriptionId: string | null;
  label: string;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <ReasonDialog
      open={!!subscriptionId}
      title="Stop subscription"
      description={`${label} — seva band ho jayegi aur yeh subscriber Sankalp lists se hat jayega. Dobara shuru karne ke liye naya subscriber add karna padega.`}
      confirmLabel="Stop subscription"
      destructive
      onClose={onClose}
      onConfirm={async (reason) => {
        await callAdminApi("/api/admin/offline/cancel", { subscriptionId, reason });
        onDone();
      }}
    />
  );
}

// ─── Add offline subscriber ──────────────────────────────────

interface PlanOption {
  id: string;
  name: string;
  price_paise: number;
  billing_period: string;
}

interface FamilyDraft {
  fullName: string;
  gotra: string;
  relation: string;
  dob: string;
}

const emptyMember = (): FamilyDraft => ({ fullName: "", gotra: "", relation: "", dob: "" });

export function AddOfflineSubscriberDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        {open && <AddBody onClose={onClose} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function AddBody({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [planId, setPlanId] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [family, setFamily] = useState<FamilyDraft[]>([emptyMember()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const plan = plans.find((p) => p.id === planId) ?? null;
  const pay = usePaymentForm(plan?.price_paise ?? null, plan?.billing_period ?? null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("plans")
        .select("id,name,price_paise,billing_period")
        .eq("is_active", true)
        .order("sort_order");
      setPlans((data as PlanOption[]) ?? []);
    })();
  }, []);

  // Slot 1 is the subscriber themself by default — prefill from the name field.
  const members = family.map((m, i) => (i === 0 && !m.fullName ? { ...m, fullName } : m));

  const updateMember = (i: number, patch: Partial<FamilyDraft>) =>
    setFamily((f) => f.map((m, j) => (j === i ? { ...members[i], ...patch } : m)));

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await callAdminApi("/api/admin/offline/create", {
        fullName: fullName.trim(),
        phone: phone.trim(),
        planId,
        family: members.map((m, i) => ({
          slot: i + 1,
          fullName: m.fullName.trim(),
          gotra: m.gotra.trim() || undefined,
          relation: m.relation.trim() || undefined,
          dob: m.dob || undefined,
        })),
        payment: pay.payload(),
      });
      onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Subscriber add nahi hua");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    fullName.trim().length >= 2 && phone.trim() && planId && pay.form.amount && !busy;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add offline subscriber</DialogTitle>
        <DialogDescription>
          Full subscriber jo QR / cash / bank se monthly pay karta hai. Pehli payment ke bina
          subscription shuru nahi hoti.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="off-name">Name</Label>
            <Input id="off-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="off-phone">WhatsApp phone</Label>
            <Input
              id="off-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="off-plan">Plan</Label>
          <select
            id="off-plan"
            className={selectCls}
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
          >
            <option value="">Plan chunein…</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — ₹{p.price_paise / 100}/{p.billing_period === "yearly" ? "year" : "month"}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Family members (sankalp, up to 4)</Label>
            {family.length < 4 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setFamily((f) => [...f, emptyMember()])}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add
              </Button>
            )}
          </div>
          {members.map((m, i) => (
            <div
              key={i}
              className="rounded-lg border border-amber-100 p-2.5 space-y-2 bg-amber-50/30"
            >
              <div className="flex items-center justify-between text-[11px] font-semibold text-amber-900/70">
                <span>
                  Slot {i + 1}
                  {i === 0 ? " (primary)" : ""}
                </span>
                {i > 0 && (
                  <button
                    type="button"
                    aria-label={`Remove member ${i + 1}`}
                    onClick={() => setFamily((f) => f.filter((_, j) => j !== i))}
                    className="text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Naam"
                  value={m.fullName}
                  onChange={(e) => updateMember(i, { fullName: e.target.value })}
                />
                <Input
                  placeholder="Gotra"
                  value={m.gotra}
                  onChange={(e) => updateMember(i, { gotra: e.target.value })}
                />
                <Input
                  placeholder="Relation (Swayam, Pita…)"
                  value={m.relation}
                  onChange={(e) => updateMember(i, { relation: e.target.value })}
                />
                <Input
                  type="date"
                  aria-label="Date of birth"
                  value={m.dob}
                  onChange={(e) => updateMember(i, { dob: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-amber-100 pt-3">
          <div className="text-sm font-semibold text-slate-800 mb-2">First payment</div>
          <PaymentFields state={pay} folderKey="new" />
        </div>
      </div>

      {err && <p className="text-xs text-red-700">{err}</p>}

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={!canSubmit}
          className="bg-amber-700 hover:bg-amber-800 text-white"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
          Add subscriber
        </Button>
      </DialogFooter>
    </>
  );
}
