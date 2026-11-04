import { useCallback, useEffect, useState } from "react";
import { callAdminApi } from "@/lib/admin-api";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Notice, Panel, SegmentedTabs, StatusPill, TableScroll } from "./admin-ui";

// The checkpoint: which telecaller generated which subscriber. The owner
// links / re-links here; the next reconcile pays ₹80 / ₹20 on that link.

interface Row {
  subscriptionId: string;
  name: string;
  phone: string | null;
  plan: string | null;
  status: string;
  since: string;
  telecallerId: string | null;
  telecallerName: string | null;
  source: string | null;
  commissionGenerated: boolean;
}
interface ListResponse {
  rows: Row[];
  telecallers: { id: string; full_name: string | null; phone: string | null }[];
  truncated: boolean;
}

type Filter = "all" | "unassigned" | "assigned";

const SOURCE_LABEL: Record<string, string> = {
  token: "Payment link",
  call_window: "Call (30 din)",
  manual: "Owner ne assign kiya",
  agent_referral: "Agent referral",
  organic: "Organic",
};

export function TelecallerAssignment() {
  const [filter, setFilter] = useState<Filter>("all");
  const [telecallerId, setTelecallerId] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(
        await callAdminApi<ListResponse>("/api/admin/commissions/attribution-list", {
          filter,
          telecallerId: telecallerId || undefined,
          search: query || undefined,
          showAll,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "List load nahi hui");
    }
  }, [filter, telecallerId, query, showAll]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  // Debounce the search box.
  useEffect(() => {
    const h = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(h);
  }, [search]);

  async function assign(subscriptionId: string, value: string) {
    setSavingId(subscriptionId);
    setError(null);
    try {
      await callAdminApi("/api/admin/commissions/assign-telecaller", {
        subscriptionId,
        telecallerId: value === "" ? null : value,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assign nahi hua");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Notice tone="info">
        Yahan se tay kijiye ki kaunsa subscriber kis telecaller ne laaya. Link karne ke baad{" "}
        <b>Engine</b> tab mein “Run reconcile” chalaiye — telecaller ko ₹80 (pehli baar) aur
        har agle paid mahine ₹20 mil jayenge. Commission ban jaane ke baad telecaller badla nahi
        ja sakta.
      </Notice>

      {error && (
        <Notice tone="bad" icon={AlertTriangle}>
          <span className="break-words">{error}</span>
        </Notice>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SegmentedTabs<Filter>
          value={filter}
          onChange={setFilter}
          items={[
            { value: "all", label: "Sab" },
            { value: "unassigned", label: "Bina telecaller" },
            { value: "assigned", label: "Assigned" },
          ]}
        />
        <select
          className="rounded-md border border-stone-300 px-3 py-2 text-sm bg-white"
          value={telecallerId}
          onChange={(e) => setTelecallerId(e.target.value)}
        >
          <option value="">Sab telecallers</option>
          {data?.telecallers.map((t) => (
            <option key={t.id} value={t.id}>{t.full_name ?? t.phone ?? t.id.slice(0, 6)}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-xs text-stone-600">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Purani (cancelled/expired) subscriptions bhi dikhayein
        </label>
        <input
          className="rounded-md border border-stone-300 px-3 py-2 text-sm sm:ml-auto sm:w-64"
          placeholder="Naam ya phone search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Panel flush>
        {!data ? (
          <div className="p-4 sm:p-5"><Skeleton className="h-32 w-full" /></div>
        ) : data.rows.length === 0 ? (
          <EmptyState title="Koi subscriber nahi mila." />
        ) : (
          <TableScroll>
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-xs text-stone-500 border-b border-stone-100">
                  <th className="font-medium px-4 sm:px-5 py-2.5">Subscriber</th>
                  <th className="font-medium px-3 py-2.5">Plan</th>
                  <th className="font-medium px-3 py-2.5">Status</th>
                  <th className="font-medium px-3 py-2.5">Start</th>
                  <th className="font-medium px-3 py-2.5">Kaise link hua</th>
                  <th className="font-medium px-4 sm:px-5 py-2.5">Telecaller</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.rows.map((r) => (
                  <tr key={r.subscriptionId}>
                    <td className="px-4 sm:px-5 py-2.5">
                      <div className="font-medium text-stone-900">{r.name}</div>
                      <div className="text-xs text-stone-400">{r.phone ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-stone-600">{r.plan ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <StatusPill tone={r.status === "active" ? "good" : "neutral"}>{r.status}</StatusPill>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-stone-600">{r.since?.slice(0, 10)}</td>
                    <td className="px-3 py-2.5 text-xs text-stone-600">
                      {r.source ? (SOURCE_LABEL[r.source] ?? r.source) : "Abhi reconcile nahi hua"}
                    </td>
                    <td className="px-4 sm:px-5 py-2.5">
                      {r.commissionGenerated ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-stone-700" title="Commission ban chuki hai">
                          <Lock className="w-3 h-3 text-stone-400" />
                          {r.telecallerName ?? "—"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <select
                            className="rounded-md border border-stone-300 px-2 py-1.5 text-xs bg-white max-w-44"
                            value={r.telecallerId ?? ""}
                            disabled={savingId === r.subscriptionId}
                            onChange={(e) => assign(r.subscriptionId, e.target.value)}
                          >
                            <option value="">— koi nahi —</option>
                            {data.telecallers.map((t) => (
                              <option key={t.id} value={t.id}>{t.full_name ?? t.phone ?? t.id.slice(0, 6)}</option>
                            ))}
                          </select>
                          {savingId === r.subscriptionId && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>
      {data?.truncated && (
        <p className="text-xs text-stone-500">Sirf latest 300 dikh rahe hain — search ya filter se narrow kijiye.</p>
      )}
    </div>
  );
}
