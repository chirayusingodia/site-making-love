import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callAdminApi } from "@/lib/admin-api";
import { DAILY_LEAD_TARGET } from "@/lib/telecaller-logic";
import { Info, Loader2, RefreshCw, Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  StatusPill,
  TableScroll,
  type Tone,
} from "@/components/admin/admin-ui";

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
  const [staffDirectory, setStaffDirectory] = useState<{ id: string; full_name: string | null }[]>(
    [],
  );
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
        supabase
          .from("profiles")
          .select("id,full_name")
          .in("role", ["telecaller", "admin", "owner"]),
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

  const inputCls =
    "h-9 w-full rounded-md border border-stone-300 bg-white px-3 text-sm focus:border-orange-500 focus:outline-none";
  const thCls = "font-medium px-3 py-2.5";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads pipeline"
        description="Field agents ke numbers — upload, dedupe, aur roz ka assignment."
        actions={
          <Button onClick={loadCatalogues} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        }
      />

      {msg && (
        <Notice tone="info" icon={Info}>
          <span className="break-words">{msg}</span>
        </Notice>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 sm:gap-6 items-start">
        {/* Upload */}
        <Panel
          title="Upload (paste-a-list)"
          description={
            <>
              Ek line per lead:{" "}
              <code className="rounded bg-stone-100 px-1 font-mono text-stone-700">
                Naam, Phone, City
              </code>
              . Duplicate ya active-subscriber rows automatically mark hongi — chupke se insert nahi
              hogi.
            </>
          }
          className="xl:col-span-3"
          bodyClassName="space-y-3"
        >
          {/* §4.3/§4.4: hospital drives the sourcing agent via allotment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-stone-500">Hospital</span>
              <select
                value={hospitalId}
                onChange={(e) => setHospitalId(e.target.value)}
                className={inputCls}
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
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-stone-500">Source agent</span>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className={inputCls}
              >
                <option value="">Source agent — auto from hospital</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {hospitalId && (
            <p className="text-xs text-stone-600">
              Is hospital ka agent:{" "}
              <span className="font-medium text-stone-900">
                {hospitals.find((h) => h.id === hospitalId)?.currentAgent?.agentName ??
                  "(koi nahi — pehle allot karein)"}
              </span>{" "}
              — manual override upar se possible hai.
            </p>
          )}
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder={"Ramesh Sharma, 9876543210, Jaipur\nSita Devi, 09876543211, Pune"}
            className="w-full rounded-md border border-stone-300 bg-white p-3 text-sm font-mono focus:border-orange-500 focus:outline-none"
          />
          <Button
            onClick={doUpload}
            disabled={busy !== null}
            className="w-full sm:w-auto gap-2 bg-orange-600 hover:bg-orange-700 text-white"
          >
            {busy === "upload" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Upload &amp; Dedupe
          </Button>
          {result && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-700 max-h-48 overflow-auto">
              <span className="font-semibold text-stone-900">{result.inserted} inserted</span>,{" "}
              {result.results.filter((r) => r.status === "duplicate").length} duplicates,{" "}
              {result.results.filter((r) => !r.ok).length} errors
              <ul className="mt-1.5 space-y-0.5">
                {result.results
                  .filter((r) => !r.ok || r.status === "duplicate")
                  .map((r) => (
                    <li
                      key={r.index}
                      className={`break-words ${r.ok ? "text-amber-700" : "text-rose-700"}`}
                    >
                      Row {r.index + 1}: {r.reason}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </Panel>

        {/* Assign */}
        <Panel title="Aaj ka assignment" className="xl:col-span-2" bodyClassName="space-y-3">
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <label className="space-y-1 min-w-0">
              <span className="text-xs font-medium text-stone-500">Telecaller</span>
              <select
                value={telecallerId}
                onChange={(e) => setTelecallerId(e.target.value)}
                className={inputCls}
              >
                {telecallers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name ?? t.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-stone-500">Count</span>
              <input
                type="number"
                min={1}
                max={200}
                value={assignCount}
                onChange={(e) => setAssignCount(Number(e.target.value))}
                className={inputCls}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={doAssign}
              disabled={busy !== null || !telecallerId}
              className="gap-2 bg-orange-600 hover:bg-orange-700 text-white"
            >
              {busy === "assign" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Assign
            </Button>
            <Button onClick={doSweep} disabled={busy !== null} variant="outline">
              {busy === "sweep" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Rollover/Expiry sweep"
              )}
            </Button>
          </div>
        </Panel>
      </div>

      {/* §4.4 — Hospitals & allotments */}
      <Panel title="Hospitals & allotments" flush>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_10rem_auto] gap-2 p-4 sm:px-5 border-b border-stone-100">
          <input
            value={newHospitalName}
            onChange={(e) => setNewHospitalName(e.target.value)}
            placeholder="Naya hospital — naam"
            className={inputCls}
          />
          <input
            value={newHospitalCity}
            onChange={(e) => setNewHospitalCity(e.target.value)}
            placeholder="City"
            className={inputCls}
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
            className="h-9"
          >
            {busy === "hosp-create" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add hospital"}
          </Button>
        </div>
        {!hospitals.length ? (
          <EmptyState title="Abhi koi hospital nahi." className="py-8" />
        ) : (
          <TableScroll>
            <table className="w-full text-sm admin-table-fixed min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-stone-500 border-b border-stone-100">
                  <th className="font-medium pl-4 sm:pl-5 pr-3 py-2.5">Hospital</th>
                  <th className={thCls}>Current agent</th>
                  <th className={thCls}>Since</th>
                  <th className={thCls}>Re-allot to</th>
                  <th className="pr-4 sm:pr-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-700">
                {hospitals.map((h) => (
                  <tr key={h.id}>
                    <td className="pl-4 sm:pl-5 pr-3 py-2.5">
                      <span className="font-medium text-stone-900">{h.name}</span>
                      {h.city ? <span className="text-stone-500"> · {h.city}</span> : null}
                      {!h.is_active && (
                        <span className="ml-1.5">
                          <StatusPill tone="bad">inactive</StatusPill>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {h.currentAgent?.agentName ?? (
                        <span className="text-stone-400 italic">khali</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-stone-500 whitespace-nowrap">
                      {h.currentAgent?.since ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={reallotAgent}
                        onChange={(e) => setReallotAgent(e.target.value)}
                        className="h-9 md:h-8 w-full max-w-[12rem] rounded-md border border-stone-300 bg-white px-2 text-xs focus:border-orange-500 focus:outline-none"
                      >
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.full_name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="pr-4 sm:pr-5 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 md:h-8 text-xs"
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
          </TableScroll>
        )}
      </Panel>

      {/* Recent leads */}
      <Panel title={`Recent leads (${leads?.length ?? 0})`} flush>
        {!leads ? (
          <div className="p-4 sm:p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : leads.length === 0 ? (
          <EmptyState title="Abhi koi lead nahi." className="py-8" />
        ) : (
          <TableScroll>
            <table className="w-full text-sm admin-table-fixed min-w-[900px]">
              <thead>
                <tr className="text-left text-xs text-stone-500 border-b border-stone-100 whitespace-nowrap">
                  <th className="font-medium pl-4 sm:pl-5 pr-3 py-2.5">Name</th>
                  <th className={thCls}>Phone</th>
                  <th className={thCls}>City</th>
                  <th className={thCls}>Hospital</th>
                  <th className={thCls}>Source agent</th>
                  <th className={thCls}>Telecaller</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Age (days)</th>
                  <th className={thCls}>Assigned on</th>
                  <th className="font-medium pl-3 pr-4 sm:pr-5 py-2.5">Assigned by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-700">
                {leads.map((l) => {
                  const age = daysSince(l.created_at);
                  return (
                    <tr key={l.id}>
                      <td className="pl-4 sm:pl-5 pr-3 py-2.5 font-medium text-stone-900">
                        {l.full_name ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{l.phone}</td>
                      <td className="px-3 py-2.5">{l.city ?? "—"}</td>
                      <td className="px-3 py-2.5">{hospitalName(l.hospital_id)}</td>
                      <td className="px-3 py-2.5">{agentName(l.source_agent_id)}</td>
                      <td className="px-3 py-2.5">
                        {l.assigned_to ? (
                          telecallerName(l.assigned_to)
                        ) : (
                          <span className="text-stone-400 italic">unassigned</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill tone={leadStatusTone(l.status)}>{l.status}</StatusPill>
                      </td>
                      <td
                        className={`px-3 py-2.5 text-xs tabular-nums ${age >= 3 && l.status !== "converted" ? "text-rose-600 font-semibold" : ""}`}
                      >
                        {age}
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        {formatAssignedWhen(l)}
                      </td>
                      <td className="pl-3 pr-4 sm:pr-5 py-2.5 text-xs">
                        {assignedByName(l.assigned_by)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>
    </div>
  );
}

/** Presentation-only colour for a lead status pill. */
function leadStatusTone(status: string): Tone {
  switch (status) {
    case "converted":
      return "good";
    case "assigned":
    case "in_progress":
    case "link_sent":
      return "info";
    case "expired":
    case "wrong_number":
      return "bad";
    case "duplicate":
    case "unreachable":
    case "not_interested":
      return "warn";
    default:
      return "neutral";
  }
}
