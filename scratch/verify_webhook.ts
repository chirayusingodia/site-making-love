// Verification harness — Session 6 Razorpay webhook.
// Run:  node scratch/verify_webhook.ts   (Node 24 strips types natively)
//
// Covers:
//  1. HMAC-SHA256 signature verification (valid / wrong secret /
//     tampered body / missing sig / length-mismatch / empty secret)
//  2. Pure payload/date/patch/failure-counter logic
//  3. End-to-end processWebhookEvent against a mock Supabase client:
//     activation, charging, failure demotion (3 consecutive),
//     chain-break on success, paused-guard, unknown-sub ack,
//     unsupported event, replay idempotency, audit logging.

import { createHmac } from "node:crypto";
import {
  countConsecutiveFailures,
  extractContext,
  FAILURE_DEMOTE_THRESHOLD,
  nextBillingDateFrom,
  processWebhookEvent,
  subscriptionPatchForEvent,
  toIstDateString,
  verifyWebhookSignature,
} from "../src/lib/razorpay-webhook.server.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

// ─────────────────────────────────────────────────────────────
// 1. HMAC-SHA256 signature verification
// ─────────────────────────────────────────────────────────────
console.log("\n— HMAC-SHA256 signature verification —");

const SECRET = "test_webhook_secret_123";
const BODY = JSON.stringify({
  entity: "event",
  event: "subscription.activated",
  payload: { subscription: { entity: { id: "sub_TEST123" } } },
});
const GOOD_SIG = createHmac("sha256", SECRET).update(BODY, "utf8").digest("hex");

check("valid signature accepted", verifyWebhookSignature(BODY, GOOD_SIG, SECRET));
check(
  "wrong secret rejected",
  !verifyWebhookSignature(
    BODY,
    createHmac("sha256", "WRONG_SECRET").update(BODY, "utf8").digest("hex"),
    SECRET,
  ),
);
check("tampered body rejected", !verifyWebhookSignature(BODY + " ", GOOD_SIG, SECRET));
check("missing signature rejected", !verifyWebhookSignature(BODY, null, SECRET));
check("empty signature rejected", !verifyWebhookSignature(BODY, "", SECRET));
check("empty secret rejected", !verifyWebhookSignature(BODY, GOOD_SIG, ""));
check(
  "length-mismatched signature rejected (no timingSafeEqual throw)",
  !verifyWebhookSignature(BODY, GOOD_SIG.slice(0, 32), SECRET),
);
check(
  "uppercase-hex signature rejected (digest compare is exact)",
  !verifyWebhookSignature(BODY, GOOD_SIG.toUpperCase(), SECRET),
);

// Handler-level integration: replicate the route's exact steps —
// request.text() (raw body) + headers.get (case-insensitive) → verify.
// This is the same code path /api/payments/webhook runs per delivery.
{
  const req = new Request("https://punyata.com/api/payments/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Razorpay-Signature": GOOD_SIG, // Razorpay's canonical casing
    },
    body: BODY,
  });
  const rawBody = await req.text();
  const sig = req.headers.get("x-razorpay-signature"); // lowercase lookup
  check("handler path: raw body survives request round-trip", rawBody === BODY);
  check("handler path: header lookup is case-insensitive", sig === GOOD_SIG);
  check(
    "handler path: end-to-end signature acceptance",
    verifyWebhookSignature(rawBody, sig, SECRET),
  );

  const badReq = new Request("https://punyata.com/api/payments/webhook", {
    method: "POST",
    headers: { "X-Razorpay-Signature": GOOD_SIG },
    body: BODY.replace("sub_TEST123", "sub_HACKED"),
  });
  check(
    "handler path: tampered body rejected end-to-end",
    !verifyWebhookSignature(
      await badReq.text(),
      badReq.headers.get("x-razorpay-signature"),
      SECRET,
    ),
  );
}

// ─────────────────────────────────────────────────────────────
// 2. Pure logic
// ─────────────────────────────────────────────────────────────
console.log("\n— Pure logic —");

// toIstDateString: UTC midnight → same IST date; 19:00 UTC → next IST day.
const utcMidnight = Date.UTC(2026, 7, 5) / 1000; // 2026-08-05 00:00 UTC = 05:30 IST
const utcEvening = Date.UTC(2026, 7, 5, 19, 0) / 1000; // = 2026-08-06 00:30 IST
check("IST date: UTC midnight stays same day", toIstDateString(utcMidnight) === "2026-08-05");
check("IST date: 19:00 UTC rolls to next IST day", toIstDateString(utcEvening) === "2026-08-06");

// extractContext on a realistic Razorpay payload
const rzpPayload = {
  entity: "event",
  account_id: "acc_ABC",
  event: "subscription.charged",
  contains: ["payment", "subscription"],
  payload: {
    payment: {
      entity: {
        id: "pay_XYZ",
        amount: 25100,
        currency: "INR",
        status: "captured",
        method: "upi",
        created_at: 1754370600,
      },
    },
    subscription: {
      entity: {
        id: "sub_LMN",
        plan_id: "plan_PQR",
        customer_id: "cust_DEF",
        status: "active",
        paid_count: 3,
        current_start: 1754370600,
        current_end: 1756962600,
        charge_at: 1756962600,
      },
    },
  },
  created_at: 1754370605,
};
const ctx = extractContext(rzpPayload);
check("extractContext: event", ctx.event === "subscription.charged");
check("extractContext: razorpay sub id", ctx.razorpaySubId === "sub_LMN");
check("extractContext: payment entity", ctx.payment?.id === "pay_XYZ");
check(
  "extractContext: garbage in → nulls, no throw",
  (() => {
    const g = extractContext({ wat: true });
    return g.event === "" && g.razorpaySubId === null && g.payment === null;
  })(),
);

// nextBillingDateFrom prefers charge_at over current_end
check(
  "nextBillingDateFrom prefers charge_at",
  nextBillingDateFrom({ charge_at: utcMidnight, current_end: utcEvening }) === "2026-08-05",
);
check(
  "nextBillingDateFrom falls back to current_end",
  nextBillingDateFrom({ current_end: utcEvening }) === "2026-08-06",
);
check("nextBillingDateFrom null-safe", nextBillingDateFrom(null) === null);

// subscriptionPatchForEvent
const NOW = "2026-08-05T10:00:00.000Z";
const pAct = subscriptionPatchForEvent(
  "subscription.activated",
  extractContext({
    event: "subscription.activated",
    payload: {
      subscription: { entity: { id: "sub_1", start_at: utcMidnight, charge_at: utcEvening } },
    },
  }),
  NOW,
);
check("activated → status active", pAct?.status === "active");
check("activated → start_date from start_at", pAct?.start_date === "2026-08-05");
check("activated → next_billing_date from charge_at", pAct?.next_billing_date === "2026-08-06");
check(
  "charged → active, no start_date overwrite",
  (() => {
    const p = subscriptionPatchForEvent("subscription.charged", ctx, NOW);
    return (
      p?.status === "active" && p?.start_date === undefined && p?.next_billing_date === "2025-09-04"
    );
  })(),
);
check(
  "resumed → active, clears paused_at",
  (() => {
    const p = subscriptionPatchForEvent("subscription.resumed", ctx, NOW);
    return p?.status === "active" && p?.paused_at === null;
  })(),
);
check(
  "paused → paused + paused_at set",
  (() => {
    const p = subscriptionPatchForEvent("subscription.paused", ctx, NOW);
    return p?.status === "paused" && p?.paused_at === NOW;
  })(),
);
check(
  "cancelled → cancelled + cancelled_at set",
  (() => {
    const p = subscriptionPatchForEvent("subscription.cancelled", ctx, NOW);
    return p?.status === "cancelled" && p?.cancelled_at === NOW;
  })(),
);
check(
  "completed → expired (schema has no 'completed')",
  subscriptionPatchForEvent("subscription.completed", ctx, NOW)?.status === "expired",
);
check(
  "unsupported event → null patch",
  subscriptionPatchForEvent("payment.captured", ctx, NOW) === null,
);

// countConsecutiveFailures
check(
  "consecutive failures: 3 failed from top",
  countConsecutiveFailures([{ status: "failed" }, { status: "failed" }, { status: "failed" }]) ===
    3,
);
check(
  "consecutive failures: captured breaks chain",
  countConsecutiveFailures([
    { status: "failed" },
    { status: "captured" },
    { status: "failed" },
    { status: "failed" },
  ]) === 1,
);
check("consecutive failures: empty history", countConsecutiveFailures([]) === 0);
check("demote threshold is 3", FAILURE_DEMOTE_THRESHOLD === 3);

// ─────────────────────────────────────────────────────────────
// 3. End-to-end with mock Supabase client
// ─────────────────────────────────────────────────────────────
console.log("\n— End-to-end (mock db) —");

interface Row {
  [k: string]: unknown;
}

/** Minimal chainable mock of the supabase-js surface the webhook uses. */
function makeMockDb(seed: { subscriptions?: Row[]; payments?: Row[] }) {
  let clock = Date.parse("2026-08-05T10:00:00Z");
  const tables: Record<string, Row[]> = {
    subscriptions: (seed.subscriptions ?? []).map((r) => ({ ...r })),
    payments: (seed.payments ?? []).map((r) => ({ ...r })),
    audit_logs: [],
  };

  const applyFilters = (rows: Row[], filters: [string, unknown][]) =>
    rows.filter((r) => filters.every(([c, v]) => r[c] === v));

  function builder(table: string) {
    const st: {
      mode: string | null;
      filters: [string, unknown][];
      orderCol: string | null;
      orderAsc: boolean;
      limitN: number | null;
      payload: unknown;
      upsertKey: string | null;
    } = {
      mode: null,
      filters: [],
      orderCol: null,
      orderAsc: true,
      limitN: null,
      payload: null,
      upsertKey: null,
    };

    const execSelect = () => {
      let rows = applyFilters(tables[table], st.filters);
      if (st.orderCol) {
        const col = st.orderCol;
        rows = [...rows].sort((a, b) => {
          const cmp = String(a[col]).localeCompare(String(b[col]));
          return st.orderAsc ? cmp : -cmp;
        });
      }
      if (st.limitN != null) rows = rows.slice(0, st.limitN);
      return rows;
    };

    const exec = (): Promise<{ data: unknown; error: null }> => {
      if (st.mode === "select") return Promise.resolve({ data: execSelect(), error: null });
      if (st.mode === "insert") {
        const rows = Array.isArray(st.payload) ? st.payload : [st.payload];
        for (const r of rows as Row[])
          tables[table].push({ created_at: new Date(clock++).toISOString(), ...r });
        return Promise.resolve({ data: null, error: null });
      }
      if (st.mode === "upsert") {
        const rows = Array.isArray(st.payload) ? st.payload : [st.payload];
        for (const r of rows as Row[]) {
          const idx = st.upsertKey
            ? tables[table].findIndex((t) => t[st.upsertKey!] === r[st.upsertKey!])
            : -1;
          if (idx >= 0) tables[table][idx] = { ...tables[table][idx], ...r };
          else tables[table].push({ created_at: new Date(clock++).toISOString(), ...r });
        }
        return Promise.resolve({ data: null, error: null });
      }
      if (st.mode === "update") {
        for (const t of applyFilters(tables[table], st.filters)) Object.assign(t, st.payload);
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };

    const api: Record<string, unknown> = {
      select: () => ((st.mode = "select"), api),
      insert: (p: unknown) => ((st.mode = "insert"), (st.payload = p), api),
      upsert: (p: unknown, o?: { onConflict?: string }) => (
        (st.mode = "upsert"),
        (st.payload = p),
        (st.upsertKey = o?.onConflict ?? null),
        api
      ),
      update: (p: unknown) => ((st.mode = "update"), (st.payload = p), api),
      eq: (c: string, v: unknown) => (st.filters.push([c, v]), api),
      order: (c: string, o?: { ascending?: boolean }) => (
        (st.orderCol = c),
        (st.orderAsc = o?.ascending !== false),
        api
      ),
      limit: (n: number) => ((st.limitN = n), api),
      maybeSingle: () => Promise.resolve({ data: execSelect()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: execSelect()[0] ?? null, error: null }),
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => exec().then(onF, onR),
    };
    return api;
  }

  return { from: (t: string) => builder(t), tables };
}

// Realistic event factories
const subEntity = {
  id: "sub_REAL1",
  plan_id: "plan_BASIC",
  customer_id: "cust_1",
  status: "active",
  paid_count: 1,
  start_at: 1785887400, // 2026-08-04 UTC-ish
  current_start: 1785887400,
  current_end: 1788479400,
  charge_at: 1788479400,
};
const evActivated = {
  entity: "event",
  event: "subscription.activated",
  payload: {
    subscription: { entity: subEntity },
    payment: {
      entity: {
        id: "pay_FIRST",
        amount: 25100,
        status: "captured",
        method: "upi",
        created_at: 1785887400,
      },
    },
  },
};
const evCharged = (payId: string, paidCount: number) => ({
  entity: "event",
  event: "subscription.charged",
  payload: {
    subscription: { entity: { ...subEntity, paid_count: paidCount } },
    payment: {
      entity: {
        id: payId,
        amount: 25100,
        status: "captured",
        method: "upi",
        created_at: 1788479400,
      },
    },
  },
});
const evFailed = (payId: string) => ({
  entity: "event",
  event: "subscription.payment.failed",
  payload: {
    subscription: { entity: { ...subEntity, status: "active" } },
    payment: {
      entity: {
        id: payId,
        amount: 25100,
        status: "failed",
        method: "upi",
        created_at: 1788479400,
        error_description: "UPI mandate payment failed - insufficient funds",
      },
    },
  },
});

// — Scenario A: activation (the ONLY 'active' setter) —
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_REAL1", status: "pending" }],
  });
  const res = await processWebhookEvent(db as never, evActivated);
  const s = db.tables.subscriptions[0];
  check("A: activated → handled + action", res.handled && res.action === "activated");
  check("A: status becomes active (webhook-exclusive write)", s.status === "active");
  check("A: start_date set (IST)", s.start_date === "2026-08-05");
  check("A: next_billing_date set from charge_at", typeof s.next_billing_date === "string");
  check(
    "A: first payment recorded as captured",
    (() => {
      const p = db.tables.payments.find((r) => r.razorpay_payment_id === "pay_FIRST");
      return !!p && p.status === "captured" && p.amount_paise === 25100 && p.method === "upi";
    })(),
  );
  check(
    "A: audit row written (system actor)",
    (() => {
      const a = db.tables.audit_logs[0];
      return !!a && a.admin_id === null && a.action === "razorpay.subscription.activated";
    })(),
  );
}

// — Scenario B: replay of the same charged event is idempotent —
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_REAL1", status: "active" }],
  });
  await processWebhookEvent(db as never, evCharged("pay_CYCLE2", 2));
  await processWebhookEvent(db as never, evCharged("pay_CYCLE2", 2)); // replay
  const pays = db.tables.payments.filter((r) => r.razorpay_payment_id === "pay_CYCLE2");
  check("B: duplicate charged event → ONE payment row (upsert)", pays.length === 1);
  check("B: status stays active", db.tables.subscriptions[0].status === "active");
}

// — Scenario C: 1st + 2nd failure do NOT demote —
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_REAL1", status: "active" }],
  });
  const r1 = await processWebhookEvent(db as never, evFailed("pay_F1"));
  const r2 = await processWebhookEvent(db as never, evFailed("pay_F2"));
  const s = db.tables.subscriptions[0];
  check(
    "C: 1st failure → payment_failed, status untouched",
    r1.action === "payment_failed" && s.status === "active",
  );
  check("C: 2nd failure → still active", r2.action === "payment_failed" && s.status === "active");
  check("C: consecutive counter reported", r2.consecutiveFailures === 2);
  check(
    "C: failure rows carry reason",
    (() => {
      const p = db.tables.payments.find((r) => r.razorpay_payment_id === "pay_F1");
      return !!p && p.status === "failed" && /insufficient funds/i.test(String(p.failure_reason));
    })(),
  );
}

// — Scenario D: 3rd consecutive failure demotes active → pending —
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_REAL1", status: "active" }],
  });
  await processWebhookEvent(db as never, evFailed("pay_F1"));
  await processWebhookEvent(db as never, evFailed("pay_F2"));
  const r3 = await processWebhookEvent(db as never, evFailed("pay_F3"));
  const s = db.tables.subscriptions[0];
  check("D: 3rd consecutive failure → demoted_pending", r3.action === "demoted_pending");
  check("D: status becomes pending (never cancelled/paused stomp)", s.status === "pending");
  check(
    "D: audit records demotion",
    db.tables.audit_logs.some((a) => a.meta && (a.meta as Row).result === "demoted_pending"),
  );
}

// — Scenario E: a success between failures breaks the chain —
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_REAL1", status: "active" }],
  });
  await processWebhookEvent(db as never, evFailed("pay_F1"));
  await processWebhookEvent(db as never, evFailed("pay_F2"));
  await processWebhookEvent(db as never, evCharged("pay_OK", 3)); // retry succeeds
  const r = await processWebhookEvent(db as never, evFailed("pay_F3"));
  check("E: captured payment breaks chain → counter resets", r.consecutiveFailures === 1);
  check(
    "E: no demotion after broken chain",
    r.action === "payment_failed" && db.tables.subscriptions[0].status === "active",
  );
}

// — Scenario F: paused subscription is NEVER demoted by failures —
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_REAL1", status: "paused" }],
  });
  await processWebhookEvent(db as never, evFailed("pay_F1"));
  await processWebhookEvent(db as never, evFailed("pay_F2"));
  const r3 = await processWebhookEvent(db as never, evFailed("pay_F3"));
  check(
    "F: 3 failures on paused sub → stays paused",
    r3.action === "payment_failed" && db.tables.subscriptions[0].status === "paused",
  );
}

// — Scenario G: failed payment reactivating on later charge —
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_REAL1", status: "active" }],
  });
  await processWebhookEvent(db as never, evFailed("pay_F1"));
  await processWebhookEvent(db as never, evFailed("pay_F2"));
  await processWebhookEvent(db as never, evFailed("pay_F3")); // → pending
  const rc = await processWebhookEvent(db as never, evCharged("pay_RECOVER", 4));
  check(
    "G: demoted sub returns to active on successful charge",
    rc.action === "charged" && db.tables.subscriptions[0].status === "active",
  );
}

// — Scenario H: unknown razorpay_sub_id → ack + audit, no throw —
{
  const db = makeMockDb({ subscriptions: [] });
  const res = await processWebhookEvent(db as never, evActivated);
  check(
    "H: unknown subscription → ignored_unknown_subscription",
    !res.handled && res.action === "ignored_unknown_subscription",
  );
  check("H: unknown-sub ack is audited", db.tables.audit_logs.length === 1);
}

// — Scenario I: unsupported event → ignored, nothing written —
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_REAL1", status: "active" }],
  });
  const res = await processWebhookEvent(db as never, { event: "payment.captured", payload: {} });
  check("I: unsupported event ignored", !res.handled && res.action === "ignored_unsupported_event");
  check("I: no side effects", db.tables.payments.length === 0 && db.tables.audit_logs.length === 0);
}

// — Scenario J: paused / cancelled / completed lifecycle —
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_REAL1", status: "active" }],
  });
  await processWebhookEvent(db as never, {
    event: "subscription.paused",
    payload: { subscription: { entity: subEntity } },
  });
  check("J: paused event → status paused", db.tables.subscriptions[0].status === "paused");
  await processWebhookEvent(db as never, {
    event: "subscription.resumed",
    payload: { subscription: { entity: subEntity } },
  });
  check(
    "J: resumed event → status active, paused_at cleared",
    db.tables.subscriptions[0].status === "active" && db.tables.subscriptions[0].paused_at === null,
  );
  await processWebhookEvent(db as never, {
    event: "subscription.cancelled",
    payload: { subscription: { entity: subEntity } },
  });
  check(
    "J: cancelled event → status cancelled + timestamp",
    db.tables.subscriptions[0].status === "cancelled" &&
      typeof db.tables.subscriptions[0].cancelled_at === "string",
  );
}
{
  const db = makeMockDb({
    subscriptions: [{ id: "S2", razorpay_sub_id: "sub_REAL1", status: "active" }],
  });
  const res = await processWebhookEvent(db as never, {
    event: "subscription.completed",
    payload: { subscription: { entity: subEntity } },
  });
  check(
    "J: completed event → expired",
    res.action === "completed" && db.tables.subscriptions[0].status === "expired",
  );
}

// — Scenario K: missing payment entity on activated → still activates —
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_REAL1", status: "pending" }],
  });
  const res = await processWebhookEvent(db as never, {
    event: "subscription.activated",
    payload: { subscription: { entity: subEntity } },
  });
  check(
    "K: activated without payment entity → still activates, no payment row",
    res.action === "activated" &&
      db.tables.subscriptions[0].status === "active" &&
      db.tables.payments.length === 0,
  );
}

// ─────────────────────────────────────────────────────────────
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
