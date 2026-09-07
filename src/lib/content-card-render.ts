// ─────────────────────────────────────────────────────────────
// PUNYATA — Content Studio quote-card renderer (client-side canvas)
//
// Draws a single wisdom line onto a FIXED 1080×1350 (4:5) canvas and
// rasterises to PNG — the same "fixed pixel canvas → identical on every
// device" principle as the Ashirwad Patra renderer. Calm, low-key
// palette so the brand reads consistent post to post. Text is PURE
// WISDOM only (the model forbids selling on the card).
//
// Fonts: app-bundled Martel (Devanagari + Latin) via @fontsource/martel.
// No external deps, no headless browser — pure Canvas 2D.
// ─────────────────────────────────────────────────────────────

export interface CardRenderData {
  text: string; // the wisdom line (en or hi)
  handle?: string; // watermark, default @punyata_foundation_
}

const W = 1080;
const H = 1350;
const CX = W / 2;

const C = {
  bg0: "#221a2e", // deep indigo top
  bg1: "#12101b", // near-black bottom
  wm: "rgba(224,163,38,0.06)", // faint ॐ watermark (saffron)
  text: "#f4ecdd", // warm off-white
  accent: "#e0a326", // saffron
  handle: "rgba(244,236,221,0.55)",
} as const;

const martel = (weight: 400 | 700, size: number) => `${weight} ${size}px Martel, Georgia, serif`;

type Ctx = CanvasRenderingContext2D;

function wrap(ctx: Ctx, t: string, maxW: number): string[] {
  const words = t.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function ensureFonts() {
  const anyDoc =
    typeof document !== "undefined" ? (document as Document & { fonts?: FontFaceSet }) : null;
  if (!anyDoc?.fonts) return;
  try {
    await Promise.all([anyDoc.fonts.load("400 60px Martel"), anyDoc.fonts.load("700 60px Martel")]);
    await anyDoc.fonts.ready;
  } catch {
    /* never block rendering */
  }
}

/**
 * Picks the largest font size (within [min,max]) at which the wrapped
 * text fits the text box vertically. Keeps short lines big, long lines
 * readable — no manual tuning per post.
 */
function fitAndWrap(ctx: Ctx, t: string, maxW: number, maxH: number, max = 88, min = 40) {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = martel(700, size);
    const lines = wrap(ctx, t, maxW);
    const lineH = size * 1.4;
    if (lines.length * lineH <= maxH) return { size, lines, lineH };
  }
  ctx.font = martel(700, min);
  const lines = wrap(ctx, t, maxW);
  return { size: min, lines, lineH: min * 1.4 };
}

export async function renderCardToCanvas(canvas: HTMLCanvasElement, d: CardRenderData) {
  await ensureFonts();
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unsupported");

  // Background gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.bg0);
  g.addColorStop(1, C.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Faint ॐ watermark
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = C.wm;
  ctx.font = martel(700, 640);
  ctx.fillText("ॐ", CX, H / 2 + 40);

  // Top accent rule
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(CX - 40, 150);
  ctx.lineTo(CX + 40, 150);
  ctx.stroke();

  // Wisdom text — centred block
  const maxW = W - 220;
  const maxH = H - 520;
  const { size, lines, lineH } = fitAndWrap(ctx, d.text, maxW, maxH);
  ctx.font = martel(700, size);
  ctx.fillStyle = C.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  let y = H / 2 - ((lines.length - 1) * lineH) / 2;
  for (const line of lines) {
    ctx.fillText(line, CX, y);
    y += lineH;
  }

  // Handle watermark (bottom)
  ctx.fillStyle = C.handle;
  ctx.font = martel(400, 30);
  ctx.textBaseline = "alphabetic";
  ctx.fillText(d.handle ?? "@punyata_foundation_", CX, H - 90);

  // Bottom accent dot
  ctx.fillStyle = C.accent;
  ctx.beginPath();
  ctx.arc(CX, H - 140, 5, 0, Math.PI * 2);
  ctx.fill();
}

export async function renderCardToBlob(d: CardRenderData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await renderCardToCanvas(canvas, d);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Card image encode failed"))),
      "image/png",
    ),
  );
}

export async function renderCardToFile(d: CardRenderData, name = "card"): Promise<File> {
  const blob = await renderCardToBlob(d);
  return new File([blob], `${name}.png`, { type: "image/png" });
}
