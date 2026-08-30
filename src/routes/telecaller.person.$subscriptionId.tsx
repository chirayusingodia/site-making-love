import { createFileRoute, redirect, useBlocker, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Copy,
  History,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Users,
} from "lucide-react";
import { callAdminApi } from "@/lib/admin-api";
import {
  isTelecallerQueueKey,
  OUTCOME_LABELS,
  QUEUE_META,
  type CallOutcome,
  type TelecallerQueueRow,
} from "@/lib/telecaller-logic";
import { ALLOWED_LANGUAGES } from "@/lib/family-validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/telecaller/person/$subscriptionId")({
  validateSearch: (search: Record<string, unknown>): { queue?: string } => ({
    queue: typeof search.queue === "string" ? search.queue : undefined,
  }),
  beforeLoad: async ({ params }) => {
    // Layer-2 guard: bare garbage ids never mount.
    if (!/^(lead-)?[0-9a-f-]{36}$/i.test(params.subscriptionId)) {
      throw redirect({ to: "/telecaller/queues" });
    }
  },
  component: PersonCallCardPage,
});

// ─── Payload shapes (mirror /api/telecaller/person) ──────────

interface FamilyMemberFull {
  id: string;
  subscription_id: string;
  full_name: string | null;
  gotra: string | null;
  relation: string | null;
  slot_number: number;
  dob: string | null;
}

interface CallLogRow {
  id: string;
  subscription_id: string | null;
  profile_id: string | null;
  called_by: string;
  queue: string | null;
  outcome: string;
  notes: string | null;
  callback_at: string | null;
  identity_verified: boolean;
  escalated: boolean;
  created_at: string;
}

interface SubscriptionLite {
  id: string;
  status: string;
  start_date: string | null;
  next_billing_date: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  plan_name: string | null;
  plan_billing_period: string | null;
}

interface CardPayload {
  row: TelecallerQueueRow;
  banner: string;
  familyMembers: FamilyMemberFull[];
  latestPayment: {
    status: string;
    method: string | null;
    paid_at: string | null;
    failure_reason: string | null;
  } | null;
  planAddons: string[];
  planSevaNames: string[];
  proofsThisMonth:
    | {
        batchType: string;
        batchDate: string;
        commonDelivered: boolean;
        segmentDelivered: boolean;
      }[]
    | null;
  callHistory: CallLogRow[];
  subscriptions: SubscriptionLite[];
  nextInQueue: string | null;
}

interface PlanOption {
  slug: string;
  name: string;
  billing_period: string;
  price_paise: number;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  pending: { label: "Pending", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  paused: { label: "Paused", cls: "bg-violet-50 text-violet-800 border-violet-200" },
  halted: { label: "Halted", cls: "bg-red-50 text-red-800 border-red-200" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

/** Prices are PUBLIC (§1 #2) — she quotes them like /plans does. */
function fmtPrice(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

const SLOT_ROWS = [1, 2, 3, 4];

function PersonCallCardPage() {
  const { subscriptionId: rawId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const isLead = rawId.startsWith("lead-");
  const subscriptionId = isLead ? undefined : rawId;
  const profileId = isLead ? rawId.slice(5) : undefined;

  const [card, setCard] = useState<CardPayload | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      setCard(
        await callAdminApi<CardPayload>("/api/telecaller/person", {
          ...(subscriptionId ? { subscription_id: subscriptionId } : {}),
          ...(profileId ? { profile_id: profileId } : {}),
          ...(search.queue && isTelecallerQueueKey(search.queue) ? { queue: search.queue } : {}),
        }),
      );
    } catch (err) {
      setLoadErr(err instanceof Error ? err.message : "Card load nahi hua");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawId, search.queue]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (loadErr || !card) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
        {loadErr ?? "Person nahi mila"}
      </div>
    );
  }

  return (
    <PersonCard
      card={card}
      queue={search.queue}
      onSaved={load}
      onNext={(next) =>
        next
          ? navigate({
              to: "/telecaller/person/$subscriptionId",
              params: { subscriptionId: next },
              search: { queue: search.queue },
              replace: true,
            })
          : navigate({
              to: "/telecaller/queue/$queueKey",
              params: { queueKey: search.queue ?? "sankalp_pending" },
              replace: true,
            })
      }
    />
  );
}

// ─── The card itself ─────────────────────────────────────────

interface SlotRow {
  slot_number: number;
  full_name: string;
  gotra: string;
  relation: string;
}

function PersonCard({
  card,
  queue,
  onSaved,
  onNext,
}: {
  card: CardPayload;
  queue?: string;
  onSaved: () => void;
  onNext: (nextSubscriptionId: string | null) => void;
}) {
  const row = card.row;
  const meta = queue && isTelecallerQueueKey(queue) ? QUEUE_META[queue] : null;
  const badge = (row.subscriptionStatus && STATUS_BADGE[row.subscriptionStatus]) ?? null;

  // §5.1 identity gate — two of name/plan/city/last-4 confirmed.
  const [identityVerified, setIdentityVerified] = useState(false);

  // Family form state.
  const [slots, setSlots] = useState<SlotRow[]>(() =>
    SLOT_ROWS.map((n) => {
      const existing = card.familyMembers.find((m) => m.slot_number === n);
      return {
        slot_number: n,
        full_name: existing?.full_name ?? "",
        gotra: existing?.gotra ?? "",
        relation: existing?.relation ?? "",
      };
    }),
  );
  const [devanagari, setDevanagari] = useState(false);
  const [spellingConfirmed, setSpellingConfirmed] = useState(false);
  const [savingFamily, setSavingFamily] = useState(false);
  const [familyMsg, setFamilyMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Profile/address state.
  const initialAddr = useMemo(
    () => ({
      full_name: row.fullName ?? "",
      city: row.city ?? "",
      state: row.state ?? "",
      address_line1: row.addressLine1 ?? "",
      address_line2: row.addressLine2 ?? "",
      pincode: row.pincode ?? "",
    }),
    [row],
  );
  const [addr, setAddr] = useState(initialAddr);
  const [lang, setLang] = useState(row.preferredLanguage ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Payment-link panel. §2 (Hospitals session): NO coupon field —
  // attribution is the link token, never a discount code.
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [planSel, setPlanSel] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkResult, setLinkResult] = useState<{
    shareLink: string;
    waLink: string;
    planName: string;
  } | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);

  // §7.7 proof re-send request.
  const [proofReqBusy, setProofReqBusy] = useState(false);
  const [proofReqMsg, setProofReqMsg] = useState<string | null>(null);

  useEffect(() => {
    callAdminApi<{ plans: PlanOption[] }>("/api/telecaller/plans")
      .then((r) => setPlans(r.plans))
      .catch(() => setPlans([]));
  }, []);

  // Log-call bar.
  const [outcome, setOutcome] = useState<CallOutcome | "">("");
  const [notes, setNotes] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [escalate, setEscalate] = useState(false);
  const [logging, setLogging] = useState(false);
  const [logErr, setLogErr] = useState<string | null>(null);

  const touchedAny =
    identityVerified ||
    spellingConfirmed ||
    slots.some((s) => s.full_name.trim()) ||
    JSON.stringify(addr) !== JSON.stringify(initialAddr) ||
    lang !== (row.preferredLanguage ?? "") ||
    outcome !== "" ||
    notes.trim() !== "";

  // An unlogged call is an invisible call — block both tab close
  // and in-app navigation until she logs it or clears everything.
  useEffect(() => {
    if (!touchedAny) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [touchedAny]);

  useBlocker({
    shouldBlockFn: () => {
      // [Pass-2 F17] the old `outcome === ""` short-circuit let in-app
      // navigation silently discard typed notes/family/address edits
      // whenever no outcome was picked — the opposite of the promise
      // in the comment above. Only a completely untouched form passes.
      if (!touchedAny) return false;
      return !window.confirm("Call log kiye bina page chhod rahe hain? Log zaroori hai.");
    },
  });

  const needsAddress =
    (row.hasPrasadAddon && !(row.pincode ?? "").trim()) || queue === "missing_prasad_address";

  async function saveFamily() {
    if (!row.subscriptionId) return;
    const filled = slots.filter((s) => s.full_name.trim().length > 0);
    if (filled.length === 0) {
      setFamilyMsg({ ok: false, text: "Kam se kam ek naam likhein" });
      return;
    }
    if (!spellingConfirmed) {
      setFamilyMsg({ ok: false, text: "Pehle spelling padh kar confirm karein" });
      return;
    }
    setSavingFamily(true);
    setFamilyMsg(null);
    try {
      await callAdminApi("/api/telecaller/family-members", {
        subscription_id: row.subscriptionId,
        members: filled,
      });
      setFamilyMsg({ ok: true, text: `${filled.length} naam save ho gaye ✅` });
      setSpellingConfirmed(false);
      onSaved();
    } catch (err) {
      setFamilyMsg({ ok: false, text: err instanceof Error ? err.message : "Save fail" });
    } finally {
      setSavingFamily(false);
    }
  }

  async function saveProfile() {
    const patch: Record<string, unknown> = { profile_id: row.profileId };
    if (addr.full_name.trim() && addr.full_name.trim() !== (row.fullName ?? "")) {
      patch.full_name = addr.full_name.trim();
    }
    for (const key of ["city", "state", "address_line1", "address_line2", "pincode"] as const) {
      if (addr[key] !== initialAddr[key]) patch[key] = addr[key];
    }
    if (lang !== (row.preferredLanguage ?? "")) patch.preferred_language = lang || null;
    if (Object.keys(patch).length === 1) {
      setProfileMsg({ ok: false, text: "Kuch badla nahi gaya" });
      return;
    }
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      await callAdminApi("/api/telecaller/profile", patch);
      setProfileMsg({ ok: true, text: "Profile update ho gaya ✅" });
      onSaved();
    } catch (err) {
      setProfileMsg({ ok: false, text: err instanceof Error ? err.message : "Save fail" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function sendPaymentLink() {
    setLinkBusy(true);
    setLinkErr(null);
    setLinkResult(null);
    try {
      const res = await callAdminApi<{
        shareLink: string;
        waLink: string;
        planName: string;
      }>("/api/telecaller/send-payment-link", {
        profile_id: row.profileId,
        // Halted subscription: key the tray check + reissue to THIS
        // dead subscription, not just the profile.
        ...(row.subscriptionStatus === "halted" && row.subscriptionId
          ? { subscription_id: row.subscriptionId }
          : {}),
        plan_id_or_slug: planSel,
      });
      setLinkResult(res);
    } catch (err) {
      setLinkErr(err instanceof Error ? err.message : "Link ban nahi paya");
    } finally {
      setLinkBusy(false);
    }
  }

  async function logThisCall() {
    if (!outcome) {
      setLogErr("Outcome chunein");
      return;
    }
    // [Pass-2 F6] validate the callback time BEFORE request
    // construction — an untouched datetime-local used to explode inside
    // new Date("").toISOString() (RangeError) and surface as a cryptic
    // "Invalid time value" instead of a usable instruction.
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
        ...(row.subscriptionId ? { subscription_id: row.subscriptionId } : {}),
        profile_id: row.profileId,
        queue: queue ?? null,
        outcome,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(outcome === "callback_requested"
          ? { callback_at: new Date(callbackAt).toISOString() }
          : {}),
        identity_verified: identityVerified,
        escalate,
      });
      onNext(card.nextInQueue);
    } catch (err) {
      setLogErr(err instanceof Error ? err.message : "Log fail");
      setLogging(false);
    }
  }

  const inputBase =
    "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none";

  return (
    <div className="pb-40">
      {/* ── Top: who + dial ───────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{row.fullName ?? "(naam nahi)"}</h1>
              {badge && (
                <span
                  className={`text-[11px] px-2 py-0.5 rounded border font-semibold ${badge.cls}`}
                >
                  {badge.label}
                </span>
              )}
              {row.preferredLanguage && (
                <span className="text-[11px] px-2 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-800 font-semibold uppercase">
                  {row.preferredLanguage}
                </span>
              )}
              {row.doNotCall && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold">
                  DND
                </span>
              )}
            </div>
            <div className="text-sm text-slate-600 mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {row.altPhone && (
                <span className="font-semibold text-emerald-700">{row.altPhone} (Call)</span>
              )}
              {row.phone && (
                <span>
                  {row.phone}
                  {row.altPhone && " (WhatsApp)"}
                </span>
              )}
              {row.planName && (
                <span>
                  {row.planName}
                  {row.planBillingPeriod ? ` · ${row.planBillingPeriod}` : ""}
                </span>
              )}
              <span>
                {card.callHistory.length} calls
                {row.lastCalledAt ? ` · last ${row.lastCalledAt.slice(0, 10)}` : " · kabhi nahi"}
              </span>
              {row.latestPaymentStatus && (
                <span
                  className={
                    row.latestPaymentStatus === "failed"
                      ? "font-semibold text-red-700"
                      : "text-slate-500"
                  }
                >
                  payment: {row.latestPaymentStatus}
                </span>
              )}
            </div>
          </div>
          {row.altPhone || row.phone ? (
            <a
              href={`tel:${row.altPhone || row.phone}`}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-semibold px-6 py-3.5 shadow-sm transition-colors"
            >
              <Phone className="w-5 h-5" /> Call karein
            </a>
          ) : (
            <span className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Phone missing — owner ko bataayein
            </span>
          )}
        </div>

        {/* Why you're calling — she opens her mouth already informed. */}
        {(meta || card.banner) && (
          <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 text-indigo-900 text-sm px-4 py-3">
            <span className="font-semibold">{meta ? `Kyun call: ${meta.title} — ` : ""}</span>
            {card.banner}
          </div>
        )}

        {row.doNotCall && (
          <div className="mt-3 rounded-xl border border-red-300 bg-red-50 text-red-800 text-sm px-4 py-3 flex items-center gap-2">
            <Ban className="w-4 h-4 flex-none" />
            Yeh number DND par hai — sirf escalation ke liye, queue mein dobara nahi aayega.
          </div>
        )}
      </div>

      {/* ── Identity gate (§5.1) ──────────────────────────────── */}
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
              Customer se kam se kam DO confirm karein: poora naam / plan ka naam / sheher / phone
              ke aakhri 4 anke. Iske bina edit forms band rahenge.
            </span>
          </span>
        </label>
      </div>

      {/* ── Family members (§5.2) ─────────────────────────────── */}
      {row.subscriptionId && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-700" />
            Parivaar ke naam ({card.familyMembers.length}/4)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Yeh naam Pandit ji ki list mein jaayenge — spelling par vishes dhyaan dein.
          </p>

          {!identityVerified ? (
            <p className="mt-3 text-xs text-slate-400 italic">Pehle upar identity verify karein.</p>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={devanagari}
                  onChange={(e) => setDevanagari(e.target.checked)}
                  className="accent-indigo-700"
                />
                देवनागरी में naam likhein
              </label>
              {slots.map((s, i) => (
                <div
                  key={s.slot_number}
                  className="grid grid-cols-1 md:grid-cols-[3rem_1fr_1fr_1fr] gap-2 items-center"
                >
                  <span className="text-xs font-mono text-slate-400">{i + 1}.</span>
                  <Input
                    value={s.full_name}
                    onChange={(e) =>
                      setSlots((prev) =>
                        prev.map((p) =>
                          p.slot_number === s.slot_number ? { ...p, full_name: e.target.value } : p,
                        ),
                      )
                    }
                    placeholder={devanagari ? "पूरा नाम" : "Poora naam"}
                    lang={devanagari ? "hi" : "en"}
                    className={devanagari ? "font-serif text-base" : ""}
                  />
                  <Input
                    value={s.gotra}
                    onChange={(e) =>
                      setSlots((prev) =>
                        prev.map((p) =>
                          p.slot_number === s.slot_number ? { ...p, gotra: e.target.value } : p,
                        ),
                      )
                    }
                    placeholder="Gotra (jaise Kashyap)"
                  />
                  <Input
                    value={s.relation}
                    onChange={(e) =>
                      setSlots((prev) =>
                        prev.map((p) =>
                          p.slot_number === s.slot_number ? { ...p, relation: e.target.value } : p,
                        ),
                      )
                    }
                    placeholder="Rishta (swayam/pita/...)..."
                  />
                </div>
              ))}

              {/* Spelling read-back step — the name is read aloud by the Pandit. */}
              {slots.some((s) => s.full_name.trim()) && (
                <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 cursor-pointer">
                  <Checkbox
                    checked={spellingConfirmed}
                    onCheckedChange={(v) => setSpellingConfirmed(v === true)}
                    className="mt-0.5"
                  />
                  Maine har naam customer ko <b>wapas padh kar</b> suna diya aur spelling confirm
                  kar li hai
                </label>
              )}

              <div className="flex items-center gap-3">
                <Button
                  onClick={saveFamily}
                  disabled={savingFamily || !spellingConfirmed}
                  size="sm"
                  className="bg-indigo-700 hover:bg-indigo-800"
                >
                  {savingFamily && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                  Naam save karein
                </Button>
                {familyMsg && (
                  <span className={`text-xs ${familyMsg.ok ? "text-emerald-700" : "text-red-700"}`}>
                    {familyMsg.text}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Profile + address (§5.3) ──────────────────────────── */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-indigo-700" />
          Address &amp; details
          {needsAddress && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700">
              Prasad ke liye zaroori
            </span>
          )}
        </h2>
        {!identityVerified ? (
          <p className="mt-3 text-xs text-slate-400 italic">Pehle identity verify karein.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Poora naam</Label>
              <Input
                value={addr.full_name}
                onChange={(e) => setAddr({ ...addr, full_name: e.target.value })}
                className={`${inputBase} mt-1`}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Pasand ki bhasha</Label>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className={`${inputBase} mt-1`}
              >
                <option value="">— chunein —</option>
                {ALLOWED_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Sheher</Label>
              <Input
                value={addr.city}
                onChange={(e) => setAddr({ ...addr, city: e.target.value })}
                className={`${inputBase} mt-1`}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">State</Label>
              <Input
                value={addr.state}
                onChange={(e) => setAddr({ ...addr, state: e.target.value })}
                className={`${inputBase} mt-1`}
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs text-slate-500">Address line 1 (ghar/gali)</Label>
              <Input
                value={addr.address_line1}
                onChange={(e) => setAddr({ ...addr, address_line1: e.target.value })}
                className={`${inputBase} mt-1`}
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs text-slate-500">Address line 2 (landmark)</Label>
              <Input
                value={addr.address_line2}
                onChange={(e) => setAddr({ ...addr, address_line2: e.target.value })}
                className={`${inputBase} mt-1`}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Pincode (6 anke)</Label>
              <Input
                value={addr.pincode}
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setAddr({ ...addr, pincode: e.target.value.replace(/\D/g, "") })}
                className={`${inputBase} mt-1`}
              />
            </div>
            <div className="flex items-end gap-3">
              <Button
                onClick={saveProfile}
                disabled={savingProfile}
                size="sm"
                variant="outline"
                className="border-indigo-300 text-indigo-800 hover:bg-indigo-50"
              >
                {savingProfile && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Profile save karein
              </Button>
              {profileMsg && (
                <span className={`text-xs ${profileMsg.ok ? "text-emerald-700" : "text-red-700"}`}>
                  {profileMsg.text}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Sevas included + proof status (§4 visible set). */}
        {card.planSevaNames.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-500 mb-1.5">Plan ki sevayen</div>
            <div className="flex flex-wrap gap-1.5">
              {card.planSevaNames.map((n) => (
                <span
                  key={n}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800"
                >
                  {n}
                </span>
              ))}
            </div>
            {card.proofsThisMonth && card.proofsThisMonth.length > 0 && (
              <div className="mt-2 text-[11px] text-slate-500">
                Is maah proof:{" "}
                {card.proofsThisMonth.map((p) => (
                  <span
                    key={`${p.batchType}-${p.batchDate}`}
                    className="mr-3 inline-flex items-center gap-1"
                  >
                    {p.batchType === "second_tuesday" ? "2nd Tue" : "Last Sat"} {p.batchDate}
                    {p.commonDelivered ? " ✅ common" : " ⏳ common"}
                    {p.segmentDelivered ? " ✅ video" : " ⏳ video"}
                  </span>
                ))}
              </div>
            )}
            {/* §7.7 proof re-send request — she can't upload, but the
                complaint must have somewhere to go. */}
            {row.subscriptionId &&
              card.proofsThisMonth?.some((p) => !p.commonDelivered || !p.segmentDelivered) && (
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-50"
                    disabled={proofReqBusy}
                    onClick={async () => {
                      setProofReqBusy(true);
                      setProofReqMsg(null);
                      try {
                        await callAdminApi("/api/telecaller/proof-resend", {
                          subscription_id: row.subscriptionId,
                        });
                        setProofReqMsg("Admin ko bata diya — proof dobara bheja jayega");
                      } catch (err) {
                        setProofReqMsg(err instanceof Error ? err.message : "Request fail");
                      } finally {
                        setProofReqBusy(false);
                      }
                    }}
                  >
                    Proof nahi mila? Admin se request karein
                  </Button>
                  {proofReqMsg && <span className="text-[11px] text-slate-600">{proofReqMsg}</span>}
                </div>
              )}
          </div>
        )}
      </div>

      {/* ── Payment link (§5.5 — she never touches money) ─────── */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
        <h2 className="text-base font-bold text-slate-900">Payment link bhejein</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Aap paisa NAHI leti — link jaata hai, customer khud Razorpay par pay karta hai. Rate
          poochein to public plans page dikhayein.
        </p>
        {row.subscriptionStatus === "halted" && row.subscriptionId && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <b>Yeh subscription Razorpay par HALTED hai</b> — purana autopay band ho gaya (retries
            fail hue). Resume sirf admin ke paas hai; aap NAYA plan chunein aur fresh link bhejein —
            customer naya mandate set karega.
          </div>
        )}
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          🚨 <b>OTP KABHI na maangein</b> — na customer se, na kahin type karein. Yeh panel mein OTP
          ka koi field hai hi nahi. "Code bol dijiye" ka matlab fraud hai — turant Chirayu ko
          batayein.
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_10rem_auto] gap-2">
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
            className="bg-indigo-700 hover:bg-indigo-800 h-9 sm:col-span-2"
          >
            {linkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Link banayein"}
          </Button>
        </div>
        {linkErr && <div className="mt-2 text-xs text-red-700">{linkErr}</div>}
        {linkResult && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-2">
            <div className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {linkResult.planName} ka link taiyaar hai
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
      </div>

      {/* ── Call history ──────────────────────────────────────── */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-700" />
          Pichhle calls ({card.callHistory.length})
        </h2>
        {card.callHistory.length === 0 ? (
          <p className="text-xs text-slate-400 mt-2">Abhi koi call nahi hui.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {card.callHistory.map((l) => (
              <li key={l.id} className="flex items-start gap-2 text-xs text-slate-600">
                <span className="font-mono text-[10px] text-slate-400 mt-0.5 flex-none">
                  {l.created_at.slice(0, 16).replace("T", " ")}
                </span>
                <span className="font-semibold text-slate-800 flex-none">
                  {OUTCOME_LABELS[l.outcome as CallOutcome] ?? l.outcome}
                  {l.escalated && <span className="text-red-600"> · escalated</span>}
                </span>
                {l.notes && <span className="italic truncate">— {l.notes}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Sticky bottom bar: log this call ──────────────────── */}
      <div className="sticky bottom-0 z-30 -mx-4 lg:-mx-8 mt-6 border-t border-indigo-900/10 bg-white/95 backdrop-blur px-4 lg:px-8 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="grid grid-cols-1 md:grid-cols-[14rem_10rem_1fr_auto] gap-2 items-end">
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
            onClick={logThisCall}
            disabled={logging || !outcome}
            className="bg-indigo-700 hover:bg-indigo-800 gap-2 h-9"
          >
            {logging ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>Log karein {card.nextInQueue && <ArrowRight className="w-4 h-4" />}</>
            )}
          </Button>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={escalate}
              onChange={(e) => setEscalate(e.target.checked)}
              className="accent-red-600"
            />
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Chirayu ko escalate karein (cancel/pause request ya shikayat)
          </label>
          {logErr && <span className="text-xs text-red-700">{logErr}</span>}
        </div>
      </div>
    </div>
  );
}
