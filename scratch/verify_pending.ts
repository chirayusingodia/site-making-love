// Sanity checks — subscription.pending audit-only handling (2026-08-23).
// Run: node --import ./scratch/ts-aliases.mjs scratch/verify_pending.ts
// Mirrors verify_halted.ts's style.
import {
  processWebhookEvent,
  SUPPORTED_EVENTS,
  subscriptionPatchForEvent,
  type WebhookContext,
} from "../src/lib/razorpay-webhook.server.ts";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}`);
  if (!cond) failures++;
}

const ctx = (event: string): WebhookContext => ({
  event,
  razorpaySubId: "sub_TEST1",
  subscription: { id: "sub_TEST1", status: "pending" },
  payment: null,
});
const now = new Date("2026-08-23T10:00:00.000Z").toISOString();

check(
  "subscription.pending is in SUPPORTED_EVENTS (not silently ignored)",
  (SUPPORTED_EVENTS as readonly string[]).includes("subscription.pending"),
);

check(
  "subscriptionPatchForEvent returns null for subscription.pending (deliberate no-op)",
  subscriptionPatchForEvent("subscription.pending", ctx("subscription.pending"), now) === null,
);

// End-to-end: an ACTIVE subscription receiving Razorpay's own first-failure
// 'pending' signal must NOT be demoted — that stays gated on our own
// 3-consecutive-failure buffer (subscription.payment.failed path), not this.
interface Row {
  [k: string]: unknown;
}
function makeMockDb(seed: { subscriptions?: Row[] }) {
  let clock = Date.parse("2026-08-23T10:00:00Z");
  const tables: Record<string, Row[]> = {
    subscriptions: (seed.subscriptions ?? []).map((r) => ({ ...r })),
    payments: [],
    audit_logs: [],
  };
  const applyFilters = (rows: Row[], filters: [string, unknown][]) =>
    rows.filter((r) => filters.every(([c, v]) => r[c] === v));
  function builder(table: string) {
    const st: { mode: string | null; filters: [string, unknown][]; payload: unknown } = {
      mode: null,
      filters: [],
      payload: null,
    };
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
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => exec().then(onF, onR),
    };
    return api;
  }
  return { from: (t: string) => builder(t), tables };
}

{
  const db = makeMockDb({
    subscriptions: [{ id: "S1", razorpay_sub_id: "sub_REAL1", status: "active" }],
  });
  const res = await processWebhookEvent(db as never, {
    event: "subscription.pending",
    payload: { subscription: { entity: { id: "sub_REAL1", status: "pending" } } },
  });
  check(
    "subscription.pending → handled, but action is skipped_no_change",
    res.handled && res.action === "skipped_no_change",
  );
  check(
    "subscription.pending → subscriptions.status STAYS active (buffer preserved)",
    db.tables.subscriptions[0].status === "active",
  );
  check("subscription.pending → still audited (visible, not dropped)", db.tables.audit_logs.length === 1);
  check(
    "audit row records Razorpay's reported status alongside ours",
    db.tables.audit_logs[0]?.action === "razorpay.subscription.pending" &&
      (db.tables.audit_logs[0]?.meta as Row)?.previous_status === "active",
  );
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
