import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Flame, Sun, Wind, Heart, Users, Sparkles } from "lucide-react";
import { sevaList } from "@/lib/plans";
import { SiteChrome } from "@/components/site-chrome";
import { SlidingImageCard, type Slide } from "@/components/SlidingImageCard";

// Import all 30 local seva images
import s1v1 from "@/assets/sevas/seva_1_var1.png";
import s1v2 from "@/assets/sevas/seva_1_var2.png";
import s1v3 from "@/assets/sevas/seva_1_var3.png";

import s2v1 from "@/assets/sevas/seva_2_var1.png";
import s2v2 from "@/assets/sevas/seva_2_var2.png";
import s2v3 from "@/assets/sevas/seva_2_var3.png";

import s3v1 from "@/assets/sevas/seva_3_var1.png";
import s3v2 from "@/assets/sevas/seva_3_var2.png";
import s3v3 from "@/assets/sevas/seva_3_var3.png";

import s4v1 from "@/assets/sevas/seva_4_var1.png";
import s4v2 from "@/assets/sevas/seva_4_var2.png";
import s4v3 from "@/assets/sevas/seva_4_var3.png";

import s5v1 from "@/assets/sevas/seva_5_var1.png";
import s5v2 from "@/assets/sevas/seva_5_var2.png";
import s5v3 from "@/assets/sevas/seva_5_var3.png";

import s6v1 from "@/assets/sevas/seva_6_var1.png";
import s6v2 from "@/assets/sevas/seva_6_var2.png";
import s6v3 from "@/assets/sevas/seva_6_var3.png";

import s7v1 from "@/assets/sevas/seva_7_var1.png";
import s7v2 from "@/assets/sevas/seva_7_var2.png";
import s7v3 from "@/assets/sevas/seva_7_var3.png";

import s8v1 from "@/assets/sevas/seva_8_var1.png";
import s8v2 from "@/assets/sevas/seva_8_var2.png";
import s8v3 from "@/assets/sevas/seva_8_var3.png";

import s9v1 from "@/assets/sevas/seva_9_var1.png";
import s9v2 from "@/assets/sevas/seva_9_var2.png";
import s9v3 from "@/assets/sevas/seva_9_var3.png";

import s10v1 from "@/assets/sevas/seva_10_var1.png";
import s10v2 from "@/assets/sevas/seva_10_var2.png";
import s10v3 from "@/assets/sevas/seva_10_var3.png";

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

type SevaStaticMedia = { images: string[]; captions: [string, string, string] };

const sevaMedia: Record<number, SevaStaticMedia> = {
  0: {
    images: [s1v1, s1v2, s1v3],
    captions: ["Sundarkand • Sankat Haran", "Naam-Gotra Se Sankalp", "Bajrangbali Ki Kripa"],
  },
  1: {
    images: [s2v1, s2v2, s2v3],
    captions: ["Hawan • Ghar Mein Shanti", "Vaidik Mantra Uchcharan", "Sarva Rog Nivaran"],
  },
  2: {
    images: [s3v1, s3v2, s3v3],
    captions: ["Aarti • Divya Prakash", "Sandhya Deepdaan", "Poorna Aashirwad"],
  },
  3: {
    images: [s4v1, s4v2, s4v3],
    captions: ["Gau Seva • Samast Devon Ki Seva", "Chara Aur Gud Arpan", "Gau Mata Ka Aashirwad"],
  },
  4: {
    images: [s5v1, s5v2, s5v3],
    captions: ["Vanara Seva • Hanuman Ji Ke Priya", "Kela Aur Chana Arpan", "Bajrangbali Ka Punya"],
  },
  5: {
    images: [s6v1, s6v2, s6v3],
    captions: ["Saadhu Santo Ko Bhojan • Pitru Aashirwad", "Anna Daan Mahadan", "Satvik Bhojan Satkar"],
  },
  6: {
    images: [s7v1, s7v2, s7v3],
    captions: ["Sarovar Deepdaan • Pushkarraj", "Sandhya Lake Deepa", "Moksha Kripa"],
  },
  7: {
    images: [s8v1, s8v2, s8v3],
    captions: ["Chola Seva • Kasht Nivaran", "Bajariangbali Sindoor Puja", "Shringar Puja"],
  },
  8: {
    images: [s9v1, s9v2, s9v3],
    captions: ["Prasad Vitran • Anna Daan", "Laddoo Prasad Blessing", "Shraddhalu Sewa"],
  },
  9: {
    images: [s10v1, s10v2, s10v3],
    captions: ["Bhavy Shringar • Alankar Puja", "Pushpa Shringar Temple", "Darshan Kripa"],
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
