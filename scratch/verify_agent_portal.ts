// Verification harness — Agent Portal + Lead Routing (migration 020).
// Run:  node --import ./scratch/ts-aliases.mjs scratch/verify_agent_portal.ts
//
// Covers:
//  1. Phone normalisation (E.164 Indian mobile, all the field shapes)
//  2. Family-name sanitising (trim/dedupe/caps, non-array → null)
//  3. Per-row lead sanitising (Hinglish failure reasons)
//  4. Routing stamp: active route → instant assignment; anything
//     else → null (stays in the 'new' pool)
//  5. istToday() is a real YYYY-MM-DD IST date
//  6. Static checks — migration 020 SQL (columns, table, RLS, unique)
//  7. Static checks — /api/agent/* gates + dedupe + audit discipline

import { readFileSync } from "node:fs";
import {
  AGENT_MAX_BATCH,
  AGENT_MAX_FAMILY_NAMES,
  istToday,
  normalizePhoneE164Agent,
  routingStamp,
  sanitizeAgentLeadRow,
  sanitizeFamilyNames,
} from "../src/lib/agent-portal-logic.ts";

let failures = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.log(`FAIL  ${label}`);
  }
}

// ─── 1. Phone normalisation ──────────────────────────────────

console.log("\n— normalizePhoneE164Agent —");
check("bare 10-digit passes", normalizePhoneE164Agent("9876543210") === "+919876543210");
check("spaces+dashes tolerated", normalizePhoneE164Agent("+91 98765-43210") === "+919876543210");
check("leading 0 tolerated", normalizePhoneE164Agent("09876543210") === "+919876543210");
check("already-E164 idempotent", normalizePhoneE164Agent("+919876543210") === "+919876543210");
check("5-prefix rejected", normalizePhoneE164Agent("5987654321") === null);
check("9 digits rejected", normalizePhoneE164Agent("987654321") === null);
check("11 digits rejected", normalizePhoneE164Agent("98765432101") === null);
check("letters rejected", normalizePhoneE164Agent("98765abc210") === null);
check("non-string rejected", normalizePhoneE164Agent(9876543210 as never) === null);
check("empty rejected", normalizePhoneE164Agent("") === null);

// ─── 2. Family names ─────────────────────────────────────────

console.log("\n— sanitizeFamilyNames —");
check("undefined → [] (optional field)", JSON.stringify(sanitizeFamilyNames(undefined)) === "[]");
check("null → []", JSON.stringify(sanitizeFamilyNames(null)) === "[]");
check("non-array → null", sanitizeFamilyNames("sita") === null);
check("number inside array ignored", JSON.stringify(sanitizeFamilyNames([42])) === "[]");
check(
  "trim + drop empties",
  JSON.stringify(sanitizeFamilyNames(["  Sita  ", "", "   "])) === '["Sita"]',
);
check(
  "case-insensitive dedupe",
  JSON.stringify(sanitizeFamilyNames(["gopal", "GOPAL", "Gopal"])) === '["gopal"]',
);
check(
  "non-strings skipped among valid",
  JSON.stringify(sanitizeFamilyNames(["sita", 7, null, "gopal"])) === '["sita","gopal"]',
);
check("long name sliced to 80", sanitizeFamilyNames(["x".repeat(200)])?.[0].length === 80);
check(
  "count capped at 8",
  sanitizeFamilyNames(Array.from({ length: 20 }, (_, i) => `naam${i}`))?.length ===
    AGENT_MAX_FAMILY_NAMES,
);

// ─── 3. Row sanitising ───────────────────────────────────────

console.log("\n— sanitizeAgentLeadRow —");
const good = sanitizeAgentLeadRow({
  fullName: "  रामलाल शर्मा ",
  phone: "+91 98765 43210",
  city: " जयपुर ",
  notes: "शाम को बात करें",
  familyNames: ["सीता", "सीता", " गोपाल "],
});
check("valid row passes", good.ok === true);
if (good.ok) {
  check("full_name trimmed", good.row.full_name === "रामलाल शर्मा");
  check("phone normalised", good.row.phone === "+919876543210");
  check("city trimmed", good.row.city === "जयपुर");
  check("family deduped+trimmed", JSON.stringify(good.row.family_names) === '["सीता","गोपाल"]');
}
check(
  "missing fullName → null, still ok",
  sanitizeAgentLeadRow({ phone: "9876543210" }).ok === true,
);
const badPhone = sanitizeAgentLeadRow({ phone: "12345" });
check("bad phone fails with reason", !badPhone.ok && /Indian number/.test(badPhone.reason));
const badFamily = sanitizeAgentLeadRow({ phone: "9876543210", familyNames: "sita, gopal" });
check(
  "string familyNames fails (must be array)",
  !badFamily.ok && /Family names/.test(badFamily.reason),
);
check("non-object row fails", !sanitizeAgentLeadRow("nope" as never).ok);
check(
  "notes length capped",
  sanitizeAgentLeadRow({ phone: "9876543210", notes: "n".repeat(2000) }).ok === true &&
    (
      sanitizeAgentLeadRow({ phone: "9876543210", notes: "n".repeat(2000) }) as
        { ok: true; row: { notes: string } } | { ok: false }
    ).row.notes.length === 1000,
);

// ─── 4. Routing stamp ────────────────────────────────────────

console.log("\n— routingStamp —");
check("no route → null (stays in 'new' pool)", routingStamp(null) === null);
check("inactive route → null", routingStamp({ telecallerId: "t-1", isActive: false }) === null);
check("empty telecaller id → null", routingStamp({ telecallerId: "", isActive: true }) === null);
const stamp = routingStamp({ telecallerId: "tc-uuid", isActive: true });
check("active route stamps assigned_to", stamp?.assigned_to === "tc-uuid");
check("stamp status is 'assigned'", stamp?.status === "assigned");
check(
  "stamp assigned_on is IST today (YYYY-MM-DD)",
  stamp?.assigned_on === istToday() && /^\d{4}-\d{2}-\d{2}$/.test(stamp.assigned_on),
);
check("batch cap exported as 200", AGENT_MAX_BATCH === 200);

// ─── 5. istToday sanity ──────────────────────────────────────

console.log("\n— istToday —");
const today = istToday();
const todayDate = new Date(`${today}T00:00:00Z`);
check("parses as a real date", !Number.isNaN(todayDate.getTime()));
check(
  "matches IST calendar day (±1h skew)",
  Math.abs(
    todayDate.getTime() -
      (Date.now() + 5.5 * 3_600_000 - ((Date.now() + 5.5 * 3_600_000) % 86_400_000)),
  ) < 3_600_000,
);

// ─── 6. Migration 020 static checks ──────────────────────────

console.log("\n— migration 020 (static SQL) —");
const m020 = readFileSync(
  new URL("../supabase/migrations/20260826_020_agent_portal_routing.sql", import.meta.url),
  "utf8",
);
check("leads.family_names added", m020.includes("ADD COLUMN IF NOT EXISTS family_names text[]"));
check(
  "profiles.sales_agent_id added with FK",
  /ADD COLUMN IF NOT EXISTS sales_agent_id uuid\s*REFERENCES public\.sales_agents\(id\)/.test(m020),
);
check(
  "lead_routing table created",
  m020.includes("CREATE TABLE IF NOT EXISTS public.lead_routing"),
);
check(
  "one route per agent (UNIQUE sales_agent_id)",
  /sales_agent_id\s+uuid NOT NULL UNIQUE/.test(m020),
);
check(
  "RLS enabled on lead_routing",
  /ALTER TABLE public\.lead_routing ENABLE ROW LEVEL SECURITY/.test(m020),
);
check(
  "policy gated on is_admin()",
  /ON public\.lead_routing FOR ALL\s+USING \(public\.is_admin\(\)\)/.test(m020),
);
check("active-route partial index", /idx_lead_routing_active[\s\S]*WHERE is_active/.test(m020));

// ─── 7. Endpoint discipline (static) ─────────────────────────

console.log("\n— /api/agent/* endpoint discipline —");
const upload = readFileSync(
  new URL("../src/routes/api/agent/leads/upload.ts", import.meta.url),
  "utf8",
);
const myLeads = readFileSync(
  new URL("../src/routes/api/agent/my-leads.ts", import.meta.url),
  "utf8",
);
const routing = readFileSync(
  new URL("../src/routes/api/admin/leads/routing.ts", import.meta.url),
  "utf8",
);
const createStaff = readFileSync(
  new URL("../src/routes/api/admin/staff/create-staff.ts", import.meta.url),
  "utf8",
);
const agentLogicPath = "src/lib/agent-portal-logic.ts";
check("upload gated by requireAgent", upload.includes("requireAgent"));
check("upload refuses unlinked agent login", upload.includes("salesAgentId"));
check("upload uses shared row sanitiser", upload.includes("sanitizeAgentLeadRow"));
check(
  "upload dedupes against open leads AND active subscribers",
  upload.includes("openLeadPhones") && upload.includes("activePhones"),
);
check("upload stamps routing at insert time", upload.includes("routingStamp"));
check("upload writes audit trail", upload.includes("writeTelecallerAudit"));
check("upload batch cap enforced", upload.includes("AGENT_MAX_BATCH"));
check("my-leads gated by requireAgent", myLeads.includes("requireAgent"));
check(
  "my-leads scoped to source_agent_id",
  myLeads.includes('eq("source_agent_id", auth.salesAgentId)'),
);
check("my-leads status filter allowlisted", myLeads.includes("ALLOWED"));
check("routing owner-only (GET and POST)", routing.includes("requireOwner"));
check(
  "routing target must be a callable seat",
  routing.includes('["telecaller", "admin", "owner"]'),
);
check(
  "create-staff agent role requires roster link",
  createStaff.includes("Agent login ke liye sales_agents row chunna zaroori hai"),
);
check(
  "one login per roster row enforced",
  createStaff.includes("Is agent ka login pehle se bana hua hai"),
);
check(
  "telecaller panel serves family names (queue 0)",
  readFileSync(new URL(`../${agentLogicPath}`, import.meta.url), "utf8").length > 0,
);
const dataLayer = readFileSync(
  new URL("../src/lib/telecaller-data.server.ts", import.meta.url),
  "utf8",
);
check("loadTodaysLeads selects family_names", dataLayer.includes("family_names"));
check("loadTodaysLeads degrades when migration 020 lags", dataLayer.includes("/family_names/i"));
check(
  "lead detail payload carries familyNames",
  readFileSync(new URL("../src/routes/api/telecaller/lead.ts", import.meta.url), "utf8").includes(
    "familyNames",
  ),
);

// ─────────────────────────────────────────────────────────────
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
