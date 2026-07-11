import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Flame, Sun, Wind, Heart, Users } from "lucide-react";
import { sevaList } from "@/lib/plans";
import { SiteChrome } from "@/components/site-chrome";
import { SlidingImageCard, themedImage, type Slide } from "@/components/SlidingImageCard";

export const Route = createFileRoute("/sevas")({
  head: () => ({
    meta: [
      { title: "Our Sevas — पुण्यता | सुंदरकांड, हवन, आरती, गौ सेवा, वानर सेवा" },
      { name: "description", content: "पुण्यता की सभी सेवाओं की विस्तृत सूची — सुंदरकांड पाठ, गृह शांति हवन, आरती, गौ माता सेवा, वानर सेवा एवं ब्राह्मण भोजन।" },
    ],
  }),
  component: SevasPage,
});

const iconMap: Record<string, any> = { BookOpen, Flame, Sun, Wind, Heart, Users };

// TODO: replace loremflickr placeholders with real Punyata seva photography.
type SevaExtras = { queries: [string, string, string]; captions: [string, string, string] };
const sevaMedia: Record<string, SevaExtras> = {
  "सुंदरकांड पाठ": {
    queries: ["hindu priest reading ramayana book", "temple lamp scripture reading", "sundarkand paath sanskrit book"],
    captions: ["Sundarkand • Sankat Haran", "Naam-Gotra Se Sankalp", "Bajrangbali Ki Kripa"],
  },
  "गृह शांति हवन": {
    queries: ["hawan kund yagna fire smoke temple", "vedic havan fire ritual", "priest performing hawan"],
    captions: ["Hawan • Ghar Mein Shanti", "Vaidik Mantra Uchcharan", "Sarva Rog Nivaran"],
  },
  "आरती (Aarti)": {
    queries: ["evening aarti temple diya flame", "ganga aarti ghats", "aarti thali brass diya"],
    captions: ["Aarti • Divya Prakash", "Sandhya Deepdaan", "Poorna Aashirwad"],
  },
  "गौ माता सेवा": {
    queries: ["cow feeding fodder india temple", "gau seva feeding cows grass", "indian cows gaushala"],
    captions: ["Gau Seva • Samast Devon Ki Seva", "Chara Aur Gud Arpan", "Gau Mata Ka Aashirwad"],
  },
  "वानर सेवा": {
    queries: ["monkeys eating bananas temple india", "temple monkeys feeding", "vanara seva bananas offering"],
    captions: ["Vanara Seva • Hanuman Ji Ke Priya", "Kela Aur Chana Arpan", "Bajrangbali Ka Punya"],
  },
  "ब्राह्मण भोजन": {
    queries: ["indian priests dining together temple", "brahmin bhojan feast temple", "pandit eating traditional meal"],
    captions: ["Brahmin Bhojan • Pitru Aashirwad", "Anna Daan Mahadan", "Satvik Bhojan Satkar"],
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
            const media = sevaMedia[s.title];
            const slides: Slide[] = media
              ? media.queries.map((q, i) => ({
                  src: themedImage(q, 100 + idx * 10 + i),
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
