// Runner — executes the List A schedule harnesses, and runs the
// second-Tuesday suite once per timezone in a FRESH process so the TZ is
// set before any Date work happens. Dependency-free and cross-platform
// (no `TZ=x cmd` prefix, which cmd.exe does not support).
//
// Run:  npm run test:schedule

import { spawnSync } from "node:child_process";

const TIMEZONES = ["UTC", "Asia/Kolkata", "Pacific/Kiritimati", "Pacific/Niue"];
const SUITES = ["scratch/verify_session4.ts", "scratch/verify_owner_roles.ts"];

let failed = 0;

function run(file, tz) {
  const label = tz ? `${file}  [TZ=${tz}]` : file;
  // The harnesses import app modules which use Vite's @/ alias. Node
  // does not resolve that alias on its own, so every child suite must
  // use the same loader hook as the documented standalone command.
  const res = spawnSync(process.execPath, ["--import", "./scratch/ts-aliases.mjs", file], {
    stdio: "inherit",
    env: tz ? { ...process.env, TZ: tz } : process.env,
  });
  if (res.status !== 0) {
    failed++;
    console.error(`\n>>> FAILED: ${label}\n`);
  }
  return res.status === 0;
}

for (const tz of TIMEZONES) {
  console.log(`\n########## verify_second_tuesday.ts  TZ=${tz} ##########`);
  run("scratch/verify_second_tuesday.ts", tz);
}

for (const suite of SUITES) {
  console.log(`\n########## ${suite} ##########`);
  run(suite);
}

console.log(
  failed === 0
    ? `\n=== ALL SUITES PASSED (${TIMEZONES.length} timezones + ${SUITES.length} regression suites) ===`
    : `\n=== ${failed} SUITE RUN(S) FAILED ===`,
);
process.exit(failed === 0 ? 0 : 1);
