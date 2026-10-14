import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/translations";
import {
  getMarketingConsent,
  isMetaPixelConfigured,
  setMarketingConsent,
} from "@/lib/meta-pixel";

// One-line dismissible notice. Renders nothing unless the Meta Pixel is
// configured (VITE_META_PIXEL_ID) AND the visitor has not chosen yet, so
// dev/preview and already-decided visitors never see it. Starts hidden and
// decides in an effect to stay hydration-safe (localStorage is client-only).
export function MarketingConsentBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(isMetaPixelConfigured() && getMarketingConsent() === "unset");
  }, []);

  if (!visible) return null;

  const choose = (v: "granted" | "declined") => {
    setMarketingConsent(v);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      className="fixed inset-x-0 bottom-16 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-xs shadow-lg md:bottom-4"
    >
      <p className="flex-1 text-foreground">{t("consent_notice")}</p>
      <button
        type="button"
        onClick={() => choose("declined")}
        className="rounded-full px-3 py-1.5 font-semibold text-muted-foreground"
      >
        {t("consent_decline")}
      </button>
      <button
        type="button"
        onClick={() => choose("granted")}
        className="rounded-full bg-brand px-3 py-1.5 font-bold text-white"
      >
        {t("consent_accept")}
      </button>
    </div>
  );
}
