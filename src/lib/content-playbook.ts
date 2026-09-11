// Content Studio — the "brain".
//
// This module encodes the immortaltalks-model playbook as a Gemini
// system instruction, plus the pillar/format vocabulary the UI and
// prompts share. It is the single source of truth for HOW content is
// generated; the full human-readable version lives in
// immortaltalks-content-playbook.md.
//
// Isomorphic (no server-only imports) so both the admin UI and the
// server route can import the constants.

export type Pillar = "mirror" | "mind" | "detachment" | "parable" | "stillness" | "custom";
export type PostFormat = "reel" | "card" | "carousel";
export type PostStatus = "draft" | "approved" | "posted";

export const PILLARS: { value: Pillar; label: string; hint: string }[] = [
  { value: "mirror", label: "The Mirror", hint: "Truths about the self / identity" },
  { value: "mind", label: "The Mind", hint: "Overthinking, ego, fear" },
  { value: "detachment", label: "Detachment", hint: "Letting go, releasing control" },
  { value: "parable", label: "Everyday Parable", hint: "A tiny story with a lesson" },
  { value: "stillness", label: "Stillness", hint: "Presence, quieting the noise" },
  { value: "custom", label: "Custom / Surprise me", hint: "You pick the topic (or let AI choose)" },
];

export const FORMATS: { value: PostFormat; label: string; hint: string }[] = [
  { value: "reel", label: "Reel", hint: "Hook + on-screen beats over calm B-roll" },
  { value: "card", label: "Quote card", hint: "Single 4:5 image, one line" },
  { value: "carousel", label: "Carousel", hint: "5–7 slides, one idea unfolding" },
];

// The bilingual payload every generated post carries.
//
// CAPTION REALITY CHECK (verified 2026-09-09 against live immortaltalks
// posts, not assumed): pure-wisdom posts carry an EMPTY caption — the
// on-screen text is the entire message (a 5,792-like / 88-comment post
// had zero caption text). Only product-promo posts (book on Amazon)
// carry a caption, and even then it's ONE plain factual sentence — no
// hook/expansion/question formula, no hashtags visible anywhere. So:
//   - wisdom posts (the majority): caption.en / caption.hi = "" (empty)
//   - the rare promo post: caption = one short, plain, direct line
//   - hashtags are NOT part of the model; the field is kept only for
//     manual override and is empty by default.
export interface GeneratedContent {
  on_screen: { en: string; hi: string }; // in-video / on-card text (wisdom only, NO selling)
  caption: { en: string; hi: string }; // EMPTY for wisdom posts; one plain line for promo posts
  hooks: string[]; // 3 alternative opening hooks (English)
  reel_script: { en: string; hi: string }; // beat-by-beat, only meaningful for reels
  carousel: { en: string[]; hi: string[] }; // slide texts, only meaningful for carousels
  hashtags: { en: string[]; hi: string[] }; // empty by default — immortaltalks uses none
  cta: { en: string; hi: string }; // the soft invite line — only used on promo posts
}

export interface ContentPost {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  topic: string | null;
  pillar: Pillar | null;
  format: PostFormat;
  status: PostStatus;
  scheduled_for: string | null;
  posted_at: string | null;
  source: string;
  model: string | null;
  content: GeneratedContent;
  image_url: string | null; // rendered card PNG (Cloudinary) — Phase 3
  ig_media_id: string | null; // set once published to Instagram
  ig_permalink: string | null;
}

// The system instruction handed to Gemini on every generation.
// Kept tight but complete — this IS the model.
export const PLAYBOOK_SYSTEM_PROMPT = `
You are the content creator for "Punyata" (@punyata_foundation_), a devotional
brand on Instagram. You produce content modeled EXACTLY on @immortaltalks — a
calm, authoritative daily-wisdom account.

THE MODEL (never break these — verified against live @immortaltalks posts,
not assumed. Their highest-engagement post, 5,792 likes / 88 comments, had a
COMPLETELY EMPTY caption):
1. One emotion, one screen. Each post delivers a single introspective truth,
   absorbable in 2 seconds and FELT instantly. No paragraphs on the image.
2. The text that goes INSIDE a video / ON a card is PURE WISDOM ONLY — spiritual
   / philosophical (self, mind, detachment, stillness, letting go). NEVER put
   selling, "pooja", "book now", links, or product mentions inside the video/card.
3. CAPTIONS ARE EMPTY FOR WISDOM POSTS. This is the single most important
   rule and the one most tempting to break: real immortaltalks wisdom posts
   carry NO caption text at all — not a hook, not a question, not "save this",
   not hashtags. The on-screen text IS the entire post. For a wisdom post
   (pillar is mirror/mind/detachment/parable/stillness and this is not an
   explicit promo request), set caption.en and caption.hi to EMPTY STRINGS.
4. Selling appears ONLY when the user explicitly asks for a "promo" /
   "announcement" post. Even then, the caption is ONE short, plain, factual
   sentence — no hook, no expansion, no question, no hashtags, no hype. Model:
   "Immortal Talks Book 3 ... are now available on Amazon." That flat, that
   short. For Punyata a promo caption looks like: "Join the divine pooja —
   book now on punyata.com." / "दिव्य पूजा अब बुक करें — लिंक बायो में।" One line.
5. Hashtags are NOT part of this model — immortaltalks uses none, on any post
   type. Always return hashtags.en and hashtags.hi as EMPTY ARRAYS.
6. Voice: short, calm, declarative. Use "you". Favor paradox and contrast. No
   hype words, no emojis inside the wisdom itself. Sound timeless, like a calm
   teacher stating a truth.
7. Optimize for SAVES and SHARES — the on-screen text alone must carry that
   weight, since the caption will usually be empty.

PUNYATA'S OFFER (mentioned ONLY on a promo post, never on a wisdom post):
poojas performed in your name by Pushkar's pandits, blessings delivered to
your home, plus an "Ashirwad Patra" (blessing certificate). The signature
line is "Join the divine pooja" (Hindi: "दिव्य पूजा से जुड़ें"). Link in bio:
punyata.com.

LANGUAGES: produce BOTH English (en) and natural Hindi in Devanagari (hi) for
every field. Hindi must read naturally, not a literal translation.

FORMAT RULES:
- reel: fill on_screen with 3–4 short beats separated by " / ", and reel_script
  with a beat-by-beat (Hook 0-2s / 2-5s / 5-8s / end card). carousel field may be empty arrays.
- card: fill on_screen with ONE line of wisdom. reel_script and carousel may be empty.
- carousel: fill carousel.en / carousel.hi with 5–6 slide texts (slide 1 = cover
  title, last slide states the offer plainly if this is a promo request).
  on_screen = the cover line. reel_script may be empty.

Always fill: hooks (3 English options, for your own reference/alt takes — these
are NOT posted anywhere, just alternatives). Leave hashtags empty always. Leave
caption empty UNLESS this is explicitly a promo/announcement post, in which
case write the one-line caption and the cta field with the same short invite.
Return STRICTLY the requested JSON — no commentary.
`.trim();

// Builds the per-request user prompt.
export function buildGenerationPrompt(opts: {
  format: PostFormat;
  pillar?: Pillar;
  topic?: string;
  promo?: boolean; // true = the rare "offer" post; false/undefined = pure wisdom (empty caption)
}): string {
  const pillarLabel =
    opts.pillar && opts.pillar !== "custom"
      ? PILLARS.find((p) => p.value === opts.pillar)?.label
      : null;

  const lines = [
    `Generate ONE Instagram ${opts.format} for Punyata.`,
    pillarLabel ? `Content pillar: ${pillarLabel}.` : `Pick a strong pillar yourself.`,
    opts.topic?.trim()
      ? `Specific topic / angle: ${opts.topic.trim()}.`
      : `Choose a fresh, non-generic angle within the pillar.`,
    opts.promo
      ? `This IS a promo/announcement post — write the one-line plain caption + cta as instructed.`
      : `This is a PURE WISDOM post — caption.en and caption.hi MUST be empty strings.`,
    `Follow every rule in your system instruction. Return the JSON object only.`,
  ];
  return lines.filter(Boolean).join(" ");
}
