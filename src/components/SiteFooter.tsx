import { Link } from "@tanstack/react-router";
import { MapPin, Phone, ShieldCheck, MessageCircle, Video, Lock } from "lucide-react";
import { PunyataLogo } from "@/components/PunyataLogo";
import { useLanguage } from "@/lib/translations";

const WHATSAPP_RAW = "917014098548";
const WA_URL = `https://wa.me/${WHATSAPP_RAW}?text=${encodeURIComponent("Jai Siyaram, मुझे पुण्यता से जुड़ना है।")}`;

// Fine-line mandala, drawn once and used as a watermark behind the footer.
function Mandala({ className = "" }: { className?: string }) {
  const petals = Array.from({ length: 16 }, (_, i) => i * 22.5);
  return (
    <svg viewBox="-100 -100 200 200" fill="none" stroke="currentColor" strokeWidth="0.6" className={className} aria-hidden="true">
      {[92, 72, 52, 32, 14].map((r) => (
        <circle key={r} r={r} opacity={0.55} />
      ))}
      {petals.map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M0 -92 C 9 -78, 9 -62, 0 -50 C -9 -62, -9 -78, 0 -92Z" />
          <path d="M0 -50 C 6 -42, 6 -34, 0 -30 C -6 -34, -6 -42, 0 -50Z" opacity={0.7} />
        </g>
      ))}
    </svg>
  );
}

const COPY = {
  hindi: {
    tagline: "पुण्य आपका, सेवा हमारी। तीर्थ गुरु पुष्करराज से आपके नाम व गोत्र की मासिक सेवा।",
    explore: "खोजें",
    help: "सहायता",
    contact: "संपर्क",
    links: {
      home: "मुख्य पृष्ठ", plans: "सदस्यता", sevas: "हमारी सेवाएं", reviews: "समीक्षाएं",
      about: "हमारे बारे में", blog: "ब्लॉग", faq: "सामान्य प्रश्न", contact: "संपर्क करें",
      mysub: "मेरी सदस्यता", terms: "नियम व शर्तें", refund: "Refund नीति", privacy: "गोपनीयता नीति",
    },
    wa: "WhatsApp पर बात करें",
    address: "तीर्थ गुरु पुष्करराज, राजस्थान — 305022",
    trust: ["11 साल का विश्वास", "WhatsApp पर Video Proof", "Razorpay से सुरक्षित भुगतान"],
    rights: "© 2026 पुण्यता · सर्वाधिकार सुरक्षित",
    made: "सनातन सेवा के लिए, श्रद्धा से बनाया गया 🙏",
  },
  english: {
    tagline: "Punya yours, seva ours. Monthly seva in your name & gotra, from Tirth Guru Pushkar.",
    explore: "Explore",
    help: "Help",
    contact: "Contact",
    links: {
      home: "Home", plans: "Sadasyata", sevas: "Our Sevas", reviews: "Reviews",
      about: "About Us", blog: "Blog", faq: "FAQ", contact: "Contact Us",
      mysub: "My Subscription", terms: "Terms & Conditions", refund: "Refund Policy", privacy: "Privacy Policy",
    },
    wa: "Chat on WhatsApp",
    address: "Tirth Guru Pushkar, Rajasthan — 305022",
    trust: ["11 years of trust", "Video proof on WhatsApp", "Secure payments via Razorpay"],
    rights: "© 2026 Punyata · All rights reserved",
    made: "Made with devotion, for Sanatan seva 🙏",
  },
} as const;

export function SiteFooter() {
  const lang = useLanguage();
  const c = COPY[lang];
  const L = c.links;
  const trustIcons = [ShieldCheck, Video, Lock];
  const linkCls = "text-[13px] text-[#F3D9C6]/80 hover:text-[#F5A742] transition-colors";

  return (
    <footer
      className="relative mt-4 overflow-hidden pb-24 md:pb-0 text-[#F3D9C6]"
      style={{ background: "linear-gradient(180deg,#4A1414 0%,#35100F 100%)" }}
    >
      {/* Saffron-to-maroon rule that echoes the scroll thread */}
      <div className="h-1" style={{ background: "linear-gradient(90deg,#F5A742,#E85D1F,#C0362C)" }} />
      <Mandala className="pointer-events-none absolute -right-24 -top-16 h-[380px] w-[380px] text-[#F5A742]/[0.09]" />
      <Mandala className="pointer-events-none absolute -bottom-32 -left-28 h-[300px] w-[300px] text-[#F5A742]/[0.06]" />

      <div className="relative mx-auto max-w-5xl px-5 pt-10 pb-6">
        {/* Trust strip */}
        <ul className="mb-9 grid gap-2.5 sm:grid-cols-3">
          {c.trust.map((label, i) => {
            const Icon = trustIcons[i];
            return (
              <li key={label} className="flex items-center gap-2.5 rounded-2xl border border-[#F5A742]/20 bg-white/[0.04] px-4 py-3 text-[12.5px] font-bold text-[#FFE9D2]">
                <Icon size={16} className="shrink-0 text-[#F5A742]" />
                {label}
              </li>
            );
          })}
        </ul>

        <div className="grid gap-9 md:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
          <div>
            <Link to="/" className="inline-flex items-center gap-2.5">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FDF1EC] shadow-[0_0_0_3px_rgba(245,167,66,0.35)]">
                <PunyataLogo className="h-9 w-9" />
              </span>
              <span className="text-3xl font-extrabold leading-none text-[#F5A742]" style={{ fontFamily: "'Noto Sans Devanagari', system-ui, sans-serif" }}>
                पुण्यता
              </span>
            </Link>
            <p className="mt-3 max-w-[34ch] text-[13px] leading-relaxed text-[#F3D9C6]/75">{c.tagline}</p>
          </div>

          <nav aria-label={c.explore}>
            <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#F5A742]">{c.explore}</h3>
            <ul className="space-y-2">
              <li><Link to="/" className={linkCls}>{L.home}</Link></li>
              <li><Link to="/plans" className={linkCls}>{L.plans}</Link></li>
              <li><Link to="/sevas" className={linkCls}>{L.sevas}</Link></li>
              <li><Link to="/reviews" className={linkCls}>{L.reviews}</Link></li>
              <li><Link to="/about" className={linkCls}>{L.about}</Link></li>
            </ul>
          </nav>

          <nav aria-label={c.help}>
            <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#F5A742]">{c.help}</h3>
            <ul className="space-y-2">
              <li><Link to="/faq" className={linkCls}>{L.faq}</Link></li>
              <li><Link to="/contact" className={linkCls}>{L.contact}</Link></li>
              <li><Link to="/my-subscription" className={linkCls}>{L.mysub}</Link></li>
              <li><Link to="/terms-and-conditions" className={linkCls}>{L.terms}</Link></li>
              <li><Link to="/refund-policy" className={linkCls}>{L.refund}</Link></li>
              <li><Link to="/privacy-policy" className={linkCls}>{L.privacy}</Link></li>
            </ul>
          </nav>

          <div>
            <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#F5A742]">{c.contact}</h3>
            <ul className="space-y-2.5 text-[13px] text-[#F3D9C6]/80">
              <li className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-[#F5A742]" />{c.address}</li>
              <li className="flex items-center gap-2">
                <Phone size={15} className="shrink-0 text-[#F5A742]" />
                <a href="tel:+917014098548" className="hover:text-[#F5A742]">+91 70140 98548</a>
              </li>
            </ul>
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-whatsapp px-4 py-2.5 text-[13px] font-bold text-white shadow-lg shadow-black/20 transition-transform hover:scale-[1.03]"
            >
              <MessageCircle size={16} /> {c.wa}
            </a>
          </div>
        </div>

        <div className="mt-9 flex flex-col items-center justify-between gap-1.5 border-t border-[#F5A742]/15 pt-5 text-[11.5px] text-[#F3D9C6]/60 md:flex-row md:pb-14">
          <span>{c.rights}</span>
          <span className="md:pr-16">{c.made}</span>
        </div>
      </div>
    </footer>
  );
}
