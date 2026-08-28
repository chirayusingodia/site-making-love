# Session: Logo + Search Snippet Fix — 2026-08-28

## Reported problem
Google and Bing search results for punyata.com were both showing:
1. A wrong/generic favicon next to the search result (not Punyata's logo).
2. A garbled meta description in the Bing snippet: "The Punyata hand-shaped
   sprout draws itself, then the leaf softly glows."

## Root causes found

### 1. Favicon files were mislabeled — wrong format, not wrong image
`public/favicon.ico` and `public/favicon.png` contained the CORRECT brand
artwork (the orange hand + golden leaf mark), but the files were literally
**JPEG bytes saved with `.ico` / `.png` extensions** (confirmed via magic
bytes: `ff d8 ff e0` = JFIF/JPEG). `.ico` is not a real Windows icon
container at all. Browsers and Google's favicon fetcher expect the actual
format that matches the extension/mimetype; a mismatched file gets
rejected/ignored, which is why a generic fallback icon was showing up in
search results instead of the real logo.

`apple-touch-icon.png` was a valid PNG, but it was a soft 3D/photographic
render of the sculpture — not legible at small icon sizes.

**Fix:** Regenerated a full icon set from the existing `public/punyata-logo.svg`
vector mark:
- `favicon.ico` — real multi-size ICO (16/32/48px), transparent background
- `favicon.png` — real 32×32 PNG, transparent background
- `apple-touch-icon.png` — real 180×180 PNG, solid cream (`#FDF1EC`) background
  matching the site's `--background` token, flat vector mark (legible at small sizes)

### 2. Bogus SVG title/description leaking into search snippets
The animated logo — both the standalone asset `public/punyata-logo-animated.svg`
**and**, critically, the inline React component `src/components/PunyataLogo.tsx`
(rendered in the site header on every single page via `site-chrome.tsx`) —
had an accessibility `<title>`/`<desc>` pair that read like an internal dev
note rather than real content:

```
<title>Animated Punyata logo</title>
<desc>The Punyata hand-shaped sprout draws itself, then the leaf softly glows.</desc>
```

Because `PunyataLogo.tsx` is inlined directly into the page HTML (not just
referenced as an image), that `<desc>` text is real, crawlable text content
on every page. Bing picked it up as fallback snippet text when its own
relevance ranking preferred it over the page's actual `<meta name="description">`.

**Fix:** Changed the title/desc in all three places (component + both SVG
copies) to:
```
<title>Punyata logo</title>
<desc>पुण्यता — तीर्थ गुरु पुष्करराज से मासिक सेवा</desc>
```
This matches the real site tagline already used in `src/routes/__root.tsx`'s
`<meta name="description">`, so even if a crawler picks it up again, it's
now accurate instead of garbled.

### What was already fine
- `src/routes/__root.tsx` head config (title, meta description, og tags,
  favicon `<link>` tags) was already correct in content — Google's own
  result ("Plans — पुण्यता | ₹251/Monthly से...") was accurate. The
  favicon/description issues were specifically the two bugs above, not the
  root meta setup.
- `robots.txt` (`User-agent: *` / `Allow: /`) is fine as-is; no sitemap.xml
  exists in `public/` — not created in this session (out of scope for the
  reported bug, but worth doing separately if the user wants better
  indexing coverage).

## Files changed (committed to the linked device)
- `public/favicon.ico` — regenerated, real ICO
- `public/favicon.png` — regenerated, real PNG
- `public/apple-touch-icon.png` — regenerated, real PNG, cream bg
- `public/punyata-logo-animated.svg` — title/desc fixed
- `src/assets/punyata-logo-animated.svg` — title/desc fixed (duplicate copy)
- `src/components/PunyataLogo.tsx` — title/desc fixed (the live header logo, main fix)

## Follow-up the user still needs to do (cannot be automated from here)
1. Deploy this build (Cloudflare Worker via `wrangler`, per `.wrangler`/`.output` in repo).
2. In Google Search Console and Bing Webmaster Tools, request re-indexing /
   a fresh crawl of the homepage and the plans page so the new favicon and
   corrected snippet text propagate — this can take days to weeks otherwise
   since both engines cache favicons/snippets aggressively.
3. Optional, not done here: add a `sitemap.xml` and reference it from
   `robots.txt` for more reliable indexing going forward.
