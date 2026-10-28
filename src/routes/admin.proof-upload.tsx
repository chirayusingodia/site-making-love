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
  type ScheduleRuleRow,
  type SevaLite,
} from "@/lib/sankalp-logic";
import { callAdminApi, uploadToCloudinary } from "@/lib/cloudinary-upload";
import { generateAshirwadPatrasForBatch } from "@/lib/ashirwad-patra";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Notice, PageHeader, Panel, StatusPill } from "@/components/admin/admin-ui";

export const Route = createFileRoute("/admin/proof-upload")({
  component: ProofUploadPage,
});

// ─── Row types ────────────────────────────────────────────────
interface BatchRow {
  id: string;
  batch_type: BatchKind;
  batch_date: string;
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
  delivery_phone: string | null;
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
  const tone = { done: "good", pending: "warn", missed: "bad" } as const;
  const label = { done: "Done", pending: "Pending", missed: "Missed" } as const;
  return <StatusPill tone={tone[status]}>{label[status]}</StatusPill>;
}

// ─── Page ─────────────────────────────────────────────────────
function ProofUploadPage() {
  const [sevas, setSevas] = useState<SevaLite[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [planSevas, setPlanSevas] = useState<{ plan_id: string; seva_id: string }[]>([]);
  const [hawanIds, setHawanIds] = useState<string[]>([]);
  const [scheduleRules, setScheduleRules] = useState<ScheduleRuleRow[]>([]);
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
    const rules = (rulesRes.data as ScheduleRuleRow[]) ?? [];
    setScheduleRules(rules);
    setHawanIds(saturdayHawanSevaIds(sv, rules));
  }, []);

  const loadBatches = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("sankalp_batches")
      .select("id,batch_type,batch_date,status,completed_at,subscriber_count")
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

  const tuesdayBatches = batches.filter((b) => b.batch_type === "second_tuesday");
  const saturdayBatches = batches.filter((b) => b.batch_type === "last_saturday");
  const selected = batches.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proof Upload & Batch Tracking"
        description={
          <>
            One combined video per tier-pure segment ({SEGMENT_SIZE_SUBSCRIPTIONS} subscriptions /
            max {SEGMENT_MAX_NAMES} names). One WhatsApp message per subscriber. Tuesday and
            Saturday batches are fully independent. Status labels: Done / Pending / Missed.
          </>
        }
      />

      <GenerateBar
        onGenerated={async () => {
          await loadBatches();
        }}
      />

      {error && (
        <Notice tone="bad" icon={AlertTriangle}>
          <span className="break-words">{error}</span>
        </Notice>
      )}

      {loading ? (
        <Skeleton className="h-56 w-full rounded-xl bg-stone-100" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          <BatchColumn
            title="Second Tuesday — List A"
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
          scheduleRules={scheduleRules}
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
        batches: { action: string }[];
      }>("/api/sankalp/generate-batch", { date });
      const desc = res.batches.map((b) => `${res.batch_type}: ${b.action}`).join(", ");
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
    <Panel
      title="Generate batch"
      description="Pick a Second Tuesday or Last Saturday date. Membership is computed live at generation time."
      bodyClassName="space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
        <label className="block space-y-1.5 w-full sm:w-56">
          <span className="text-[13px] font-medium text-stone-700">Batch date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full h-10 border border-stone-200 rounded-md px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
          />
        </label>
        <Button
          onClick={generate}
          disabled={busy || !date}
          className="h-10 gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CalendarPlus className="w-4 h-4" />
          )}
          Generate
        </Button>
      </div>
      {msg && <p className="text-xs text-stone-600 break-words">{msg}</p>}
    </Panel>
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
    <Panel title={title} description={subtitle} bodyClassName="p-2 sm:p-3 space-y-2">
      {batches.length === 0 && <EmptyState icon={Flame} title="No batches yet." className="py-6" />}
      {batches.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => onSelect(b.id)}
          aria-pressed={selectedId === b.id}
          className={`w-full text-left px-3 py-2.5 min-h-[48px] rounded-lg border transition-colors ${
            selectedId === b.id
              ? "border-orange-500 bg-orange-50/60 ring-1 ring-orange-500/20"
              : "border-stone-200 hover:bg-stone-50"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-[13px] font-medium text-stone-900 leading-snug min-w-0">
              {batchLabel(b.batch_type, b.batch_date)}
            </span>
            <StatusBadge status={b.status} />
          </div>
          <div className="text-xs text-stone-500 mt-1 flex items-center gap-1.5 flex-wrap">
            <Users className="w-3.5 h-3.5 text-stone-400" />
            {b.subscriber_count} subscriber{b.subscriber_count === 1 ? "" : "s"}
            {b.completed_at &&
              ` · completed ${new Date(b.completed_at).toLocaleDateString("en-IN")}`}
          </div>
        </button>
      ))}
    </Panel>
  );
}

// ─── Batch detail (everything strictly keyed to this batch id) ─
function BatchDetail({
  batch,
  sevas,
  plans,
  planSevas,
  hawanIds,
  scheduleRules,
  onBatchChanged,
}: {
  batch: BatchRow;
  sevas: SevaLite[];
  plans: PlanRow[];
  planSevas: { plan_id: string; seva_id: string }[];
  hawanIds: string[];
  scheduleRules: ScheduleRuleRow[];
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
          .select(
            "id,subscription_id,message_kind,segment_number,wa_link,is_delivered,delivered_at",
          )
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
          .select("id,plan_id,user_id,start_date,created_at,delivery_phone")
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

  // Resolved seva set per subscriber (this batch's kind + catch-up
  // rules) — drives tier keys, segment labels, and WhatsApp copy.
  const sevasBySub = useMemo(() => {
    const map = new Map<string, SevaLite[]>();
    for (const r of sbs) {
      const sub = subs.get(r.subscription_id);
      if (!sub) continue;
      map.set(
        r.subscription_id,
        sevasForMember({
          kind: batch.batch_type,
          planId: sub.plan_id,
          planSevas,
          sevas,
          saturdayHawanSevaIds: hawanIds,
          scheduleRules,
          isCatchup: r.is_catchup,
        }),
      );
    }
    return map;
  }, [sbs, subs, batch.batch_type, planSevas, sevas, hawanIds, scheduleRules]);

  // Tier label per segment: plan names sharing that segment's signature.
  const planNamesById = useMemo(() => new Map(plans.map((p) => [p.id, p.name])), [plans]);
  function tierLabelForSegment(n: number): string {
    const rows = sbs.filter((r) => r.segment_number === n);
    const planIds = [
      ...new Set(
        rows.map((r) => subs.get(r.subscription_id)?.plan_id).filter((id): id is string => !!id),
      ),
    ];
    const names = planIds.map((id) => planNamesById.get(id) ?? "Unknown plan");
    const catchups = rows.filter((r) => r.is_catchup).length;
    const sevaCount = sevasBySub.get(rows[0]?.subscription_id ?? "")?.length ?? 0;
    return `${names.join(" + ")} · ${sevaCount} sevas${catchups > 0 ? ` · ${catchups} catch-up` : ""}`;
  }

  if (loading) return <Skeleton className="h-64 w-full rounded-xl bg-stone-100" />;

  return (
    <div className="space-y-4">
      <section className="admin-card border-orange-200 ring-1 ring-orange-500/10 p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-stone-500">Selected batch</div>
            <h2 className="mt-0.5 text-base sm:text-lg font-semibold text-stone-900 flex items-center gap-2 flex-wrap">
              {batchLabel(batch.batch_type, batch.batch_date)}
              <StatusBadge status={batch.status} />
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              {sbs.length} subscriber{sbs.length === 1 ? "" : "s"}
              {sbs.some((r) => r.is_catchup) &&
                ` · ${sbs.filter((r) => r.is_catchup).length} one-time catch-up`}
              {" · "}Actions here affect THIS batch only.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center shrink-0">
            <Button asChild variant="outline" className="h-10 sm:h-9 gap-1.5">
              <Link to="/admin/pandit/$batchId" params={{ batchId: batch.id }}>
                <Printer className="w-4 h-4" /> Pandit List
              </Link>
            </Button>
            <Button variant="outline" onClick={load} className="h-10 sm:h-9 gap-1.5">
              <RefreshCw className="w-4 h-4" /> Refresh
            </Button>
            {batch.status !== "done" && (
              <div className="col-span-2 sm:col-span-1">
                <MarkCompletedButton
                  batchId={batch.id}
                  memberCount={sbs.length}
                  onDone={onBatchChanged}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {error && (
        <Notice tone="bad" icon={AlertTriangle}>
          <span className="break-words">{error}</span>
        </Notice>
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
        onClick={() => inputRef.current?.click()}
        disabled={progress != null}
        className="w-full sm:w-auto h-11 sm:h-9 gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
      >
        {progress != null ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
        {progress != null ? `Uploading ${progress}%` : label}
      </Button>
      {progress != null && (
        <div
          className="w-full h-2 bg-stone-100 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-orange-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      {err && <div className="text-xs text-rose-600 break-words">{err}</div>}
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
          // [Bug 4.8] Scope the tier bucket per plan so identical-seva
          // plans stay distinguishable in segment reporting (they can
          // never share a segment anyway without violating tier purity).
          tierKey: tierKeyForMember(
            sevasBySub.get(r.subscription_id) ?? [],
            subs.get(r.subscription_id)?.plan_id ?? null,
          ),
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
    const { error } = await supabase
      .from("name_segments")
      .upsert(
        { batch_id: batch.id, segment_number: segmentNumber, video_url: url },
        { onConflict: "batch_id,segment_number" },
      );
    if (error) throw new Error(error.message);
    await onChanged();
  }

  return (
    <Panel
      title="Segments — one combined video each"
      description={
        <>
          Tier-pure groups of {SEGMENT_SIZE_SUBSCRIPTIONS} subscriptions (max {SEGMENT_MAX_NAMES}{" "}
          names). Each segment's single video already contains its sevas + name-reading.
        </>
      }
      bodyClassName="space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 sm:flex-wrap">
        <Button
          variant="outline"
          onClick={autoAssign}
          disabled={busy || sbs.length === 0 || (assignedCount > 0 && hasVideos)}
          className="h-auto min-h-10 sm:min-h-9 py-2 gap-1.5 whitespace-normal"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
          {assignedCount > 0
            ? "Re-assign segments"
            : `Auto-assign (${SEGMENT_SIZE_SUBSCRIPTIONS} subs/segment, tier-pure)`}
        </Button>
        <span className="text-xs text-stone-500">
          {assignedCount}/{sbs.length} assigned · {segmentNumbers.length} segment
          {segmentNumbers.length === 1 ? "" : "s"}
        </span>
      </div>
      {assignedCount > 0 && hasVideos && (
        <Notice tone="warn" icon={Info}>
          Re-assignment is locked because segment videos already exist for this batch.
        </Notice>
      )}
      {err && (
        <Notice tone="bad" icon={AlertTriangle}>
          <span className="break-words">{err}</span>
        </Notice>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {segmentNumbers.map((n) => {
          const rows = sbs.filter((r) => r.segment_number === n);
          const names = rows.reduce(
            (sum, r) => sum + (memberCounts.get(r.subscription_id) ?? 0),
            0,
          );
          const video = segVideoByNumber.get(n);
          return (
            <div
              key={n}
              className={`rounded-lg border p-3 space-y-2.5 ${video ? "border-emerald-200 bg-emerald-50/30" : "border-stone-200 bg-white"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-stone-900 flex items-center gap-2">
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
                    className="inline-flex items-center gap-1 h-9 px-2 -mr-2 rounded-md text-sm font-medium text-orange-700 hover:bg-orange-50"
                  >
                    View <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              <div className="text-xs text-stone-500 break-words">
                {tierLabelForSegment(n)} · {rows.length} sub{rows.length === 1 ? "" : "s"} · {names}
                /{SEGMENT_MAX_NAMES} names
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
        <EmptyState
          icon={Video}
          title="No segments yet"
          description="Assign segments first — then upload one combined video per segment."
          className="py-6"
        />
      )}
    </Panel>
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
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function complete() {
    setBusy(true);
    setErrMsg(null);
    // [Pass-2 residual F11] `errMsg` in finally was the stale
    // render-time closure (still null), so the confirm UI collapsed
    // and hid the error in the same tick. Track success explicitly.
    let succeeded = false;
    try {
      // Keyed ONLY by this batch's primary key. No batch_type or
      // date filter — completion can never leak to another batch.
      const { error } = await supabase
        .from("sankalp_batches")
        .update(buildCompletionUpdate(memberCount))
        .eq("id", batchId);
      if (error) throw new Error(error.message);
      await onDone();
      succeeded = true;
      // Auto-issue the Ashirwad Patra rows for this completed batch —
      // one per family unit (all family names). Best-effort: a failure
      // here never blocks completion; the admin can retry from the
      // Ashirwad Patra page (generation is idempotent).
      try {
        await generateAshirwadPatrasForBatch(batchId);
      } catch (genErr) {
        console.warn("Ashirwad Patra auto-generate failed:", genErr);
      }
    } catch (err) {
      // [Pass-2 F11] the empty catch hid failures completely — not even
      // the parent refresh ran (onDone was skipped), so the batch sat
      // pending with zero feedback. Surface it and stay on confirm.
      setErrMsg(err instanceof Error ? err.message : "Mark completed fail hua");
    } finally {
      setBusy(false);
      if (succeeded) setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <Button
        onClick={() => setConfirming(true)}
        className="w-full sm:w-auto h-10 sm:h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        <CheckCircle2 className="w-4 h-4" /> Mark Seva Completed
      </Button>
    );
  }
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:flex-wrap rounded-lg border border-emerald-200 bg-emerald-50/50 p-2">
      <span className="text-[13px] font-medium text-stone-700 px-1">Mark THIS batch done?</span>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button
          onClick={complete}
          disabled={busy}
          className="h-10 sm:h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Yes, Done"}
        </Button>
        <Button variant="outline" onClick={() => setConfirming(false)} className="h-10 sm:h-9">
          Cancel
        </Button>
      </div>
      {errMsg && (
        <span className="text-xs text-rose-600 font-medium px-1 break-words">{errMsg}</span>
      )}
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
  // [Bug 10.1] A subscriber with no resolvable phone used to be
  // silently `continue`d past — no proof_deliveries row, no warning,
  // no count. Nobody ever learned that customer got no video that
  // month. Now every skip is collected and surfaced below instead.
  const [skippedNoPhone, setSkippedNoPhone] = useState<{ subscriptionId: string; name: string }[]>(
    [],
  );

  const labelText = batchLabel(batch.batch_type, batch.batch_date);
  const deliveredCount = deliveries.filter((d) => d.is_delivered).length;

  async function prepare() {
    setBusy(true);
    setErr(null);
    try {
      const rows = [];
      const skipped: { subscriptionId: string; name: string }[] = [];
      for (const r of sbs) {
        const sub = subs.get(r.subscription_id);
        const profile = sub ? profiles.get(sub.user_id) : undefined;
        // Prefer the per-subscription delivery target; fall back to
        // the account holder's own phone (existing behaviour).
        const phone = sub?.delivery_phone || profile?.phone || null;
        if (!sub || !phone) {
          skipped.push({
            subscriptionId: r.subscription_id,
            name: profile?.full_name ?? r.subscription_id,
          });
          continue;
        }
        const segUrl =
          r.segment_number != null ? (segVideoByNumber.get(r.segment_number) ?? null) : null;
        rows.push({
          batch_id: batch.id,
          subscription_id: r.subscription_id,
          message_kind: "segment" as const,
          segment_number: r.segment_number,
          wa_link: buildWaLink(
            phone,
            buildDeliveryMessage({
              sevaNames: (sevasBySub.get(r.subscription_id) ?? []).map((s) => s.name),
              batchLabelText: labelText,
              videoUrl: segUrl,
            }),
          ),
        });
      }
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from("proof_deliveries").upsert(rows.slice(i, i + 200), {
          onConflict: "batch_id,subscription_id,message_kind",
        });
        if (error) throw new Error(error.message);
      }
      setSkippedNoPhone(skipped);
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
    <Panel
      title="WhatsApp delivery — one message per subscriber"
      description="Each subscriber gets their own segment's combined video. Meta API pending: open the pre-filled wa.me link, attach the video in WhatsApp, send, then mark delivered."
      bodyClassName="space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 sm:flex-wrap">
        <Button
          variant="outline"
          onClick={prepare}
          disabled={busy || sbs.length === 0}
          className="h-10 sm:h-9 gap-1.5"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <MessageCircle className="w-4 h-4" />
          )}
          {deliveries.length > 0 ? "Refresh delivery list" : "Prepare delivery list"}
        </Button>
        {deliveries.length > 0 && (
          <span className="text-xs text-stone-500">
            {deliveredCount}/{deliveries.length} delivered
          </span>
        )}
        {unassigned > 0 && (
          <span className="text-xs text-rose-600">
            {unassigned} subscriber{unassigned === 1 ? "" : "s"} not assigned to any segment
          </span>
        )}
      </div>
      {err && (
        <Notice tone="bad" icon={AlertTriangle}>
          <span className="break-words">{err}</span>
        </Notice>
      )}

      {skippedNoPhone.length > 0 && (
        <Notice tone="bad" icon={AlertTriangle}>
          <p className="font-medium">
            {skippedNoPhone.length} subscriber{skippedNoPhone.length === 1 ? "" : "s"} ka number
            nahi hai — inko video nahi jayega
          </p>
          <ul className="mt-1 text-xs list-disc pl-4 space-y-0.5">
            {skippedNoPhone.map((s) => (
              <li key={s.subscriptionId} className="break-all">
                {s.name}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {segmentNumbers.map((n) => {
        const segDeliveries = deliveries.filter((d) => d.segment_number === n);
        const segDone = segDeliveries.length > 0 && segDeliveries.every((d) => d.is_delivered);
        const video = segVideoByNumber.get(n);
        return (
          <div key={n} className="rounded-lg border border-stone-200 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5 bg-stone-50 border-b border-stone-200">
              <div className="min-w-0">
                <div className="text-sm font-medium text-stone-900 flex items-center gap-2">
                  {segDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                  Segment {n}
                  {video && (
                    <a
                      href={video}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:underline"
                    >
                      Video <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div className="text-xs text-stone-500 mt-0.5 pl-6 break-words">
                  {tierLabelForSegment(n)}
                </div>
              </div>
              {/* Secondary bypass — visually distinct from the primary
                    Cloudinary + wa.me flow above. */}
              <Button
                variant="outline"
                onClick={() => markSentManually(n)}
                disabled={manualBusy != null || segDone}
                title="Low-volume bypass: video was sent directly from your own WhatsApp, outside the system. No media is stored, so these proofs will NOT appear in the subscriber's Punya Bank gallery."
                className="h-10 sm:h-8 gap-1.5 text-xs border-dashed border-stone-300 text-stone-600 bg-white shrink-0"
              >
                {manualBusy === n ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Hand className="w-3.5 h-3.5" />
                )}
                Mark Sent Manually
              </Button>
            </div>

            {segDeliveries.length === 0 && (
              <p className="px-3 py-3 text-xs text-stone-400 italic">
                No delivery rows yet — prepare the list, or use manual bypass after sending
                directly.
              </p>
            )}

            {segDeliveries.length > 0 && (
              <ul className="divide-y divide-stone-100">
                {segDeliveries.map((d) => {
                  const sub = subs.get(d.subscription_id);
                  const profile = sub ? profiles.get(sub.user_id) : undefined;
                  return (
                    <li
                      key={d.id}
                      className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        {d.is_delivered ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-stone-900 truncate">
                            {profile?.full_name ?? "—"}
                          </div>
                          <div className="text-xs text-stone-500 tabular-nums">
                            {profile?.phone ?? "no phone"}
                          </div>
                        </div>
                      </div>
                      {d.is_delivered ? (
                        d.delivered_at && (
                          <span className="text-xs text-stone-400 pl-6 sm:pl-0">
                            {new Date(d.delivered_at).toLocaleString("en-IN")}
                            {!d.wa_link && " · sent manually"}
                          </span>
                        )
                      ) : (
                        <div className="grid grid-cols-2 gap-2 sm:flex shrink-0 pl-6 sm:pl-0">
                          {d.wa_link && (
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="h-10 sm:h-8 gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                            >
                              <a href={d.wa_link} target="_blank" rel="noreferrer">
                                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                              </a>
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => markDelivered(d)}
                            className={`h-10 sm:h-8 gap-1.5 ${d.wa_link ? "" : "col-span-2"}`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Mark Delivered
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      <Notice tone="info" icon={Info} className="text-xs">
        "Mark Sent Manually" is the low-volume bypass: use it when the video was sent directly from
        your own WhatsApp. No media is stored, so those proofs will NOT appear in the subscriber's
        Punya Bank gallery — use the Cloudinary upload flow when you want proofs archived.
      </Notice>
    </Panel>
  );
}
