import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Flame, Sun, Wind, Heart, Users, Sparkles } from "lucide-react";
import { sevaList } from "@/lib/plans";
import { SiteChrome } from "@/components/site-chrome";
import { SlidingImageCard, type Slide } from "@/components/SlidingImageCard";

import sundarkandImg from "@/assets/sevas/sundarkand.png";
import gauSevaImg from "@/assets/sevas/gau_seva.png";
import prasadSevaImg from "@/assets/sevas/prasad_seva.png";
import sarovarDeepdaanImg from "@/assets/sevas/sarovar_deepdaan.png";
import sadhuBhojanImg from "@/assets/sevas/sadhu_bhojan.png";
import hawanImg from "@/assets/sevas/hawan.png";

export const Route = createFileRoute("/sevas")({
  head: () => ({
    meta: [
      { title: "Our Sevas — पुण्यता | सुंदरकांड, हवन, आरती, गौ सेवा, वानर सेवा" },
      { name: "description", content: "पुण्यता की सभी सेवाओं की विस्तृत सूची — सुंदरकांड पाठ, गृह शांति हवन, आरती, गौ माता सेवा, वानर सेवा एवं साधु संतों को भोजन।" },
    ],
  }),
  component: SevasPage,
});

const iconMap: Record<string, any> = { BookOpen, Flame, Sun, Wind, Heart, Users, Sparkles };

type SevaStaticMedia = { images: string[]; captions: string[] };

const sevaMedia: Record<number, SevaStaticMedia> = {
  0: {
    images: [sundarkandImg],
    captions: ["सुंदरकांड पाठ — आपके नाम व गोत्र से संकट हरण पाठ"],
  },
  1: {
    images: [hawanImg],
    captions: ["गृह शांति एवं सर्व रोग निवारण हवन — वैदिक आहुति"],
  },
  2: {
    images: [sarovarDeepdaanImg],
    captions: ["आरती (Aarti) — दीप, धूप एवं भजन के साथ"],
  },
  3: {
    images: [gauSevaImg],
    captions: ["गौ माता सेवा — हरा चारा एवं गुड़ अर्पण"],
  },
  4: {
    images: [sundarkandImg],
    captions: ["वानर सेवा — श्री हनुमान जी के प्रिय फल व चना अर्पण"],
  },
  5: {
    images: [sadhuBhojanImg],
    captions: ["साधु संतों को भोजन — पुष्कर क्षेत्र साधु सत्कार"],
  },
  6: {
    images: [sarovarDeepdaanImg],
    captions: ["सरोवर दीपदान — पुष्कर सरोवर में संध्या दीप अर्पण"],
  },
  7: {
    images: [sundarkandImg],
    captions: ["हनुमान जी चोला सेवा — सिंदूर व चमेली तेल अर्पण"],
  },
  8: {
    images: [prasadSevaImg],
    captions: ["भंडारा / प्रसाद सेवा — पवित्र पुष्कर प्रसाद वितरण"],
  },
  9: {
    images: [hawanImg],
    captions: ["भव्य श्रृंगार — पुष्प व वस्त्रों से आलौकिक श्रृंगार"],
  },
};

function SevasPage() {
  return (
    <SiteChrome>
      <main className="max-w-4xl mx-auto px-4 pb-24 md:pb-16 pt-6 space-y-10">
        <header className="text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-brand">Our Sevas</div>
          <h1 className="mt-2 text-3xl font-bold">पुण्यता की सेवाएँ</h1>
          <p className="mt-2 text-[15px] text-muted-foreground max-w-xl mx-auto">
            तीर्थ गुरु पुष्करराज में आपके नाम एवं गोत्र से सम्पन्न होने वाली सभी सेवाएँ — पूर्ण पारदर्शिता और WhatsApp Video Proof के साथ।
          </p>
        </header>

        <div className="space-y-10">
          {sevaList.map((s, idx) => {
            const Icon = iconMap[s.iconKey] || BookOpen;
            const media = sevaMedia[idx];
            const slides: Slide[] = media
              ? media.images.map((img, i) => ({
                  src: img,
                  alt: `${s.title} — ${media.captions[i]}`,
                  title: media.captions[i],
                  subtitle: s.title,
                }))
              : [];
            const reverse = idx % 2 === 1;
            return (
              <section
                key={s.title}
                className={`card-soft card-lift overflow-hidden grid md:grid-cols-2 gap-0 ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}
              >
                <div className="md:p-4">
                  {slides.length > 0 && (
                    <SlidingImageCard slides={slides} aspectRatio="4/5" rounded="md:rounded-2xl rounded-none" />
                  )}
                </div>
                <div className="p-6 flex flex-col justify-center gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-brand-soft flex items-center justify-center shrink-0">
                      <Icon size={24} className="text-brand" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">{s.title}</h2>
                  </div>
                  <p className="text-[15px] text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </SiteChrome>
  );
}
