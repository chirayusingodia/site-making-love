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
    num: "१",
    title: "सुंदरकांड पाठ",
    desc: "आपके नाम एवं गोत्र से संकल्पपूर्वक सस्वर सुंदरकांड पाठ — श्री हनुमान जी की कृपा हेतु।",
  },
  {
    num: "२",
    title: "गृह शांति हवन",
    desc: "विद्वान आचार्यों द्वारा वैदिक मंत्रों से पवित्र हवन — आपके परिवार की मंगल कामना सहित।",
  },
  {
    num: "३",
    title: "गौ माता सेवा",
    desc: "स्थानीय गौशालाओं में गौ माता को हरा चारा एवं गुड़ का अर्पण — सीधा पुण्य।",
  },
  {
    num: "४",
    title: "वानर सेवा",
    desc: "पुष्कर के पवित्र स्थलों पर वानरों को फल एवं चना — श्री हनुमान जी के प्रिय।",
  },
  {
    num: "५",
    title: "ब्राह्मण भोज",
    desc: "विद्वान ब्राह्मणों को सात्विक भोजन एवं यथायोग्य सत्कार — पितृ आशीर्वाद।",
  },
];

const journey = [
  { title: "मासिक संकल्प", desc: "अपना नाम, गोत्र एवं संकल्प साझा करें। मासिक योगदान ₹२५० मात्र।" },
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

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-saffron/20 pb-32">
      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="font-display font-extrabold text-xl tracking-tight text-saffron uppercase">
            पुण्यम सेवा
          </div>
          <div className="hidden md:flex gap-8 text-sm font-medium tracking-wide uppercase opacity-70">
            <a href="#sevas" className="hover:text-saffron transition-colors">सेवाएँ</a>
            <a href="#journey" className="hover:text-saffron transition-colors">प्रक्रिया</a>
            <a href="#testimonials" className="hover:text-saffron transition-colors">प्रशंसा</a>
            <a href="#faq" className="hover:text-saffron transition-colors">प्रश्न</a>
          </div>
          <a
            href="#subscribe"
            className="bg-saffron text-white px-5 py-2 rounded-full text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            सदस्य बनें
          </a>
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
              मासिक संकल्प लें — ₹२५०
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
      <section className="px-6 py-16">
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

      {/* Sevas */}
      <section id="sevas" className="px-6 py-24 bg-cream">
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
                <div className="font-display font-extrabold text-5xl text-saffron mb-2">₹२५०</div>
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
      <section className="px-6 py-24">
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
      <section id="journey" className="px-6 py-24 bg-cream">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-saffron block mb-4">
              पुण्य की यात्रा
            </span>
            <h2 className="font-display font-bold text-3xl md:text-4xl">तीन सरल चरण</h2>
          </div>

          <div className="space-y-12 relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border md:left-1/2" />
            {journey.map((step, i) => {
              const right = i % 2 === 1;
              return (
                <div key={i} className="relative flex flex-col md:flex-row md:items-center gap-8">
                  <div className="absolute left-4 md:left-1/2 -translate-x-1/2 size-4 rounded-full bg-saffron ring-4 ring-cream" />
                  {right ? <div className="hidden md:block md:w-1/2" /> : null}
                  <div
                    className={`md:w-1/2 pl-12 ${
                      right ? "md:pl-12" : "md:text-right md:pr-12 md:pl-0"
                    }`}
                  >
                    <div className="font-mono text-xs uppercase tracking-widest text-saffron mb-2">
                      चरण {["०१", "०२", "०३"][i]}
                    </div>
                    <h4 className="font-display font-bold text-xl mb-2">{step.title}</h4>
                    <p className="text-muted-foreground leading-relaxed">{step.desc}</p>
                  </div>
                  {right ? null : <div className="hidden md:block md:w-1/2" />}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="px-6 py-24">
        <div className="max-w-6xl mx-auto bg-saffron text-white rounded-[2.5rem] px-8 py-16 md:px-16 md:py-20">
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
      <section id="faq" className="max-w-3xl mx-auto px-6 py-24">
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
      <section id="subscribe" className="px-6 py-24">
        <div className="max-w-3xl mx-auto bg-deep text-cream rounded-[2.5rem] p-12 md:p-16 text-center">
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-gold mb-6">
            🚩 जय श्री राम • जय बजरंगबली 🚩
          </div>
          <h2 className="font-display font-extrabold text-3xl md:text-5xl mb-6 leading-tight text-balance">
            अखंड पुण्य के भागीदार बनें।
          </h2>
          <p className="opacity-80 max-w-xl mx-auto mb-10 leading-relaxed">
            मात्र ₹२५० मासिक — सुंदरकांड, हवन, गौ सेवा, वानर सेवा एवं ब्राह्मण भोज।
            हर अनुष्ठान का Video Proof आपके WhatsApp पर।
          </p>
          <a
            href="https://wa.me/919999999999?text=जय%20सियाराम%20—%20मुझे%20पुण्यम%20सेवा%20मासिक%20संकल्प%20आरंभ%20करना%20है"
            target="_blank"
            rel="noreferrer"
            className="inline-block bg-saffron text-white px-10 py-5 rounded-xl text-lg font-bold hover:opacity-90 transition-opacity"
          >
            WhatsApp पर संकल्प लें — ₹२५०/माह
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
          © २०२६ पुण्यम सेवा संस्थान • पुष्कर राज • राजस्थान
        </div>
      </footer>

      {/* Sticky subscription bar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-2xl bg-background/95 backdrop-blur-xl border border-saffron/30 rounded-2xl p-3 pl-5 shadow-2xl z-50 flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
            मासिक सेवा योगदान
          </div>
          <div className="font-display text-xl font-extrabold text-saffron leading-none mt-1">
            ₹२५० <span className="text-xs font-normal text-foreground">/ माह</span>
          </div>
        </div>
        <a
          href="#subscribe"
          className="bg-saffron text-white px-5 py-3 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          सदस्य बनें
        </a>
      </div>
    </div>
  );
}
