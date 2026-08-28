import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, ScrollText } from "lucide-react";
import { SiteChrome, WHATSAPP_URL } from "@/components/site-chrome";

export const Route = createFileRoute("/terms-and-conditions")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — पुण्यता | 11 साल का विश्वास" },
      {
        name: "description",
        content:
          "पुण्यता की सेवा शर्तें — सदस्यता, भुगतान, ऑटो-रिन्यूअल, सेवा वितरण एवं उपयोगकर्ता की ज़िम्मेदारियाँ। 11 साल का विश्वास।",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.punyata.com/terms-and-conditions" }],
  }),
  component: TermsPage,
});

interface Section {
  heading: string;
  body: string[];
}

const SECTIONS: Section[] = [
  {
    heading: "1. पुण्यता क्या है",
    body: [
      "पुण्यता तीर्थ गुरु पुष्करराज, राजस्थान में स्थित एक संगठित धार्मिक सेवा है। हम आपके नाम एवं गोत्र से मासिक सुंदरकांड, हवन, आरती, गौ सेवा, वानर सेवा एवं साधु संतों को भोजन जैसी सेवाएँ, विद्वान आचार्यों एवं पंडितों के माध्यम से सम्पन्न करवाते हैं, और प्रत्येक सेवा का Video/Live Proof आपके WhatsApp पर भेजते हैं।",
      "यह Terms & Conditions ('शर्तें') पुण्यता की वेबसाइट, ऐप एवं सेवाओं ('सेवा') के उपयोग को नियंत्रित करती हैं। सदस्यता लेकर या भुगतान करके आप इन शर्तों से सहमत माने जाएंगे।",
    ],
  },
  {
    heading: "2. ईमानदारी से कहें तो",
    body: [
      "ईमानदारी से कहें तो — पुण्यता एक संगठित सेवा है, और किसी भी संगठन को चलते रहने के लिए आत्मनिर्भर होना पड़ता है। हम कोई खोखला वादा नहीं करते — हर सेवा का प्रमाण, हर शर्त, और आपके पैसे का हिसाब पारदर्शी रखते हैं। पिछले 11 वर्षों से यही ईमानदारी हमारा आधार रही है, और आगे भी रहेगी।",
      "अगर कभी किसी शर्त को लेकर आपके मन में कोई प्रश्न हो, तो बेझिझक हमसे WhatsApp पर संपर्क करें — हम स्पष्ट उत्तर देने में विश्वास रखते हैं, टालमटोल में नहीं।",
    ],
  },
  {
    heading: "3. सदस्यता एवं मासिक भुगतान",
    body: [
      "पुण्यता की सेवाएँ मासिक सदस्यता (subscription) के रूप में उपलब्ध हैं। भुगतान Razorpay के माध्यम से UPI AutoPay, Card, Netbanking अथवा अन्य उपलब्ध माध्यमों से लिया जाता है।",
      "एक बार सदस्यता सक्रिय होने के बाद, चुने गए प्लान के अनुसार राशि प्रत्येक माह स्वतः (auto-renewal) आपके भुगतान माध्यम से काटी जाती है, जब तक आप सदस्यता रद्द (cancel) नहीं करते। सदस्यता लेने से पहले प्लान का मूल्य, अवधि एवं सुविधाएँ पूर्णतः पढ़ना आपकी ज़िम्मेदारी है।",
      "कोई भी Hidden Charges नहीं लिए जाते — जो राशि प्लान पर दिखाई गई है, वही राशि हर माह ली जाती है, जब तक कीमतों में परिवर्तन की सूचना पहले से न दी गई हो।",
    ],
  },
  {
    heading: "4. सदस्यता रद्द करना (Cancellation)",
    body: [
      "आप अपनी सदस्यता कभी भी /my-subscription पेज से अथवा हमें WhatsApp पर सूचित करके रद्द कर सकते हैं। रद्द करने पर अगले Billing Cycle से राशि नहीं काटी जाएगी।",
      "पहले से भुगतान किए जा चुके माह की सेवा — जो पहले से सम्पन्न या निर्धारित हो चुकी है — रद्द करने पर भी पूर्ण रूप से सम्पन्न करवाई जाती है। रद्द करने से पहले की गई सेवाओं का refund इस दस्तावेज़ के साथ हमारी Refund Policy के अनुसार तय होता है।",
    ],
  },
  {
    heading: "5. सेवा वितरण एवं प्रमाण",
    body: [
      "हर सेवा — आपके दिए गए नाम एवं गोत्र के अनुसार — तीर्थ गुरु पुष्करराज में सम्पन्न करवाई जाती है, और उसका Video अथवा Live Proof आपके पंजीकृत WhatsApp नंबर पर भेजा जाता है।",
      "नाम, गोत्र एवं परिवार के सदस्यों की जानकारी सही एवं सटीक भरना आपकी ज़िम्मेदारी है। गलत जानकारी के कारण सेवा में किसी त्रुटि के लिए पुण्यता उत्तरदायी नहीं होगा, हालांकि हम सुधार में हर संभव सहायता करेंगे।",
      "प्राकृतिक आपदा, त्यौहार, स्थानीय प्रशासनिक कारणों अथवा किसी अप्रत्याशित परिस्थिति (Force Majeure) के चलते सेवा की तिथि में परिवर्तन हो सकता है — ऐसी स्थिति में सेवा रद्द नहीं की जाती, केवल समयानुसार सम्पन्न करवाई जाती है और इसकी सूचना आपको दी जाती है।",
    ],
  },
  {
    heading: "6. उपयोगकर्ता की ज़िम्मेदारियाँ",
    body: [
      "आप सहमति देते हैं कि सदस्यता लेते समय दी गई जानकारी (नाम, गोत्र, मोबाइल नंबर, पता) सही एवं अद्यतन (updated) है।",
      "आप इस Website/App का उपयोग किसी गैरकानूनी उद्देश्य के लिए नहीं करेंगे, और किसी अन्य व्यक्ति के खाते या भुगतान माध्यम का दुरुपयोग नहीं करेंगे।",
    ],
  },
  {
    heading: "7. मूल्य एवं शर्तों में परिवर्तन",
    body: [
      "पुण्यता को प्लान की कीमत, सुविधाओं अथवा इन शर्तों में परिवर्तन का अधिकार सुरक्षित है। कोई भी महत्वपूर्ण परिवर्तन वेबसाइट पर अपडेट कर दिया जाएगा एवं जहाँ संभव हो, पंजीकृत सदस्यों को सूचित किया जाएगा। परिवर्तन के बाद सेवा जारी रखना संशोधित शर्तों की स्वीकृति माना जाएगा।",
    ],
  },
  {
    heading: "8. दायित्व की सीमा (Limitation of Liability)",
    body: [
      "पुण्यता पूरी निष्ठा एवं शास्त्रोक्त विधि-विधान से सेवा सम्पन्न करवाने का प्रयास करता है। यह एक धार्मिक/आध्यात्मिक सेवा है — इससे प्राप्त होने वाले आध्यात्मिक अथवा जीवन से जुड़े परिणामों का कोई गारंटीकृत दावा नहीं किया जाता।",
      "किसी भी तकनीकी त्रुटि, भुगतान गेटवे (Razorpay) की समस्या अथवा हमारे नियंत्रण से बाहर की किसी परिस्थिति से उत्पन्न देरी अथवा असुविधा के लिए पुण्यता की उत्तरदायित्व सीमा उपयोगकर्ता द्वारा भुगतान की गई राशि तक सीमित रहेगी।",
    ],
  },
  {
    heading: "9. गोपनीयता",
    body: [
      "आपकी व्यक्तिगत जानकारी (नाम, गोत्र, मोबाइल नंबर, पता) केवल सेवा सम्पन्न करने एवं प्रमाण भेजने के उद्देश्य से उपयोग की जाती है, और किसी तीसरे पक्ष को व्यावसायिक उद्देश्य से नहीं बेची जाती।",
    ],
  },
  {
    heading: "10. लागू कानून एवं क्षेत्राधिकार",
    body: [
      "यह शर्तें भारत के कानूनों के अंतर्गत नियंत्रित होती हैं। किसी भी विवाद की स्थिति में पुष्कर, राजस्थान के न्यायालयों का क्षेत्राधिकार लागू होगा।",
    ],
  },
];

function TermsPage() {
  return (
    <SiteChrome>
      <main className="max-w-2xl mx-auto px-4 pb-24 md:pb-16 pt-6 space-y-8">
        <header className="text-center space-y-3">
          <div className="text-xs font-bold uppercase tracking-widest text-brand">Legal</div>
          <h1 className="mt-1 text-3xl font-bold flex items-center justify-center gap-2">
            <ScrollText size={26} className="text-brand" /> नियम एवं शर्तें
          </h1>
          <div className="inline-flex items-center gap-1.5 bg-brand-soft text-brand text-xs font-bold px-3 py-1.5 rounded-full">
            <ShieldCheck size={13} /> 11 साल का विश्वास
          </div>
          <p className="text-xs text-muted-foreground">प्रभावी तिथि: 28 अगस्त 2026</p>
        </header>

        <div className="card-soft p-5 space-y-2 border border-brand/10">
          <p className="text-sm text-foreground/80 leading-relaxed">
            पुण्यता का उपयोग करने से पहले कृपया यह शर्तें ध्यान से पढ़ें। सदस्यता लेने अथवा भुगतान करने पर आप इन शर्तों को स्वीकार करते हैं।
          </p>
        </div>

        <div className="space-y-5">
          {SECTIONS.map((s) => (
            <section key={s.heading} className="card-soft p-5 space-y-2.5">
              <h2 className="text-base font-bold text-[#5B1A1A]">{s.heading}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="text-sm text-foreground/80 leading-relaxed">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="card-soft p-5 space-y-2 border border-brand/10 text-center">
          <h2 className="text-base font-bold text-brand">प्रश्न हैं?</h2>
          <p className="text-sm text-muted-foreground">
            Refund से जुड़ी जानकारी के लिए हमारी{" "}
            <Link to="/refund-policy" className="text-brand font-semibold underline">
              Refund Policy
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
