// Verification harness — Meta CAPI: hashing, event ids, context validation,
// eligibility matrix, webhook single-attempt path, cron retry/stale-claim/
// retire/IP-scrub, concurrency, inert-when-unconfigured.
// Run: npm run test:meta-capi
//   (= node --import ./scratch/ts-aliases.mjs scratch/verify_meta_capi.ts)

import process from "node:process";
import { createHash } from "node:crypto";
import {
  buildMetaEvent,
  hashPhone,
  metaPhoneDigits,
  sendMetaEvent,
} from "../src/lib/meta-capi.server.ts";
import { buildFbc, CONVERSION_EVENT_NAME, subscribeEventId } from "../src/lib/meta-ids.ts";
import { sanitizeMarketingContext, clientIpFromHeaders } from "../src/lib/meta-capi-context.ts";
import {
  evaluateEligibility,
  META_CAPI_MAX_ATTEMPTS,
  META_CAPI_STALE_CLAIM_MS,
  reportSubscribeConversion,
  retryPendingSubscribeConversions,
  sendSubscribeConversion,
} from "../src/lib/meta-capi-subscribe.server.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const NOCTX = { clientIp: null, headerUserAgent: null };

for (const k of ["META_PIXEL_ID", "META_CAPI_ACCESS_TOKEN", "META_CAPI_TEST_EVENT_CODE", "WHATSAPP_TEST_NUMBERS"]) {
  delete process.env[k];
}

// ─────────────────────────────────────────────────────────────
console.log("\n— phone hashing —");
const a = await hashPhone("8005828548");
const b = await hashPhone("+918005828548");
const c = await hashPhone("918005828548");
check("3 phone formats hash identically", !!a && a === b && b === c);
check("hash = sha256('918005828548') (digits, country code, no +)", a === sha("918005828548"));
check("junk phone → null", (await hashPhone("12345")) === null);
check("metaPhoneDigits has no '+'", metaPhoneDigits("+918005828548") === "918005828548");

console.log("\n— event payload —");
const ev = (await buildMetaEvent({
  eventName: "Purchase",
  eventId: "subscribe_abc",
  eventTime: 1700000000,
  user: {
    phone: "8005828548",
    email: "  Foo@Bar.COM ",
    firstName: " Ram ",
    externalId: "UID-1",
    fbp: "fb.1.1.2",
    fbc: "fb.1.1.xyz",
    clientIp: "1.2.3.4",
    clientUserAgent: "UA",
  },
  custom: { value: 251, currency: "INR" },
})) as { user_data: Record<string, unknown>; event_id: string; action_source: string };
check("email trimmed+lowercased before hash", (ev.user_data.em as string[])[0] === sha("foo@bar.com"));
check("name trimmed+lowercased", (ev.user_data.fn as string[])[0] === sha("ram"));
check("external_id hashed", (ev.user_data.external_id as string[])[0] === sha("uid-1"));
check(
  "fbp/fbc/ip/ua sent RAW",
  ev.user_data.fbp === "fb.1.1.2" &&
    ev.user_data.fbc === "fb.1.1.xyz" &&
    ev.user_data.client_ip_address === "1.2.3.4" &&
    ev.user_data.client_user_agent === "UA",
);
check("action_source website + event_id kept", ev.action_source === "website" && ev.event_id === "subscribe_abc");

console.log("\n— ids —");
check("event id deterministic", subscribeEventId("S1") === subscribeEventId("S1") && subscribeEventId("S1") === "subscribe_S1");
check("fbc construction", buildFbc("ABC", 1700000000000) === "fb.1.1700000000000.ABC");
check("conversion event name is one shared constant", CONVERSION_EVENT_NAME === "Purchase");

console.log("\n— context validation —");
const hdr = new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1", "user-agent": "HdrUA" });
check("IP from headers (first XFF hop)", clientIpFromHeaders(hdr) === "9.9.9.9");
check(
  "cf-connecting-ip wins",
  clientIpFromHeaders(new Headers({ "cf-connecting-ip": "7.7.7.7", "x-forwarded-for": "9.9.9.9" })) === "7.7.7.7",
);
const ctx = sanitizeMarketingContext(
  {
    consent: "granted",
    fbp: "fb.1.1.2",
    fbc: "fb.1.1.abc",
    client_ip: "6.6.6.6",
    eventSourceUrl: "https://www.punyata.com/x",
    userAgent: "BodyUA",
    evil: "x".repeat(9999),
  },
  { clientIp: "9.9.9.9", headerUserAgent: "HdrUA" },
);
check("body client_ip ignored; header IP used", ctx.client_ip === "9.9.9.9");
check("unknown keys dropped", !("evil" in ctx));
check("header UA preferred over body UA", ctx.client_user_agent === "HdrUA");
const noConsent = sanitizeMarketingContext({ fbp: "fb.1.1.2", fbc: "fb.1.1.abc" }, NOCTX);
check("no consent → fbp/fbc dropped", !noConsent.fbp && !noConsent.fbc && noConsent.consent === "unset");
check("malformed fbp rejected", !sanitizeMarketingContext({ consent: "granted", fbp: "<script>" }, NOCTX).fbp);
check("non-http source url rejected", !sanitizeMarketingContext({ eventSourceUrl: "javascript:1" }, NOCTX).event_source_url);

// ─────────────────────────────────────────────────────────────
console.log("\n— eligibility matrix —");
const okCtx = { consent: "granted" as const, client_user_agent: "UA" };
const base = {
  role: "user",
  phone: "8005828548",
  telecallerId: null,
  salesAgentId: null,
  acquisitionChannel: "facebook_ads",
  context: okCtx,
  testNumbers: [] as string[],
};
check("self-serve web checkout eligible", evaluateEligibility(base) === null);
check("telecaller_id set → not self-serve", evaluateEligibility({ ...base, telecallerId: "T" }) === "skipped_not_self_serve");
check("sales_agent_id set → not self-serve", evaluateEligibility({ ...base, salesAgentId: "A" }) === "skipped_not_self_serve");
check("acquisition_channel 'telecall' → not self-serve", evaluateEligibility({ ...base, acquisitionChannel: "telecall" }) === "skipped_not_self_serve");
check("no client_user_agent → not self-serve", evaluateEligibility({ ...base, context: { consent: "granted" } }) === "skipped_not_self_serve");
check("null context → not self-serve", evaluateEligibility({ ...base, context: null }) === "skipped_not_self_serve");
check("admin role skipped", evaluateEligibility({ ...base, role: "admin" }) === "skipped_staff_or_test");
check("telecaller role skipped", evaluateEligibility({ ...base, role: "telecaller" }) === "skipped_staff_or_test");
check("internal test number skipped", evaluateEligibility({ ...base, testNumbers: ["+918005828548"] }) === "skipped_staff_or_test");
check("consent declined skipped", evaluateEligibility({ ...base, context: { ...okCtx, consent: "declined" } }) === "skipped_consent_declined");
check("consent unset still eligible (server-side transactional)", evaluateEligibility({ ...base, context: { ...okCtx, consent: "unset" } }) === null);

// ─────────────────────────────────────────────────────────────
console.log("\n— inert when unconfigured —");
let fetched = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  fetched++;
  return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
}) as typeof fetch;
const skipped = await sendMetaEvent({ eventName: "Purchase", eventId: "x", eventTime: 1, user: {} });
check("env missing → {skipped:true}, no fetch, no throw", "skipped" in skipped && fetched === 0);
let dbTouched = 0;
const spyDb = {
  from: () => {
    dbTouched++;
    throw new Error("db must not be touched");
  },
} as never;
const nowSec = () => Math.floor(Date.now() / 1000);
const wh = { subscriptionId: "S1", userId: "U1", amountPaise: 25100, paidCount: 1, paymentTimeUnix: nowSec() };
check("webhook hook inert w/o env: no DB access", (await reportSubscribeConversion(spyDb, wh)) === "skipped_not_configured" && dbTouched === 0);
const sweepInert = await retryPendingSubscribeConversions(spyDb);
check("cron inert w/o env: no DB access, zero counts", dbTouched === 0 && sweepInert.scanned === 0);

// ─────────────────────────────────────────────────────────────
// Minimal in-memory Supabase mock that REALLY evaluates filters, so the
// claim compare-and-set is exercised, not assumed.
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function makeDb(tables: Record<string, Row[]>) {
  const get = (r: Row, col: string) => {
    if (col.includes("->>")) {
      const [c, k] = col.split("->>");
      return (r[c] ?? {})[k];
    }
    return r[col];
  };
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let upd: Row | null = null;
      let lim = Infinity;
      let ord: { c: string; asc: boolean } | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {};
      q.select = () => q;
      q.update = (v: Row) => ((upd = v), q);
      q.eq = (c: string, v: unknown) => (filters.push((r) => get(r, c) === v), q);
      q.is = (c: string, v: unknown) => (filters.push((r) => (get(r, c) ?? null) === v), q);
      q.lt = (c: string, v: unknown) => (filters.push((r) => get(r, c) != null && (get(r, c) as number) < (v as number)), q);
      q.not = (c: string, _op: string, v: unknown) => (filters.push((r) => (get(r, c) ?? null) !== v), q);
      q.order = (c: string, o?: { ascending?: boolean }) => ((ord = { c, asc: o?.ascending !== false }), q);
      q.limit = (n: number) => ((lim = n), q);
      const run = (): Row[] => {
        let rows = tables[table].filter((r) => filters.every((f) => f(r)));
        if (ord) {
          const { c, asc } = ord;
          rows = [...rows].sort((x, y) => (get(x, c) > get(y, c) ? 1 : -1) * (asc ? 1 : -1));
        }
        rows = rows.slice(0, lim);
        if (upd) rows.forEach((r) => Object.assign(r, upd));
        return rows;
      };
      q.maybeSingle = async () => ({ data: run()[0] ?? null, error: null });
      q.then = (res: (v: unknown) => unknown) => res({ data: run(), error: null });
      return q;
    },
  };
}

function world(over: { sub?: Row; profile?: Row; payments?: Row[] } = {}) {
  const sub: Row = {
    id: "S1",
    user_id: "U1",
    status: "active",
    plan_id: "P1",
    created_at: new Date().toISOString(),
    fbclid: "FBCLID",
    telecaller_id: null,
    sales_agent_id: null,
    acquisition_channel: "facebook_ads",
    marketing_context: { consent: "granted", fbp: "fb.1.1.2", client_ip: "1.1.1.1", client_user_agent: "UA" },
    meta_capi_claimed_at: null,
    meta_capi_sent_at: null,
    meta_capi_attempts: 0,
    ...over.sub,
  };
  const profile: Row = { id: "U1", full_name: "Ram Kumar", phone: "8005828548", email: "r@x.com", role: "user", ...over.profile };
  const payments: Row[] = over.payments ?? [
    { subscription_id: "S1", status: "captured", amount_paise: 25100, paid_at: new Date().toISOString() },
  ];
  const tables = { subscriptions: [sub], profiles: [profile], payments };
  return { db: makeDb(tables) as never, sub, tables };
}

process.env.META_PIXEL_ID = "123";
process.env.META_CAPI_ACCESS_TOKEN = "tok_secret";
process.env.META_CAPI_TEST_EVENT_CODE = "TEST999";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lastBody: any = null;
let respond: () => Response = () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
globalThis.fetch = (async (_url: string, init: { body: string }) => {
  fetched++;
  lastBody = JSON.parse(init.body);
  return respond();
}) as unknown as typeof fetch;

console.log("\n— webhook path (one attempt) —");
{
  const w = world();
  fetched = 0;
  const o1 = await reportSubscribeConversion(w.db, wh);
  check("first delivery sends", o1 === "sent" && fetched === 1);
  check("event name = shared constant, id = subscribe_<subId>", lastBody.data[0].event_name === CONVERSION_EVENT_NAME && lastBody.data[0].event_id === subscribeEventId("S1"));
  check("value in rupees from charged amount", lastBody.data[0].custom_data.value === 251 && lastBody.data[0].custom_data.currency === "INR");
  check("test_event_code included", lastBody.test_event_code === "TEST999");
  check("fbc rebuilt from fbclid when missing", String(lastBody.data[0].user_data.fbc).endsWith(".FBCLID"));
  check("client_ip + UA were sent", lastBody.data[0].user_data.client_ip_address === "1.1.1.1" && lastBody.data[0].user_data.client_user_agent === "UA");
  check("sent_at set only after confirmation", !!w.sub.meta_capi_sent_at && w.sub.meta_capi_attempts === 1);
  check("client_ip nulled after confirmed send", !("client_ip" in w.sub.marketing_context) && w.sub.marketing_context.client_user_agent === "UA");
  const o2 = await reportSubscribeConversion(w.db, wh);
  check("redelivered webhook sends NOTHING", o2 === "skipped_already_sent" && fetched === 1);
}
{
  fetched = 0;
  check("renewal (paid_count 2) not sent", (await reportSubscribeConversion(world().db, { ...wh, paidCount: 2 })) === "skipped_not_first_payment" && fetched === 0);
  check("zero amount not sent", (await reportSubscribeConversion(world().db, { ...wh, amountPaise: 0 })) === "skipped_no_amount");
  check("payment older than 6 days not sent", (await reportSubscribeConversion(world().db, { ...wh, paymentTimeUnix: nowSec() - 7 * 86400 })) === "skipped_too_old" && fetched === 0);
  check("telecaller sale not sent", (await reportSubscribeConversion(world({ sub: { telecaller_id: "T" } }).db, wh)) === "skipped_not_self_serve" && fetched === 0);
  check("agent sale not sent", (await reportSubscribeConversion(world({ sub: { sales_agent_id: "A" } }).db, wh)) === "skipped_not_self_serve");
  check("channel 'telecall' not sent", (await reportSubscribeConversion(world({ sub: { acquisition_channel: "telecall" } }).db, wh)) === "skipped_not_self_serve");
  check("no UA (whatsapp/admin-created checkout) not sent", (await reportSubscribeConversion(world({ sub: { marketing_context: { consent: "granted" } } }).db, wh)) === "skipped_not_self_serve");
  check("admin account not sent", (await reportSubscribeConversion(world({ profile: { role: "admin" } }).db, wh)) === "skipped_staff_or_test" && fetched === 0);
  process.env.WHATSAPP_TEST_NUMBERS = "+918005828548";
  check("internal test number not sent", (await reportSubscribeConversion(world().db, wh)) === "skipped_staff_or_test" && fetched === 0);
  delete process.env.WHATSAPP_TEST_NUMBERS;
}
{
  // Meta down: webhook makes exactly ONE attempt and never throws.
  respond = () => new Response("{}", { status: 500 });
  const w = world();
  fetched = 0;
  const o = await reportSubscribeConversion(w.db, wh);
  check("Meta 500 → send_failed after exactly ONE attempt", o === "send_failed" && fetched === 1);
  check("failed send does NOT set sent_at (event not lost)", w.sub.meta_capi_sent_at === null);
  check("failed send frees the claim for the cron", w.sub.meta_capi_claimed_at === null && w.sub.meta_capi_attempts === 1);
  check("IP kept after failure (needed for retry)", w.sub.marketing_context.client_ip === "1.1.1.1");
  respond = () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
}

console.log("\n— claim concurrency & stale claims —");
{
  const w = world();
  fetched = 0;
  const [r1, r2] = await Promise.all([
    sendSubscribeConversion(w.db, { ...wh, sendAttempts: 1, timeoutMs: 2000 }),
    sendSubscribeConversion(w.db, { ...wh, sendAttempts: 1, timeoutMs: 2000 }),
  ]);
  check("two racing deliveries → exactly one send", fetched === 1 && [r1, r2].filter((r) => r === "sent").length === 1);
}
{
  const w = world({ sub: { meta_capi_claimed_at: new Date(Date.now() - 60_000).toISOString(), meta_capi_attempts: 1 } });
  fetched = 0;
  check("fresh claim (1 min old) blocks a second sender", (await reportSubscribeConversion(w.db, wh)) === "skipped_claim_in_flight" && fetched === 0);
}
{
  const w = world({ sub: { meta_capi_claimed_at: new Date(Date.now() - META_CAPI_STALE_CLAIM_MS - 1000).toISOString(), meta_capi_attempts: 1 } });
  fetched = 0;
  const o = await reportSubscribeConversion(w.db, wh);
  check("stale claim (crashed worker) is taken over and sent", o === "sent" && fetched === 1 && w.sub.meta_capi_attempts === 2);
}
{
  const w = world({ sub: { meta_capi_attempts: META_CAPI_MAX_ATTEMPTS } });
  fetched = 0;
  check("attempt cap reached → no more sends", (await reportSubscribeConversion(w.db, wh)) === "skipped_max_attempts" && fetched === 0);
}

console.log("\n— cron sweep —");
{
  // Failed earlier (claim freed) → cron resends with up to 2 attempts.
  const w = world({ sub: { meta_capi_attempts: 1 } });
  respond = () => new Response("{}", { status: 503 });
  fetched = 0;
  const res1 = await retryPendingSubscribeConversions(w.db);
  check("cron makes 2 attempts per run while Meta is down", fetched === 2 && res1.failed === 1 && w.sub.meta_capi_sent_at === null);
  respond = () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  fetched = 0;
  const res2 = await retryPendingSubscribeConversions(w.db);
  check("cron delivers once Meta recovers — no later webhook needed", res2.sent === 1 && fetched === 1 && !!w.sub.meta_capi_sent_at);
  check("cron uses the FIRST captured payment's time and amount", lastBody.data[0].custom_data.value === 251);
  fetched = 0;
  const res3 = await retryPendingSubscribeConversions(w.db);
  check("confirmed rows are not rescanned/resent", res3.scanned === 0 && fetched === 0);
}
{
  const w = world({ sub: { telecaller_id: "T" } });
  fetched = 0;
  const r = await retryPendingSubscribeConversions(w.db);
  check("cron ignores telecaller-sourced rows", r.scanned === 0 && fetched === 0);
  const w2 = world({ sub: { marketing_context: { consent: "granted" } } });
  const r2 = await retryPendingSubscribeConversions(w2.db);
  check("cron ignores rows with no recorded user agent", r2.scanned === 0 && fetched === 0);
  const w3 = world({ sub: { status: "pending" } });
  check("cron ignores non-active subscriptions", (await retryPendingSubscribeConversions(w3.db)).scanned === 0);
}
{
  const old = new Date(Date.now() - 7 * 86400_000).toISOString();
  const w = world({ payments: [{ subscription_id: "S1", status: "captured", amount_paise: 25100, paid_at: old }] });
  fetched = 0;
  const r = await retryPendingSubscribeConversions(w.db);
  check("first payment past Meta's window → retired, not sent", r.retired === 1 && fetched === 0 && w.sub.meta_capi_attempts === META_CAPI_MAX_ATTEMPTS);
  check("retired row is not rescanned", (await retryPendingSubscribeConversions(w.db)).scanned === 0);
}
{
  const w = world({
    sub: {
      created_at: new Date(Date.now() - 31 * 86400_000).toISOString(),
      meta_capi_attempts: META_CAPI_MAX_ATTEMPTS,
    },
  });
  const r = await retryPendingSubscribeConversions(w.db);
  check("client_ip scrubbed from rows older than 30 days", r.ipsScrubbed === 1 && !("client_ip" in w.sub.marketing_context) && w.sub.marketing_context.client_user_agent === "UA");
  const fresh = world();
  check("client_ip kept on rows younger than 30 days", (await retryPendingSubscribeConversions(fresh.db)).ipsScrubbed === 0);
}

console.log("\n— payload the webhook sends (token redacted) —");
const dump = await buildMetaEvent({
  eventName: CONVERSION_EVENT_NAME,
  eventId: subscribeEventId("<SUBSCRIPTION_ID>"),
  eventTime: 1700000000,
  eventSourceUrl: "https://www.punyata.com/subscription-success",
  user: { phone: "8005828548", externalId: "<USER_ID>", fbp: "fb.1.x.y", fbc: "fb.1.x.z", clientIp: "<IP>", clientUserAgent: "<UA>" },
  custom: { value: 251, currency: "INR" },
});
console.log(
  `curl -X POST 'https://graph.facebook.com/v21.0/<META_PIXEL_ID>/events?access_token=<REDACTED>' -H 'content-type: application/json' -d '${JSON.stringify({ data: [dump], test_event_code: "<META_CAPI_TEST_EVENT_CODE>" })}'`,
);

globalThis.fetch = realFetch;
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
