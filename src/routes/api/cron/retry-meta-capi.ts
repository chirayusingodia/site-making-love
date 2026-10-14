import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";
import { timingSafeEqual } from "node:crypto";
import { json, getServiceClient } from "@/lib/supabase-admin.server";
import { retryPendingSubscribeConversions } from "@/lib/meta-capi-subscribe.server";

// POST (or GET) /api/cron/retry-meta-capi
//
// Meta Conversions API retry sweep. The Razorpay webhook makes ONE ≤2s
// attempt to report a self-serve first payment; anything it could not
// deliver (Meta outage, timeout, crash mid-send) is resent here, so
// delivery never depends on a later webhook arriving. Also retires events
// past Meta's 7-day window and scrubs stored client IPs after 30 days.
//
// Auth: CRON_SECRET as `Authorization: Bearer <secret>` or
// `x-cron-secret` — identical gate to send-notifications.ts. Without the
// env var the route refuses to run.
//
// Schedule (external scheduler, same place as the other cron routes):
// every 5–10 minutes. Inert (returns zeros) when META_PIXEL_ID /
// META_CAPI_ACCESS_TOKEN are unset.

const MAX_PER_RUN = 50;

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

  try {
    const result = await retryPendingSubscribeConversions(getServiceClient(), {
      limit: MAX_PER_RUN,
    });
    return json(result);
  } catch (err) {
    console.error("retry-meta-capi sweep failed:", err);
    return json({ error: err instanceof Error ? err.message : "sweep failed" }, 500);
  }
}

export const Route = createFileRoute("/api/cron/retry-meta-capi")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
