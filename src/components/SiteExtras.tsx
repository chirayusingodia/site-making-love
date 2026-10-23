import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUp, X } from "lucide-react";
import { useLanguage } from "@/lib/translations";

// Keyboard users land here first: lets them jump past the header nav.
export function SkipToContent() {
  const lang = useLanguage();
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
    >
      {lang === "english" ? "Skip to content" : "मुख्य सामग्री पर जाएं"}
    </a>
  );
}

// A saffron thread along the top edge with a tiny diya that travels along
// it as the visitor reads — the page "lights up" as you go deeper.
export function DiyaScrollProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    let ticking = false;
    const compute = () => {
      ticking = false;
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setPct(max > 0 ? Math.min(100, Math.max(0, (h.scrollTop / max) * 100)) : 0);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  if (pct < 0.5) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]" aria-hidden="true">
      <div
        className="h-full rounded-r-full"
        style={{
          width: `${pct}%`,
          background: "linear-gradient(90deg,#F5A742,#E85D1F 70%,#C0362C)",
        }}
      />
      <span
        className="absolute -top-[5px] h-[13px] w-[13px] -translate-x-1/2 rounded-full"
        style={{
          left: `${pct}%`,
          background: "radial-gradient(circle,#FFF3C4 0%,#F5A742 45%,rgba(232,93,31,0) 72%)",
          boxShadow: "0 0 12px 3px rgba(245,167,66,0.7)",
        }}
      />
    </div>
  );
}

// Diya-shaped back-to-top button; sits above the WhatsApp bubble.
export function BackToTop() {
  const lang = useLanguage();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label={lang === "english" ? "Back to top" : "ऊपर जाएं"}
      className="fixed bottom-36 md:bottom-24 right-4 md:right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-brand/20 bg-white text-brand shadow-[0_8px_22px_rgba(139,79,40,0.18)] transition-transform hover:-translate-y-0.5 animate-fade-up"
    >
      <ArrowUp size={18} strokeWidth={2.6} />
    </button>
  );
}

const ANNOUNCE_KEY = "punyata:announce-v1";

// Slim dismissible ribbon above the header. Copy is deliberately about
// the standing promise (proof on WhatsApp), not a dated offer, so it
// never goes stale.
export function AnnouncementBar() {
  const lang = useLanguage();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      setVisible(sessionStorage.getItem(ANNOUNCE_KEY) !== "closed");
    } catch {
      setVisible(true);
    }
  }, []);
  if (!visible) return null;
  const close = () => {
    setVisible(false);
    try { sessionStorage.setItem(ANNOUNCE_KEY, "closed"); } catch {}
  };
  return (
    <div
      className="relative text-center text-[11.5px] md:text-xs font-semibold text-[#FFF3E6]"
      style={{ background: "linear-gradient(90deg,#5B1A1A,#8A2A12 50%,#5B1A1A)" }}
    >
      <Link to="/plans" className="block px-9 py-2 hover:underline underline-offset-2">
        🪔{" "}
        {lang === "english"
          ? "Every seva done in your name & gotra — video proof on your WhatsApp"
          : "हर सेवा आपके नाम व गोत्र से — Video Proof सीधे आपके WhatsApp पर"}
        <span className="ml-1.5 font-extrabold text-[#F5A742]">
          {lang === "english" ? "Join →" : "जुड़ें →"}
        </span>
      </Link>
      <button
        type="button"
        onClick={close}
        aria-label={lang === "english" ? "Dismiss" : "बंद करें"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#FFF3E6]/80 hover:bg-white/10"
      >
        <X size={14} />
      </button>
    </div>
  );
}
