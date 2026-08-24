import { createFileRoute } from "@tanstack/react-router";
import { json, requireTelecaller, writeTelecallerAudit } from "@/lib/supabase-admin.server";
import { isInCallersTray } from "@/lib/telecaller-data.server";
import {
  isCallOutcome,
  isTelecallerQueueKey,
  LOG_CALL_DAILY_LIMIT,
  outcomeAutoEscalates,
  stripMaskedFieldsDeep,
} from "@/lib/telecaller-logic";

// POST /api/telecaller/log-call
// Gate: requireTelecaller.
// Body: {
//   subscription_id?, profile_id?, lead_id?,
//   queue?, outcome, notes?,
//   callback_at?,            // REQUIRED iff outcome='callback_requested'
//   identity_verified?,      // §5.1 gate tick
//   escalate?,               // §5.6 owner-escalation flag
//   free_pooja_given?,       // §5 Hospitals session — stamps leads.free_pooja_at/by ONCE
//   named_agent_id?          // §5 Hospitals session — "kaunse agent ne diya?" answer, stamped once
// }
//
// THE disposition log. Every call ends here — an unlogged call is
// an invisible call. Same request also stamps
// profiles.last_called_at (the denormalised cooldown field) and,
// for the do_not_call outcome, sets profiles.do_not_call=true —
// which removes the person from EVERY queue permanently; only the
// owner may clear it. status of subscriptions is NEVER written by
// this endpoint or any telecaller endpoint: 'active' is
// webhook-only, pause/cancel are escalation-only (§5.6).
//
// C2 hardening (REVIEW_TELECALLER_SESSION.md): call_logs is the
// commission key, so this endpoint is triple-gated —
//   1. TRAY CHECK: the target must be in the caller's own tray
//      (assigned/created lead, prior log of hers, or shared
//      subscriber pipeline) — arbitrary uuids rejected;
//   2. RATE LIMIT: LOG_CALL_DAILY_LIMIT per caller per IST day;
//   3. do_not_call REQUIRES identity_verified=true (a DND latch is a
//      profile mutation; an unverified tick cannot flip it).
//
// Free pooja / named agent are LEAD attributes, not call outcomes
// (the outcome enum stays untouched) — they ride on this already-
// gated endpoint and stamp idempotently: first write wins, repeats
// are no-ops.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/telecaller/log-call")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireTelecaller(request);
        if (!auth) return json({ error: "Auth required" }, 401);

        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        if (!isCallOutcome(body.outcome)) return json({ error: "Outcome chunein" }, 400);
        const outcome = body.outcome;
        if (!isTelecallerQueueKey(body.queue) && body.queue !== undefined && body.queue !== null) {
          return json({ error: "Unknown queue" }, 400);
        }

        let callbackAt: string | null = null;
        if (typeof body.callback_at === "string" && body.callback_at.trim()) {
          callbackAt = body.callback_at.trim();
        }
        // Mirror the table CHECKs before hitting Postgres.
        if (outcome === "callback_requested" && !callbackAt) {
          return json({ error: "Callback ki date/time zaroori hai" }, 400);
        }
        if (outcome !== "callback_requested" && callbackAt) {
          return json({ error: "Callback time sirf callback outcome ke saath" }, 400);
        }

        const subscriptionId =
          typeof body.subscription_id === "string" && UUID_RE.test(body.subscription_id)
            ? body.subscription_id
            : null;
        const leadId =
          typeof body.lead_id === "string" && UUID_RE.test(body.lead_id) ? body.lead_id : null;
        let profileId =
          typeof body.profile_id === "string" && UUID_RE.test(body.profile_id)
            ? body.profile_id
            : null;
        if (!subscriptionId && !profileId && !leadId) {
          return json({ error: "subscription_id, profile_id ya lead_id zaroori hai" }, 400);
        }

        try {
          // ── C2 gate 1: tray check (fail-closed) ─────────────────
          const inTray = await isInCallersTray(auth.db, auth.callerId, auth.role !== "telecaller", {
            subscriptionId,
            profileId,
            leadId,
          });
          if (!inTray) {
            return json({ error: "Yeh person aapki tray mein nahi hai" }, 403);
          }

          // ── C2 gate 2: daily rate limit ─────────────────────────
          // [Pass-2 P10 + residual fix] "per caller per IST day" is
          // enforced ATOMICALLY by log_call_limited() (migration 019
          // §6): per-caller advisory xact lock → count this IST day →
          // insert, all inside one transaction. The old count-then-
          // insert let two concurrent requests both read "under
          // limit" and both land, blowing past the cap. The check now
          // runs after tray/DND/target resolution so failed lookups
          // never burn quota slots.

          // ── C2 gate 3: DND latch needs the identity tick ────────
          if (outcome === "do_not_call" && body.identity_verified !== true) {
            return json({ error: "DND set karne se pehle identity verify karna zaroori hai" }, 400);
          }

          if (!profileId && subscriptionId) {
            const { data: sub, error } = await auth.db
              .from("subscriptions")
              .select("user_id")
              .eq("id", subscriptionId)
              .maybeSingle();
            if (error) return json({ error: error.message }, 500);
            if (!sub) return json({ error: "Subscription not found" }, 404);
            profileId = sub.user_id;
          } else if (!profileId && leadId) {
            // Lead may not have met a customer yet — her profile link
            // is set on first contact; until then the log rides on
            // lead_id alone.
            const { data: lead, error } = await auth.db
              .from("leads")
              .select("profile_id")
              .eq("id", leadId)
              .maybeSingle();
            if (error) return json({ error: error.message }, 500);
            if (lead?.profile_id) profileId = lead.profile_id;
          }

          const escalated = outcomeAutoEscalates(outcome) || body.escalate === true;

          // Atomic quota check + insert (C2 gate 2, migration 019 §6).
          const { data: claim, error: claimErr } = await auth.db.rpc("log_call_limited", {
            p_called_by: auth.callerId,
            p_subscription_id: subscriptionId,
            p_lead_id: leadId,
            p_profile_id: profileId,
            p_queue: typeof body.queue === "string" ? body.queue : null,
            p_outcome: outcome,
            p_notes:
              typeof body.notes === "string" && body.notes.trim()
                ? body.notes.trim().slice(0, 2000)
                : null,
            p_callback_at: callbackAt,
            p_identity_verified: body.identity_verified === true,
            p_escalated: escalated,
            p_daily_limit: LOG_CALL_DAILY_LIMIT,
          });
          if (claimErr) {
            return json({ error: claimErr.message }, 500);
          }
          if (!claim?.ok) {
            return json(
              { error: `Aaj ki call-logging limit poori ho gayi (${LOG_CALL_DAILY_LIMIT})` },
              429,
            );
          }
          const inserted = { id: claim.call_log_id as string };

          // Denormalised last-contact stamp + DND latch, same request
          // (only when we know whose profile it is).
          let beforeRow: { do_not_call: boolean; last_called_at: string | null } | null = null;
          if (profileId) {
            const { data } = await auth.db
              .from("profiles")
              .select("do_not_call,last_called_at")
              .eq("id", profileId)
              .maybeSingle();
            beforeRow = data ?? null;
            const nowIso = new Date().toISOString();
            const { error: profErr } = await auth.db
              .from("profiles")
              .update({
                last_called_at: nowIso,
                ...(outcome === "do_not_call" ? { do_not_call: true } : {}),
              })
              .eq("id", profileId);
            if (profErr) return json({ error: profErr.message }, 500);
          }

          // ── §5 Hospitals session: funnel events on the LEAD ──────
          // §3 (REVIEW_HOSPITALS_SESSION.md): each field gets its OWN
          // guarded UPDATE. The previous single statement ANDed both
          // idempotency guards (free_pooja_at IS NULL AND named_agent_id
          // IS NULL), so when one field was already set, the OTHER
          // silently never saved — mark pooja on call 1, name the agent
          // on call 2 with the toggle still on, and the agent answer
          // vanished. First-write-wins semantics preserved per field.
          let freePoojaStamped = false;
          let namedAgentStamped = false;
          if (leadId && (body.free_pooja_given === true || body.named_agent_id)) {
            const nowIso = new Date().toISOString();
            const poojaRequested = body.free_pooja_given === true;
            const namedAgentRequested =
              typeof body.named_agent_id === "string" && UUID_RE.test(body.named_agent_id);

            if (poojaRequested) {
              const poojaUpdate = await auth.db
                .from("leads")
                .update({
                  free_pooja_at: nowIso,
                  free_pooja_by: auth.callerId,
                  updated_at: nowIso,
                })
                .eq("id", leadId)
                .is("free_pooja_at", null) // first write wins
                .select("free_pooja_at")
                .maybeSingle();
              if (poojaUpdate.error) return json({ error: poojaUpdate.error.message }, 500);
              freePoojaStamped = Boolean(
                (poojaUpdate.data as { free_pooja_at: string | null } | null)?.free_pooja_at,
              );
            }

            if (namedAgentRequested) {
              // [Pass-2 P14] the agent must EXIST and be active — a
              // well-formed but unknown uuid used to sail through to a
              // raw FK-violation 500 mid-call (or, for an inactive
              // agent, silently stamp misattributed funnel data).
              const { data: namedAgent } = await auth.db
                .from("sales_agents")
                .select("id,is_active")
                .eq("id", body.named_agent_id as string)
                .maybeSingle();
              if (!namedAgent || !namedAgent.is_active) {
                return json({ error: "Named agent nahi mila ya inactive hai" }, 400);
              }
              const agentUpdate = await auth.db
                .from("leads")
                .update({
                  named_agent_id: body.named_agent_id as string,
                  updated_at: nowIso,
                })
                .eq("id", leadId)
                .is("named_agent_id", null) // first answer wins
                .select("named_agent_id")
                .maybeSingle();
              if (agentUpdate.error) return json({ error: agentUpdate.error.message }, 500);
              namedAgentStamped = Boolean(
                (agentUpdate.data as { named_agent_id: string | null } | null)?.named_agent_id,
              );
            }
          }

          await writeTelecallerAudit(
            auth.db,
            auth.callerId,
            "telecaller.call.logged",
            "call_logs",
            inserted.id as string,
            {
              outcome,
              queue: body.queue ?? null,
              callback_at: callbackAt,
              identity_verified: body.identity_verified === true,
              escalated,
              free_pooja_given: body.free_pooja_given === true,
              free_pooja_stamped_now: freePoojaStamped,
              named_agent_id: typeof body.named_agent_id === "string" ? body.named_agent_id : null,
              named_agent_stamped_now: namedAgentStamped,
              profile_before: beforeRow,
              profile_after: profileId
                ? {
                    do_not_call:
                      outcome === "do_not_call" ? true : (beforeRow?.do_not_call ?? false),
                  }
                : null,
            },
          );

          return json(
            stripMaskedFieldsDeep({
              ok: true,
              callLogId: inserted.id,
              freePoojaStamped,
              namedAgentStamped,
            }),
          );
        } catch (err) {
          console.error("telecaller/log-call error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
