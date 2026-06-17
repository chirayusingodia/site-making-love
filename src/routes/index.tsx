import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import heroImg from "@/assets/pushkar-hero.jpg";
import havanImg from "@/assets/havan.jpg";
import gauSevaImg from "@/assets/gau-seva.jpg";
import pushkarGhatImg from "@/assets/pushkar-ghat.jpg";

const WHATSAPP_URL =
  "https://wa.me/919999999999?text=%E0%A4%9C%E0%A4%AF%20%E0%A4%B8%E0%A4%BF%E0%A4%AF%E0%A4%BE%E0%A4%B0%E0%A4%BE%E0%A4%AE%20%F0%9F%99%8F%F0%9F%8F%BB%20%E0%A4%AE%E0%A5%81%E0%A4%9D%E0%A5%87%20%E0%A4%AA%E0%A5%81%E0%A4%A3%E0%A5%8D%E0%A4%AF%E0%A4%AE%20%E0%A4%B8%E0%A5%87%E0%A4%B5%E0%A4%BE%20%E0%A4%B8%E0%A5%87%20%E0%A4%9C%E0%A5%81%E0%A4%A1%E0%A4%BC%E0%A4%A8%E0%A4%BE%20%E0%A4%B9%E0%A5%88";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "पुण्यम सेवा — मासिक संकल्प से जुड़ें | Sundarkand, Havan & Gau Seva" },
      {
        name: "description",
        content:
          "पुष्कर से आपके नाम और गोत्र से मासिक सुंदरकांड पाठ, हवन, गौ सेवा, वानर सेवा एवं ब्राह्मण भोज। प्रत्येक अनुष्ठान का Video Proof सीधे WhatsApp पर।",
      },
      { property: "og:title", content: "पुण्यम सेवा — मासिक सेवा योगदान" },
      {
        property: "og:description",
        content: "सनातन सेवा का सामूहिक यज्ञ। पूर्ण पारदर्शिता के साथ मासिक संकल्प।",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: HomePage,
});

const sevas = [
  {
    num: "1",
    title: "सुंदरकांड पाठ",
    desc: "आपके नाम एवं गोत्र से संकल्पपूर्वक सस्वर सुंदरकांड पाठ — श्री हनुमान जी की कृपा हेतु।",
  },
  {
    num: "2",
    title: "गृह शांति हवन",
    desc: "विद्वान आचार्यों द्वारा वैदिक मंत्रों से पवित्र हवन — आपके परिवार की मंगल कामना सहित।",
  },
  {
    num: "3",
    title: "गौ माता सेवा",
    desc: "स्थानीय गौशालाओं में गौ माता को हरा चारा एवं गुड़ का अर्पण — सीधा पुण्य।",
  },
  {
    num: "4",
    title: "वानर सेवा",
    desc: "पुष्कर के पवित्र स्थलों पर वानरों को फल एवं चना — श्री हनुमान जी के प्रिय।",
  },
  {
    num: "5",
    title: "ब्राह्मण भोज",
    desc: "विद्वान ब्राह्मणों को सात्विक भोजन एवं यथायोग्य सत्कार — पितृ आशीर्वाद।",
  },
];


const journey = [
  { title: "मासिक संकल्प", desc: "अपना नाम, गोत्र एवं संकल्प साझा करें। मासिक योगदान ₹251 मात्र।" },
  { title: "पुष्कर में अनुष्ठान", desc: "हमारे आचार्य आपके नाम से सुंदरकांड, हवन एवं समस्त सेवाएँ सम्पन्न करते हैं।" },
  { title: "WhatsApp पर Video Proof", desc: "प्रत्येक अनुष्ठान का Live या Video Proof सीधे आपके WhatsApp पर — पूर्ण पारदर्शिता।" },
];

const faqs = [
  {
    q: "इतने सस्ते में कैसे करवा पा रहे हो यह सब?",
    a: "सभी के नाम का संकल्प साथ में लिया जाएगा। हर व्यक्ति का नाम और गोत्र अलग-अलग बोला जाएगा, लेकिन पंडित जी एक ही बार में सबके संकल्प सामूहिक रूप से ले लेंगे। इसीलिए यह सेवा सभी के लिए सुलभ और सस्ती रखी गई है।",
    highlighted: true,
  },
  {
    q: "क्या मुझे प्रत्येक सेवा का प्रमाण मिलेगा?",
    a: "जी हाँ। प्रत्येक अनुष्ठान — सुंदरकांड, हवन, गौ सेवा, वानर सेवा एवं ब्राह्मण भोज — का Live या Video Proof सीधे आपके WhatsApp पर भेजा जाता है। पूर्ण पारदर्शिता हमारी प्राथमिकता है।",
  },
  {
    q: "क्या यह कोई व्यवसाय है?",
    a: "नहीं। यह सनातन सेवा का एक सामूहिक यज्ञ है। आपकी सेवा राशि का एक-एक पैसा सीधे गौ-माता के चारे, वानरों के फल, ब्राह्मण भोज एवं अनुष्ठान सामग्री में लगाया जाता है।",
  },
  {
    q: "क्या मैं अपने माता-पिता या प्रियजनों के नाम से संकल्प ले सकता हूँ?",
    a: "अवश्य। आप अपने माता-पिता, स्वर्गीय प्रियजनों या किसी भी सदस्य के नाम और गोत्र से यह मासिक संकल्प आरंभ कर सकते हैं।",
  },
  {
    q: "क्या मैं किसी भी समय योगदान रोक सकता हूँ?",
    a: "जी हाँ, बिना किसी शुल्क या प्रश्न के आप अपना मासिक योगदान कभी भी रोक सकते हैं।",
  },
];

function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [waOpen, setWaOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-saffron/20 pb-32">

      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl border-b border-saffron/20 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex justify-between items-center gap-3">
          <a href="#top" className="font-display font-extrabold text-lg md:text-xl tracking-tight text-saffron uppercase shrink-0">
            🚩 पुण्यम सेवा
          </a>
          <div className="hidden md:flex gap-6 text-sm font-medium tracking-wide uppercase opacity-80">
            <a href="#sundarkand" className="hover:text-saffron transition-colors">सुंदरकांड</a>
            <a href="#sevas" className="hover:text-saffron transition-colors">सेवाएँ</a>
            <a href="#journey" className="hover:text-saffron transition-colors">प्रक्रिया</a>
            <a href="#testimonials" className="hover:text-saffron transition-colors">प्रशंसा</a>
            <a href="#faq" className="hover:text-saffron transition-colors">प्रश्न</a>
          </div>
          <a
            href="#subscribe"
            className="bg-saffron text-white px-4 md:px-5 py-2 rounded-full text-xs md:text-sm font-semibold hover:opacity-90 transition-opacity shrink-0"
          >
            सदस्य बनें
          </a>
        </div>
        {/* mobile section nav */}
        <div className="md:hidden flex gap-4 overflow-x-auto px-4 pb-2 text-xs font-medium uppercase tracking-wide opacity-80 scrollbar-none">
          <a href="#sundarkand" className="whitespace-nowrap hover:text-saffron">सुंदरकांड</a>
          <a href="#sevas" className="whitespace-nowrap hover:text-saffron">सेवाएँ</a>
          <a href="#journey" className="whitespace-nowrap hover:text-saffron">प्रक्रिया</a>
          <a href="#testimonials" className="whitespace-nowrap hover:text-saffron">प्रशंसा</a>
          <a href="#faq" className="whitespace-nowrap hover:text-saffron">प्रश्न</a>
        </div>
      </nav>


      {/* Hero */}
      <section className="relative px-6 pt-20 pb-20 text-center overflow-hidden">
        <div className="max-w-4xl mx-auto animate-incense">
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-gold mb-6 block">
            🚩 जय सियाराम • पुष्कर राज से
          </span>
          <h1 className="font-display font-extrabold text-4xl md:text-6xl lg:text-7xl leading-[1.1] mb-8 text-balance">
            हर घर में सुंदरकांड,<br />
            <span className="text-saffron">हर मन में राम।</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 text-pretty leading-relaxed">
            व्यस्तता के कारण स्वयं अनुष्ठान नहीं कर पाते? संस्थान आपके{" "}
            <span className="text-foreground font-medium">नाम एवं गोत्र</span> से पुष्कर में मासिक
            सुंदरकांड पाठ, हवन, गौ सेवा एवं ब्राह्मण भोज सम्पन्न करवाता है।
          </p>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            <a
              href="#subscribe"
              className="bg-saffron text-white px-8 py-4 rounded-xl text-lg font-bold shadow-xl shadow-saffron/20 hover:shadow-saffron/40 transition-all"
            >
              सदस्य बनें — ₹251/माह
            </a>
            <span className="text-xs font-mono opacity-60 uppercase tracking-wider">
              कभी भी रोकें • कोई प्रतिबद्धता नहीं
            </span>
          </div>
        </div>

        <div className="mt-16 max-w-6xl mx-auto rounded-3xl overflow-hidden ring-1 ring-black/5 shadow-2xl animate-incense [animation-delay:200ms]">
          <img
            src={heroImg}
            alt="पुष्कर सरोवर — सूर्योदय के समय मंदिर एवं घाट"
            width={1920}
            height={896}
            className="w-full aspect-[21/9] object-cover"
          />
        </div>
      </section>

      {/* Manifesto strip */}
      <section className="px-6 py-12">
        <div className="max-w-3xl mx-auto text-center">
          <p className="font-display text-2xl md:text-3xl leading-relaxed text-balance text-deep">
            "यह कोई व्यवसाय नहीं — यह सनातन सेवा का{" "}
            <span className="text-saffron">सामूहिक यज्ञ</span> है।"
          </p>
          <p className="font-mono text-xs uppercase tracking-[0.3em] mt-6 opacity-50">
            पूर्ण पारदर्शिता • हर पैसे का हिसाब • Video Proof
          </p>
        </div>
      </section>

      {/* Sundarkand — Importance (highlighted) */}
      <section id="sundarkand" className="px-6 py-14 bg-deep text-cream relative overflow-hidden">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div className="rounded-3xl overflow-hidden ring-1 ring-gold/20 shadow-2xl order-2 lg:order-1">
            <img
              src={pushkarGhatImg}
              alt="पुष्कर घाट — सूर्योदय के समय दीप अर्पण एवं आरती"
              width={1920}
              height={1080}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="order-1 lg:order-2">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-gold block mb-4">
              🚩 सुंदरकांड का महात्म्य
            </span>
            <h2 className="font-display font-extrabold text-3xl md:text-5xl leading-[1.15] mb-6 text-balance">
              जहाँ सुंदरकांड,<br />
              <span className="text-saffron">वहाँ संकट का नाश।</span>
            </h2>
            <p className="text-lg leading-relaxed opacity-90 mb-5">
              श्री राम चरितमानस का सुंदरकांड — एकमात्र ऐसा कांड है जिसमें श्री हनुमान जी ने स्वयं
              अपने पराक्रम से असंभव को संभव कर दिखाया। शास्त्रों में कहा गया है —
              <span className="text-gold font-medium"> "सुंदरकांड का पाठ करने वाले के घर में
              न दरिद्रता रहती है, न रोग, न शोक, न भय।"</span>
            </p>
            <p className="text-lg leading-relaxed opacity-90 mb-5">
              यह पाठ साक्षात हनुमान जी का आवाहन है — कार्य में आ रही बाधाएँ हटती हैं, बिगड़े काम
              बनते हैं, ग्रह दोष शांत होते हैं, और परिवार में सकारात्मक ऊर्जा का संचार होता है।
              मंगलवार एवं शनिवार को इसका पाठ विशेष फलदायी माना गया है।
            </p>

            <div className="mt-8 p-6 rounded-2xl bg-saffron/10 border border-saffron/30">
              <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-gold mb-3">
                आज के समय में सुंदरकांड की लागत
              </div>
              <div className="flex items-baseline gap-4 flex-wrap mb-4">
                <span className="font-display text-3xl md:text-4xl font-extrabold line-through opacity-60">
                  ₹7,०००–10,०००
                </span>
                <span className="text-xs uppercase tracking-wider opacity-60">
                  सामान्य आचार्य शुल्क
                </span>
              </div>
              <p className="leading-relaxed opacity-90 mb-4">
                आज एक बार सुंदरकांड का पाठ अपने घर पर करवाने में ₹7,000 से ₹10,000 तक खर्च आता है —
                आचार्य, सामग्री, प्रसाद, दक्षिणा सब मिलाकर। बहुत से भक्त चाहकर भी यह पुण्य लाभ नहीं
                ले पाते।
              </p>
              <p className="leading-relaxed text-gold font-medium">
                इसलिए श्री हनुमान जी की कृपा से हमने संकल्प लिया — यह पुण्य हर घर तक पहुँचे।
                सामूहिक संकल्प के माध्यम से <span className="text-saffron font-bold">मात्र ₹251</span>{" "}
                में आपके नाम और गोत्र से सुंदरकांड पाठ — ताकि राम नाम का पुण्य आपके खाते में
                नित्य जुड़ता रहे।
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Daan in Pushkar — Importance */}
      <section className="px-6 py-14">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">
              पुष्कर में दान का माहात्म्य
            </span>
            <h2 className="font-display font-bold text-3xl md:text-5xl leading-tight mb-6 text-balance">
              तीर्थराज पुष्कर —<br />
              <span className="text-saffron">जहाँ एक दान, सहस्र पुण्य।</span>
            </h2>
            <div className="h-1 w-20 bg-gold mx-auto" />
          </div>

          <p className="text-lg leading-relaxed text-muted-foreground max-w-3xl mx-auto text-center mb-12">
            पद्म पुराण के अनुसार पुष्कर समस्त तीर्थों का राजा है — स्वयं ब्रह्मा जी का यज्ञ
            स्थल। यहाँ किया गया एक दान अन्य स्थानों पर किए सहस्र दानों के समान फलदायी होता है।
            इसीलिए हमारी समस्त सेवाएँ इसी पवित्र भूमि से सम्पन्न होती हैं।
          </p>

          <div className="grid grid-cols-2 gap-3 md:gap-6">
            <div className="p-4 md:p-8 rounded-2xl border border-border bg-cream">
              <div className="text-3xl mb-3 md:mb-4">🐄</div>
              <h3 className="font-display font-bold text-lg md:text-2xl mb-2 md:mb-3">गौ माता को हरा चारा</h3>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-3">
                शास्त्रों में गौ माता में तैंतीस कोटि देवताओं का वास माना गया है। उन्हें हरा चारा
                अर्पित करने से पितृ दोष शांत होते हैं, घर में लक्ष्मी का वास होता है, और संतान
                सुख की प्राप्ति होती है।
              </p>
              <p className="text-xs md:text-sm text-saffron font-medium">
                "गावो विश्वस्य मातरः" — गाय ही सम्पूर्ण विश्व की माता हैं।
              </p>
            </div>

            <div className="p-4 md:p-8 rounded-2xl border border-saffron/40 bg-saffron/5">
              <div className="text-3xl mb-3 md:mb-4">🍌</div>
              <h3 className="font-display font-bold text-lg md:text-2xl mb-2 md:mb-3">
                मंगलवार को वानरों को केला
              </h3>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-3">
                मंगलवार श्री हनुमान जी का दिन है। इस दिन वानरों को केला, चना और गुड़ खिलाना
                साक्षात हनुमान जी की सेवा मानी जाती है — क्योंकि वानर उनके स्वरूप हैं।
              </p>
              <p className="text-sm md:text-base leading-relaxed text-muted-foreground mb-3">
                इस सेवा से मंगल दोष शांत होते हैं, साहस और बल की वृद्धि होती है।
              </p>
              <p className="text-xs md:text-sm text-saffron font-medium">
                हर मंगलवार पुष्कर में आपके नाम से वानर सेवा सम्पन्न।
              </p>
            </div>
          </div>

          <p className="text-center mt-12 font-display text-xl md:text-2xl text-deep leading-relaxed text-balance">
            "जो स्वयं नहीं जा सकते — उनके नाम का संकल्प हम पुष्कर तक पहुँचाते हैं।
            <span className="text-saffron"> पुण्य आपका, सेवा हमारी।</span>"
          </p>
        </div>
      </section>

      {/* Sevas */}
      <section id="sevas" className="px-6 py-14 bg-cream">

        <div className="max-w-6xl mx-auto">
          <div className="mb-16 max-w-2xl">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">
              आपकी मासिक सेवाएँ
            </span>
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4">
              पाँच पवित्र अनुष्ठान, एक संकल्प
            </h2>
            <div className="h-1 w-20 bg-gold" />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sevas.map((s) => (
              <div
                key={s.num}
                className="group bg-background p-8 rounded-2xl border border-border hover:border-saffron/30 transition-all hover:-translate-y-1"
              >
                <div className="size-12 rounded-full bg-saffron-soft flex items-center justify-center mb-6 text-saffron font-display text-xl font-bold">
                  {s.num}
                </div>
                <h3 className="font-display text-xl font-bold mb-3">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            ))}
            <div className="p-8 rounded-2xl bg-deep text-cream flex flex-col justify-between">
              <div>
                <div className="font-mono text-xs uppercase tracking-[0.3em] opacity-60 mb-4">
                  मासिक योगदान
                </div>
                <div className="font-display font-extrabold text-5xl text-saffron mb-2">₹251</div>
                <p className="text-sm opacity-80 leading-relaxed">
                  एक-एक पैसा सीधे चारे, फल, भोज एवं सामग्री में।
                </p>
              </div>
              <a
                href="#subscribe"
                className="mt-6 inline-block bg-saffron text-white px-5 py-3 rounded-xl text-sm font-bold text-center hover:opacity-90 transition-opacity"
              >
                सदस्य बनें
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Image diptych */}
      <section className="px-6 py-14">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-8">
          <div className="rounded-2xl overflow-hidden aspect-[4/5] ring-1 ring-border">
            <img
              src={havanImg}
              alt="हवन अनुष्ठान"
              width={800}
              height={1024}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex flex-col justify-center">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron mb-4">
              हवन की ऊर्जा
            </span>
            <h3 className="font-display font-bold text-3xl md:text-4xl mb-6 leading-tight">
              अग्नि का साक्षी, मंत्रों का आशीर्वाद।
            </h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              पवित्र हवन-यज्ञ की सकारात्मक ऊर्जा सम्पूर्ण वातावरण को शुद्ध करती है। आपके नाम से किया
              गया संकल्प, मंत्रोच्चार के साथ अग्निदेव को समर्पित किया जाता है।
            </p>
            <p className="text-muted-foreground leading-relaxed">
              प्रत्येक हवन का सम्पूर्ण वीडियो — संकल्प से पूर्णाहुति तक — आपके WhatsApp पर भेजा जाता
              है।
            </p>
          </div>

          <div className="flex flex-col justify-center md:order-3">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron mb-4">
              गौ माता का स्पर्श
            </span>
            <h3 className="font-display font-bold text-3xl md:text-4xl mb-6 leading-tight">
              जहाँ गौ-सेवा है, वहाँ नारायण हैं।
            </h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              आपके योगदान से स्थानीय गौशालाओं में गायों को प्रतिमास हरा चारा एवं गुड़ अर्पित किया
              जाता है — आपके नाम के साथ।
            </p>
            <p className="text-muted-foreground leading-relaxed">
              गौ-सेवा का सीधा पुण्य — बिना किसी मध्यस्थ के।
            </p>
          </div>
          <div className="rounded-2xl overflow-hidden aspect-[4/5] ring-1 ring-border md:order-4">
            <img
              src={gauSevaImg}
              alt="गौ माता सेवा"
              width={800}
              height={1024}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Journey */}
      <section id="journey" className="px-6 py-14 bg-cream">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">
              पुण्य की यात्रा
            </span>
            <h2 className="font-display font-bold text-3xl md:text-4xl">तीन सरल चरण</h2>
          </div>

          <div className="grid grid-cols-3 gap-3 md:gap-6">
            {journey.map((step, i) => (
              <div
                key={i}
                className="bg-background rounded-2xl p-4 md:p-6 border border-border hover:border-saffron/40 transition-colors flex flex-col"
              >
                <div className="size-10 md:size-12 rounded-full bg-saffron text-white font-display font-bold text-base md:text-lg flex items-center justify-center mb-3 md:mb-4 shadow-md shadow-saffron/30">
                  {i + 1}
                </div>
                <h4 className="font-display font-bold text-sm md:text-lg mb-2 leading-snug">{step.title}</h4>
                <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>

          {/* Bundle highlight */}
          <div className="mt-10 rounded-2xl bg-deep text-cream p-6 md:p-8 text-center ring-1 ring-gold/30">
            <div className="font-mono text-[10px] md:text-xs uppercase tracking-[0.3em] text-gold mb-3">
              ✨ सम्पूर्ण बंडल ✨
            </div>
            <p className="font-display text-lg md:text-2xl leading-relaxed text-balance">
              ये सभी सेवाएँ — सुंदरकांड, हवन, गौ सेवा, वानर सेवा एवं ब्राह्मण भोज —
              <br className="hidden md:block" />
              <span className="text-saffron font-bold"> एक ही बंडल में, मात्र ₹251/- माह।</span>
            </p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="px-6 py-14">
        <div className="max-w-6xl mx-auto bg-saffron text-white rounded-[2.5rem] px-8 py-16 md:px-16 md:py-14">
          <span className="font-mono text-xs uppercase tracking-[0.3em] opacity-70 block mb-4">
            भक्तों के अनुभव
          </span>
          <h2 className="font-display font-bold text-3xl md:text-4xl mb-12 max-w-2xl">
            लाखों श्रद्धालुओं की आस्था का साक्षी।
          </h2>
          <div className="grid md:grid-cols-3 gap-10">
            {[
              {
                q: "हर सप्ताह WhatsApp पर वीडियो देखकर मन को असीम शांति मिलती है। माँ के नाम से हवन करवाना अब संभव हो सका।",
                n: "— राजेश शर्मा, दिल्ली",
              },
              {
                q: "व्यस्तता के कारण मैं स्वयं पुष्कर नहीं जा सकती थी। पुण्यम सेवा ने यह सम्भव कर दिया — पूर्ण पारदर्शिता के साथ।",
                n: "— सुनीता वर्मा, मुंबई",
              },
              {
                q: "गौ-सेवा का सीधा पुण्य अब हर महीने। यह व्यवसाय नहीं, सच्ची सेवा है। जय बजरंगबली।",
                n: "— अमित खंडेलवाल, जयपुर",
              },
            ].map((t, i) => (
              <div key={i} className="space-y-4">
                <div className="font-display text-5xl leading-none opacity-50">"</div>
                <p className="text-lg font-display leading-relaxed">{t.q}</p>
                <p className="font-mono text-xs opacity-80 uppercase tracking-wider">{t.n}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-14">
        <div className="text-center mb-12">
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">
            शंका समाधान
          </span>
          <h2 className="font-display font-bold text-3xl md:text-4xl">अक्सर पूछे जाने वाले प्रश्न</h2>
        </div>
        <div className="divide-y divide-border">
          {faqs.map((f, i) => (
            <button
              key={i}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              className={`w-full py-6 text-left group ${
                f.highlighted
                  ? "bg-saffron/5 border border-saffron/30 rounded-xl px-5 -mx-5"
                  : ""
              }`}
            >
              <div className="flex justify-between items-start gap-6">
                <div className="flex items-center gap-3">
                  {f.highlighted && (
                    <span className="bg-saffron text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0">
                      लोकप्रिय
                    </span>
                  )}
                  <h4 className="font-display font-bold text-lg group-hover:text-saffron transition-colors">
                    {f.q}
                  </h4>
                </div>
                <span
                  className={`text-saffron text-2xl shrink-0 transition-transform ${
                    openFaq === i ? "rotate-45" : ""
                  }`}
                >
                  +
                </span>
              </div>
              {openFaq === i && (
                <p className="text-muted-foreground mt-4 leading-relaxed text-pretty">{f.a}</p>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section id="subscribe" className="px-6 py-14">
        <div className="max-w-3xl mx-auto bg-deep text-cream rounded-[2.5rem] p-12 md:p-16 text-center">
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-gold mb-6">
            🚩 जय श्री राम • जय बजरंगबली 🚩
          </div>
          <h2 className="font-display font-extrabold text-3xl md:text-5xl mb-6 leading-tight text-balance">
            अखंड पुण्य के भागीदार बनें।
          </h2>
          <p className="opacity-80 max-w-xl mx-auto mb-10 leading-relaxed">
            मात्र ₹251 मासिक — सुंदरकांड, हवन, गौ सेवा, वानर सेवा एवं ब्राह्मण भोज।
            हर अनुष्ठान का Video Proof आपके WhatsApp पर।
          </p>
          <a
            href="https://wa.me/919999999999?text=जय%20सियाराम%20—%20मुझे%20पुण्यम%20सेवा%20मासिक%20संकल्प%20आरंभ%20करना%20है"
            target="_blank"
            rel="noreferrer"
            className="inline-block bg-saffron text-white px-10 py-5 rounded-xl text-lg font-bold hover:opacity-90 transition-opacity"
          >
            WhatsApp पर सदस्य बनें — ₹251/माह
          </a>
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-50 mt-8">
            कोई प्रतिबद्धता नहीं • कभी भी रोकें • पूर्ण पारदर्शिता
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-border text-center">
        <div className="font-display font-extrabold text-xl text-saffron mb-2">पुण्यम सेवा</div>
        <div className="font-mono text-[10px] tracking-[0.3em] uppercase opacity-50">
          © 2026 पुण्यम सेवा संस्थान • पुष्कर राज • राजस्थान
        </div>
      </footer>

      {/* Sticky subscription bar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-2xl bg-background/95 backdrop-blur-xl border border-saffron/30 rounded-2xl p-3 pl-5 shadow-2xl z-50 flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
            मासिक सेवा योगदान
          </div>
          <div className="font-display text-xl font-extrabold text-saffron leading-none mt-1">
            ₹251 <span className="text-xs font-normal text-foreground">/ माह</span>
          </div>
        </div>
        <a
          href="#subscribe"
          className="bg-saffron text-white px-5 py-3 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          सदस्य बनें
        </a>
      </div>

      {/* Floating WhatsApp button */}
      <div className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-[60] flex flex-col items-end gap-3">
        {waOpen && (
          <div className="animate-incense bg-background border border-saffron/30 shadow-2xl rounded-2xl p-4 pr-3 max-w-[18rem] relative">
            <button
              onClick={() => setWaOpen(false)}
              aria-label="बंद करें"
              className="absolute top-2 right-2 size-6 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
            >
              <X size={14} />
            </button>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-saffron mb-2">
              जय सियाराम 🙏🏻
            </div>
            <p className="text-sm leading-relaxed text-foreground mb-4 pr-4">
              आप हमसे WhatsApp पर भी जुड़ सकते हैं — नि:संकोच संपर्क करें, हम आपकी सेवा में
              उपस्थित हैं।
            </p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-[#25D366] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity w-full justify-center"
            >
              <MessageCircle size={16} />
              WhatsApp पर जुड़ें
            </a>
          </div>
        )}
        <button
          onClick={() => setWaOpen((v) => !v)}
          aria-label="WhatsApp पर संपर्क करें"
          className="size-14 rounded-full bg-[#25D366] text-white shadow-2xl shadow-[#25D366]/40 flex items-center justify-center hover:scale-105 transition-transform ring-4 ring-white/40"
        >
          <MessageCircle size={26} fill="white" strokeWidth={1.8} />
        </button>
      </div>
    </div>

  );
}
