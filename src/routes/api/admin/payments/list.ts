import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin } from "@/lib/supabase-admin.server";
import { fetchAllRows } from "@/lib/supabase";
import {
  computePaymentAggregates,
  maskPaymentRowsForRole,
  PAYMENT_MASKED_FIELDS,
  type PaymentListRow,
  type PaymentsListResponse,
} from "@/lib/payments-logic";

// POST /api/admin/payments/list
// Body: {
//   page?: number (0-based, default 0),
//   pageSize?: number (default 50, max 200),
//   all?: boolean (true → full filtered set for CSV export, capped),
//   filters?: { status?, planId?, dateFrom?, dateTo?, search? }
// }
//
// Staff-gated (admin OR owner) — but the response is ROLE-SHAPED:
//   owner → every column incl. amount_paise + both Razorpay IDs
//   admin → amount_paise / razorpay_payment_id / razorpay_order_id
//           nulled SERVER-SIDE before the response is sent, and
//           ₹ aggregate sums withheld (counts only).
// The raw values are never in an admin-role network response.
//
// Filter semantics identical to the old client-side query:
//   status    → payments.status
//   planId    → subscription.plan_id (requires the !inner embed)
//   dateFrom/To → created_at ledger date, IST (paid_at is NULL for
//                 failed rows — filtering paid_at would hide failures)
//   search    → ilike on razorpay_payment_id (support lookup by an
//               ID the customer relays; RESULT still masks the id
//               for admin)

const MAX_PAGE_SIZE = 200;
const EXPORT_CAP = 10000;

const SELECT_COLS = `
  id, subscription_id, razorpay_payment_id, razorpay_order_id,
  amount_paise, status, method, cycle_number, paid_at, failure_reason, created_at,
  subscription:subscriptions!inner(
    id, plan_id,
    plans(name, billing_period)
  )
`;

interface Filters {
  status?: string;
  planId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

// [Pass-2 P11] every filter field is validated BEFORE it can reach a
// PostgREST filter — the old unchecked `body.filters` let garbage like
// dateFrom:"{}" interpolate into `{}T00:00:00+05:30` and surface a raw
// Postgres timestamptz parse error to the client.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_STATUSES = new Set(["captured", "failed", "refunded", "pending"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeFilters(raw: unknown): Filters | null {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: Filters = {};
  if (src.status !== undefined) {
    if (typeof src.status !== "string" || !PAYMENT_STATUSES.has(src.status)) return null;
    out.status = src.status;
  }
  if (src.planId !== undefined) {
    if (typeof src.planId !== "string" || !UUID_RE.test(src.planId)) return null;
    out.planId = src.planId;
  }
  for (const key of ["dateFrom", "dateTo"] as const) {
    const v = src[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string" || !DATE_RE.test(v)) return null;
    // Real calendar date, not just shape.
    const d = new Date(`${v}T00:00:00+05:30`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
    out[key] = v;
  }
  if (src.search !== undefined) {
    if (typeof src.search !== "string") return null;
    out.search = src.search.slice(0, 64);
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, f: Filters): any {
  if (f.status && f.status !== "all") q = q.eq("status", f.status);
  if (f.planId && f.planId !== "all") q = q.eq("subscription.plan_id", f.planId);
  if (f.dateFrom) q = q.gte("created_at", `${f.dateFrom}T00:00:00+05:30`);
  if (f.dateTo) q = q.lte("created_at", `${f.dateTo}T23:59:59.999+05:30`);
  if (f.search && f.search.trim()) q = q.ilike("razorpay_payment_id", `%${f.search.trim()}%`);
  return q;
}

export const Route = createFileRoute("/api/admin/payments/list")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);
        const { role, db } = auth;

        let page = 0;
        let pageSize = 50;
        let all = false;
        let filters: Filters = {};
        try {
          const body = await request.json();
          if (typeof body?.page === "number" && body.page >= 0) page = Math.floor(body.page);
          if (typeof body?.pageSize === "number" && body.pageSize > 0) {
            pageSize = Math.min(MAX_PAGE_SIZE, Math.floor(body.pageSize));
          }
          all = body?.all === true;
          const cleanFilters = sanitizeFilters(body?.filters);
          if (cleanFilters === null) {
            return json({ error: "Invalid filters" }, 400);
          }
          filters = cleanFilters;
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        try {
          let rows: PaymentListRow[];
          let totalCount: number;

          if (all) {
            // CSV export path — full filtered set (capped).
            const res = await fetchAllRows<PaymentListRow>(
              (from, to) =>
                applyFilters(
                  db
                    .from("payments")
                    .select(SELECT_COLS)
                    .order("created_at", { ascending: false })
                    .range(from, to),
                  filters,
                ),
              1000,
            );
            if (res.error) throw new Error(`payments: ${res.error}`);
            rows = res.data.slice(0, EXPORT_CAP) as unknown as PaymentListRow[];
            totalCount = rows.length;
          } else {
            const from = page * pageSize;
            const { data, error, count } = await applyFilters(
              db
                .from("payments")
                .select(SELECT_COLS, { count: "exact" })
                .order("created_at", { ascending: false })
                .range(from, from + pageSize - 1),
              filters,
            );
            if (error) throw new Error(`payments: ${error.message}`);
            rows = (data || []) as unknown as PaymentListRow[];
            totalCount = count ?? 0;
          }

          // Aggregates over the WHOLE filtered set. The !inner embed
          // is required for the subscription.plan_id filter to be
          // accepted by PostgREST.
          const aggRes = await fetchAllRows<{ amount_paise: number | null; status: string }>(
            (a, b) =>
              applyFilters(
                db
                  .from("payments")
                  .select("amount_paise, status, subscription:subscriptions!inner(plan_id)")
                  .range(a, b),
                filters,
              ),
          );
          if (aggRes.error) throw new Error(`payments aggregates: ${aggRes.error}`);

          const response: PaymentsListResponse = {
            viewerRole: role,
            maskedFields: role === "owner" ? [] : [...PAYMENT_MASKED_FIELDS],
            rows: maskPaymentRowsForRole(rows, role),
            totalCount,
            page,
            pageSize,
            aggregates: computePaymentAggregates(aggRes.data, role),
          };
          return json(response);
        } catch (err) {
          console.error("payments/list error:", err);
          return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
        }
      },
    },
  },
});
