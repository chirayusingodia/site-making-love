import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Clock,
  Users,
  MapPin,
  LogIn,
  AlertCircle,
  XCircle,
  CircleStop,
  RotateCcw,
  ScrollText,
  Download,
  ExternalLink,
  Landmark,
  CalendarDays,
  BookOpen,
  Flame,
  Sun,
  Leaf,
  Heart,
  MessageCircle,
  Plus,
  Play,
  type LucideIcon,
} from "lucide-react";
import { SiteChrome } from "@/components/site-chrome";
import { useSessionProfile } from "@/hooks/use-session";
import { supabase } from "@/lib/supabase";
import { pendingCheckoutIsStale } from "@/lib/checkout-ttl";
import { usePublicPlans, getPlanById, formatINR } from "@/lib/plans";
import { isHawanSeva, type LiveSeva } from "@/lib/plans-schedule";
import { nextSevaDate, fmtSevaDate, daysUntil, monthsActive } from "@/lib/seva-dates";
import { useTranslation, localizedName, type Lang } from "@/lib/translations";

export const Route = createFileRoute("/my-subscription")({
  head: () => ({
    meta: [
      { title: "My Subscription — पुण्यता" },
      {
        name: "description",
        content: "अपना पुण्य बैंक — सक्रिय सदस्यता, संपन्न सेवाएँ, आशीर्वाद पत्र एवं परिवार संकल्प।",
      },
    ],
  }),
  component: MySubscriptionPage,
});

// ─────────────────────────────────────────────────────────────
// MY SUBSCRIPTION — the devotee's "Punya Bank" passbook.
//
// Fully bilingual: every UI label is a translation key (t()), dates
// format per the active language, and seva NAMES come straight from
// the DB (ritual names, shown as-is in both languages). Everything is
// real (RLS-scoped) or calendar-derived — nothing fabricated.
// Accumulated punya = months active + completed sevas (distinct
// delivered proof batches) + Ashirwad Patras; "kya-kya" is the LIVE
// plan composition; the bahi-khata ledger is driven by ashirwad_patras.
// Status stays honest (Bug B): fresh pending → "Confirming…", stale →
// explicit retry, others keep their own labels.
// ─────────────────────────────────────────────────────────────

interface SubRow {
  id: string;
  status: string;
  start_date: string | null;
  next_billing_date: string | null;
  created_at: string;
  plans: {
    name: string;
    name_en: string | null;
    billing_period: string;
    price_paise: number;
    slug: string;
  } | null;
}

interface MemberRow {
  id: string;
  slot_number: number;
  full_name: string;
  gotra: string | null;
}

interface PatraRow {
  id: string;
  patra_no: string;
  names: string[];
  occasion_label: string;
  batch_date: string;
  image_url: string | null;
}

interface ProofRow {
  batch_id: string;
  is_delivered: boolean;
}

// Cloudinary: force a download (Content-Disposition: attachment).
function patraDownloadUrl(u: string): string {
  return u.includes("/upload/") ? u.replace("/upload/", "/upload/fl_attachment/") : u;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  // [Pass-2 F16] anchor date-only strings to IST midnight — a bare
  // YYYY-MM-DD parses as UTC and displayed one day early for viewers
  // west of UTC.
  const iso = d.length === 10 ? `${d}T00:00:00+05:30` : d;
  const dt = new Date(iso);
  return isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      });
}

// Short day + month for the ledger date chip, per language.
function fmtDayMonth(d: string, lang: Lang): { day: string; mon: string } {
  const iso = d.length === 10 ? `${d}T00:00:00+05:30` : d;
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return { day: "—", mon: "" };
  const loc = lang === "english" ? "en-IN" : "hi-IN";
  return {
    day: dt.toLocaleDateString("en-IN", { day: "2-digit", timeZone: "Asia/Kolkata" }),
    mon: dt.toLocaleDateString(loc, { month: "short", timeZone: "Asia/Kolkata" }),
  };
}

// [Bug B] Honest status pill — colours/icons mirror admin.subscribers.tsx's
// StatusBadge so customer-facing and admin-facing language match. The
// "active" label is localised at the call site.
function statusPill(status: string, pendingStale: boolean) {
  if (status === "active") {
    return { label: "Active", cls: "bg-success/12 text-[#2f8f43]", icon: ShieldCheck };
  }
  if (status === "pending") {
    return pendingStale
      ? {
          label: "Payment Pending",
          cls: "bg-amber-50 text-amber-800 border border-amber-200",
          icon: AlertCircle,
        }
      : { label: "Confirming…", cls: "bg-secondary text-muted-foreground", icon: Clock };
  }
  if (status === "cancelled")
    return { label: "Cancelled", cls: "bg-rose-50 text-rose-800 border border-rose-200", icon: XCircle };
  if (status === "halted")
    return { label: "Halted", cls: "bg-red-50 text-red-800 border border-red-200", icon: CircleStop };
  if (status === "expired")
    return { label: "Expired", cls: "bg-slate-100 text-slate-500 border border-slate-200", icon: AlertCircle };
  return { label: status, cls: "bg-secondary text-muted-foreground", icon: AlertCircle };
}

// Map a live seva to a lucide glyph by name/slug keyword (Hindi + English).
function sevaIcon(s: LiveSeva): LucideIcon {
  const k = `${s.slug} ${s.name}`.toLowerCase();
  if (/sundar|पाठ|paath/.test(k)) return BookOpen;
  if (/hawan|havan|हवन/.test(k)) return Flame;
  if (/aarti|आरती/.test(k)) return Sun;
  if (/gau|गौ|cow/.test(k)) return Leaf;
  if (/vanar|वानर|monkey/.test(k)) return Heart;
  if (/bhojan|भोजन|sadhu|साधु|संत|santo|brahmin/.test(k)) return Users;
  return Sparkles;
}

function MySubscriptionPage() {
  const { userId, loading: sessionLoading } = useSessionProfile();
  const { t, lang } = useTranslation();
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [membersBySub, setMembersBySub] = useState<Record<string, MemberRow[]>>({});
  const [patras, setPatras] = useState<PatraRow[]>([]);
  const [sevasCompleted, setSevasCompleted] = useState(0);
  const [loadingData, setLoadingData] = useState(true);
  const { data: plansData } = usePublicPlans();

  useEffect(() => {
    if (!userId) {
      setSubs([]);
      setLoadingData(false);
      return;
    }
    (async () => {
      setLoadingData(true);
      const subsRes = await supabase
        .from("subscriptions")
        .select(
          // plans(*) so a not-yet-migrated DB (no plans.name_en) still
          // returns rows; name_en lights up once migration 035 lands.
          "id,status,start_date,next_billing_date,created_at,plans(*)",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      const rows = (subsRes.data as unknown as SubRow[]) ?? [];
      setSubs(rows);

      const map: Record<string, MemberRow[]> = {};
      await Promise.all(
        rows.map(async (r) => {
          const fm = await supabase
            .from("family_members")
            .select("id,slot_number,full_name,gotra")
            .eq("subscription_id", r.id)
            .order("slot_number");
          map[r.id] = (fm.data as MemberRow[]) ?? [];
        }),
      );
      setMembersBySub(map);

      const subIds = rows.map((r) => r.id);
      if (subIds.length > 0) {
        // Ashirwad Patra — issued per family after each completed pooja
        // (newest first; only rendered images shown). RLS-scoped.
        const pRes = await supabase
          .from("ashirwad_patras")
          .select("id,patra_no,names,occasion_label,batch_date,image_url")
          .in("subscription_id", subIds)
          .order("batch_date", { ascending: false });
        setPatras((pRes.data as PatraRow[]) ?? []);

        // Completed sevas = distinct batches with a delivered WhatsApp
        // proof for this devotee (proof_deliveries: user reads own),
        // PLUS any off-cycle sevas a telecaller/admin manually marked
        // done (seva_completions — batch-independent, e.g. a courtesy
        // seva done before her first monthly batch runs).
        const [dRes, scRes] = await Promise.all([
          supabase
            .from("proof_deliveries")
            .select("batch_id,is_delivered")
            .in("subscription_id", subIds)
            .eq("is_delivered", true),
          supabase.from("seva_completions").select("id").in("subscription_id", subIds),
        ]);
        const proofRows = (dRes.data as ProofRow[]) ?? [];
        const manualCount = scRes.data?.length ?? 0;
        setSevasCompleted(new Set(proofRows.map((p) => p.batch_id)).size + manualCount);
      } else {
        setPatras([]);
        setSevasCompleted(0);
      }
      setLoadingData(false);
    })();
  }, [userId]);

  if (sessionLoading || (userId && loadingData)) {
    return (
      <SiteChrome>
        <main className="max-w-md mx-auto px-4 pb-24 pt-6 space-y-4 animate-pulse">
          <div className="h-44 w-full bg-black/5 rounded-3xl" />
          <div className="h-28 w-full bg-black/5 rounded-2xl" />
          <div className="h-40 w-full bg-black/5 rounded-2xl" />
        </main>
      </SiteChrome>
    );
  }

  if (!userId) {
    return (
      <SiteChrome>
        <main className="max-w-md mx-auto px-4 pb-24 pt-8">
          <div className="text-center space-y-5">
            <div className="w-20 h-20 rounded-full bg-brand-soft flex items-center justify-center mx-auto">
              <Landmark size={34} className="text-brand" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t("ms_login_title")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{t("ms_login_desc")}</p>
            </div>
            <Link
              to="/login"
              search={{ redirect: "/my-subscription" }}
              className="inline-flex items-center gap-2 bg-brand text-white font-bold px-6 py-3.5 rounded-full hover:bg-brand-deep transition-colors"
            >
              <LogIn size={18} /> {t("ms_login_btn")}
            </Link>
          </div>
        </main>
      </SiteChrome>
    );
  }

  const current =
    subs.find((s) => s.status === "active") ?? subs.find((s) => s.status === "pending") ?? subs[0];

  if (!current) {
    return (
      <SiteChrome>
        <main className="max-w-md mx-auto px-4 pb-24 pt-8">
          <div className="text-center space-y-5">
            <div className="w-20 h-20 rounded-full bg-brand-soft flex items-center justify-center mx-auto">
              <Landmark size={34} className="text-brand" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t("ms_empty_title")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{t("ms_empty_desc")}</p>
            </div>
            <Link
              to="/plans"
              className="inline-flex items-center gap-2 bg-brand text-white font-bold px-6 py-3.5 rounded-full hover:bg-brand-deep transition-colors"
            >
              {t("ms_see_sadasyata")} <ArrowRight size={18} />
            </Link>
          </div>
        </main>
      </SiteChrome>
    );
  }

  const members = membersBySub[current.id] ?? [];
  const plan = current.plans;
  const isActive = current.status === "active";

  // [Bug B] one honest read of "what kind of non-active is this?"
  const pendingStale = current.status === "pending" && pendingCheckoutIsStale(current.created_at);
  const pill = statusPill(current.status, pendingStale);
  const PillIcon = pill.icon;
  const pillLabel = current.status === "active" ? t("s_active") : pill.label;

  const statusCopy: string | null =
    current.status === "pending"
      ? pendingStale
        ? "Payment complete nahi hua — dobara try karein."
        : "Payment mil gaya — activation webhook se poora hota hai, kuch hi minute mein."
      : current.status === "cancelled"
        ? "Yeh sadasyata cancel ho gayi hai."
        : current.status === "expired"
          ? "Yeh sadasyata expire ho gayi hai — naya Sadasyata chunein."
          : current.status === "halted"
            ? "Payment ki samasya ki wajah se seva ruki hai — hamari team aapse sampark karegi."
            : null;

  // Live plan composition for "kya-kya" — never hardcoded.
  const livePlan = plansData && plan ? getPlanById(plansData.plans, plan.slug) : undefined;
  const includedSevas = livePlan?.includedSevas ?? [];
  const hasPrasad = livePlan?.comparison.prasad?.has ?? false;
  const hasLastSaturday = includedSevas.some(isHawanSeva);

  // Accumulated punya (all real / calendar-derived).
  const months = monthsActive(current.start_date ?? current.created_at);
  const patraCount = patras.length;

  // Next scheduled seva (cadence hint) — only meaningful while active.
  const next = isActive ? nextSevaDate(hasLastSaturday) : null;
  const nextInDays = next ? daysUntil(next.date) : 0;
  const whenLabel = next
    ? nextInDays > 0
      ? lang === "english"
        ? `in ${nextInDays} ${nextInDays === 1 ? t("unit_day") : t("unit_days")}`
        : `${nextInDays} ${t("unit_days")} में`
      : t("s_today")
    : "";

  const joinLabel = fmtDate(current.start_date ?? current.created_at);
  const priceLabel = plan ? formatINR(plan.price_paise) : "";
  const whatsInTitle = plan
    ? lang === "english"
      ? `What you get for ${priceLabel}`
      : `${priceLabel} में क्या-क्या`
    : t("ms_whats_included");
  const perLabel = plan?.billing_period === "yearly" ? t("ms_per_year") : t("ms_per_month");

  return (
    <SiteChrome>
      <main className="max-w-md mx-auto px-4 pb-24 pt-6 space-y-4">
        {/* ═══ PUNYA BANK — passbook hero ═══ */}
        <section
          className="relative overflow-hidden rounded-3xl p-5 text-[#FFF3EA] shadow-[0_14px_36px_rgba(122,42,16,0.35)] animate-fade-up"
          style={{ background: "radial-gradient(120% 120% at 85% 0%, #E85D1F 0%, #C0451A 45%, #7A2A10 100%)" }}
        >
          <div className="absolute inset-0 opacity-10" style={{ background: "repeating-linear-gradient(180deg, transparent 0 27px, #fff 27px 28px)" }} />
          <svg className="absolute -right-7 -top-7 opacity-[0.18]" width="150" height="150" viewBox="0 0 100 100" fill="none" stroke="#FFE7B8" strokeWidth="1" aria-hidden="true">
            <circle cx="50" cy="50" r="46" /><circle cx="50" cy="50" r="30" />
            <path d="M50 4V96M4 50H96M18 18 82 82M82 18 18 82" />
          </svg>
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark size={18} className="text-[#FFE7B8]" />
                <span className="text-xs font-bold uppercase tracking-[0.1em] text-[#FFE7B8]">{t("ms_punya_bank")}</span>
              </div>
              <span className="text-[11px] text-[#FFE7B8]/85">{t("ms_joined")} · {joinLabel}</span>
            </div>

            {sevasCompleted > 0 ? (
              <div className="mt-4 flex items-end gap-2.5">
                <div className="font-display text-[52px] font-extrabold leading-[0.9] text-white">{sevasCompleted}</div>
                <div className="pb-1.5">
                  <div className="text-[15px] font-bold text-white">{t("ms_sevas_done")}</div>
                  <div className="text-xs text-[#FFF3EA]/80">{t("ms_in_name_gotra")}</div>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <div className="text-[21px] font-bold text-white">{t("ms_journey")}</div>
                <div className="text-xs text-[#FFF3EA]/85 mt-0.5">
                  {next
                    ? `${t("ms_first_seva")} — ${fmtSevaDate(next.date, lang)} (${t(next.labelKey)})`
                    : t("ms_confirm_wait")}
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <PunyaStat value={months > 0 ? `${months} ${t("unit_months")}` : t("ms_new")} label={t("ms_active_membership")} />
              <PunyaStat value={`${patraCount}`} label={t("ms_patra")} />
              <PunyaStat value={`${sevasCompleted}`} label={t("ms_completed_sevas")} />
            </div>

            <div className="mt-3.5 pt-3 border-t border-[#FFE7B8]/25 flex items-center gap-2">
              <Sparkles size={15} className="text-[#FFE7B8]" />
              <span className="font-scripture text-[13px] text-[#FFF3EA]">{t("ms_tagline")}</span>
            </div>
          </div>
        </section>

        {/* ═══ ACTIVE MEMBERSHIP ═══ */}
        <div className="card-soft p-5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-brand">{t("ms_current")}</div>
            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${pill.cls}`}>
              <PillIcon size={12} /> {pillLabel}
            </span>
          </div>
          <div className="flex items-end justify-between mt-2">
            <div>
              <div className="text-xl font-bold">
                {plan ? localizedName(plan.name, plan.name_en, lang) : "—"}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{t("ms_location")}</div>
            </div>
            {plan && (
              <div className="text-right shrink-0">
                <span className="font-display text-2xl font-extrabold text-brand">{priceLabel}</span>
                <span className="text-sm text-muted-foreground font-semibold">{perLabel}</span>
              </div>
            )}
          </div>

          {statusCopy && (
            <div className={`text-xs mt-2 ${pendingStale ? "text-amber-800 font-semibold" : "text-muted-foreground"}`}>
              {statusCopy}
            </div>
          )}

          {isActive && (
            <div className="flex gap-2.5 mt-3.5">
              <div className="flex-1 bg-[#FFF7F1] rounded-2xl p-3">
                <div className="flex items-center gap-1.5 text-brand">
                  <CalendarDays size={14} />
                  <span className="text-[11px] font-bold">{t("ms_next_seva")}</span>
                </div>
                <div className="text-sm font-bold mt-1">{next ? fmtSevaDate(next.date, lang) : "—"}</div>
                <div className="text-[11px] text-muted-foreground">
                  {next ? t(next.labelKey) : ""}{whenLabel ? ` · ${whenLabel}` : ""}
                </div>
              </div>
              <div className="flex-1 bg-[#FFF7F1] rounded-2xl p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock size={14} />
                  <span className="text-[11px] font-bold">{t("ms_next_billing")}</span>
                </div>
                <div className="text-sm font-bold mt-1">{fmtDate(current.next_billing_date)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t("ms_auto_renew")}{plan ? ` · ${priceLabel}` : ""}
                </div>
              </div>
            </div>
          )}

          {pendingStale && plan?.slug && (
            // [Bug B] explicit retry — the checkout discards the dead
            // pending row and creates a fresh Razorpay subscription.
            <Link
              to="/checkout/$planId"
              params={{ planId: plan.slug }}
              className="mt-3.5 inline-flex items-center gap-2 bg-brand text-white text-sm font-bold px-5 py-2.5 rounded-full hover:bg-brand-deep transition-colors"
            >
              <RotateCcw size={15} /> {t("ms_retry_pay")} <ArrowRight size={15} />
            </Link>
          )}
        </div>

        {/* ═══ WHAT'S INCLUDED — live composition ═══ */}
        {includedSevas.length > 0 && (
          <div className="card-soft p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-brand">{t("ms_in_membership")}</div>
                <h3 className="text-[17px] mt-0.5">{whatsInTitle}</h3>
              </div>
              <div className="bg-accent text-brand text-[11px] font-extrabold px-2.5 py-1.5 rounded-full whitespace-nowrap">
                {includedSevas.length} {t("s_sevas")}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mt-3.5">
              {includedSevas.map((s) => {
                const Icon = sevaIcon(s);
                const twice = s.days.length > 1;
                return (
                  <div key={s.id} className="rounded-2xl bg-[#FFF7F1] border border-brand/10 p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Icon size={22} className="text-brand" />
                      {twice && (
                        <span className="bg-brand text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                          ×{s.days.length}
                        </span>
                      )}
                    </div>
                    <div className="text-[13.5px] font-bold leading-tight">{localizedName(s.name, s.nameEn, lang)}</div>
                    {s.days.length > 0 && (
                      <div className="text-[11px] text-muted-foreground leading-tight">{s.days.join(" + ")}</div>
                    )}
                  </div>
                );
              })}

              {/* Universal platform benefit — every plan, every seva. */}
              <div className="rounded-2xl bg-[#EAF8EE] border border-whatsapp/25 p-3 flex flex-col gap-2">
                <MessageCircle size={22} className="text-[#1FA855]" />
                <div className="text-[13.5px] font-bold leading-tight">{t("s_video_proof")}</div>
                <div className="text-[11px] text-[#1FA855] font-semibold leading-tight">{t("ms_video_proof_sub")}</div>
              </div>
            </div>

            <div className="flex items-center gap-3.5 mt-3.5 pt-3.5 border-t border-black/5">
              <div className="flex items-center gap-1.5">
                <Users size={17} className="text-brand" />
                <span className="text-xs font-bold">{t("ms_upto_family")}</span>
              </div>
              <div className="w-px h-5 bg-black/10" />
              <div className="flex items-center gap-1.5">
                <ScrollText size={17} className="text-brand" />
                <span className="text-xs font-bold">{t("ms_patra_each")}</span>
              </div>
            </div>
            {hasPrasad && (
              <div className="mt-2.5 inline-flex items-center gap-1.5 bg-brand-soft text-brand-deep text-[11px] font-bold px-3 py-1.5 rounded-full">
                <Sparkles size={12} /> {t("ms_prasad_box")}
              </div>
            )}
          </div>
        )}

        {/* ═══ PUNYA LEDGER (bahi-khata) — from Ashirwad Patras ═══ */}
        <div className="card-soft p-5">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-brand" />
            <h3 className="text-base">{t("ms_ledger")}</h3>
          </div>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">{t("ms_ledger_desc")}</p>

          {patras.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-brand/40 bg-brand-soft/30 p-4 text-center">
              <p className="text-xs font-semibold text-foreground/80">{t("ms_ledger_empty")}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {isActive && next
                  ? `${t("ms_ledger_empty_active_pre")} ${fmtSevaDate(next.date, lang)} ${t("ms_ledger_empty_active_post")}`
                  : t("ms_ledger_empty_inactive")}
              </p>
            </div>
          ) : (
            <ul className="mt-3">
              {patras.map((p) => {
                const dm = fmtDayMonth(p.batch_date, lang);
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2.5 border-b border-black/5 last:border-0">
                    <div className="w-10 text-center shrink-0">
                      <div className="text-base font-extrabold leading-none">{dm.day}</div>
                      <div className="text-[10px] font-semibold text-muted-foreground">{dm.mon}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-bold truncate">{p.occasion_label}</div>
                      <div className="text-[11px] text-muted-foreground">{t("ms_patra")} {p.patra_no}</div>
                    </div>
                    {p.image_url ? (
                      <a
                        href={p.image_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 bg-[#EAF8EE] text-[#1FA855] text-[11.5px] font-bold px-2.5 py-1.5 rounded-full shrink-0"
                      >
                        <Play size={12} /> {t("ms_proof")}
                      </a>
                    ) : (
                      <span className="text-[11px] text-muted-foreground shrink-0">{t("ms_preparing")}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ═══ ASHIRWAD PATRA gallery ═══ */}
        {patras.length > 0 && (
          <div className="card-soft p-5">
            <div className="flex items-center gap-2">
              <ScrollText size={18} className="text-brand" />
              <h3 className="text-base">{t("ms_patra_title")}</h3>
            </div>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">{t("ms_patra_desc")}</p>
            <div className="flex gap-3 mt-3 overflow-x-auto scrollbar-none pb-1">
              {patras.map((p) => (
                <div key={p.id} className="shrink-0 w-[104px]">
                  <div className="h-[140px] rounded-xl border border-brand/25 overflow-hidden bg-gradient-to-b from-[#FFF7EE] to-[#FDE9D6]">
                    {p.image_url ? (
                      <a href={p.image_url} target="_blank" rel="noreferrer">
                        <img src={p.image_url} alt={`${t("ms_patra")} ${p.patra_no}`} className="w-full h-full object-cover" />
                      </a>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-2 text-center">
                        <ScrollText size={24} className="text-brand-deep" />
                        <span className="text-[9px] text-muted-foreground">{t("ms_soon")}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 justify-center mt-1.5">
                    {p.image_url && (
                      <>
                        <a href={p.image_url} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-brand inline-flex items-center gap-1">
                          <ExternalLink size={11} /> {t("ms_view")}
                        </a>
                        <a href={patraDownloadUrl(p.image_url)} className="text-[11px] font-bold text-foreground/70 inline-flex items-center gap-1">
                          <Download size={11} /> {t("ms_save")}
                        </a>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ FAMILY / SANKALP ═══ */}
        <div className="card-soft p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={18} className={members.length === 0 ? "text-brand" : "text-foreground"} />
              <h3 className="text-base">{t("ms_family")}</h3>
            </div>
            <span className="text-xs text-muted-foreground font-semibold">{members.length}/4</span>
          </div>

          {members.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-brand/40 bg-brand-soft/30 p-4 text-center space-y-2">
              <p className="text-xs text-foreground/80 font-semibold">{t("ms_sankalp_pending")}</p>
              <p className="text-[11px] text-muted-foreground">{t("ms_sankalp_pending_desc")}</p>
              <Link to="/profile" className="inline-flex items-center gap-1.5 bg-brand text-white text-xs font-bold px-4 py-2 rounded-full mt-1">
                {t("ms_add_details")} <ArrowRight size={13} />
              </Link>
            </div>
          ) : (
            <>
              <ul className="mt-3 space-y-2">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between border-b border-black/5 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-accent text-brand text-xs font-extrabold flex items-center justify-center">
                        {m.full_name.trim().charAt(0)}
                      </div>
                      <span className="text-sm font-semibold">{m.full_name}</span>
                    </div>
                    <span className="text-muted-foreground text-[12.5px]">{m.gotra?.trim() || t("ms_gotra_unknown")}</span>
                  </li>
                ))}
              </ul>
              {members.length < 4 && (
                <Link
                  to="/profile"
                  className="mt-3 inline-flex items-center gap-1.5 bg-brand text-white text-xs font-bold px-4 py-2 rounded-full"
                >
                  <Plus size={13} />{" "}
                  {lang === "english"
                    ? `${t("ms_add_members_en_pre")} ${4 - members.length} ${t("ms_add_members_en_post")}`
                    : `${4 - members.length} ${t("ms_add_members_hi_post")}`}
                </Link>
              )}
            </>
          )}
        </div>

        {/* ═══ PRASAD ADDRESS ═══ */}
        <AddressCard />

        <Link
          to="/profile"
          className="w-full flex items-center justify-center gap-2 bg-secondary text-foreground font-bold py-3.5 rounded-full hover:bg-muted transition-colors"
        >
          {t("ms_complete_profile")} <ArrowRight size={18} />
        </Link>
      </main>
    </SiteChrome>
  );
}

function PunyaStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 rounded-2xl border border-[#FFE7B8]/25 bg-white/[0.13] p-2.5">
      <div className="text-[19px] font-extrabold text-white leading-tight">{value}</div>
      <div className="text-[11px] text-[#FFF3EA]/85 leading-tight">{label}</div>
    </div>
  );
}

function AddressCard() {
  // [Bug 3.8] Reuses the profile already resolved for the page — no
  // second auth round-trip.
  const { profile } = useSessionProfile();
  const { t } = useTranslation();
  const addr = {
    address_line1: profile?.address_line1 ?? null,
    state: profile?.state ?? null,
    pincode: profile?.pincode ?? null,
  };
  const filled = addr.address_line1?.trim();

  return (
    <div className="card-soft p-4 flex items-start gap-3">
      <MapPin size={18} className={filled ? "text-success mt-0.5" : "text-brand mt-0.5"} />
      <div className="min-w-0">
        <div className="text-sm font-bold">{t("ms_prasad_address")}</div>
        {filled ? (
          <p className="text-xs text-muted-foreground mt-0.5">
            {addr.address_line1}
            {addr.state ? `, ${addr.state}` : ""} {addr.pincode ? `- ${addr.pincode}` : ""}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">{t("ms_address_empty")}</p>
        )}
      </div>
    </div>
  );
}
