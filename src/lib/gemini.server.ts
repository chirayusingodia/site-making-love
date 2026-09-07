import process from "node:process";
import type { GeneratedContent } from "@/lib/content-playbook";

// Server-only Google Gemini wrapper. Plain fetch against the
// Generative Language REST API — no SDK dependency. .server.ts keeps
// it out of the client bundle. Env is read per-request (module-scope
// reads break on Workers, per config.server.ts convention).
//
// Auth: GEMINI_API_KEY (from https://aistudio.google.com — the Gemini
// *app* subscription does NOT grant API access; a separate key is
// required). Model overridable via GEMINI_MODEL (default gemini-2.0-flash).

const DEFAULT_MODEL = "gemini-2.0-flash";

function getConfig(): { apiKey: string; model: string } {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY env var. Get one at https://aistudio.google.com/apikey",
    );
  }
  return { apiKey, model: process.env.GEMINI_MODEL || DEFAULT_MODEL };
}

// JSON schema mirroring GeneratedContent so Gemini returns parseable
// structured output every time (responseMimeType: application/json).
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    on_screen: {
      type: "object",
      properties: { en: { type: "string" }, hi: { type: "string" } },
      required: ["en", "hi"],
    },
    caption: {
      type: "object",
      properties: { en: { type: "string" }, hi: { type: "string" } },
      required: ["en", "hi"],
    },
    hooks: { type: "array", items: { type: "string" } },
    reel_script: {
      type: "object",
      properties: { en: { type: "string" }, hi: { type: "string" } },
      required: ["en", "hi"],
    },
    carousel: {
      type: "object",
      properties: {
        en: { type: "array", items: { type: "string" } },
        hi: { type: "array", items: { type: "string" } },
      },
      required: ["en", "hi"],
    },
    hashtags: {
      type: "object",
      properties: {
        en: { type: "array", items: { type: "string" } },
        hi: { type: "array", items: { type: "string" } },
      },
      required: ["en", "hi"],
    },
    cta: {
      type: "object",
      properties: { en: { type: "string" }, hi: { type: "string" } },
      required: ["en", "hi"],
    },
  },
  required: ["on_screen", "caption", "hooks", "hashtags", "cta"],
} as const;

function emptyContent(): GeneratedContent {
  return {
    on_screen: { en: "", hi: "" },
    caption: { en: "", hi: "" },
    hooks: [],
    reel_script: { en: "", hi: "" },
    carousel: { en: [], hi: [] },
    hashtags: { en: [], hi: [] },
    cta: { en: "", hi: "" },
  };
}

/** Normalizes Gemini's parsed object into a complete GeneratedContent. */
function coerce(raw: unknown): GeneratedContent {
  const base = emptyContent();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const strPair = (v: unknown) => {
    const p = (v ?? {}) as Record<string, unknown>;
    return { en: String(p.en ?? ""), hi: String(p.hi ?? "") };
  };
  const arrPair = (v: unknown) => {
    const p = (v ?? {}) as Record<string, unknown>;
    const toArr = (x: unknown) => (Array.isArray(x) ? x.map((s) => String(s)) : []);
    return { en: toArr(p.en), hi: toArr(p.hi) };
  };
  return {
    on_screen: strPair(o.on_screen),
    caption: strPair(o.caption),
    hooks: Array.isArray(o.hooks) ? o.hooks.map((s) => String(s)) : [],
    reel_script: strPair(o.reel_script),
    carousel: arrPair(o.carousel),
    hashtags: arrPair(o.hashtags),
    cta: strPair(o.cta),
  };
}

/**
 * Generates one structured, bilingual content object from Gemini.
 * Returns { content, model }. Throws on missing key / API / parse error;
 * callers map that to a 500 with the message.
 */
export async function generateContent(opts: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<{ content: GeneratedContent; model: string }> {
  const { apiKey, model } = getConfig();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    apiKey,
  )}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: opts.userPrompt }] }],
      generationConfig: {
        temperature: 1.0,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned malformed JSON");
  }

  return { content: coerce(parsed), model };
}

/**
 * Free-form text generation (no JSON schema) — used by the strategy
 * endpoint, which asks Gemini to read ranked page data and recommend
 * what to post more of. Returns plain markdown text.
 */
export async function generateText(opts: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<{ text: string; model: string }> {
  const { apiKey, model } = getConfig();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    apiKey,
  )}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: opts.userPrompt }] }],
      generationConfig: { temperature: 0.8 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");
  return { text, model };
}
