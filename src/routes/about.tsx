import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MapPin, Video, ShieldCheck, Sun, Flame, BookOpen, Sparkles, Heart, Users } from "lucide-react";
import { SiteChrome } from "@/components/site-chrome";
import { SlidingImageCard, type Slide } from "@/components/SlidingImageCard";
import pushkarGhatImg from "@/assets/pushkar-ghat.jpg";
import { CountUp } from "@/components/CountUp";

// Import local story images
import story1 from "@/assets/about/story_1.png";
import story2 from "@/assets/about/story_2.png";
import story3 from "@/assets/about/story_3.png";
import story4 from "@/assets/about/story_4.png";

const storySlides: Slide[] = [
  { src: story1, alt: "Pushkar Brahma temple", title: "Tirth Guru Pushkarraj", subtitle: "Jahan har sankalp shuru hota hai" },
  { src: story2, alt: "Elderly priest", title: "Anubhavi Pandit Samuday", subtitle: "Vidhi-vidhan se, poori shraddha ke saath" },
  { src: story3, alt: "Devotee viewing proof", title: "Aapka Vishwas, Hamari Zimmedari", subtitle: "Har seva ka proof, seedha aapke paas" },
  { src: story4, alt: "Pushkar sunset", title: "Bharat Ka Punya Bank", subtitle: "Sewa Hamari, Punya Aapka" },
];

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us — पुण्यता | भारत का पुण्य बैंक | अब भारत करेगा पुण्यता" },
      { name: "description", content: "पुण्यता — भारत का पुण्य साथी। तीर्थ गुरु पुष्करराज से आपके नाम एवं गोत्र से मासिक सेवा एवं दान-पुण्य।" },
    ],
  }),
  component: AboutPage,
});

const iconServices = [
  { Icon: Sun, label: "Aarti" },
  { Icon: Flame, label: "Hawan" },
  { Icon: BookOpen, label: "Pooja" },
  { Icon: Sparkles, label: "Chadava" },
  { Icon: Heart, label: "Daan" },
  { Icon: Users, label: "Sewa" },
];

const shloks = [
  { t: "श्रीरामचरितमानस", s: "कलिजुग केवल हरि गुन गाहा। गावत नर पावहिं भव थाहा॥", m: "कलियुग में केवल भगवान श्रीहरि के गुण गान से ही मनुष्य भवसागर से पार हो जाता है।" },
  { t: "श्रीमद्भगवद्गीता 17.20", s: "दातव्यमिति यद्दानं दीयतेऽनुपकारिणे।\nदेशे काले च पात्रे च तद्दानं सात्त्विकं स्मृतम्॥", m: "योग्य पात्र को, उचित स्थान और समय पर, बिना प्रत्युपकार की आशा से दिया गया दान 'सात्त्विक दान' कहलाता है।" },
  { t: "शास्त्र वचन", s: "दानेन तुल्यं सुकृतं न कच्चित।", m: "दान के समान कोई पुण्य नहीं है — यह पुण्य आत्मा के साथ आगे भी चलता है।" },
];

function AboutPage() {
  return (
    <SiteChrome>
      <div className="w-full">
        <div className="max-w-5xl mx-auto md:px-4 md:pt-4">
          <SlidingImageCard slides={storySlides} aspectRatio="video" rounded="md:rounded-3xl rounded-none" />
        </div>
      </div>
      <main className="max-w-3xl mx-auto px-4 pb-24 md:pb-16 pt-8 space-y-14">
        {/* Hero */}
        <section className="text-center space-y-3 animate-fade-up">
          <div className="text-xs font-bold uppercase tracking-widest text-brand">पुण्यता — About Us</div>
          <h1 className="text-4xl font-bold text-brand leading-tight">भारत का पुण्य बैंक</h1>
          <p className="text-lg font-semibold text-foreground/80">भारत का पुण्य साथी</p>
          <p className="text-2xl md:text-3xl font-bold text-[#5B1A1A] pt-3">
            अब भारत करेगा पुण्यता।
          </p>
        </section>

        {/* Mission */}
        <section className="space-y-4 animate-fade-up">
          <h2 className="text-2xl font-bold">हमारा मिशन</h2>
          <div className="card-soft p-6 space-y-3 text-[15px] text-foreground/85 leading-relaxed">
            <p>शहरों की व्यस्त ज़िंदगी में — office, बच्चों की पढ़ाई, ट्रैफ़िक, यात्रा — हर परिवार अपने धार्मिक कर्तव्यों से धीरे-धीरे दूर होता जा रहा है। तीर्थ स्थल दूर हैं, समय कम है, और पंडित जी का शुल्क अलग।</p>
            <p>पुण्यता इसी खाई को भरने के लिए बना है। हम तीर्थ गुरु पुष्करराज में बैठे हुए विद्वान आचार्यों के साथ मिलकर — आपके नाम, आपके गोत्र, आपके संकल्प से — सुंदरकांड, हवन, आरती, दान-पुण्य एवं ब्राह्मण भोज सम्पन्न करवाते हैं।</p>
            <p className="italic text-brand font-semibold">"हम आपकी ज़िम्मेदारी नहीं लेते — हम उसे आपकी ओर से निभाते हैं।"</p>
          </div>
        </section>

        {/* Why Punya Matters */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">पुण्य क्यों ज़रूरी है</h2>
          <div className="rounded-3xl overflow-hidden bg-gradient-to-b from-[#5B1A1A] to-[#3D0F0F] text-white p-6 space-y-4">
            {shloks.map((sh) => (
              <div key={sh.t} className="rounded-2xl bg-white/10 border border-white/15 p-4 space-y-2">
                <div className="text-[11px] font-bold text-[#F5A742] uppercase tracking-wider">{sh.t}</div>
                <p className="font-bold text-[15px] leading-relaxed whitespace-pre-line text-white">{sh.s}</p>
                <p className="text-sm text-white/80 italic leading-relaxed">{sh.m}</p>
              </div>
            ))}
            <p className="text-center text-[13px] text-white/85 italic pt-2">
              "यह पुण्य केवल इस जन्म तक सीमित नहीं — शास्त्रों के अनुसार यह आत्मा के साथ आगे भी चलता है।"
            </p>
          </div>
        </section>

        {/* What we do */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">हम क्या करते हैं</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {iconServices.map(({ Icon, label }) => (
              <div key={label} className="card-soft p-4 text-center">
                <div className="w-12 h-12 rounded-full bg-brand-soft flex items-center justify-center mx-auto">
                  <Icon size={22} className="text-brand" />
                </div>
                <div className="mt-2 text-sm font-bold text-foreground">{label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Pushkar */}
        <section className="space-y-3">
          <h2 className="text-2xl font-bold">तीर्थ गुरु पुष्करराज</h2>
          <div className="card-soft overflow-hidden">
            <img src={pushkarGhatImg} alt="तीर्थ गुरु पुष्करराज" className="w-full h-56 object-cover" />
            <div className="p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-brand">
                <MapPin size={14} /> पुष्कर, राजस्थान — 305022
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed">
                पुष्कर को समस्त तीर्थों का गुरु — तीर्थ गुरु — कहा गया है। यहाँ ब्रह्मा जी का एकमात्र प्रमुख मंदिर है, और यहाँ किया गया दान-पुण्य शास्त्रों में विशेष रूप से फलदायी माना गया है। इसीलिए पुण्यता की हर सेवा यहीं से आरंभ होती है।
              </p>
            </div>
          </div>
        </section>

        {/* Transparency */}
        <section className="card-soft p-6 space-y-3 border border-brand/10">
          <div className="flex items-center gap-2">
            <ShieldCheck size={22} className="text-brand" />
            <h2 className="text-xl font-bold">पारदर्शिता का वादा</h2>
          </div>
          <p className="text-sm text-foreground/85 leading-relaxed">
            "हर सेवा का प्रमाण — कोई खोखला वादा नहीं।" प्रत्येक अनुष्ठान का Live या Video Proof सीधे आपके WhatsApp पर भेजा जाता है — जिसमें आपका नाम एवं गोत्र स्पष्ट रूप से बोला जाता है।
          </p>
          <div className="flex items-center gap-1 text-xs text-success font-bold">
            <Video size={14} /> 100% WhatsApp Video Proof
          </div>
        </section>

        {/* Stats */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-center">संख्या में पुण्यता</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { end: 1200, suffix: "+", l: "परिवार जुड़े" },
              { end: 15000, suffix: "+", l: "सेवाएँ सम्पन्न" },
              { end: 100, suffix: "%", l: "Video Proof Delivery" },
            ].map((s) => (
              <div key={s.l} className="card-soft p-4 text-center">
                <div className="text-2xl font-bold text-brand">
                  <CountUp end={s.end} suffix={s.suffix} />
                </div>
                <div className="text-xs text-muted-foreground mt-1 leading-tight">{s.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="text-center card-soft p-8 border border-brand/15 bg-gradient-to-b from-brand-soft/40 to-transparent space-y-4">
          <div className="text-2xl md:text-3xl font-bold text-[#5B1A1A]">अब भारत करेगा पुण्यता।</div>
          <Link to="/plans" className="inline-flex items-center gap-2 bg-brand text-white font-bold px-6 py-3.5 rounded-full hover:bg-brand-deep transition-colors">
            See Plans <ArrowRight size={18} />
          </Link>
        </section>
      </main>
    </SiteChrome>
  );
}
