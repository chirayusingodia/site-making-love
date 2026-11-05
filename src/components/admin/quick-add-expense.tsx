import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callAdminApi } from "@/lib/admin-api";
import {
  EntryDialog,
  blankDraft,
  type FinanceCategory,
} from "@/components/admin/finance-ledger";

/**
 * One-click "Add expense" for the owner. Loads categories on first click, then
 * opens the same entry form the Finance ledger uses. Owner-only: the caller
 * must render it only for the owner (the API enforces it as well).
 */
export function QuickAddExpense({ onSaved }: { onSaved?: () => void }) {
  const [cats, setCats] = useState<FinanceCategory[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const start = async () => {
    setError(null);
    setDone(false);
    if (!cats) {
      setLoading(true);
      try {
        const r = await callAdminApi<{ categories: FinanceCategory[] }>(
          "/api/admin/finance/categories",
          { action: "list" },
        );
        setCats(r.categories);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Categories load nahi hui");
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    setOpen(true);
  };

  return (
    <>
      <Button size="sm" onClick={start} disabled={loading} className="gap-1.5">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        Add expense
      </Button>
      {done && <span className="text-xs text-emerald-700">Saved ✓</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
      <EntryDialog
        draft={open ? blankDraft() : null}
        categories={cats ?? []}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false);
          setDone(true);
          onSaved?.();
        }}
      />
    </>
  );
}
