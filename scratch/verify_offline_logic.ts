// Verification harness — offline (QR) subscribers: anchored month math,
// coverage rules, due-state boundaries, lapse cutoff, payment-body parsing.
// Run: npm run test:offline
//   (= node --import ./scratch/ts-aliases.mjs scratch/verify_offline_logic.ts)

import process from "node:process";
import {
  OFFLINE_GRACE_DAYS,
  addMonthsAnchored,
  buildOwnerReminderLink,
  buildQrReminderText,
  computeCoverage,
  defaultAmountPaise,
  dueState,
  lapseCutoff,
  mapOfflineRpcError,
  paidAtFromDate,
  parsePaymentEditBody,
  parseRecordPaymentBody,
  todayIST,
} from "../src/lib/offline-subscriptions-logic.ts";
import {
  assignQueues,
  bannerForQueue,
  matchesQrPaymentDue,
  stripMaskedFieldsDeep,
  type TelecallerQueueRow,
} from "../src/lib/telecaller-logic.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  check(ok ? label : `${label} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`, ok);
};

// ── addMonthsAnchored ──
eq(
  "anchor 31: Jan 31 +1 → Feb 28 (non-leap)",
  addMonthsAnchored("2027-01-31", 1, 31),
  "2027-02-28",
);
eq(
  "anchor 31: Feb 28 +1 → Mar 31 (no drift)",
  addMonthsAnchored("2027-02-28", 1, 31),
  "2027-03-31",
);
eq("anchor 31: Jan 31 +1 → Feb 29 (leap)", addMonthsAnchored("2028-01-31", 1, 31), "2028-02-29");
eq("anchor 29 in leap Feb stays 29", addMonthsAnchored("2028-01-29", 1, 29), "2028-02-29");
eq("anchor 29 non-leap Feb → 28", addMonthsAnchored("2027-01-29", 1, 29), "2027-02-28");
eq("anchor 30 → Feb 28", addMonthsAnchored("2027-01-30", 1, 30), "2027-02-28");
eq("anchor 30 Feb 28 +1 → Mar 30", addMonthsAnchored("2027-02-28", 1, 30), "2027-03-30");
eq("12-month prepay crosses year", addMonthsAnchored("2026-11-12", 12, 12), "2027-11-12");
eq("month rollover Dec → Jan", addMonthsAnchored("2026-12-15", 1, 15), "2027-01-15");
eq("24 months", addMonthsAnchored("2026-03-10", 24, 10), "2028-03-10");

// ── computeCoverage ──
const newSub = computeCoverage({
  status: null,
  nextBillingDate: null,
  anchorDay: null,
  paidOn: "2026-10-31",
  monthsCovered: 1,
});
eq("new sub: starts at paidOn, anchor = day", newSub, {
  periodStart: "2026-10-31",
  periodEnd: "2026-11-30",
  anchorDay: 31,
  reactivate: false,
});
const grace = computeCoverage({
  status: "active",
  nextBillingDate: "2026-11-01",
  anchorDay: 1,
  paidOn: "2026-11-05",
  monthsCovered: 1,
});
eq("late within grace: anchors to OLD due date", grace, {
  periodStart: "2026-11-01",
  periodEnd: "2026-12-01",
  anchorDay: 1,
  reactivate: false,
});
const halted = computeCoverage({
  status: "halted",
  nextBillingDate: "2026-09-01",
  anchorDay: 1,
  paidOn: "2026-10-20",
  monthsCovered: 1,
});
eq("halted: restarts from paidOn, reactivate", halted, {
  periodStart: "2026-10-20",
  periodEnd: "2026-11-20",
  anchorDay: 20,
  reactivate: true,
});
const early = computeCoverage({
  status: "active",
  nextBillingDate: "2026-12-12",
  anchorDay: 12,
  paidOn: "2026-11-20",
  monthsCovered: 3,
});
eq("early payment extends from due date", early, {
  periodStart: "2026-12-12",
  periodEnd: "2027-03-12",
  anchorDay: 12,
  reactivate: false,
});
const noAnchor = computeCoverage({
  status: "active",
  nextBillingDate: "2026-12-12",
  anchorDay: null,
  paidOn: "2026-12-10",
  monthsCovered: 1,
});
eq("missing anchor falls back to due-date day", noAnchor.anchorDay, 12);
eq(
  "pending treated as new",
  computeCoverage({
    status: "pending",
    nextBillingDate: null,
    anchorDay: null,
    paidOn: "2026-10-01",
    monthsCovered: 2,
  }).periodEnd,
  "2026-12-01",
);

// ── dueState / lapse boundaries ──
const due = "2026-11-10";
const st = (today: string, status = "active") =>
  dueState({ status, paymentMode: "offline_qr", nextBillingDate: due, today });
eq("due in 10 days → paid", st("2026-10-31"), "paid");
eq("due in 4 days → paid", st("2026-11-06"), "paid");
eq("due in 3 days → due_soon", st("2026-11-07"), "due_soon");
eq("exactly on due date → due_soon", st("2026-11-10"), "due_soon");
eq("due + 1 → overdue_grace", st("2026-11-11"), "overdue_grace");
eq("due + 7 → still grace", st("2026-11-17"), "overdue_grace");
eq("due + 8 → lapsed per cutoff", st("2026-11-18"), "lapsed");
eq("halted → lapsed", st("2026-11-10", "halted"), "lapsed");
eq("cancelled", st("2026-11-10", "cancelled"), "cancelled");
eq(
  "autopay → not_offline",
  dueState({ status: "active", paymentMode: "autopay", nextBillingDate: due, today: due }),
  "not_offline",
);
eq("OFFLINE_GRACE_DAYS is 7", OFFLINE_GRACE_DAYS, 7);
eq("lapseCutoff across month boundary", lapseCutoff("2026-12-03"), "2026-11-26");
eq("lapseCutoff across year boundary", lapseCutoff("2027-01-05"), "2026-12-29");
check(
  "cron predicate agrees with dueState at due+7 (not lapsed)",
  !(due < lapseCutoff("2026-11-17")),
);
check("cron predicate agrees with dueState at due+8 (lapsed)", due < lapseCutoff("2026-11-18"));

// ── IST date ──
eq("todayIST 18:31Z → next IST day", todayIST(new Date("2026-10-31T18:31:00Z")), "2026-11-01");
eq("todayIST 18:29Z → same IST day", todayIST(new Date("2026-10-31T18:29:00Z")), "2026-10-31");

// ── defaultAmountPaise ──
eq("monthly x3", defaultAmountPaise(19900, "monthly", 3), 59700);
eq("yearly x1 month", defaultAmountPaise(238800, "yearly", 1), 19900);
eq("yearly x12", defaultAmountPaise(238800, "yearly", 12), 238800);

// ── parseRecordPaymentBody ──
const today = "2026-10-25";
const good = {
  amountPaise: 19900,
  paidOn: "2026-10-25",
  monthsCovered: 1,
  method: "upi_qr",
  referenceNo: " test123 ",
  notes: " hi ",
  proofUrl: "https://res.cloudinary.com/x/y.jpg",
};
const okRes = parseRecordPaymentBody(good, today);
check("good body parses", okRes.ok);
if (okRes.ok) {
  eq("UTR trimmed + uppercased", okRes.value.referenceNo, "TEST123");
  eq("note trimmed", okRes.value.notes, "hi");
}
const accepts = (patch: Record<string, unknown>) =>
  parseRecordPaymentBody({ ...good, ...patch }, today).ok;
check("rejects future date", !accepts({ paidOn: "2026-10-26" }));
check("rejects amount 0", !accepts({ amountPaise: 0 }));
check("rejects float amount", !accepts({ amountPaise: 199.5 }));
check("rejects amount below Rs 1", !accepts({ amountPaise: 99 }));
check("rejects amount above Rs 1 lakh", !accepts({ amountPaise: 10_000_001 }));
check("accepts Rs 1 lakh exactly", accepts({ amountPaise: 10_000_000 }));
check("rejects months 25", !accepts({ monthsCovered: 25 }));
check("rejects months 0", !accepts({ monthsCovered: 0 }));
check("rejects unknown method", !accepts({ method: "razorpay" }));
check("rejects non-Cloudinary proof", !accepts({ proofUrl: "https://evil.example/x.jpg" }));
check("rejects impossible date 2026-02-30", !accepts({ paidOn: "2026-02-30" }));
check("rejects date older than 400 days", !accepts({ paidOn: "2025-09-01" }));
check("accepts date exactly 400 days old", accepts({ paidOn: "2025-09-20" }));
check("rejects UTR > 64 chars", !accepts({ referenceNo: "A".repeat(65) }));
check(
  "empty optional fields become null",
  (() => {
    const r = parseRecordPaymentBody({ ...good, referenceNo: "", notes: "", proofUrl: "" }, today);
    return (
      r.ok && r.value.referenceNo === null && r.value.notes === null && r.value.proofUrl === null
    );
  })(),
);
check("rejects null body", !parseRecordPaymentBody(null, today).ok);

// ── paidAt / reminder copy ──
eq("paidAtFromDate noon IST", paidAtFromDate("2026-10-31"), "2026-10-31T12:00:00+05:30");
const reminder = buildQrReminderText({ name: "Ramesh", dueDate: "2026-11-12" });
check("reminder has due date", reminder.includes("12 Nov 2026"));
check("reminder has NO amount", !/₹|amount/i.test(reminder));
const link = buildOwnerReminderLink({
  name: "Ramesh",
  phone: "+919876543210",
  dueDate: "2026-11-12",
  amountPaise: 19900,
  vpa: "punyata@upi",
});
check("owner link targets wa.me/91…", link.startsWith("https://wa.me/919876543210?text="));
check(
  "owner link carries amount + VPA",
  decodeURIComponent(link).includes("₹199") && decodeURIComponent(link).includes("punyata@upi"),
);
check(
  "owner link omits VPA line when unset",
  !decodeURIComponent(
    buildOwnerReminderLink({
      name: "R",
      phone: "9876543210",
      dueDate: "2026-11-12",
      amountPaise: 19900,
    }),
  ).includes("UPI:"),
);

// ── Telecaller: qr_payment_due ──
const NOW = new Date("2026-10-25T06:00:00Z"); // 11:30 IST, 25 Oct
const nowMs = NOW.getTime();
function qrRow(patch: Partial<TelecallerQueueRow>): TelecallerQueueRow {
  return {
    subscriptionId: "s1",
    profileId: "p1",
    fullName: "Ramesh",
    sankalpName: "Ramesh",
    phone: "+919876543210",
    altPhone: null,
    city: null,
    state: null,
    preferredLanguage: null,
    doNotCall: false,
    addressLine1: null,
    addressLine2: null,
    pincode: null,
    lastCalledAt: null,
    profileCreatedAt: "2026-09-01T00:00:00Z",
    subscriptionStatus: "active",
    subscriptionCreatedAt: "2026-09-01T00:00:00Z",
    startDate: "2026-09-01",
    nextBillingDate: "2026-10-27",
    pausedAt: null,
    cancelledAt: null,
    cancelReason: null,
    paymentMode: "offline_qr",
    haltedAt: null,
    planName: "Basic",
    planBillingPeriod: "monthly",
    hasPrasadAddon: false,
    familyMemberCount: 4,
    members: [],
    latestPaymentStatus: "captured",
    latestPaymentMethod: "upi_qr",
    latestPaymentPaidAt: "2026-09-27T06:00:00Z",
    latestPaymentFailureReason: null,
    ...patch,
  } as TelecallerQueueRow;
}
check("QR due in 2 days → qr_payment_due", matchesQrPaymentDue(qrRow({}), nowMs));
check(
  "QR due in 10 days → not yet",
  !matchesQrPaymentDue(qrRow({ nextBillingDate: "2026-11-04" }), nowMs),
);
check(
  "QR overdue (grace) → due",
  matchesQrPaymentDue(qrRow({ nextBillingDate: "2026-10-22" }), nowMs),
);
check(
  "halted 5 days ago → due",
  matchesQrPaymentDue(
    qrRow({ subscriptionStatus: "halted", haltedAt: "2026-10-20T00:00:00Z" }),
    nowMs,
  ),
);
check(
  "halted 40 days ago → dropped",
  !matchesQrPaymentDue(
    qrRow({ subscriptionStatus: "halted", haltedAt: "2026-09-10T00:00:00Z" }),
    nowMs,
  ),
);
check("do-not-call excluded", !matchesQrPaymentDue(qrRow({ doNotCall: true }), nowMs));
check("autopay row never matches", !matchesQrPaymentDue(qrRow({ paymentMode: "autopay" }), nowMs));
check(
  "cancelled QR row never matches",
  !matchesQrPaymentDue(qrRow({ subscriptionStatus: "cancelled" }), nowMs),
);
const yearlyQr = qrRow({ planBillingPeriod: "yearly", nextBillingDate: "2026-10-27" });
const assigned = assignQueues({
  rows: [yearlyQr, qrRow({ profileId: "p2", subscriptionId: "s2", nextBillingDate: "2026-10-21" })],
  logs: [],
  nowMs,
});
eq("yearly QR sub is NOT in renewal_ahead (no auto-debit)", assigned.renewal_ahead.length, 0);
eq(
  "most overdue QR row sorts first",
  assigned.qr_payment_due.map((r) => r.subscriptionId),
  ["s2", "s1"],
);
const wire = JSON.stringify(
  stripMaskedFieldsDeep({
    rows: assigned.qr_payment_due,
    banner: assigned.qr_payment_due.map((r) => bannerForQueue("qr_payment_due", r)),
  }),
);
check("telecaller payload has no amount/paise key", !/amount|paise/i.test(wire));
check(
  "banner for halted QR sub is the restart copy",
  bannerForQueue("qr_payment_due", qrRow({ subscriptionStatus: "halted" })).includes(
    "dobara shuru",
  ),
);

// ── payment edit (method / UTR / note only) ──
check(
  "edit: valid method change parses",
  parsePaymentEditBody({ method: "cash", referenceNo: " ab1 ", notes: "" }).ok,
);
check(
  "edit: UTR normalised like record",
  (() => {
    const r = parsePaymentEditBody({ method: "upi_qr", referenceNo: " ab1 " });
    return r.ok && r.value.referenceNo === "AB1";
  })(),
);
check("edit: rejects unknown method", !parsePaymentEditBody({ method: "razorpay" }).ok);
check("edit: rejects missing method", !parsePaymentEditBody({}).ok);
check(
  "edit: rejects non-Cloudinary proof",
  !parsePaymentEditBody({ method: "cash", proofUrl: "https://evil.example/x" }).ok,
);
check(
  "edit: ignores amount/date smuggled in the body",
  (() => {
    const r = parsePaymentEditBody({ method: "cash", amountPaise: 1, paidOn: "1999-01-01" });
    return r.ok && !("amountPaise" in r.value) && !("paidOn" in r.value);
  })(),
);

// ── RPC error mapping ──
eq("stale → 409", mapOfflineRpcError({ message: "stale" }).status, 409);
eq(
  "already subscribed → 409",
  mapOfflineRpcError({ message: "conflict: already subscribed" }).status,
  409,
);
eq(
  "duplicate UTR (23505) → 409 UTR copy",
  mapOfflineRpcError({ code: "23505", message: "duplicate key value violates unique constraint" })
    .message,
  "Yeh UTR pehle se record hai",
);
eq("invalid → 400", mapOfflineRpcError({ message: "invalid: months" }).status, 400);
eq("forbidden → 403", mapOfflineRpcError({ message: "forbidden: owner only" }).status, 403);
eq("unknown → 500", mapOfflineRpcError({ message: "boom" }).status, 500);

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll offline-logic checks passed.");
