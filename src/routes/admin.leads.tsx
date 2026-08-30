import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callAdminApi } from "@/lib/admin-api";
import { DAILY_LEAD_TARGET } from "@/lib/telecaller-logic";
import { Loader2, RefreshCw, Send, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/leads")({
  component: AdminLeadsPage,
});

// §8.2 — lead pipeline control: paste-a-list upload (deduped),
// daily assignment (SKIP LOCKED RPC), rollover/expiry sweep.

interface UploadResult {
  ok: boolean;
  inserted: number;
  results: { index: number; ok: boolean; status?: string; reason?: string }[];
}

interface LeadRow {
  id: string;
  full_name: string | null;
  phone: string;
  city: string | null;
  status: string;
  assigned_on: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  created_at: string;
  hospital_id: string | null;
  source_agent_id: string | null;
  assigned_to: string | null;
}

// §4.4 (Hospitals session)
interface HospitalRow {
  id: string;
  name: string;
  city: string | null;
  is_active: boolean;
  currentAgent: { agentId: string; agentName: string | null; since: string } | null;
}

function AdminLeadsPage() {
  const [agents, setAgents] = useState<{ id: string; full_name: string | null }[]>([]);
  const [agentId, setAgentId] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [telecallers, setTelecallers] = useState<{ id: string; full_name: string | null }[]>([]);
  // Everyone who can appear as assigned_to (telecaller/admin/owner seats)
  // or as assigned_by (the admin who ran the assignment) — see assign.ts,
  // which allows admin/owner as an assignment target too.
  const [staffDirectory, setStaffDirectory] = useState<
    { id: string; full_name: string | null }[]
  >([]);
  const [telecallerId, setTelecallerId] = useState("");
  const [assignCount, setAssignCount] = useState(DAILY_LEAD_TARGET);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [leads, setLeads] = useState<LeadRow[] | null>(null);

  // §4.4 hospitals
  const [hospitals, setHospitals] = useState<HospitalRow[]>([]);
  const [hospitalId, setHospitalId] = useState("");
  const [newHospitalName, setNewHospitalName] = useState("");
  const [newHospitalCity, setNewHospitalCity] = useState("");
  const [reallotAgent, setReallotAgent] = useState("");

  const loadCatalogues = useCallback(async () => {
    // Direct RLS-scoped reads — this is an ADMIN surface; both tables
    // carry is_admin() policies. (The telecaller panel never does this.)
    const [{ data: agentRows }, { data: tcRows }, { data: staffRows }, { data: leadRows }] =
      await Promise.all([
        supabase.from("sales_agents").select("id,full_name").eq("is_active", true),
        supabase.from("profiles").select("id,full_name").eq("role", "telecaller"),
        supabase.from("profiles").select("id,full_name").in("role", ["telecaller", "admin", "owner"]),
        supabase
          .from("leads")
          .select(
            "id,full_name,phone,city,status,assigned_on,assigned_at,assigned_by,created_at,hospital_id,source_agent_id,assigned_to",
          )
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
    // [Pass-2 F14] functional updates read the CURRENT state, not the
    // first-render closure. The stale-closure version re-snapped the
    // hospital/telecaller select back to the first option on every
    // refresh (clobbering the admin's manual pick) and never applied a
    // default reallot agent at all (agents was frozen at []).
    const freshAgents = (agentRows as { id: string; full_name: string | null }[]) ?? [];
    setAgents(freshAgents);
    setTelecallers((tcRows as { id: string; full_name: string | null }[]) ?? []);
    if (tcRows && tcRows.length > 0) {
      setTelecallerId((prev) => prev || tcRows[0].id);
    }
    setStaffDirectory((staffRows as { id: string; full_name: string | null }[]) ?? []);
    setLeads((leadRows as LeadRow[]) ?? []);
    try {
      const h = await callAdminApi<{ hospitals: HospitalRow[] }>("/api/admin/hospitals/list");
      setHospitals(h.hospitals);
      if (h.hospitals.length > 0) {
        setHospitalId((prev) => prev || h.hospitals[0].id);
      }
      setReallotAgent((prev) => prev || freshAgents[0]?.id || "");
    } catch {
      setHospitals([]);
    }
  }, []);

  useEffect(() => {
    loadCatalogues();
  }, [loadCatalogues]);

  function parsePaste(): { full_name?: string; phone: string; city?: string }[] {
    return pasteText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[,;\t]/).map((p) => p.trim());
        return {
          ...(parts[0] ? { full_name: parts[0] } : {}),
          phone: parts[1] ?? parts[0],
          ...(parts[2] ? { city: parts[2] } : {}),
        };
      });
  }

  async function doUpload() {
    setBusy("upload");
    setMsg(null);
    setResult(null);
    try {
      const rows = parsePaste();
      if (rows.length === 0)
        throw new Error("List khaali hai — 'naam, phone, city' lines paste karein");
      const res = await callAdminApi<UploadResult>("/api/admin/leads/upload", {
        source_agent_id: agentId || undefined,
        hospital_id: hospitalId || undefined,
        rows,
      });
      setResult(res);
      setPasteText("");
      await loadCatalogues();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload fail");
    } finally {
      setBusy(null);
    }
  }

  async function doAssign() {
    setBusy("assign");
    setMsg(null);
    try {
      const res = await callAdminApi<{ claimed: number; requested: number }>(
        "/api/admin/leads/assign",
        {
          telecaller_id: telecallerId,
          count: assignCount,
        },
      );
      setMsg(`${res.claimed}/${res.requested} leads assign ho gayi`);
      await loadCatalogues();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Assign fail");
    } finally {
      setBusy(null);
    }
  }

  async function doSweep() {
    setBusy("sweep");
    setMsg(null);
    try {
      const res = await callAdminApi<{ returnedToPool: number; expired: number }>(
        "/api/admin/leads/sweep",
      );
      setMsg(`Sweep: ${res.returnedToPool} wapas pool mein, ${res.expired} expire`);
      await loadCatalogues();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Sweep fail");
    } finally {
      setBusy(null);
    }
  }

  function agentName(id: string | null): string {
    if (!id) return "—";
    return agents.find((a) => a.id === id)?.full_name ?? id.slice(0, 8);
  }

  function telecallerName(id: string | null): string {
    if (!id) return "—";
    return staffDirectory.find((t) => t.id === id)?.full_name ?? id.slice(0, 8);
  }

  function assignedByName(id: string | null): string {
    if (!id) return "—";
    return staffDirectory.find((t) => t.id === id)?.full_name ?? id.slice(0, 8);
  }

  function formatAssignedWhen(l: LeadRow): string {
    if (l.assigned_at) {
      return new Date(l.assigned_at).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return l.assigned_on ?? "—";
  }

  function hospitalName(id: string | null): string {
    if (!id) return "—";
    return hospitals.find((h) => h.id === id)?.name ?? id.slice(0, 8);
  }

  function daysSince(iso: string): number {
    return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-700" />
            Leads Pipeline
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Field agents ke numbers — upload, dedupe, aur roz ka assignment.
          </p>
        </div>
        <Button onClick={loadCatalogues} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {msg && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-900 text-sm px-4 py-3">
          {msg}
        </div>
      )}

      {/* Upload */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5 space-y-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Upload className="w-4 h-4 text-amber-700" /> Upload (paste-a-list)
        </h2>
        <p className="text-xs text-slate-500">
          Ek line per lead: <code className="bg-slate-100 px-1 rounded">Naam, Phone, City</code>.
          Duplicate ya active-subscriber rows automatically mark hongi — chupke se insert nahi hogi.
        </p>
        {/* §4.3/§4.4: hospital drives the sourcing agent via allotment */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={hospitalId}
            onChange={(e) => setHospitalId(e.target.value)}
            className="h-9 rounded-md border border-slate-300 px-3 text-sm"
          >
            <option value="">Hospital — koi nahi</option>
            {hospitals
              .filter((h) => h.is_active)
              .map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                  {h.city ? ` (${h.city})` : ""}
                </option>
              ))}
          </select>
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="h-9 rounded-md border border-slate-300 px-3 text-sm"
          >
            <option value="">Source agent — auto from hospital</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name}
              </option>
            ))}
          </select>
        </div>
        {hospitalId && (
          <p className="text-xs text-emerald-700">
            Is hospital ka agent:{" "}
            <b>
              {hospitals.find((h) => h.id === hospitalId)?.currentAgent?.agentName ??
                "(koi nahi — pehle allot karein)"}
            </b>{" "}
            — manual override upar se possible hai.
          </p>
        )}
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={6}
          placeholder={"Ramesh Sharma, 9876543210, Jaipur\nSita Devi, 09876543211, Pune"}
          className="w-full rounded-md border border-slate-300 p-3 text-sm font-mono focus:border-amber-600 focus:outline-none"
        />
        <Button
          onClick={doUpload}
          disabled={busy !== null}
          className="gap-2 bg-amber-700 hover:bg-amber-800"
        >
          {busy === "upload" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          Upload &amp; Dedupe
        </Button>
        {result && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs max-h-48 overflow-auto">
            <b>{result.inserted} inserted</b>,{" "}
            {result.results.filter((r) => r.status === "duplicate").length} duplicates,{" "}
            {result.results.filter((r) => !r.ok).length} errors
            <ul className="mt-1.5 space-y-0.5">
              {result.results
                .filter((r) => !r.ok || r.status === "duplicate")
                .map((r) => (
                  <li key={r.index} className={r.ok ? "text-amber-700" : "text-red-700"}>
                    Row {r.index + 1}: {r.reason}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>

      {/* Assign */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5 space-y-3">
        <h2 className="text-base font-bold text-slate-900">Aaj ka assignment</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={telecallerId}
            onChange={(e) => setTelecallerId(e.target.value)}
            className="h-9 rounded-md border border-slate-300 px-3 text-sm"
          >
            {telecallers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name ?? t.id.slice(0, 8)}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={200}
            value={assignCount}
            onChange={(e) => setAssignCount(Number(e.target.value))}
            className="h-9 w-24 rounded-md border border-slate-300 px-3 text-sm"
          />
          <Button
            onClick={doAssign}
            disabled={busy !== null || !telecallerId}
            className="gap-2 bg-amber-700 hover:bg-amber-800"
          >
            {busy === "assign" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Assign
          </Button>
          <Button onClick={doSweep} disabled={busy !== null} variant="outline" size="sm">
            {busy === "sweep" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Rollover/Expiry sweep"
            )}
          </Button>
        </div>
      </section>

      {/* §4.4 — Hospitals & allotments */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5 space-y-3">
        <h2 className="text-base font-bold text-slate-900">Hospitals &amp; Allotments</h2>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_8rem_auto] gap-2">
          <input
            value={newHospitalName}
            onChange={(e) => setNewHospitalName(e.target.value)}
            placeholder="Naya hospital — naam"
            className="h-9 rounded-md border border-slate-300 px-3 text-sm"
          />
          <input
            value={newHospitalCity}
            onChange={(e) => setNewHospitalCity(e.target.value)}
            placeholder="City"
            className="h-9 rounded-md border border-slate-300 px-3 text-sm"
          />
          <Button
            onClick={async () => {
              if (newHospitalName.trim().length < 2) return;
              setBusy("hosp-create");
              try {
                await callAdminApi("/api/admin/hospitals/create", {
                  name: newHospitalName.trim(),
                  city: newHospitalCity.trim() || undefined,
                });
                setNewHospitalName("");
                setNewHospitalCity("");
                await loadCatalogues();
              } catch (err) {
                setMsg(err instanceof Error ? err.message : "Create fail");
              } finally {
                setBusy(null);
              }
            }}
            disabled={busy !== null || newHospitalName.trim().length < 2}
            variant="outline"
            size="sm"
          >
            {busy === "hosp-create" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add hospital"}
          </Button>
        </div>
        {!hospitals.length ? (
          <p className="text-xs text-slate-400">Abhi koi hospital nahi.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2">Hospital</th>
                <th className="pb-2">Current agent</th>
                <th className="pb-2">Since</th>
                <th className="pb-2">Re-allot to</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {hospitals.map((h) => (
                <tr key={h.id} className="border-t border-slate-100">
                  <td className="py-1.5">
                    {h.name}
                    {h.city ? <span className="text-slate-400"> · {h.city}</span> : null}
                    {!h.is_active && (
                      <span className="ml-1 text-[10px] text-red-600">inactive</span>
                    )}
                  </td>
                  <td className="py-1.5">
                    {h.currentAgent?.agentName ?? (
                      <span className="text-slate-400 italic">khali</span>
                    )}
                  </td>
                  <td className="py-1.5 text-xs">{h.currentAgent?.since ?? "—"}</td>
                  <td className="py-1.5">
                    <select
                      value={reallotAgent}
                      onChange={(e) => setReallotAgent(e.target.value)}
                      className="h-7 rounded border border-slate-300 px-1.5 text-xs"
                    >
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.full_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={
                        busy !== null || !reallotAgent || h.currentAgent?.agentId === reallotAgent
                      }
                      onClick={async () => {
                        setBusy(`reallot-${h.id}`);
                        try {
                          await callAdminApi("/api/admin/hospitals/reallot", {
                            hospital_id: h.id,
                            agent_id: reallotAgent,
                          });
                          await loadCatalogues();
                        } catch (err) {
                          setMsg(err instanceof Error ? err.message : "Reallot fail");
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {busy === `reallot-${h.id}` ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        "Allot / Re-allot"
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Recent leads */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
        <h2 className="text-base font-bold text-slate-900 mb-3">
          Recent leads ({leads?.length ?? 0})
        </h2>
        {!leads ? (
          <Skeleton className="h-24 w-full" />
        ) : leads.length === 0 ? (
          <p className="text-xs text-slate-400">Abhi koi lead nahi.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2">Name</th>
                <th className="pb-2">Phone</th>
                <th className="pb-2">City</th>
                <th className="pb-2">Hospital</th>
                <th className="pb-2">Source agent</th>
                <th className="pb-2">Telecaller</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Age (days)</th>
                <th className="pb-2">Assigned on</th>
                <th className="pb-2">Assigned by</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const age = daysSince(l.created_at);
                return (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="py-1.5">{l.full_name ?? "—"}</td>
                    <td className="py-1.5 font-mono text-xs">{l.phone}</td>
                    <td className="py-1.5">{l.city ?? "—"}</td>
                    <td className="py-1.5">{hospitalName(l.hospital_id)}</td>
                    <td className="py-1.5">{agentName(l.source_agent_id)}</td>
                    <td className="py-1.5">
                      {l.assigned_to ? (
                        telecallerName(l.assigned_to)
                      ) : (
                        <span className="text-slate-400 italic">unassigned</span>
                      )}
                    </td>
                    <td className="py-1.5 text-xs">{l.status}</td>
                    <td
                      className={`py-1.5 text-xs ${age >= 3 && l.status !== "converted" ? "text-red-600 font-semibold" : ""}`}
                    >
                      {age}
                    </td>
                    <td className="py-1.5 text-xs">{formatAssignedWhen(l)}</td>
                    <td className="py-1.5 text-xs">{assignedByName(l.assigned_by)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
