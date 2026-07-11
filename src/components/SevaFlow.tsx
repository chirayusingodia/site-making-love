import { useMemo, useEffect, useRef, useState } from "react";
import {
  ScrollText,
  Flower2,
  HandHeart,
  Flame,
  Sun,
  Heart,
  BookOpen,
  Cog as Cow,
  Banana,
  UtensilsCrossed,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Props = { sevaTitles: string[] };

// Map a seva's Hindi/English title fragment → icon + short label
const ICON_MAP: { match: RegExp; Icon: LucideIcon; label: string }[] = [
  { match: /(संकल्प|sankalp)/i, Icon: ScrollText, label: "Sankalp" },
  { match: /(पूजा|pooja|पूजन)/i, Icon: Flower2, label: "Pooja" },
  { match: /(चढ़ावा|chadava|अर्पण)/i, Icon: HandHeart, label: "Chadava" },
  { match: /(हवन|havan|hawan)/i, Icon: Flame, label: "Hawan" },
  { match: /(आरती|aarti)/i, Icon: Sun, label: "Aarti" },
  { match: /(दान|daan|सिंदूर|चोला|prasad)/i, Icon: Heart, label: "Daan" },
  { match: /(सुंदरकांड|sundarkand|पाठ)/i, Icon: BookOpen, label: "Sundarkand" },
  { match: /(गौ|gau|cow)/i, Icon: Cow, label: "Gau Seva" },
  { match: /(वानर|vanara|monkey)/i, Icon: Banana, label: "Vanara" },
  { match: /(ब्राह्मण|brahmin|भोजन|bhojan)/i, Icon: UtensilsCrossed, label: "Bhojan" },
];

function chipFor(title: string) {
  return ICON_MAP.find((m) => m.match.test(title)) ?? { Icon: Sparkles, label: title.slice(0, 10) };
}

export function SevaFlow({ sevaTitles }: Props) {
  const chips = useMemo(() => sevaTitles.map(chipFor), [sevaTitles]);
  const containerRef = useRef<HTMLOListElement>(null);

  // Track visibility of each node
  const [visibleNodes, setVisibleNodes] = useState<Record<number, boolean>>({
    0: false,
    1: false,
    2: false,
  });

  // State to check if IntersectionObserver is supported and running
  const [hasObserver, setHasObserver] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const prefersReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduce || !("IntersectionObserver" in window)) {
      setHasObserver(false);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute("data-index"));
            const delay = Number(entry.target.getAttribute("data-delay") ?? 0);

            setTimeout(() => {
              setVisibleNodes((prev) => ({ ...prev, [index]: true }));
            }, delay);

            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.05, rootMargin: "0px 0px -20px 0px" }
    );

    const elements = containerRef.current?.querySelectorAll(".reveal-node");
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section className="mt-6 space-y-4">
      <h2 className="text-lg font-bold">आपकी सेवा कैसे सम्पन्न होती है</h2>

      <div className="relative card-soft p-5 md:p-7 overflow-hidden">
        {/* animated saffron glow along path */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none hidden md:block"
          viewBox="0 0 600 340"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M 80 60 Q 300 20 300 170 Q 300 320 520 280"
            fill="none"
            stroke="#F5A742"
            strokeWidth="2"
            strokeDasharray="6 8"
            opacity="0.5"
          />
          <circle r="5" fill="#E85D1F">
            <animateMotion
              dur="5s"
              repeatCount="indefinite"
              path="M 80 60 Q 300 20 300 170 Q 300 320 520 280"
            />
            <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite" />
          </circle>
        </svg>

        {/* Nodes — zigzag flex layout */}
        <ol ref={containerRef} className="relative z-10 space-y-6 md:space-y-8">
          <li
            data-index={0}
            data-delay={0}
            className={`flex justify-start reveal-node transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
              !hasObserver || visibleNodes[0]
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-5"
            }`}
          >
            <NodeBadge
              tone="lavender"
              Icon={ScrollText}
              title="संकल्प लिया"
              subtitle="आपके नाम और गोत्र से संकल्प दर्ज हुआ"
            />
          </li>

          <li
            data-index={1}
            data-delay={150}
            className={`flex justify-center reveal-node transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
              !hasObserver || visibleNodes[1]
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-5"
            }`}
          >
            <div className="w-full max-w-md">
              <NodeBadge
                tone="peach"
                Icon={Sparkles}
                title="पंडित जी ने सेवा की"
                subtitle="तीर्थ गुरु पुष्करराज में वैदिक विधि-विधान से"
              />
              {/* seva chips row */}
              <div className="mt-3 flex flex-wrap gap-2 justify-center px-1">
                {chips.map((c, i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-1 min-w-[64px] md:min-w-[72px] animate-fade-in"
                    style={{ animationDelay: `${i * 120}ms`, animationFillMode: "both" }}
                  >
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-brand-soft text-brand flex items-center justify-center shadow-sm ring-1 ring-brand/15">
                      <c.Icon size={22} />
                    </div>
                    <span className="text-[10px] md:text-[11px] font-bold text-foreground/80 leading-tight text-center">
                      {c.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </li>

          <li
            data-index={2}
            data-delay={300}
            className={`flex justify-end reveal-node transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
              !hasObserver || visibleNodes[2]
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-5"
            }`}
          >
            <NodeBadge
              tone="mint"
              Icon={CheckCircle2}
              title="प्रमाण मिला"
              subtitle="हर माह Video/Photo Proof सीधे WhatsApp पर"
              corner="WA"
            />
          </li>
        </ol>
      </div>
    </section>
  );
}

function NodeBadge({
  tone,
  Icon,
  title,
  subtitle,
  corner,
}: {
  tone: "lavender" | "peach" | "mint";
  Icon: LucideIcon;
  title: string;
  subtitle: string;
  corner?: string;
}) {
  const toneClass = {
    lavender: "bg-[#EEE6F5] text-[#5B3A82]",
    peach: "bg-[#FBE3D2] text-[#8B4A1E]",
    mint: "bg-[#DDF1E2] text-[#1E6B3A]",
  }[tone];
  return (
    <div className={`relative rounded-2xl px-4 py-3 md:px-5 md:py-4 shadow-sm ${toneClass} max-w-[92%]`}>
      {corner && (
        <span className="absolute -top-1.5 -right-1.5 bg-whatsapp text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
          {corner}
        </span>
      )}
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/70 flex items-center justify-center shrink-0">
          <Icon size={18} />
        </div>
        <div>
          <div className="font-bold text-[15px] leading-snug">{title}</div>
          <div className="text-[12px] md:text-[13px] opacity-80 leading-snug mt-0.5">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}
