import { Fragment, useCallback, useEffect, useState } from "react";
import { callAdminApi } from "@/lib/admin-api";
import { AlertTriangle, ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Notice, Panel, StatCard, StatusPill, TableScroll, type Tone } from "./admin-ui";
import { PAYOUT_METHODS, type PayoutMethod } from "@/lib/telecaller-payroll-logic";
import type { PayrollData } from "@/lib/telecaller-payroll.server";

// Monthly telecaller salary: cards, sheet, pay flow and payment history.
// Server shapes are imported as TYPES only (the .server module never
// ships to the client).

const inr = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const METHOD_LABEL: Record<PayoutMethod, string> = {
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  other: "Other",
};

const STATUS_UI: Record<string, { tone: Tone; label: string }> = {
  paid: { tone: "good", label: "Paid" },
  pending: { tone: "warn", label: "Pending" },
  partial: { tone: "info", label: "Partly paid" },
  held_only: { tone: "neutral", label: "Held" },
  no_earnings: { tone: "neutral", label: "No earnings" },
};

export function currentPeriodIST(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 7);
}

function shiftPeriod(p: string, n: number): string {
  const [y, m] = p.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

function periodLabel(p: string): string {
  const [y, m] = p.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function TelecallerPayroll() {
  const [period, setPeriod] = useState(currentPeriodIST());
  const [data, setData] = useState<PayrollData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [paying, setPaying] = useState<PayrollData["rows"][number] | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await callAdminApi<PayrollData>("/api/admin/commissions/payroll", { period }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payroll load nahi hua");
    }
  }, [period]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  async function exportXlsx() {
    setExporting(true);
    try {
      const r = await callAdminApi<{ filename: string; base64: string }>(
        "/api/admin/commissions/payroll-export",
        { period },
      );
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export fail ho gaya");
    } finally {
      setExporting(false);
    }
  }

  const t = data?.totals;
  const visibleRows = data?.rows.filter((r) => r.status !== "no_earnings") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setPeriod(shiftPeriod(period, -1))}>
          ← Pichla
        </Button>
        <div className="px-3 text-sm font-semibold text-stone-800 min-w-36 text-center">
          {periodLabel(period)}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={period >= currentPeriodIST()}
          onClick={() => setPeriod(shiftPeriod(period, 1))}
        >
          Agla →
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-1.5"
          disabled={exporting || !data}
          onClick={exportXlsx}
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Monthly sheet (.xlsx)
        </Button>
      </div>

      {error && (
        <Notice tone="bad" icon={AlertTriangle}>
          <span className="break-words">{error}</span>
        </Notice>
      )}
      {data?.periodLocked && (
        <Notice tone="warn" icon={AlertTriangle}>
          Yeh month locked hai — naya payment record karne ke liye pehle Engine tab mein unlock
          kijiye.
        </Notice>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Is mahine ki salary (total)" value={t ? inr(t.earnedPaise) : "—"} loading={!t}
          hint={t ? `${t.newConversions} naye conversions · ${t.telecallers} telecallers` : undefined} />
        <StatCard label="Dena baaki hai" value={t ? inr(t.payablePaise) : "—"} loading={!t}
          status={t && t.payablePaise > 0 ? { tone: "warn", text: "pending" } : undefined} />
        <StatCard label="Chuka diya (paid)" value={t ? inr(t.paidPaise) : "—"} loading={!t}
          status={t && t.paidPaise > 0 ? { tone: "good", text: "cleared" } : undefined} />
        <StatCard label="Held (30-din window)" value={t ? inr(t.heldPaise) : "—"} loading={!t}
          hint="Refund window ke baad payable" />
      </div>

      <Panel
        title="Monthly salary sheet"
        description="₹80 pehli conversion par, uske baad har paid mahine ₹20 us subscriber ke. Row kholkar subscriber-wise detail dekhiye."
        flush
      >
        {!data ? (
          <div className="p-4 sm:p-5"><Skeleton className="h-24 w-full" /></div>
        ) : visibleRows.length === 0 ? (
          <EmptyState title="Is mahine kisi telecaller ki earning nahi bani." />
        ) : (
          <TableScroll>
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-left text-xs text-stone-500 border-b border-stone-100">
                  <th className="font-medium px-4 sm:px-5 py-2.5">Telecaller</th>
                  <th className="font-medium px-3 py-2.5 text-right">New (₹80)</th>
                  <th className="font-medium px-3 py-2.5 text-right">Trail (₹20)</th>
                  <th className="font-medium px-3 py-2.5 text-right">Salary</th>
                  <th className="font-medium px-3 py-2.5 text-right">Paid</th>
                  <th className="font-medium px-3 py-2.5 text-right">Baaki</th>
                  <th className="font-medium px-3 py-2.5 text-right">Status</th>
                  <th className="font-medium px-4 sm:px-5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visibleRows.map((r) => {
                  const ui = STATUS_UI[r.status] ?? STATUS_UI.pending;
                  const expanded = open === r.profileId;
                  return (
                    <Fragment key={r.profileId}>
                      <tr>
                        <td className="px-4 sm:px-5 py-2.5">
                          <button
                            type="button"
                            className="flex items-center gap-1.5 text-left"
                            onClick={() => setOpen(expanded ? null : r.profileId)}
                          >
                            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            <span>
                              <span className="font-medium text-stone-900">{r.name}</span>
                              {r.phone && <span className="block text-xs text-stone-400">{r.phone}</span>}
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.newConversions}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.trailSubscribers}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{inr(r.earnedPaise - r.clawbackPaise)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{inr(r.paidPaise)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {inr(r.payablePaise)}
                          {r.heldPaise > 0 && (
                            <span className="block text-[11px] text-stone-400">+{inr(r.heldPaise)} held</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right"><StatusPill tone={ui.tone}>{ui.label}</StatusPill></td>
                        <td className="px-4 sm:px-5 py-2.5 text-right">
                          <Button
                            size="sm"
                            className="h-9 md:h-7 text-xs bg-orange-600 hover:bg-orange-700 text-white"
                            disabled={r.payablePaise <= 0 || data.periodLocked}
                            onClick={() => setPaying(r)}
                          >
                            Mark paid
                          </Button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-stone-50/60">
                          <td colSpan={8} className="px-4 sm:px-8 py-3">
                            <div className="grid gap-1.5">
                              {r.lines.map((l) => (
                                <div key={l.entryId} className="flex flex-wrap items-center gap-x-3 text-xs text-stone-700">
                                  <span className="font-medium min-w-40">{l.subscriberName}</span>
                                  <span className="text-stone-400 min-w-28">{l.subscriberPhone ?? "—"}</span>
                                  <span>{l.kind === "first_deal" ? "New conversion" : "Monthly trail"}</span>
                                  <span className="tabular-nums font-semibold">{inr(l.amountPaise)}</span>
                                  <StatusPill tone={l.status === "paid" ? "good" : l.status === "held" ? "neutral" : "warn"}>
                                    {l.status}
                                  </StatusPill>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>

      <Panel title="Payment history" description="Har payout ka record — kab, kitna, kaise, reference." flush>
        {!data ? (
          <div className="p-4 sm:p-5"><Skeleton className="h-16 w-full" /></div>
        ) : data.payouts.length === 0 ? (
          <EmptyState title="Abhi tak koi payment record nahi hua." />
        ) : (
          <TableScroll>
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-stone-500 border-b border-stone-100">
                  <th className="font-medium px-4 sm:px-5 py-2.5">Paid on</th>
                  <th className="font-medium px-3 py-2.5">Telecaller</th>
                  <th className="font-medium px-3 py-2.5">Month</th>
                  <th className="font-medium px-3 py-2.5 text-right">Amount</th>
                  <th className="font-medium px-3 py-2.5">Method</th>
                  <th className="font-medium px-4 sm:px-5 py-2.5">Reference / note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 sm:px-5 py-2.5 text-xs text-stone-600">
                      {new Date(p.paid_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-stone-900">{p.telecallerName}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{p.payout_period}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{inr(p.amount_paise)}</td>
                    <td className="px-3 py-2.5 text-xs">{METHOD_LABEL[p.method as PayoutMethod] ?? p.method}</td>
                    <td className="px-4 sm:px-5 py-2.5 text-xs text-stone-500 break-all">
                      {[p.reference_no, p.note].filter(Boolean).join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>

      {paying && (
        <PayDialog
          row={paying}
          period={period}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function PayDialog({
  row,
  period,
  onClose,
  onDone,
}: {
  row: PayrollData["rows"][number];
  period: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [method, setMethod] = useState<PayoutMethod>("upi");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await callAdminApi("/api/admin/commissions/pay", {
        profileId: row.profileId,
        period,
        expectedPaise: row.payablePaise,
        method,
        referenceNo: reference,
        note,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Payment record nahi hua");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-base font-semibold text-stone-900">Payment record karein</h3>
          <p className="text-sm text-stone-500 mt-0.5">
            {row.name} · {periodLabel(period)}
          </p>
        </div>
        <div className="rounded-lg bg-stone-50 border border-stone-200 p-3 text-center">
          <div className="text-2xl font-bold text-stone-900 tabular-nums">{inr(row.payablePaise)}</div>
          <div className="text-xs text-stone-500 mt-0.5">Pehle bhej dijiye, phir yahan record kijiye.</div>
        </div>
        {err && <Notice tone="bad" icon={AlertTriangle}><span className="break-words">{err}</span></Notice>}
        <label className="block text-sm">
          <span className="text-stone-600">Method</span>
          <select className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" value={method}
            onChange={(e) => setMethod(e.target.value as PayoutMethod)}>
            {PAYOUT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">UTR / reference (optional)</span>
          <input className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" value={reference}
            maxLength={120} onChange={(e) => setReference(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">Note (optional)</span>
          <input className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" value={note}
            maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="bg-orange-600 hover:bg-orange-700 text-white gap-2" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Paid mark karein
          </Button>
        </div>
      </div>
    </div>
  );
}
