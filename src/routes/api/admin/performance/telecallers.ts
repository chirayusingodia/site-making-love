import { createFileRoute } from "@tanstack/react-router";
import { json, requireOwner } from "@/lib/supabase-admin.server";
import { loadPerformanceData } from "@/lib/performance-data.server";
import { formatRate, rankTelecallers, MIN_LEADS_FOR_RANKING } from "@/lib/performance-logic";

// GET /api/admin/performance/telecallers?from=YYYY-MM-DD&to=YYYY-MM-DD
// Auth: OWNER only (financial + everyone's earnings — §6.1).
// POST is accepted too so the shared callAdminApi helper works.
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
  // Default: current IST month.
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
    const rows = rankTelecallers(ds).map((r) => ({
      ...r,
      contactRateText: formatRate(r.contactRate),
      freePoojaToPaidRateText: formatRate(r.freePoojaToPaidRate),
      conversionRateText: formatRate(r.conversionRate),
      minLeadsForRanking: MIN_LEADS_FOR_RANKING,
    }));
    return json({
      ok: true,
      range: ds.range,
      truncatedTables: ds.truncatedTables,
      minLeadsForRanking: MIN_LEADS_FOR_RANKING,
      rows,
    });
  } catch (err) {
    console.error("performance/telecallers error:", err);
    return json({ error: err instanceof Error ? err.message : "Query failed" }, 500);
  }
}

export const Route = createFileRoute("/api/admin/performance/telecallers")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
