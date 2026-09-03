import { Heart, ShieldCheck } from "lucide-react";
import { CountUp } from "@/components/CountUp";

// Real family count from the "Families Connected" stat used elsewhere on
// the plan page — never inflate this to a vanity number we can't back up.
const FAMILIES_COUNT = 1200;

export function ChadhavaHeartBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 self-start bg-brand-soft rounded-full pl-3 pr-3.5 py-2">
      <Heart size={15} className="text-brand shrink-0" fill="currentColor" />
      <span className="text-[13px] font-bold text-[#B8460F]">
        <CountUp value={FAMILIES_COUNT} suffix="+" /> परिवार यह संकल्प ले चुके हैं
      </span>
    </div>
  );
}

const AVATAR_INITIALS = ["R", "P", "A", "S", "V"];

export function AuthenticityTrust() {
  return (
    <div className="card-soft p-6 text-center space-y-4">
      <div className="flex items-center justify-center gap-2">
        <ShieldCheck size={18} className="text-brand shrink-0" />
        <h3 className="font-scripture text-xl font-bold text-[#B8460F] leading-snug">
          Authenticity You Can Trust
        </h3>
      </div>

      <p className="text-[13.5px] text-muted-foreground leading-relaxed px-1">
        हर संकल्प तीर्थ गुरु पुष्करराज के अधिकृत आचार्यों द्वारा, पूर्ण वैदिक विधि-विधान से संपन्न किया जाता है — आपकी श्रद्धा सदा सुरक्षित हाथों में है।
      </p>

      <div className="h-px bg-black/5 -mx-6" />

      <div className="flex justify-center">
        <div className="flex">
          {AVATAR_INITIALS.map((initial, i) => (
            <div
              key={initial + i}
              style={{ marginLeft: i === 0 ? 0 : -10 }}
              className="w-9 h-9 rounded-full bg-gradient-to-br from-brand to-[#F5A742] border-[2.5px] border-white flex items-center justify-center text-[12px] font-bold text-white"
            >
              {initial}
            </div>
          ))}
          <div
            style={{ marginLeft: -10 }}
            className="w-9 h-9 rounded-full bg-peach border-[2.5px] border-white flex items-center justify-center text-[10px] font-bold text-[#B8460F]"
          >
            +1.2K
          </div>
        </div>
      </div>

      <div className="text-xs font-bold text-muted-foreground">
        Trusted by <CountUp value={FAMILIES_COUNT} suffix="+" /> Families
      </div>
    </div>
  );
}
