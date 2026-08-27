import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CopyPlus,
  Loader2,
  Send,
  Trash2,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { callAdminApi } from "@/lib/admin-api";
import { supabase } from "@/lib/supabase";
import {
  AGENT_MAX_BATCH,
  AGENT_MAX_FAMILY_NAMES,
  normalizePhoneE164Agent,
  sanitizeFamilyNames,
} from "@/lib/agent-portal-logic";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/agent/")({
  component: AgentUploadPage,
});

// ─────────────────────────────────────────────────────────────
// Agent Portal — Leads Upload (migration 020).
//
// The field agent's ONE job: type (or paste) the name + number she
// collected, plus any family-member names scribbled next to it.
// Server-side, every row is deduped against open leads AND active
// subscribers, and — when the owner has routed her — lands in the
// telecaller's Aaj Ke Leads tray the same second (status='assigned').
// Without a route the row waits in the 'new' pool for daily manual
// assignment. All of that discipline lives in the API; this page
// just speaks Hinglish and shows exactly what happened per row.
// ─────────────────────────────────────────────────────────────

interface DraftRow {
  fullName: string;
  phone: string;
  city: string;
  notes: string;
  familyNames: string; // comma-separated as typed
}

interface UploadResultRow {
  index: number;
  ok: boolean;
  status?: "inserted" | "duplicate" | "assigned";
  reason?: string;
}

interface UploadResponse {
  ok: boolean;
  inserted: number;
  routedToTelecaller: boolean;
  results?: UploadResultRow[];
  error?: string;
}

const EMPTY_ROW: DraftRow = { fullName: "", phone: "", city: "", notes: "", familyNames: "" };

/** Client-side mirror of the server's per-row check — instant feedback, same rules. */
function draftProblem(r: DraftRow): string | null {
  if (!normalizePhoneE164Agent(r.phone)) {
    return r.phone.trim() ? "Phone sahi Indian number nahi hai" : "Phone zaroori hai";
  }
  if (r.familyNames.trim() && sanitizeFamilyNames(r.familyNames.split(",")) === null) {
    return "Family names format galat hai";
  }
  return null;
}

function AgentUploadPage() {
  const [myName, setMyName] = useState<string | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([
    { ...EMPTY_ROW },
    { ...EMPTY_ROW },
    { ...EMPTY_ROW },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResponse | null>(null);

  // Her own profile row is readable under RLS ("user reads own") —
  // same path fetchMyRole uses. Purely cosmetic greeting.
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        const uid = data.session?.user?.id;
        if (!uid) return;
        return supabase
          .from("profiles")
          .select("full_name")
          .eq("id", uid)
          .maybeSingle()
          .then(({ data: prof }) => setMyName((prof?.full_name as string | null) ?? null));
      })
      .catch(() => setMyName(null));
  }, []);

  const validRowCount = useMemo(
    () => rows.filter((r) => r.phone.trim() || r.fullName.trim()).length,
    [rows],
  );
  const problemRows = useMemo(
    () =>
      rows
        .map((r, i) => ({ i, problem: draftProblem(r) }))
        .filter(
          (x): x is { i: number; problem: string } =>
            x.problem !== null && !!rows[x.i].phone.trim(),
        ),
    [rows],
  );

  const setRow = (i: number, patch: Partial<DraftRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = useCallback(async () => {
    setError(null);
    setResult(null);

    // Only rows where the agent actually typed something.
    const filled = rows.filter((r) => r.phone.trim() || r.fullName.trim());
    if (filled.length === 0) {
      setError("Kam se kam ek row bhar kar hi bhejein.");
      return;
    }
    if (filled.length > AGENT_MAX_BATCH) {
      setError(`Ek baar mein max ${AGENT_MAX_BATCH} leads — baaki agle batch mein.`);
      return;
    }
    const bad = filled.findIndex((r) => draftProblem(r) !== null);
    if (bad !== -1) {
      setError(`Row ${bad + 1}: ${draftProblem(filled[bad])} — pehle theek karein.`);
      return;
    }

    setSubmitting(true);
    try {
      const payload = filled.map((r) => ({
        fullName: r.fullName.trim() || undefined,
        phone: r.phone.trim(),
        city: r.city.trim() || undefined,
        notes: r.notes.trim() || undefined,
        familyNames: sanitizeFamilyNames(r.familyNames.split(",")) ?? [],
      }));
      const res = await callAdminApi<UploadResponse>("/api/agent/leads/upload", { rows: payload });
      setResult(res);
      if (res.ok) setRows([{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fail ho gaya");
    } finally {
      setSubmitting(false);
    }
  }, [rows]);

  const insertedCount = result?.results?.filter((r) => r.status === "inserted").length ?? 0;
  const assignedCount = result?.results?.filter((r) => r.status === "assigned").length ?? 0;
  const dupCount = result?.results?.filter((r) => r.status === "duplicate").length ?? 0;
  const errCount = result?.results?.filter((r) => !r.ok).length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Upload className="w-5 h-5 text-violet-700" />
          Leads Upload
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {myName ? `${myName}, aapke ` : "Aapke "}
          numbers yahan bharein — family ke naam bhi. Yeh seedha telecaller ki free-trial call list
          mein chale jaate hain.
        </p>
      </div>

      {/* Result banner */}
      {result?.ok && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-900">
            <CheckCircle2 className="w-4 h-4 text-violet-700" />
            Upload poora hua — {insertedCount + assignedCount} nayi leads
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {assignedCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono">
                {assignedCount} seedha telecaller ko
              </span>
            )}
            {insertedCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200 font-mono">
                {insertedCount} list mein (assignment roz hoti hai)
              </span>
            )}
            {dupCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-mono">
                {dupCount} pehle se system mein
              </span>
            )}
            {errCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 font-mono">
                {errCount} galat
              </span>
            )}
          </div>
          {result.routedToTelecaller ? (
            <p className="text-[11px] text-violet-800/80">
              Aapki routing ON hai — upar wali leads turant telecaller ke paas pahunch gayi.
            </p>
          ) : (
            <p className="text-[11px] text-violet-800/80">
              Routing abhi set nahi hai — leads daily assignment list mein ja rahi hain.
            </p>
          )}
        </div>
      )}

      {/* Per-row results */}
      {result?.results && result.results.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-4">
          <h2 className="text-sm font-bold text-slate-800 mb-2">Har row ka result</h2>
          <ul className="space-y-1.5">
            {result.results.map((r) => (
              <li key={r.index} className="flex items-start gap-2 text-xs">
                {r.ok ? (
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 mt-0.5 text-rose-600 shrink-0" />
                )}
                <span className="text-slate-600">
                  <span className="font-mono text-slate-400">#{r.index + 1}</span>{" "}
                  {r.ok ? (
                    <>
                      <span className="font-semibold text-slate-800">
                        {r.status === "assigned"
                          ? "Telecaller ko assign"
                          : r.status === "duplicate"
                            ? "Duplicate"
                            : "List mein add"}
                      </span>
                      {r.reason ? ` — ${r.reason}` : ""}
                    </>
                  ) : (
                    <span className="text-rose-800">{r.reason ?? "Row galat thi"}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-900 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* Row editor */}
      {submitting && !result ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <section className="space-y-3">
          {rows.map((r, i) => {
            const touched = r.phone.trim() || r.fullName.trim();
            const problem = touched ? draftProblem(r) : null;
            return (
              <div
                key={i}
                className={`rounded-2xl border bg-white shadow-2xs p-4 space-y-3 ${
                  problem ? "border-rose-200" : "border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wide">
                    Lead #{i + 1}
                  </span>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                      className="text-slate-400 hover:text-rose-600 transition-colors"
                      aria-label={`Row ${i + 1} hataayein`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="block text-xs font-bold text-slate-700 mb-1">Poora naam</span>
                    <input
                      value={r.fullName}
                      onChange={(e) => setRow(i, { fullName: e.target.value })}
                      placeholder="जैसे — रामलाल शर्मा"
                      maxLength={80}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-bold text-slate-700 mb-1">
                      Mobile number <span className="text-rose-600">*</span>
                    </span>
                    <input
                      value={r.phone}
                      onChange={(e) =>
                        setRow(i, { phone: e.target.value.replace(/[^\d+]/g, "").slice(0, 13) })
                      }
                      inputMode="numeric"
                      placeholder="9876543210"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-bold text-slate-700 mb-1">Sheher</span>
                    <input
                      value={r.city}
                      onChange={(e) => setRow(i, { city: e.target.value })}
                      placeholder="जैसे — जयपुर"
                      maxLength={80}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-bold text-slate-700 mb-1">Note</span>
                    <input
                      value={r.notes}
                      onChange={(e) => setRow(i, { notes: e.target.value })}
                      placeholder="जैसे — शाम 6 बजे बात करें"
                      maxLength={1000}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1">
                    <Users className="w-3.5 h-3.5 text-violet-600" />
                    Family ke naam (comma se alag karein — max {AGENT_MAX_FAMILY_NAMES})
                  </span>
                  <input
                    value={r.familyNames}
                    onChange={(e) => setRow(i, { familyNames: e.target.value })}
                    placeholder="जैसे — सीता देवी, गोपाल, प्रीति"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                  />
                  <span className="block text-[11px] text-slate-400 mt-1">
                    Yeh naam telecaller ko lead card par dikhenge — sankalp bharte waqt kaam
                    aayenge.
                  </span>
                </label>
                {problem && <p className="text-[11px] text-rose-700">{problem}</p>}
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRows((prev) => [...prev, { ...EMPTY_ROW }])}
              disabled={rows.length >= AGENT_MAX_BATCH}
              className="gap-1.5"
            >
              <CopyPlus className="w-3.5 h-3.5" /> Ek aur row
            </Button>
            <span className="text-[11px] text-slate-400">
              {validRowCount} row bhari hui · ek batch mein max {AGENT_MAX_BATCH}
            </span>
          </div>

          <Button
            onClick={submit}
            disabled={submitting || validRowCount === 0 || problemRows.length > 0}
            className="w-full sm:w-auto gap-2 bg-violet-700 hover:bg-violet-800 text-white"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {submitting ? "Bhej rahe hain…" : `${validRowCount} leads bhejein`}
          </Button>
        </section>
      )}
    </div>
  );
}
