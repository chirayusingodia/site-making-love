// Verification harness — notifications worker (§12.3).
// Run: node --import ./scratch/ts-aliases.mjs scratch/verify_notifications_worker.ts
//
// Covers recipient resolution order (to_phone → delivery_phone →
// profiles.phone → error, never silent skip) — the pure decision
// resolveNotificationRecipient() makes, mocked against a minimal
// Supabase-shaped client so no live DB is needed.

import { resolveNotificationRecipient } from "../src/lib/notifications-worker.server.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

function mockDb(opts: { subscriptionPhone?: string | null; profilePhone?: string | null }) {
  return {
    from(table: string) {
      const chain: any = {
        _eq: {} as Record<string, unknown>,
        eq(col: string, val: unknown) {
          this._eq[col] = val;
          return this;
        },
        select() {
          return this;
        },
        async maybeSingle() {
          if (table === "subscriptions") {
            return {
              data:
                opts.subscriptionPhone !== undefined
                  ? { delivery_phone: opts.subscriptionPhone }
                  : null,
              error: null,
            };
          }
          if (table === "profiles") {
            return {
              data: opts.profilePhone !== undefined ? { phone: opts.profilePhone } : null,
              error: null,
            };
          }
          return { data: null, error: null };
        },
      };
      return chain;
    },
  } as any;
}

const base = { id: "n1", user_id: "u1", attempts: 0, template_name: "t", template_vars: null };

{
  const db = mockDb({});
  const r = await resolveNotificationRecipient(db, {
    ...base,
    to_phone: "+919999999999",
    meta: null,
  });
  check("to_phone wins when set", "phone" in r && r.phone === "+919999999999");
}
{
  const db = mockDb({ subscriptionPhone: "+918888888888" });
  const r = await resolveNotificationRecipient(db, {
    ...base,
    to_phone: null,
    meta: { subscription_db_id: "sub-1" },
  });
  check("falls back to subscriptions.delivery_phone", "phone" in r && r.phone === "+918888888888");
}
{
  const db = mockDb({ subscriptionPhone: null, profilePhone: "+917777777777" });
  const r = await resolveNotificationRecipient(db, {
    ...base,
    to_phone: null,
    meta: { subscription_db_id: "sub-1" },
  });
  check(
    "falls back to profiles.phone when delivery_phone is null",
    "phone" in r && r.phone === "+917777777777",
  );
}
{
  const db = mockDb({ profilePhone: null });
  const r = await resolveNotificationRecipient(db, { ...base, to_phone: null, meta: null });
  check("nothing resolves → explicit error, never silent skip", "error" in r);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
