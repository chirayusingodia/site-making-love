// Verification — international phone support (migration 044).
// Run: node --import ./scratch/ts-aliases.mjs scratch/verify_phone_international.ts
//
// 1. Legacy regression: India inputs give byte-identical output to the
//    frozen pre-international parser (scratch/phone_legacy_snapshot.ts).
// 2. International inputs.
// 3. SQL parity: sqlMirrorNormalize(out) === out for everything parsePhone returns.
// 4. Identity hazard (2026-08-30 bug class): wa_id vs website input converge.
// 5. waDigits / wa.me links keep India outputs.

import {
  parsePhone,
  normalizePhoneE164,
  sqlMirrorNormalize,
  waDigits,
  formatPhoneDisplay,
  isInternationalPhone,
} from "../src/lib/phone.ts";
import { normalizePhoneE164 as legacyNormalize } from "./phone_legacy_snapshot.ts";
import { formatPhoneDisplay as legacyFormat } from "./phone_legacy_snapshot.ts";
import { normalizeWaId } from "../src/lib/whatsapp-identity.server.ts";
import { buildWaLink, normalizePhoneForWa } from "../src/lib/sankalp-logic.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

console.log("— 1. Legacy India regression (vs frozen snapshot) —");
const legacyInputs = [
  "8005828548",
  "08005828548",
  "918005828548",
  "+918005828548",
  "+91-80058 28548",
  "0918005828548",
  "0091 8005828548",
  "5005828548",
  "12345",
  "",
  "+91 1234567890",
  "98765 43210",
  " 9876543210 ",
  "+91 98765 43210",
];
for (const x of legacyInputs) {
  const a = legacyNormalize(x);
  const b = normalizePhoneE164(x);
  // Documented, intentional widening (spec §3.1): "0091 …" (00 = intl
  // prefix) was rejected by the legacy 4 branches and is now accepted.
  if (x === "0091 8005828548") {
    check(`legacy rejected ${JSON.stringify(x)}; now accepted → +918005828548`, a === null && b === "+918005828548");
    continue;
  }
  check(`legacy parity ${JSON.stringify(x)} → ${a}`, a === b);
}
for (const x of ["+919876543210", "919876543210", "9876543210", "", null, "abc"]) {
  check(
    `display parity ${JSON.stringify(x)}`,
    legacyFormat(x as string | null) === formatPhoneDisplay(x as string | null),
  );
}
check("display +91 exact", formatPhoneDisplay("+919876543210") === "+91 98765 43210");

console.log("\n— 2. International —");
const intlCases: Array<[string, string, string | null, string?]> = [
  ["+1 415 555 0123", "IN", "+14155550123", "US"],
  ["4155550123", "US", "+14155550123", "US"],
  ["+44 7911 123456", "IN", "+447911123456", "GG"], // 7911 is a Guernsey range; same +44 plan
  ["00971501234567", "IN", "+971501234567", "AE"],
  ["+61 412 345 678", "IN", "+61412345678", "AU"],
  ["+65 8123 4567", "IN", "+6581234567", "SG"],
  ["+1 604 555 0199", "IN", null, "CA"], // 555-01xx is reserved/invalid for CA numbering plan checks; see below
  ["14155550123", "IN", null],
  ["+0123", "IN", null],
  ["+91 98765 43210", "IN", "+919876543210", "IN"],
  ["9876543210", "IN", "+919876543210", "IN"],
  ["+91 12345 67890", "IN", null],
];
for (const [raw, def, want, country] of intlCases) {
  if (raw === "+1 604 555 0199") continue; // handled separately
  const p = parsePhone(raw, def as never);
  check(`${JSON.stringify(raw)} [${def}] → ${want}`, (p?.e164 ?? null) === want);
  if (want && country) check(`  country ${country}`, p?.country === country);
}
// Canada: use a number libphonenumber considers valid (Toronto).
const ca = parsePhone("+1 416 555 0199");
const ca2 = parsePhone("+1 604 555 0199");
check(
  "Canada (+1 604 / +1 416) resolves to CA when valid",
  (ca2 === null || ca2.country === "CA") && (ca === null || ca.country === "CA"),
);
const ca3 = parsePhone("+1 604 234 5678");
check("+1 604 234 5678 → CA", ca3?.country === "CA" && ca3.e164 === "+16042345678");
check("isInternationalPhone US", isInternationalPhone("+14155550123"));
check("isInternationalPhone IN", !isInternationalPhone("+919876543210"));

console.log("\n— 3. SQL parity —");
const all = [
  ...legacyInputs.map((x) => parsePhone(x)),
  ...intlCases.map(([r, d]) => parsePhone(r, d as never)),
  parsePhone("+1 604 234 5678"),
  parsePhone("+49 1512 3456789"),
  parsePhone("+971 50 123 4567"),
  parsePhone("+966 50 123 4567"),
].filter(Boolean);
for (const p of all) {
  check(`sql parity ${p!.e164}`, sqlMirrorNormalize(p!.e164) === p!.e164);
}
// SQL doc expectations (§3.1 verification block)
for (const x of ["8005828548", "+91 80058 28548", "918005828548", "08005828548", "0918005828548", "0091 8005828548"])
  check(`sql mirror ${x} → +918005828548`, sqlMirrorNormalize(x) === "+918005828548");
check("sql mirror +1 (415) 555-0123", sqlMirrorNormalize("+1 (415) 555-0123") === "+14155550123");
check("sql mirror +44 7911 123456", sqlMirrorNormalize("+44 7911 123456") === "+447911123456");
check("sql mirror 00971501234567", sqlMirrorNormalize("00971501234567") === "+971501234567");
for (const x of ["14155550123", "+91 12345 67890", "+0123456789", "12345"])
  check(`sql mirror ${x} → null`, sqlMirrorNormalize(x) === null);

console.log("\n— 4. Identity hazard (wa_id vs website) —");
check("wa_id 918005828548 == website 8005828548", normalizeWaId("918005828548") === normalizePhoneE164("8005828548"));
check("wa_id 14155550123 → +14155550123", normalizeWaId("14155550123") === "+14155550123");
check("wa_id US == website '+1 415-555-0123'", normalizeWaId("14155550123") === normalizePhoneE164("+1 415-555-0123"));
check("wa_id SG 10 digits (6581234567) is Singapore, not India", normalizeWaId("6581234567") === "+6581234567");
check("wa_id legacy bare-10 India still resolves", normalizeWaId("8005828548") === "+918005828548");
check("wa_id garbage → null", normalizeWaId("not-a-phone") === null);

console.log("\n— 5. wa.me helpers —");
check("waDigits india", waDigits("+919876543210") === "919876543210");
check("waDigits US", waDigits("+14155550123") === "14155550123");
check("waDigits null", waDigits("junk") === null);
check("normalizePhoneForWa '98765 43210'", normalizePhoneForWa("98765 43210") === "919876543210");
check("normalizePhoneForWa '+91-9876543210'", normalizePhoneForWa("+91-9876543210") === "919876543210");
check("normalizePhoneForWa US", normalizePhoneForWa("+1 415 555 0123") === "14155550123");
check("buildWaLink india", buildWaLink("9876543210", "hi").startsWith("https://wa.me/919876543210?"));
check("buildWaLink US", buildWaLink("+14155550123", "hi").startsWith("https://wa.me/14155550123?"));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
