import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { CLD_WIDTHS, cldSrcSet, cldUrl } from "@/lib/cloudinary-image";

// Every photograph on the marketing site renders through this component.
//
// Three things it guarantees that a raw <img> did not:
//   1. width/height are always emitted, so the browser reserves the box and
//      the page stops shifting as photos decode.
//   2. srcSet/sizes are always emitted when Cloudinary is configured, so a
//      phone never downloads a 1600px render.
//   3. A bundled fallback is always available — both as the initial `src` when
//      Cloudinary is off, and as the onError recovery when a delivery URL 404s.

type Props = {
  /** Cloudinary public id. Empty string = serve `fallback`. */
  publicId: string;
  /** Bundled asset (or absolute URL) used when Cloudinary is unavailable. */
  fallback: string;
  alt: string;
  /** Intrinsic width — emitted as the width attribute. */
  width: number;
  /** Intrinsic height — emitted as the height attribute. */
  height: number;
  /** Responsive `sizes` hint, e.g. `"100vw"` for a full-bleed hero. */
  sizes: string;
  /** Above-the-fold image: eager, high priority, synchronous decode. */
  priority?: boolean;
  className?: string;
  crop?: "fill" | "fit";
  gravity?: string;
  style?: ImgHTMLAttributes<HTMLImageElement>["style"];
  onLoad?: ImgHTMLAttributes<HTMLImageElement>["onLoad"];
};

/** Single-width `src` — the mid-range render, used by browsers ignoring srcSet. */
const SRC_WIDTH = 1200;

export function CldImage({
  publicId,
  fallback,
  alt,
  width,
  height,
  sizes,
  priority = false,
  className,
  crop,
  gravity,
  style,
  onLoad,
}: Props) {
  const [errored, setErrored] = useState(false);

  // A new publicId deserves a fresh attempt even if the previous one failed.
  useEffect(() => setErrored(false), [publicId, fallback]);

  const src = errored ? fallback : cldUrl(publicId, { w: SRC_WIDTH, crop, gravity, fallback });
  const srcSet = errored
    ? undefined
    : cldSrcSet(publicId, CLD_WIDTHS, { crop, gravity }) || undefined;

  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={style}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "low"}
      decoding={priority ? "sync" : "async"}
      onLoad={onLoad}
      onError={() => setErrored(true)}
    />
  );
}

/** Common `sizes` hints, so call sites stay consistent. */
export const IMAGE_SIZES = {
  /** Full-bleed hero spanning the viewport. */
  fullBleed: "100vw",
  /** Carousel or plan card — two-up from tablet, full width on mobile. */
  card: "(min-width: 768px) 50vw, 100vw",
  /** Grid thumbnail — three-up from tablet. */
  thumb: "(min-width: 768px) 33vw, 100vw",
} as const;
