import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, RefreshCcw, Check, X } from "lucide-react";
import { SiteChrome, WHATSAPP_URL } from "@/components/site-chrome";
import { useLanguage } from "@/lib/translations";

export const Route = createFileRoute("/refund-policy")({
  head: () => ({
    meta: [
      { title: "Refund Policy — पुण्यता | 11 साल का विश्वास" },
      {
        name: "description",
        content:
          "पुण्यता की Refund एवं Cancellation Policy — कब refund मिलता है, कब नहीं, और refund कैसे मांगें।",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.punyata.com/refund-policy" }],
  }),
  component: RefundPolicyPage,
});

const CONTENT = {
  hindi: {
    legalLabel: "Legal",
    title: "Refund Policy",
    effectiveDate: "प्रभावी तिथि: 28 अगस्त 2026",
    honestHeading: "ईमानदारी से कहें तो",
    honestBody: [
      "ईमानदारी से कहें तो — पुण्यता एक संगठित सेवा है। जो सेवा एक बार सम्पन्न करवा दी जाती है, उसमें उपयोग हुई सामग्री, दक्षिणा, गौ-सेवा एवं भोजन-दान की राशि वापस नहीं ली जा सकती — यह पूरी पारदर्शिता के साथ हम शुरू में ही बता देना ज़रूरी समझते हैं।",
      "पिछले 11 वर्षों से हमारी यही कोशिश रही है कि refund से जुड़ी हर बात साफ़-साफ़ लिखी हो, ताकि सदस्यता लेते समय आपके मन में कोई भ्रम न रहे।",
    ],
    cancelVsRefundHeading: "1. सदस्यता रद्द करना बनाम Refund",
    cancelVsRefundBody:
      "सदस्यता रद्द (Cancel) करना और Refund मांगना दो अलग चीज़ें हैं। सदस्यता आप /my-subscription से कभी भी, बिना किसी अतिरिक्त शुल्क के रद्द कर सकते हैं — रद्द करने के बाद अगले माह से auto-debit बंद हो जाएगा। परंतु जिस माह की राशि पहले ही ली जा चुकी है और जिसकी सेवा सम्पन्न हो चुकी है, उस पर यह Refund Policy लागू होती है।",
    eligibleHeading: "Refund कब मिलता है",
    eligible: [
      "एक ही महीने में गलती से दो बार भुगतान (Duplicate Payment) हो जाना।",
      "भुगतान कट गया परंतु Razorpay/Bank की तकनीकी त्रुटि के कारण सदस्यता सक्रिय (activate) नहीं हो पाई।",
      "भुगतान के 24 घंटे के भीतर एवं उस माह की सेवा शुरू होने से पहले सदस्यता रद्द करने का अनुरोध।",
    ],
    notEligibleHeading: "Refund कब नहीं मिलता",
    notEligible: [
      "जिस माह की सेवा सम्पन्न हो चुकी है अथवा Video/Live Proof भेजा जा चुका है — उस माह की राशि का refund नहीं होता, क्योंकि सेवा, सामग्री (गौ-चारा, हवन सामग्री, भोजन) एवं आचार्यों की दक्षिणा में पहले ही उपयोग हो चुकी होती है।",
      "गलत नाम, गोत्र अथवा पता उपयोगकर्ता द्वारा दिए जाने पर — सेवा सम्पन्न हो जाने के बाद।",
      "केवल मन बदलने (change of mind) पर, सेवा सम्पन्न हो जाने के बाद refund का अनुरोध।",
      "किसी भी प्रकार का Coupon/Discount उपयोग करके किया गया भुगतान, यदि सेवा सम्पन्न हो चुकी हो।",
    ],
    howHeading: "2. Refund कैसे मांगें",
    howBody:
      "Refund के लिए हमें WhatsApp पर अपना पंजीकृत मोबाइल नंबर, भुगतान की रसीद (payment reference) एवं कारण के साथ संपर्क करें। हमारी टीम 24-48 घंटों के भीतर आपके अनुरोध की समीक्षा करेगी।",
    timelineHeading: "3. Refund की समयावधि",
    timelineBody:
      "स्वीकृत Refund, अनुरोध स्वीकार होने के 5-7 कार्य दिवसों (business days) के भीतर, उसी भुगतान माध्यम (UPI/Card/Netbanking) में वापस कर दिया जाता है जिससे भुगतान किया गया था — यह पूर्णतः Razorpay के बैंक प्रोसेसिंग समय पर निर्भर करता है।",
    partialHeading: "4. आंशिक Refund (Partial Refund)",
    partialBody:
      "यदि सदस्यता अवधि के बीच में सेवा किसी कारणवश आंशिक रूप से ही सम्पन्न हो पाई हो, तो पुण्यता अपने विवेक से आनुपातिक (proportionate) आंशिक Refund अथवा अगले माह में सेवा जोड़ने (carry-forward) का विकल्प दे सकता है।",
    moreInfoHeading: "और जानकारी चाहिए?",
    moreInfoBody: "पूरी सेवा शर्तों के लिए",
    moreInfoBodyAfter: "देखें, या हमसे सीधे बात करें।",
    tcLabel: "Terms & Conditions",
    whatsappCta: "WhatsApp पर संपर्क करें",
  },
  english: {
    legalLabel: "Legal",
    title: "Refund Policy",
    effectiveDate: "Effective date: 28 August 2026",
    honestHeading: "Honestly speaking",
    honestBody: [
      "Honestly speaking — Punyata is an organized seva. Once a service has been performed, the materials, dakshina, gau-seva, and food-donation costs already spent on it cannot be refunded — we think it's important to say this upfront, with full transparency.",
      "For the past 11 years, we've made it a point to write everything about refunds clearly, so there's no confusion in your mind when you take a subscription.",
    ],
    cancelVsRefundHeading: "1. Cancellation vs. Refund",
    cancelVsRefundBody:
      "Cancelling your subscription and requesting a refund are two different things. You can cancel your subscription anytime from /my-subscription, at no extra cost — auto-debit will stop from the next month. However, the amount already charged for a month whose service has already been performed is governed by this Refund Policy.",
    eligibleHeading: "When you get a refund",
    eligible: [
      "An accidental duplicate payment within the same month.",
      "Payment was deducted, but the subscription could not be activated due to a Razorpay/bank technical error.",
      "A cancellation request made within 24 hours of payment and before that month's service has started.",
    ],
    notEligibleHeading: "When you don't get a refund",
    notEligible: [
      "For a month whose service has already been performed or whose Video/Live Proof has already been sent — that month's amount is not refunded, as the service, materials (gau-chara, hawan samagri, food), and the acharyas' dakshina have already been utilised.",
      "Where the user provided an incorrect name, gotra, or address — after the service has been performed.",
      "A refund requested purely on change of mind, after the service has already been performed.",
      "Any payment made using a Coupon/Discount, if the service has already been performed.",
    ],
    howHeading: "2. How to request a refund",
    howBody:
      "To request a refund, contact us on WhatsApp with your registered mobile number, payment reference, and reason. Our team reviews every request within 24-48 hours.",
    timelineHeading: "3. Refund timeline",
    timelineBody:
      "An approved refund is credited back within 5-7 business days of approval, to the same payment method (UPI/Card/Netbanking) used to pay — this depends entirely on Razorpay's and your bank's processing time.",
    partialHeading: "4. Partial refund",
    partialBody:
      "If, for any reason, only part of the service could be performed during the subscription period, Punyata may, at its discretion, offer a proportionate partial refund or carry the remaining service forward to the next month.",
    moreInfoHeading: "Need more information?",
    moreInfoBody: "For the full terms of service, see our",
    moreInfoBodyAfter: "or talk to us directly.",
    tcLabel: "Terms & Conditions",
    whatsappCta: "Chat with us on WhatsApp",
  },
} as const;

function RefundPolicyPage() {
  const lang = useLanguage();
  const c = CONTENT[lang];
  return (
    <SiteChrome>
      <main className="max-w-2xl mx-auto px-4 pb-24 md:pb-16 pt-6 space-y-8">
        <header className="text-center space-y-3">
          <div className="text-xs font-bold uppercase tracking-widest text-brand">{c.legalLabel}</div>
          <h1 className="mt-1 text-3xl font-bold flex items-center justify-center gap-2">
            <RefreshCcw size={26} className="text-brand" /> {c.title}
          </h1>
          <div className="inline-flex items-center gap-1.5 bg-brand-soft text-brand text-xs font-bold px-3 py-1.5 rounded-full">
            <ShieldCheck size={13} /> 11 साल का विश्वास
          </div>
          <p className="text-xs text-muted-foreground">{c.effectiveDate}</p>
        </header>

        <section className="card-soft p-5 space-y-2.5 border border-brand/10">
          <h2 className="text-base font-bold text-[#5B1A1A]">{c.honestHeading}</h2>
          {c.honestBody.map((p, i) => (
            <p key={i} className="text-sm text-foreground/80 leading-relaxed">
              {p}
            </p>
          ))}
        </section>

        <section className="card-soft p-5 space-y-3">
          <h2 className="text-base font-bold text-[#5B1A1A]">{c.cancelVsRefundHeading}</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">{c.cancelVsRefundBody}</p>
        </section>

        <section className="card-soft p-5 space-y-3 border border-success/20">
          <h2 className="text-base font-bold text-success flex items-center gap-2">
            <Check size={18} /> {c.eligibleHeading}
          </h2>
          <ul className="space-y-2">
            {c.eligible.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground/80 leading-relaxed">
                <Check size={14} className="text-success shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card-soft p-5 space-y-3 border border-destructive/20">
          <h2 className="text-base font-bold text-destructive flex items-center gap-2">
            <X size={18} /> {c.notEligibleHeading}
          </h2>
          <ul className="space-y-2">
            {c.notEligible.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground/80 leading-relaxed">
                <X size={14} className="text-destructive shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card-soft p-5 space-y-2.5">
          <h2 className="text-base font-bold text-[#5B1A1A]">{c.howHeading}</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">{c.howBody}</p>
        </section>

        <section className="card-soft p-5 space-y-2.5">
          <h2 className="text-base font-bold text-[#5B1A1A]">{c.timelineHeading}</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">{c.timelineBody}</p>
        </section>

        <section className="card-soft p-5 space-y-2.5">
          <h2 className="text-base font-bold text-[#5B1A1A]">{c.partialHeading}</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">{c.partialBody}</p>
        </section>

        <div className="card-soft p-5 space-y-2 border border-brand/10 text-center">
          <h2 className="text-base font-bold text-brand">{c.moreInfoHeading}</h2>
          <p className="text-sm text-muted-foreground">
            {c.moreInfoBody}{" "}
            <Link to="/terms-and-conditions" className="text-brand font-semibold underline">
              {c.tcLabel}
            </Link>{" "}
            {c.moreInfoBodyAfter}
          </p>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-brand text-white font-bold px-6 py-3 rounded-full mt-1"
          >
            {c.whatsappCta}
          </a>
        </div>
      </main>
    </SiteChrome>
  );
}
