import { Link } from "@tanstack/react-router";
import { ArrowRight, Landmark, CalendarDays } from "lucide-react";
import { useMySubscription } from "@/hooks/use-my-subscription";
import { useSessionProfile } from "@/hooks/use-session";
import { usePublicPlans, getPlanById } from "@/lib/plans";
import { isHawanSeva } from "@/lib/plans-schedule";
import { nextSevaDate, fmtSevaDate, daysUntil, monthsActive } from "@/lib/seva-dates";

// ─────────────────────────────────────────────────────────────
// PUNYATA — home "welcome back" banner for active subscribers
//
// Renders ONLY for a signed-in devotee with an active membership;
// everyone else (logged out, pending, lapsed, still loading) sees the
// normal marketing home, so this returns null in every other case.
// Numbers are real or calendar-derived — next seva from the locked
// cadence (seva-dates.ts), months active from the subscription's own
// start_date, monthly seva count from the live plan composition.
// ─────────────────────────────────────────────────────────────

export function SubscriberBanner() {
  const { subscription, hasActive, loading } = useMySubscription();
  const { profile } = useSessionProfile();
  const { data } = usePublicPlans();

  if (loading || !hasActive || !subscription) return null;

  const plan = subscription.plan;
  const livePlan = data && plan ? getPlanById(data.plans, plan.slug) : undefined;
  const hasLastSaturday = livePlan?.includedSevas.some(isHawanSeva) ?? false;
  const sevaCount = livePlan?.includedSevas.length ?? 0;

  const next = nextSevaDate(hasLastSaturday);
  const inDays = daysUntil(next.date);
  const months = monthsActive(subscription.start_date);

  // First name only — warmer, and never overflows the band.
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? "";
  const planName = plan?.name ?? "आपकी सेवा";

  return (
    <section className="animate-fade-up">
      <div className="relative overflow-hidden rounded-3xl p-5 text-[#FFF3EA] shadow-[0_14px_34px_rgba(122,42,16,0.32)]"
        style={{ background: "radial-gradient(120% 130% at 88% 0%, #E85D1F 0%, #C0451A 48%, #7A2A10 100%)" }}
      >
        {/* faint mandala */}
        <svg className="absolute -right-8 -bottom-9 opacity-15" width="150" height="150" viewBox="0 0 100 100" fill="none" stroke="#FFE7B8" strokeWidth="1" aria-hidden="true">
          <circle cx="50" cy="50" r="46" /><circle cx="50" cy="50" r="30" />
          <path d="M50 4V96M4 50H96M18 18 82 82M82 18 18 82" />
        </svg>

        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3FAE55]/90 px-2.5 py-1 text-[11px] font-bold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white" /> सदस्यता सक्रिय
            </span>
            <span className="font-scripture text-[13px] text-[#FFE7B8]">
              {months > 0 ? `${months} माह से जुड़े` : "अभी-अभी जुड़े"}
            </span>
          </div>

          <div className="mt-3">
            {firstName && <div className="font-scripture text-sm text-[#FFE7B8]">जय सियाराम, {firstName} जी 🙏</div>}
            <div className="mt-0.5 text-xl font-bold text-white">
              आपकी <span className="text-[#FFE7B8]">{planName}</span> सेवा चालू है
            </div>
          </div>

          <div className="mt-3.5 flex gap-2">
            <div className="flex-[1.3] rounded-2xl border border-[#FFE7B8]/25 bg-white/[0.13] p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] text-[#FFF3EA]/80">
                <CalendarDays size={13} /> अगली सेवा
              </div>
              <div className="mt-0.5 text-[14.5px] font-extrabold text-white">{fmtSevaDate(next.date)}</div>
              <div className="text-[11px] text-[#FFE7B8]/90">
                {next.label}{inDays > 0 ? ` · ${inDays} दिन में` : " · आज"}
              </div>
            </div>
            {sevaCount > 0 && (
              <div className="flex-1 rounded-2xl border border-[#FFE7B8]/25 bg-white/[0.13] p-2.5">
                <div className="text-[11px] text-[#FFF3EA]/80">हर माह</div>
                <div className="text-[17px] font-extrabold text-white">{sevaCount} सेवाएँ</div>
                <div className="text-[11px] text-[#FFE7B8]/90">आपके नाम से</div>
              </div>
            )}
          </div>

          <Link
            to="/my-subscription"
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-[15px] font-extrabold text-[#B8460F] transition-transform hover:scale-[1.02]"
          >
            <Landmark size={17} /> मेरी सदस्यता देखें <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </section>
  );
}
