import { useState } from "react";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Check,
  Loader2,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { callAdminApi } from "@/lib/admin-api";
import type { FinanceCategory } from "@/components/admin/finance-ledger";
import { Notice, Panel, StatusPill } from "@/components/admin/admin-ui";

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
        <Notice tone="bad" icon={AlertCircle}>
          {error}
        </Notice>
      )}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading categories…
        </div>
      )}

      {GROUPS.map((g) => {
        const rows = categories.filter((c) => c.pnl_group === g.key);
        return (
          <Panel
            key={g.key}
            title={g.title}
            description={g.hint}
            flush
            actions={
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1"
                onClick={() => {
                  setAdding(g.key);
                  setNewName("");
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            }
          >
            {adding === g.key && (
              <div className="flex items-center gap-2 px-4 sm:px-5 py-2.5 border-b border-stone-100 bg-stone-50">
                <Input
                  autoFocus
                  value={newName}
                  maxLength={80}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New category name"
                  className="h-9 text-sm min-w-0 flex-1"
                />
                <Button
                  size="sm"
                  className="h-9 gap-1 shrink-0 bg-orange-600 hover:bg-orange-700 text-white"
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
                  className="h-9 w-9 shrink-0 p-0 text-stone-500 hover:text-stone-900"
                  aria-label="Cancel"
                  onClick={() => setAdding(null)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            <ul className="divide-y divide-stone-100">
              {rows.length === 0 && (
                <li className="px-4 sm:px-5 py-5 text-sm text-stone-400">Koi category nahi.</li>
              )}
              {rows.map((c) => (
                <li
                  key={c.id}
                  className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 ${c.is_archived ? "opacity-60" : ""}`}
                >
                  {editId === c.id ? (
                    <>
                      <Input
                        value={editName}
                        maxLength={80}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-9 text-sm min-w-0 flex-1"
                        aria-label="Category name"
                      />
                      <Input
                        value={editSort}
                        inputMode="numeric"
                        onChange={(e) => setEditSort(e.target.value)}
                        className="h-9 text-sm w-16 sm:w-20 shrink-0"
                        aria-label="Sort order"
                      />
                      <Button
                        size="sm"
                        className="h-9 gap-1 shrink-0 bg-orange-600 hover:bg-orange-700 text-white"
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
                        className="h-9 w-9 shrink-0 p-0 text-stone-500 hover:text-stone-900"
                        aria-label="Cancel"
                        onClick={() => setEditId(null)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-stone-900">
                          <span className="break-words min-w-0">{c.name}</span>
                          {c.is_archived && <StatusPill>Archived</StatusPill>}
                        </div>
                        <div className="text-xs text-stone-400">
                          {c.entry_count ?? 0} entries · order {c.sort_order}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 w-9 shrink-0 p-0 text-stone-500 hover:text-stone-900"
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
                        className="h-9 w-9 shrink-0 p-0 text-stone-500 hover:text-stone-900"
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
          </Panel>
        );
      })}
    </div>
  );
}
