import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PunyataLogo } from "./PunyataLogo";
import { CldImage, IMAGE_SIZES } from "./CldImage";
import type { SiteImage } from "@/lib/site-images";

export type Slide = {
  /** Manifest entry from `SITE_IMAGES` (or `externalImage(url, …)`). */
  image: SiteImage;
  /** Slide-specific alt text; falls back to the manifest's own alt. */
  alt?: string;
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
  /** Responsive `sizes` hint for the slide images. Defaults to card sizing. */
  sizes?: string;
  /** Mark the first slide as above-the-fold (eager, high priority). */
  priority?: boolean;
};

export function SlidingImageCard({
  slides,
  aspectRatio = "video",
  autoPlayMs = 4500,
  className = "",
  rounded = "rounded-2xl",
  showArrows = true,
  sizes = IMAGE_SIZES.card,
  priority = false,
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
            idx === i ? "opacity-100 z-10" : "opacity-0 z-0"
          }`}
          style={{ transitionDuration: reducedMotion.current ? "0ms" : "600ms" }}
          aria-hidden={idx !== i}
        >
          {s.step && (
            <div className={`absolute top-3 left-3 z-20 text-xs font-bold px-3.5 py-1.5 rounded-full shadow-md ${s.stepClass || "bg-brand text-white"}`}>
              {s.step}
            </div>
          )}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-full shadow-sm border border-brand/20">
            <PunyataLogo className="w-5 h-5" />
            <span className="text-[11px] font-extrabold text-brand tracking-tight">पुण्यता:</span>
          </div>
          {!loaded[idx] && (
            <div className="absolute inset-0 bg-gradient-to-br from-brand-soft to-secondary animate-pulse" />
          )}
          <CldImage
            publicId={s.image.publicId}
            fallback={s.image.fallback}
            alt={s.alt ?? s.image.alt}
            width={s.image.w}
            height={s.image.h}
            sizes={sizes}
            priority={priority && idx === 0}
            className="w-full h-full object-contain bg-[#FDF3EB] object-center"
            onLoad={() => setLoaded((m) => ({ ...m, [idx]: true }))}
          />
          {(s.title || s.subtitle) && (
            <>
              <div className={`absolute inset-x-0 bottom-0 pointer-events-none ${s.scrimClass || "h-1/4 bg-gradient-to-t from-black/60 to-transparent"}`} />
              <div className={`absolute bottom-3 left-4 right-4 z-10 pointer-events-none ${s.titleClass?.includes("text-") ? "" : "text-white"}`}>
                {s.title && <div className={`font-bold text-[14px] md:text-[16px] leading-tight ${s.titleClass || "drop-shadow"}`}>{s.title}</div>}
                {s.subtitle && (
                  <div className={`text-[11px] md:text-xs mt-0.5 leading-snug ${s.subtitleClass || "text-white/85 drop-shadow"}`}>
                    {s.subtitle}
                  </div>
                )}
              </div>
            </>
          )}
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
