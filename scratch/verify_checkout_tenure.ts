// DoD item: prove the tenure fix against a REAL Razorpay entity
// response — not just the request payload. Creates a TEST-MODE
// subscription with the new derived total_count, reads back the
// created entity, asserts, and cancels it so nothing lingers.
//
// Prereqs (test mode):
//   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET  — test-mode keys
//   RAZORPAY_TEST_PLAN_ID                  — a monthly test-mode Plan id (plan_…)
// Run:
//   node --env-file=.env --import ./scratch/ts-aliases.mjs scratch/verify_checkout_tenure.ts

import process from "node:process";
import { createRazorpaySubscription } from "../src/lib/razorpay.server.ts";
import { totalCountForBillingPeriod } from "../src/lib/subscriptions-checkout.server.ts";

async function main(): Promise<void> {
  const planId = process.env.RAZORPAY_TEST_PLAN_ID;
  if (!planId) {
    console.error(
      "Set RAZORPAY_TEST_PLAN_ID (a monthly test-mode Razorpay Plan id) plus test-mode keys.",
    );
    process.exit(1);
  }

  const expected = {
    monthly: totalCountForBillingPeriod("monthly"),
    yearly: totalCountForBillingPeriod("yearly"),
  };
  if (expected.monthly !== 1200 || expected.yearly !== 100) {
    console.error(`derived constants wrong: ${JSON.stringify(expected)}`);
    process.exit(1);
  }
  console.log(`derived total_count → monthly:${expected.monthly} yearly:${expected.yearly}`);

  const sub = await createRazorpaySubscription({
    razorpayPlanId: planId,
    subscriptionDbId: "verify-tenure-local",
    couponCode: null,
    totalCount: expected.monthly,
  });

  // The ENTITY response is the assertion target — this is what
  // Razorpay actually scheduled, mandate included.
  const actual = sub.total_count;
  const ok = actual === expected.monthly;
  console.log(
    `${ok ? "PASS" : "FAIL"} — entity total_count=${actual} (expected ${expected.monthly})`,
  );
  console.log(`       status=${sub.status} id=${sub.id}`);

  // Cleanup: cancel the throwaway test subscription.
  try {
    await fetch(`https://api.razorpay.com/v1/subscriptions/${sub.id}/cancel`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(
          `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`,
        ).toString("base64")}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
    console.log("cleanup — test subscription cancelled");
  } catch {
    console.warn("cleanup failed — cancel it manually in the Razorpay test dashboard");
  }

  if (!ok) process.exit(1);
  console.log("\nALL CHECKS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
