import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { isPayoutMethod } from "@/lib/telecaller-payroll-logic";

// POST /api/admin/commissions/pay          (OWNER ONLY)
// Body: { profileId, period, expectedPaise, method, referenceNo?, note? }
//
// Records "I paid this telecaller for this month" atomically (RPC
// pay_telecaller_period, migration 043). expectedPaise is the figure
// the owner saw; if the ledger moved since, the RPC raises `stale`.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const Route = createFileRoute("/api/admin/commissions/pay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);
        const { db, staffId } = gate.auth;

        let b: Record<string, unknown>;
        try {
          b = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const profileId = typeof b.profileId === "string" && UUID_RE.test(b.profileId) ? b.profileId : "";
        const period = typeof b.period === "string" && PERIOD_RE.test(b.period) ? b.period : "";
        const expected =
          typeof b.expectedPaise === "number" && Number.isInteger(b.expectedPaise) && b.expectedPaise > 0
            ? b.expectedPaise
            : 0;
        if (!profileId || !period || !expected) {
          return json({ error: "profileId, period aur expectedPaise zaroori hain" }, 400);
        }
        if (!isPayoutMethod(b.method)) return json({ error: "Payment method chuniye" }, 400);
        const referenceNo = typeof b.referenceNo === "string" ? b.referenceNo.trim().slice(0, 120) : "";
        const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) : "";

        try {
          const { data, error } = await db.rpc("pay_telecaller_period", {
            p_profile: profileId,
            p_period: period,
            p_expected_paise: expected,
            p_method: b.method,
            p_reference: referenceNo,
            p_note: note,
            p_paid_by: staffId,
          });
          if (error) {
            const msg = error.message ?? "";
            if (msg.includes("period_locked"))
              return json({ error: "Yeh month locked hai — pehle unlock karke pay kijiye." }, 409);
            if (msg.includes("nothing_payable"))
              return json({ error: "Is month mein abhi payable amount nahi hai." }, 409);
            if (msg.includes("stale"))
              return json({ error: "Amount badal gaya hai — page refresh karke dobara dekhiye." }, 409);
            console.error("commissions/pay rpc error:", error);
            return json({ error: msg }, 500);
          }
          await writeTelecallerAudit(db, staffId, "admin.commissions.telecaller_paid", "telecaller_payouts", String(data), {
            profileId,
            period,
            amountPaise: expected,
            method: b.method,
            referenceNo: referenceNo || null,
          });
          return json({ ok: true, payoutId: data });
        } catch (err) {
          console.error("commissions/pay error:", err);
          return json({ error: err instanceof Error ? err.message : "Pay failed" }, 500);
        }
      },
    },
  },
});
