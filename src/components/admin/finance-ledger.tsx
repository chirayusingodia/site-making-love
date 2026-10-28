import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { callAdminApi } from "@/lib/admin-api";
import { CloudinaryImageButton } from "@/components/admin/CloudinaryImageButton";
import { todayIST } from "@/lib/offline-subscriptions-logic";
import { ENTRY_METHODS } from "@/lib/finance-requests";
import { inr } from "@/lib/finance-ui";
import { fmtDate } from "@/lib/reports-logic";
import { EmptyState, Notice, TableScroll } from "@/components/admin/admin-ui";

// The expense / other-income LEDGER (owner-only). Entries are soft-deleted
// with a reason; edits are audited server-side with a before/after diff.

export interface FinanceCategory {
  id: string;
  name: string;
  entry_type: "expense" | "income";
  pnl_group: "direct" | "operating" | "other_income";
  sort_order: number;
  is_archived: boolean;
  entry_count?: number;
}

interface LedgerEntry {
  id: string;
  entry_date: string;
  category_id: string;
  amount_paise: number;
  description: string;
  counterparty: string | null;
  payment_method: string;
  reference_no: string | null;
  receipt_url: string | null;
  amortize_months: number;
  seva_id: string | null;
  deleted_at: string | null;
  finance_categories:
    | { name: string; entry_type: string; pnl_group: string }
    | { name: string; entry_type: string; pnl_group: string }[];
}

interface EntryDraft {
  id?: string;
  entryType: "expense" | "income";
  entryDate: string;
  categoryId: string;
  amount: string;
  description: string;
  counterparty: string;
  paymentMethod: string;
  referenceNo: string;
  receiptUrl: string;
  amortizeMonths: number;
  sevaId: string;
}

const selectCls =
  "w-full min-w-0 text-sm border border-stone-300 rounded-md px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-orange-600/30 bg-white text-stone-700";

const METHOD_LABEL: Record<string, string> = {
  upi: "UPI",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card: "Card",
  cheque: "Cheque",
  other: "Other",
};

const PAGE_SIZE = 25;

function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

const catOf = (e: LedgerEntry) =>
  Array.isArray(e.finance_categories) ? e.finance_categories[0] : e.finance_categories;

const paiseToRupees = (p: number): string =>
  p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2);

function blankDraft(): EntryDraft {
  return {
    entryType: "expense",
    entryDate: todayIST(new Date()),
    categoryId: "",
    amount: "",
    description: "",
    counterparty: "",
    paymentMethod: "upi",
    referenceNo: "",
    receiptUrl: "",
    amortizeMonths: 1,
    sevaId: "",
  };
}

export function FinanceLedger({
  fromYm,
  toYm,
  categories,
  onChanged,
}: {
  fromYm: string;
  toYm: string;
  categories: FinanceCategory[];
  onChanged: () => void;
}) {
  const [from, setFrom] = useState(`${fromYm}-01`);
  const [to, setTo] = useState(monthEnd(toYm));
  const [entryType, setEntryType] = useState<"" | "expense" | "income">("");
  const [categoryId, setCategoryId] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<EntryDraft | null>(null);
  const [deleting, setDeleting] = useState<LedgerEntry | null>(null);

  // The ledger follows the page-level period until the owner edits its own dates.
  useEffect(() => {
    setFrom(`${fromYm}-01`);
    setTo(monthEnd(toYm));
    setPage(1);
  }, [fromYm, toYm]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await callAdminApi<{ entries: LedgerEntry[]; total: number }>(
        "/api/admin/finance/entries-list",
        {
          from,
          to,
          page,
          pageSize: PAGE_SIZE,
          ...(entryType ? { entryType } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(q.trim() ? { q: q.trim() } : {}),
        },
      );
      setEntries(r.entries);
      setTotal(r.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ledger load nahi hua");
    } finally {
      setLoading(false);
    }
  }, [from, to, page, entryType, categoryId, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const toDraft = (e: LedgerEntry, duplicate: boolean): EntryDraft => ({
    ...(duplicate ? {} : { id: e.id }),
    entryType: (catOf(e)?.entry_type as "expense" | "income") ?? "expense",
    entryDate: duplicate ? todayIST(new Date()) : e.entry_date,
    categoryId: e.category_id,
    amount: paiseToRupees(e.amount_paise),
    description: e.description,
    counterparty: e.counterparty ?? "",
    paymentMethod: e.payment_method,
    referenceNo: duplicate ? "" : (e.reference_no ?? ""),
    receiptUrl: duplicate ? "" : (e.receipt_url ?? ""),
    amortizeMonths: e.amortize_months,
    sevaId: e.seva_id ?? "",
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visibleCats = categories.filter((c) => !entryType || c.entry_type === entryType);

  const groupLabel = (e: LedgerEntry) => {
    const cat = catOf(e);
    return cat?.entry_type === "income"
      ? "Income"
      : cat?.pnl_group === "direct"
        ? "Direct cost"
        : "Operating";
  };
  const metaLine = (e: LedgerEntry) =>
    `${e.counterparty ?? ""}${e.amortize_months > 1 ? ` · spread over ${e.amortize_months} months` : ""}${e.reference_no ? ` · ref ${e.reference_no}` : ""}`;

  const rowActions = (e: LedgerEntry) => (
    <div className="flex gap-1 justify-end">
      <Button
        size="sm"
        variant="ghost"
        className="h-9 w-9 md:h-8 md:w-8 p-0 text-stone-500 hover:text-stone-900"
        aria-label="Edit entry"
        onClick={() => setEditing(toDraft(e, false))}
      >
        <Pencil className="w-3.5 h-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-9 w-9 md:h-8 md:w-8 p-0 text-stone-500 hover:text-stone-900"
        aria-label="Duplicate entry with today's date"
        title="Duplicate (today's date)"
        onClick={() => setEditing(toDraft(e, true))}
      >
        <Copy className="w-3.5 h-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-9 w-9 md:h-8 md:w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
        aria-label="Delete entry"
        onClick={() => setDeleting(e)}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="admin-card p-3 sm:p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            aria-label="From date"
            className="h-9 text-sm min-w-0"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            aria-label="To date"
            className="h-9 text-sm min-w-0"
          />
          <select
            className={`${selectCls} h-9`}
            value={entryType}
            onChange={(e) => {
              setEntryType(e.target.value as "" | "expense" | "income");
              setCategoryId("");
              setPage(1);
            }}
            aria-label="Type"
          >
            <option value="">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Other income</option>
          </select>
          <select
            className={`${selectCls} h-9`}
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
            aria-label="Category"
          >
            <option value="">All categories</option>
            {visibleCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_archived ? " (archived)" : ""}
              </option>
            ))}
          </select>
          <div className="relative col-span-2 md:col-span-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search…"
              aria-label="Search entries"
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Button
            size="sm"
            onClick={() => setEditing(blankDraft())}
            className="col-span-2 md:col-span-1 h-9 gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
          >
            <Plus className="w-3.5 h-3.5" /> Add entry
          </Button>
        </div>
      </div>

      {error && (
        <Notice tone="bad" icon={AlertCircle}>
          {error}
        </Notice>
      )}

      <div className="admin-card overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full bg-stone-100" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState title="Is period mein koi entry nahi." />
        ) : (
          <>
            {/* Phone: stacked cards */}
            <ul className="md:hidden divide-y divide-stone-100">
              {entries.map((e) => {
                const cat = catOf(e);
                const isIncome = cat?.entry_type === "income";
                const meta = metaLine(e);
                return (
                  <li key={e.id} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-stone-900 truncate">
                          {cat?.name ?? "—"}
                        </div>
                        <div className="text-xs text-stone-500">
                          {fmtDate(e.entry_date)} · {groupLabel(e)} ·{" "}
                          {METHOD_LABEL[e.payment_method] ?? e.payment_method}
                        </div>
                      </div>
                      <div
                        className={`text-sm font-semibold tabular-nums whitespace-nowrap ${isIncome ? "text-emerald-700" : "text-stone-900"}`}
                      >
                        {isIncome ? "+" : "−"}
                        {inr(e.amount_paise)}
                      </div>
                    </div>
                    <p className="text-sm text-stone-700 break-words">{e.description}</p>
                    {meta && <p className="text-xs text-stone-500 break-all">{meta}</p>}
                    <div className="flex items-center justify-between gap-2">
                      {e.receipt_url ? (
                        <a
                          href={e.receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-orange-700 hover:underline"
                        >
                          Receipt
                        </a>
                      ) : (
                        <span />
                      )}
                      {rowActions(e)}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Tablet / desktop: table */}
            <div className="hidden md:block">
              <TableScroll>
                <table className="admin-table-fixed w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50 text-xs font-medium text-stone-500">
                      <th className="text-left font-medium py-2.5 px-4">Date</th>
                      <th className="text-left font-medium py-2.5 px-3">Category</th>
                      <th className="text-left font-medium py-2.5 px-3">Description</th>
                      <th className="text-right font-medium py-2.5 px-3">Amount</th>
                      <th className="text-left font-medium py-2.5 px-3">Method</th>
                      <th className="py-2.5 px-4">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {entries.map((e) => {
                      const cat = catOf(e);
                      const isIncome = cat?.entry_type === "income";
                      const meta = metaLine(e);
                      return (
                        <tr key={e.id} className="align-top hover:bg-stone-50/60">
                          <td className="py-3 px-4 text-[13px] text-stone-600 whitespace-nowrap">
                            {fmtDate(e.entry_date)}
                          </td>
                          <td className="py-3 px-3 text-[13px]">
                            <div className="font-medium text-stone-900">{cat?.name ?? "—"}</div>
                            <div className="text-xs text-stone-400">{groupLabel(e)}</div>
                          </td>
                          <td className="py-3 px-3 text-[13px] text-stone-700 max-w-xs">
                            <div className="break-words">{e.description}</div>
                            {meta && (
                              <div className="text-xs text-stone-400 break-words">{meta}</div>
                            )}
                            {e.receipt_url && (
                              <a
                                href={e.receipt_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-orange-700 hover:underline"
                              >
                                Receipt
                              </a>
                            )}
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-semibold tabular-nums whitespace-nowrap ${isIncome ? "text-emerald-700" : "text-stone-900"}`}
                          >
                            {isIncome ? "+" : "−"}
                            {inr(e.amount_paise)}
                          </td>
                          <td className="py-3 px-3 text-[13px] text-stone-600">
                            {METHOD_LABEL[e.payment_method] ?? e.payment_method}
                          </td>
                          <td className="py-2 px-4">{rowActions(e)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          </>
        )}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-stone-100 text-xs text-stone-500">
            <span>
              Page {page} of {totalPages} · {total} entries
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-9 md:h-8 md:w-8 p-0"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-9 md:h-8 md:w-8 p-0"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <EntryDialog
        draft={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={() => {
          void load();
          onChanged();
        }}
      />
      <DeleteDialog
        entry={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          void load();
          onChanged();
        }}
      />
    </div>
  );
}

// ─── Add / edit / duplicate ──────────────────────────────────

function EntryDialog({
  draft,
  categories,
  onClose,
  onSaved,
}: {
  draft: EntryDraft | null;
  categories: FinanceCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto rounded-xl p-5 sm:p-6">
        {draft && (
          <EntryForm
            key={draft.id ?? "new"}
            initial={draft}
            categories={categories}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({
  initial,
  categories,
  onClose,
  onSaved,
}: {
  initial: EntryDraft;
  categories: FinanceCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<EntryDraft>(initial);
  const [sevas, setSevas] = useState<{ id: string; name: string }[]>([]);
  const [advanced, setAdvanced] = useState(initial.amortizeMonths > 1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("sevas").select("id,name").order("name");
      setSevas((data as { id: string; name: string }[]) ?? []);
    })();
  }, []);

  const set = <K extends keyof EntryDraft>(k: K, v: EntryDraft[K]) =>
    setD((x) => ({ ...x, [k]: v }));
  // Archived categories are hidden for new picks, but an entry already in one keeps it.
  const options = categories.filter(
    (c) => c.entry_type === d.entryType && (!c.is_archived || c.id === initial.categoryId),
  );
  const paise = Math.round(parseFloat(d.amount) * 100);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await callAdminApi("/api/admin/finance/entries-upsert", {
        ...(d.id ? { id: d.id } : {}),
        entryDate: d.entryDate,
        categoryId: d.categoryId,
        amountPaise: paise,
        description: d.description,
        counterparty: d.counterparty || undefined,
        paymentMethod: d.paymentMethod,
        referenceNo: d.referenceNo || undefined,
        receiptUrl: d.receiptUrl || undefined,
        amortizeMonths: d.amortizeMonths,
        sevaId: d.sevaId || undefined,
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Entry save nahi hui");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{d.id ? "Edit entry" : "Add entry"}</DialogTitle>
        <DialogDescription>Expense ya other income — sirf owner ko dikhta hai.</DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div
          className="inline-flex gap-1 rounded-lg bg-stone-100 p-1"
          role="group"
          aria-label="Entry type"
        >
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={!!d.id}
              onClick={() => {
                set("entryType", t);
                set("categoryId", "");
              }}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                d.entryType === t
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              {t === "expense" ? "Expense" : "Income"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="fe-date">Date</Label>
            <Input
              id="fe-date"
              type="date"
              max={todayIST(new Date())}
              value={d.entryDate}
              onChange={(e) => set("entryDate", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fe-amount">Amount (₹)</Label>
            <Input
              id="fe-amount"
              inputMode="decimal"
              value={d.amount}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="5000"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="fe-cat">Category</Label>
          <select
            id="fe-cat"
            className={selectCls}
            value={d.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
          >
            <option value="">Category chunein…</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_archived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="fe-desc">Description</Label>
          <Input
            id="fe-desc"
            value={d.description}
            maxLength={500}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="fe-cp">{d.entryType === "income" ? "Received from" : "Paid to"}</Label>
            <Input
              id="fe-cp"
              value={d.counterparty}
              maxLength={200}
              onChange={(e) => set("counterparty", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fe-method">Method</Label>
            <select
              id="fe-method"
              className={selectCls}
              value={d.paymentMethod}
              onChange={(e) => set("paymentMethod", e.target.value)}
            >
              {ENTRY_METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="fe-ref">Reference (optional)</Label>
          <Input
            id="fe-ref"
            value={d.referenceNo}
            maxLength={64}
            onChange={(e) => set("referenceNo", e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label>Receipt (optional)</Label>
          <div className="flex flex-wrap items-center gap-3">
            <CloudinaryImageButton
              folder="punyata-finance/receipts"
              label={d.receiptUrl ? "Replace receipt" : "Upload receipt"}
              onUploaded={(url) => set("receiptUrl", url)}
            />
            {d.receiptUrl && (
              <a
                href={d.receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-orange-700 hover:underline"
              >
                View uploaded
              </a>
            )}
          </div>
          <p className="text-xs text-stone-500">
            Cloudinary links are unguessable but public — don&apos;t upload anything showing a full
            bank account number.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="fe-seva">Linked seva (optional)</Label>
          <select
            id="fe-seva"
            className={selectCls}
            value={d.sevaId}
            onChange={(e) => set("sevaId", e.target.value)}
          >
            <option value="">— none —</option>
            {sevas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <button
            type="button"
            className="py-1 text-xs font-medium text-orange-700 hover:underline"
            onClick={() => setAdvanced((a) => !a)}
          >
            {advanced ? "Hide advanced" : "Advanced: spread over several months"}
          </button>
          {advanced && (
            <div className="mt-2 space-y-1">
              <Label htmlFor="fe-spread">Spread over N months (1–36)</Label>
              <Input
                id="fe-spread"
                type="number"
                min={1}
                max={36}
                value={d.amortizeMonths}
                onChange={(e) =>
                  set("amortizeMonths", Math.max(1, Math.min(36, Number(e.target.value) || 1)))
                }
                className="w-28"
              />
              <p className="text-xs text-stone-500">
                Normalised P&amp;L basis splits this amount equally across N months (e.g. a yearly
                hosting bill = 12). Cash basis still books it in the month paid.
              </p>
            </div>
          )}
        </div>
      </div>

      {err && <p className="text-xs text-rose-700">{err}</p>}

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={save}
          disabled={
            busy || !d.categoryId || !d.description.trim() || !Number.isFinite(paise) || paise < 1
          }
          className="bg-orange-600 hover:bg-orange-700 text-white"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
          Save entry
        </Button>
      </DialogFooter>
    </>
  );
}

function DeleteDialog({
  entry,
  onClose,
  onDeleted,
}: {
  entry: LedgerEntry | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (entry) {
      setReason("");
      setErr(null);
    }
  }, [entry]);

  async function go() {
    if (!entry) return;
    setBusy(true);
    setErr(null);
    try {
      await callAdminApi("/api/admin/finance/entries-delete", {
        id: entry.id,
        reason: reason.trim(),
      });
      onDeleted();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete nahi hua");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[90vh] overflow-y-auto rounded-xl p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle>Delete entry</DialogTitle>
          <DialogDescription>
            {entry ? `${entry.description} · ${inr(entry.amount_paise)}` : ""} — soft delete:
            P&amp;L se hat jayegi, audit log mein record rahegi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="del-reason">Reason (required, 3–300 characters)</Label>
          <Textarea
            id="del-reason"
            rows={3}
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {err && <p className="text-xs text-rose-700">{err}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button
            onClick={go}
            disabled={busy || reason.trim().length < 3}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            Delete entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
