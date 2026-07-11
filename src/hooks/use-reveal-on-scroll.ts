import { useEffect } from "react";

/**
 * Attaches an IntersectionObserver that adds `.is-visible` to any
 * element with the `.reveal` class as it scrolls into view. Respects
 * prefers-reduced-motion (elements just render visible).
 */
export function useRevealOnScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (prefersReduce) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e, idx) => {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            const delay = Number(el.dataset.revealDelay ?? idx * 100);
            window.setTimeout(() => el.classList.add("is-visible"), delay);
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}
