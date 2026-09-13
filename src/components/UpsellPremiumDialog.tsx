import { Check, Sparkles } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// Shown once when someone lands on /checkout for the ₹251 (basic) plan,
// before they pay — nudges them toward the ₹399 (premium) plan by
// spelling out exactly how much more seva that gets them. Closing it
// (X, backdrop, or "₹251 se hi jaari rakhein") just continues the
// ₹251 checkout already underway; nothing here blocks payment.
export function UpsellPremiumDialog({
  open,
  onOpenChange,
  onUpgrade,
  onContinueBasic,
  basicPrice,
  premiumPrice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpgrade: () => void;
  onContinueBasic: () => void;
  basicPrice: string;
  premiumPrice: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px] rounded-[24px] border-0 bg-white p-0 shadow-[0_24px_60px_rgba(91,26,26,0.28)] gap-0 [&>button]:hidden">
        <div className="relative px-6 pt-7 pb-6">
          <span className="absolute -top-3 left-6 bg-[#C0362C] text-white text-[11px] font-bold px-3.5 py-1 rounded-full shadow-[0_4px_10px_rgba(192,54,44,0.35)] tracking-wide">
            सबसे लोकप्रिय चुनाव
          </span>

          <button
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-black/10"
          >
            <span className="text-base leading-none">×</span>
          </button>

          <div className="w-14 h-14 rounded-full bg-brand-soft flex items-center justify-center mt-2 mb-3.5">
            <Sparkles size={26} className="text-brand" />
          </div>

          <h2 className="text-[20px] font-bold text-foreground leading-snug mb-1.5">
            रुकिए! एक कदम और बाकी है
          </h2>
          <p className="text-[14px] text-foreground/70 leading-relaxed mb-4">
            सिर्फ <b className="text-brand">+₹148/माह</b> में पूरे परिवार को मिले दोगुनी सेवा, 2 हवन
            एवं साधु-भोजन का पुण्य लाभ।
          </p>

          <div className="flex gap-2.5 mb-4">
            <div className="flex-1 rounded-2xl border-2 border-[#EFE2D4] bg-[#FBF6F1] p-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                आपका चुनाव
              </div>
              <div className="text-lg font-bold text-foreground mb-2">
                {basicPrice}
                <span className="text-[11px] font-medium text-muted-foreground">/माह</span>
              </div>
              <ul className="space-y-1.5">
                {["मासिक सुंदरकांड", "गौ व वानर सेवा (2nd मंगलवार)"].map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-[11.5px] text-foreground/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C7B9AB] mt-1.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex-1 rounded-2xl border-2 border-brand bg-gradient-to-b from-[#FFF6EE] to-[#FFEFE0] p-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-brand mb-1.5">
                सुझाया गया
              </div>
              <div className="text-lg font-bold text-foreground mb-1">
                {premiumPrice}
                <span className="text-[11px] font-medium text-muted-foreground">/माह</span>
              </div>
              <div className="inline-block text-[10px] font-bold text-white bg-brand px-2 py-0.5 rounded-full mb-2">
                सिर्फ +₹148 में
              </div>
              <ul className="space-y-1.5">
                {[
                  "2 सुंदरकांड",
                  "2 हवन (गृह शांति + सर्व रोग निवारण)",
                  "10 साधु-संतों को भोजन दान",
                  "गौ/वानर सेवा — हर माह",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-[11.5px] text-foreground/85">
                    <span className="w-1.5 h-1.5 rounded-full bg-success mt-1.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex items-start gap-2 bg-success text-white rounded-2xl px-3.5 py-2.5 text-[13px] font-semibold leading-snug mb-4">
            <Check size={16} className="shrink-0 mt-0.5" strokeWidth={3} />
            2 सुंदरकांड + 2 हवन + भोजन दान — दोगुनी सेवा, बस +₹148/माह में
          </div>

          <ul className="space-y-2 mb-5">
            {[
              "घर में कलह एवं वास्तु दोष से राहत",
              "हनुमान जी की विशेष कृपा — भय व संकट का नाश",
              "आर्थिक बाधाओं से मुक्ति",
              "पूर्वजों का विशेष आशीर्वाद",
            ].map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-[13px] text-foreground/85">
                <span className="mt-0.5 w-[18px] h-[18px] rounded-full bg-success/15 flex items-center justify-center shrink-0">
                  <Check size={11} className="text-success" strokeWidth={3} />
                </span>
                {b}
              </li>
            ))}
          </ul>

          <button
            onClick={onUpgrade}
            className="w-full rounded-full py-3.5 text-[15.5px] font-bold text-white bg-gradient-to-r from-brand to-[#F5A742] shadow-[0_8px_20px_rgba(216,90,48,0.35)] hover:brightness-105 mb-2.5"
          >
            हां, {premiumPrice} वाला प्लान चुनें
          </button>
          <button
            onClick={onContinueBasic}
            className="w-full py-1 text-[13px] text-muted-foreground underline hover:text-foreground/80"
          >
            नहीं धन्यवाद, {basicPrice} से ही जारी रखें
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
