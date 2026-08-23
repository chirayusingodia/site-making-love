import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { loadPerformanceData } from "@/lib/performance-data.server";
import { formatRate, rankAgents, MIN_LEADS_FOR_RANKING } from "@/lib/performance-logic";

// GET|POST /api/admin/performance/agents?from=&to=
// OWNER only. See telecallers.ts for the shared gating/range pattern.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function handle(request: Request) {
  const gate = await requireOwner(request);
  if (!gate.ok) return json({ error: gate.error }, gate.status);
  const { db } = gate.auth;

  const url = new URL(request.url);
  let body: { from?: unknown; to?: unknown } = {};
  try {
    if (request.method === "POST") body = await request.json();
  } catch {
    /* optional */
  }
  const nowIstDate = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const from =
    (typeof body.from === "string" && DATE_RE.test(body.from) ? body.from : null) ??
    url.searchParams.get("from") ??
    `${nowIstDate.slice(0, 7)}-01`;
  const to =
    (typeof body.to === "string" && DATE_RE.test(body.to) ? body.to : null) ??
    url.searchParams.get("to") ??
    nowIstDate;
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return json({ error: "from/to must be YYYY-MM-DD" }, 400);
  }

  try {
    const ds = await loadPerformanceData(db, from, to);
    const rows = rankAgents(ds).map((r) => ({
      ...r,
      leadQualityRateText: formatRate(r.leadQualityRate),
    }));
    return json({
      ok: true,
      range: ds.range,
      truncatedTables: ds.truncatedTables,
      minLeadsForRanking: MIN_LEADS_FOR_RANKING,
      rows,
    });
  } catch (err) {
    console.error("performance/agents error:", err);
    return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
  }
}

export const Route = createFileRoute("/api/admin/performance/agents")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
