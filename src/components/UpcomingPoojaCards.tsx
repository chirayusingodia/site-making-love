import { Moon, Sparkles, Sun } from "lucide-react";
import { upcomingSevaDates } from "@/lib/seva-dates";
import { isHawanSeva, type LiveSeva } from "@/lib/plans-schedule";
import { specialDayItems } from "@/lib/special-days";
import { useTranslation } from "@/lib/translations";

// toLocaleDateString("hi-IN", { month: "short" }) yields "अक्टू॰" / "नव॰" — a
// degree-style mark that reads as a typo — so Hindi uses full month names.
const HI_MONTHS = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];

const SPECIAL_ICON = { festival: Sparkles, tithi: Moon, weekday: Sun } as const;

/**
 * The next two scheduled poojas as date cards: a date badge, the sevas
 * running that day, and — underneath — what makes the day special
 * (festival / tithi / weekday deity) with a one-line "why". Shared by
 * the checkout plan card and the plan-page countdown hero.
 *
 * The cards are white, so they sit equally well on the light checkout
 * panel and on the dark-saffron countdown card.
 */
export function UpcomingPoojaCards({ sevas }: { sevas: LiveSeva[] }) {
  const { t, lang } = useTranslation();
  const loc = lang === "english" ? "en-IN" : "hi-IN";
  const sevaNameOf = (s: LiveSeva) => (lang === "english" && s.nameEn ? s.nameEn : s.name);

  const upcoming = upcomingSevaDates(sevas.some(isHawanSeva), 2).map((u) => {
    const cadence = u.labelKey === "sd_2nd_tuesday" ? "2nd Tuesday" : "Last Saturday";
    return {
      key: `${u.labelKey}-${u.date.getTime()}`,
      day: u.date.getDate(),
      month:
        lang === "english"
          ? u.date.toLocaleDateString(loc, { month: "short" })
          : HI_MONTHS[u.date.getMonth()],
      weekday: u.date.toLocaleDateString(loc, { weekday: "long" }),
      sevas: sevas.filter((s) => s.days.includes(cadence)).map(sevaNameOf),
      special: specialDayItems(u.date).map((i) => ({
        kind: i.kind,
        title: lang === "english" ? i.en : i.hi,
        desc: lang === "english" ? i.descEn : i.descHi,
      })),
    };
  });

  return (
    <div className="space-y-3">
      {upcoming.map((u, i) => (
        <div
          key={u.key}
          className="rounded-xl bg-white border border-black/5 shadow-sm overflow-hidden text-foreground"
        >
          <div className="flex items-center gap-3 p-3">
            <div className="w-14 shrink-0 rounded-xl bg-gradient-to-b from-brand to-[#F5A742] text-white text-center py-1.5 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider opacity-90">
                {u.month}
              </div>
              <div className="text-[22px] font-extrabold leading-none">{u.day}</div>
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-brand">
                {i === 0 ? t("checkout_next_seva") : t("checkout_after_that")} · {u.weekday}
              </div>
              {u.sevas.length > 0 && (
                <div className="text-[12px] leading-snug text-foreground/80">
                  {u.sevas.join(" · ")}
                </div>
              )}
            </div>
          </div>
          {u.special.length > 0 && (
            <div className="border-t border-brand/10 bg-brand/[0.05] px-3 py-2.5 space-y-2.5">
              {u.special.map((sp) => {
                const Icon = SPECIAL_ICON[sp.kind];
                return (
                  <div key={sp.title} className="flex items-start gap-2.5">
                    <span className="mt-0.5 w-6 h-6 rounded-full bg-brand/15 text-brand flex items-center justify-center shrink-0">
                      <Icon size={13} />
                    </span>
                    <div className="space-y-0.5">
                      <div className="text-[13px] font-bold text-brand-deep leading-tight">
                        {sp.title}
                      </div>
                      <div className="text-[11.5px] leading-snug text-muted-foreground">
                        {sp.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
