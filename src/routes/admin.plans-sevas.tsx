import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  RefreshCw,
  Pencil,
  Check,
  X,
  Plus,
  AlertTriangle,
  EyeOff,
  Eye,
  Flame,
  Package,
  Award,
  Clock,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatusPill,
  TableScroll,
} from "@/components/admin/admin-ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CloudinaryImageButton } from "@/components/admin/CloudinaryImageButton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/plans-sevas")({
  component: PlansSevasPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface Plan {
  id: string;
  name: string;
  name_en: string | null;
  slug: string;
  price_paise: number;
  billing_period: "monthly" | "yearly";
  tagline: string | null;
  highlight_text: string | null;
  card_image_url: string | null;
  features: string[] | null;
  is_active: boolean;
  sort_order: number;
}
interface Seva {
  id: string;
  name: string;
  name_en: string | null;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}
interface SevaScheduleRule {
  id: string;
  seva_id: string;
  weekday: string;
  occurrence: string;
}
interface PlanSeva {
  plan_id: string;
  seva_id: string;
}
interface PlanAddon {
  id: string;
  plan_id: string;
  addon_type: string;
  description: string | null;
  is_active: boolean;
}

// ─── Helper: regenerate plans.features from plan_sevas + plan_addons ─────────
/**
 * Derives features[] from live plan_sevas + plan_addons rows and writes to
 * plans.features JSONB.  Called after every plan_sevas toggle and addon change.
 * Never reads from hardcoded lib/plans.ts — always live DB data.
 */
async function regeneratePlanFeatures(
  planId: string,
  allSevas: Seva[],
  planSevas: PlanSeva[],
  planAddons: PlanAddon[],
): Promise<{ error: string | null }> {
  const includedIds = new Set(
    planSevas.filter((ps) => ps.plan_id === planId).map((ps) => ps.seva_id),
  );
  const features: string[] = allSevas
    .filter((s) => includedIds.has(s.id) && s.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => s.name);

  planAddons
    .filter((a) => a.plan_id === planId && a.is_active)
    .forEach((a) => features.push(a.description || a.addon_type));

  const { error } = await supabase.from("plans").update({ features }).eq("id", planId);
  return { error: error?.message ?? null };
}

/**
 * [Pass-2 F8] Regenerate plans.features for EVERY plan that includes
 * the given seva, reading ALL inputs fresh from Supabase. Renames,
 * slug changes and deactivate toggles previously left stale strings
 * in plans.features indefinitely (public plan cards render them) —
 * only an unrelated matrix/addon toggle repaired the damage.
 */
async function regenerateFeaturesForSeva(sevaId: string): Promise<string | null> {
  const { data: psRows, error: psErr } = await supabase
    .from("plan_sevas")
    .select("plan_id")
    .eq("seva_id", sevaId);
  if (psErr) return psErr.message;
  const planIds = [...new Set(((psRows as { plan_id: string }[]) ?? []).map((r) => r.plan_id))];
  if (planIds.length === 0) return null;

  const [{ data: allSevas }, { data: allPlanSevas }, { data: allAddons }] = await Promise.all([
    supabase.from("sevas").select("*"),
    supabase.from("plan_sevas").select("*"),
    supabase.from("plan_addons").select("*"),
  ]);
  let firstError: string | null = null;
  for (const pid of planIds) {
    const { error } = await regeneratePlanFeatures(
      pid,
      (allSevas as Seva[]) ?? [],
      (allPlanSevas as PlanSeva[]) ?? [],
      (allAddons as PlanAddon[]) ?? [],
    );
    if (error && !firstError) firstError = error;
  }
  return firstError;
}

// ─── Page Root ────────────────────────────────────────────────────────────────
function PlansSevasPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sevas, setSevas] = useState<Seva[]>([]);
  const [scheduleRules, setScheduleRules] = useState<SevaScheduleRule[]>([]);
  const [planSevas, setPlanSevas] = useState<PlanSeva[]>([]);
  const [planAddons, setPlanAddons] = useState<PlanAddon[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setGlobalError(null);
    // Single parallel fetch — all 5 tables, no N+1
    const [plansRes, sevasRes, rulesRes, planSevasRes, planAddonsRes] = await Promise.all([
      supabase.from("plans").select("*").order("sort_order"),
      supabase.from("sevas").select("*").order("sort_order"),
      supabase.from("seva_schedule_rules").select("*"),
      supabase.from("plan_sevas").select("*"),
      supabase.from("plan_addons").select("*"),
    ]);
    const errs = [
      plansRes.error,
      sevasRes.error,
      rulesRes.error,
      planSevasRes.error,
      planAddonsRes.error,
    ]
      .filter(Boolean)
      .map((e) => e!.message);
    if (errs.length) setGlobalError(`Supabase: ${errs.join("; ")}`);
    setPlans((plansRes.data as Plan[]) ?? []);
    setSevas((sevasRes.data as Seva[]) ?? []);
    setScheduleRules((rulesRes.data as SevaScheduleRule[]) ?? []);
    setPlanSevas((planSevasRes.data as PlanSeva[]) ?? []);
    setPlanAddons((planAddonsRes.data as PlanAddon[]) ?? []);
    setLastRefreshed(
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const [tab, setTab] = useState<"assignment" | "plans" | "sevas" | "schedule" | "addons">(
    "assignment",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plans & Sevas"
        description="Plans, sevas, schedule rules and tier assignments. Changes take effect immediately for all subscribers."
        meta={lastRefreshed ? `Updated ${lastRefreshed}` : undefined}
        actions={
          <Button
            onClick={fetchAll}
            disabled={loading}
            variant="outline"
            size="sm"
            className="gap-1.5"
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

      <div className="space-y-4">
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "assignment", label: "Tier Assignment" },
            { value: "plans", label: "Plans" },
            { value: "sevas", label: "Sevas" },
            { value: "schedule", label: "Schedule Rules" },
            { value: "addons", label: "Add-ons" },
          ]}
        />
        {tab === "assignment" && (
          <TierAssignmentMatrix
            plans={plans}
            sevas={sevas}
            planSevas={planSevas}
            planAddons={planAddons}
            loading={loading}
            onUpdated={fetchAll}
          />
        )}
        {tab === "plans" && <PlansCrud plans={plans} loading={loading} onUpdated={fetchAll} />}
        {tab === "sevas" && <SevasCrud sevas={sevas} loading={loading} onUpdated={fetchAll} />}
        {tab === "schedule" && (
          <ScheduleRulesEditor
            sevas={sevas}
            scheduleRules={scheduleRules}
            loading={loading}
            onUpdated={fetchAll}
          />
        )}
        {tab === "addons" && (
          <PlanAddonEditor
            plans={plans}
            planAddons={planAddons}
            sevas={sevas}
            planSevas={planSevas}
            loading={loading}
            onUpdated={fetchAll}
          />
        )}
      </div>
    </div>
  );
}

/** Transient save/toggle result banner used by every tab. */
function ToastBanner({ toast }: { toast: { text: string; ok: boolean } | null }) {
  if (!toast) return null;
  return (
    <Notice tone={toast.ok ? "good" : "bad"} icon={toast.ok ? Check : AlertTriangle}>
      <span className="break-words">{toast.text}</span>
    </Notice>
  );
}

/** Loading placeholder rows shared by the tabs. */
function LoadingRows({ count = 3, className = "h-16" }: { count?: number; className?: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={`${className} w-full rounded-xl`} />
      ))}
    </div>
  );
}

const codeCls = "bg-stone-100 text-stone-700 px-1 rounded text-[11px] font-mono";
/** Dialogs fit a 375px phone and scroll inside themselves. */
const dialogCls = "w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto";
const dialogFooterCls = "flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2";
const primaryBtnCls = "h-9 bg-orange-600 hover:bg-orange-700 text-white";
const fieldLabelCls = "text-xs font-medium text-stone-600";

// ─── Tier Assignment Matrix ────────────────────────────────────────────────────
function TierAssignmentMatrix({
  plans,
  sevas,
  planSevas,
  planAddons,
  loading,
  onUpdated,
}: {
  plans: Plan[];
  sevas: Seva[];
  planSevas: PlanSeva[];
  planAddons: PlanAddon[];
  loading: boolean;
  onUpdated: () => void;
}) {
  const [toggling, setToggling] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const showToast = (text: string, ok = true) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const isIncluded = (planId: string, sevaId: string) =>
    planSevas.some((ps) => ps.plan_id === planId && ps.seva_id === sevaId);

  const handleToggle = async (planId: string, sevaId: string) => {
    const key = `${planId}:${sevaId}`;
    setToggling(key);
    const currently = isIncluded(planId, sevaId);

    if (currently) {
      const { error } = await supabase
        .from("plan_sevas")
        .delete()
        .eq("plan_id", planId)
        .eq("seva_id", sevaId);
      if (error) {
        showToast(`Error: ${error.message}`, false);
        setToggling(null);
        return;
      }
    } else {
      const { error } = await supabase
        .from("plan_sevas")
        .insert({ plan_id: planId, seva_id: sevaId });
      if (error) {
        showToast(`Error: ${error.message}`, false);
        setToggling(null);
        return;
      }
    }

    // [Bug 3.11] Re-fetch BOTH inputs — the old call passed the stale
    // planAddons prop, so a concurrent addon edit in another tab was
    // silently erased from plans.features until the next refresh.
    const [{ data: freshPs }, { data: freshAddons }] = await Promise.all([
      supabase.from("plan_sevas").select("*"),
      supabase.from("plan_addons").select("*"),
    ]);
    const { error: fe } = await regeneratePlanFeatures(
      planId,
      sevas,
      (freshPs as PlanSeva[]) ?? planSevas,
      (freshAddons as PlanAddon[]) ?? planAddons,
    );
    showToast(
      fe
        ? `plan_sevas updated, features regen failed: ${fe}`
        : currently
          ? "Seva removed. features JSONB updated."
          : "Seva added. features JSONB updated.",
      !fe,
    );
    setToggling(null);
    onUpdated();
  };

  const activeSevas = sevas.filter((s) => s.is_active);
  const activePlans = plans.filter((p) => p.is_active);

  if (loading) return <LoadingRows />;

  return (
    <div className="space-y-4">
      <ToastBanner toast={toast} />
      <Panel
        flush
        title="Assignment matrix"
        description={
          <>
            Toggle a seva per plan. Writes to <code className={codeCls}>plan_sevas</code> and
            auto-regenerates <code className={codeCls}>plans.features</code>. No code deploy needed.
          </>
        }
      >
        <TableScroll>
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-stone-50">
              <tr className="border-b border-stone-200">
                <th className="sticky left-0 z-10 bg-stone-50 text-left px-3 sm:px-4 py-2.5 font-medium text-stone-500 text-xs min-w-[150px] sm:min-w-[200px]">
                  Seva
                </th>
                {activePlans.map((p) => (
                  <th
                    key={p.id}
                    className="px-2 sm:px-3 py-2.5 text-center text-xs min-w-[96px] sm:min-w-[130px] align-top"
                  >
                    <div className="font-semibold text-stone-900">{p.name}</div>
                    <div className="text-xs text-stone-500 font-normal mt-0.5 tabular-nums">
                      Rs.{(p.price_paise / 100).toLocaleString("en-IN")}/
                      {p.billing_period === "monthly" ? "mo" : "yr"}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {activeSevas.map((seva) => (
                <tr key={seva.id} className="bg-white hover:bg-stone-50/60">
                  <td className="sticky left-0 z-10 bg-white px-3 sm:px-4 py-2.5">
                    <div className="font-medium text-stone-900 text-[13px]">{seva.name}</div>
                    {seva.description && (
                      <div className="text-xs text-stone-500 mt-0.5 line-clamp-1">
                        {seva.description}
                      </div>
                    )}
                  </td>
                  {activePlans.map((plan) => {
                    const key = `${plan.id}:${seva.id}`;
                    const included = isIncluded(plan.id, seva.id);
                    const isSpinning = toggling === key;
                    return (
                      <td key={plan.id} className="px-2 sm:px-3 py-2.5 text-center">
                        <button
                          id={`toggle-${plan.id}-${seva.id}`}
                          onClick={() => handleToggle(plan.id, seva.id)}
                          disabled={toggling !== null}
                          className={[
                            "w-9 h-9 rounded-full border flex items-center justify-center mx-auto transition-colors duration-150",
                            included
                              ? "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700"
                              : "bg-white border-stone-300 text-stone-400 hover:border-orange-400 hover:text-orange-700",
                            isSpinning ? "opacity-60 cursor-wait" : "cursor-pointer",
                            toggling && !isSpinning ? "opacity-40 cursor-not-allowed" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          title={
                            included
                              ? `Remove ${seva.name} from ${plan.name}`
                              : `Add ${seva.name} to ${plan.name}`
                          }
                        >
                          {isSpinning ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : included ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {activeSevas.length === 0 && (
                <tr>
                  <td colSpan={activePlans.length + 1} className="p-0">
                    <EmptyState
                      icon={Flame}
                      title="No active sevas"
                      description="Add sevas in the Sevas tab."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroll>
        <div className="border-t border-stone-100 p-4 sm:p-5 bg-stone-50/60 space-y-3">
          <div className="text-[13px] font-medium text-stone-600">
            Live plans.features (auto-generated)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {activePlans.map((plan) => (
              <div
                key={plan.id}
                className="bg-white rounded-lg border border-stone-200 p-3 space-y-2"
              >
                <div className="font-medium text-sm text-stone-900">{plan.name}</div>
                {Array.isArray(plan.features) && plan.features.length > 0 ? (
                  <ul className="space-y-1">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-stone-700">
                        <Check className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="min-w-0 break-words">{f}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-stone-400">No features yet.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </Panel>
      {plans.filter((p) => !p.is_active).length > 0 && (
        <Notice tone="info" icon={EyeOff}>
          {plans.filter((p) => !p.is_active).length} inactive plan(s) hidden. Activate in Plans tab
          to manage assignments.
        </Notice>
      )}
    </div>
  );
}

// ─── Plans CRUD ────────────────────────────────────────────────────────────────
function PlansCrud({
  plans,
  loading,
  onUpdated,
}: {
  plans: Plan[];
  loading: boolean;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from("plans")
      .update({
        name: editing.name.trim(),
        name_en: editing.name_en?.trim() || null,
        price_paise: editing.price_paise,
        billing_period: editing.billing_period,
        tagline: editing.tagline?.trim() || null,
        highlight_text: editing.highlight_text?.trim() || null,
        card_image_url: editing.card_image_url?.trim() || null,
        is_active: editing.is_active,
      })
      .eq("id", editing.id);
    if (err) {
      setError(err.message);
    } else {
      setSuccessId(editing.id);
      setTimeout(() => setSuccessId(null), 2000);
      setEditing(null);
      onUpdated();
    }
    setSaving(false);
  };

  // Soft-delete toggle only — no hard delete exists anywhere in this module
  const toggleActive = async (plan: Plan) => {
    const { error: err } = await supabase
      .from("plans")
      .update({ is_active: !plan.is_active })
      .eq("id", plan.id);
    if (!err) onUpdated();
  };

  if (loading) return <LoadingRows className="h-20" />;

  return (
    <div className="space-y-4">
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="space-y-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`admin-card p-4 transition-shadow ${plan.is_active ? "" : "bg-stone-50"} ${successId === plan.id ? "ring-2 ring-emerald-400" : ""}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`font-semibold ${plan.is_active ? "text-stone-900" : "text-stone-500"}`}
                  >
                    {plan.name}
                  </span>
                  <code className={`${codeCls} break-all`}>{plan.slug}</code>
                  <StatusPill tone={plan.is_active ? "good" : "neutral"}>
                    {plan.is_active ? "Active" : "Inactive"}
                  </StatusPill>
                  <StatusPill tone="info">{plan.billing_period}</StatusPill>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600">
                  <span className="font-semibold text-stone-900 tabular-nums">
                    Rs.{(plan.price_paise / 100).toLocaleString("en-IN")}
                  </span>
                  {plan.tagline && (
                    <span className="text-stone-500 line-clamp-1 min-w-0 max-w-full sm:max-w-md">
                      {plan.tagline}
                    </span>
                  )}
                </div>
                {plan.features && plan.features.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {plan.features.slice(0, 3).map((f, i) => (
                      <span
                        key={i}
                        className="text-xs bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded"
                      >
                        {f}
                      </span>
                    ))}
                    {plan.features.length > 3 && (
                      <span className="text-xs text-stone-400 self-center">
                        +{plan.features.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  id={`plan-toggle-active-${plan.id}`}
                  onClick={() => toggleActive(plan)}
                  variant="outline"
                  size="sm"
                  className={`h-9 sm:h-8 gap-1.5 text-xs ${plan.is_active ? "text-stone-700" : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"}`}
                >
                  {plan.is_active ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" /> Deactivate
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" /> Activate
                    </>
                  )}
                </Button>
                <Button
                  id={`plan-edit-${plan.id}`}
                  onClick={() => setEditing({ ...plan })}
                  variant="outline"
                  size="sm"
                  className="h-9 sm:h-8 gap-1.5 text-xs"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </Button>
              </div>
            </div>
          </div>
        ))}
        {plans.length === 0 && (
          <div className="admin-card">
            <EmptyState icon={Package} title="No plans found" />
          </div>
        )}
      </div>
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className={dialogCls}>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-stone-900 pr-6 break-words">
              Edit Plan &mdash; {editing?.name}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={fieldLabelCls}>Name (Hindi / default)</Label>
                  <Input
                    id="edit-plan-name"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className={fieldLabelCls}>English Name</Label>
                  <Input
                    id="edit-plan-name-en"
                    value={editing.name_en ?? ""}
                    onChange={(e) => setEditing({ ...editing, name_en: e.target.value })}
                    className="text-sm"
                    placeholder="e.g. Griha Shanti"
                  />
                  <p className="text-xs text-stone-400">
                    Shown when the site is in English. Blank → uses the default name.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={fieldLabelCls}>Price (paise)</Label>
                  <Input
                    id="edit-plan-price"
                    type="number"
                    value={editing.price_paise}
                    onChange={(e) =>
                      setEditing({ ...editing, price_paise: parseInt(e.target.value) || 0 })
                    }
                    className="text-sm font-mono"
                  />
                  <p className="text-xs text-stone-400 tabular-nums">
                    = Rs.{(editing.price_paise / 100).toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className={fieldLabelCls}>Billing Period</Label>
                  <Select
                    value={editing.billing_period}
                    onValueChange={(v) =>
                      setEditing({ ...editing, billing_period: v as "monthly" | "yearly" })
                    }
                  >
                    <SelectTrigger id="edit-plan-billing" className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabelCls}>Tagline</Label>
                <Textarea
                  id="edit-plan-tagline"
                  value={editing.tagline ?? ""}
                  onChange={(e) => setEditing({ ...editing, tagline: e.target.value })}
                  rows={2}
                  className="text-sm resize-none"
                  placeholder="Short plan description..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabelCls}>Highlight Text</Label>
                <Input
                  id="edit-plan-highlight"
                  value={editing.highlight_text ?? ""}
                  onChange={(e) => setEditing({ ...editing, highlight_text: e.target.value })}
                  className="text-sm"
                  placeholder="e.g. Most Popular"
                />
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabelCls}>Card Image</Label>
                <div className="flex flex-wrap items-center gap-3">
                  {editing.card_image_url && (
                    <img
                      src={editing.card_image_url}
                      alt="Card preview"
                      className="w-14 h-14 object-cover rounded-lg border border-stone-200"
                    />
                  )}
                  <CloudinaryImageButton
                    folder="punyata-site/plans"
                    label="Upload image"
                    onUploaded={(url) => setEditing({ ...editing, card_image_url: url })}
                  />
                </div>
                <p className="text-xs text-stone-400">
                  Yeh photo isi jagah se edit ho sakti hai, ya sabhi plan photos ek saath —{" "}
                  <a href="/admin/images" className="text-orange-700 hover:underline">
                    Admin → Photos
                  </a>{" "}
                  par.
                </p>
              </div>
              <div className="flex items-center gap-3 bg-stone-50 border border-stone-200 rounded-lg px-4 py-3">
                <Switch
                  id="edit-plan-active"
                  checked={editing.is_active}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
                <div className="min-w-0">
                  <Label
                    htmlFor="edit-plan-active"
                    className="text-sm font-medium text-stone-900 cursor-pointer"
                  >
                    Active Plan
                  </Label>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Inactive plans hidden but never deleted (soft-delete only).
                  </p>
                </div>
              </div>
              {error && <Notice tone="bad">{error}</Notice>}
              <div className={dialogFooterCls}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    setEditing(null);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving} className={primaryBtnCls}>
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sevas CRUD ────────────────────────────────────────────────────────────────
function SevasCrud({
  sevas,
  loading,
  onUpdated,
}: {
  sevas: Seva[];
  loading: boolean;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState<Seva | null>(null);
  const [creating, setCreating] = useState(false);
  const [newSeva, setNewSeva] = useState<Partial<Seva>>({
    name: "",
    name_en: "",
    slug: "",
    description: "",
    sort_order: 0,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const handleSaveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from("sevas")
      .update({
        name: editing.name.trim(),
        name_en: editing.name_en?.trim() || null,
        slug: editing.slug.trim(),
        description: editing.description?.trim() || null,
        sort_order: editing.sort_order,
        is_active: editing.is_active,
      })
      .eq("id", editing.id);
    if (err) {
      setError(err.message);
    } else {
      // [Pass-2 F8] rename/deactivate must propagate into plans.features.
      const regenErr = await regenerateFeaturesForSeva(editing.id);
      if (regenErr) setError(`Seva saved, features regen failed: ${regenErr}`);
      setSuccessId(editing.id);
      setTimeout(() => setSuccessId(null), 2000);
      setEditing(null);
      onUpdated();
    }
    setSaving(false);
  };

  const handleCreate = async () => {
    if (!newSeva.name?.trim() || !newSeva.slug?.trim()) {
      setError("Name and slug are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("sevas").insert({
      name: newSeva.name.trim(),
      name_en: newSeva.name_en?.trim() || null,
      slug: newSeva.slug.trim(),
      description: newSeva.description?.trim() || null,
      sort_order: newSeva.sort_order ?? 0,
      is_active: newSeva.is_active ?? true,
    });
    if (err) {
      setError(err.message);
    } else {
      setCreating(false);
      setNewSeva({
        name: "",
        name_en: "",
        slug: "",
        description: "",
        sort_order: 0,
        is_active: true,
      });
      onUpdated();
    }
    setSaving(false);
  };

  // Soft-delete only — no hard delete button anywhere in this module
  const toggleActive = async (seva: Seva) => {
    const { error: err } = await supabase
      .from("sevas")
      .update({ is_active: !seva.is_active })
      .eq("id", seva.id);
    // [Pass-2 F8] deactivation must drop the seva from plans.features too.
    if (!err) await regenerateFeaturesForSeva(seva.id);
    if (!err) onUpdated();
  };

  if (loading) return <LoadingRows />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xs text-stone-500">
          {sevas.length} seva{sevas.length === 1 ? "" : "s"} · inactive sevas are hidden, never
          deleted.
        </p>
        <Button
          id="create-seva-btn"
          size="sm"
          onClick={() => setCreating(true)}
          className={`${primaryBtnCls} sm:h-8 gap-1.5 self-start sm:self-auto`}
        >
          <Plus className="w-3.5 h-3.5" />
          New Seva
        </Button>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="space-y-3">
        {sevas.map((seva) => (
          <div
            key={seva.id}
            className={`admin-card p-4 transition-shadow ${seva.is_active ? "" : "bg-stone-50"} ${successId === seva.id ? "ring-2 ring-emerald-400" : ""}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`font-semibold text-sm ${seva.is_active ? "text-stone-900" : "text-stone-500"}`}
                  >
                    {seva.name}
                  </span>
                  <code className={`${codeCls} break-all`}>{seva.slug}</code>
                  <span className="text-xs text-stone-400 tabular-nums">
                    sort #{seva.sort_order}
                  </span>
                  <StatusPill tone={seva.is_active ? "good" : "neutral"}>
                    {seva.is_active ? "Active" : "Inactive"}
                  </StatusPill>
                </div>
                {seva.description && (
                  <p className="text-xs text-stone-500 mt-1 line-clamp-2 sm:line-clamp-1">
                    {seva.description}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  id={`seva-toggle-${seva.id}`}
                  onClick={() => toggleActive(seva)}
                  variant="outline"
                  size="sm"
                  className={`h-9 sm:h-8 gap-1.5 text-xs ${seva.is_active ? "text-stone-700" : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"}`}
                >
                  {seva.is_active ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" /> Deactivate
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" /> Activate
                    </>
                  )}
                </Button>
                <Button
                  id={`seva-edit-${seva.id}`}
                  onClick={() => setEditing({ ...seva })}
                  variant="outline"
                  size="sm"
                  className="h-9 sm:h-8 gap-1.5 text-xs"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </Button>
              </div>
            </div>
          </div>
        ))}
        {sevas.length === 0 && (
          <div className="admin-card">
            <EmptyState
              icon={Flame}
              title="No sevas yet"
              description="Create the first seva with New Seva."
            />
          </div>
        )}
      </div>
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className={dialogCls}>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-stone-900 pr-6 break-words">
              Edit Seva &mdash; {editing?.name}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={fieldLabelCls}>Name</Label>
                  <Input
                    id="edit-seva-name"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className={fieldLabelCls}>Slug (unique)</Label>
                  <Input
                    id="edit-seva-slug"
                    value={editing.slug}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        slug: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                      })
                    }
                    className="text-sm font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabelCls}>English Name</Label>
                <Input
                  id="edit-seva-name-en"
                  value={editing.name_en ?? ""}
                  onChange={(e) => setEditing({ ...editing, name_en: e.target.value })}
                  className="text-sm"
                  placeholder="e.g. Sundarkand Path"
                />
                <p className="text-xs text-stone-400">
                  Shown when the site is in English. Blank → uses the default name.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabelCls}>Description</Label>
                <Textarea
                  id="edit-seva-desc"
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabelCls}>Sort Order</Label>
                <Input
                  id="edit-seva-sort"
                  type="number"
                  value={editing.sort_order}
                  onChange={(e) =>
                    setEditing({ ...editing, sort_order: parseInt(e.target.value) || 0 })
                  }
                  className="text-sm font-mono w-24"
                />
              </div>
              <div className="flex items-center gap-3 bg-stone-50 border border-stone-200 rounded-lg px-4 py-3">
                <Switch
                  id="edit-seva-active"
                  checked={editing.is_active}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
                <div>
                  <Label
                    htmlFor="edit-seva-active"
                    className="text-sm font-medium text-stone-900 cursor-pointer"
                  >
                    Active Seva
                  </Label>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Inactive sevas hidden from assignment but never deleted.
                  </p>
                </div>
              </div>
              {error && <Notice tone="bad">{error}</Notice>}
              <div className={dialogFooterCls}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    setEditing(null);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className={primaryBtnCls}
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className={dialogCls}>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-stone-900 pr-6 break-words">
              Create New Seva
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={fieldLabelCls}>Name *</Label>
                <Input
                  id="create-seva-name"
                  value={newSeva.name ?? ""}
                  onChange={(e) => setNewSeva({ ...newSeva, name: e.target.value })}
                  className="text-sm"
                  placeholder="Sundarkand Path"
                />
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabelCls}>Slug * (unique)</Label>
                <Input
                  id="create-seva-slug"
                  value={newSeva.slug ?? ""}
                  onChange={(e) =>
                    setNewSeva({
                      ...newSeva,
                      slug: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                    })
                  }
                  className="text-sm font-mono"
                  placeholder="sundarkand-path"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className={fieldLabelCls}>English Name</Label>
              <Input
                id="create-seva-name-en"
                value={newSeva.name_en ?? ""}
                onChange={(e) => setNewSeva({ ...newSeva, name_en: e.target.value })}
                className="text-sm"
                placeholder="e.g. Sundarkand Path"
              />
              <p className="text-xs text-stone-400">
                Optional — shown when the site is in English.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className={fieldLabelCls}>Description</Label>
              <Textarea
                id="create-seva-desc"
                value={newSeva.description ?? ""}
                onChange={(e) => setNewSeva({ ...newSeva, description: e.target.value })}
                rows={3}
                className="text-sm resize-none"
                placeholder="Brief description..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className={fieldLabelCls}>Sort Order</Label>
              <Input
                id="create-seva-sort"
                type="number"
                value={newSeva.sort_order ?? 0}
                onChange={(e) =>
                  setNewSeva({ ...newSeva, sort_order: parseInt(e.target.value) || 0 })
                }
                className="text-sm font-mono w-24"
              />
            </div>
            {error && <Notice tone="bad">{error}</Notice>}
            <div className={dialogFooterCls}>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => {
                  setCreating(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                id="create-seva-submit"
                size="sm"
                onClick={handleCreate}
                disabled={saving}
                className={primaryBtnCls}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Create Seva
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Schedule Rules Editor ─────────────────────────────────────────────────────
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const OCCURRENCES = ["first", "second", "third", "fourth", "last"] as const;

function ScheduleRulesEditor({
  sevas,
  scheduleRules,
  loading,
  onUpdated,
}: {
  sevas: Seva[];
  scheduleRules: SevaScheduleRule[];
  loading: boolean;
  onUpdated: () => void;
}) {
  // Default matches the live List A rule: 2nd Tuesday.
  const [adding, setAdding] = useState({ sevaId: "", weekday: "TUE", occurrence: "second" });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!adding.sevaId) {
      setError("Select a seva.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("seva_schedule_rules").insert({
      seva_id: adding.sevaId,
      weekday: adding.weekday,
      occurrence: adding.occurrence,
    });
    if (err) {
      setError(err.message);
    } else {
      setAdding({ sevaId: "", weekday: "TUE", occurrence: "second" });
      onUpdated();
    }
    setSaving(false);
  };

  const handleRemove = async (ruleId: string) => {
    setRemoving(ruleId);
    await supabase.from("seva_schedule_rules").delete().eq("id", ruleId);
    setRemoving(null);
    onUpdated();
  };

  const rulesBySeva = sevas.map((seva) => ({
    seva,
    rules: scheduleRules.filter((r) => r.seva_id === seva.id),
  }));

  if (loading) return <LoadingRows count={2} className="h-14" />;

  return (
    <div className="space-y-4">
      {error && <Notice tone="bad">{error}</Notice>}
      <Panel
        title="Add schedule rule"
        description="Which weekday occurrence each seva is performed on."
      >
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:items-end">
          <div className="space-y-1.5 col-span-2 sm:min-w-[180px] sm:flex-1">
            <Label className={fieldLabelCls}>Seva</Label>
            <Select
              value={adding.sevaId}
              onValueChange={(v) => setAdding({ ...adding, sevaId: v })}
            >
              <SelectTrigger id="schedule-seva-select" className="text-sm">
                <SelectValue placeholder="Select seva..." />
              </SelectTrigger>
              <SelectContent>
                {sevas
                  .filter((s) => s.is_active)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className={fieldLabelCls}>Weekday</Label>
            <Select
              value={adding.weekday}
              onValueChange={(v) => setAdding({ ...adding, weekday: v })}
            >
              <SelectTrigger id="schedule-weekday-select" className="text-sm w-full sm:w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className={fieldLabelCls}>Occurrence</Label>
            <Select
              value={adding.occurrence}
              onValueChange={(v) => setAdding({ ...adding, occurrence: v })}
            >
              <SelectTrigger id="schedule-occurrence-select" className="text-sm w-full sm:w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OCCURRENCES.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            id="schedule-add-btn"
            size="sm"
            onClick={handleAdd}
            disabled={saving}
            className={`${primaryBtnCls} col-span-2 sm:col-span-1 gap-1`}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                Add
              </>
            )}
          </Button>
        </div>
      </Panel>
      <div className="space-y-3">
        {rulesBySeva
          .filter((g) => g.rules.length > 0)
          .map(({ seva, rules }) => (
            <div key={seva.id} className="admin-card p-4">
              <div className="font-medium text-stone-900 text-sm mb-2.5">{seva.name}</div>
              <div className="flex flex-wrap gap-2">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-full pl-3 pr-1 py-0.5 text-xs font-medium text-stone-700"
                  >
                    <Clock className="w-3 h-3 text-stone-400" />
                    {rule.occurrence} {rule.weekday}
                    <button
                      id={`remove-rule-${rule.id}`}
                      onClick={() => handleRemove(rule.id)}
                      disabled={removing === rule.id}
                      className="ml-0.5 w-7 h-7 rounded-full inline-flex items-center justify-center text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Remove rule"
                      aria-label="Remove rule"
                    >
                      {removing === rule.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        {rulesBySeva.every((g) => g.rules.length === 0) && (
          <div className="admin-card">
            <EmptyState
              icon={Clock}
              title="No schedule rules defined"
              description="Add rules above."
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Plan Addon Editor ─────────────────────────────────────────────────────────
function PlanAddonEditor({
  plans,
  planAddons,
  sevas,
  planSevas,
  loading,
  onUpdated,
}: {
  plans: Plan[];
  planAddons: PlanAddon[];
  sevas: Seva[];
  planSevas: PlanSeva[];
  loading: boolean;
  onUpdated: () => void;
}) {
  const [toggling, setToggling] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };
  const getAddon = (planId: string, type: string) =>
    planAddons.find((a) => a.plan_id === planId && a.addon_type === type);

  const handleToggleAddon = async (plan: Plan, addonType: "prasad" | "certificate") => {
    const key = `${plan.id}:${addonType}`;
    setToggling(key);
    setError(null);
    const existing = getAddon(plan.id, addonType);
    if (existing) {
      // Soft-toggle — never delete the row
      const { error: err } = await supabase
        .from("plan_addons")
        .update({ is_active: !existing.is_active })
        .eq("id", existing.id);
      if (err) {
        setError(err.message);
        setToggling(null);
        return;
      }
    } else {
      const defaultDesc =
        addonType === "prasad"
          ? "Quarterly Prasad Box — pavitra prasad ghar par daak dwara"
          : "Sankalp Certificate — sankalp praamanpatra varshik";
      const { error: err } = await supabase.from("plan_addons").insert({
        plan_id: plan.id,
        addon_type: addonType,
        description: defaultDesc,
        is_active: true,
      });
      if (err) {
        setError(err.message);
        setToggling(null);
        return;
      }
    }
    // [Bug 3.11 mirrored] Re-fetch BOTH inputs — stale planSevas here
    // had the same concurrent-edit hazard as handleToggle.
    const [{ data: freshPs }, { data: freshAddons }] = await Promise.all([
      supabase.from("plan_sevas").select("*"),
      supabase.from("plan_addons").select("*"),
    ]);
    const { error: fe } = await regeneratePlanFeatures(
      plan.id,
      sevas,
      (freshPs as PlanSeva[]) ?? planSevas,
      (freshAddons as PlanAddon[]) ?? planAddons,
    );
    if (fe) {
      showToast(`Addon updated, features regen failed: ${fe}`);
    } else {
      showToast(`${addonType} toggled. features JSONB updated.`);
    }
    setToggling(null);
    onUpdated();
  };

  if (loading) return <LoadingRows count={2} className="h-20" />;

  return (
    <div className="space-y-4">
      {toast && (
        <Notice tone="good" icon={Check}>
          <span className="break-words">{toast}</span>
        </Notice>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="space-y-3">
        {plans.map((plan) => {
          const prasad = getAddon(plan.id, "prasad");
          const cert = getAddon(plan.id, "certificate");
          return (
            <div key={plan.id} className="admin-card p-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="font-semibold text-stone-900">{plan.name}</span>
                <code className={`${codeCls} break-all`}>{plan.slug}</code>
                {!plan.is_active && <StatusPill tone="neutral">Inactive</StatusPill>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors ${prasad?.is_active ? "bg-amber-50/60 border-amber-200" : "bg-white border-stone-200"}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Package
                      className={`w-4 h-4 shrink-0 ${prasad?.is_active ? "text-amber-600" : "text-stone-400"}`}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-stone-900">Prasad Box</div>
                      <div className="text-xs text-stone-500">Quarterly delivery</div>
                    </div>
                  </div>
                  <Switch
                    id={`addon-prasad-${plan.id}`}
                    checked={prasad?.is_active ?? false}
                    disabled={toggling === `${plan.id}:prasad`}
                    onCheckedChange={() => handleToggleAddon(plan, "prasad")}
                  />
                </div>
                <div
                  className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors ${cert?.is_active ? "bg-sky-50/60 border-sky-200" : "bg-white border-stone-200"}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Award
                      className={`w-4 h-4 shrink-0 ${cert?.is_active ? "text-sky-600" : "text-stone-400"}`}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-stone-900">Sankalp Certificate</div>
                      <div className="text-xs text-stone-500">Annual praamanpatra</div>
                    </div>
                  </div>
                  <Switch
                    id={`addon-certificate-${plan.id}`}
                    checked={cert?.is_active ?? false}
                    disabled={toggling === `${plan.id}:certificate`}
                    onCheckedChange={() => handleToggleAddon(plan, "certificate")}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Notice tone="info">
        <span className="font-medium">Note:</span> Toggling off sets{" "}
        <code className={codeCls}>is_active = false</code> &mdash; the row is never deleted. Every
        toggle auto-regenerates <code className={codeCls}>plans.features</code>.
      </Notice>
    </div>
  );
}
