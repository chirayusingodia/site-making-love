// Sanity checks for the halted-subscription session's PURE logic.
// Run: npx vite-node scratch/verify_halted.ts   (or tsx)
// Mirrors the style of the other scratch/verify_*.ts files.
import {
  SUPPORTED_EVENTS,
  subscriptionPatchForEvent,
  type WebhookContext,
} from "../src/lib/razorpay-webhook.server";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}`);
  if (!cond) failures++;
}

const ctx = (event: string): WebhookContext => ({
  event,
  razorpaySubId: "sub_TEST1",
  subscription: { id: "sub_TEST1", charge_at: 1756000000 },
  payment: null,
});
const now = new Date("2026-08-23T10:00:00.000Z").toISOString();

check(
  "subscription.halted is in SUPPORTED_EVENTS",
  (SUPPORTED_EVENTS as readonly string[]).includes("subscription.halted"),
);

const halted = subscriptionPatchForEvent("subscription.halted", ctx("subscription.halted"), now);
check("halted patch sets status=halted", halted?.status === "halted");
check("halted patch sets halted_at=nowIso", halted?.halted_at === now);
check("halted patch does not touch paused_at/cancelled_at", !("paused_at" in (halted ?? {})) && !("cancelled_at" in (halted ?? {})));

const resumed = subscriptionPatchForEvent("subscription.resumed", ctx("subscription.resumed"), now);
check("resumed clears halted_at", resumed?.status === "active" && resumed.halted_at === null);

const charged = subscriptionPatchForEvent("subscription.charged", ctx("subscription.charged"), now);
check("charged clears halted_at", charged?.halted_at === null && charged?.status === "active");

const activated = subscriptionPatchForEvent("subscription.activated", ctx("subscription.activated"), now);
check("activated clears halted_at", activated?.halted_at === null);

const paused = subscriptionPatchForEvent("subscription.paused", ctx("subscription.paused"), now);
check("paused still only sets paused_at", paused?.status === "paused" && paused.paused_at === now && paused.halted_at === undefined);

const cancelled = subscriptionPatchForEvent("subscription.cancelled", ctx("subscription.cancelled"), now);
check("cancelled untouched by halt changes", cancelled?.status === "cancelled" && cancelled.cancelled_at === now);

check("unknown event still returns null", subscriptionPatchForEvent("subscription.halt", ctx("x"), now) === null);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
