import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Flame, Sun, Wind, Heart, Users } from "lucide-react";
import { sevaList } from "@/lib/plans";
import { SiteChrome } from "@/components/site-chrome";

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

function SevasPage() {
  return (
    <SiteChrome>
      <main className="max-w-3xl mx-auto px-4 pb-24 md:pb-16 pt-6 space-y-6">
        <header className="text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-brand">Our Sevas</div>
          <h1 className="mt-2 text-3xl font-bold">पुण्यता की सेवाएँ</h1>
          <p className="mt-2 text-[15px] text-muted-foreground max-w-xl mx-auto">
            तीर्थ गुरु पुष्करराज में आपके नाम एवं गोत्र से सम्पन्न होने वाली सभी सेवाएँ — पूर्ण पारदर्शिता और WhatsApp Video Proof के साथ।
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sevaList.map((s) => {
            const Icon = iconMap[s.iconKey] || BookOpen;
            return (
              <div key={s.title} className="card-soft p-5 flex gap-4 items-start">
                <div className="w-14 h-14 rounded-2xl bg-brand-soft flex items-center justify-center shrink-0">
                  <Icon size={26} className="text-brand" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-foreground text-lg">{s.title}</h4>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </SiteChrome>
  );
}
