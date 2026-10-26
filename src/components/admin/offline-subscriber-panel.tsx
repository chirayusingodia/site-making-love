import { useEffect, useState } from "react";
import { QrCode, Undo2, Wallet, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callAdminApi } from "@/lib/admin-api";
import { dueState, fmtDueDate, todayIST, type DueState } from "@/lib/offline-subscriptions-logic";
import {
  RecordPaymentDialog,
  StopSubscriptionDialog,
  VoidPaymentDialog,
  type RecordPaymentTarget,
} from "@/components/admin/offline-dialogs";

// The offline-subscriber block inside the Subscribers 360 modal.
//
//   ADMIN : status line only — "Paid via QR · Next due … · state". NO ₹
//           figures and NO money buttons (admin has zero financial
//           visibility; recording a payment shows an amount).
//   OWNER : the same line plus Record payment / Void last / Stop.

const STATE_LABEL: Record<DueState, string> = {
  paid: "Paid up",
  due_soon: "Due soon",
  overdue_grace: "Overdue (grace period)",
  lapsed: "Lapsed — service paused",
  cancelled: "Cancelled",
  not_offline: "—",
};

const STATE_CLS: Record<DueState, string> = {
  paid: "bg-emerald-50 text-emerald-800 border-emerald-200",
  due_soon: "bg-amber-50 text-amber-800 border-amber-200",
  overdue_grace: "bg-red-50 text-red-800 border-red-200",
  lapsed: "bg-slate-100 text-slate-600 border-slate-200",
  cancelled: "bg-slate-50 text-slate-400 border-slate-200",
  not_offline: "bg-slate-50 text-slate-400 border-slate-200",
};

export function OfflineSubscriberPanel({
  subscriptionId,
  name,
  status,
  nextBillingDate,
  planPricePaise,
  planBillingPeriod,
  isOwner,
  onChanged,
}: {
  subscriptionId: string;
  name: string | null;
  status: string;
  nextBillingDate: string | null;
  planPricePaise: number | null;
  planBillingPeriod: string | null;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const state = dueState({
    status,
    paymentMode: "offline_qr",
    nextBillingDate,
    today: todayIST(new Date()),
  });
  const live = status === "active" || status === "halted";

  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);
  const [record, setRecord] = useState<RecordPaymentTarget | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [stopping, setStopping] = useState(false);

  // Owner only: the id of the newest payment, for "Void last".
  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    callAdminApi<{ payments: { payment_id: string }[] }>("/api/admin/offline/history", {
      subscriptionId,
    })
      .then((r) => !cancelled && setLastPaymentId(r.payments[0]?.payment_id ?? null))
      .catch(() => !cancelled && setLastPaymentId(null));
    return () => {
      cancelled = true;
    };
  }, [isOwner, subscriptionId]);

  const label = name || "Subscriber";

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-violet-950">
        <QrCode className="w-4 h-4" />
        <span className="font-semibold">Paid via QR</span>
        <span>· Next due {nextBillingDate ? fmtDueDate(nextBillingDate) : "—"}</span>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATE_CLS[state]}`}
        >
          {STATE_LABEL[state]}
        </span>
      </div>

      {status === "halted" && (
        <p className="text-xs text-violet-900/80">
          QR subscription mein koi mandate nahi hota — Resume / payment link kaam nahi karte.
          Subscriber ka agla payment record hote hi seva dobara shuru ho jati hai.
        </p>
      )}

      {isOwner && live && (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            className="h-8 text-xs gap-1 bg-amber-700 hover:bg-amber-800 text-white"
            onClick={() =>
              setRecord({
                subscriptionId,
                name,
                status,
                nextBillingDate,
                anchorDay: null,
                planPricePaise,
                planBillingPeriod,
              })
            }
          >
            <Wallet className="w-3.5 h-3.5" /> Record payment
          </Button>
          {lastPaymentId && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1"
              onClick={() => setVoiding(true)}
            >
              <Undo2 className="w-3.5 h-3.5" /> Void last
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1 text-red-700 border-red-200"
            onClick={() => setStopping(true)}
          >
            <XCircle className="w-3.5 h-3.5" /> Stop subscription
          </Button>
        </div>
      )}

      {isOwner && (
        <>
          <RecordPaymentDialog target={record} onClose={() => setRecord(null)} onDone={onChanged} />
          <VoidPaymentDialog
            paymentId={voiding ? lastPaymentId : null}
            label={label}
            onClose={() => setVoiding(false)}
            onDone={onChanged}
          />
          <StopSubscriptionDialog
            subscriptionId={stopping ? subscriptionId : null}
            label={label}
            onClose={() => setStopping(false)}
            onDone={onChanged}
          />
        </>
      )}
    </div>
  );
}
