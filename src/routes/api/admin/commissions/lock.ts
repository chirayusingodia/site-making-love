import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner, writeTelecallerAudit } from "@/lib/supabase-admin.server";

// POST /api/admin/commissions/lock
// Auth: OWNER only. Body: { period: 'YYYY-MM', lock: boolean, note? }
//
// §10.5 — after locking, no entry in that period may be created,
// edited or reversed; the reconciler refuses locked periods and
// corrections go to the current open period with a note.
const PERIOD_RE = /^\d{4}-\d{2}$/;

export const Route = createFileRoute("/api/admin/commissions/lock")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireOwner(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        let body: { period?: unknown; lock?: unknown; note?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const period =
          typeof body.period === "string" && PERIOD_RE.test(body.period) ? body.period : "";
        if (!period) return json({ error: "period must be YYYY-MM" }, 400);
        const lock = body.lock !== false;

        try {
          if (lock) {
            const { error } = await auth.auth.db.from("commission_payout_periods").upsert(
              {
                period,
                locked_at: new Date().toISOString(),
                locked_by: auth.auth.staffId,
                ...(typeof body.note === "string" ? { note: body.note.slice(0, 500) } : {}),
              },
              { onConflict: "period" },
            );
            if (error) return json({ error: error.message }, 500);
          } else {
            // Re-opening a paid month is exactly how ledgers rot —
            // allow it, but make it loud.
            const { error } = await auth.auth.db
              .from("commission_payout_periods")
              .update({ locked_at: null, locked_by: null })
              .eq("period", period);
            if (error) return json({ error: error.message }, 500);
          }

          await writeTelecallerAudit(
            auth.auth.db,
            auth.auth.staffId,
            lock ? "admin.commissions.locked" : "admin.commissions.unlocked",
            "commission_payout_periods",
            null,
            { period, note: typeof body.note === "string" ? body.note : null },
          );

          return json({ ok: true, period, locked: lock });
        } catch (err) {
          console.error("commissions/lock error:", err);
          return json({ error: err instanceof Error ? err.message : "Lock failed" }, 500);
        }
      },
    },
  },
});
