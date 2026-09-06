import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";
import { timingSafeEqual } from "node:crypto";
import { json, getServiceClient } from "@/lib/supabase-admin.server";
import { processNotificationBatch } from "@/lib/notifications-worker.server";

// POST (or GET) /api/cron/send-notifications
//
// THE NOTIFICATIONS SWEEP — §6.2/§10.3 of
// SESSION_WHATSAPP_FUNNEL_PROMPT.md. `notifications` has been
// write-only since it was created (two known insert sites became
// four during this session's own recheck — see the migration/session
// summary); this is the first reader. Modelled exactly on
// renew-mandates.ts: same CRON_SECRET gate, same small-batch cap so
// one run can't blow the function's time budget, same "log and move
// on" per-row error handling.
//
// Auth: CRON_SECRET as `Authorization: Bearer <secret>` or
// `x-cron-secret`. Without the env var the route refuses to run.
//
// Schedule: every few minutes is reasonable — a telecaller's payment
// link should reach the customer within a minute or two of her click,
// not on a daily sweep.

const MAX_NOTIFICATIONS_PER_RUN = 50;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  const provided = bearer ?? request.headers.get("x-cron-secret");
  if (!provided) return false;

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
  try {
    const result = await processNotificationBatch(db, MAX_NOTIFICATIONS_PER_RUN);
    return json(result);
  } catch (err) {
    console.error("send-notifications sweep failed:", err);
    return json({ error: err instanceof Error ? err.message : "sweep failed" }, 500);
  }
}

export const Route = createFileRoute("/api/cron/send-notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
