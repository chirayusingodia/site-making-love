import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, RefreshCcw, Check, X } from "lucide-react";
import { SiteChrome, WHATSAPP_URL } from "@/components/site-chrome";

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

const ELIGIBLE = [
  "एक ही महीने में गलती से दो बार भुगतान (Duplicate Payment) हो जाना।",
  "भुगतान कट गया परंतु Razorpay/Bank की तकनीकी त्रुटि के कारण सदस्यता सक्रिय (activate) नहीं हो पाई।",
  "भुगतान के 24 घंटे के भीतर एवं उस माह की सेवा शुरू होने से पहले सदस्यता रद्द करने का अनुरोध।",
];

const NOT_ELIGIBLE = [
  "जिस माह की सेवा सम्पन्न हो चुकी है अथवा Video/Live Proof भेजा जा चुका है — उस माह की राशि का refund नहीं होता, क्योंकि सेवा, सामग्री (गौ-चारा, हवन सामग्री, भोजन) एवं आचार्यों की दक्षिणा में पहले ही उपयोग हो चुकी होती है।",
  "गलत नाम, गोत्र अथवा पता उपयोगकर्ता द्वारा दिए जाने पर — सेवा सम्पन्न हो जाने के बाद।",
  "केवल मन बदलने (change of mind) पर, सेवा सम्पन्न हो जाने के बाद refund का अनुरोध।",
  "किसी भी प्रकार का Coupon/Discount उपयोग करके किया गया भुगतान, यदि सेवा सम्पन्न हो चुकी हो।",
];

function RefundPolicyPage() {
  return (
    <SiteChrome>
      <main className="max-w-2xl mx-auto px-4 pb-24 md:pb-16 pt-6 space-y-8">
        <header className="text-center space-y-3">
          <div className="text-xs font-bold uppercase tracking-widest text-brand">Legal</div>
          <h1 className="mt-1 text-3xl font-bold flex items-center justify-center gap-2">
            <RefreshCcw size={26} className="text-brand" /> Refund Policy
          </h1>
          <div className="inline-flex items-center gap-1.5 bg-brand-soft text-brand text-xs font-bold px-3 py-1.5 rounded-full">
            <ShieldCheck size={13} /> 11 साल का विश्वास
          </div>
          <p className="text-xs text-muted-foreground">प्रभावी तिथि: 28 अगस्त 2026</p>
        </header>

        <section className="card-soft p-5 space-y-2.5 border border-brand/10">
          <h2 className="text-base font-bold text-[#5B1A1A]">ईमानदारी से कहें तो</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            ईमानदारी से कहें तो — पुण्यता एक संगठित सेवा है। जो सेवा एक बार सम्पन्न करवा दी जाती है, उसमें उपयोग हुई सामग्री, दक्षिणा, गौ-सेवा एवं भोजन-दान की राशि वापस नहीं ली जा सकती — यह पूरी पारदर्शिता के साथ हम शुरू में ही बता देना ज़रूरी समझते हैं।
          </p>
          <p className="text-sm text-foreground/80 leading-relaxed">
            पिछले 11 वर्षों से हमारी यही कोशिश रही है कि refund से जुड़ी हर बात साफ़-साफ़ लिखी हो, ताकि सदस्यता लेते समय आपके मन में कोई भ्रम न रहे।
          </p>
        </section>

        <section className="card-soft p-5 space-y-3">
          <h2 className="text-base font-bold text-[#5B1A1A]">1. सदस्यता रद्द करना बनाम Refund</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            सदस्यता रद्द (Cancel) करना और Refund मांगना दो अलग चीज़ें हैं। सदस्यता आप /my-subscription से कभी भी रद्द कर सकते हैं — रद्द करने के बाद अगले माह से auto-debit बंद हो जाएगा। परंतु जिस माह की राशि पहले ही ली जा चुकी है और जिसकी सेवा सम्पन्न हो चुकी है, उस पर यह Refund Policy लागू होती है।
          </p>
        </section>

        <section className="card-soft p-5 space-y-3 border border-success/20">
          <h2 className="text-base font-bold text-success flex items-center gap-2">
            <Check size={18} /> Refund कब मिलता है
          </h2>
          <ul className="space-y-2">
            {ELIGIBLE.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground/80 leading-relaxed">
                <Check size={14} className="text-success shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card-soft p-5 space-y-3 border border-destructive/20">
          <h2 className="text-base font-bold text-destructive flex items-center gap-2">
            <X size={18} /> Refund कब नहीं मिलता
          </h2>
          <ul className="space-y-2">
            {NOT_ELIGIBLE.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground/80 leading-relaxed">
                <X size={14} className="text-destructive shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card-soft p-5 space-y-2.5">
          <h2 className="text-base font-bold text-[#5B1A1A]">2. Refund कैसे मांगें</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Refund के लिए हमें WhatsApp पर अपना पंजीकृत मोबाइल नंबर, भुगतान की रसीद (payment reference) एवं कारण के साथ संपर्क करें। हमारी टीम 24-48 घंटों के भीतर आपके अनुरोध की समीक्षा करेगी।
          </p>
        </section>

        <section className="card-soft p-5 space-y-2.5">
          <h2 className="text-base font-bold text-[#5B1A1A]">3. Refund की समयावधि</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            स्वीकृत Refund, अनुरोध स्वीकार होने के 5-7 कार्य दिवसों (business days) के भीतर, उसी भुगतान माध्यम (UPI/Card/Netbanking) में वापस कर दिया जाता है जिससे भुगतान किया गया था — यह पूर्णतः Razorpay के बैंक प्रोसेसिंग समय पर निर्भर करता है।
          </p>
        </section>

        <section className="card-soft p-5 space-y-2.5">
          <h2 className="text-base font-bold text-[#5B1A1A]">4. आंशिक Refund (Partial Refund)</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            यदि सदस्यता अवधि के बीच में सेवा किसी कारणवश आंशिक रूप से ही सम्पन्न हो पाई हो, तो पुण्यता अपने विवेक से आनुपातिक (proportionate) आंशिक Refund अथवा अगले माह में सेवा जोड़ने (carry-forward) का विकल्प दे सकता है।
          </p>
        </section>

        <div className="card-soft p-5 space-y-2 border border-brand/10 text-center">
          <h2 className="text-base font-bold text-brand">और जानकारी चाहिए?</h2>
          <p className="text-sm text-muted-foreground">
            पूरी सेवा शर्तों के लिए{" "}
            <Link to="/terms-and-conditions" className="text-brand font-semibold underline">
              Terms & Conditions
            </Link>{" "}
            देखें, या हमसे सीधे बात करें।
          </p>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-brand text-white font-bold px-6 py-3 rounded-full mt-1"
          >
            WhatsApp पर संपर्क करें
          </a>
        </div>
      </main>
    </SiteChrome>
  );
}
