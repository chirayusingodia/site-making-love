// ─────────────────────────────────────────────────────────────
// PUNYATA — Ashirwad Patra client-side canvas renderer
//
// Draws the blessing certificate onto a FIXED 1240×1754 canvas
// (A4 portrait @ ~150dpi) and rasterises it to a PNG. A fixed
// pixel canvas with absolute coordinates is what makes the output
// byte-for-byte identical on every phone, tablet and desktop —
// exactly the "render at a fixed size, show the image" principle.
//
// Fonts: the app-bundled Martel (Devanagari + Latin, weights 400
// & 700 via @fontsource/martel in styles.css). No external deps,
// no headless browser — pure Canvas 2D.
//
// This layout is a 1:1 port of the approved design preview
// (scratchpad/ashirwad-patra-preview.html), scaled ×(1240/720).
// ─────────────────────────────────────────────────────────────

import {
  ASHIRWAD_BLESSING_BODY,
  ASHIRWAD_BLESSING_LEAD,
  formatHindiDate,
} from "@/lib/ashirwad-patra";

export interface PatraRenderData {
  names: string[];
  gotra: string | null;
  sevaNames: string[];
  occasionLabel: string;
  batchDate: string; // ISO YYYY-MM-DD
  patraNo: string;
}

const W = 1240;
const H = 1754;
const U = W / 720; // design authored at 720 wide
const CX = W / 2;

const C = {
  paper: "#fbf6ea",
  paper2: "#f6eedc",
  ink: "#3a2a1c",
  inkSoft: "#7a6552",
  body: "#4a3826",
  saffron: "#c05a17",
  saffronDeep: "#9c4410",
  goldLine: "#c9a54e",
  goldPale: "#e3ce9c",
  wm: "#ecdfc0",
  leaf: "#e0a326",
} as const;

const px = (v: number) => v * U;
const martel = (weight: 400 | 700, size: number) => `${weight} ${size}px Martel, Georgia, serif`;

type Ctx = CanvasRenderingContext2D;

function setLS(ctx: Ctx, v: number) {
  // letterSpacing is a modern Canvas property; guarded for older engines.
  if ("letterSpacing" in ctx)
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${v}px`;
}

interface TextOpts {
  align?: CanvasTextAlign;
  ls?: number;
  baseline?: CanvasTextBaseline;
}

function text(
  ctx: Ctx,
  t: string,
  x: number,
  y: number,
  font: string,
  color: string,
  o: TextOpts = {},
) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = o.align ?? "center";
  ctx.textBaseline = o.baseline ?? "alphabetic";
  setLS(ctx, o.ls ?? 0);
  ctx.fillText(t, x, y);
  setLS(ctx, 0);
}

function wrap(ctx: Ctx, t: string, maxW: number, font: string): string[] {
  ctx.font = font;
  const words = t.split(" ");
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

/** Largest size (≤ base) at which `t` fits `maxW` for the given weight. */
function fitSize(ctx: Ctx, t: string, weight: 400 | 700, base: number, maxW: number): number {
  let s = base;
  ctx.font = martel(weight, s);
  while (ctx.measureText(t).width > maxW && s > base * 0.5) {
    s -= 1;
    ctx.font = martel(weight, s);
  }
  return s;
}

async function ensureFonts() {
  const anyDoc =
    typeof document !== "undefined" ? (document as Document & { fonts?: FontFaceSet }) : null;
  if (!anyDoc?.fonts) return;
  try {
    await Promise.all([
      anyDoc.fonts.load(`400 ${px(26)}px Martel`),
      anyDoc.fonts.load(`700 ${px(80)}px Martel`),
    ]);
    await anyDoc.fonts.ready;
  } catch {
    // fall back to whatever is available — never block rendering
  }
}

function drawCorner(ctx: Ctx, cx: number, cy: number, size: number, sx: number, sy: number) {
  const k = size / 46;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sx * k, sy * k);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = C.goldLine;
  ctx.lineWidth = 1.4;
  ctx.stroke(new Path2D("M2 44V16C2 8 8 2 16 2H44"));
  ctx.lineWidth = 1;
  ctx.stroke(new Path2D("M10 44V20C10 14 14 10 20 10H44"));
  ctx.fillStyle = C.goldLine;
  ctx.globalAlpha = 0.5;
  ctx.fill(new Path2D("M16 16c6 0 10-4 10-10-6 0-10 4-10 10Z"));
  ctx.fill(new Path2D("M16 16c-6 0-10 4-10 10 6 0 10-4 10-10Z"));
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(16, 16, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLogo(ctx: Ctx, cx: number, topY: number, h: number) {
  const vbX = 105;
  const vbY = 380;
  const vbW = 520;
  const vbH = 675;
  const k = h / vbH;
  const w = vbW * k;
  ctx.save();
  ctx.translate(cx - w / 2, topY);
  ctx.scale(k, k);
  ctx.translate(-vbX, -vbY);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = C.saffron;
  ctx.lineWidth = 26;
  ctx.stroke(new Path2D("M142 1020C270 929 447 929 607 1020"));
  ctx.stroke(new Path2D("M357 954V687C364 630 398 552 460 492"));
  const hand = new Path2D(
    "M357 687C340 649 309 620 274 606C244 594 211 581 190 560C169 539 155 508 148 479C147 475 151 474 154 477C174 493 179 522 198 541C213 556 229 567 245 572C250 574 253 570 250 565C240 550 231 535 229 521C229 516 233 515 236 518C254 531 270 536 288 547C332 573 355 620 357 687Z",
  );
  ctx.fillStyle = C.saffron;
  ctx.lineWidth = 13;
  ctx.fill(hand);
  ctx.stroke(hand);
  const leaf = new Path2D("M370 566C369 487 408 422 514 402C510 484 468 551 370 566Z");
  ctx.fillStyle = C.leaf;
  ctx.strokeStyle = C.leaf;
  ctx.fill(leaf);
  ctx.stroke(leaf);
  ctx.restore();
}

export async function renderPatraToCanvas(canvas: HTMLCanvasElement, d: PatraRenderData) {
  await ensureFonts();
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unsupported");

  // Background wash
  const g = ctx.createRadialGradient(CX, 0, px(120), CX, 0, H);
  g.addColorStop(0, C.paper);
  g.addColorStop(1, C.paper2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Watermark ॐ
  text(ctx, "ॐ", CX, H / 2, martel(700, px(430)), C.wm, { baseline: "middle" });

  // Double gold frame
  ctx.strokeStyle = C.goldLine;
  ctx.lineWidth = 2;
  ctx.strokeRect(px(26), px(26), W - px(52), H - px(52));
  ctx.strokeStyle = C.goldPale;
  ctx.lineWidth = 1;
  ctx.strokeRect(px(34), px(34), W - px(68), H - px(68));

  // Corner lotus ornaments
  const cs = px(44);
  const co = px(40);
  drawCorner(ctx, co, co, cs, 1, 1);
  drawCorner(ctx, W - co, co, cs, -1, 1);
  drawCorner(ctx, co, H - co, cs, 1, -1);
  drawCorner(ctx, W - co, H - co, cs, -1, -1);

  const side = px(72);
  let y = px(48);

  // Logo
  drawLogo(ctx, CX, y, px(74));
  y += px(74) + px(14);

  // Mangal
  text(ctx, "॥ श्री गणेशाय नमः ॥", CX, y, martel(700, px(12)), C.saffronDeep, {
    ls: px(2),
    baseline: "top",
  });
  y += px(12) * 1.4 + px(12);

  // Title
  text(ctx, "आशीर्वाद पत्र", CX, y, martel(700, px(46)), C.ink, { baseline: "top" });
  y += px(46) * 1.18 + px(10);

  // Subtitle + flank rules
  const stSize = px(11.5);
  ctx.font = martel(700, stSize);
  setLS(ctx, px(5));
  const stW = ctx.measureText("ASHIRWAD PATRA").width + px(50);
  setLS(ctx, 0);
  text(ctx, "ASHIRWAD PATRA", CX, y, martel(700, stSize), C.inkSoft, {
    ls: px(5),
    baseline: "top",
  });
  const lineY = y + stSize * 0.6;
  const gap = px(14);
  const lineLen = px(46);
  ctx.strokeStyle = C.goldLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CX - stW / 2 - gap - lineLen, lineY);
  ctx.lineTo(CX - stW / 2 - gap, lineY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(CX + stW / 2 + gap, lineY);
  ctx.lineTo(CX + stW / 2 + gap + lineLen, lineY);
  ctx.stroke();
  y += stSize * 1.3 + px(22);

  // Eyebrow
  text(ctx, "इस पावन पत्र के आशीर्वाद के पात्र", CX, y, martel(700, px(12)), C.saffron, {
    ls: px(1.5),
    baseline: "top",
  });
  y += px(12) * 1.4 + px(11);

  // Family names (primary larger; long names auto-fit to width)
  const nameMaxW = W - 2 * side;
  d.names.forEach((nm, i) => {
    const base = (i === 0 && d.names.length > 1) || d.names.length === 1 ? px(31) : px(23);
    const sz = fitSize(ctx, nm, 700, base, nameMaxW);
    text(ctx, nm, CX, y, martel(700, sz), C.ink, { baseline: "top" });
    y += sz * 1.22 + px(4);
  });
  y += px(6);

  // Gotra
  if (d.gotra) {
    text(ctx, `गोत्र — ${d.gotra}`, CX, y, martel(400, px(14)), C.inkSoft, { baseline: "top" });
    y += px(14) * 1.4;
  }
  y += px(20);

  // Blessing — lead line
  for (const l of wrap(ctx, ASHIRWAD_BLESSING_LEAD, px(540), martel(700, px(18)))) {
    text(ctx, l, CX, y, martel(700, px(18)), C.saffronDeep, { baseline: "top" });
    y += px(18) * 1.55;
  }
  y += px(8);

  // Blessing — body
  for (const l of wrap(ctx, ASHIRWAD_BLESSING_BODY, px(528), martel(400, px(15)))) {
    text(ctx, l, CX, y, martel(400, px(15)), C.body, { baseline: "top" });
    y += px(15) * 1.85;
  }
  y += px(20);

  // Sevas — heading with side rules
  const shSize = px(11.5);
  ctx.font = martel(700, shSize);
  const shText = "आपके निमित्त सम्पन्न सेवाएँ";
  const shW = ctx.measureText(shText).width;
  text(ctx, shText, CX, y, martel(700, shSize), C.saffron, { ls: px(1.5), baseline: "top" });
  const shLineY = y + shSize * 0.6;
  const shMax = px(560);
  ctx.strokeStyle = C.goldPale;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CX - shMax / 2, shLineY);
  ctx.lineTo(CX - shW / 2 - px(14), shLineY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(CX + shW / 2 + px(14), shLineY);
  ctx.lineTo(CX + shMax / 2, shLineY);
  ctx.stroke();
  y += shSize * 1.4 + px(14);

  // Seva items — centred, wrapping rows with a saffron diamond marker
  const svFont = martel(700, px(16));
  ctx.font = svFont;
  const diW = px(11);
  const gapDot = px(10);
  const gapItem = px(26);
  const rowH = px(16) * 1.5;
  const maxRow = px(560);
  const items = d.sevaNames.map((n) => ({ n, w: diW + gapDot + ctx.measureText(n).width }));
  const rows: { items: typeof items; w: number }[] = [];
  let cur: typeof items = [];
  let curW = 0;
  for (const it of items) {
    const add = (cur.length ? gapItem : 0) + it.w;
    if (curW + add > maxRow && cur.length) {
      rows.push({ items: cur, w: curW });
      cur = [it];
      curW = it.w;
    } else {
      cur.push(it);
      curW += add;
    }
  }
  if (cur.length) rows.push({ items: cur, w: curW });
  for (const r of rows) {
    let x = CX - r.w / 2;
    for (const it of r.items) {
      ctx.fillStyle = C.saffron;
      ctx.save();
      ctx.translate(x + diW / 2, y + rowH * 0.45);
      ctx.rotate(Math.PI / 4);
      const ds = diW * 0.72;
      ctx.fillRect(-ds / 2, -ds / 2, ds, ds);
      ctx.restore();
      text(ctx, it.n, x + diW + gapDot, y, martel(700, px(16)), C.body, {
        align: "left",
        baseline: "top",
      });
      x += it.w + gapItem;
    }
    y += rowH;
  }

  // ── Footer, pinned to the bottom ──
  const bottom = H - px(56);
  text(ctx, "सेवा हमारी · पुण्य आपका", CX, bottom, martel(400, px(11)), C.inkSoft, { ls: px(1.5) });
  const brandY = bottom - px(22);
  text(ctx, "पुण्यता", CX, brandY, martel(700, px(25)), C.saffronDeep);
  text(ctx, `पत्र क्रमांक · ${d.patraNo}`, side, brandY, martel(400, px(11)), C.inkSoft, {
    align: "left",
    ls: px(1),
  });

  // ॐ seal (right)
  const sealCx = W - side - px(30);
  const sealCy = brandY - px(14);
  ctx.strokeStyle = C.goldLine;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(sealCx, sealCy, px(29), 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = C.goldPale;
  ctx.lineWidth = 1;
  ctx.setLineDash([px(2), px(3)]);
  ctx.beginPath();
  ctx.arc(sealCx, sealCy, px(23), 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, "ॐ", sealCx, sealCy, martel(700, px(26)), C.saffron, { baseline: "middle" });

  // Occasion (above footer)
  const occY = brandY - px(52);
  text(
    ctx,
    `अवसर  ${d.occasionLabel}  ·  ${formatHindiDate(d.batchDate)}`,
    CX,
    occY,
    martel(400, px(12.5)),
    C.inkSoft,
  );
}

/** Render to an off-screen canvas and return a PNG Blob. */
export async function renderPatraToBlob(d: PatraRenderData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await renderPatraToCanvas(canvas, d);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Certificate image encode failed"))),
      "image/png",
    ),
  );
}

/** Convenience: PNG File suitable for Cloudinary upload. */
export async function renderPatraToFile(d: PatraRenderData): Promise<File> {
  const blob = await renderPatraToBlob(d);
  return new File([blob], `${d.patraNo}.png`, { type: "image/png" });
}
