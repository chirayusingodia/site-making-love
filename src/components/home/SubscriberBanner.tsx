import { Link } from "@tanstack/react-router";
import { ArrowRight, Landmark, CalendarDays, Check } from "lucide-react";
import { useMySubscription } from "@/hooks/use-my-subscription";
import { useSessionProfile } from "@/hooks/use-session";
import { useTranslation, localizedName } from "@/lib/translations";
import { usePublicPlans, getPlanById } from "@/lib/plans";
import { isHawanSeva } from "@/lib/plans-schedule";
import { nextSevaDate, fmtSevaDate, daysUntil, monthsActive } from "@/lib/seva-dates";

// ─────────────────────────────────────────────────────────────
// PUNYATA — home "welcome back" banner for active subscribers
//
// Renders ONLY for a signed-in devotee with an active membership;
// everyone else (logged out, pending, lapsed, still loading) sees the
// normal marketing home, so this returns null in every other case.
// Fully bilingual via useTranslation — every UI label is a key, and
// dates/labels format per the current language. Seva NAMES come from
// the DB (ritual names, shown as-is in both languages). Numbers are
// real or calendar-derived.
// ─────────────────────────────────────────────────────────────

export function SubscriberBanner() {
  const { subscription, hasActive, loading } = useMySubscription();
  const { profile } = useSessionProfile();
  const { t, lang } = useTranslation();
  const { data } = usePublicPlans();

  if (loading || !hasActive || !subscription) return null;

  const plan = subscription.plan;
  const livePlan = data && plan ? getPlanById(data.plans, plan.slug) : undefined;
  const includedSevas = livePlan?.includedSevas ?? [];
  const hasLastSaturday = includedSevas.some(isHawanSeva);
  const sevaCount = includedSevas.length;

  const next = nextSevaDate(hasLastSaturday);
  const inDays = daysUntil(next.date);
  const months = monthsActive(subscription.start_date);

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? "";
  const planName = plan ? localizedName(plan.name, plan.name_en, lang) : "";
  const whenLabel =
    inDays > 0
      ? lang === "english"
        ? `in ${inDays} ${inDays === 1 ? t("unit_day") : t("unit_days")}`
        : `${inDays} ${t("unit_days")} में`
      : t("s_today");

  // Up to 4 seva-name pills + a Video Proof pill; overflow collapses to "+N".
  const pills = includedSevas.slice(0, 4).map((s) => localizedName(s.name, s.nameEn, lang));
  const extra = sevaCount - pills.length;

  return (
    <section className="animate-fade-up">
      <div
        className="relative overflow-hidden rounded-3xl p-5 text-[#FFF3EA] shadow-[0_14px_34px_rgba(122,42,16,0.32)]"
        style={{ background: "radial-gradient(120% 130% at 88% 0%, #E85D1F 0%, #C0451A 48%, #7A2A10 100%)" }}
      >
        <svg className="absolute -right-8 -bottom-9 opacity-15" width="150" height="150" viewBox="0 0 100 100" fill="none" stroke="#FFE7B8" strokeWidth="1" aria-hidden="true">
          <circle cx="50" cy="50" r="46" /><circle cx="50" cy="50" r="30" />
          <path d="M50 4V96M4 50H96M18 18 82 82M82 18 18 82" />
        </svg>

        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3FAE55]/90 px-2.5 py-1 text-[11px] font-bold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white" /> {t("b_active")}
            </span>
            <span className="font-scripture text-[13px] text-[#FFE7B8]">
              {months > 0 ? `${months} ${t("b_active_since")}` : t("b_just_joined")}
            </span>
          </div>

          <div className="mt-3">
            {firstName && (
              <div className="font-scripture text-sm text-[#FFE7B8]">
                {t("b_greeting")} {firstName} {t("b_ji")} 🙏
              </div>
            )}
            <div className="mt-0.5 text-xl font-bold text-white">
              {t("b_your")} <span className="text-[#FFE7B8]">{planName}</span> {t("b_seva_active")}
            </div>
          </div>

          <div className="mt-3.5 flex gap-2">
            <div className="flex-[1.3] rounded-2xl border border-[#FFE7B8]/25 bg-white/[0.13] p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] text-[#FFF3EA]/80">
                <CalendarDays size={13} /> {t("b_next_seva")}
              </div>
              <div className="mt-0.5 text-[14.5px] font-extrabold text-white">{fmtSevaDate(next.date, lang)}</div>
              <div className="text-[11px] text-[#FFE7B8]/90">{t(next.labelKey)} · {whenLabel}</div>
            </div>
            {sevaCount > 0 && (
              <div className="flex-1 rounded-2xl border border-[#FFE7B8]/25 bg-white/[0.13] p-2.5">
                <div className="text-[11px] text-[#FFF3EA]/80">{t("b_per_month")}</div>
                <div className="text-[17px] font-extrabold text-white">
                  {sevaCount} {t("s_sevas")}
                </div>
                <div className="text-[11px] text-[#FFE7B8]/90">{t("b_your_name")}</div>
              </div>
            )}
          </div>

          {/* Seva detail — what's actually included */}
          {sevaCount > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#FFE7B8]/85">{t("b_included")}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {pills.map((name) => (
                  <span key={name} className="inline-flex items-center gap-1 rounded-full bg-white/[0.15] px-2.5 py-1 text-[11.5px] font-semibold text-white">
                    <Check size={11} className="text-[#FFE7B8]" /> {name}
                  </span>
                ))}
                {extra > 0 && (
                  <span className="inline-flex items-center rounded-full bg-white/[0.15] px-2.5 py-1 text-[11.5px] font-bold text-[#FFE7B8]">
                    +{extra}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.15] px-2.5 py-1 text-[11.5px] font-semibold text-white">
                  <Check size={11} className="text-[#FFE7B8]" /> {t("s_video_proof")}
                </span>
              </div>
            </div>
          )}

          <Link
            to="/my-subscription"
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-[15px] font-extrabold text-[#B8460F] transition-transform hover:scale-[1.02]"
          >
            <Landmark size={17} /> {t("b_cta")} <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </section>
  );
}
