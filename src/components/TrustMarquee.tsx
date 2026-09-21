import { ShieldCheck, Video, MapPin, Stethoscope, Sparkles, Globe2, XCircle } from "lucide-react";

type MarqueeItem = {
  icon: React.ReactNode;
  hindi: string;
  english: string;
};

const ITEMS: MarqueeItem[] = [
  {
    icon: <ShieldCheck size={14} />,
    hindi: "मासिक 1,200+ खुश एवं संतुष्ट परिवार",
    english: "Monthly 1,200+ Happy & Satisfied Families",
  },
  {
    icon: <Video size={14} />,
    hindi: "WhatsApp पर लाइव वीडियो प्रूफ",
    english: "WhatsApp Video Proof",
  },
  {
    icon: <MapPin size={14} />,
    hindi: "पुष्कर के पावन तीर्थ से सेवा",
    english: "Performed at the Sacred Tirth in Pushkar",
  },
  {
    icon: <ShieldCheck size={14} />,
    hindi: "100% सुरक्षित एवं भरोसेमंद",
    english: "100% Secure & Trusted",
  },
  {
    icon: <Stethoscope size={14} />,
    hindi: "डॉक्टर्स, इंजीनियर्स व वैज्ञानिकों का भरोसा",
    english: "Trusted by Doctors, Engineers & Scientists",
  },
  {
    icon: <Sparkles size={14} />,
    hindi: "वैदिक पंडितों द्वारा विधि-सम्मत पूजा",
    english: "Performed by Vedic Pandits, As Per Vidhi",
  },
  {
    icon: <Video size={14} />,
    hindi: "हर पूजा का वीडियो प्रमाण",
    english: "Video Proof of Every Pooja",
  },
  {
    icon: <Globe2 size={14} />,
    hindi: "पैन-इंडिया 10,000+ परिवारों की सेवा",
    english: "Serving 10,000+ Families Pan-India",
  },
  { icon: <XCircle size={14} />, hindi: "कभी भी रद्द करने की सुविधा", english: "Cancel Anytime" },
];

/**
 * Scrolling trust strip — sits where the old static "families / WhatsApp
 * proof / location" badge row used to be, but carries more social proof
 * without eating extra vertical space. Pure CSS animation (no JS timers),
 * pauses on hover/touch, and duplicates its item list once so the loop is
 * seamless at any strip width.
 */
export function TrustMarquee({ lang }: { lang: "hindi" | "english" }) {
  const loop = [...ITEMS, ...ITEMS];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand/15 bg-gradient-to-r from-[#FFF6EC] via-[#FFEBD6] to-[#FFF6EC] py-2.5">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-7 bg-gradient-to-r from-[#FFF6EC] to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-[#FFF6EC] to-transparent z-10" />
      <div className="trust-marquee-track flex w-max">
        {loop.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white border border-brand/20 text-[#9A3412] font-semibold text-xs px-3.5 py-1.5 mr-2.5 shadow-sm"
          >
            {item.icon}
            {lang === "hindi" ? item.hindi : item.english}
          </span>
        ))}
      </div>
      <style>{`
        .trust-marquee-track {
          animation: trust-marquee-scroll 28s linear infinite;
        }
        .trust-marquee-track:hover {
          animation-play-state: paused;
        }
        @keyframes trust-marquee-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .trust-marquee-track { animation: none; }
        }
      `}</style>
    </div>
  );
}
