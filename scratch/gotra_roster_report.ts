// Reads the owner's manual roster (Punyata_Gotra_List-*.xlsx) and produces:
//   1. pandit-list.xlsx  — name + gotra ONLY for everyone still "Continue"
//      (sankalp rule: never phone / plan / price on the Pandit's copy), plus an
//      internal sheet of who is payment-pending.
//   2. qr-import-plan.json / .csv — a DRY-RUN plan for importing the non-website
//      "Continue" people as offline (QR) subscribers. It writes NOTHING to any
//      database; it only shows what we could infer and what needs a decision.
//
// Run: node --import ./scratch/ts-aliases.mjs scratch/gotra_roster_report.ts <roster.xlsx> <outDir> [YYYY-MM-DD today]
// Output contains personal data — keep <outDir> outside the repo.

import process from "node:process";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildXlsx } from "../src/lib/xlsx-write.ts";
import { csvRow } from "../src/lib/csv.ts";
import { normalizePhoneE164 } from "../src/lib/phone.ts";
import {
  OFFLINE_GRACE_DAYS,
  addDaysIso,
  computeCoverage,
  fmtDueDate,
  todayIST,
} from "../src/lib/offline-subscriptions-logic.ts";

const [, , rosterPath, outDir, todayArg] = process.argv;
if (!rosterPath || !outDir) {
  console.error("usage: gotra_roster_report.ts <roster.xlsx> <outDir> [today]");
  process.exit(2);
}
const today = todayArg ?? todayIST(new Date());
const YEAR = Number(today.slice(0, 4));

// ── minimal first-sheet reader (inline strings + numbers) ──
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

const xml = execFileSync("unzip", ["-p", rosterPath, "xl/worksheets/sheet1.xml"], {
  encoding: "utf8",
  maxBuffer: 50_000_000,
});
const grid: string[][] = [...xml.matchAll(/<row [^>]*>(.*?)<\/row>/g)].map((r) => {
  const cells: string[] = [];
  for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>(.*?)<\/c>)/g)) {
    const ref = /r="([A-Z]+)\d+"/.exec(c[1])?.[1] ?? "A";
    const col = [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    const body = c[2] ?? "";
    const t = /<t[^>]*>(.*?)<\/t>/.exec(body)?.[1];
    const v = /<v>(.*?)<\/v>/.exec(body)?.[1];
    cells[col] = decode(t ?? v ?? "");
  }
  return Array.from(cells, (x) => x ?? "");
});
const header = grid[0];
const idx = (name: string) =>
  header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
const COL = {
  gotra: idx("Gotra"),
  naam: idx("Naam"),
  mobile: idx("Mobile Number"),
  ref: idx("Reference"),
  since: idx("Member Since"),
  pay: idx("Payment Detail"),
  month: idx("Month-wise Status"),
  status: idx("Current Status"),
  pending: idx("Pending Status"),
  next: idx("Next Puja"),
  city: idx("City"),
};
for (const [k, v] of Object.entries(COL)) if (v < 0) throw new Error(`column missing: ${k}`);

interface Person {
  no: number;
  gotra: string;
  naam: string;
  mobile: string;
  ref: string;
  since: string;
  pay: string;
  monthWise: string;
  status: string;
  pending: string;
  nextPuja: string;
}
const people: Person[] = grid.slice(1).map((r, i) => ({
  no: Number(r[0]) || i + 1,
  gotra: r[COL.gotra] ?? "",
  naam: r[COL.naam] ?? "",
  mobile: r[COL.mobile] ?? "",
  ref: r[COL.ref] ?? "",
  since: r[COL.since] ?? "",
  pay: r[COL.pay] ?? "",
  monthWise: r[COL.month] ?? "",
  status: (r[COL.status] ?? "").trim(),
  pending: (r[COL.pending] ?? "").trim(),
  nextPuja: r[COL.next] ?? "",
}));

// ── 1. Pandit list ──
const continuing = people.filter((p) => p.status.toLowerCase() === "continue");
const panditRows = [
  ["क्र.", "Gotra", "Naam"],
  ...continuing.map((p, i): (string | number)[] => [i + 1, p.gotra, p.naam]),
];
const internalRows = [
  ["Naam", "Gotra", "Pending Status", "Payment Detail"],
  ...continuing
    .filter((p) => p.pending.toLowerCase() !== "done")
    .map((p) => [p.naam, p.gotra, p.pending, p.pay]),
];

// ── 2. QR import dry-run ──
const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const monthsIn = (s: string) =>
  [...s.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi)].map(
    (m) => MONTHS[m[1].toLowerCase()],
  );

function sinceIso(s: string): string | null {
  const m = /(\d{1,2})\s+([A-Za-z]{3})/.exec(s);
  if (!m || !MONTHS[m[2].toLowerCase()]) return null;
  return `${YEAR}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

interface Pay {
  ym: string;
  paidOn: string;
  amountPaise: number;
  method: "upi_qr" | "unknown";
}

function parsePayments(p: Person, sinceDay: number): { pays: Pay[]; flags: string[] } {
  const flags: string[] = [];
  const pays: Pay[] = [];
  const firstMonth = Number(sinceIso(p.since)?.slice(5, 7));
  for (const seg of p.pay.split(/[;+]/)) {
    const done = /^\s*(done|paid)/i.test(seg) && !/not done/i.test(seg);
    if (!done) continue;
    const amount = Number(/\b(\d{3})\b/.exec(seg)?.[1] ?? 399);
    let months = monthsIn(seg);
    if (months.length === 0) {
      months = [firstMonth];
      if (p.monthWise.trim()) flags.push("later months not stated in Payment Detail");
    }
    const method = /QR/i.test(seg) ? "upi_qr" : "unknown";
    for (const m of months) {
      const day = String(Math.min(sinceDay, new Date(Date.UTC(YEAR, m, 0)).getUTCDate())).padStart(
        2,
        "0",
      );
      pays.push({
        ym: `${YEAR}-${String(m).padStart(2, "0")}`,
        paidOn: `${YEAR}-${String(m).padStart(2, "0")}-${day}`,
        amountPaise: amount * 100,
        method,
      });
    }
  }
  pays.sort((a, b) => a.paidOn.localeCompare(b.paidOn));
  return { pays, flags };
}

const plan = continuing
  .filter((p) => !/website/i.test(p.pay))
  .map((p) => {
    const flags: string[] = [];
    const since = sinceIso(p.since);
    const phone = normalizePhoneE164(p.mobile);
    if (!phone) flags.push("phone not a valid Indian mobile");
    if (!since) flags.push("Member Since not parseable");
    const { pays, flags: f2 } = since
      ? parsePayments(p, Number(since.slice(8, 10)))
      : { pays: [] as Pay[], flags: [] as string[] };
    flags.push(...f2);

    let blocked: string | null = null;
    if (pays.length === 0)
      blocked = "no confirmed payment — a subscription can't be created without one";

    // Replay: contiguous payments extend cover; a payment after due+grace restarts it.
    let status: "none" | "active" | "halted" = "none";
    let nextDue: string | null = null;
    let anchor: number | null = null;
    const gaps: string[] = [];
    for (const pay of pays) {
      if (status === "none") {
        const c = computeCoverage({
          status: null,
          nextBillingDate: null,
          anchorDay: null,
          paidOn: pay.paidOn,
          monthsCovered: 1,
        });
        nextDue = c.periodEnd;
        anchor = c.anchorDay;
        status = "active";
        continue;
      }
      if (pay.paidOn > addDaysIso(nextDue!, OFFLINE_GRACE_DAYS)) {
        gaps.push(`gap before ${fmtDueDate(pay.paidOn)} (was due ${fmtDueDate(nextDue!)})`);
        status = "halted";
      }
      const c = computeCoverage({
        status,
        nextBillingDate: nextDue,
        anchorDay: anchor,
        paidOn: pay.paidOn,
        monthsCovered: 1,
      });
      nextDue = c.periodEnd;
      anchor = c.anchorDay;
      status = "active";
    }
    if (gaps.length)
      flags.push(
        `payment history has a lapse (${gaps.join("; ")}) — can't be replayed through the normal RPC; import the latest payment only or decide manually`,
      );
    let statusToday: string = status;
    if (status === "active" && nextDue! < addDaysIso(today, -OFFLINE_GRACE_DAYS))
      statusToday = "would lapse at next cron (halted)";
    if (statusToday !== "active" && status !== "none") {
      flags.push(
        `paid only through ${fmtDueDate(nextDue!)} but the sheet says continuing — later payments missing from the sheet?`,
      );
    }
    if (pays.some((x) => x.method === "unknown"))
      flags.push("payment method not stated (QR assumed?) — confirm");
    if (pays.length > 0 && pays.every((x) => x.method === "unknown"))
      flags.push("no payment explicitly marked QR");
    if (p.monthWise.trim() && /pause/i.test(p.monthWise)) flags.push("had a paused month");

    return {
      no: p.no,
      naam: p.naam,
      gotra: p.gotra,
      phone,
      memberSince: since,
      payments: pays.map((x) => ({
        paidOn: x.paidOn,
        amountRupees: x.amountPaise / 100,
        method: x.method,
      })),
      projectedNextDue: nextDue,
      projectedStatusToday: blocked ? "n/a" : statusToday,
      blocked,
      hasGap: gaps.length > 0,
      needsDecision: flags,
    };
  });

mkdirSync(outDir, { recursive: true });
const sheetBytes = await buildXlsx([
  { name: "Pandit list", rows: panditRows },
  { name: "Payment pending (internal)", rows: internalRows },
]);
writeFileSync(`${outDir}/pandit-list.xlsx`, sheetBytes);
writeFileSync(`${outDir}/qr-import-plan.json`, JSON.stringify(plan, null, 2));
writeFileSync(
  `${outDir}/qr-import-plan.csv`,
  "﻿" +
    [
      csvRow([
        "No",
        "Naam",
        "Gotra",
        "Phone",
        "Member since",
        "Inferred payments",
        "Projected next due",
        "Status today",
        "Blocked",
        "Needs decision",
      ]),
      ...plan.map((r) =>
        csvRow([
          r.no,
          r.naam,
          r.gotra,
          r.phone,
          r.memberSince,
          r.payments.map((x) => `${x.paidOn} ₹${x.amountRupees} ${x.method}`).join(" | "),
          r.projectedNextDue,
          r.projectedStatusToday,
          r.blocked,
          r.needsDecision.join(" • "),
        ]),
      ),
    ].join("\r\n"),
);

console.log(`today=${today}`);
console.log(
  `roster: ${people.length} people; continuing: ${continuing.length}; on website autopay (excluded from QR import): ${continuing.length - plan.length}`,
);
console.log(
  `QR import candidates: ${plan.length}; blocked (no confirmed payment): ${plan.filter((r) => r.blocked).length}; clean: ${plan.filter((r) => !r.blocked && r.needsDecision.length === 0).length}`,
);
console.log(`payment-pending among continuing: ${internalRows.length - 1}`);
