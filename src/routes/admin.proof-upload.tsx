import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAllRows, supabase } from "@/lib/supabase";
import {
  assignSegmentsTierPure,
  batchLabel,
  buildCompletionUpdate,
  buildDeliveryMessage,
  buildWaLink,
  saturdayHawanSevaIds,
  sevasForMember,
  tierKeyForMember,
  SEGMENT_SIZE_SUBSCRIPTIONS,
  SEGMENT_MAX_NAMES,
  type BatchKind,
  type SankalpVariant,
  type SevaLite,
} from "@/lib/sankalp-logic";
import { callAdminApi, uploadToCloudinary } from "@/lib/cloudinary-upload";
import {
  CalendarPlus,
  CheckCircle2,
  Circle,
  ExternalLink,
  Flame,
  Hand,
  Loader2,
  MessageCircle,
  Printer,
  RefreshCw,
  Scissors,
  Upload,
  Users,
  Video,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/proof-upload")({
  component: ProofUploadPage,
});

// ─── Row types ────────────────────────────────────────────────
interface BatchRow {
  id: string;
  batch_type: BatchKind;
  batch_date: string;
  sankalp_variant: SankalpVariant;
  status: "pending" | "done" | "missed";
  completed_at: string | null;
  subscriber_count: number;
}
interface SbsRow {
  id: string;
  subscription_id: string;
  is_catchup: boolean;
  segment_number: number | null;
}
interface SubRow {
  id: string;
  plan_id: string;
  user_id: string;
  start_date: string | null;
  created_at: string;
}
interface PlanRow {
  id: string;
  name: string;
}
interface ProfileRow {
  id: string;
  full_name: string;
  phone: string;
}
interface SegmentRow {
  id: string;
  segment_number: number;
  video_url: string;
}
interface DeliveryRow {
  id: string;
  subscription_id: string;
  message_kind: "segment";
  segment_number: number | null;
  wa_link: string | null;
  is_delivered: boolean;
  delivered_at: string | null;
}

// ─── Status badge — Done / Pending / Missed ONLY ─────────────
function StatusBadge({ status }: { status: BatchRow["status"] }) {
  const map = {
    done: "bg-emerald-50 text-emerald-800 border-emerald-300",
    pending: "bg-amber-50 text-amber-900 border-amber-300",
    missed: "bg-rose-50 text-rose-800 border-rose-300",
  } as const;
  const label = { done: "Done", pending: "Pending", missed: "Missed" } as const;
  return (
    <Badge variant="outline" className={`${map[status]} text-[10px] font-bold uppercase`}>
      {label[status]}
    </Badge>
  );
}

// ─── Page ─────────────────────────────────────────────────────
function ProofUploadPage() {
  const [sevas, setSevas] = useState<SevaLite[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [planSevas, setPlanSevas] = useState<{ plan_id: string; seva_id: string }[]>([]);
  const [hawanIds, setHawanIds] = useState<string[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatic = useCallback(async () => {
    const [sevasRes, plansRes, psRes, rulesRes] = await Promise.all([
      supabase.from("sevas").select("id,name,slug,sort_order,is_active").order("sort_order"),
      supabase.from("plans").select("id,name").order("sort_order"),
      supabase.from("plan_sevas").select("plan_id,seva_id"),
      supabase.from("seva_schedule_rules").select("seva_id,weekday,occurrence"),
    ]);
    if (sevasRes.error ?? plansRes.error ?? psRes.error ?? rulesRes.error) {
      setError(
        (sevasRes.error ?? plansRes.error ?? psRes.error ?? rulesRes.error)?.message ??
          "Load failed",
      );
    }
    const sv = (sevasRes.data as SevaLite[]) ?? [];
    setSevas(sv);
    setPlans((plansRes.data as PlanRow[]) ?? []);
    setPlanSevas(psRes.data ?? []);
    setHawanIds(saturdayHawanSevaIds(sv, rulesRes.data ?? []));
  }, []);

  const loadBatches = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("sankalp_batches")
      .select("id,batch_type,batch_date,sankalp_variant,status,completed_at,subscriber_count")
      .order("batch_date", { ascending: false })
      .limit(16);
    if (err) setError(err.message);
    setBatches((data as BatchRow[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadStatic(), loadBatches()]);
      setLoading(false);
    })();
  }, [loadStatic, loadBatches]);

  const tuesdayBatches = batches.filter((b) => b.batch_type === "first_tuesday");
  const saturdayBatches = batches.filter((b) => b.batch_type === "last_saturday");
  const selected = batches.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-amber-900/10 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Video className="w-6 h-6 text-amber-700" />
          Proof Upload &amp; Batch Tracking
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-900 border-amber-300 font-mono text-[11px]"
          >
            Session 4
          </Badge>
        </h1>
        <p className="text-xs text-amber-900/70 mt-1">
          One combined video per tier-pure segment ({SEGMENT_SIZE_SUBSCRIPTIONS} subscriptions /
          max {SEGMENT_MAX_NAMES} names). One WhatsApp message per subscriber. Tuesday and
          Saturday batches are fully independent. Status labels: Done / Pending / Missed.
        </p>
      </div>

      <GenerateBar
        onGenerated={async () => {
          await loadBatches();
        }}
      />

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 p-4 rounded-xl text-xs flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <Skeleton className="h-56 w-full rounded-2xl bg-amber-100/50" />
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <BatchColumn
            title="First Tuesday — List A"
            subtitle="All active subscribers · one batch"
            batches={tuesdayBatches}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <BatchColumn
            title="Last Saturday — List B"
            subtitle="Hawan-plan subscribers · Hawan-only + Full-package batches"
            batches={saturdayBatches}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      )}

      {selected && (
        <BatchDetail
          key={selected.id}
          batch={selected}
          sevas={sevas}
          plans={plans}
          planSevas={planSevas}
          hawanIds={hawanIds}
          onBatchChanged={loadBatches}
        />
      )}
    </div>
  );
}

// ─── Generate bar ─────────────────────────────────────────────
function GenerateBar({ onGenerated }: { onGenerated: () => Promise<void> }) {
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function generate() {
    if (!date) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await callAdminApi<{
        batch_type: string;
        subscriber_count: number;
        catchup_count: number;
        batches: { action: string; sankalp_variant: string | null }[];
      }>("/api/sankalp/generate-batch", { date });
      const desc = res.batches
        .map((b) => `${b.sankalp_variant ?? res.batch_type}: ${b.action}`)
        .join(", ");
      setMsg(
        `Done — ${res.subscriber_count} subscriber(s) (${res.catchup_count} catch-up). ${desc}`,
      );
      await onGenerated();
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : "generation failed"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border border-amber-900/10 bg-white">
      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <CalendarPlus className="w-5 h-5 text-amber-700 shrink-0" />
        <div className="text-xs text-amber-900/80 flex-1">
          <span className="font-bold">Generate batch</span> — pick a First Tuesday or Last
          Saturday date. Membership is computed live at generation time.
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-amber-900/20 rounded-lg px-3 py-1.5 text-xs bg-white"
        />
        <Button
          size="sm"
          onClick={generate}
          disabled={busy || !date}
          className="bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold gap-1.5"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarPlus className="w-3.5 h-3.5" />}
          Generate
        </Button>
        {msg && <div className="text-[11px] text-slate-600 sm:basis-full">{msg}</div>}
      </CardContent>
    </Card>
  );
}

// ─── Batch selector column ────────────────────────────────────
function BatchColumn({
  title,
  subtitle,
  batches,
  selectedId,
  onSelect,
}: {
  title: string;
  subtitle: string;
  batches: BatchRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="border border-amber-900/10 bg-white">
      <CardHeader className="pb-2 bg-amber-50/60 border-b border-amber-100">
        <CardTitle className="text-sm font-bold text-amber-950 flex items-center gap-2">
          <Flame className="w-4 h-4 text-amber-700" /> {title}
        </CardTitle>
        <p className="text-[11px] text-amber-900/60">{subtitle}</p>
      </CardHeader>
      <CardContent className="p-3 space-y-2">
        {batches.length === 0 && (
          <div className="text-center py-6 text-xs text-slate-400">No batches yet.</div>
        )}
        {batches.map((b) => (
          <button
            key={b.id}
            onClick={() => onSelect(b.id)}
            className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition-colors ${
              selectedId === b.id
                ? "border-amber-600 bg-amber-50"
                : "border-amber-900/10 hover:bg-amber-50/50"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">
                {batchLabel(b.batch_type, b.sankalp_variant, b.batch_date)}
              </span>
              <StatusBadge status={b.status} />
            </div>
            <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-2">
              <Users className="w-3 h-3" />
              {b.subscriber_count} subscriber{b.subscriber_count === 1 ? "" : "s"}
              {b.completed_at &&
                ` · completed ${new Date(b.completed_at).toLocaleDateString("en-IN")}`}
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Batch detail (everything strictly keyed to this batch id) ─
function BatchDetail({
  batch,
  sevas,
  plans,
  planSevas,
  hawanIds,
  onBatchChanged,
}: {
  batch: BatchRow;
  sevas: SevaLite[];
  plans: PlanRow[];
  planSevas: { plan_id: string; seva_id: string }[];
  hawanIds: string[];
  onBatchChanged: () => Promise<void>;
}) {
  const [sbs, setSbs] = useState<SbsRow[]>([]);
  const [subs, setSubs] = useState<Map<string, SubRow>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [memberCounts, setMemberCounts] = useState<Map<string, number>>(new Map());
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Batch-scoped reads, PAGED (PostgREST caps one response at ~1000
    // rows; a large batch must never be silently truncated).
    const [sbsAll, segRes, delAll] = await Promise.all([
      fetchAllRows<SbsRow>((from, to) =>
        supabase
          .from("sankalp_batch_subscriptions")
          .select("id,subscription_id,is_catchup,segment_number")
          .eq("batch_id", batch.id)
          .order("id")
          .range(from, to),
      ),
      supabase
        .from("name_segments")
        .select("id,segment_number,video_url")
        .eq("batch_id", batch.id)
        .order("segment_number"),
      fetchAllRows<DeliveryRow>((from, to) =>
        supabase
          .from("proof_deliveries")
          .select("id,subscription_id,message_kind,segment_number,wa_link,is_delivered,delivered_at")
          .eq("batch_id", batch.id)
          .order("id")
          .range(from, to),
      ),
    ]);
    const err = sbsAll.error ?? segRes.error?.message ?? delAll.error;
    if (err) setError(err);

    const sbsRows = sbsAll.data;
    setSbs(sbsRows);
    setSegments((segRes.data as SegmentRow[]) ?? []);
    setDeliveries(delAll.data);

    if (sbsRows.length > 0) {
      // .in() lists are chunked — thousands of UUIDs in one filter
      // would exceed URL length limits.
      const subData: SubRow[] = [];
      const counts = new Map<string, number>();
      const subIds = sbsRows.map((r) => r.subscription_id);
      for (let i = 0; i < subIds.length; i += 200) {
        const chunk = subIds.slice(i, i + 200);
        const { data, error: subErr } = await supabase
          .from("subscriptions")
          .select("id,plan_id,user_id,start_date,created_at")
          .in("id", chunk);
        if (subErr) setError(subErr.message);
        subData.push(...((data as SubRow[]) ?? []));

        const { data: fmData, error: fmErr } = await supabase
          .from("family_members")
          .select("subscription_id")
          .in("subscription_id", chunk);
        if (fmErr) setError(fmErr.message);
        for (const m of fmData ?? []) {
          counts.set(m.subscription_id, (counts.get(m.subscription_id) ?? 0) + 1);
        }
      }
      setSubs(new Map(subData.map((s) => [s.id, s])));
      setMemberCounts(counts);

      const profData: ProfileRow[] = [];
      const userIds = [...new Set(subData.map((s) => s.user_id))];
      for (let i = 0; i < userIds.length; i += 200) {
        const { data, error: profErr } = await supabase
          .from("profiles")
          .select("id,full_name,phone")
          .in("id", userIds.slice(i, i + 200));
        if (profErr) setError(profErr.message);
        profData.push(...((data as ProfileRow[]) ?? []));
      }
      setProfiles(new Map(profData.map((p) => [p.id, p])));
    } else {
      setSubs(new Map());
      setProfiles(new Map());
      setMemberCounts(new Map());
    }
    setLoading(false);
  }, [batch.id]);

  useEffect(() => {
    load();
  }, [load]);

  const segVideoByNumber = useMemo(
    () => new Map(segments.map((s) => [s.segment_number, s.video_url])),
    [segments],
  );
  const assignedCount = sbs.filter((r) => r.segment_number != null).length;
  const segmentNumbers = useMemo(
    () =>
      [...new Set(sbs.map((r) => r.segment_number).filter((n): n is number => n != null))].sort(
        (a, b) => a - b,
      ),
    [sbs],
  );

  // Resolved seva set per subscriber (this batch's variant + catch-up
  // rules) — drives tier keys, segment labels, and WhatsApp copy.
  const sevasBySub = useMemo(() => {
    const map = new Map<string, SevaLite[]>();
    for (const r of sbs) {
      const sub = subs.get(r.subscription_id);
      if (!sub) continue;
      map.set(
        r.subscription_id,
        sevasForMember({
          variant: batch.sankalp_variant,
          planId: sub.plan_id,
          planSevas,
          sevas,
          saturdayHawanSevaIds: hawanIds,
          isCatchup: r.is_catchup,
        }),
      );
    }
    return map;
  }, [sbs, subs, batch.sankalp_variant, planSevas, sevas, hawanIds]);

  // Tier label per segment: plan names sharing that segment's signature.
  const planNamesById = useMemo(() => new Map(plans.map((p) => [p.id, p.name])), [plans]);
  function tierLabelForSegment(n: number): string {
    const rows = sbs.filter((r) => r.segment_number === n);
    const planIds = [
      ...new Set(
        rows
          .map((r) => subs.get(r.subscription_id)?.plan_id)
          .filter((id): id is string => !!id),
      ),
    ];
    const names = planIds.map((id) => planNamesById.get(id) ?? "Unknown plan");
    const catchups = rows.filter((r) => r.is_catchup).length;
    const sevaCount = sevasBySub.get(rows[0]?.subscription_id ?? "")?.length ?? 0;
    return `${names.join(" + ")} · ${sevaCount} sevas${catchups > 0 ? ` · ${catchups} catch-up` : ""}`;
  }

  if (loading) return <Skeleton className="h-64 w-full rounded-2xl bg-amber-100/50" />;

  return (
    <div className="space-y-4">
      <div className="bg-white p-5 rounded-2xl border-2 border-amber-600/30 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 flex-wrap">
              {batchLabel(batch.batch_type, batch.sankalp_variant, batch.batch_date)}
              <StatusBadge status={batch.status} />
            </h2>
            <p className="text-xs text-amber-900/70 mt-1">
              {sbs.length} subscriber{sbs.length === 1 ? "" : "s"}
              {sbs.some((r) => r.is_catchup) &&
                ` · ${sbs.filter((r) => r.is_catchup).length} one-time catch-up`}
              {" · "}Actions here affect THIS batch only.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/admin/pandit/$batchId" params={{ batchId: batch.id }}>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-900/20 text-amber-900 hover:bg-amber-50 gap-1.5 text-xs font-semibold"
              >
                <Printer className="w-3.5 h-3.5" /> Pandit List
              </Button>
            </Link>
            <Button
              size="sm"
              variant="outline"
              onClick={load}
              className="border-amber-900/20 text-amber-900 hover:bg-amber-50 gap-1.5 text-xs font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
            {batch.status !== "done" && (
              <MarkCompletedButton
                batchId={batch.id}
                memberCount={sbs.length}
                onDone={onBatchChanged}
              />
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 p-4 rounded-xl text-xs flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <SegmentsCard
        batch={batch}
        sbs={sbs}
        subs={subs}
        sevasBySub={sevasBySub}
        memberCounts={memberCounts}
        segmentNumbers={segmentNumbers}
        assignedCount={assignedCount}
        segVideoByNumber={segVideoByNumber}
        tierLabelForSegment={tierLabelForSegment}
        onChanged={load}
      />

      {batch.status === "done" && (
        <DeliveryCard
          batch={batch}
          sbs={sbs}
          subs={subs}
          profiles={profiles}
          sevasBySub={sevasBySub}
          segmentNumbers={segmentNumbers}
          segVideoByNumber={segVideoByNumber}
          tierLabelForSegment={tierLabelForSegment}
          deliveries={deliveries}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ─── Cloudinary upload button (shared) ────────────────────────
function CloudinaryUploadButton({
  folder,
  label,
  onUploaded,
}: {
  folder: string;
  label: string;
  onUploaded: (url: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File) {
    setErr(null);
    setProgress(0);
    try {
      const sign = await callAdminApi<import("@/lib/cloudinary-upload").SignResponse>(
        "/api/cloudinary/sign-upload",
        { folder },
      );
      const { secure_url } = await uploadToCloudinary(sign, file, setProgress);
      await onUploaded(secure_url);
      setProgress(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
      setProgress(null);
    }
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      <Button
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={progress != null}
        className="bg-amber-700 hover:bg-amber-800 text-white gap-1.5 text-xs font-semibold"
      >
        {progress != null ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Upload className="w-3.5 h-3.5" />
        )}
        {progress != null ? `Uploading ${progress}%` : label}
      </Button>
      {progress != null && (
        <div className="w-full h-1.5 bg-amber-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {err && <div className="text-[11px] text-rose-600">{err}</div>}
    </div>
  );
}

function cloudinaryFolder(batch: BatchRow, segment: number): string {
  const [y, m] = batch.batch_date.split("-").map(Number);
  return `punyata-proofs/${y}-${m}/${batch.batch_type}/segments/segment-${segment}`;
}

// ─── Segments card (TIER-PURE, one combined video per segment) ─
function SegmentsCard({
  batch,
  sbs,
  subs,
  sevasBySub,
  memberCounts,
  segmentNumbers,
  assignedCount,
  segVideoByNumber,
  tierLabelForSegment,
  onChanged,
}: {
  batch: BatchRow;
  sbs: SbsRow[];
  subs: Map<string, SubRow>;
  sevasBySub: Map<string, SevaLite[]>;
  memberCounts: Map<string, number>;
  segmentNumbers: number[];
  assignedCount: number;
  segVideoByNumber: Map<number, string>;
  tierLabelForSegment: (n: number) => string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasVideos = segVideoByNumber.size > 0;

  async function autoAssign() {
    setBusy(true);
    setErr(null);
    try {
      // Join-date order within each tier bucket (deterministic).
      const ordered = [...sbs].sort((a, b) => {
        const ja = subs.get(a.subscription_id);
        const jb = subs.get(b.subscription_id);
        const da = (ja?.start_date ?? ja?.created_at ?? "") as string;
        const db = (jb?.start_date ?? jb?.created_at ?? "") as string;
        return da === db
          ? a.subscription_id.localeCompare(b.subscription_id)
          : da.localeCompare(db);
      });
      const assignment = assignSegmentsTierPure(
        ordered.map((r) => ({
          subscription_id: r.subscription_id,
          tierKey: tierKeyForMember(sevasBySub.get(r.subscription_id) ?? []),
        })),
      );
      const segBySub = new Map(assignment.map((a) => [a.subscription_id, a.segment_number]));
      const updates = ordered.map((r) => ({
        id: r.id,
        segment_number: segBySub.get(r.subscription_id)!,
      }));
      for (let i = 0; i < updates.length; i += 200) {
        const { error } = await supabase
          .from("sankalp_batch_subscriptions")
          .upsert(updates.slice(i, i + 200), { onConflict: "id" });
        if (error) throw new Error(error.message);
      }
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Assignment failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveSegmentVideo(segmentNumber: number, url: string) {
    const { error } = await supabase.from("name_segments").upsert(
      { batch_id: batch.id, segment_number: segmentNumber, video_url: url },
      { onConflict: "batch_id,segment_number" },
    );
    if (error) throw new Error(error.message);
    await onChanged();
  }

  return (
    <Card className="border border-amber-900/10 bg-white">
      <CardHeader className="pb-2 bg-amber-50/60 border-b border-amber-100">
        <CardTitle className="text-sm font-bold text-amber-950 flex items-center gap-2">
          <Scissors className="w-4 h-4 text-amber-700" /> Segments — One Combined Video Each
        </CardTitle>
        <p className="text-[11px] text-amber-900/60">
          Tier-pure groups of {SEGMENT_SIZE_SUBSCRIPTIONS} subscriptions (max {SEGMENT_MAX_NAMES}{" "}
          names). Each segment's single video already contains its sevas + name-reading.
        </p>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={autoAssign}
            disabled={busy || sbs.length === 0 || (assignedCount > 0 && hasVideos)}
            className="border-amber-900/20 text-amber-900 hover:bg-amber-50 gap-1.5 text-xs font-semibold"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scissors className="w-3.5 h-3.5" />}
            {assignedCount > 0
              ? "Re-assign segments"
              : `Auto-assign (${SEGMENT_SIZE_SUBSCRIPTIONS} subs/segment, tier-pure)`}
          </Button>
          <span className="text-[11px] text-slate-500">
            {assignedCount}/{sbs.length} assigned · {segmentNumbers.length} segment
            {segmentNumbers.length === 1 ? "" : "s"}
          </span>
        </div>
        {assignedCount > 0 && hasVideos && (
          <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            Re-assignment is locked because segment videos already exist for this batch.
          </div>
        )}
        {err && <div className="text-[11px] text-rose-600">{err}</div>}

        <div className="grid md:grid-cols-2 gap-3">
          {segmentNumbers.map((n) => {
            const rows = sbs.filter((r) => r.segment_number === n);
            const names = rows.reduce(
              (sum, r) => sum + (memberCounts.get(r.subscription_id) ?? 0),
              0,
            );
            const video = segVideoByNumber.get(n);
            return (
              <div key={n} className="border border-amber-900/10 rounded-xl px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-800 flex items-center gap-2">
                    {video ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Circle className="w-4 h-4 text-amber-500" />
                    )}
                    Segment {n}
                  </span>
                  {video && (
                    <a
                      href={video}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-800 font-semibold flex items-center gap-1"
                    >
                      View <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div className="text-[11px] text-slate-500">
                  {tierLabelForSegment(n)} · {rows.length} sub{rows.length === 1 ? "" : "s"} ·{" "}
                  {names}/{SEGMENT_MAX_NAMES} names
                </div>
                <CloudinaryUploadButton
                  folder={cloudinaryFolder(batch, n)}
                  label={video ? "Replace combined video" : `Upload segment ${n} combined video`}
                  onUploaded={(url) => saveSegmentVideo(n, url)}
                />
              </div>
            );
          })}
        </div>
        {segmentNumbers.length === 0 && (
          <div className="text-xs text-slate-400 italic">
            Assign segments first — then upload one combined video per segment.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Mark completed (single-row update, this batch id only) ───
function MarkCompletedButton({
  batchId,
  memberCount,
  onDone,
}: {
  batchId: string;
  memberCount: number;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function complete() {
    setBusy(true);
    try {
      // Keyed ONLY by this batch's primary key. No batch_type or
      // date filter — completion can never leak to another batch.
      const { error } = await supabase
        .from("sankalp_batches")
        .update(buildCompletionUpdate(memberCount))
        .eq("id", batchId);
      if (error) throw new Error(error.message);
      await onDone();
    } catch {
      // surfaced via parent refresh; keep button state simple
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <Button
        size="sm"
        onClick={() => setConfirming(true)}
        className="bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5 text-xs font-semibold"
      >
        <CheckCircle2 className="w-3.5 h-3.5" /> Mark Seva Completed
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-600">Mark THIS batch done?</span>
      <Button
        size="sm"
        onClick={complete}
        disabled={busy}
        className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Yes, Done"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setConfirming(false)}
        className="text-xs"
      >
        Cancel
      </Button>
    </div>
  );
}

// ─── WhatsApp delivery (ONE message per subscriber) ───────────
function DeliveryCard({
  batch,
  sbs,
  subs,
  profiles,
  sevasBySub,
  segmentNumbers,
  segVideoByNumber,
  tierLabelForSegment,
  deliveries,
  onChanged,
}: {
  batch: BatchRow;
  sbs: SbsRow[];
  subs: Map<string, SubRow>;
  profiles: Map<string, ProfileRow>;
  sevasBySub: Map<string, SevaLite[]>;
  segmentNumbers: number[];
  segVideoByNumber: Map<number, string>;
  tierLabelForSegment: (n: number) => string;
  deliveries: DeliveryRow[];
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [manualBusy, setManualBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const labelText = batchLabel(batch.batch_type, batch.sankalp_variant, batch.batch_date);
  const deliveredCount = deliveries.filter((d) => d.is_delivered).length;

  async function prepare() {
    setBusy(true);
    setErr(null);
    try {
      const rows = [];
      for (const r of sbs) {
        const sub = subs.get(r.subscription_id);
        const profile = sub ? profiles.get(sub.user_id) : undefined;
        if (!sub || !profile?.phone) continue;
        const segUrl =
          r.segment_number != null ? (segVideoByNumber.get(r.segment_number) ?? null) : null;
        rows.push({
          batch_id: batch.id,
          subscription_id: r.subscription_id,
          message_kind: "segment" as const,
          segment_number: r.segment_number,
          wa_link: buildWaLink(
            profile.phone,
            buildDeliveryMessage({
              sevaNames: (sevasBySub.get(r.subscription_id) ?? []).map((s) => s.name),
              batchLabelText: labelText,
              videoUrl: segUrl,
            }),
          ),
        });
      }
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase
          .from("proof_deliveries")
          .upsert(rows.slice(i, i + 200), {
            onConflict: "batch_id,subscription_id,message_kind",
          });
        if (error) throw new Error(error.message);
      }
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Prepare failed");
    } finally {
      setBusy(false);
    }
  }

  async function markDelivered(row: DeliveryRow) {
    const { error } = await supabase
      .from("proof_deliveries")
      .update({ is_delivered: true, delivered_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) setErr(error.message);
    await onChanged();
  }

  // ── Manual bypass (secondary action, NOT the main flow) ─────
  // For when the segment video was sent directly from Chirayu's own
  // WhatsApp — outside the system. No media is stored, so these
  // proofs will NOT appear in the subscriber's Punya Bank gallery.
  // Only per-subscriber delivery rows are touched — never batch status.
  async function markSentManually(segmentNumber: number) {
    setManualBusy(segmentNumber);
    setErr(null);
    try {
      const now = new Date().toISOString();
      const rows = sbs
        .filter((r) => r.segment_number === segmentNumber)
        .map((r) => ({
          batch_id: batch.id,
          subscription_id: r.subscription_id,
          message_kind: "segment" as const,
          segment_number: segmentNumber,
          is_delivered: true,
          delivered_at: now,
        }));
      const { error } = await supabase
        .from("proof_deliveries")
        .upsert(rows, { onConflict: "batch_id,subscription_id,message_kind" });
      if (error) throw new Error(error.message);
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Manual mark failed");
    } finally {
      setManualBusy(null);
    }
  }

  const unassigned = sbs.filter((r) => r.segment_number == null).length;

  return (
    <Card className="border border-amber-900/10 bg-white">
      <CardHeader className="pb-2 bg-amber-50/60 border-b border-amber-100">
        <CardTitle className="text-sm font-bold text-amber-950 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-amber-700" /> WhatsApp Delivery — One Message Per
          Subscriber
        </CardTitle>
        <p className="text-[11px] text-amber-900/60">
          Each subscriber gets their own segment's combined video. Meta API pending: open the
          pre-filled wa.me link, attach the video in WhatsApp, send, then mark delivered.
        </p>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={prepare}
            disabled={busy || sbs.length === 0}
            className="border-amber-900/20 text-amber-900 hover:bg-amber-50 gap-1.5 text-xs font-semibold"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
            {deliveries.length > 0 ? "Refresh delivery list" : "Prepare delivery list"}
          </Button>
          {deliveries.length > 0 && (
            <span className="text-[11px] text-slate-500">
              {deliveredCount}/{deliveries.length} delivered
            </span>
          )}
          {unassigned > 0 && (
            <span className="text-[11px] text-rose-600">
              {unassigned} subscriber{unassigned === 1 ? "" : "s"} not assigned to any segment
            </span>
          )}
        </div>
        {err && <div className="text-[11px] text-rose-600">{err}</div>}

        {segmentNumbers.map((n) => {
          const segDeliveries = deliveries.filter((d) => d.segment_number === n);
          const segDone = segDeliveries.length > 0 && segDeliveries.every((d) => d.is_delivered);
          const video = segVideoByNumber.get(n);
          return (
            <div key={n} className="border border-amber-900/10 rounded-xl px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                  {segDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Circle className="w-4 h-4 text-amber-500" />
                  )}
                  Segment {n}
                  <span className="text-slate-400 font-normal">{tierLabelForSegment(n)}</span>
                </div>
                {/* Secondary bypass — visually distinct from the primary
                    Cloudinary + wa.me flow above. */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => markSentManually(n)}
                    disabled={manualBusy != null || segDone}
                    title="Low-volume bypass: video was sent directly from your own WhatsApp, outside the system. No media is stored, so these proofs will NOT appear in the subscriber's Punya Bank gallery."
                    className="border-slate-300 text-slate-600 hover:bg-slate-50 gap-1.5 text-[11px] font-semibold border-dashed"
                  >
                    {manualBusy === n ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Hand className="w-3.5 h-3.5" />
                    )}
                    Mark Sent Manually
                  </Button>
                </div>
              </div>

              {segDeliveries.length === 0 && (
                <div className="text-[11px] text-slate-400 italic">
                  No delivery rows yet — prepare the list, or use manual bypass after sending
                  directly.
                </div>
              )}

              {segDeliveries.map((d) => {
                const sub = subs.get(d.subscription_id);
                const profile = sub ? profiles.get(sub.user_id) : undefined;
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-2 text-xs pl-6"
                  >
                    <span className="text-slate-600 flex items-center gap-1.5 min-w-0">
                      {d.is_delivered ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      )}
                      <span className="truncate">
                        {profile?.full_name ?? "—"}
                        <span className="text-slate-400 ml-1.5">{profile?.phone ?? "no phone"}</span>
                      </span>
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {d.wa_link && !d.is_delivered && (
                        <a
                          href={d.wa_link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-700 font-semibold flex items-center gap-1 hover:underline"
                        >
                          Open WhatsApp <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {!d.is_delivered && (
                        <button
                          onClick={() => markDelivered(d)}
                          className="text-amber-800 font-semibold hover:underline"
                        >
                          Mark Delivered
                        </button>
                      )}
                      {d.is_delivered && d.delivered_at && (
                        <span className="text-[10px] text-slate-400">
                          {new Date(d.delivered_at).toLocaleString("en-IN")}
                          {!d.wa_link && " · sent manually"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <span>
            "Mark Sent Manually" is the low-volume bypass: use it when the video was sent directly
            from your own WhatsApp. No media is stored, so those proofs will NOT appear in the
            subscriber's Punya Bank gallery — use the Cloudinary upload flow when you want proofs
            archived.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
