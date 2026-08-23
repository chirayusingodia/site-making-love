// Verification harness — Refund webhook handling session (2026-08-23).
// Run:  node --import ./scratch/ts-aliases.mjs scratch/verify_refunds.ts
// Mirrors the mock-db harness in verify_webhook.ts.
//
// Covers:
//  1. Pure refundPatchForEvent logic (full / partial / non-processed events)
//  2. extractRefundContext payload normalisation
//  3. End-to-end processRefundEvent + processWebhookEvent dispatch against
//     a mock Supabase client: full refund, partial refund, refund.failed
//     (no mutation), refund.created (no mutation), unknown payment (ack),
//     unsupported event (ignored), replay idempotency, subscription
//     status is NEVER touched by any refund event.

import {
  ALL_SUPPORTED_EVENTS,
  extractRefundContext,
  processRefundEvent,
  processWebhookEvent,
  refundPatchForEvent,
  SUPPORTED_REFUND_EVENTS,
  type RefundWebhookContext,
} from "../src/lib/razorpay-webhook.server.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

// ─────────────────────────────────────────────────────────────
// 1. Pure logic
// ─────────────────────────────────────────────────────────────
console.log("\n— Pure logic —");

const NOW = "2026-08-23T12:00:00.000Z";

const fullCtx: RefundWebhookContext = {
  event: "refund.processed",
  refund: { id: "rfnd_FULL1", payment_id: "pay_ABC", amount: 25100, status: "processed" },
  payment: { id: "pay_ABC", amount: 25100, amount_refunded: 25100, refund_status: "full" },
};
const partialCtx: RefundWebhookContext = {
  event: "refund.processed",
  refund: { id: "rfnd_PART1", payment_id: "pay_ABC", amount: 10000, status: "processed" },
  payment: { id: "pay_ABC", amount: 25100, amount_refunded: 10000, refund_status: "partial" },
};

const fullPatch = refundPatchForEvent(fullCtx, NOW);
check("full refund → status:'refunded'", fullPatch?.status === "refunded");
check("full refund → refund_status:'full'", fullPatch?.refund_status === "full");
check("full refund → amount matches refund.amount", fullPatch?.refund_amount_paise === 25100);
check("full refund → refund id recorded", fullPatch?.razorpay_refund_id === "rfnd_FULL1");

const partialPatch = refundPatchForEvent(partialCtx, NOW);
check("partial refund → status NOT set (stays captured)", partialPatch?.status === undefined);
check("partial refund → refund_status:'partial'", partialPatch?.refund_status === "partial");
check("partial refund → amount is THIS refund only", partialPatch?.refund_amount_paise === 10000);

check(
  "refund.created → null patch (not yet confirmed)",
  refundPatchForEvent({ ...fullCtx, event: "refund.created" }, NOW) === null,
);
check(
  "refund.failed → null patch (money never moved)",
  refundPatchForEvent({ ...fullCtx, event: "refund.failed" }, NOW) === null,
);
check(
  "refund.speed_changed → null patch",
  refundPatchForEvent({ ...fullCtx, event: "refund.speed_changed" }, NOW) === null,
);
check(
  "missing refund entity → null patch, no throw",
  refundPatchForEvent({ event: "refund.processed", refund: null, payment: null }, NOW) === null,
);

check(
  "SUPPORTED_REFUND_EVENTS has exactly the 4 documented events",
  SUPPORTED_REFUND_EVENTS.length === 4 &&
    ["refund.created", "refund.processed", "refund.failed", "refund.speed_changed"].every((e) =>
      (SUPPORTED_REFUND_EVENTS as readonly string[]).includes(e),
    ),
);
check(
  "ALL_SUPPORTED_EVENTS is subscription + refund events, 12 total",
  ALL_SUPPORTED_EVENTS.length === 12,
);

// extractRefundContext
const rzpRefundPayload = {
  entity: "event",
  event: "refund.processed",
  payload: {
    refund: {
      entity: { id: "rfnd_XYZ", payment_id: "pay_LMN", amount: 25100, status: "processed" },
    },
    payment: {
      entity: { id: "pay_LMN", amount: 25100, amount_refunded: 25100, refund_status: "full" },
    },
  },
};
const rctx = extractRefundContext(rzpRefundPayload);
check("extractRefundContext: event", rctx.event === "refund.processed");
check("extractRefundContext: refund id", rctx.refund?.id === "rfnd_XYZ");
check("extractRefundContext: payment_id on refund entity", rctx.refund?.payment_id === "pay_LMN");
check("extractRefundContext: payment refund_status", rctx.payment?.refund_status === "full");
check(
  "extractRefundContext: garbage in → nulls, no throw",
  (() => {
    const g = extractRefundContext({ wat: true });
    return g.event === "" && g.refund === null && g.payment === null;
  })(),
);

// ─────────────────────────────────────────────────────────────
// 2. End-to-end with mock Supabase client
// ─────────────────────────────────────────────────────────────
console.log("\n— End-to-end (mock db) —");

interface Row {
  [k: string]: unknown;
}

/** Same minimal chainable mock as verify_webhook.ts. */
function makeMockDb(seed: { subscriptions?: Row[]; payments?: Row[] }) {
  let clock = Date.parse("2026-08-23T12:00:00Z");
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
      payload: unknown;
    } = { mode: null, filters: [], payload: null };

    const execSelect = () => applyFilters(tables[table], st.filters);

    const exec = (): Promise<{ data: unknown; error: null }> => {
      if (st.mode === "select") return Promise.resolve({ data: execSelect(), error: null });
      if (st.mode === "insert") {
        const rows = Array.isArray(st.payload) ? st.payload : [st.payload];
        for (const r of rows as Row[])
          tables[table].push({ created_at: new Date(clock++).toISOString(), ...r });
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
      update: (p: unknown) => ((st.mode = "update"), (st.payload = p), api),
      eq: (c: string, v: unknown) => (st.filters.push([c, v]), api),
      maybeSingle: () => Promise.resolve({ data: execSelect()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: execSelect()[0] ?? null, error: null }),
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => exec().then(onF, onR),
    };
    return api;
  }

  return { from: (t: string) => builder(t), tables };
}

const evRefundProcessedFull = {
  entity: "event",
  event: "refund.processed",
  payload: {
    refund: { entity: { id: "rfnd_1", payment_id: "pay_CAP1", amount: 25100, status: "processed" } },
    payment: { entity: { id: "pay_CAP1", amount: 25100, amount_refunded: 25100, refund_status: "full" } },
  },
};
const evRefundProcessedPartial = {
  entity: "event",
  event: "refund.processed",
  payload: {
    refund: { entity: { id: "rfnd_2", payment_id: "pay_CAP1", amount: 5000, status: "processed" } },
    payment: { entity: { id: "pay_CAP1", amount: 25100, amount_refunded: 5000, refund_status: "partial" } },
  },
};
const evRefundFailed = {
  entity: "event",
  event: "refund.failed",
  payload: {
    refund: { entity: { id: "rfnd_3", payment_id: "pay_CAP1", amount: 25100, status: "failed" } },
    payment: { entity: { id: "pay_CAP1", amount: 25100, refund_status: null } },
  },
};
const evRefundCreated = {
  entity: "event",
  event: "refund.created",
  payload: {
    refund: { entity: { id: "rfnd_4", payment_id: "pay_CAP1", amount: 25100, status: "pending" } },
    payment: { entity: { id: "pay_CAP1", amount: 25100 } },
  },
};

// — Scenario A: full refund flips status to 'refunded' —
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_1", status: "active" }],
    payments: [
      { id: "P1", subscription_id: "S1", razorpay_payment_id: "pay_CAP1", amount_paise: 25100, status: "captured" },
    ],
  });
  const res = await processRefundEvent(db as never, evRefundProcessedFull);
  const p = db.tables.payments[0];
  check("A: full refund → handled, action refund_processed", res.handled && res.action === "refund_processed");
  check("A: payment status → refunded", p.status === "refunded");
  check("A: refund_status → full", p.refund_status === "full");
  check("A: refund_amount_paise recorded", p.refund_amount_paise === 25100);
  check("A: razorpay_refund_id recorded", p.razorpay_refund_id === "rfnd_1");
  check("A: subscription status untouched by refund", db.tables.subscriptions[0].status === "active");
  check(
    "A: audit row written (system actor, entity=payments)",
    db.tables.audit_logs[0]?.admin_id === null && db.tables.audit_logs[0]?.entity === "payments",
  );
}

// — Scenario B: partial refund keeps 'captured', records partial fields —
{
  const db = makeMockDb({
    payments: [
      { id: "P1", subscription_id: "S1", razorpay_payment_id: "pay_CAP1", amount_paise: 25100, status: "captured" },
    ],
  });
  const res = await processRefundEvent(db as never, evRefundProcessedPartial);
  const p = db.tables.payments[0];
  check("B: handled, action refund_processed", res.handled && res.action === "refund_processed");
  check("B: status stays captured (NOT refunded)", p.status === "captured");
  check("B: refund_status → partial", p.refund_status === "partial");
  check("B: refund_amount_paise is THIS refund only (5000)", p.refund_amount_paise === 5000);
}

// — Scenario C: refund.failed → no payment mutation, still audited —
{
  const db = makeMockDb({
    payments: [
      { id: "P1", subscription_id: "S1", razorpay_payment_id: "pay_CAP1", amount_paise: 25100, status: "captured" },
    ],
  });
  const res = await processRefundEvent(db as never, evRefundFailed);
  const p = db.tables.payments[0];
  check("C: handled, action refund_failed", res.handled && res.action === "refund_failed");
  check("C: payment status untouched (still captured)", p.status === "captured");
  check("C: no refund fields written", p.refund_status === undefined && p.razorpay_refund_id === undefined);
  check("C: audit row still written", db.tables.audit_logs.length === 1);
}

// — Scenario D: refund.created → no mutation, audited only —
{
  const db = makeMockDb({
    payments: [
      { id: "P1", subscription_id: "S1", razorpay_payment_id: "pay_CAP1", amount_paise: 25100, status: "captured" },
    ],
  });
  const res = await processRefundEvent(db as never, evRefundCreated);
  check("D: handled, action refund_created", res.handled && res.action === "refund_created");
  check("D: payment status untouched", db.tables.payments[0].status === "captured");
  check("D: audit row written", db.tables.audit_logs.length === 1);
}

// — Scenario E: unknown payment id → ack + audit, no throw (never 5xx-worthy) —
{
  const db = makeMockDb({ payments: [] });
  const res = await processRefundEvent(db as never, evRefundProcessedFull);
  check("E: unknown payment → ignored_unknown_payment", !res.handled && res.action === "ignored_unknown_payment");
  check("E: still audited", db.tables.audit_logs.length === 1);
}

// — Scenario F: unsupported refund-ish event → ignored, no throw —
{
  const db = makeMockDb({
    payments: [
      { id: "P1", subscription_id: "S1", razorpay_payment_id: "pay_CAP1", amount_paise: 25100, status: "captured" },
    ],
  });
  const res = await processRefundEvent(db as never, {
    event: "refund.something_new",
    payload: { refund: { entity: { id: "x", payment_id: "pay_CAP1" } } },
  });
  check("F: unsupported event ignored", !res.handled && res.action === "ignored_unsupported_event");
  check("F: no side effects", db.tables.payments[0].status === "captured" && db.tables.audit_logs.length === 0);
}

// — Scenario G: replay of the same refund.processed is idempotent (converges, no dup rows) —
{
  const db = makeMockDb({
    payments: [
      { id: "P1", subscription_id: "S1", razorpay_payment_id: "pay_CAP1", amount_paise: 25100, status: "captured" },
    ],
  });
  await processRefundEvent(db as never, evRefundProcessedFull);
  await processRefundEvent(db as never, evRefundProcessedFull); // replay
  check("G: still exactly one payment row", db.tables.payments.length === 1);
  check("G: status still refunded after replay", db.tables.payments[0].status === "refunded");
}

// — Scenario H: dispatch via the main entrypoint (processWebhookEvent) routes refund.* correctly —
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_1", status: "active" }],
    payments: [
      { id: "P1", subscription_id: "S1", razorpay_payment_id: "pay_CAP1", amount_paise: 25100, status: "captured" },
    ],
  });
  const res = await processWebhookEvent(db as never, evRefundProcessedFull);
  check(
    "H: processWebhookEvent dispatches refund.processed correctly",
    res.handled && res.action === "refund_processed",
  );
  check("H: dispatch path also flips status → refunded", db.tables.payments[0].status === "refunded");
  check(
    "H: dispatch path does not touch subscriptions table at all",
    db.tables.subscriptions[0].status === "active",
  );
}

// — Scenario I: a subscription.* event is unaffected by the new refund dispatch —
{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_1", status: "pending" }],
  });
  const res = await processWebhookEvent(db as never, {
    event: "subscription.activated",
    payload: { subscription: { entity: { id: "sub_1", start_at: 1785887400 } } },
  });
  check("I: subscription events still dispatch through the original path", res.action === "activated");
  check("I: subscription actually activated", db.tables.subscriptions[0].status === "active");
}

// ─────────────────────────────────────────────────────────────
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
