// ─────────────────────────────────────────────────────────────
// PUNYATA — shareable "Punya Bank" achievement card (client canvas)
//
// Fixed 1080×1350 (4:5) canvas → PNG blob, so the picture is identical
// on every device and drops straight into a WhatsApp status / post.
// Same font + approach as ashirwad-patra-render.ts (Martel, pure
// Canvas 2D, no external deps). Parchment + saffron-arch look to match
// the Ashirwad Patra certificate.
// ─────────────────────────────────────────────────────────────

import type { PunyaImpact } from "@/lib/punya-impact";

export interface PunyaCardData {
  lang: "hindi" | "english";
  months: number;
  impact: PunyaImpact;
  /** e.g. "Sharad Purnima · Sat, 31 October" — most recent pooja, if any. */
  lastPooja?: { dateLabel: string; occasion: string } | null;
}

const W = 1080;
const H = 1350;
const font = (w: 400 | 700, s: number) => `${w} ${s}px Martel, Georgia, serif`;
const EMOJI = "400 40px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";

const SAFFRON = "#D9531E";
const DEEP = "#7A2A10";
const GOLD = "#C9A54E";
const INK = "#3A2A1C";
const SOFT = "#7A6552";

type Ctx = CanvasRenderingContext2D;

function txt(
  ctx: Ctx,
  t: string,
  x: number,
  y: number,
  f: string,
  color: string,
  align: CanvasTextAlign = "center",
) {
  ctx.font = f;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(t, x, y);
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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

export async function renderPunyaCard(data: PunyaCardData): Promise<Blob> {
  await ensureFonts();
  const hi = data.lang === "hindi";
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");

  // Parchment base
  const paper = ctx.createLinearGradient(0, 0, 0, H);
  paper.addColorStop(0, "#FFF9EF");
  paper.addColorStop(1, "#FBE8CF");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  // Saffron arch header
  const head = ctx.createRadialGradient(W * 0.8, 0, 20, W / 2, 200, 700);
  head.addColorStop(0, "#F27A2E");
  head.addColorStop(0.5, "#D9531E");
  head.addColorStop(1, "#8A3012");
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, 330);
  ctx.quadraticCurveTo(W / 2, 450, 0, 330);
  ctx.closePath();
  ctx.fill();

  // Mandala rings on the header
  ctx.save();
  ctx.strokeStyle = "rgba(255,231,184,0.18)";
  ctx.lineWidth = 2;
  for (const r of [300, 210, 120]) {
    ctx.beginPath();
    ctx.arc(W - 40, 40, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  txt(ctx, "पुण्यता", W / 2, 118, font(700, 70), "#FFE7B8");
  txt(ctx, hi ? "मेरा पुण्य खाता" : "MY PUNYA BANK", W / 2, 180, font(700, hi ? 40 : 30), "#FFF3EA");
  ctx.strokeStyle = "rgba(255,231,184,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(380, 212);
  ctx.lineTo(500, 212);
  ctx.moveTo(580, 212);
  ctx.lineTo(700, 212);
  ctx.stroke();
  txt(ctx, "✦", W / 2, 222, font(400, 28), "#FFE7B8");

  // Hero badge overlapping the arch
  const bx = W / 2;
  const by = 400;
  ctx.save();
  ctx.shadowColor = "rgba(122,42,16,0.35)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(bx, by, 138, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(bx, by, 138, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(bx, by, 124, 0, Math.PI * 2);
  ctx.stroke();
  const n = String(data.impact.poojas);
  txt(ctx, n, bx, by + 42, font(700, n.length > 2 ? 100 : 130), SAFFRON);

  txt(ctx, hi ? "पावन पूजाएँ मेरे नाम से संपन्न" : "sacred poojas done in my name", W / 2, 600, font(700, hi ? 36 : 34), INK);
  txt(
    ctx,
    hi
      ? `${data.months} माह की सदस्यता  ·  तीर्थ गुरु पुष्करराज`
      : `${data.months}-month membership  ·  Tirth Guru Pushkarraj`,
    W / 2,
    644,
    font(400, 24),
    SOFT,
  );

  // Impact tiles
  const tiles = [
    { v: data.impact.sadhuFed, emoji: "🍲", hiL: "साधु-संतों को भोजन", enL: "Sadhu-Santo fed", hiS: "प्रति पूजा 5 संत", enS: "5 per pooja" },
    { v: data.impact.cowsFed, emoji: "🐄", hiL: "गौ-माताओं को चारा", enL: "Cows given fodder", hiS: "प्रति पूजा 7 गौ", enS: "7 per pooja" },
    { v: data.impact.sankalps, emoji: "📿", hiL: "परिवार के संकल्प", enL: "Family sankalps", hiS: "नाम व गोत्र सहित", enS: "with name & gotra" },
    { v: data.impact.offerings, emoji: "🪔", hiL: "सेवा अर्पण", enL: "Seva offerings", hiS: "वीडियो प्रमाण सहित", enS: "with video proof" },
  ];
  const gx = 64;
  const gap = 24;
  const gw = (W - gx * 2 - gap) / 2;
  const gh = 190;
  tiles.forEach((tile, i) => {
    const x = gx + (i % 2) * (gw + gap);
    const y = 700 + Math.floor(i / 2) * (gh + gap);
    ctx.save();
    ctx.shadowColor = "rgba(122,42,16,0.14)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, x, y, gw, gh, 28);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(201,165,78,0.45)";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, gw, gh, 28);
    ctx.stroke();

    ctx.fillStyle = "#FDE9D6";
    ctx.beginPath();
    ctx.arc(x + 62, y + 62, 38, 0, Math.PI * 2);
    ctx.fill();
    txt(ctx, tile.emoji, x + 62, y + 77, EMOJI, INK);

    txt(ctx, String(tile.v), x + gw - 34, y + 82, font(700, 70), SAFFRON, "right");
    txt(ctx, hi ? tile.hiL : tile.enL, x + 34, y + 140, font(700, hi ? 27 : 25), INK, "left");
    txt(ctx, hi ? tile.hiS : tile.enS, x + 34, y + 172, font(400, 21), SOFT, "left");
  });

  // Latest pooja ribbon (auspicious day)
  const ry = 1130;
  if (data.lastPooja) {
    ctx.fillStyle = "#FDE9D6";
    roundRect(ctx, 64, ry, W - 128, 84, 42);
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    roundRect(ctx, 64, ry, W - 128, 84, 42);
    ctx.stroke();
    txt(ctx, `✦  ${data.lastPooja.occasion}  ·  ${data.lastPooja.dateLabel}`, W / 2, ry + 53, font(700, 28), DEEP);
  } else {
    txt(ctx, hi ? "हर माह, आपके नाम और गोत्र से पूजा" : "Every month, a pooja in your name & gotra", W / 2, ry + 52, font(400, 28), SOFT);
  }

  // Footer band
  const fy = 1250;
  const foot = ctx.createLinearGradient(0, fy, 0, H);
  foot.addColorStop(0, "#C0451A");
  foot.addColorStop(1, "#7A2A10");
  ctx.fillStyle = foot;
  ctx.fillRect(0, fy, W, H - fy);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, fy, W, 4);
  txt(ctx, hi ? "दान पुण्य आपका · सेवा हमारी" : "Your daan-punya · our seva", W / 2, fy + 46, font(700, 28), "#FFE7B8");
  txt(ctx, "punyata.com", W / 2, fy + 84, font(400, 24), "#FFF3EA");

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
