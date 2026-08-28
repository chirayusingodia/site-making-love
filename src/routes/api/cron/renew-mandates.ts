import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";
import { timingSafeEqual } from "node:crypto";
import { json, getServiceClient } from "@/lib/supabase-admin.server";
import {
  RENEWAL_LOOKAHEAD_DAYS,
  findMandatesDueForRenewal,
  startMandateRenewal,
} from "@/lib/mandates.server";

// POST (or GET) /api/cron/renew-mandates
//
// THE RENEWAL SWEEP — the job that makes "runs until cancelled" true.
//
// A subscription is permanent; the mandate collecting money for it is
// not (RBI/NPCI require a fixed debit count, and gateways cap how far
// into the calendar one may reach). This sweep raises a REPLACEMENT
// mandate before the incumbent runs out, so no subscriber ever hits a
// cliff — the same job a card-network processor does invisibly with an
// account updater, made explicit because UPI Autopay requires the
// payer's consent for a new mandate and therefore cannot be silent.
//
// WHAT IT DOES NOT DO: it never swaps the mandate itself. The
// replacement is raised dormant and PROMOTED only once its own webhook
// confirms money moved through it (razorpay-webhook.server.ts). Until
// then the old mandate keeps charging, so a customer who ignores the
// renewal request keeps their sewa uninterrupted for the whole
// lookahead window.
//
// Idempotent: findMandatesDueForRenewal() skips anything already
// carrying renewal_started_at, so re-running it (or overlapping runs)
// cannot raise two replacements for one mandate.
//
// Auth: CRON_SECRET as `Authorization: Bearer <secret>` or
// `x-cron-secret`. Without the env var the route refuses to run at all
// rather than exposing an unauthenticated money-adjacent endpoint.
//
// Schedule: daily is ample — with a 50-year tenure and a 90-day
// lookahead, this normally finds nothing at all. That is the point: it
// is a safety net, not a hot path.

/** Cap per invocation so one run cannot fan out into hundreds of
 *  gateway calls and blow the function's time budget. Anything not
 *  reached today is picked up by tomorrow's run — the lookahead window
 *  is months wide, so falling behind by a day costs nothing. */
const MAX_RENEWALS_PER_RUN = 25;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  const provided = bearer ?? request.headers.get("x-cron-secret");
  if (!provided) return false;

  // Constant-time — same discipline as the webhook signature check.
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(request: Request): Promise<Response> {
  if (!process.env.CRON_SECRET) {
    return json({ error: "CRON_SECRET not configured" }, 500);
  }
  if (!isAuthorized(request)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const db = getServiceClient();

  let due;
  try {
    due = await findMandatesDueForRenewal(db, MAX_RENEWALS_PER_RUN);
  } catch (err) {
    console.error("renew-mandates sweep failed:", err);
    return json({ error: err instanceof Error ? err.message : "sweep failed" }, 500);
  }

  const results: {
    subscriptionId: string;
    mandateId: string;
    reason: string;
    ok: boolean;
    error?: string;
  }[] = [];

  for (const candidate of due) {
    // Sequential on purpose: these are gateway writes against a shared
    // rate limit, and a renewal that fails is retried tomorrow anyway.
    // Parallelising would trade a slower-but-safe sweep for a faster
    // one that can trip the very circuit breaker protecting checkout.
    const outcome = await startMandateRenewal(db, candidate);
    results.push({
      subscriptionId: candidate.subscriptionId,
      mandateId: candidate.mandate.id,
      reason: candidate.reason,
      ok: outcome.ok,
      ...(outcome.ok ? {} : { error: outcome.error }),
    });
  }

  const renewed = results.filter((r) => r.ok).length;
  const failed = results.length - renewed;

  // A sweep that found work is worth a permanent record even when it
  // all succeeded — this is the audit trail for money-adjacent
  // automation nobody watches day to day.
  if (results.length > 0) {
    try {
      await db.from("audit_logs").insert({
        admin_id: null,
        action: "cron.renew_mandates",
        entity: "subscription_mandates",
        entity_id: null,
        meta: {
          lookahead_days: RENEWAL_LOOKAHEAD_DAYS,
          examined: due.length,
          renewed,
          failed,
          results,
        },
      });
    } catch (err) {
      console.error("renew-mandates audit insert failed:", err);
    }
  }

  return json({
    ok: true,
    lookaheadDays: RENEWAL_LOOKAHEAD_DAYS,
    examined: due.length,
    renewed,
    failed,
    results,
  });
}

export const Route = createFileRoute("/api/cron/renew-mandates")({
  server: {
    handlers: {
      // GET is supported because most schedulers (Vercel Cron included)
      // issue plain GETs. Both paths run the identical authorised sweep.
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
