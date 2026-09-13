import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { nextSevaDate, nextSevaDateTime, fmtSevaDate } from "@/lib/seva-dates";
import { useTranslation } from "@/lib/translations";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// `null` until mounted, on purpose: this page is server-rendered, and a
// live clock computed from Date.now() will almost never match between
// the server's render time and the client's hydration time — React
// then flags a hydration mismatch and that subtree can render blank or
// stale until it re-renders, which is exactly what showed up live as
// "the timer isn't showing properly". Rendering the SAME placeholder
// ("--") on the server and on the client's first paint keeps the two
// identical, then the real ticking value fills in a moment later.
function useCountdown(target: Date) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;
  const totalSeconds = Math.max(0, Math.floor((target.getTime() - now) / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/**
 * Live countdown to the next scheduled pooja — the same 2nd-Tuesday /
 * last-Saturday cadence already computed for the plan (seva-dates.ts),
 * just ticking down to it instead of only naming the date. No exact
 * sankalp start time is stored, so this counts down to a display
 * estimate (8 AM) — the day itself is the real, calendar-derived one.
 */
export function NextPoojaCountdown({
  hasLastSaturday,
  variant = "hero",
}: {
  hasLastSaturday: boolean;
  variant?: "hero" | "compact";
}) {
  const { t, lang } = useTranslation();
  const next = nextSevaDate(hasLastSaturday);
  const target = nextSevaDateTime(hasLastSaturday);
  const countdown = useCountdown(target);
  const dateLabel = fmtSevaDate(next.date, lang);
  const cadenceLabel = t(next.labelKey);

  const fmt = (n: number | undefined) => (n === undefined ? "--" : pad(n));
  const units = [
    { value: fmt(countdown?.days), label: t("cd_days") },
    { value: fmt(countdown?.hours), label: t("cd_hours") },
    { value: fmt(countdown?.minutes), label: t("cd_minutes") },
    { value: fmt(countdown?.seconds), label: t("cd_seconds") },
  ];

  if (variant === "compact") {
    return (
      <div className="bg-[#FFF7F1] rounded-2xl p-3.5">
        <div className="flex items-center gap-1.5 text-brand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          <span className="text-[11px] font-bold">{t("cd_next_pooja_in")}</span>
        </div>

        <div className="flex items-center justify-between mt-2.5">
          {units.map((u, i) => (
            <div key={u.label} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-[11px] bg-white border border-brand/15 flex items-center justify-center font-bold text-[17px] text-[#5B1A1A] tabular-nums">
                  {u.value}
                </div>
                <div className="text-[8.5px] font-bold uppercase tracking-wider text-muted-foreground">
                  {u.label}
                </div>
              </div>
              {i < units.length - 1 && (
                <div className="text-[15px] font-bold text-brand/30 mx-1 -mt-3">:</div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-2.5 pt-2.5 border-t border-brand/10 space-y-0.5">
          <div className="text-xs font-bold text-foreground">
            {dateLabel} · {cadenceLabel}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <MapPin size={11} className="text-brand shrink-0" />
            {t("cd_temple_name")}
          </div>
          <div className="text-[10px] italic text-muted-foreground/80 leading-snug">
            {t("cd_temple_significance")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-3xl p-5 text-[#FFF3EA] shadow-[0_14px_36px_rgba(122,42,16,0.35)]"
      style={{
        background: "radial-gradient(120% 120% at 85% 0%, #E85D1F 0%, #C0451A 45%, #7A2A10 100%)",
      }}
    >
      <div
        className="absolute inset-0 opacity-10"
        style={{ background: "repeating-linear-gradient(180deg, transparent 0 27px, #fff 27px 28px)" }}
      />
      <svg
        className="absolute -right-7 -top-7 opacity-[0.18]"
        width="150"
        height="150"
        viewBox="0 0 100 100"
        fill="none"
        stroke="#FFE7B8"
        strokeWidth="1"
        aria-hidden="true"
      >
        <circle cx="50" cy="50" r="46" /><circle cx="50" cy="50" r="30" />
        <path d="M50 4V96M4 50H96M18 18 82 82M82 18 18 82" />
      </svg>

      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFE7B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2c-1.5 3-1.5 5 0 7 1.5-2 1.5-4 0-7z" />
              <path d="M7 21h10a2 2 0 0 0 2-2c0-3-2-4-2-8a5 5 0 0 0-10 0c0 4-2 5-2 8a2 2 0 0 0 2 2z" />
            </svg>
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#FFE7B8]">
              {t("cd_next_pooja")}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-[#FFE7B8]">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#7CE38B] opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#7CE38B]" />
            </span>
            LIVE
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 my-4">
          {units.map((u, i) => (
            <div key={u.label} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div className="w-[58px] h-[58px] rounded-2xl bg-white/[0.13] border border-white/20 backdrop-blur-sm flex items-center justify-center text-[26px] font-extrabold text-white tabular-nums">
                  {u.value}
                </div>
                <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#FFE7B8]">
                  {u.label}
                </div>
              </div>
              {i < units.length - 1 && (
                <div className="text-[22px] font-bold text-[#FFE7B8]/55 mx-2 -mt-[18px]">:</div>
              )}
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-[#FFE7B8]/25 space-y-1">
          <div className="flex items-center gap-1.5 text-sm font-bold text-white">
            <MapPin size={14} className="text-[#FFE7B8] shrink-0" />
            {t("cd_temple_name")}
          </div>
          <div className="text-[11px] italic text-[#FFE7B8]/75 leading-snug pl-[21px]">
            {t("cd_temple_significance")}
          </div>
          <div className="text-xs text-[#FFF3EA]/80 pl-[21px]">
            {dateLabel} · {cadenceLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
