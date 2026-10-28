import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAllRows, supabase } from "@/lib/supabase";
import { callAdminApi, uploadToCloudinary, type SignResponse } from "@/lib/cloudinary-upload";
import {
  batchLabel,
  buildWaLink,
  isHawanSeva,
  type BatchKind,
  type SevaLite,
} from "@/lib/sankalp-logic";
import {
  generateAshirwadPatrasForBatch,
  parseGotraBatchRows,
  formatHindiDate,
  type AshirwadPatraRow,
  type ExcelPatraEntry,
} from "@/lib/ashirwad-patra";
import { renderPatraToFile } from "@/lib/ashirwad-patra-render";
import { parseXlsxFirstSheet } from "@/lib/xlsx-lite";
import { zipStore } from "@/lib/zip-store";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderArchive,
  ImageIcon,
  Loader2,
  MessageCircle,
  RefreshCw,
  ScrollText,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Notice, PageHeader, Panel, StatusPill } from "@/components/admin/admin-ui";

export const Route = createFileRoute("/admin/ashirwad-patra")({
  component: AshirwadPatraPage,
});

interface DoneBatch {
  id: string;
  batch_type: BatchKind;
  batch_date: string;
  subscriber_count: number;
  patra_count: number;
}

interface Contact {
  phone: string | null;
  accountName: string | null;
}

// Cloudinary: force a download (Content-Disposition: attachment).
function downloadUrl(u: string): string {
  return u.includes("/upload/") ? u.replace("/upload/", "/upload/fl_attachment/") : u;
}

function AshirwadPatraPage() {
  const [batches, setBatches] = useState<DoneBatch[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    // Done batches only — a patra is issued for a pooja that happened.
    const { data, error: err } = await supabase
      .from("sankalp_batches")
      .select("id,batch_type,batch_date,subscriber_count")
      .eq("status", "done")
      .order("batch_date", { ascending: false })
      .limit(24);
    if (err) {
      setError(err.message);
      return;
    }
    const base = (data as Omit<DoneBatch, "patra_count">[]) ?? [];
    // Per-batch issued count (small N of batches — one head query each).
    const withCounts = await Promise.all(
      base.map(async (b) => {
        const { count } = await supabase
          .from("ashirwad_patras")
          .select("id", { count: "exact", head: true })
          .eq("batch_id", b.id);
        return { ...b, patra_count: count ?? 0 };
      }),
    );
    setBatches(withCounts);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadBatches();
      setLoading(false);
    })();
  }, [loadBatches]);

  const selected = batches.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ashirwad Patra"
        description="Har pooja ke baad har parivaar ka ek Ashirwad Patra ban-ta hai — poore parivaar ke naam (website par jo naam nahi hain, woh bhi), us din ki sevayein, aur ashirwad ke saath. Image fixed size me render hoti hai (har device par same). Neeche se download karo ya WhatsApp par bhejo."
      />

      <ExcelPatraCard />

      {error && (
        <Notice tone="bad" icon={AlertTriangle}>
          {error}
        </Notice>
      )}

      {loading ? (
        <Skeleton className="h-48 w-full rounded-xl bg-stone-100" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
          <Panel title="Completed poojas" bodyClassName="p-2 sm:p-3">
            {batches.length === 0 && (
              <EmptyState
                icon={ScrollText}
                title="Koi completed batch nahi"
                description={`Proof Upload me batch "Mark Seva Completed" karein.`}
                className="py-6"
              />
            )}
            {/* Horizontal chip strip on phones/tablets, vertical list on lg+ */}
            <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible -mx-0.5 px-0.5 pb-1 lg:pb-0">
              {batches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedId(b.id)}
                  aria-pressed={selectedId === b.id}
                  className={`shrink-0 w-[220px] lg:w-full text-left px-3 py-2.5 min-h-[44px] rounded-lg border text-sm transition-colors ${
                    selectedId === b.id
                      ? "border-orange-500 bg-orange-50/60 ring-1 ring-orange-500/20"
                      : "border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  <div className="font-medium text-stone-900 text-[13px] leading-snug">
                    {batchLabel(b.batch_type, b.batch_date)}
                  </div>
                  <div className="text-xs text-stone-500 mt-1 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-stone-400" />
                    {b.subscriber_count} parivaar
                    <span className="text-stone-300">·</span>
                    <span className="font-medium text-stone-700">{b.patra_count} patra</span>
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          {selected ? (
            <BatchPatras key={selected.id} batch={selected} onCountChanged={loadBatches} />
          ) : (
            <div className="admin-card border-dashed">
              <EmptyState
                title="Ek completed pooja chunein"
                description="Upar / left ki list se pooja select karein."
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Per-batch patras ─────────────────────────────────────────
function BatchPatras({
  batch,
  onCountChanged,
}: {
  batch: DoneBatch;
  onCountChanged: () => Promise<void>;
}) {
  const [patras, setPatras] = useState<AshirwadPatraRow[]>([]);
  const [contacts, setContacts] = useState<Map<string, Contact>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const autoRan = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const res = await fetchAllRows<AshirwadPatraRow>((from, to) =>
      supabase
        .from("ashirwad_patras")
        .select(
          "id,batch_id,subscription_id,patra_no,names,gotra,seva_names,batch_kind,batch_date,occasion_label,image_url,status,delivered_at,delivered_via,created_at",
        )
        .eq("batch_id", batch.id)
        .order("patra_no")
        .range(from, to),
    );
    if (res.error) {
      setErr(res.error);
      setLoading(false);
      return;
    }
    const rows = res.data;
    setPatras(rows);

    // Contact map (phone for WhatsApp) via subscription → profile.
    const subIds = [...new Set(rows.map((r) => r.subscription_id))];
    const cmap = new Map<string, Contact>();
    for (let i = 0; i < subIds.length; i += 200) {
      const chunk = subIds.slice(i, i + 200);
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("id,user_id")
        .in("id", chunk);
      const userBySub = new Map((subs ?? []).map((s) => [s.id, s.user_id as string]));
      const userIds = [...new Set([...userBySub.values()])];
      const profByUser = new Map<string, { full_name: string | null; phone: string | null }>();
      for (let j = 0; j < userIds.length; j += 200) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,full_name,phone")
          .in("id", userIds.slice(j, j + 200));
        for (const p of profs ?? [])
          profByUser.set(p.id, { full_name: p.full_name, phone: p.phone });
      }
      for (const [subId, userId] of userBySub) {
        const p = profByUser.get(userId);
        cmap.set(subId, { phone: p?.phone ?? null, accountName: p?.full_name ?? null });
      }
    }
    setContacts(cmap);
    setLoading(false);
  }, [batch.id]);

  useEffect(() => {
    autoRan.current = false;
    void load();
  }, [load]);

  async function generate() {
    setBusy(true);
    setNote(null);
    setErr(null);
    try {
      const { created, candidates } = await generateAshirwadPatrasForBatch(batch.id);
      setNote(
        created > 0
          ? `${created} naye patra ban gaye (kul ${candidates} parivaar).`
          : `Sab patra pehle se maujood hain (${candidates} parivaar).`,
      );
      await load();
      await onCountChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Patra generation fail hua");
    } finally {
      setBusy(false);
    }
  }

  const renderPending = useCallback(
    async (rows: AshirwadPatraRow[]) => {
      const pending = rows.filter((r) => !r.image_url);
      if (pending.length === 0) return;
      setBusy(true);
      setErr(null);
      setProgress({ done: 0, total: pending.length });
      let done = 0;
      const failures: string[] = [];
      for (const r of pending) {
        try {
          const file = await renderPatraToFile({
            names: r.names,
            gotra: r.gotra,
            sevaNames: r.seva_names,
            occasionLabel: r.occasion_label,
            batchDate: r.batch_date,
            patraNo: r.patra_no,
          });
          const sign = await callAdminApi<SignResponse>("/api/cloudinary/sign-upload", {
            folder: `punyata-ashirwad/${batch.id}`,
            resourceType: "image",
          });
          const { secure_url } = await uploadToCloudinary(sign, file, () => {});
          const { error: upErr } = await supabase
            .from("ashirwad_patras")
            .update({ image_url: secure_url })
            .eq("id", r.id);
          if (upErr) throw new Error(upErr.message);
          setPatras((prev) =>
            prev.map((p) => (p.id === r.id ? { ...p, image_url: secure_url } : p)),
          );
        } catch (e) {
          failures.push(`${r.patra_no}: ${e instanceof Error ? e.message : "fail"}`);
        }
        done += 1;
        setProgress({ done, total: pending.length });
      }
      setProgress(null);
      setBusy(false);
      if (failures.length > 0) setErr(`${failures.length} image render fail hui: ${failures[0]}`);
    },
    [batch.id],
  );

  // "Create itself": once patras are loaded, auto-render any pending
  // images so the admin just reviews + sends. Runs once per batch open.
  useEffect(() => {
    if (loading || busy || autoRan.current || patras.length === 0) return;
    if (patras.some((p) => !p.image_url)) {
      autoRan.current = true;
      void renderPending(patras);
    }
  }, [loading, busy, patras, renderPending]);

  const readyCount = patras.filter((p) => p.image_url).length;

  async function markDelivered(row: AshirwadPatraRow) {
    const { error: e } = await supabase
      .from("ashirwad_patras")
      .update({
        status: "delivered",
        delivered_at: new Date().toISOString(),
        delivered_via: "whatsapp",
      })
      .eq("id", row.id);
    if (e) {
      setErr(e.message);
      return;
    }
    setPatras((prev) =>
      prev.map((p) =>
        p.id === row.id
          ? {
              ...p,
              status: "delivered",
              delivered_at: new Date().toISOString(),
              delivered_via: "whatsapp",
            }
          : p,
      ),
    );
  }

  function waLink(row: AshirwadPatraRow): string | null {
    const c = contacts.get(row.subscription_id);
    if (!c?.phone || !row.image_url) return null;
    const msg = `🙏 ${row.names.join(", ")} — aapka Ashirwad Patra (${row.occasion_label} · ${formatHindiDate(
      row.batch_date,
    )}).\n\nPatra yahaan dekhein:\n${row.image_url}\n\n— पुण्यता · सेवा हमारी, पुण्य आपका`;
    return buildWaLink(c.phone, msg);
  }

  return (
    <Panel
      title={batchLabel(batch.batch_type, batch.batch_date)}
      description={`${patras.length} patra · ${readyCount} image ready`}
      bodyClassName="space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 sm:flex-wrap">
        <Button
          onClick={generate}
          disabled={busy}
          className="h-10 sm:h-9 gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
        >
          {busy && !progress ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {patras.length === 0 ? "Patra Generate Karein" : "Missing Patra Add Karein"}
        </Button>
        {patras.some((p) => !p.image_url) && (
          <Button
            variant="outline"
            onClick={() => renderPending(patras)}
            disabled={busy}
            className="h-10 sm:h-9 gap-1.5"
          >
            {progress ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImageIcon className="w-4 h-4" />
            )}
            {progress
              ? `Rendering ${progress.done}/${progress.total}…`
              : `Render pending (${patras.filter((p) => !p.image_url).length})`}
          </Button>
        )}
        {note && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            {note}
          </span>
        )}
      </div>
      {err && (
        <Notice tone="bad" icon={AlertTriangle}>
          <span className="break-words">{err}</span>
        </Notice>
      )}

      {loading ? (
        <Skeleton className="h-40 w-full rounded-lg bg-stone-100" />
      ) : patras.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Is batch ke liye abhi koi patra nahi bana"
          description={`"Patra Generate Karein" dabayein.`}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {patras.map((p) => {
            const wa = waLink(p);
            const contact = contacts.get(p.subscription_id);
            return (
              <div
                key={p.id}
                className="rounded-lg border border-stone-200 bg-white p-3 flex flex-col gap-3"
              >
                <div className="flex gap-3">
                  <div className="w-20 shrink-0">
                    {p.image_url ? (
                      <a href={p.image_url} target="_blank" rel="noreferrer">
                        <img
                          src={p.image_url}
                          alt={`Ashirwad Patra ${p.patra_no}`}
                          className="w-20 h-auto rounded border border-stone-200 hover:opacity-90"
                        />
                      </a>
                    ) : (
                      <div className="w-20 h-28 rounded border border-dashed border-stone-300 bg-stone-50 flex items-center justify-center text-[11px] text-stone-400 text-center px-1">
                        image ban rahi…
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="text-sm font-medium text-stone-900 leading-snug break-words">
                      {p.names.join(", ")}
                    </div>
                    <div className="text-xs text-stone-500 font-mono break-all">{p.patra_no}</div>
                    {p.status === "delivered" ? (
                      <StatusPill tone="good">Delivered</StatusPill>
                    ) : (
                      <StatusPill tone="warn">Ready</StatusPill>
                    )}
                    {!wa && (
                      <div className="text-xs text-stone-400">
                        {!contact?.phone ? "no phone" : "image pending"}
                      </div>
                    )}
                  </div>
                </div>
                {(p.image_url || wa) && (
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    {p.image_url && (
                      <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
                        <a href={downloadUrl(p.image_url)}>
                          <Download className="w-4 h-4" /> Download
                        </a>
                      </Button>
                    )}
                    {p.image_url && (
                      <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
                        <a href={p.image_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-4 h-4" /> Preview
                        </a>
                      </Button>
                    )}
                    {wa && (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                      >
                        <a href={wa} target="_blank" rel="noreferrer">
                          <MessageCircle className="w-4 h-4" /> WhatsApp
                        </a>
                      </Button>
                    )}
                    {p.status !== "delivered" && p.image_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markDelivered(p)}
                        className="h-9 gap-1.5 text-stone-700"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Mark Sent
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
        WhatsApp par image seedhe attach karne ke liye Meta API chahiye (abhi pending) — isliye link
        message me patra ka image URL bhi jaata hai. Aap chahein to "Download" karke image manually
        attach kar sakte hain, phir "Mark Sent" dabayein.
      </p>
    </Panel>
  );
}

// ─── Excel (Pandit list) → bulk Ashirwad Patra ────────────────
// Standalone path: parse the "Gotra Batches" sheet client-side, render
// one patra per gotra row (whole family named), and download each or
// all as a ZIP. No DB / no subscription needed — the Pandit list has
// no phone/plan, so this is generate-and-download only.
interface ExcelResult {
  entry: ExcelPatraEntry;
  patraNo: string;
  url: string;
  file: File;
}

function ExcelPatraCard() {
  const today = new Date().toISOString().slice(0, 10);
  const [sevas, setSevas] = useState<SevaLite[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [occasion, setOccasion] = useState("अंतिम शनिवार संकल्प");
  const [dateISO, setDateISO] = useState(today);
  const [entries, setEntries] = useState<ExcelPatraEntry[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<ExcelResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("sevas")
        .select("id,name,slug,sort_order,is_active")
        .eq("is_active", true)
        .order("sort_order");
      const list = (data as SevaLite[]) ?? [];
      setSevas(list);
      // Preselect non-hawan sevas; admin ticks the correct day's hawan.
      setSelected(new Set(list.filter((s) => !isHawanSeva(s)).map((s) => s.id)));
    })();
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setResults([]);
    setEntries([]);
    setFileName(file.name);
    try {
      const rows = await parseXlsxFirstSheet(file);
      const parsed = parseGotraBatchRows(rows);
      if (parsed.length === 0) throw new Error("Is sheet me koi gotra/naam row nahi mili.");
      setEntries(parsed);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Excel padhne me dikkat");
      setFileName(null);
    } finally {
      e.target.value = ""; // allow re-uploading the same file
    }
  }

  async function generate() {
    if (entries.length === 0) return;
    const sevaNames = sevas.filter((s) => selected.has(s.id)).map((s) => s.name);
    setBusy(true);
    setErr(null);
    setResults([]);
    setProgress({ done: 0, total: entries.length });
    const yyyymmdd = dateISO.replace(/-/g, "");
    const out: ExcelResult[] = [];
    try {
      for (let i = 0; i < entries.length; i++) {
        const en = entries[i];
        const patraNo = `PL-${yyyymmdd}-${String(i + 1).padStart(3, "0")}`;
        const file = await renderPatraToFile({
          names: en.names,
          gotra: en.gotra,
          sevaNames,
          occasionLabel: occasion.trim() || "संकल्प सेवा",
          batchDate: dateISO,
          patraNo,
        });
        out.push({ entry: en, patraNo, url: URL.createObjectURL(file), file });
        setProgress({ done: i + 1, total: entries.length });
      }
      setResults(out);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Image banane me dikkat");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function downloadAll() {
    if (results.length === 0) return;
    setBusy(true);
    try {
      const files = await Promise.all(
        results.map(async (r) => ({
          name: `${r.patraNo}.png`,
          data: new Uint8Array(await r.file.arrayBuffer()),
        })),
      );
      const blob = zipStore(files);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ashirwad-patra-${dateISO}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  const hawans = sevas.filter((s) => isHawanSeva(s));
  const normal = sevas.filter((s) => !isHawanSeva(s));

  return (
    <Panel
      title="Excel se Patra banayein — Pandit list"
      description="Pandit-ji ki Gotra sheet (.xlsx) upload karein — har gotra ka poora parivaar ek patra me. Occasion, date aur sevayein chunein, phir download karein (ek-ek ya sab ZIP me)."
      bodyClassName="space-y-5"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-stone-700">Occasion (avsar)</span>
          <input
            type="text"
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            className="w-full h-10 border border-stone-200 rounded-md px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
            placeholder="अंतिम शनिवार संकल्प"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-stone-700">Date</span>
          <input
            type="date"
            value={dateISO}
            onChange={(e) => setDateISO(e.target.value)}
            className="w-full h-10 border border-stone-200 rounded-md px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
          />
        </label>
      </div>

      <div>
        <div className="text-[13px] font-medium text-stone-700 mb-2">
          Sevayein (patra par dikhengi)
        </div>
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2">
          {normal.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2 min-h-[40px] px-3 rounded-md border border-stone-200 text-sm text-stone-700 cursor-pointer hover:bg-stone-50 has-[:checked]:border-orange-300 has-[:checked]:bg-orange-50/50"
            >
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => toggle(s.id)}
                className="w-4 h-4 accent-orange-600"
              />
              {s.name}
            </label>
          ))}
          {hawans.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2 min-h-[40px] px-3 rounded-md border border-dashed border-amber-300 text-sm text-stone-800 font-medium cursor-pointer hover:bg-amber-50/60 has-[:checked]:border-solid has-[:checked]:bg-amber-50"
              title="Us din ka hawan chunein: 2nd मंगलवार = गृह शांति, अंतिम शनिवार = सर्व रोग निवारण"
            >
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => toggle(s.id)}
                className="w-4 h-4 accent-orange-600"
              />
              {s.name} 🔥
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 sm:flex-wrap">
        <label className="inline-flex items-center justify-center gap-2 h-11 sm:h-9 px-4 rounded-md border border-dashed border-stone-300 bg-stone-50 text-sm font-medium text-stone-700 cursor-pointer hover:bg-stone-100 hover:border-stone-400 transition-colors">
          <FileSpreadsheet className="w-4 h-4 text-stone-500" />
          Excel chunein (.xlsx)
          <input type="file" accept=".xlsx" onChange={onFile} className="hidden" />
        </label>
        {fileName && (
          <span className="text-xs text-stone-600 break-all">
            {fileName} — <b>{entries.length}</b> patra milе
          </span>
        )}
        {entries.length > 0 && (
          <Button
            onClick={generate}
            disabled={busy}
            className="h-11 sm:h-9 gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
          >
            {progress ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImageIcon className="w-4 h-4" />
            )}
            {progress ? `Banate hue ${progress.done}/${progress.total}…` : "Patra banayein"}
          </Button>
        )}
        {results.length > 0 && (
          <Button
            variant="outline"
            onClick={downloadAll}
            disabled={busy}
            className="h-11 sm:h-9 gap-1.5"
          >
            <FolderArchive className="w-4 h-4" /> Sab download karein (ZIP)
          </Button>
        )}
      </div>
      {err && (
        <Notice tone="bad" icon={AlertTriangle}>
          <span className="break-words">{err}</span>
        </Notice>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {results.map((r) => (
            <div
              key={r.patraNo}
              className="rounded-lg border border-stone-200 bg-white p-2 space-y-1.5 min-w-0"
            >
              <a href={r.url} target="_blank" rel="noreferrer">
                <img
                  src={r.url}
                  alt={r.entry.gotra}
                  className="w-full h-auto rounded border border-stone-200 hover:opacity-90"
                />
              </a>
              <div className="text-[13px] font-medium text-stone-900 truncate">{r.entry.gotra}</div>
              <div className="text-xs text-stone-500 truncate">{r.entry.names.join(", ")}</div>
              <Button asChild variant="outline" size="sm" className="w-full h-9 gap-1.5">
                <a href={r.url} download={`${r.patraNo}.png`}>
                  <Download className="w-4 h-4" /> Download
                </a>
              </Button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
