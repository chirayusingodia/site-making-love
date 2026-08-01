// Shared Sales Agents masking logic (Session 6.5 two-tier roles).
// Pure functions — used by /api/admin/sales-agents/list and
// unit-tested in scratch/.
//
// TASK 6 CONTEXT (flagged for Chirayu's review): the Sales Agents
// Manager UI (Session 5) does NOT exist yet — commission_percent is
// not rendered anywhere in the product today. This module + the
// endpoint exist so that when the Manager UI lands it MUST go
// through the role-shaped endpoint and can never leak commission
// or payout figures to an admin-role caller.
//
// ADMIN sees (operational agent management): full_name, phone,
//   agent_code, is_active, created_at, attributed subscription
//   COUNT. Masked: commission_percent (and thereby any computed
//   payout ₹ figure).
// OWNER sees all columns.

export const AGENT_MASKED_FIELDS = ["commission_percent"] as const;

export type AgentMaskedField = (typeof AGENT_MASKED_FIELDS)[number];

export interface SalesAgentRow {
  id: string;
  full_name: string;
  phone: string | null;
  agent_code: string;
  commission_percent: number | null;
  is_active: boolean;
  created_at: string;
  /** Operational referral count — visible to BOTH roles */
  subscriptionCount: number;
}

export interface SalesAgentsListResponse {
  viewerRole: "admin" | "owner";
  maskedFields: AgentMaskedField[];
  rows: SalesAgentRow[];
}

export function maskAgentRowForRole(row: SalesAgentRow, role: "admin" | "owner"): SalesAgentRow {
  if (role === "owner") return row;
  return { ...row, commission_percent: null };
}

export function maskAgentRowsForRole(
  rows: SalesAgentRow[],
  role: "admin" | "owner",
): SalesAgentRow[] {
  return role === "owner" ? rows : rows.map((r) => maskAgentRowForRole(r, role));
}
