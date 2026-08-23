# Images

All site **photography** is served from Cloudinary with automatic format
negotiation, quality selection and responsive widths. The files in this folder
are only _fallbacks_ — what renders before a real photo has been uploaded, and
what renders for any developer running without env vars.

SVG logos (`punyata-logo*.svg`) and Lottie JSON (`lottie/*.json`) stay bundled
locally. They are tiny, vector, and gain nothing from a CDN round-trip.

## The one file that matters

[`src/lib/site-images.ts`](../lib/site-images.ts) is the single source of truth.
Every photograph on the site resolves through a key in `SITE_IMAGES`:

```ts
sevaGau: {
  publicId: "",                 // ← fill this in to go live
  fallback: sevaGauImg,         // bundled placeholder
  alt: "गौ माता सेवा — हरा चारा एवं गुड़ अर्पण",
  w: 1024,
  h: 1024,
},
```

`publicId: ""` means "serve the bundled fallback". Nothing is ever blank.

## Going live with a real photo

1. **Upload** the photo to Cloudinary under the `punyata-site/` folder (see
   below).
2. **Paste** the returned public id into that entry's `publicId`.

That is the _entire_ code change. No component, route or import is touched —
every consumer already renders through
[`<CldImage>`](../components/CldImage.tsx), which builds
`f_auto,q_auto,dpr_auto` delivery URLs plus a `srcSet` across
`400 / 640 / 828 / 1200 / 1600` px.

If the new photo has a different aspect ratio, update `w`/`h` in the same edit —
they become the `<img>` width/height attributes that reserve layout space.

## Cloudinary folder & naming convention

```
punyata-site/
  hero/      pushkar-ghats, whatsapp-proof
  sevas/     gau-seva, hawan, sadhu-bhojan, sundarkand, sarovar-deepdaan, vanar-seva
  plans/     basic-hero, basic-sankalp, premium-hawan, annual-bonus, …
  about/     story-1 … story-4
  proof/     ghat, havan, gau, whatsapp
```

Rules:

- Lower-case, hyphen-separated. **No file extension** in the public id —
  Cloudinary picks the best format per request via `f_auto`.
- The path mirrors the `SITE_IMAGES` key: `planBasicHero` →
  `punyata-site/plans/basic-hero`.
- Upload the largest original you have (≥1600px on the long edge). Downscaling
  happens at the edge; upscaling cannot be undone.
- Never overwrite an existing public id with a visually different photo — cached
  and prefetched copies live on. Upload a new id and point the manifest at it.

## Uploading

Two options:

- **Cloudinary dashboard** — Media Library → upload into `punyata-site/<section>`,
  then copy the public id.
- **Signed API upload** — `POST /api/cloudinary/sign-upload` with
  `{ folder: "punyata-site/sevas", resourceType: "image" }`, then hand the
  response to `uploadToCloudinary()` from
  [`src/lib/cloudinary-upload.ts`](../lib/cloudinary-upload.ts). The endpoint is
  admin-only and signs every upload; the folder allowlist accepts
  `punyata-proofs/*` (seva proof video) and `punyata-site/*` (site photography)
  and nothing else.

Unsigned upload presets are deliberately not used anywhere.

## Environment

| Variable                     | Where           | Secret?                           |
| ---------------------------- | --------------- | --------------------------------- |
| `VITE_CLOUDINARY_CLOUD_NAME` | client + server | No — public, ships to the browser |
| `CLOUDINARY_API_KEY`         | server handlers | Yes                               |
| `CLOUDINARY_API_SECRET`      | server handlers | Yes                               |

With `VITE_CLOUDINARY_CLOUD_NAME` unset, every image falls back to the bundled
asset and the site renders identically — `bun install && bun dev` needs no env
setup at all.

## Video

Long-form video (full seva recordings, founder message) uses
[`<YouTubeEmbed>`](../components/YouTubeEmbed.tsx) — a click-to-play facade, so
the ~1MB YouTube player payload never loads on first paint. Short silent hero
loops should stay on Cloudinary video, which needs no player.
