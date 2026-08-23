// Cloudinary delivery-URL builder for SITE IMAGERY (public, read-only).
//
// Deliberately dependency-free string concatenation — the Cloudinary SDK is
// ~40kB of client bundle for what is a URL template. Nothing here is signed
// and nothing here is secret: only the cloud name is used, and it is public.
// Uploads (which DO need a signature) go through
// `/api/cloudinary/sign-upload` + `@/lib/cloudinary-upload` instead.
//
// `VITE_CLOUDINARY_CLOUD_NAME` is a PUBLIC value (see src/lib/config.server.ts
// for the env conventions). When it is unset — a fresh `bun install && bun dev`
// with no `.env` — every helper degrades to the caller's bundled fallback so
// local development needs zero env setup. These helpers never throw.

const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;

/** Responsive widths used for every `srcSet` we emit. */
export const CLD_WIDTHS = [400, 640, 828, 1200, 1600] as const;

export type CldTransform = {
  w?: number;
  h?: number;
  crop?: "fill" | "fit";
  gravity?: string;
  /** Returned verbatim when Cloudinary is not configured or `publicId` is empty. */
  fallback?: string;
};

/** True when a Cloudinary URL can actually be built for `publicId`. */
export function cldEnabled(publicId: string): boolean {
  return Boolean(CLOUD) && publicId.length > 0;
}

/**
 * Build a Cloudinary delivery URL.
 *
 * `f_auto,q_auto,dpr_auto` is always applied: format negotiation (AVIF/WebP),
 * quality selection and device-pixel-ratio scaling all happen at the edge, so
 * one `publicId` serves every device without us pre-generating variants.
 *
 * Returns `opts.fallback` (or `""`) when Cloudinary is unconfigured.
 */
export function cldUrl(publicId: string, opts: CldTransform = {}): string {
  if (!cldEnabled(publicId)) return opts.fallback ?? "";

  const transforms = ["f_auto", "q_auto", "dpr_auto"];
  if (opts.w) transforms.push(`w_${Math.round(opts.w)}`);
  if (opts.h) transforms.push(`h_${Math.round(opts.h)}`);
  if (opts.crop) transforms.push(`c_${opts.crop}`);
  if (opts.gravity) transforms.push(`g_${opts.gravity}`);

  const id = publicId.replace(/^\/+/, "");
  return `https://res.cloudinary.com/${CLOUD}/image/upload/${transforms.join(",")}/${id}`;
}

/**
 * Build a `srcSet` descriptor list — `"<url> 400w, <url> 640w, …"`.
 *
 * Returns `""` when Cloudinary is unconfigured: an empty `srcSet` attribute is
 * simply ignored by the browser, which then honours plain `src` (the fallback).
 */
export function cldSrcSet(
  publicId: string,
  widths: readonly number[],
  opts: Omit<CldTransform, "w" | "fallback"> = {},
): string {
  if (!cldEnabled(publicId)) return "";
  return widths.map((w) => `${cldUrl(publicId, { ...opts, w })} ${w}w`).join(", ");
}
