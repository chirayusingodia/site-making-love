import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ImageIcon, Check, MessageCircle } from "lucide-react";
import { LottieIcon } from "./LottieIcon";
import { useTranslation } from "@/lib/translations";
import checkmark from "@/assets/lottie/checkmark.json";

import { CldImage, IMAGE_SIZES } from "./CldImage";
import { SITE_IMAGES, externalImage, type SiteImage } from "@/lib/site-images";
import { fetchProofGalleryItems } from "@/lib/proof-gallery-items";

function VideoThumbnailCard({ image }: { image: SiteImage }) {
  const lottieRef = useRef<any>(null);
  const [hovered, setHovered] = useState(false);

  const handleMouseEnter = () => {
    setHovered(true);
    setTimeout(() => {
      if (lottieRef.current) {
        lottieRef.current.goToAndPlay(0, true);
      }
    }, 10);
  };

  const handleMouseLeave = () => {
    setHovered(false);
    if (lottieRef.current) {
      lottieRef.current.goToAndStop(0, true);
    }
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative rounded-xl overflow-hidden aspect-square group cursor-pointer shadow-sm border border-black/5"
    >
      <CldImage
        publicId={image.publicId}
        fallback={image.fallback}
        alt={image.alt}
        width={image.w}
        height={image.h}
        sizes={IMAGE_SIZES.thumb}
        crop="fill"
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
      />
      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/25 transition-colors duration-300" />

      {hovered && (
        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm rounded-full p-0.5 shadow-md z-10 animate-scale-up">
          <LottieIcon
            lottieRef={lottieRef}
            animationData={checkmark}
            size={36}
            playOnView={false}
            loop={false}
            autoplay={false}
            fallback={<Check size={20} className="text-success mx-auto" />}
          />
        </div>
      )}

      <div className="absolute bottom-1.5 left-1.5 text-[10px] font-bold text-white bg-black/40 backdrop-blur-sm px-1.5 py-0.5 rounded flex items-center gap-1">
        <ImageIcon size={10} className="shrink-0" />
        <span>Photo Proof</span>
      </div>
    </div>
  );
}

/**
 * A WhatsApp screenshot rendered whole — `object-contain` on a chat-tinted
 * card, never `object-cover`. A tall phone screenshot square-cropped like an
 * avatar loses the message text; contain + letterbox keeps the whole proof
 * legible whatever aspect ratio the admin uploaded.
 */
function WhatsAppProofCard({ image }: { image: SiteImage }) {
  return (
    <div className="relative rounded-2xl overflow-hidden shadow-sm border border-black/5 bg-[#E7DFD4] aspect-[3/4]">
      <div className="absolute top-0 inset-x-0 h-6 bg-[#075E54] flex items-center justify-center gap-1 z-10">
        <MessageCircle size={10} className="text-white/90" fill="white" strokeWidth={0} />
        <span className="text-[9px] font-bold text-white tracking-wide">WhatsApp Proof</span>
      </div>
      <div className="absolute inset-0 pt-6 p-2">
        <CldImage
          publicId={image.publicId}
          fallback={image.fallback}
          alt={image.alt}
          width={image.w}
          height={image.h}
          sizes={IMAGE_SIZES.thumb}
          crop="fit"
          className="w-full h-full object-contain rounded-lg"
        />
      </div>
    </div>
  );
}

/**
 * Photo Proof Gallery — real event photography (ghat, havan, gau seva). Force
 * -cropped to a square, which is fine here since these are scenic photos, not
 * text a viewer needs to read in full.
 */
export function PhotoProofGallery({
  showSeeAll = true,
  includeExtras = true,
}: {
  showSeeAll?: boolean;
  /** Home's compact preview stays a fixed 4 tiles; only the Reviews page (via
   *  "See All") shows the admin-added extras appended after them. */
  includeExtras?: boolean;
}) {
  const { t } = useTranslation();
  const [extraItems, setExtraItems] = useState<SiteImage[]>([]);

  useEffect(() => {
    if (!includeExtras) return;
    let cancelled = false;
    fetchProofGalleryItems().then((rows) => {
      if (cancelled) return;
      setExtraItems(
        rows.filter((row) => row.kind === "photo").map((row) => externalImage(row.image_url, row.alt_text)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [includeExtras]);

  const imgs: SiteImage[] = [
    SITE_IMAGES.proofGhat,
    SITE_IMAGES.proofHavan,
    SITE_IMAGES.proofGau,
    ...(includeExtras ? extraItems : []),
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <h2 className="text-2xl font-bold">{t("gallery_title")}</h2>
        {showSeeAll && (
          <Link to="/reviews" className="text-sm font-bold text-brand hover:underline">
            {t("gallery_see_all")}
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
        {imgs.map((image, i) => (
          <VideoThumbnailCard key={i} image={image} />
        ))}
      </div>
      <p className="text-xs text-center text-muted-foreground">{t("gallery_footer")}</p>
    </section>
  );
}

/**
 * WhatsApp Proof — screenshots of the actual proof message sent to a
 * family's phone. Kept visually and structurally separate from the photo
 * gallery above: different card shape (portrait, contain-fit, WhatsApp
 * chrome) so a screenshot never gets mangled into a square "profile
 * picture" crop, and a horizontal scroll strip so it reads as chat evidence
 * rather than a photo wall.
 */
export function WhatsAppProofGallery({ includeExtras = true }: { includeExtras?: boolean }) {
  const [extraItems, setExtraItems] = useState<SiteImage[]>([]);

  useEffect(() => {
    if (!includeExtras) return;
    let cancelled = false;
    fetchProofGalleryItems().then((rows) => {
      if (cancelled) return;
      setExtraItems(
        rows.filter((row) => row.kind === "whatsapp").map((row) => externalImage(row.image_url, row.alt_text)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [includeExtras]);

  const imgs: SiteImage[] = [SITE_IMAGES.proofWhatsapp, ...extraItems];

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
          <MessageCircle size={16} className="text-white" fill="white" strokeWidth={0} />
        </div>
        <div>
          <h2 className="text-2xl font-bold leading-tight">WhatsApp Proof</h2>
          <p className="text-xs text-muted-foreground">हर सेवा के बाद सीधा आपके फ़ोन पर</p>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {imgs.map((image, i) => (
          <div key={i} className="shrink-0 w-[150px] sm:w-[170px] snap-start">
            <WhatsAppProofCard image={image} />
          </div>
        ))}
      </div>
    </section>
  );
}
