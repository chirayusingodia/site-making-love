// Verification harness for /admin/sankalp-lists grouping + Pandit export PII rule.
// Mock data mirrors the LIVE plan_sevas query output pasted by Chirayu (2026-08-01).
import { buildGroups, buildPanditHtml } from "../src/routes/admin.sankalp-lists";

const plans = [
  { id: "p-basic", name: "Basic", slug: "basic", price_paise: 25100, billing_period: "monthly", is_active: true, sort_order: 1 },
  { id: "p-premium", name: "Premium", slug: "premium", price_paise: 39900, billing_period: "monthly", is_active: true, sort_order: 2 },
  { id: "p-annual", name: "Premium Annual", slug: "premium-annual", price_paise: 410100, billing_period: "yearly", is_active: true, sort_order: 3 },
];

const sevas = [
  { id: "s1", name: "Sundarkand Path", slug: "sundarkand-path", is_active: true, sort_order: 1 },
  { id: "s2", name: "Gau Seva", slug: "gau-seva", is_active: true, sort_order: 2 },
  { id: "s3", name: "Vanar Seva", slug: "vanar-seva", is_active: true, sort_order: 3 },
  { id: "s4", name: "Saadhu Santo Ko Bhojan", slug: "saadhu-santo-ko-bhojan", is_active: true, sort_order: 4 },
  { id: "s5", name: "Griha Shanti Hawan", slug: "griha-shanti-hawan", is_active: true, sort_order: 5 },
  { id: "s6", name: "Sarv Rog Nivaran Hawan", slug: "sarv-rog-nivaran-hawan", is_active: true, sort_order: 6 },
];

// Live mapping: Basic -> s1,s2,s3 ; Premium -> s1..s6 ; Premium Annual -> s1..s6 (identical to Premium)
const planSevas = [
  ...["s1", "s2", "s3"].map((seva_id) => ({ plan_id: "p-basic", seva_id })),
  ...["s1", "s2", "s3", "s4", "s5", "s6"].map((seva_id) => ({ plan_id: "p-premium", seva_id })),
  ...["s1", "s2", "s3", "s4", "s5", "s6"].map((seva_id) => ({ plan_id: "p-annual", seva_id })),
];

const subscriptions = [
  { id: "sub-b1", plan_id: "p-basic", status: "active", start_date: "2026-07-01", created_at: "2026-07-01" },
  { id: "sub-p1", plan_id: "p-premium", status: "active", start_date: "2026-07-05", created_at: "2026-07-05" },
  { id: "sub-a1", plan_id: "p-annual", status: "active", start_date: "2026-07-10", created_at: "2026-07-10" },
  { id: "sub-x1", plan_id: "p-basic", status: "cancelled", start_date: "2026-06-01", created_at: "2026-06-01" }, // must be excluded
];

const members = [
  { id: "m1", subscription_id: "sub-b1", full_name: "Ramesh Sharma", gotra: "Bharadwaj", slot_number: 1 },
  { id: "m2", subscription_id: "sub-b1", full_name: "Sita Sharma", gotra: "Kashyap", slot_number: 2 },
  { id: "m3", subscription_id: "sub-p1", full_name: "Mohan Verma", gotra: "Vashisht", slot_number: 1 },
  { id: "m4", subscription_id: "sub-a1", full_name: "Geeta Iyer", gotra: null, slot_number: 1 },
  { id: "m5", subscription_id: "sub-x1", full_name: "Cancelled Person", gotra: "Garg", slot_number: 1 }, // must be excluded
];

const { groups, ungrouped } = buildGroups(plans, sevas, planSevas, subscriptions, members);

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

check("exactly 2 composition groups", groups.length === 2);
check("group 1 = Basic only", groups[0].plans.map((p) => p.name).join(",") === "Basic");
check("group 1 has 3 sevas", groups[0].sevas.length === 3);
check("group 1 has 1 active subscriber, 2 members", groups[0].subscribers.length === 1 && groups[0].subscribers[0].members.length === 2);
check("group 2 = Premium + Premium Annual (identical composition, live-matched)",
  groups[1].plans.map((p) => p.name).sort().join(",") === "Premium,Premium Annual");
check("group 2 has 6 sevas", groups[1].sevas.length === 6);
check("group 2 has 2 subscribers (monthly + annual merged)", groups[1].subscribers.length === 2);
check("cancelled subscription excluded everywhere", groups.every((g) => !g.subscribers.some((s) => s.subscription.id === "sub-x1")));
check("no ungrouped subs", ungrouped.length === 0);

// ── Pandit export PII hard-rule check ──
for (const [i, g] of groups.entries()) {
  const html = buildPanditHtml(g, new Date("2026-08-01T10:00:00"));
  const forbidden = ["Basic", "Premium", "Annual", "₹", "251", "399", "4,101", "4101", "25100", "39900", "410100", "monthly", "yearly", "phone", "Phone", "razorpay"];
  const hits = forbidden.filter((f) => html.includes(f));
  const emailHit = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(html);
  if (emailHit) hits.push("email-pattern");
  check(`export ${i + 1}: no plan name / price / billing / phone / PII strings (hits: ${hits.length ? hits.join(",") : "none"})`, hits.length === 0);
  for (const s of g.sevas) check(`export ${i + 1}: contains seva "${s.name}"`, html.includes(s.name));
  const names = g.subscribers.flatMap((s) => s.members.map((m) => m.full_name));
  for (const n of names) check(`export ${i + 1}: contains name "${n}"`, html.includes(n));
  check(`export ${i + 1}: gotra shown (Bharadwaj/Kashyap/Vashisht or —)`, /Bharadwaj|Kashyap|Vashisht|—/.test(html));
}

if (process.env.DUMP_HTML) {
  console.log("\n----- SAMPLE PANDIT EXPORT (group 2) -----\n");
  console.log(buildPanditHtml(groups[1], new Date("2026-08-01T10:00:00")));
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
