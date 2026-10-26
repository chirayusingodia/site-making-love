import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";
import { timingSafeEqual } from "node:crypto";
import { json, getServiceClient } from "@/lib/supabase-admin.server";
import { lapseCutoff, todayIST } from "@/lib/offline-subscriptions-logic";

// POST (or GET) /api/cron/offline-dues
//
// THE OFFLINE LAPSE SWEEP. An offline (QR) subscriber who hasn't paid
// within OFFLINE_GRACE_DAYS (7) of their due date moves to `halted`,
// which drops them out of Sankalp batches automatically
// (generate-batch only reads status='active'). Recording a payment
// brings them back to `active` (record_offline_payment).
//
// Idempotent: lapse_overdue_offline_subscriptions only touches rows
// that are still `active`, so a second run matches zero rows and
// reports { lapsed: 0 }. The RPC writes one audit row per lapse
// (admin_id NULL = the system).
//
// Auth: CRON_SECRET as `Authorization: Bearer <secret>` or
// `x-cron-secret`; without the env var the route refuses to run.
// Schedule: .github/workflows/offline-dues.yml, daily 09:15 IST (after
// renew-mandates).

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

  const cutoff = lapseCutoff(todayIST(new Date()));
  try {
    const db = getServiceClient();
    const { data, error } = await db.rpc("lapse_overdue_offline_subscriptions", {
      p_cutoff: cutoff,
    });
    if (error) throw new Error(error.message);
    const lapsed = Array.isArray(data) ? data.length : 0;
    return json({ ok: true, lapsed, cutoff });
  } catch (err) {
    console.error("offline-dues sweep failed:", err);
    return json({ error: err instanceof Error ? err.message : "sweep failed" }, 500);
  }
}

export const Route = createFileRoute("/api/cron/offline-dues")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
