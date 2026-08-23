// Fixed fixtures for verify_performance.ts.
// Structural shapes mirror performance-logic.ts exactly.

import type { PerfDataset } from "../src/lib/performance-logic.ts";

export const TC_STAR = "tc-star";
export const TC_WEAK = "tc-weak";
export const AGENT_A = "agent-a";
export const HOSP_1 = "hosp-1";
export const SUB_YEARLY = "sub-yearly";
export const SUB_MONTHLY = "sub-monthly";
export const SUB_X0 = "sub-x0";

/**
 * Range: Aug 2026 IST.
 *  - STAR: 20 assigned leads (fair-sample floor met), 5 conversions
 *    (incl. ONE YEARLY plan), poojas hers, contact calls on all leads
 *    except L19 (no_answer) so contact rate = 19/20.
 *  - WEAK: 3 assigned leads (insufficient data), only no_answer sweeps
 *    (which must NOT count as contact).
 * Money: yearly Rs 4101 captured 10 Aug; monthly first payment captured
 * 11 Aug then subscription cancelled 20 Aug (money you keep counts);
 * one FAILED payment that must never count as revenue.
 */
export function buildDataset(): PerfDataset {
  return {
    telecallers: [
      { id: TC_STAR, name: "Sita (star)" },
      { id: TC_WEAK, name: "Mini (new)" },
    ],
    agents: [{ id: AGENT_A, name: "Ramesh (field)" }],
    hospitals: [{ id: HOSP_1, name: "Pushkar SJM Hospital" }],
    range: { from: "2026-08-01", to: "2026-08-31" },

    leads: [
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `L${i}`,
        assignedTo: TC_STAR,
        sourceAgentId: AGENT_A,
        hospitalId: HOSP_1,
        freePoojaBy: TC_STAR,
        // §2 (REVIEW): L5 sits at link_sent WITHOUT converting — the
        // funnel gap linksSent exists to expose. Converted leads carry
        // status='converted'; the rest are still 'new'.
        status: i < 5 ? "converted" : i === 5 ? "link_sent" : "new",
        createdAt: `2026-08-01T04:30:00Z`,
        convertedAt: i < 5 ? `2026-08-${String(10 + i).padStart(2, "0")}T05:00:00Z` : null,
        subscriptionId: i === 0 ? SUB_YEARLY : i === 1 ? SUB_MONTHLY : i < 5 ? SUB_X0 : null,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `W${i}`,
        assignedTo: TC_WEAK,
        sourceAgentId: AGENT_A,
        hospitalId: HOSP_1,
        freePoojaBy: null,
        status: "new",
        createdAt: "2026-08-02T04:30:00Z",
        convertedAt: null,
        subscriptionId: null,
      })),
    ],

    calls: [
      // STAR: connected on L0..L18, no_answer on L19 -> 19 contacts / 20.
      ...Array.from({ length: 20 }, (_, i) => ({
        calledBy: TC_STAR,
        leadId: `L${i}`,
        outcome: i === 19 ? "no_answer" : "connected_partial",
        createdAt: "2026-08-03T06:00:00Z",
      })),
      // WEAK: pure no_answer sweep - never contact.
      ...Array.from({ length: 3 }, (_, i) => ({
        calledBy: TC_WEAK,
        leadId: `W${i}`,
        outcome: "no_answer",
        createdAt: "2026-08-03T07:00:00Z",
      })),
    ],

    subs: [
      {
        id: SUB_YEARLY,
        telecallerId: TC_STAR,
        salesAgentId: AGENT_A,
        status: "active",
        startDate: "2026-08-10",
        createdAt: "2026-08-10T05:00:00Z",
        pausedAt: null,
        cancelledAt: null,
      },
      {
        id: SUB_MONTHLY,
        telecallerId: TC_STAR,
        salesAgentId: AGENT_A,
        status: "cancelled",
        startDate: "2026-08-11",
        createdAt: "2026-08-11T05:00:00Z",
        pausedAt: null,
        cancelledAt: "2026-08-20T06:00:00Z",
      },
      {
        id: SUB_X0,
        telecallerId: TC_STAR,
        salesAgentId: AGENT_A,
        status: "active",
        startDate: "2026-08-12",
        createdAt: "2026-08-12T05:00:00Z",
        pausedAt: null,
        cancelledAt: null,
      },
    ],

    payments: [
      // Yearly plan: full annual capture on the yearly sub.
      {
        subscriptionId: SUB_YEARLY,
        amountPaise: 410100,
        status: "captured",
        createdAt: "2026-08-10T05:30:00Z",
      },
      // Cancelled monthly: its capture REMAINS revenue (money you kept).
      {
        subscriptionId: SUB_MONTHLY,
        amountPaise: 39900,
        status: "captured",
        createdAt: "2026-08-11T05:30:00Z",
      },
      {
        subscriptionId: SUB_X0,
        amountPaise: 39900,
        status: "captured",
        createdAt: "2026-08-12T05:30:00Z",
      },
      // FAILED money never counts.
      {
        subscriptionId: SUB_MONTHLY,
        amountPaise: 39900,
        status: "failed",
        createdAt: "2026-08-15T05:30:00Z",
      },
      // IST month-boundary case: 1 Sep 00:30 IST = 31 Aug 19:00 UTC.
      // In AUGUST range it must NOT count; a SEPTEMBER range must see it.
      {
        subscriptionId: SUB_YEARLY,
        amountPaise: 39900,
        status: "captured",
        createdAt: "2026-08-31T19:00:00Z",
      },
    ],

    commissions: [
      {
        agentId: null,
        profileId: TC_STAR,
        kind: "first_deal",
        amountPaise: 82020,
        payoutPeriod: "2026-08",
      },
      {
        agentId: AGENT_A,
        profileId: null,
        kind: "first_deal",
        amountPaise: 82020,
        payoutPeriod: "2026-08",
      },
      {
        agentId: AGENT_A,
        profileId: null,
        kind: "trail",
        amountPaise: 342,
        payoutPeriod: "2026-09",
      },
    ],

    allotments: [
      { hospitalId: HOSP_1, agentId: AGENT_A, allottedFrom: "2026-07-01", allottedTo: null },
    ],
  };
}
