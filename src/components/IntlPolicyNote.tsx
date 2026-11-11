import { useLanguage } from "@/lib/translations";

// International (NRI / overseas) customers — shared legal note shown on
// both /refund-policy and /terms-and-conditions so wording can't drift.
// Owner/CA to review GST wording separately; this covers billing currency,
// FX, refunds and prasad shipping only.

const COPY = {
  hindi: {
    heading: "विदेश (NRI) में रहने वाले ग्राहक",
    body: [
      "सभी भुगतान भारतीय रुपये (INR) में लिए जाते हैं। विदेशी कार्ड से भुगतान पर आपका बैंक राशि को आपकी currency में convert करता है — exchange rate और बैंक की forex/अन्य फीस का भुगतान ग्राहक करता है।",
      "Refund उसी कार्ड में INR में भेजा जाता है। exchange rate बदलने के कारण आपके बैंक स्टेटमेंट की राशि मूल राशि से अलग दिख सकती है।",
      "Prasad Box सिर्फ भारत के पते पर भेजा जाता है। विदेश में रहने वाले ग्राहक अपने परिवार का भारत का पता दे सकते हैं।",
    ],
  },
  english: {
    heading: "Customers living outside India (NRI)",
    body: [
      "All payments are charged in Indian Rupees (INR). When you pay with a foreign card, your bank converts the amount into your own currency — the exchange rate and any bank forex or other fees are borne by the customer.",
      "Refunds are issued in INR to the original card. Because of exchange-rate movement, the amount you see on your statement may differ from what you were originally charged.",
      "The Prasad Box is shipped to addresses within India only. Customers abroad may enter a family member's India address.",
    ],
  },
} as const;

export function IntlPolicyNote() {
  const lang = useLanguage();
  const c = COPY[lang];
  return (
    <section className="card-soft p-5 space-y-2.5">
      <h2 className="text-base font-bold text-[#5B1A1A]">🌍 {c.heading}</h2>
      {c.body.map((p, i) => (
        <p key={i} className="text-sm text-foreground/80 leading-relaxed">
          {p}
        </p>
      ))}
    </section>
  );
}
