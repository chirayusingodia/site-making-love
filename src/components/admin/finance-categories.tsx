import { useState } from "react";
import { Archive, ArchiveRestore, Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { callAdminApi } from "@/lib/admin-api";
import type { FinanceCategory } from "@/components/admin/finance-ledger";

// Category manager (owner-only). Categories are never deleted: they are
// added, renamed, re-sorted or archived. Once a category has entries its
// type/group are frozen server-side (409) — only the name and order change.

const GROUPS: { key: FinanceCategory["pnl_group"]; title: string; hint: string }[] = [
  { key: "direct", title: "Direct cost of seva", hint: "Comes off revenue → Gross profit" },
  { key: "operating", title: "Operating expense", hint: "Comes off Gross profit → Net profit" },
  {
    key: "other_income",
    title: "Other income",
    hint: "Donations, one-time poojas — added to Net profit",
  },
];

export function FinanceCategories({
  categories,
  loading,
  onChanged,
}: {
  categories: FinanceCategory[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSort, setEditSort] = useState("");
  const [adding, setAdding] = useState<FinanceCategory["pnl_group"] | null>(null);
  const [newName, setNewName] = useState("");

  async function call(body: Record<string, unknown>, key: string) {
    setBusyId(key);
    setError(null);
    try {
      await callAdminApi("/api/admin/finance/categories", body);
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request fail ho gayi");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const typeOf = (g: FinanceCategory["pnl_group"]) => (g === "other_income" ? "income" : "expense");

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs">
          {error}
        </div>
      )}
      {loading && <Loader2 className="w-5 h-5 animate-spin text-amber-700" />}

      {GROUPS.map((g) => {
        const rows = categories.filter((c) => c.pnl_group === g.key);
        return (
          <section
            key={g.key}
            className="bg-white border border-amber-900/10 rounded-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-amber-100 bg-amber-50/50">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{g.title}</h3>
                <p className="text-[11px] text-slate-500">{g.hint}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1"
                onClick={() => {
                  setAdding(g.key);
                  setNewName("");
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>

            {adding === g.key && (
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-50 bg-amber-50/30">
                <Input
                  autoFocus
                  value={newName}
                  maxLength={80}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New category name"
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  className="h-8 gap-1 text-xs bg-amber-700 hover:bg-amber-800 text-white"
                  disabled={!newName.trim() || busyId === "new"}
                  onClick={async () => {
                    if (
                      await call(
                        {
                          action: "upsert",
                          name: newName,
                          entryType: typeOf(g.key),
                          pnlGroup: g.key,
                        },
                        "new",
                      )
                    )
                      setAdding(null);
                  }}
                >
                  {busyId === "new" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}{" "}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  aria-label="Cancel"
                  onClick={() => setAdding(null)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            <ul>
              {rows.length === 0 && (
                <li className="px-4 py-4 text-xs text-slate-400">Koi category nahi.</li>
              )}
              {rows.map((c) => (
                <li
                  key={c.id}
                  className={`flex items-center gap-2 px-4 py-2.5 border-b border-amber-50 last:border-0 ${c.is_archived ? "opacity-60" : ""}`}
                >
                  {editId === c.id ? (
                    <>
                      <Input
                        value={editName}
                        maxLength={80}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 text-xs flex-1"
                        aria-label="Category name"
                      />
                      <Input
                        value={editSort}
                        inputMode="numeric"
                        onChange={(e) => setEditSort(e.target.value)}
                        className="h-8 text-xs w-20"
                        aria-label="Sort order"
                      />
                      <Button
                        size="sm"
                        className="h-8 gap-1 text-xs bg-amber-700 hover:bg-amber-800 text-white"
                        disabled={!editName.trim() || busyId === c.id}
                        onClick={async () => {
                          const sort = editSort.trim() === "" ? undefined : Number(editSort);
                          if (
                            await call(
                              {
                                action: "upsert",
                                id: c.id,
                                name: editName,
                                entryType: c.entry_type,
                                pnlGroup: c.pnl_group,
                                sortOrder: sort,
                              },
                              c.id,
                            )
                          )
                            setEditId(null);
                        }}
                      >
                        {busyId === c.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        aria-label="Cancel"
                        onClick={() => setEditId(null)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800">
                          {c.name}
                          {c.is_archived && (
                            <span className="ml-2 text-[10px] font-semibold text-slate-500 border border-slate-200 rounded-full px-1.5 py-0.5">
                              Archived
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {c.entry_count ?? 0} entries · order {c.sort_order}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        aria-label={`Rename ${c.name}`}
                        onClick={() => {
                          setEditId(c.id);
                          setEditName(c.name);
                          setEditSort(String(c.sort_order));
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        aria-label={c.is_archived ? `Restore ${c.name}` : `Archive ${c.name}`}
                        title={c.is_archived ? "Restore" : "Archive"}
                        disabled={busyId === c.id}
                        onClick={() =>
                          void call({ action: "archive", id: c.id, archived: !c.is_archived }, c.id)
                        }
                      >
                        {c.is_archived ? (
                          <ArchiveRestore className="w-3.5 h-3.5" />
                        ) : (
                          <Archive className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
