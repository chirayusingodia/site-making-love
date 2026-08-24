import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  History,
  Loader2,
  MessageCircle,
  Phone,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { callAdminApi } from "@/lib/admin-api";
import { OUTCOME_LABELS, type CallOutcome } from "@/lib/telecaller-logic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/telecaller/lead/$leadId")({
  validateSearch: (search: Record<string, unknown>): { queue?: string } => ({
    queue: typeof search.queue === "string" ? search.queue : undefined,
  }),
  beforeLoad: async ({ params }) => {
    if (!/^[0-9a-f-]{36}$/i.test(params.leadId)) {
      throw redirect({ to: "/telecaller/queues" });
    }
  },
  component: LeadCallCardPage,
});

// The LEAD variant of the call card (§6.3). A lead may not be a
// customer yet — no sankalp form here; the flow is call → interest →
// payment link (carrying the attribution token) → log.

interface LeadPayload {
  lead: {
    leadId: string;
    fullName: string | null;
    phone: string;
    city: string | null;
    notes: string | null;
    status: string;
    profileId: string | null;
    subscriptionId: string | null;
    attributionToken: string | null;
    interestedPlanName: string | null;
    interestedPlanBillingPeriod: string | null;
  };
  callHistory: {
    id: string;
    outcome: string;
    notes: string | null;
    created_at: string;
  }[];
}

interface PlanOption {
  slug: string;
  name: string;
  billing_period: string;
  price_paise: number;
}

function fmtPrice(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

const STATUS_CLS: Record<string, string> = {
  new: "bg-slate-100 text-slate-600 border-slate-200",
  assigned: "bg-indigo-50 text-indigo-800 border-indigo-200",
  in_progress: "bg-amber-50 text-amber-800 border-amber-200",
  link_sent: "bg-sky-50 text-sky-800 border-sky-200",
  converted: "bg-emerald-50 text-emerald-800 border-emerald-200",
  not_interested: "bg-rose-50 text-rose-700 border-rose-200",
  unreachable: "bg-orange-50 text-orange-800 border-orange-200",
  wrong_number: "bg-red-50 text-red-700 border-red-200",
};

function LeadCallCardPage() {
  const { leadId } = Route.useParams();
  const search = Route.useSearch();

  const [data, setData] = useState<LeadPayload | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // §5.1 identity gate.
  const [identityVerified, setIdentityVerified] = useState(false);

  // Payment link panel. §2 (Hospitals session): NO coupon field.
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [planSel, setPlanSel] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkResult, setLinkResult] = useState<{
    shareLink: string;
    waLink: string;
    planName: string;
  } | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);

  // §5 (Hospitals session): verbal agent answer + free pooja toggle.
  const [agents, setAgents] = useState<{ id: string; full_name: string | null }[]>([]);
  const [namedAgentId, setNamedAgentId] = useState("");
  const [freePoojaGiven, setFreePoojaGiven] = useState(false);

  // Log-call bar.
  const [outcome, setOutcome] = useState<CallOutcome | "">("");
  const [notes, setNotes] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [logging, setLogging] = useState(false);
  const [logErr, setLogErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      setData(await callAdminApi<LeadPayload>("/api/telecaller/lead", { lead_id: leadId }));
    } catch (err) {
      setLoadErr(err instanceof Error ? err.message : "Lead card load nahi hui");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    callAdminApi<{ plans: PlanOption[] }>("/api/telecaller/plans")
      .then((r) => setPlans(r.plans))
      .catch(() => setPlans([]));
    // §5: roster for the "kaunse agent ne number diya?" question.
    callAdminApi<{ agents: { id: string; full_name: string | null }[] }>("/api/telecaller/agents")
      .then((r) => setAgents(r.agents))
      .catch(() => setAgents([]));
  }, []);

  async function setStatus(status: string) {
    try {
      await callAdminApi("/api/telecaller/lead/update", { lead_id: leadId, status });
      await load();
    } catch (err) {
      setLogErr(err instanceof Error ? err.message : "Status update fail");
    }
  }

  async function sendPaymentLink() {
    if (!data) return;
    setLinkBusy(true);
    setLinkErr(null);
    setLinkResult(null);
    try {
      const res = await callAdminApi<{ shareLink: string; waLink: string; planName: string }>(
        "/api/telecaller/send-payment-link",
        {
          lead_id: leadId,
          profile_id: data.lead.profileId ?? undefined,
          plan_id_or_slug: planSel,
          attribution_token: data.lead.attributionToken,
        },
      );
      setLinkResult(res);
      await setStatus("link_sent");
    } catch (err) {
      setLinkErr(err instanceof Error ? err.message : "Link ban nahi paya");
    } finally {
      setLinkBusy(false);
    }
  }

  async function logThisCall(advance: boolean) {
    if (!outcome) {
      setLogErr("Outcome chunein");
      return;
    }
    // [Pass-2 F6] validate before request construction (see person page).
    if (outcome === "callback_requested") {
      const parsed = new Date(callbackAt);
      if (!callbackAt || isNaN(parsed.getTime())) {
        setLogErr("Callback ki date/time sahi se chunein");
        return;
      }
      if (parsed.getTime() <= Date.now()) {
        setLogErr("Callback ka time future mein hona chahiye");
        return;
      }
    }
    setLogging(true);
    setLogErr(null);
    try {
      await callAdminApi("/api/telecaller/log-call", {
        lead_id: leadId,
        queue: search.queue ?? "aaj_ke_leads",
        outcome,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(outcome === "callback_requested"
          ? { callback_at: new Date(callbackAt).toISOString() }
          : {}),
        identity_verified: identityVerified,
        // §5 funnel events (idempotent server-side; first write wins).
        ...(freePoojaGiven ? { free_pooja_given: true } : {}),
        ...(namedAgentId ? { named_agent_id: namedAgentId } : {}),
      });
      if (advance) {
        navigateNext();
      } else {
        await load();
        setOutcome("");
        setNotes("");
        setFreePoojaGiven(false);
      }
    } catch (err) {
      setLogErr(err instanceof Error ? err.message : "Log fail");
    } finally {
      setLogging(false);
    }
  }

  function navigateNext() {
    // Queue 0 auto-advance happens through the queue list; the next
    // unworked lead is the top item she hasn't touched.
    window.location.href = "/telecaller/queue/aaj_ke_leads";
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (loadErr || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
        {loadErr ?? "Lead nahi mili"}
      </div>
    );
  }

  const lead = data.lead;
  const inputBase =
    "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none";

  return (
    <div className="pb-40">
      {/* Top */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{lead.fullName ?? "(naam nahi)"}</h1>
              <span
                className={`text-[11px] px-2 py-0.5 rounded border font-semibold ${
                  STATUS_CLS[lead.status] ?? STATUS_CLS.new
                }`}
              >
                {lead.status}
              </span>
              {lead.interestedPlanName && (
                <span className="text-[11px] px-2 py-0.5 rounded border border-teal-200 bg-teal-50 text-teal-800">
                  {lead.interestedPlanName}
                </span>
              )}
            </div>
            <div className="text-sm text-slate-600 mt-1 flex flex-wrap gap-x-3 gap-y-1">
              <span>{lead.phone}</span>
              {lead.city && <span>{lead.city}</span>}
              <span>{data.callHistory.length} calls</span>
            </div>
            {lead.notes && (
              <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-900 italic">
                Agent ki note: {lead.notes}
              </div>
            )}
          </div>
          <a
            href={`tel:${lead.phone}`}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-semibold px-6 py-3.5 shadow-sm transition-colors"
          >
            <Phone className="w-5 h-5" /> Call karein
          </a>
        </div>

        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 text-indigo-900 text-sm px-4 py-3">
          <span className="font-semibold">Kyun call:</span> Field agent ne yeh number diya hai —
          plan samjhayein, interested hue to payment link bhejein.
        </div>
      </div>

      {/* Identity gate */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox
            checked={identityVerified}
            onCheckedChange={(v) => setIdentityVerified(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm">
            <span className="font-semibold text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-700" />
              Identity verified — do cheezein confirm ki hain
            </span>
            <span className="text-xs text-slate-500 block mt-0.5">
              Poora naam / city / phone ke aakhri 4 anke mein se do confirm karein.
            </span>
          </span>
        </label>
      </div>

      {/* Payment link */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
        <h2 className="text-base font-bold text-slate-900">Payment link bhejein</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Link par aapka attribution token juda hota hai — sale aapko credit hogi (jab payment
          capture ho).
        </p>
        {!identityVerified && (
          <p className="mt-3 text-xs text-slate-400 italic">Pehle identity verify karein.</p>
        )}
        {identityVerified && (
          <>
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              🚨 <b>OTP KABHI na maangein</b> — customer khud login karke pay karega. "Code bol
              dijiye" sunte hi escalate karein.
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
              <select
                value={planSel}
                onChange={(e) => setPlanSel(e.target.value)}
                className={inputBase}
              >
                <option value="">Plan chunein…</option>
                {plans.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name} ({p.billing_period}) — {fmtPrice(p.price_paise)}
                  </option>
                ))}
              </select>
              <Button
                onClick={sendPaymentLink}
                disabled={!planSel || linkBusy}
                size="sm"
                className="bg-indigo-700 hover:bg-indigo-800 h-9"
              >
                {linkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Link banayein"}
              </Button>
            </div>
            {linkErr && <div className="mt-2 text-xs text-red-700">{linkErr}</div>}
            {linkResult && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-2">
                <div className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {linkResult.planName} ka link taiyaar — lead 'link_sent' ho gayi
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-[11px] bg-white border border-slate-200 rounded px-2 py-1 break-all max-w-full">
                    {linkResult.shareLink}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(linkResult.shareLink)}
                    className="gap-1 h-7 text-xs"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </Button>
                  {linkResult.waLink && (
                    <a href={linkResult.waLink} target="_blank" rel="noreferrer">
                      <Button
                        size="sm"
                        className="gap-1.5 h-7 text-xs bg-emerald-700 hover:bg-emerald-800"
                      >
                        <MessageCircle className="w-3 h-3" /> WhatsApp par bhejein
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            )}
            {/* Quick status actions */}
            <div className="mt-3 flex flex-wrap gap-2">
              {["not_interested", "unreachable", "wrong_number"].map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setStatus(s)}
                >
                  Mark: {s.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* History */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-700" />
          Pichhle calls ({data.callHistory.length})
        </h2>
        {data.callHistory.length === 0 ? (
          <p className="text-xs text-slate-400 mt-2">Abhi koi call nahi hui.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.callHistory.map((l) => (
              <li key={l.id} className="flex items-start gap-2 text-xs text-slate-600">
                <span className="font-mono text-[10px] text-slate-400 mt-0.5 flex-none">
                  {l.created_at.slice(0, 16).replace("T", " ")}
                </span>
                <span className="font-semibold text-slate-800">
                  {OUTCOME_LABELS[l.outcome as CallOutcome] ?? l.outcome}
                </span>
                {l.notes && <span className="italic truncate">— {l.notes}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sticky log bar */}
      <div className="sticky bottom-0 z-30 -mx-4 lg:-mx-8 mt-6 border-t border-indigo-900/10 bg-white/95 backdrop-blur px-4 lg:px-8 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        {/* §5 funnel events — verbal agent answer + free pooja toggle */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end mb-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-slate-400">
              "Kaunse agent ne number diya tha?" (customer ka jawab)
            </Label>
            <select
              value={namedAgentId}
              onChange={(e) => setNamedAgentId(e.target.value)}
              className={`${inputBase} mt-0.5`}
            >
              <option value="">— bataya nahi / yaad nahi —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer h-9">
            <input
              type="checkbox"
              checked={freePoojaGiven}
              onChange={(e) => setFreePoojaGiven(e.target.checked)}
              className="accent-indigo-700"
            />
            🪔 Free pooja ho gayi
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[14rem_10rem_1fr_auto_auto] gap-2 items-end">
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-slate-400">Outcome</Label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as CallOutcome | "")}
              className={`${inputBase} mt-0.5`}
            >
              <option value="">— chunein —</option>
              {(Object.keys(OUTCOME_LABELS) as CallOutcome[]).map((o) => (
                <option key={o} value={o}>
                  {OUTCOME_LABELS[o]}
                </option>
              ))}
            </select>
          </div>
          {outcome === "callback_requested" && (
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-slate-400">Callback</Label>
              <input
                type="datetime-local"
                value={callbackAt}
                onChange={(e) => setCallbackAt(e.target.value)}
                className={`${inputBase} mt-0.5`}
              />
            </div>
          )}
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-slate-400">Notes</Label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Chhoti si baat bhi likhein…"
              className={`${inputBase} mt-0.5`}
            />
          </div>
          <Button
            onClick={() => logThisCall(true)}
            disabled={logging || !outcome}
            className="bg-indigo-700 hover:bg-indigo-800 gap-2 h-9"
          >
            {logging ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Log &amp; Next</>}
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button
            onClick={() => logThisCall(false)}
            disabled={logging || !outcome}
            variant="outline"
            className="h-9 text-xs"
          >
            Sirf log
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
          Lead convert tabhi hoti hai jab customer ka payment Razorpay par capture ho —
          status='active' webhook se hi aata hai.
        </div>
        {logErr && <div className="mt-1 text-xs text-red-700">{logErr}</div>}
      </div>
    </div>
  );
}
