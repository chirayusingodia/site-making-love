// ─────────────────────────────────────────────────────────────
// PUNYATA — Ashirwad Patra (blessing certificate) logic
//
// After a pooja batch is marked done, ONE patra is issued per family
// unit (subscription), naming the WHOLE family — every family_members
// row, including the extra names that are not website users. Each
// patra's sevas are resolved through the SAME day-scoped rules the
// Pandit list uses (sevasForMember), so:
//   - Second Tuesday shows Griha Shanti Hawan,
//   - Last Saturday shows Sarv Rog Nivaran Hawan,
//   - Basic (no hawan) shows none,
//   - a catch-up family gets its plan sevas only (hawan excluded).
//
// The DB row is a SNAPSHOT: names / gotra / seva_names / occasion are
// frozen at issue time (see migration 031). Re-running generation is
// idempotent — existing patras are never rewritten.
// ─────────────────────────────────────────────────────────────

import { fetchAllRows, supabase } from "@/lib/supabase";
import {
  saturdayHawanSevaIds,
  sevasForMember,
  type BatchKind,
  type PlanSevaRow,
  type ScheduleRuleRow,
  type SevaLite,
} from "@/lib/sankalp-logic";

// ─── Blessing copy (the heart of the patra — approved design) ───
export const ASHIRWAD_BLESSING_LEAD =
  "ईश्वर आपके एवं आपके सम्पूर्ण परिवार पर सदैव अपनी कृपादृष्टि बनाए रखें।";

export const ASHIRWAD_BLESSING_BODY =
  "इस पुण्य अवसर पर आपके परिवार के सुख, आरोग्य एवं समृद्धि हेतु ये सेवाएँ पूर्ण श्रद्धा एवं भक्ति भाव से सम्पन्न की गईं। हमारी हार्दिक प्रार्थना है — आपके जीवन में सुख-शांति का वास हो, हर पग मंगलमय हो, घर-आँगन में लक्ष्मी का निवास और आनंद की वृद्धि होती रहे। आप स्वस्थ रहें, प्रसन्न रहें, दीर्घायु हों एवं यशस्वी हों — यही ईश्वर से हमारी विनम्र कामना है।";

const HI_MONTHS = [
  "जनवरी",
  "फरवरी",
  "मार्च",
  "अप्रैल",
  "मई",
  "जून",
  "जुलाई",
  "अगस्त",
  "सितम्बर",
  "अक्टूबर",
  "नवम्बर",
  "दिसम्बर",
];

/** '2026-09-27' → '27 सितम्बर 2026'. Date-only, zone-safe (pure split). */
export function formatHindiDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${HI_MONTHS[m - 1]} ${y}`;
}

/** Occasion line for the certificate — no plan/price, matches Pandit vocab. */
export function occasionLabel(kind: BatchKind, isCatchup: boolean): string {
  const base = kind === "second_tuesday" ? "द्वितीय मंगलवार संकल्प" : "अंतिम शनिवार संकल्प";
  return isCatchup ? `${base} · कैच-अप` : base;
}

// ─── Pandit-list Excel parsing (bulk patra generation) ─────────
// Sheet layout ("Gotra Batches"): repeating blocks of a "Batch N"
// header row, a "Gotra | Naam 1..Naam 6" header row, then up to 5
// gotra rows: [gotra, naam1, naam2, …]. One gotra row = one patra
// (that gotra's whole family named together).
export interface ExcelPatraEntry {
  batch: string;
  gotra: string;
  names: string[];
}

export function parseGotraBatchRows(rows: string[][]): ExcelPatraEntry[] {
  const out: ExcelPatraEntry[] = [];
  let batch = "";
  for (const r of rows) {
    const c0 = (r[0] ?? "").trim();
    if (!c0) continue;
    if (/^batch\b/i.test(c0)) {
      batch = c0;
      continue;
    }
    if (/^gotra$/i.test(c0)) continue; // column-header row
    const names = r
      .slice(1)
      .map((s) => (s ?? "").trim())
      .filter(Boolean);
    if (names.length === 0) continue; // title row / stray cell
    out.push({ batch, gotra: c0, names });
  }
  return out;
}

// ─── DB row shape (what the admin + devotee pages read) ─────────
export interface AshirwadPatraRow {
  id: string;
  batch_id: string;
  subscription_id: string;
  patra_no: string;
  names: string[];
  gotra: string | null;
  seva_names: string[];
  batch_kind: BatchKind;
  batch_date: string;
  occasion_label: string;
  image_url: string | null;
  status: "generated" | "delivered";
  delivered_at: string | null;
  delivered_via: string | null;
  created_at: string;
}

/**
 * Create the Ashirwad Patra rows for one completed batch — one per
 * family unit that has at least one name. Idempotent: existing rows
 * (same batch + subscription) are left untouched.
 *
 * Runs client-side in the admin browser (admin RLS on ashirwad_patras).
 * Self-contained — fetches everything it needs from `batchId`.
 */
export async function generateAshirwadPatrasForBatch(
  batchId: string,
): Promise<{ created: number; candidates: number }> {
  // 1. Batch header.
  const { data: batch, error: bErr } = await supabase
    .from("sankalp_batches")
    .select("id,batch_type,batch_date")
    .eq("id", batchId)
    .single();
  if (bErr || !batch) throw new Error(bErr?.message ?? "Batch not found");
  const kind = batch.batch_type as BatchKind;

  // 2. Members of this batch (paged — a large batch must not truncate).
  const sbsRes = await fetchAllRows<{ subscription_id: string; is_catchup: boolean }>((from, to) =>
    supabase
      .from("sankalp_batch_subscriptions")
      .select("subscription_id,is_catchup")
      .eq("batch_id", batchId)
      .order("id")
      .range(from, to),
  );
  if (sbsRes.error) throw new Error(sbsRes.error);
  const sbs = sbsRes.data;
  if (sbs.length === 0) return { created: 0, candidates: 0 };

  // 3. Static reference data (same sources as the proof-upload page).
  const [sevasRes, psRes, rulesRes] = await Promise.all([
    supabase.from("sevas").select("id,name,slug,sort_order,is_active").order("sort_order"),
    supabase.from("plan_sevas").select("plan_id,seva_id"),
    supabase.from("seva_schedule_rules").select("seva_id,weekday,occurrence"),
  ]);
  const sevas = (sevasRes.data as SevaLite[]) ?? [];
  const planSevas = (psRes.data as PlanSevaRow[]) ?? [];
  const rules = (rulesRes.data as ScheduleRuleRow[]) ?? [];
  const satHawan = saturdayHawanSevaIds(sevas, rules);

  // 4. Per-subscription plan + user, family names, profile fallback.
  const subIds = [...new Set(sbs.map((r) => r.subscription_id))];
  const planBySub = new Map<string, string>();
  const userBySub = new Map<string, string>();
  const membersBySub = new Map<
    string,
    { full_name: string; gotra: string | null; slot_number: number | null }[]
  >();

  for (let i = 0; i < subIds.length; i += 200) {
    const chunk = subIds.slice(i, i + 200);
    const { data: subData, error: subErr } = await supabase
      .from("subscriptions")
      .select("id,plan_id,user_id")
      .in("id", chunk);
    if (subErr) throw new Error(subErr.message);
    for (const s of subData ?? []) {
      planBySub.set(s.id, s.plan_id);
      userBySub.set(s.id, s.user_id);
    }
    const { data: fm, error: fmErr } = await supabase
      .from("family_members")
      .select("subscription_id,full_name,gotra,slot_number")
      .in("subscription_id", chunk);
    if (fmErr) throw new Error(fmErr.message);
    for (const m of fm ?? []) {
      if (!membersBySub.has(m.subscription_id)) membersBySub.set(m.subscription_id, []);
      membersBySub.get(m.subscription_id)!.push(m);
    }
  }

  // Profile name fallback for subscriptions with no family_members yet.
  const userIds = [...new Set([...userBySub.values()])];
  const nameByUser = new Map<string, string>();
  for (let i = 0; i < userIds.length; i += 200) {
    const { data } = await supabase
      .from("profiles")
      .select("id,full_name")
      .in("id", userIds.slice(i, i + 200));
    for (const p of data ?? []) if (p.full_name) nameByUser.set(p.id, p.full_name);
  }

  // 5. Build snapshot rows.
  const rows: Record<string, unknown>[] = [];
  for (const r of sbs) {
    const planId = planBySub.get(r.subscription_id);
    if (!planId) continue;

    const fam = (membersBySub.get(r.subscription_id) ?? [])
      .slice()
      .sort((a, b) => (a.slot_number ?? 99) - (b.slot_number ?? 99));
    let names = fam.map((m) => m.full_name?.trim()).filter((n): n is string => !!n);
    if (names.length === 0) {
      const uid = userBySub.get(r.subscription_id);
      const fallback = uid ? nameByUser.get(uid)?.trim() : null;
      if (fallback) names = [fallback];
      else continue; // no name anywhere → no patra to issue
    }
    const gotra = fam.find((m) => m.gotra?.trim())?.gotra?.trim() ?? null;
    const svs = sevasForMember({
      kind,
      planId,
      planSevas,
      sevas,
      saturdayHawanSevaIds: satHawan,
      scheduleRules: rules,
      isCatchup: r.is_catchup,
    });

    rows.push({
      batch_id: batchId,
      subscription_id: r.subscription_id,
      names,
      gotra,
      seva_names: svs.map((s) => s.name),
      batch_kind: kind,
      batch_date: batch.batch_date,
      occasion_label: occasionLabel(kind, r.is_catchup),
    });
  }

  // 6. Idempotent insert — skip any (batch, subscription) already issued.
  let created = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await supabase
      .from("ashirwad_patras")
      .upsert(rows.slice(i, i + 200), {
        onConflict: "batch_id,subscription_id",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) throw new Error(error.message);
    created += data?.length ?? 0;
  }

  return { created, candidates: rows.length };
}
