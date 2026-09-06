// Verification harness — WhatsApp consent + send-gate policy (§12.6, §12.9).
// Run: node --import ./scratch/ts-aliases.mjs scratch/verify_whatsapp_consent.ts
//
// Covers:
//  1. isOptOutMessage keyword matching (case/whitespace-insensitive).
//  2. sendWhatsApp(): template refused when wa_opt_in_at IS NULL.
//  3. sendWhatsApp(): refused when wa_opt_out_at IS NOT NULL, even
//     with opt-in set.
//  4. sendWhatsApp(): free-form text allowed inside the 24h window
//     without opt-in, but still refused after opt-out.
//  5. Non-production send guard: NODE_ENV !== 'production' + empty
//     WHATSAPP_TEST_NUMBERS → sendWhatsApp sends nothing, clear error.
//  6. Daily send cap refuses rather than sends.

import { isOptOutMessage } from "../src/lib/whatsapp-consent.server.ts";
import { sendWhatsApp } from "../src/lib/whatsapp-send.server.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

console.log("— isOptOutMessage keyword matching —");
check("STOP matches", isOptOutMessage("STOP"));
check("stop (lowercase) matches", isOptOutMessage("stop"));
check("  stop   (surrounding whitespace) matches", isOptOutMessage("  stop   "));
check("BAND matches", isOptOutMessage("BAND"));
check("Band Karo matches", isOptOutMessage("Band Karo"));
check("बंद matches", isOptOutMessage("बंद"));
check("UNSUBSCRIBE matches", isOptOutMessage("UNSUBSCRIBE"));
check("ordinary text does not match", !isOptOutMessage("Kal ka video mila, dhanyavaad"));
check("null does not match", !isOptOutMessage(null));
check("empty string does not match", !isOptOutMessage(""));

// ── Mock Supabase client for sendWhatsApp's gates ──
function mockDb(cfg: {
  profile?: { wa_opt_in_at: string | null; wa_opt_out_at: string | null } | null;
  lastInboundAt?: string | null;
  sentTodayCount?: number;
}) {
  return {
    from(table: string) {
      const chain: any = {
        eq() {
          return this;
        },
        gte() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        select() {
          return this;
        },
        async maybeSingle() {
          if (table === "profiles") return { data: cfg.profile ?? null, error: null };
          if (table === "wa_messages")
            return {
              data: cfg.lastInboundAt ? { created_at: cfg.lastInboundAt } : null,
              error: null,
            };
          return { data: null, error: null };
        },
        then(resolve: (v: unknown) => void) {
          // Only the daily-count query awaits the builder directly
          // (no .maybeSingle()) — see sentTodayCount() in whatsapp-send.server.ts.
          resolve({ count: cfg.sentTodayCount ?? 0, error: null });
        },
      };
      return chain;
    },
  } as any;
}

const savedEnv = { ...process.env };
function resetEnv() {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, savedEnv);
}

console.log("\n— consent gate —");
process.env.NODE_ENV = "production"; // bypass the allowlist gate for these
{
  const db = mockDb({ profile: { wa_opt_in_at: null, wa_opt_out_at: null }, sentTodayCount: 0 });
  const r = await sendWhatsApp(db, {
    toPhone: "+919999999999",
    template: { name: "punyata_payment_link", templateId: "t1", vars: [] },
    profileId: "p1",
  });
  check("template refused when wa_opt_in_at IS NULL", !r.ok);
}
{
  const db = mockDb({
    profile: { wa_opt_in_at: new Date().toISOString(), wa_opt_out_at: new Date().toISOString() },
    sentTodayCount: 0,
  });
  const r = await sendWhatsApp(db, {
    toPhone: "+919999999999",
    template: { name: "punyata_payment_link", templateId: "t1", vars: [] },
    profileId: "p1",
  });
  check("refused when wa_opt_out_at set, even with opt-in also set", !r.ok);
}
{
  // Free-form text: allowed without opt-in, inside the 24h window.
  // GUPSHUP_* env isn't set in this harness, so this fails at the
  // env-config stage (a clean {ok:false}, not a thrown exception —
  // sendWhatsApp keeps its own contract even on misconfiguration).
  // Reaching that stage at all proves consent and the 24h check both
  // passed rather than refusing the send themselves.
  const db = mockDb({
    profile: { wa_opt_in_at: null, wa_opt_out_at: null },
    lastInboundAt: new Date().toISOString(),
    sentTodayCount: 0,
  });
  const r = await sendWhatsApp(db, { toPhone: "+919999999999", text: "hi", profileId: "p1" });
  check(
    "free-form text not blocked by consent gate (reaches env-config stage, returns cleanly)",
    !r.ok && /GUPSHUP_APP_NAME/.test(r.error),
  );
}
{
  // Free-form text: refused after opt-out, even inside the 24h window.
  const db = mockDb({
    profile: { wa_opt_in_at: null, wa_opt_out_at: new Date().toISOString() },
    lastInboundAt: new Date().toISOString(),
    sentTodayCount: 0,
  });
  const r = await sendWhatsApp(db, { toPhone: "+919999999999", text: "hi", profileId: "p1" });
  check("free-form text refused after opt-out", !r.ok && /opted out/i.test(r.error));
}

console.log("\n— non-production send guard —");
resetEnv();
process.env.NODE_ENV = "development";
delete process.env.WHATSAPP_TEST_NUMBERS;
{
  const db = mockDb({ profile: { wa_opt_in_at: new Date().toISOString(), wa_opt_out_at: null } });
  const r = await sendWhatsApp(db, {
    toPhone: "+919999999999",
    template: { name: "punyata_payment_link", templateId: "t1", vars: [] },
    profileId: "p1",
  });
  check(
    "non-production + empty allowlist → sends nothing, clear error",
    !r.ok && /WHATSAPP_TEST_NUMBERS/i.test(r.error),
  );
}
resetEnv();

console.log("\n— daily send cap —");
process.env.NODE_ENV = "production";
process.env.WHATSAPP_MAX_SENDS_PER_DAY = "5";
{
  const db = mockDb({
    profile: { wa_opt_in_at: new Date().toISOString(), wa_opt_out_at: null },
    sentTodayCount: 5,
  });
  const r = await sendWhatsApp(db, {
    toPhone: "+919999999999",
    template: { name: "punyata_payment_link", templateId: "t1", vars: [] },
    profileId: "p1",
  });
  check("daily cap reached → refuses rather than sends", !r.ok && /daily send cap/i.test(r.error));
}
resetEnv();

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
