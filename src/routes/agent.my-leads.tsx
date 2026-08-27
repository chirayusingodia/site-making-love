import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ListChecks, RefreshCw, Users } from "lucide-react";
import { callAdminApi } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/agent/my-leads")({
  component: AgentMyLeadsPage,
});

// ─────────────────────────────────────────────────────────────
// Agent Portal — Meri Leads (migration 020).
//
// Every number SHE uploaded with where it stands right now:
// 'assigned' = a telecaller is calling it, 'converted' = the family
// joined. Read-only — her follow-up trust view, not a work queue.
// ─────────────────────────────────────────────────────────────

interface MyLeadRow {
  id: string;
  full_name: string | null;
  phone: string;
  city: string | null;
  status: string;
  family_names: string[] | null;
  assigned_on: string | null;
  created_at: string;
}

const STATUS_CHIPS: { key: string; label: string }[] = [
  { key: "", label: "Sab" },
  { key: "new", label: "Nayi" },
  { key: "assigned", label: "Telecaller ke paas" },
  { key: "in_progress", label: "Call ho rahi" },
  { key: "link_sent", label: "Link bheja" },
  { key: "converted", label: "Join ho gayi" },
  { key: "duplicate", label: "Duplicate" },
  { key: "not_interested", label: "Mana kiya" },
  { key: "unreachable", label: "Nahi lag rahi" },
  { key: "wrong_number", label: "Galat number" },
  { key: "expired", label: "Expire" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  new: {
    label: "Nayi — assignment ka intezaar",
    cls: "bg-slate-100 text-slate-600 border-slate-200",
  },
  assigned: {
    label: "Telecaller ke paas",
    cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  in_progress: { label: "Call ho rahi hain", cls: "bg-sky-50 text-sky-800 border-sky-200" },
  link_sent: {
    label: "Payment link bhej diya",
    cls: "bg-violet-50 text-violet-800 border-violet-200",
  },
  converted: {
    label: "Family join ho gayi",
    cls: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  not_interested: { label: "Mana kar diya", cls: "bg-rose-50 text-rose-800 border-rose-200" },
  unreachable: { label: "Nahi lag rahi", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  wrong_number: { label: "Galat number", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  duplicate: { label: "Pehle se system mein", cls: "bg-amber-100 text-amber-900 border-amber-300" },
  expired: { label: "Expire ho gayi", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

function StatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGE[status] ?? {
    label: status,
    cls: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
  );
}

function AgentMyLeadsPage() {
  const [rows, setRows] = useState<MyLeadRow[] | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (statusFilter: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await callAdminApi<{ ok: boolean; rows: MyLeadRow[] }>("/api/agent/my-leads", {
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      setRows(res.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Leads load nahi hui");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(status);
  }, [load, status]);

  const counts = {
    total: rows?.length ?? 0,
    converted: rows?.filter((r) => r.status === "converted").length ?? 0,
    live:
      rows?.filter((r) => ["new", "assigned", "in_progress", "link_sent"].includes(r.status))
        .length ?? 0,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-violet-700" />
            Meri Leads
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Aapke daale numbers aur unka current status — kul {counts.total}
            {counts.live > 0 && ` · ${counts.live} chal rahi hain`}
            {counts.converted > 0 && ` · ${counts.converted} join ho gayi`}.
          </p>
        </div>
        <Button
          onClick={() => load(status)}
          variant="outline"
          size="sm"
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setStatus(c.key)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              status === c.key
                ? "bg-violet-700 text-white border-violet-700 font-semibold"
                : "bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:text-violet-800"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-900 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {loading && !rows ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5 overflow-auto">
          {(rows ?? []).length === 0 ? (
            <div className="text-slate-400 text-sm py-8 text-center">
              Is filter mein koi lead nahi. Upload page se naye numbers bharein.
            </div>
          ) : (
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="pb-2">Naam</th>
                  <th className="pb-2">Number</th>
                  <th className="pb-2">Sheher</th>
                  <th className="pb-2">Family</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Daali</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-2 font-semibold">{r.full_name ?? "—"}</td>
                    <td className="py-2 text-xs font-mono">{r.phone}</td>
                    <td className="py-2 text-xs">{r.city ?? "—"}</td>
                    <td
                      className="py-2 text-xs max-w-[220px] truncate"
                      title={(r.family_names ?? []).join(", ")}
                    >
                      {(r.family_names ?? []).length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <Users className="w-3 h-3 text-violet-500" />
                          {(r.family_names ?? []).join(", ")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-2 text-xs text-slate-400">{r.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-3">
            <CheckCircle2 className="w-3 h-3" /> Sabse naye pehle — last 100 dikh rahi hain
          </div>
        </section>
      )}
    </div>
  );
}
