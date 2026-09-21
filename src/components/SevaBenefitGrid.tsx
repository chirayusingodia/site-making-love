import { localizedName } from "@/lib/translations";

// Main takeaway per seva, keyed by its English title — shown as a one-line
// "why this seva" note under its name so the seva grid doesn't just list
// names, it explains what each one is for at a glance.
const SEVA_MAIN_BENEFIT: Record<string, { hindi: string; english: string }> = {
  "Sundarkand Path": {
    hindi: "पितृ तृप्ति व आशीर्वाद",
    english: "Peace & blessings for ancestors",
  },
  "Gau Seva": { hindi: "आर्थिक बाधा दूर होती है", english: "Removes financial obstacles" },
  "Vanar Seva": { hindi: "हनुमान जी की कृपा", english: "Grace of Hanuman ji" },
  "Saadhu Santo Ko Bhojan": { hindi: "मानसिक शांति मिलती है", english: "Brings mental peace" },
  "Griha Shanti Hawan": { hindi: "गृह-कलेश शांत होता है", english: "Ends household discord" },
  "Sarv Rog Nivaran Hawan": { hindi: "रोग-बाधा से रक्षा", english: "Protection from illness" },
};

type SevaLike = { title: string; titleEn: string | null };

/**
 * Numbered 1–6 seva grid, each card naming its one main benefit in
 * brackets underneath. Shared between the plan detail page and the plan
 * cards on the listing page so both show the same clear, bold breakdown
 * instead of a dense feature checklist or a run-on sentence.
 */
export function SevaBenefitGrid({ sevas, lang }: { sevas: SevaLike[]; lang: "hindi" | "english" }) {
  if (sevas.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {sevas.map((s, i) => {
        const benefit = SEVA_MAIN_BENEFIT[s.titleEn ?? s.title];
        return (
          <div
            key={s.title}
            className="flex items-start gap-2 bg-brand-soft border border-brand/20 rounded-xl px-3 py-2.5"
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand text-white text-xs font-extrabold shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold text-foreground">
                {localizedName(s.title, s.titleEn, lang)}
              </span>
              {benefit && (
                <span className="block text-[11px] font-semibold text-brand mt-0.5">
                  ({lang === "hindi" ? benefit.hindi : benefit.english})
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
