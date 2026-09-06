// Verification harness — WhatsApp 24h session-window rule (§12.2).
// Run: node --import ./scratch/ts-aliases.mjs scratch/verify_whatsapp_window.ts

import {
  isWithinSessionWindow,
  WHATSAPP_SESSION_WINDOW_HOURS,
} from "../src/lib/whatsapp-window.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

const NOW = Date.parse("2026-09-06T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

check("no inbound message at all → refused", !isWithinSessionWindow(null, NOW));
check("no inbound message (undefined) → refused", !isWithinSessionWindow(undefined, NOW));
check(
  "refused at 24h + 1min",
  !isWithinSessionWindow(new Date(NOW - (24 * HOUR + 60_000)).toISOString(), NOW),
);
check(
  "allowed at 23h59m",
  isWithinSessionWindow(new Date(NOW - (23 * HOUR + 59 * 60_000)).toISOString(), NOW),
);
check("allowed just now", isWithinSessionWindow(new Date(NOW - 1000).toISOString(), NOW));
check("unparseable timestamp → refused (fail safe)", !isWithinSessionWindow("not-a-date", NOW));
check(
  "future timestamp (clock skew) → refused",
  !isWithinSessionWindow(new Date(NOW + HOUR).toISOString(), NOW),
);
check("window constant is 24h", WHATSAPP_SESSION_WINDOW_HOURS === 24);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
