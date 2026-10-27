// ─────────────────────────────────────────────────────────────
// PUNYATA — shareable "Punya Bank" achievement card (client canvas)
//
// Fixed 1080×1350 (4:5) canvas → PNG blob, so the picture is identical
// on every device and drops straight into a WhatsApp status / post.
// Same font + approach as ashirwad-patra-render.ts (Martel, pure
// Canvas 2D, no external deps).
//
// Look: "Saffron Silk" — smooth satin folds in peach and saffron, a thin
// gold edge, the Punyata sprout logo up top, the family's names (the
// poojas are done in THEIR name), a banner with the pooja count and
// white impact tiles.
// ─────────────────────────────────────────────────────────────

import type { ImpactTile } from "@/lib/punya-impact";

export interface PunyaCardData {
  lang: "hindi" | "english";
  months: number;
  poojas: number;
  /** Family members the sankalp is taken for (up to 4 shown). */
  names: string[];
  tiles: ImpactTile[];
  /** e.g. "Sharad Purnima · Sat, 31 October" — most recent pooja, if any. */
  lastPooja?: { dateLabel: string; occasion: string } | null;
}

const W = 1080;
const H = 1350;
const MX = W / 2;
const font = (w: 400 | 700, s: number) => `${w} ${s}px Martel, Georgia, serif`;
const EMOJI = "400 34px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";

// palette
const INK = "#5B2A0B";
const SOFT = "#9A6A3A";
const ON_BG = "#8A5A2A";
const BRAND: [string, string] = ["#C2410C", "#9A3412"];
const ACCENT: [string, string] = ["#F97316", "#C2410C"];
const RIBBON = "#B5470F";
const FOOT = "#9A3412";
const GOLD_HI = "#F8E7A6";
const GOLD_MID = "#D4A93C";
const GOLD_LO = "#9A6F14";

type Ctx = CanvasRenderingContext2D;
type Paint = string | CanvasGradient;

function txt(ctx: Ctx, t: string, x: number, y: number, f: string, c: Paint, a: CanvasTextAlign = "center") {
  ctx.font = f;
  ctx.fillStyle = c;
  ctx.textAlign = a;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(t, x, y);
}

/** Largest font (≤ size) at which `t` fits maxW; returns the font string. */
function fit(ctx: Ctx, t: string, w: 400 | 700, size: number, maxW: number): string {
  let s = size;
  ctx.font = font(w, s);
  while (ctx.measureText(t).width > maxW && s > size * 0.55) {
    s -= 1;
    ctx.font = font(w, s);
  }
  return font(w, s);
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function goldGrad(ctx: Ctx, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, GOLD_HI);
  g.addColorStop(0.5, GOLD_MID);
  g.addColorStop(1, GOLD_LO);
  return g;
}

async function ensureFonts() {
  const d = typeof document !== "undefined" ? (document as Document & { fonts?: FontFaceSet }) : null;
  if (!d?.fonts) return;
  try {
    await Promise.all([d.fonts.load("400 30px Martel"), d.fonts.load("700 80px Martel")]);
    await d.fonts.ready;
  } catch {
    /* fall back to system serif — never block */
  }
}

// ── Saffron Silk background ──────────────────────────────────
function drawSilk(ctx: Ctx) {
  const base = ctx.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, "#FFF3E0");
  base.addColorStop(0.5, "#FFE2BA");
  base.addColorStop(1, "#FDCB94");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  const fold = (y0: number, y1: number, amp: number, a: number, c: string) => {
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.bezierCurveTo(W * 0.3, y0 - amp, W * 0.65, y0 + amp, W, y1);
    ctx.lineTo(W, y1 + 260);
    ctx.bezierCurveTo(W * 0.65, y0 + amp + 260, W * 0.3, y0 - amp + 260, 0, y0 + 260);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y0, 0, y0 + 300);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, c);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalAlpha = a;
    ctx.fillStyle = g;
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  fold(120, 40, 120, 0.9, "rgba(255,255,255,0.85)");
  fold(520, 640, -140, 0.55, "rgba(255,170,90,0.55)");
  fold(860, 760, 130, 0.8, "rgba(255,255,255,0.8)");
  fold(1090, 1180, -110, 0.5, "rgba(250,150,70,0.5)");

  ctx.strokeStyle = goldGrad(ctx, 0, 0, W, H);
  ctx.lineWidth = 3;
  rr(ctx, 28, 28, W - 56, H - 56, 40);
  ctx.stroke();
}

// ── Punyata sprout logo (same shapes as PunyataLogo.tsx) ─────
const LOGO_VIEW = { x: 105, y: 380, w: 520, h: 675 };
const LOGO_EARTH = "M142 1020C270 929 447 929 607 1020";
const LOGO_STEM = "M357 954V687C364 630 398 552 460 492";
const LOGO_HAND =
  "M357 687C340 649 309 620 274 606C244 594 211 581 190 560C169 539 155 508 148 479C147 475 151 474 154 477C174 493 179 522 198 541C213 556 229 567 245 572C250 574 253 570 250 565C240 550 231 535 229 521C229 516 233 515 236 518C254 531 270 536 288 547C332 573 355 620 357 687Z";
const LOGO_LEAF = "M370 566C369 487 408 422 514 402C510 484 468 551 370 566Z";

/** Draw the logo so its box is `height` tall, centred on cx, top at `top`. */
function drawLogo(ctx: Ctx, cx: number, top: number, height: number) {
  const s = height / LOGO_VIEW.h;
  const width = LOGO_VIEW.w * s;

  // soft halo so the mark lifts off the silk
  const halo = ctx.createRadialGradient(cx, top + height / 2, 10, cx, top + height / 2, height * 0.85);
  halo.addColorStop(0, "rgba(255,255,255,0.75)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, top + height / 2, height * 0.85, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(cx - width / 2 - LOGO_VIEW.x * s, top - LOGO_VIEW.y * s);
  ctx.scale(s, s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(90,45,20,0.28)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;

  ctx.strokeStyle = "#D85A30";
  ctx.lineWidth = 26;
  ctx.stroke(new Path2D(LOGO_EARTH));
  ctx.stroke(new Path2D(LOGO_STEM));

  const hand = new Path2D(LOGO_HAND);
  ctx.fillStyle = "#D85A30";
  ctx.fill(hand);
  ctx.lineWidth = 13;
  ctx.stroke(hand);

  const leaf = new Path2D(LOGO_LEAF);
  ctx.fillStyle = "#F5A742";
  ctx.fill(leaf);
  ctx.strokeStyle = "#F5A742";
  ctx.stroke(leaf);
  ctx.restore();
}

export async function renderPunyaCard(data: PunyaCardData): Promise<Blob> {
  await ensureFonts();
  const hi = data.lang === "hindi";
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");

  drawSilk(ctx);

  // Logo + brand
  drawLogo(ctx, MX, 40, 176);
  const brand = ctx.createLinearGradient(MX - 110, 70, MX + 110, 120);
  brand.addColorStop(0, BRAND[0]);
  brand.addColorStop(1, BRAND[1]);
  txt(ctx, "पुण्यता", MX, 296, font(700, 56), brand);
  txt(ctx, hi ? "तीर्थ गुरु पुष्करराज" : "Tirth Guru Pushkarraj", MX, 336, font(400, 20), ON_BG);

  // Names — "in the name of"
  const names = data.names.map((n) => n.trim()).filter(Boolean).slice(0, 4);
  let y = 386;
  if (names.length) {
    txt(ctx, hi ? "इनके नाम से संपन्न" : "Offered in the name of", MX, y, font(400, hi ? 24 : 22), ON_BG);
    y += 24;
    const chips = names.map((n) => {
      const f = fit(ctx, n, 700, 30, 330);
      ctx.font = f;
      return { n, f, w: ctx.measureText(n).width + 56 };
    });
    const rows: (typeof chips)[] = [];
    let cur: typeof chips = [];
    let cw = 0;
    for (const c of chips) {
      if (cur.length && cw + 14 + c.w > W - 160) {
        rows.push(cur);
        cur = [];
        cw = 0;
      }
      cw += (cur.length ? 14 : 0) + c.w;
      cur.push(c);
    }
    if (cur.length) rows.push(cur);
    rows.forEach((row) => {
      const rw = row.reduce((a, c) => a + c.w, 0) + 14 * (row.length - 1);
      let x = MX - rw / 2;
      row.forEach((c) => {
        ctx.save();
        ctx.shadowColor = "rgba(150,90,30,0.16)";
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 5;
        ctx.fillStyle = "#FFFFFF";
        rr(ctx, x, y, c.w, 58, 29);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = "#E0B34A";
        ctx.lineWidth = 1.7;
        rr(ctx, x, y, c.w, 58, 29);
        ctx.stroke();
        txt(ctx, c.n, x + c.w / 2, y + 39, c.f, INK);
        x += c.w + 14;
      });
      y += 72;
    });
  }

  const ng = (y0: number, y1: number) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, ACCENT[0]);
    g.addColorStop(1, ACCENT[1]);
    return g;
  };

  // Banner: pooja count + caption
  const num = String(data.poojas);
  const bt = y + 10;
  const bh = 176;
  ctx.save();
  ctx.shadowColor = "rgba(150,90,30,0.16)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  const bg = ctx.createLinearGradient(64, bt, W - 64, bt + bh);
  bg.addColorStop(0, "#FFFFFF");
  bg.addColorStop(1, "#FFF6E2");
  ctx.fillStyle = bg;
  rr(ctx, 64, bt, W - 128, bh, 36);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = GOLD_MID;
  ctx.lineWidth = 2.5;
  rr(ctx, 64, bt, W - 128, bh, 36);
  ctx.stroke();
  txt(ctx, num, 200, bt + 128, font(700, num.length > 2 ? 110 : 140), ng(bt + 20, bt + 140));
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(320, bt + 34);
  ctx.lineTo(320, bt + bh - 34);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const cx = 352;
  const cwid = W - 64 - cx - 30;
  const l1 = hi ? "पावन पूजाएँ" : "sacred poojas";
  const l2 = hi ? "आपके नाम से संपन्न" : "done in your name";
  txt(ctx, l1, cx, bt + 76, fit(ctx, l1, 700, 40, cwid), INK, "left");
  txt(ctx, l2, cx, bt + 124, fit(ctx, l2, 700, 34, cwid), INK, "left");
  txt(ctx, hi ? `${data.months} माह की सदस्यता` : `${data.months}-month membership`, cx, bt + 158, font(400, 21), SOFT, "left");

  // Tiles
  const gx = 64;
  const gap = 18;
  const gw = (W - gx * 2 - gap) / 2;
  const gh = 124;
  const tilesTop = bt + bh + 28;
  data.tiles.forEach((tile, i) => {
    const odd = data.tiles.length % 2 === 1 && i === data.tiles.length - 1;
    const w = odd ? W - gx * 2 : gw;
    const x = odd ? gx : gx + (i % 2) * (gw + gap);
    const ty = tilesTop + Math.floor(i / 2) * (gh + gap);
    ctx.save();
    ctx.shadowColor = "rgba(150,90,30,0.16)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 7;
    ctx.fillStyle = "#FFFFFF";
    rr(ctx, x, ty, w, gh, 26);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(212,169,60,0.6)";
    ctx.lineWidth = 1.6;
    rr(ctx, x, ty, w, gh, 26);
    ctx.stroke();
    const dx = x + 58;
    const dy = ty + gh / 2;
    const dg = ctx.createRadialGradient(dx - 8, dy - 10, 2, dx, dy, 34);
    dg.addColorStop(0, "#FFF3D1");
    dg.addColorStop(1, "#FDDB8A");
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.arc(dx, dy, 34, 0, Math.PI * 2);
    ctx.fill();
    txt(ctx, tile.emoji, dx, dy + 12, EMOJI, INK);
    const tx = x + 110;
    const tw = w - 110 - 20;
    txt(ctx, tile.value, tx, ty + 54, fit(ctx, tile.value, 700, 46, tw), ng(ty + 10, ty + 56), "left");
    txt(ctx, tile.label, tx, ty + 88, fit(ctx, tile.label, 700, hi ? 22 : 21, tw), INK, "left");
    txt(ctx, tile.sub, tx, ty + 112, fit(ctx, tile.sub, 400, 16, tw), SOFT, "left");
  });
  const endY = tilesTop + Math.ceil(data.tiles.length / 2) * (gh + gap);

  // Latest pooja: the auspicious day
  const ry = endY + 6;
  if (data.lastPooja && ry + 60 < 1244) {
    ctx.fillStyle = RIBBON;
    rr(ctx, gx, ry, W - gx * 2, 60, 30);
    ctx.fill();
    ctx.strokeStyle = GOLD_MID;
    ctx.lineWidth = 1.6;
    rr(ctx, gx, ry, W - gx * 2, 60, 30);
    ctx.stroke();
    const label = `${hi ? "अंतिम पूजा" : "Latest pooja"}  ·  ${data.lastPooja.occasion}  ·  ${data.lastPooja.dateLabel}`;
    txt(ctx, label, MX, ry + 39, fit(ctx, label, 700, 23, W - gx * 2 - 60), "#FFF1D0");
  }

  // Footer
  txt(ctx, hi ? "दान पुण्य आपका · सेवा हमारी" : "Your daan-punya · our seva", MX, 1268, font(700, 26), FOOT);
  txt(ctx, "punyata.com", MX, 1304, font(400, 21), ON_BG);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}

/** Share via the native sheet (WhatsApp etc.); fall back to download. */
export async function sharePunyaCard(blob: Blob, text: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], "punyata-punya-bank.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return "shared";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "shared"; // user closed the sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "punyata-punya-bank.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
