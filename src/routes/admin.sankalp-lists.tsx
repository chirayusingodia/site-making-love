import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  ScrollText,
  RefreshCw,
  Printer,
  Download,
  AlertTriangle,
  Users,
  Flame,
  Eye,
  EyeOff,
  ShieldAlert,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Notice, PageHeader, Panel, TableScroll } from "@/components/admin/admin-ui";

export const Route = createFileRoute("/admin/sankalp-lists")({
  component: SankalpListsPage,
});

// [Pass-2 F16] bare YYYY-MM-DD parses as UTC midnight → one-day-early
// display for non-IST viewers. Anchor date-only strings to IST midnight
// and render in Asia/Kolkata (same pattern as reports-logic.ts).
function fmtActiveSince(d: string | null): string {
  if (!d) return "—";
  const iso = d.length === 10 ? `${d}T00:00:00+05:30` : d;
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Plan {
  id: string;
  name: string;
  slug: string;
  price_paise: number;
  billing_period: "monthly" | "yearly";
  is_active: boolean;
  sort_order: number;
}
interface Seva {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
}
interface PlanSeva {
  plan_id: string;
  seva_id: string;
}
interface Subscription {
  id: string;
  plan_id: string;
  status: string;
  start_date: string | null;
  created_at: string;
}
interface FamilyMember {
  id: string;
  subscription_id: string;
  full_name: string;
  gotra: string | null;
  slot_number: number;
}

interface SubscriberEntry {
  subscription: Subscription;
  members: FamilyMember[];
}

interface SankalpGroup {
  key: string; // seva-composition signature (sorted seva ids)
  sevas: Seva[]; // resolved live from plan_sevas, sorted
  plans: Plan[]; // every active plan sharing this exact composition
  subscribers: SubscriberEntry[]; // all active subscriptions across those plans
}

// ─── Grouping: seva-composition-based (never plan-name-based) ────────────────
/**
 * Groups active plans by their live plan_sevas signature. If two plans
 * (e.g. Premium + Premium Annual) map to the exact same set of sevas, they
 * land in ONE group automatically. If their composition ever diverges via
 * the Plans & Sevas Manager, they split into separate lists automatically.
 */
export function buildGroups(
  plans: Plan[],
  sevas: Seva[],
  planSevas: PlanSeva[],
  subscriptions: Subscription[],
  members: FamilyMember[],
): { groups: SankalpGroup[]; ungrouped: Subscription[] } {
  const sevaById = new Map(sevas.map((s) => [s.id, s]));

  // [Bug 3.9] A plan with no plan_sevas rows yet used to hash to the
  // same EMPTY signature as every other such plan, merging unrelated
  // plans (and their subscribers) into one combined list. Give each
  // zero-seva plan its own sentinel key so it can never merge.
  const signatureFor = (planId: string) => {
    const sig = planSevas
      .filter((ps) => ps.plan_id === planId)
      .map((ps) => ps.seva_id)
      .sort()
      .join("|");
    return sig || `__plan_only:${planId}`;
  };

  const groupMap = new Map<string, SankalpGroup>();
  const activePlans = plans.filter((p) => p.is_active);

  for (const plan of activePlans) {
    const sig = signatureFor(plan.id);
    if (!groupMap.has(sig)) {
      const groupSevas = sig
        ? sig
            .split("|")
            .map((id) => sevaById.get(id))
            .filter((s): s is Seva => !!s)
            .sort((a, b) => a.sort_order - b.sort_order)
        : [];
      groupMap.set(sig, { key: sig, sevas: groupSevas, plans: [], subscribers: [] });
    }
    groupMap.get(sig)!.plans.push(plan);
  }

  // Attach active subscriptions to their plan's composition group
  const activeSubs = subscriptions.filter((s) => s.status === "active");
  const membersBySub = new Map<string, FamilyMember[]>();
  for (const m of members) {
    if (!membersBySub.has(m.subscription_id)) membersBySub.set(m.subscription_id, []);
    membersBySub.get(m.subscription_id)!.push(m);
  }
  for (const list of membersBySub.values()) {
    list.sort((a, b) => a.slot_number - b.slot_number);
  }

  const ungrouped: Subscription[] = [];
  for (const sub of activeSubs) {
    const plan = activePlans.find((p) => p.id === sub.plan_id);
    if (!plan) {
      ungrouped.push(sub);
      continue;
    }
    const sig = signatureFor(plan.id);
    groupMap.get(sig)?.subscribers.push({
      subscription: sub,
      members: membersBySub.get(sub.id) ?? [],
    });
  }

  // Sort groups by the earliest plan sort_order inside each group; subs by start date
  const groups = [...groupMap.values()];
  for (const g of groups) {
    g.plans.sort((a, b) => a.sort_order - b.sort_order);
    g.subscribers.sort((a, b) =>
      (a.subscription.start_date ?? a.subscription.created_at).localeCompare(
        b.subscription.start_date ?? b.subscription.created_at,
      ),
    );
  }
  groups.sort(
    (a, b) =>
      Math.min(...a.plans.map((p) => p.sort_order)) - Math.min(...b.plans.map((p) => p.sort_order)),
  );

  return { groups, ungrouped };
}

// ─── Pandit-facing export (HARD RULE: seva names + name-gotra ONLY) ──────────
// NEVER include: plan name, price, phone, email, or any PII beyond name+gotra.
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function flatNameList(group: SankalpGroup): { name: string; gotra: string | null }[] {
  return group.subscribers.flatMap((s) =>
    s.members.map((m) => ({ name: m.full_name, gotra: m.gotra })),
  );
}

export function buildPanditHtml(group: SankalpGroup, generatedAt: Date): string {
  const names = flatNameList(group);
  const dateStr = generatedAt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const sevaItems = group.sevas.map((s) => `<li>${esc(s.name)}</li>`).join("\n        ");
  const nameItems = names
    .map(
      (n) =>
        `<li><span class="nm">${esc(n.name)}</span><span class="gt">${esc(n.gotra?.trim() || "—")}</span></li>`,
    )
    .join("\n        ");

  return `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sankalp Name List — ${esc(dateStr)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "Noto Sans Devanagari", "Mangal", "Kokila", Georgia, serif;
    color: #1a1a1a; background: #fff; padding: 32px 28px; line-height: 1.6;
  }
  .om { text-align: center; font-size: 26px; color: #b45309; }
  h1 { text-align: center; font-size: 24px; margin: 4px 0 2px; letter-spacing: 0.5px; }
  .sub { text-align: center; font-size: 13px; color: #555; margin-bottom: 20px; }
  h2 {
    font-size: 15px; text-transform: uppercase; letter-spacing: 1.5px; color: #92400e;
    border-bottom: 2px solid #d97706; padding-bottom: 4px; margin: 22px 0 10px;
  }
  ul.sevas { list-style: none; }
  ul.sevas li { font-size: 15px; padding: 3px 0; }
  ul.sevas li::before { content: "🚩 "; }
  ol.names { list-style: none; counter-reset: n; }
  ol.names li {
    counter-increment: n; display: flex; justify-content: space-between; gap: 16px;
    padding: 6px 4px; border-bottom: 1px dotted #d4d4d4; font-size: 15px;
    break-inside: avoid;
  }
  ol.names li::before {
    content: counter(n) "."; min-width: 34px; color: #92400e; font-weight: 700;
  }
  ol.names .nm { flex: 1; font-weight: 600; }
  ol.names .gt { color: #444; white-space: nowrap; }
  .foot { margin-top: 26px; text-align: center; font-size: 12px; color: #777; }
  @media print {
    body { padding: 0; }
    @page { margin: 18mm 14mm; }
  }
</style>
</head>
<body>
  <div class="om">॥ श्री गणेशाय नमः ॥</div>
  <h1>संकल्प नामावली — Sankalp Name List</h1>
  <div class="sub">${esc(dateStr)} &nbsp;•&nbsp; कुल नाम: ${names.length}</div>

  <h2>सेवाएँ — Sevas in this Sankalp</h2>
  <ul class="sevas">
        ${sevaItems || "<li>—</li>"}
  </ul>

  <h2>नाम एवं गोत्र — Names &amp; Gotra</h2>
  <ol class="names">
        ${nameItems || "<li><span class='nm'>—</span><span class='gt'>—</span></li>"}
  </ol>

  <div class="foot">पुण्यता — Sewa Hamari, Punya Aapka</div>
</body>
</html>`;
}

function printPanditList(group: SankalpGroup) {
  const html = buildPanditHtml(group, new Date());
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) {
    window.alert("Popup blocked — please allow popups, or use the Download button instead.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
  }, 400);
}

function downloadPanditList(group: SankalpGroup, listNumber: number) {
  const now = new Date();
  const html = buildPanditHtml(group, now);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = now.toISOString().slice(0, 10);
  a.href = url;
  a.download = `sankalp-namavali-list-${listNumber}-${dateStr}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Page Root ────────────────────────────────────────────────────────────────
function SankalpListsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sevas, setSevas] = useState<Seva[]>([]);
  const [planSevas, setPlanSevas] = useState<PlanSeva[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState("");

  // Fully live — every fetch hits Supabase directly, no cache layer anywhere.
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setGlobalError(null);

    const [plansRes, sevasRes, planSevasRes, subsRes] = await Promise.all([
      supabase
        .from("plans")
        .select("id,name,slug,price_paise,billing_period,is_active,sort_order")
        .order("sort_order"),
      supabase.from("sevas").select("id,name,slug,is_active,sort_order").order("sort_order"),
      supabase.from("plan_sevas").select("plan_id,seva_id"),
      supabase
        .from("subscriptions")
        .select("id,plan_id,status,start_date,created_at")
        .eq("status", "active"),
    ]);
    const errs = [plansRes.error, sevasRes.error, planSevasRes.error, subsRes.error]
      .filter(Boolean)
      .map((e) => e!.message);

    const subs = (subsRes.data as Subscription[]) ?? [];
    let mems: FamilyMember[] = [];
    if (subs.length > 0) {
      // All 4 slots for every active subscription — no primary-only filtering.
      // [Pass-2 F7] chunked like proof-upload/pandit pages: thousands of
      // UUIDs in one .in() exceed PostgREST URL limits and fail the page.
      const ids = subs.map((s) => s.id);
      const collected: FamilyMember[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data: fmData, error: fmErr } = await supabase
          .from("family_members")
          .select("id,subscription_id,full_name,gotra,slot_number")
          .in("subscription_id", ids.slice(i, i + 200))
          .order("slot_number");
        if (fmErr) {
          errs.push(fmErr.message);
          break;
        }
        collected.push(...((fmData as FamilyMember[]) ?? []));
      }
      mems = collected;
    }

    if (errs.length) setGlobalError(`Supabase: ${errs.join("; ")}`);
    setPlans((plansRes.data as Plan[]) ?? []);
    setSevas((sevasRes.data as Seva[]) ?? []);
    setPlanSevas((planSevasRes.data as PlanSeva[]) ?? []);
    setSubscriptions(subs);
    setMembers(mems);
    setLastRefreshed(
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const { groups, ungrouped } = buildGroups(plans, sevas, planSevas, subscriptions, members);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sankalp Name Lists"
        description="Active subscriptions grouped by live plan_sevas composition. Pandit-facing exports contain seva names + name-gotra only."
        meta={lastRefreshed ? `Updated ${lastRefreshed}` : undefined}
        actions={
          <Button
            onClick={fetchAll}
            disabled={loading}
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {globalError && (
        <Notice tone="bad" icon={AlertTriangle}>
          <span className="break-words">{globalError}</span>
        </Notice>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl bg-stone-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {groups.map((group, i) => (
            <GroupCard key={group.key || "no-sevas"} group={group} listNumber={i + 1} />
          ))}

          {groups.length === 0 && (
            <div className="admin-card">
              <EmptyState
                icon={ScrollText}
                title="No active plans found"
                description="Create plans in the Plans & Sevas manager."
              />
            </div>
          )}

          {ungrouped.length > 0 && (
            <Notice tone="bad" icon={ShieldAlert}>
              <span className="break-words">
                {ungrouped.length} active subscription(s) reference an inactive or missing plan and
                are not in any list above. Internal refs:{" "}
                {ungrouped.map((s) => s.id.slice(0, 8)).join(", ")}
              </span>
            </Notice>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Group Card (Admin View) ─────────────────────────────────────────────────
function GroupCard({ group, listNumber }: { group: SankalpGroup; listNumber: number }) {
  const [showAdminList, setShowAdminList] = useState(false);
  const [showPanditPreview, setShowPanditPreview] = useState(false);

  const totalMembers = flatNameList(group).length;
  const multiPlan = group.plans.length > 1;

  // Admin-facing title MAY include plan name + price (internal use only).
  const adminTitle =
    group.plans
      .map(
        (p) =>
          `${p.name} (₹${(p.price_paise / 100).toLocaleString("en-IN")}/${p.billing_period === "monthly" ? "mo" : "yr"})`,
      )
      .join(" + ") + " — Sankalp List";

  return (
    <Panel
      title={
        <span className="break-words">
          List {listNumber}: {adminTitle}
        </span>
      }
      description={
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          <Users className="w-3.5 h-3.5 text-stone-400" />
          {group.subscribers.length} subscriber{group.subscribers.length === 1 ? "" : "s"}
          <span className="text-stone-300">·</span>
          {totalMembers} names
        </span>
      }
      actions={
        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto">
          <Button
            variant="outline"
            onClick={() => downloadPanditList(group, listNumber)}
            className="h-10 sm:h-9 gap-1.5"
          >
            <Download className="w-4 h-4" /> Download
          </Button>
          <Button
            onClick={() => printPanditList(group)}
            className="h-10 sm:h-9 gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
          >
            <Printer className="w-4 h-4" /> Print
          </Button>
        </div>
      }
      bodyClassName="space-y-4"
    >
      {multiPlan && (
        <Notice tone="info" icon={Info}>
          {group.plans.map((p) => p.name).join(" + ")} are grouped together because their live
          <code className="bg-sky-100 px-1 rounded text-[11px] font-mono mx-1">plan_sevas</code>
          composition is identical (checked live, not assumed). If their sevas ever diverge in the
          Plans &amp; Sevas Manager, they will automatically split into separate lists.
        </Notice>
      )}

      {/* Sevas included — derived live from plan_sevas */}
      <div>
        <div className="text-[13px] font-medium text-stone-500 mb-2">
          Sevas included (live from plan_sevas)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {group.sevas.length > 0 ? (
            group.sevas.map((s) => (
              <span
                key={s.id}
                className="text-xs bg-stone-50 border border-stone-200 text-stone-700 px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5"
              >
                <Flame className="w-3 h-3 text-orange-600" />
                {s.name}
                {!s.is_active && (
                  <span className="text-[11px] text-rose-600 font-medium">(inactive seva)</span>
                )}
              </span>
            ))
          ) : (
            <span className="text-xs text-stone-400 italic">
              No sevas mapped to this plan group in plan_sevas.
            </span>
          )}
        </div>
      </div>

      {/* Toggles */}
      <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => setShowAdminList((v) => !v)}
          className="h-10 sm:h-9 gap-1.5 justify-center"
          aria-expanded={showAdminList}
        >
          {showAdminList ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showAdminList ? "Hide" : "Show"} full list (admin view)
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowPanditPreview((v) => !v)}
          className="h-10 sm:h-9 gap-1.5 justify-center"
          aria-expanded={showPanditPreview}
        >
          {showPanditPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showPanditPreview ? "Hide" : "Preview"} Pandit-facing export
        </Button>
      </div>

      {showAdminList && <AdminNameList group={group} />}
      {showPanditPreview && <PanditPreview group={group} />}
    </Panel>
  );
}

// ─── Admin name list (internal: grouped per subscription w/ internal refs) ───
// Stacked cards below md (phones), table from md up.
function AdminNameList({ group }: { group: SankalpGroup }) {
  if (group.subscribers.length === 0) {
    return (
      <div className="rounded-lg border border-stone-200 bg-stone-50">
        <EmptyState
          title="No active subscriptions in this plan group right now."
          className="py-8"
        />
      </div>
    );
  }
  let rowNum = 0;
  const rows = group.subscribers.flatMap(({ subscription, members }) => {
    const since = fmtActiveSince(subscription.start_date ?? subscription.created_at);
    const ref = subscription.id.slice(0, 8);
    return members.length > 0
      ? members.map((m) => ({
          key: m.id,
          num: ++rowNum as number | null,
          member: m as FamilyMember | null,
          ref,
          since,
        }))
      : [{ key: subscription.id, num: null, member: null, ref, since }];
  });

  return (
    <div className="rounded-lg border border-stone-200 overflow-hidden">
      {/* Mobile: stacked cards */}
      <ul className="md:hidden divide-y divide-stone-100">
        {rows.map((r) =>
          r.member ? (
            <li key={r.key} className="px-3.5 py-3 flex gap-3">
              <span className="text-xs tabular-nums text-stone-400 w-6 shrink-0 pt-0.5">
                {r.num}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-stone-900 break-words min-w-0">
                    {r.member.full_name}
                  </span>
                  <span className="text-xs text-stone-500 shrink-0">
                    Slot {r.member.slot_number}
                    {r.member.slot_number === 1 ? " (primary)" : ""}
                  </span>
                </div>
                <div className="mt-0.5 text-[13px] text-stone-600 break-words">
                  Gotra: {r.member.gotra?.trim() || "—"}
                </div>
                <div className="mt-1 text-xs text-stone-400">
                  <span className="font-mono">{r.ref}</span> · Active since {r.since}
                </div>
              </div>
            </li>
          ) : (
            <li key={r.key} className="px-3.5 py-3 bg-rose-50/50">
              <div className="text-sm text-rose-700 italic">No family members recorded</div>
              <div className="mt-1 text-xs text-stone-400">
                <span className="font-mono">{r.ref}</span> · Active since {r.since}
              </div>
            </li>
          ),
        )}
      </ul>

      {/* md+: table */}
      <TableScroll className="hidden md:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-stone-50">
            <tr className="border-b border-stone-200">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-500">#</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-500">Name</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-500">Gotra</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-500">Slot</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-500">Sub ref</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-500">
                Active since
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) =>
              r.member ? (
                <tr key={r.key}>
                  <td className="px-4 py-2.5 text-xs text-stone-400 tabular-nums">{r.num}</td>
                  <td className="px-4 py-2.5 text-[13px] font-medium text-stone-900">
                    {r.member.full_name}
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-stone-600">
                    {r.member.gotra?.trim() || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-stone-500">
                    {r.member.slot_number}
                    {r.member.slot_number === 1 ? " (primary)" : ""}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-stone-400">{r.ref}</td>
                  <td className="px-4 py-2.5 text-xs text-stone-500 whitespace-nowrap">
                    {r.since}
                  </td>
                </tr>
              ) : (
                <tr key={r.key} className="bg-rose-50/50">
                  <td className="px-4 py-2.5 text-xs text-rose-400">—</td>
                  <td className="px-4 py-2.5 text-[13px] text-rose-700 italic" colSpan={3}>
                    No family members recorded
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-stone-400">{r.ref}</td>
                  <td className="px-4 py-2.5 text-xs text-stone-500 whitespace-nowrap">
                    {r.since}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}

// ─── Pandit preview (renders EXACTLY what the export contains) ───────────────
// Content rule enforced here too: seva names + name-gotra ONLY. No plan name,
// no price, no phone, no other PII.
function PanditPreview({ group }: { group: SankalpGroup }) {
  const names = flatNameList(group);
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-2 sm:p-3">
      <div className="rounded-md border border-stone-200 bg-white px-4 py-5 sm:p-6 font-serif">
        <div className="text-center text-xl text-amber-700">॥ श्री गणेशाय नमः ॥</div>
        <div className="text-center text-base sm:text-lg font-bold mt-1 text-stone-900">
          संकल्प नामावली — Sankalp Name List
        </div>
        <div className="text-center text-xs text-stone-500 mt-0.5 mb-4">
          {new Date().toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {" • "}कुल नाम: {names.length}
        </div>

        <div className="text-[11px] font-bold uppercase tracking-widest text-amber-800 border-b-2 border-amber-600 pb-1 mb-2">
          सेवाएँ — Sevas in this Sankalp
        </div>
        <ul className="mb-4">
          {group.sevas.map((s) => (
            <li key={s.id} className="text-sm py-0.5">
              🚩 {s.name}
            </li>
          ))}
          {group.sevas.length === 0 && <li className="text-sm text-stone-400">—</li>}
        </ul>

        <div className="text-[11px] font-bold uppercase tracking-widest text-amber-800 border-b-2 border-amber-600 pb-1 mb-2">
          नाम एवं गोत्र — Names &amp; Gotra
        </div>
        <ol className="list-none">
          {names.map((n, i) => (
            <li
              key={i}
              className="flex justify-between gap-3 py-1 border-b border-dotted border-stone-300 text-sm"
            >
              <span className="flex gap-2 min-w-0">
                <span className="text-amber-800 font-bold w-8 shrink-0">{i + 1}.</span>
                <span className="font-semibold break-words min-w-0">{n.name}</span>
              </span>
              <span className="text-stone-600 text-right shrink-0 max-w-[45%] break-words sm:whitespace-nowrap">
                {n.gotra?.trim() || "—"}
              </span>
            </li>
          ))}
          {names.length === 0 && <li className="text-sm text-stone-400 py-2">No names.</li>}
        </ol>

        <div className="text-center text-[11px] text-stone-400 mt-5">
          पुण्यता — Sewa Hamari, Punya Aapka
        </div>
      </div>
      <p className="mt-2 px-1 text-xs text-stone-500 text-center">
        This preview is exactly what Print / Download produces — no plan name, price, or phone
        number is ever included.
      </p>
    </div>
  );
}
