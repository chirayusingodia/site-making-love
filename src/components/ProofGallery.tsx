import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Video, Check } from "lucide-react";
import { LottieIcon } from "./LottieIcon";
import { useTranslation } from "@/lib/translations";
import checkmark from "@/assets/lottie/checkmark.json";

import { CldImage, IMAGE_SIZES } from "./CldImage";
import { SITE_IMAGES, type SiteImage } from "@/lib/site-images";

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
        <Video size={10} className="shrink-0" />
        <span>Video Proof</span>
      </div>
    </div>
  );
}

export function ProofGallery() {
  const { t } = useTranslation();
  const imgs: SiteImage[] = [
    SITE_IMAGES.proofGhat,
    SITE_IMAGES.proofHavan,
    SITE_IMAGES.proofWhatsapp,
    SITE_IMAGES.proofGau,
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <h2 className="text-2xl font-bold">{t("gallery_title")}</h2>
        <Link to="/reviews" className="text-sm font-bold text-brand hover:underline">
          {t("gallery_see_all")}
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {imgs.map((image, i) => (
          <VideoThumbnailCard key={i} image={image} />
        ))}
      </div>
      <p className="text-xs text-center text-muted-foreground">
        {t("gallery_footer")}
      </p>
    </section>
  );
}
