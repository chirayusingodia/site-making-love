import { localizedName } from "@/lib/translations";

// Main takeaway per seva, keyed by its English title — shown as a one-line
// "why this seva" note under its name so the seva grid doesn't just list
// names, it explains what each one is for at a glance.
const SEVA_MAIN_BENEFIT: Record<string, { hindi: string; english: string }> = {
  "Sundarkand Path": {
    hindi: "किसी भी प्रकार की इच्छा हो, आपकी शीघ्र पूर्ण होती है और हनुमान जी की कृपा मिलती है",
    english: "Any wish, of any kind, gets fulfilled quickly for you, and Hanuman ji's grace follows",
  },
  "Gau Seva": {
    hindi: "गौमाता की सेवा से आपकी आर्थिक बाधा दूर होती है, सुख-समृद्धि मिलती है",
    english: "Serving Gau Mata clears your financial obstacles and brings prosperity",
  },
  "Vanar Seva": {
    hindi: "हनुमान जी की सेना की सेवा है यह, इससे आपको उनका सीधा आशीर्वाद प्राप्त होता है",
    english: "This serves Hanuman ji's own army — in turn, his direct blessings reach you",
  },
  "Saadhu Santo Ko Bhojan": {
    hindi: "सड़क पर रहने वाले साधु-संतों को जिनका कोई नहीं, उन्हें भोजन ईश्वर आपके माध्यम से करवाते हैं और उसका पुण्य आपके खाते में जाता है",
    english: "These sadhus live on the streets with no one to feed them — God feeds them through you, and the merit lands in your account",
  },
  "Griha Shanti Hawan": {
    hindi: "इससे घर का क्लेश व वास्तु दोष शांत होता है, आपको सुख-शांति व भाग्य वृद्धि मिलती है",
    english: "This pacifies household discord and vaastu dosh, bringing you peace and rising fortune",
  },
  "Sarv Rog Nivaran Hawan": {
    hindi: "दैहिक-दैविक-भौतिक सभी रोग-बाधाओं से आपको मुक्ति मिलती है इस हवन से",
    english: "This hawan frees you from all physical, divine and worldly ailments",
  },
};

type SevaLike = { title: string; titleEn: string | null };

/**
 * Numbered 1–6 seva grid, each card naming its one main benefit in
 * brackets underneath. Shared between the plan detail page (a full-width
 * single card) and the plan cards on the listing page (three cards side
 * by side on desktop, so each one is much narrower than the viewport).
 *
 * A hardcoded `grid-cols-2` broke on the listing page: the viewport is
 * desktop-wide, but the card itself is only ~300px, so two columns
 * squeezed each seva's label onto 3 wrapped lines. Viewport-based Tailwind
 * breakpoints (`sm:`, `md:`) can't fix this — they don't know the actual
 * rendered width of a card nested inside a multi-column grid. Container
 * queries do: `@container` on the wrapper measures the real box this
 * component was given, so the grid only goes to 2 columns once there's
 * genuinely enough room, in either layout, without a mode prop to keep in sync.
 */
export function SevaBenefitGrid({ sevas, lang }: { sevas: SevaLike[]; lang: "hindi" | "english" }) {
  if (sevas.length === 0) return null;
  return (
    <div className="@container">
      <div className="grid grid-cols-1 @[26rem]:grid-cols-2 gap-2">
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
    </div>
  );
}
