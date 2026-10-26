import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { normalizePhoneE164 } from "@/lib/phone";
import { validateFamilyMembers } from "@/lib/family-validation";
import {
  computeCoverage,
  dueState,
  mapOfflineRpcError,
  paidAtFromDate,
  parseRecordPaymentBody,
  todayIST,
} from "@/lib/offline-subscriptions-logic";

// POST /api/admin/offline/create        (OWNER ONLY)
// Body: { fullName, phone, planId,
//         family: [{ fullName, gotra?, relation?, slot, dob? }]   // slot 1 = primary
//         payment: { amountPaise, paidOn, monthsCovered, method,
//                    referenceNo?, proofUrl?, notes? } }
//
// Adds an OFFLINE (QR / cash / bank) subscriber as a FULL subscriber.
// A subscription only exists once money has been received, so the first
// payment is mandatory. Ordering:
//   1. validate everything (shared validators — no inline rules here)
//   2. find-or-create the auth user + profiles row for the E.164 phone
//      (same pattern as requestOtpForPhone, but NO OTP is sent — the
//      subscriber can later log in with OTP and land on this profile)
//   3. coverage via computeCoverage(new sub), then ONE atomic RPC
//      (create_offline_subscription) writes subscription + family +
//      payment + details + audit.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/admin/offline/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireOwner(request);
        if (!gate.ok) return json({ error: gate.error }, gate.status);
        const { db, staffId } = gate.auth;

        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const fullName =
          typeof body.fullName === "string" ? body.fullName.trim().slice(0, 120) : "";
        if (fullName.length < 2) return json({ error: "Naam zaroori hai" }, 400);

        const phone = typeof body.phone === "string" ? normalizePhoneE164(body.phone) : null;
        if (!phone) return json({ error: "Sahi Indian mobile number daalein" }, 400);

        const planId =
          typeof body.planId === "string" && UUID_RE.test(body.planId) ? body.planId : null;
        if (!planId) return json({ error: "Plan chunna zaroori hai" }, 400);

        // Family: the existing validator speaks snake_case; slot 1 is the
        // primary member everywhere else in the product.
        const familyIn = Array.isArray(body.family) ? body.family : null;
        if (!familyIn) return json({ error: "Family members zaroori hain" }, 400);
        const mapped = familyIn.map((raw) => {
          const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
          return {
            slot_number: r.slot,
            full_name: r.fullName,
            gotra: r.gotra,
            relation: r.relation,
            dob: r.dob,
          };
        });
        const fam = validateFamilyMembers(mapped);
        if (!fam.ok) return json({ error: fam.error }, 400);
        if (!fam.value.some((m) => m.slot_number === 1)) {
          return json({ error: "Slot 1 (primary member) zaroori hai" }, 400);
        }

        const today = todayIST(new Date());
        const pay = parseRecordPaymentBody(body.payment, today);
        if (!pay.ok) return json({ error: pay.error }, 400);
        const p = pay.value;

        try {
          // ── find-or-create the user for this phone ──
          let userId: string;
          let createdUser = false;
          const { data: existing, error: lookupErr } = await db
            .from("profiles")
            .select("id,role")
            .eq("phone", phone)
            .maybeSingle();
          if (lookupErr) return json({ error: lookupErr.message }, 500);

          if (existing) {
            if (existing.role && existing.role !== "user") {
              return json(
                { error: "Yeh number staff account ka hai — subscriber nahi bana sakte" },
                409,
              );
            }
            userId = existing.id as string;
          } else {
            const { data: created, error: createErr } = await db.auth.admin.createUser({
              phone,
              phone_confirm: false,
              user_metadata: { full_name: fullName },
            });
            if (createErr || !created?.user) {
              const msg = createErr?.message ?? "User create fail";
              if (/already|registered|exists/i.test(msg)) {
                return json(
                  {
                    error:
                      "Is number ka login pehle se hai par profile nahi mili — pehle us bhakt se ek baar OTP login karwayein",
                  },
                  409,
                );
              }
              return json({ error: msg }, 500);
            }
            userId = created.user.id;
            createdUser = true;
            const { error: profErr } = await db
              .from("profiles")
              .insert({ id: userId, full_name: fullName, phone });
            if (profErr) {
              await db.auth.admin.deleteUser(userId);
              return json({ error: `Profile bani nahi: ${profErr.message}` }, 500);
            }
          }

          const coverage = computeCoverage({
            status: null,
            nextBillingDate: null,
            anchorDay: null,
            paidOn: p.paidOn,
            monthsCovered: p.monthsCovered,
          });

          const { data: rpc, error: rpcErr } = await db.rpc("create_offline_subscription", {
            p_user_id: userId,
            p_plan_id: planId,
            p_actor: staffId,
            p_family: fam.value.map((m) => ({
              full_name: m.full_name,
              gotra: m.gotra,
              relation: m.relation,
              slot_number: m.slot_number,
              is_primary: m.slot_number === 1,
              dob: m.dob,
            })),
            p_amount_paise: p.amountPaise,
            p_paid_at: paidAtFromDate(p.paidOn),
            p_method: p.method,
            p_months: p.monthsCovered,
            p_period_start: coverage.periodStart,
            p_period_end: coverage.periodEnd,
            p_anchor_day: coverage.anchorDay,
            p_reference_no: p.referenceNo,
            p_proof_url: p.proofUrl,
            p_notes: p.notes,
          });

          if (rpcErr) {
            // Don't leave a brand-new login behind for a subscription that
            // never got created.
            if (createdUser) {
              await db.from("profiles").delete().eq("id", userId);
              await db.auth.admin.deleteUser(userId);
            }
            const mappedErr = mapOfflineRpcError(rpcErr);
            if (mappedErr.status === 500) console.error("offline/create rpc error:", rpcErr);
            return json({ error: mappedErr.message }, mappedErr.status);
          }

          const out = rpc as {
            subscription_id: string;
            payment_id: string;
            next_billing_date: string;
          };
          return json({
            ok: true,
            userId,
            createdUser,
            subscriptionId: out.subscription_id,
            paymentId: out.payment_id,
            nextBillingDate: out.next_billing_date,
            dueState: dueState({
              status: "active",
              paymentMode: "offline_qr",
              nextBillingDate: out.next_billing_date,
              today,
            }),
          });
        } catch (err) {
          console.error("offline/create error:", err);
          return json({ error: err instanceof Error ? err.message : "Create failed" }, 500);
        }
      },
    },
  },
});
