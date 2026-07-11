import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type Slide = {
  /** Image URL. TODO: replace with real Punyata/Pushkar seva photo. */
  src: string;
  alt: string;
  title: string;
  subtitle?: string;
  step?: string;
  stepClass?: string;
  titleClass?: string;
  subtitleClass?: string;
  scrimClass?: string;
};

type Props = {
  slides: Slide[];
  /** "16/9" | "4/5" | "1/1" — Tailwind aspect ratio utility */
  aspectRatio?: "video" | "4/5" | "square";
  autoPlayMs?: number;
  className?: string;
  rounded?: string; // e.g. "rounded-2xl"
  showArrows?: boolean;
};

export function SlidingImageCard({
  slides,
  aspectRatio = "video",
  autoPlayMs = 4500,
  className = "",
  rounded = "rounded-2xl",
  showArrows = true,
}: Props) {
  const [i, setI] = useState(0);
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const paused = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  }, []);

  const next = useCallback(() => setI((v) => (v + 1) % slides.length), [slides.length]);
  const prev = useCallback(() => setI((v) => (v - 1 + slides.length) % slides.length), [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = window.setInterval(() => {
      if (!paused.current) next();
    }, autoPlayMs);
    return () => window.clearInterval(id);
  }, [autoPlayMs, next, slides.length]);

  const aspectClass =
    aspectRatio === "video" ? "aspect-video" : aspectRatio === "square" ? "aspect-square" : "aspect-[4/5]";

  return (
    <div
      className={`relative overflow-hidden ${rounded} shadow-lg group ${aspectClass} ${className}`}
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onTouchStart={(e) => {
        paused.current = true;
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start == null) return;
        const dx = e.changedTouches[0].clientX - start;
        if (Math.abs(dx) > 40) (dx < 0 ? next() : prev());
        window.setTimeout(() => (paused.current = false), 3000);
      }}
      role="region"
      aria-roledescription="carousel"
    >
      {slides.map((s, idx) => (
        <div
          key={idx}
          className={`absolute inset-0 transition-all ease-in-out ${
            idx === i ? "opacity-100 scale-[1.03] z-10" : "opacity-0 scale-100 z-0"
          }`}
          style={{ transitionDuration: reducedMotion.current ? "0ms" : "600ms" }}
          aria-hidden={idx !== i}
        >
          {s.step && (
            <div className={`absolute top-3 left-3 z-20 text-xs font-bold px-3.5 py-1.5 rounded-full shadow-md ${s.stepClass || "bg-brand text-white"}`}>
              {s.step}
            </div>
          )}
          {!loaded[idx] && (
            <div className="absolute inset-0 bg-gradient-to-br from-brand-soft to-secondary animate-pulse" />
          )}
          <img
            src={s.src}
            alt={s.alt}
            loading="lazy"
            className="w-full h-full object-cover"
            onLoad={() => setLoaded((m) => ({ ...m, [idx]: true }))}
          />
          <div className={`absolute inset-x-0 bottom-0 ${s.scrimClass || "h-2/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent"}`} />
          <div className={`absolute bottom-3 left-4 right-4 z-10 ${s.titleClass?.includes("text-") ? "" : "text-white"}`}>
            <div className={`font-bold text-[17px] md:text-[19px] leading-tight ${s.titleClass || "drop-shadow"}`}>{s.title}</div>
            {s.subtitle && (
              <div className={`text-[13px] md:text-sm mt-0.5 leading-snug ${s.subtitleClass || "text-white/85 drop-shadow"}`}>
                {s.subtitle}
              </div>
            )}
          </div>
        </div>
      ))}

      {showArrows && slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Previous"
            className="hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/40 backdrop-blur text-white items-center justify-center hover:bg-black/60"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next"
            className="hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/40 backdrop-blur text-white items-center justify-center hover:bg-black/60"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {slides.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                idx === i ? "w-5 bg-[#F5A742]" : "w-1.5 bg-white/50 hover:bg-white/80"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Themed placeholder image URL from loremflickr — deterministic via `lock`.
 * TODO: replace with real Punyata/Pushkar seva photography via admin uploads.
 */
export function themedImage(keywords: string, lock = 1, w = 1200, h = 900) {
  const q = keywords.split(/\s+/).filter(Boolean).join(",");
  return `https://loremflickr.com/${w}/${h}/${encodeURIComponent(q)}?lock=${lock}`;
}
