// Verification harness — Session 6 Razorpay webhook.
// Run:  npm run test:webhook
//       (= node --import ./scratch/ts-aliases.mjs scratch/verify_webhook.ts;
//        the loader resolves the "@/…" aliases the app modules use, and
//        Node 24 strips the TS types natively.)
//
// NOTE: razorpay-webhook.server.ts resolves events via
// subscription_mandates (migration 022, findMandateByGatewayId). The mock
// below models that table — it auto-derives one CURRENT mandate per seeded
// subscription that carries a razorpay_sub_id — so the integration
// scenarios exercise the real resolution path. (This was stale/dead
// between migration 022 and 2026-09-08; repaired alongside the attempted_at
// + first-cycle-demotion fix.)
//
// Covers:
//  1. HMAC-SHA256 signature verification (valid / wrong secret /
//     tampered body / missing sig / length-mismatch / empty secret)
//  2. Pure payload/date/patch/failure-counter logic
//  3. End-to-end processWebhookEvent against a mock Supabase client:
//     activation, charging, failure demotion (first-cycle immediate vs
//     3-consecutive renewal grace), attempted_at ordering vs out-of-order
//     delivery, chain-break on success, paused-guard, unknown-sub ack,
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
function makeMockDb(seed: {
  subscriptions?: Row[];
  payments?: Row[];
  subscription_mandates?: Row[];
}) {
  let clock = Date.parse("2026-08-05T10:00:00Z");
  const tables: Record<string, Row[]> = {
    subscriptions: (seed.subscriptions ?? []).map((r) => ({ ...r })),
    payments: (seed.payments ?? []).map((r) => ({ ...r })),
    // Since migration 022 the webhook resolves events by
    // (gateway, gateway_mandate_id) → subscription_mandates →
    // subscriptions. Auto-derive one CURRENT mandate per seeded
    // subscription that carries a razorpay_sub_id, so a scenario can keep
    // reading "a subscription with this gateway id" without spelling out
    // the mandate row every time. An explicit seed.subscription_mandates
    // wins when a test needs a bespoke shape (e.g. a replacement mandate).
    subscription_mandates:
      seed.subscription_mandates?.map((r) => ({ ...r })) ??
      (seed.subscriptions ?? [])
        .filter((s) => typeof s.razorpay_sub_id === "string")
        .map((s) => ({
          id: `mnd_${String(s.id)}`,
          subscription_id: s.id,
          gateway: "razorpay",
          gateway_mandate_id: s.razorpay_sub_id,
          status: "active",
          is_current: true,
          replaces_mandate_id: null,
          cycles_paid: 0,
          total_count: 120,
          created_at: new Date(clock).toISOString(),
        })),
    audit_logs: [],
  };

  const applyFilters = (
    rows: Row[],
    filters: [string, unknown][],
    neqFilters: [string, unknown][] = [],
  ) =>
    rows.filter(
      (r) =>
        filters.every(([c, v]) => r[c] === v) && neqFilters.every(([c, v]) => r[c] !== v),
    );

  function builder(table: string) {
    // Any table the code touches but no scenario seeded starts empty,
    // rather than crashing applyFilters on `undefined`.
    if (!tables[table]) tables[table] = [];
    const st: {
      mode: string | null;
      filters: [string, unknown][];
      neqFilters: [string, unknown][];
      // Multi-column order (chained .order() calls), applied in sequence
      // like PostgREST — so `.order("attempted_at").order("created_at")`
      // sorts by attempted_at then breaks ties by created_at.
      orders: { col: string; asc: boolean }[];
      limitN: number | null;
      payload: unknown;
      upsertKey: string | null;
      returning: boolean;
    } = {
      mode: null,
      filters: [],
      neqFilters: [],
      orders: [],
      limitN: null,
      payload: null,
      upsertKey: null,
      returning: false,
    };

    const execSelect = () => {
      let rows = applyFilters(tables[table], st.filters, st.neqFilters);
      if (st.orders.length) {
        rows = [...rows].sort((a, b) => {
          for (const { col, asc } of st.orders) {
            const cmp = String(a[col] ?? "").localeCompare(String(b[col] ?? ""));
            if (cmp !== 0) return asc ? cmp : -cmp;
          }
          return 0;
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
        // CAS filter applied BEFORE the write: zero matches (the row's
        // status already moved) returns [] so the handler's
        // updatedRows.length check sees the lost race, exactly like
        // PostgREST's `.update(...).select()`.
        const affected = applyFilters(tables[table], st.filters, st.neqFilters);
        for (const t of affected) Object.assign(t, st.payload as Row);
        return Promise.resolve({
          data: st.returning ? affected.map((r) => ({ ...r })) : null,
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    };

    const api: Record<string, unknown> = {
      // A leading .select() is a read; a .select() AFTER a write mode
      // (update/insert/upsert) is a RETURNING clause on that write.
      select: () => {
        if (st.mode === null) st.mode = "select";
        else st.returning = true;
        return api;
      },
      insert: (p: unknown) => ((st.mode = "insert"), (st.payload = p), api),
      upsert: (p: unknown, o?: { onConflict?: string }) => (
        (st.mode = "upsert"),
        (st.payload = p),
        (st.upsertKey = o?.onConflict ?? null),
        api
      ),
      update: (p: unknown) => ((st.mode = "update"), (st.payload = p), api),
      eq: (c: string, v: unknown) => (st.filters.push([c, v]), api),
      neq: (c: string, v: unknown) => (st.neqFilters.push([c, v]), api),
      order: (c: string, o?: { ascending?: boolean }) => (
        st.orders.push({ col: c, asc: o?.ascending !== false }), api
      ),
      limit: (n: number) => ((st.limitN = n), api),
      maybeSingle: () => Promise.resolve({ data: execSelect()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: execSelect()[0] ?? null, error: null }),
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => exec().then(onF, onR),
    };
    return api;
  }

  return {
    from: (t: string) => builder(t),
    // promoteMandate() calls db.rpc('promote_mandate', …); it only fires
    // for a REPLACEMENT mandate (replaces_mandate_id set, not current),
    // which the auto-seeded current mandate never is — so a no-op that
    // reports "nothing displaced" is all these scenarios need.
    rpc: async () => ({ data: [], error: null }),
    tables,
  };
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
// `ts` = the gateway payment-entity created_at (unix seconds), i.e. when
// the charge was ATTEMPTED. Distinct values let a scenario order events in
// real time independently of the order they are fed to the handler — which
// is the whole point of the attempted_at fix (migration 036).
const evCharged = (payId: string, paidCount: number, ts = 1788479400) => ({
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
        created_at: ts,
      },
    },
  },
});
const evFailed = (payId: string, ts = 1788479400) => ({
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
        created_at: ts,
        error_description: "UPI mandate payment failed - insufficient funds",
      },
    },
  },
});

// A prior CAPTURED payment — marks an "established" (already-paid)
// subscriber, so failures fall under the lenient 3-strike RENEWAL grace
// rather than the first-cycle immediate demotion. `ts` (unix seconds) sits
// BEFORE the failure timestamps so the capture never sorts to the top of
// the recent-history window.
const seedCapture = (payId: string, ts = 1785000000) => ({
  subscription_id: "S1",
  razorpay_payment_id: payId,
  amount_paise: 25100,
  status: "captured",
  method: "upi",
  paid_at: new Date(ts * 1000).toISOString(),
  attempted_at: new Date(ts * 1000).toISOString(),
  created_at: new Date(ts * 1000).toISOString(),
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

// — Scenario A2: activation retires the user's LEFTOVER same-plan pending —
// The stuck-checkout retry path can leave an orphaned `pending` row behind.
// When the real subscription activates, that sibling must be expired (so a
// paid subscriber never lingers in the "Abandoned Checkout" queue) — but a
// pending row for a DIFFERENT plan is a genuine second checkout and stays.
{
  const db = makeMockDb({
    subscriptions: [
      { id: "S1", razorpay_sub_id: "sub_REAL1", status: "pending", user_id: "U1", plan_id: "P1" },
      { id: "S_OLD", status: "pending", user_id: "U1", plan_id: "P1" }, // leftover, same plan
      { id: "S_OTHER", status: "pending", user_id: "U1", plan_id: "P2" }, // different plan
    ],
  });
  const res = await processWebhookEvent(db as never, evActivated);
  const byId = (id: string) => db.tables.subscriptions.find((r) => r.id === id)!;
  check("A2: activation succeeds", res.handled && res.action === "activated");
  check("A2: activated row is active", byId("S1").status === "active");
  check("A2: leftover same-plan pending expired", byId("S_OLD").status === "expired");
  check("A2: different-plan pending untouched", byId("S_OTHER").status === "pending");
  check(
    "A2: audit records superseded count",
    (() => {
      const a = db.tables.audit_logs.find(
        (r) => r.action === "razorpay.subscription.activated",
      );
      return !!a && (a.meta as { superseded_pending_subscriptions?: number })
        .superseded_pending_subscriptions === 1;
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

// — Scenario C0: FIRST-cycle failure (never captured) demotes at once —
// A mandate that authorised but never collected a rupee is an incomplete
// checkout, not a paying member: one failure drops it to 'pending' so it
// can never sit as 'active' against ₹0.
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_REAL1", status: "active" }],
  });
  const r1 = await processWebhookEvent(db as never, evFailed("pay_FC1"));
  const s = db.tables.subscriptions[0];
  check(
    "C0: first-ever charge fails → demoted_pending immediately",
    r1.action === "demoted_pending" && s.status === "pending",
  );
}

// — Scenario C: an ESTABLISHED subscriber's 1st + 2nd renewal failures do NOT demote —
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_REAL1", status: "active" }],
    payments: [seedCapture("pay_PAID1")], // has paid before → renewal grace
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

// — Scenario D: an established subscriber's 3rd consecutive failure demotes active → pending —
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_REAL1", status: "active" }],
    payments: [seedCapture("pay_PAID1")], // paid before → 3-strike grace applies
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
// Distinct attempt timestamps so the successful retry sorts ABOVE the
// later failure in the recent-history window (attempted_at ordering).
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_REAL1", status: "active" }],
    payments: [seedCapture("pay_PAID1")], // established subscriber
  });
  await processWebhookEvent(db as never, evFailed("pay_F1", 1788479401));
  await processWebhookEvent(db as never, evFailed("pay_F2", 1788479402));
  await processWebhookEvent(db as never, evCharged("pay_OK", 3, 1788479403)); // retry succeeds
  const r = await processWebhookEvent(db as never, evFailed("pay_F3", 1788479404));
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
    payments: [seedCapture("pay_PAID1")], // established subscriber
  });
  await processWebhookEvent(db as never, evFailed("pay_F1"));
  await processWebhookEvent(db as never, evFailed("pay_F2"));
  await processWebhookEvent(db as never, evFailed("pay_F3")); // → pending
  const rc = await processWebhookEvent(db as never, evCharged("pay_RECOVER", 4, 1788500000));
  check(
    "G: demoted sub returns to active on successful charge",
    rc.action === "charged" && db.tables.subscriptions[0].status === "active",
  );
}

// — Scenario OO: OUT-OF-ORDER delivery — a late 'failed' for an OLD attempt
// must NOT demote a subscriber whose newest attempt actually SUCCEEDED.
// This is the core of the attempted_at fix: the capture has the newest
// attempt time but was inserted FIRST; the stale failure is inserted LAST
// (newest created_at) yet carries an OLDER attempt time. Ordering by
// created_at would put the stale failure on top and wrongly complete a
// 3-failure chain; ordering by attempted_at keeps the capture on top.
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_REAL1", status: "active" }],
    payments: [
      seedCapture("pay_PAID1", 1785000000),
      // two earlier failed attempts, and the real latest event = a capture
      {
        subscription_id: "S1",
        razorpay_payment_id: "pay_OLDF1",
        amount_paise: 25100,
        status: "failed",
        attempted_at: new Date(1788479401 * 1000).toISOString(),
        created_at: new Date(1788479401 * 1000).toISOString(),
      },
      {
        subscription_id: "S1",
        razorpay_payment_id: "pay_OLDF2",
        amount_paise: 25100,
        status: "failed",
        attempted_at: new Date(1788479402 * 1000).toISOString(),
        created_at: new Date(1788479402 * 1000).toISOString(),
      },
      {
        subscription_id: "S1",
        razorpay_payment_id: "pay_LATECAP",
        amount_paise: 25100,
        status: "captured",
        attempted_at: new Date(1788479500 * 1000).toISOString(), // NEWEST attempt
        created_at: new Date(1788479500 * 1000).toISOString(),
      },
    ],
  });
  // A stale failure webhook (attempt time 1788479403 — BEFORE the capture)
  // arrives late, so it is inserted with the newest created_at.
  const r = await processWebhookEvent(db as never, evFailed("pay_STALE", 1788479403));
  check(
    "OO: stale late failure does NOT demote (capture is newest by attempt time)",
    r.action === "payment_failed" && db.tables.subscriptions[0].status === "active",
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
