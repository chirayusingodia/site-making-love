import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Layers, RefreshCw, Pencil, Check, X, Plus, AlertTriangle,
  EyeOff, Eye, Flame, Package, Award, Grid, Clock, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/plans-sevas")({
  component: PlansSevasPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface Plan {
  id: string; name: string; slug: string; price_paise: number;
  billing_period: "monthly" | "yearly"; tagline: string | null;
  highlight_text: string | null; card_image_url: string | null;
  features: string[] | null; is_active: boolean; sort_order: number;
}
interface Seva {
  id: string; name: string; slug: string; description: string | null;
  sort_order: number; is_active: boolean;
}
interface SevaScheduleRule { id: string; seva_id: string; weekday: string; occurrence: string; }
interface PlanSeva { plan_id: string; seva_id: string; }
interface PlanAddon {
  id: string; plan_id: string; addon_type: string;
  description: string | null; is_active: boolean;
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
  planAddons: PlanAddon[]
): Promise<{ error: string | null }> {
  const includedIds = new Set(
    planSevas.filter((ps) => ps.plan_id === planId).map((ps) => ps.seva_id)
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
    const errs = [plansRes.error, sevasRes.error, rulesRes.error, planSevasRes.error, planAddonsRes.error]
      .filter(Boolean).map((e) => e!.message);
    if (errs.length) setGlobalError(`Supabase: ${errs.join("; ")}`);
    setPlans((plansRes.data as Plan[]) ?? []);
    setSevas((sevasRes.data as Seva[]) ?? []);
    setScheduleRules((rulesRes.data as SevaScheduleRule[]) ?? []);
    setPlanSevas((planSevasRes.data as PlanSeva[]) ?? []);
    setPlanAddons((planAddonsRes.data as PlanAddon[]) ?? []);
    setLastRefreshed(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-amber-900/10 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-amber-700" />
            Plans &amp; Sevas
            <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-300 font-mono text-[11px]">Live Supabase</Badge>
          </h1>
          <p className="text-xs text-amber-900/70 mt-1">
            CRUD for plans, sevas, schedule rules, and tier assignments. Changes take effect immediately for all subscribers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && <span className="text-xs text-amber-900/60 font-mono hidden sm:block">Updated: {lastRefreshed}</span>}
          <Button onClick={fetchAll} disabled={loading} variant="outline" size="sm"
            className="border-amber-900/15 bg-amber-50/50 hover:bg-amber-100/50 text-amber-900 gap-1.5 text-xs font-semibold">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-amber-700" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {globalError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 p-4 rounded-xl text-xs flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <span>{globalError}</span>
        </div>
      )}

      <Tabs defaultValue="assignment">
        <TabsList className="bg-amber-50 border border-amber-200 h-auto flex-wrap gap-1 p-1">
          <TabsTrigger value="assignment" className="text-xs font-semibold"><Grid className="w-3.5 h-3.5 mr-1.5" />Tier Assignment</TabsTrigger>
          <TabsTrigger value="plans" className="text-xs font-semibold"><Package className="w-3.5 h-3.5 mr-1.5" />Plans</TabsTrigger>
          <TabsTrigger value="sevas" className="text-xs font-semibold"><Flame className="w-3.5 h-3.5 mr-1.5" />Sevas</TabsTrigger>
          <TabsTrigger value="schedule" className="text-xs font-semibold"><Clock className="w-3.5 h-3.5 mr-1.5" />Schedule Rules</TabsTrigger>
          <TabsTrigger value="addons" className="text-xs font-semibold"><Award className="w-3.5 h-3.5 mr-1.5" />Add-ons</TabsTrigger>
        </TabsList>
        <TabsContent value="assignment" className="mt-4">
          <TierAssignmentMatrix plans={plans} sevas={sevas} planSevas={planSevas} planAddons={planAddons} loading={loading} onUpdated={fetchAll} />
        </TabsContent>
        <TabsContent value="plans" className="mt-4">
          <PlansCrud plans={plans} loading={loading} onUpdated={fetchAll} />
        </TabsContent>
        <TabsContent value="sevas" className="mt-4">
          <SevasCrud sevas={sevas} loading={loading} onUpdated={fetchAll} />
        </TabsContent>
        <TabsContent value="schedule" className="mt-4">
          <ScheduleRulesEditor sevas={sevas} scheduleRules={scheduleRules} loading={loading} onUpdated={fetchAll} />
        </TabsContent>
        <TabsContent value="addons" className="mt-4">
          <PlanAddonEditor plans={plans} planAddons={planAddons} sevas={sevas} planSevas={planSevas} loading={loading} onUpdated={fetchAll} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Tier Assignment Matrix ────────────────────────────────────────────────────
function TierAssignmentMatrix({
  plans, sevas, planSevas, planAddons, loading, onUpdated,
}: {
  plans: Plan[]; sevas: Seva[]; planSevas: PlanSeva[]; planAddons: PlanAddon[];
  loading: boolean; onUpdated: () => void;
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
      const { error } = await supabase.from("plan_sevas").delete().eq("plan_id", planId).eq("seva_id", sevaId);
      if (error) { showToast(`Error: ${error.message}`, false); setToggling(null); return; }
    } else {
      const { error } = await supabase.from("plan_sevas").insert({ plan_id: planId, seva_id: sevaId });
      if (error) { showToast(`Error: ${error.message}`, false); setToggling(null); return; }
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
      (freshAddons as PlanAddon[]) ?? planAddons
    );
    showToast(
      fe ? `plan_sevas updated, features regen failed: ${fe}` : (currently ? "Seva removed. features JSONB updated." : "Seva added. features JSONB updated."),
      !fe
    );
    setToggling(null);
    onUpdated();
  };

  const activeSevas = sevas.filter((s) => s.is_active);
  const activePlans = plans.filter((p) => p.is_active);

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl bg-amber-100/50" />)}</div>;

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`text-xs px-4 py-3 rounded-xl flex items-center gap-2 font-medium ${toast.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-900" : "bg-rose-50 border border-rose-200 text-rose-900"}`}>
          {toast.ok ? <Check className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {toast.text}
        </div>
      )}
      <Card className="border border-amber-900/10 bg-white overflow-hidden">
        <CardHeader className="pb-3 bg-amber-50/60 border-b border-amber-100">
          <CardTitle className="text-sm font-bold text-amber-950 flex items-center gap-2">
            <Grid className="w-4 h-4 text-amber-700" />
            plan_sevas Assignment Matrix
          </CardTitle>
          <p className="text-xs text-amber-900/70 mt-1">
            Toggle a seva per plan. Writes to <code className="bg-amber-100 px-1 rounded text-[10px] font-mono">plan_sevas</code> and
            auto-regenerates <code className="bg-amber-100 px-1 rounded text-[10px] font-mono">plans.features</code>. No code deploy needed.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#FDF3EB]">
                <tr className="border-b border-amber-100">
                  <th className="text-left px-4 py-3 font-bold text-slate-900 text-xs min-w-[200px]">Seva</th>
                  {activePlans.map((p) => (
                    <th key={p.id} className="px-3 py-3 font-bold text-slate-900 text-center text-xs min-w-[130px]">
                      <div className="font-extrabold">{p.name}</div>
                      <div className="text-[10px] text-amber-700 font-semibold mt-0.5">
                        Rs.{(p.price_paise / 100).toLocaleString("en-IN")}/{p.billing_period === "monthly" ? "mo" : "yr"}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeSevas.map((seva, i) => (
                  <tr key={seva.id} className={i % 2 === 0 ? "bg-white" : "bg-amber-50/30"}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800 text-xs">{seva.name}</div>
                      {seva.description && <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{seva.description}</div>}
                    </td>
                    {activePlans.map((plan) => {
                      const key = `${plan.id}:${seva.id}`;
                      const included = isIncluded(plan.id, seva.id);
                      const isSpinning = toggling === key;
                      return (
                        <td key={plan.id} className="px-3 py-3 text-center">
                          <button
                            id={`toggle-${plan.id}-${seva.id}`}
                            onClick={() => handleToggle(plan.id, seva.id)}
                            disabled={toggling !== null}
                            className={[
                              "w-9 h-9 rounded-full border-2 flex items-center justify-center mx-auto transition-all duration-150",
                              included ? "bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600 shadow-sm" : "bg-white border-slate-300 text-slate-400 hover:border-amber-400 hover:text-amber-700",
                              isSpinning ? "opacity-60 cursor-wait" : "cursor-pointer",
                              (toggling && !isSpinning) ? "opacity-40 cursor-not-allowed" : "",
                            ].filter(Boolean).join(" ")}
                            title={included ? `Remove ${seva.name} from ${plan.name}` : `Add ${seva.name} to ${plan.name}`}
                          >
                            {isSpinning ? <Loader2 className="w-4 h-4 animate-spin" /> : included ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {activeSevas.length === 0 && (
                  <tr><td colSpan={activePlans.length + 1} className="text-center py-10 text-xs text-slate-400">No active sevas. Add sevas in the Sevas tab.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-amber-100 p-4 bg-amber-50/40 space-y-3">
            <div className="text-xs font-bold text-amber-900/80 uppercase tracking-wider">Live plans.features (auto-generated)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activePlans.map((plan) => (
                <div key={plan.id} className="bg-white rounded-xl border border-amber-100 p-3 space-y-1.5">
                  <div className="font-bold text-xs text-slate-900">{plan.name}</div>
                  {Array.isArray(plan.features) && plan.features.length > 0 ? (
                    <ul className="space-y-1">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[10px] text-slate-700">
                          <Check className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />{f}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[10px] text-slate-400 italic">No features yet.</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      {plans.filter((p) => !p.is_active).length > 0 && (
        <div className="text-xs text-amber-800/70 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <EyeOff className="w-4 h-4 shrink-0 text-amber-600" />
          {plans.filter((p) => !p.is_active).length} inactive plan(s) hidden. Activate in Plans tab to manage assignments.
        </div>
      )}
    </div>
  );
}

// ─── Plans CRUD ────────────────────────────────────────────────────────────────
function PlansCrud({ plans, loading, onUpdated }: { plans: Plan[]; loading: boolean; onUpdated: () => void }) {
  const [editing, setEditing] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true); setError(null);
    const { error: err } = await supabase.from("plans").update({
      name: editing.name.trim(), price_paise: editing.price_paise,
      billing_period: editing.billing_period, tagline: editing.tagline?.trim() || null,
      highlight_text: editing.highlight_text?.trim() || null,
      card_image_url: editing.card_image_url?.trim() || null, is_active: editing.is_active,
    }).eq("id", editing.id);
    if (err) { setError(err.message); } else {
      setSuccessId(editing.id); setTimeout(() => setSuccessId(null), 2000);
      setEditing(null); onUpdated();
    }
    setSaving(false);
  };

  // Soft-delete toggle only — no hard delete exists anywhere in this module
  const toggleActive = async (plan: Plan) => {
    const { error: err } = await supabase.from("plans").update({ is_active: !plan.is_active }).eq("id", plan.id);
    if (!err) onUpdated();
  };

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl bg-amber-100/50" />)}</div>;

  return (
    <div className="space-y-4">
      {error && <div className="bg-rose-50 border border-rose-200 text-rose-900 text-xs px-4 py-3 rounded-xl">{error}</div>}
      <div className="space-y-3">
        {plans.map((plan) => (
          <Card key={plan.id} className={`border transition-all duration-200 ${plan.is_active ? "border-amber-900/10 bg-white" : "border-slate-200 bg-slate-50/50"} ${successId === plan.id ? "ring-2 ring-emerald-400" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{plan.name}</span>
                    <code className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono">{plan.slug}</code>
                    <Badge variant={plan.is_active ? "default" : "secondary"} className={`text-[10px] ${plan.is_active ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-slate-100 text-slate-600"}`}>
                      {plan.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">{plan.billing_period}</Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-600">
                    <span className="font-mono font-bold text-amber-800">Rs.{(plan.price_paise / 100).toLocaleString("en-IN")}</span>
                    {plan.tagline && <span className="text-slate-500 line-clamp-1 max-w-xs">{plan.tagline}</span>}
                  </div>
                  {plan.features && plan.features.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {plan.features.slice(0, 3).map((f, i) => <span key={i} className="text-[10px] bg-amber-50 border border-amber-100 text-amber-800 px-1.5 py-0.5 rounded">{f}</span>)}
                      {plan.features.length > 3 && <span className="text-[10px] text-slate-400">+{plan.features.length - 3} more</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button id={`plan-toggle-active-${plan.id}`} onClick={() => toggleActive(plan)}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${plan.is_active ? "border-amber-300 text-amber-800 hover:bg-amber-50" : "border-emerald-300 text-emerald-800 hover:bg-emerald-50"}`}>
                    {plan.is_active ? <><EyeOff className="w-3 h-3" /> Deactivate</> : <><Eye className="w-3 h-3" /> Activate</>}
                  </button>
                  <button id={`plan-edit-${plan.id}`} onClick={() => setEditing({ ...plan })}
                    className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">Edit Plan &mdash; {editing?.name}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Name</Label>
                <Input id="edit-plan-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Price (paise)</Label>
                  <Input id="edit-plan-price" type="number" value={editing.price_paise} onChange={(e) => setEditing({ ...editing, price_paise: parseInt(e.target.value) || 0 })} className="text-sm font-mono" />
                  <p className="text-[10px] text-slate-400">= Rs.{(editing.price_paise / 100).toLocaleString("en-IN")}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Billing Period</Label>
                  <Select value={editing.billing_period} onValueChange={(v) => setEditing({ ...editing, billing_period: v as "monthly" | "yearly" })}>
                    <SelectTrigger id="edit-plan-billing" className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Tagline</Label>
                <Textarea id="edit-plan-tagline" value={editing.tagline ?? ""} onChange={(e) => setEditing({ ...editing, tagline: e.target.value })} rows={2} className="text-sm resize-none" placeholder="Short plan description..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Highlight Text</Label>
                <Input id="edit-plan-highlight" value={editing.highlight_text ?? ""} onChange={(e) => setEditing({ ...editing, highlight_text: e.target.value })} className="text-sm" placeholder="e.g. Most Popular" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Card Image URL</Label>
                <Input id="edit-plan-image" value={editing.card_image_url ?? ""} onChange={(e) => setEditing({ ...editing, card_image_url: e.target.value })} className="text-sm font-mono" placeholder="https://..." />
              </div>
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <Switch id="edit-plan-active" checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                <div>
                  <Label htmlFor="edit-plan-active" className="text-sm font-semibold text-slate-800 cursor-pointer">Active Plan</Label>
                  <p className="text-[10px] text-slate-500 mt-0.5">Inactive plans hidden but never deleted (soft-delete only).</p>
                </div>
              </div>
              {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => { setEditing(null); setError(null); }}>Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={saving} className="bg-amber-700 hover:bg-amber-800 text-white">
                  {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving...</> : <><Check className="w-3.5 h-3.5 mr-1.5" />Save Changes</>}
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
function SevasCrud({ sevas, loading, onUpdated }: { sevas: Seva[]; loading: boolean; onUpdated: () => void }) {
  const [editing, setEditing] = useState<Seva | null>(null);
  const [creating, setCreating] = useState(false);
  const [newSeva, setNewSeva] = useState<Partial<Seva>>({ name: "", slug: "", description: "", sort_order: 0, is_active: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const handleSaveEdit = async () => {
    if (!editing) return;
    setSaving(true); setError(null);
    const { error: err } = await supabase.from("sevas").update({
      name: editing.name.trim(), slug: editing.slug.trim(),
      description: editing.description?.trim() || null,
      sort_order: editing.sort_order, is_active: editing.is_active,
    }).eq("id", editing.id);
    if (err) { setError(err.message); } else {
      setSuccessId(editing.id); setTimeout(() => setSuccessId(null), 2000);
      setEditing(null); onUpdated();
    }
    setSaving(false);
  };

  const handleCreate = async () => {
    if (!newSeva.name?.trim() || !newSeva.slug?.trim()) { setError("Name and slug are required."); return; }
    setSaving(true); setError(null);
    const { error: err } = await supabase.from("sevas").insert({
      name: newSeva.name.trim(), slug: newSeva.slug.trim(),
      description: newSeva.description?.trim() || null,
      sort_order: newSeva.sort_order ?? 0, is_active: newSeva.is_active ?? true,
    });
    if (err) { setError(err.message); } else {
      setCreating(false);
      setNewSeva({ name: "", slug: "", description: "", sort_order: 0, is_active: true });
      onUpdated();
    }
    setSaving(false);
  };

  // Soft-delete only — no hard delete button anywhere in this module
  const toggleActive = async (seva: Seva) => {
    const { error: err } = await supabase.from("sevas").update({ is_active: !seva.is_active }).eq("id", seva.id);
    if (!err) onUpdated();
  };

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl bg-amber-100/50" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button id="create-seva-btn" size="sm" onClick={() => setCreating(true)} className="bg-amber-700 hover:bg-amber-800 text-white text-xs">
          <Plus className="w-3.5 h-3.5 mr-1.5" />New Seva
        </Button>
      </div>
      {error && <div className="bg-rose-50 border border-rose-200 text-rose-900 text-xs px-4 py-3 rounded-xl">{error}</div>}
      <div className="space-y-3">
        {sevas.map((seva) => (
          <Card key={seva.id} className={`border transition-all ${seva.is_active ? "border-amber-900/10 bg-white" : "border-slate-200 bg-slate-50/50"} ${successId === seva.id ? "ring-2 ring-emerald-400" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm">{seva.name}</span>
                    <code className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono">{seva.slug}</code>
                    <span className="text-[10px] text-slate-400">sort #{seva.sort_order}</span>
                    <Badge variant={seva.is_active ? "default" : "secondary"} className={`text-[10px] ${seva.is_active ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-slate-100 text-slate-600"}`}>
                      {seva.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {seva.description && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{seva.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button id={`seva-toggle-${seva.id}`} onClick={() => toggleActive(seva)}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${seva.is_active ? "border-amber-300 text-amber-800 hover:bg-amber-50" : "border-emerald-300 text-emerald-800 hover:bg-emerald-50"}`}>
                    {seva.is_active ? <><EyeOff className="w-3 h-3" /> Deactivate</> : <><Eye className="w-3 h-3" /> Activate</>}
                  </button>
                  <button id={`seva-edit-${seva.id}`} onClick={() => setEditing({ ...seva })}
                    className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="text-base font-bold text-slate-900">Edit Seva &mdash; {editing?.name}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Name</Label>
                  <Input id="edit-seva-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Slug (unique)</Label>
                  <Input id="edit-seva-slug" value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} className="text-sm font-mono" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Description</Label>
                <Textarea id="edit-seva-desc" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={3} className="text-sm resize-none" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Sort Order</Label>
                <Input id="edit-seva-sort" type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: parseInt(e.target.value) || 0 })} className="text-sm font-mono w-24" />
              </div>
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <Switch id="edit-seva-active" checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                <div>
                  <Label htmlFor="edit-seva-active" className="text-sm font-semibold text-slate-800 cursor-pointer">Active Seva</Label>
                  <p className="text-[10px] text-slate-500 mt-0.5">Inactive sevas hidden from assignment but never deleted.</p>
                </div>
              </div>
              {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => { setEditing(null); setError(null); }}>Cancel</Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={saving} className="bg-amber-700 hover:bg-amber-800 text-white">
                  {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving...</> : <><Check className="w-3.5 h-3.5 mr-1.5" />Save</>}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="text-base font-bold text-slate-900">Create New Seva</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Name *</Label>
                <Input id="create-seva-name" value={newSeva.name ?? ""} onChange={(e) => setNewSeva({ ...newSeva, name: e.target.value })} className="text-sm" placeholder="Sundarkand Path" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Slug * (unique)</Label>
                <Input id="create-seva-slug" value={newSeva.slug ?? ""} onChange={(e) => setNewSeva({ ...newSeva, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} className="text-sm font-mono" placeholder="sundarkand-path" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Description</Label>
              <Textarea id="create-seva-desc" value={newSeva.description ?? ""} onChange={(e) => setNewSeva({ ...newSeva, description: e.target.value })} rows={3} className="text-sm resize-none" placeholder="Brief description..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Sort Order</Label>
              <Input id="create-seva-sort" type="number" value={newSeva.sort_order ?? 0} onChange={(e) => setNewSeva({ ...newSeva, sort_order: parseInt(e.target.value) || 0 })} className="text-sm font-mono w-24" />
            </div>
            {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => { setCreating(false); setError(null); }}>Cancel</Button>
              <Button id="create-seva-submit" size="sm" onClick={handleCreate} disabled={saving} className="bg-amber-700 hover:bg-amber-800 text-white">
                {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creating...</> : <><Plus className="w-3.5 h-3.5 mr-1.5" />Create Seva</>}
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
  sevas, scheduleRules, loading, onUpdated,
}: {
  sevas: Seva[]; scheduleRules: SevaScheduleRule[]; loading: boolean; onUpdated: () => void;
}) {
  // Default matches the live List A rule: 2nd Tuesday.
  const [adding, setAdding] = useState({ sevaId: "", weekday: "TUE", occurrence: "second" });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!adding.sevaId) { setError("Select a seva."); return; }
    setSaving(true); setError(null);
    const { error: err } = await supabase.from("seva_schedule_rules").insert({
      seva_id: adding.sevaId, weekday: adding.weekday, occurrence: adding.occurrence,
    });
    if (err) { setError(err.message); } else {
      setAdding({ sevaId: "", weekday: "TUE", occurrence: "second" }); onUpdated();
    }
    setSaving(false);
  };

  const handleRemove = async (ruleId: string) => {
    setRemoving(ruleId);
    await supabase.from("seva_schedule_rules").delete().eq("id", ruleId);
    setRemoving(null); onUpdated();
  };

  const rulesBySeva = sevas.map((seva) => ({ seva, rules: scheduleRules.filter((r) => r.seva_id === seva.id) }));

  if (loading) return <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl bg-amber-100/50" />)}</div>;

  return (
    <div className="space-y-4">
      {error && <div className="bg-rose-50 border border-rose-200 text-rose-900 text-xs px-4 py-3 rounded-xl">{error}</div>}
      <Card className="border border-amber-200 bg-amber-50/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-amber-950 flex items-center gap-2"><Plus className="w-4 h-4" />Add Schedule Rule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5 min-w-[180px] flex-1">
              <Label className="text-xs font-semibold text-slate-700">Seva</Label>
              <Select value={adding.sevaId} onValueChange={(v) => setAdding({ ...adding, sevaId: v })}>
                <SelectTrigger id="schedule-seva-select" className="text-sm"><SelectValue placeholder="Select seva..." /></SelectTrigger>
                <SelectContent>{sevas.filter((s) => s.is_active).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Weekday</Label>
              <Select value={adding.weekday} onValueChange={(v) => setAdding({ ...adding, weekday: v })}>
                <SelectTrigger id="schedule-weekday-select" className="text-sm w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{WEEKDAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Occurrence</Label>
              <Select value={adding.occurrence} onValueChange={(v) => setAdding({ ...adding, occurrence: v })}>
                <SelectTrigger id="schedule-occurrence-select" className="text-sm w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{OCCURRENCES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button id="schedule-add-btn" size="sm" onClick={handleAdd} disabled={saving} className="bg-amber-700 hover:bg-amber-800 text-white">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5 mr-1" />Add</>}
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-3">
        {rulesBySeva.filter((g) => g.rules.length > 0).map(({ seva, rules }) => (
          <Card key={seva.id} className="border border-amber-900/10 bg-white">
            <CardContent className="p-4">
              <div className="font-semibold text-slate-900 text-sm mb-2">{seva.name}</div>
              <div className="flex flex-wrap gap-2">
                {rules.map((rule) => (
                  <div key={rule.id} className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 text-xs font-semibold text-amber-800">
                    <Clock className="w-3 h-3 text-amber-600" />
                    {rule.occurrence} {rule.weekday}
                    <button id={`remove-rule-${rule.id}`} onClick={() => handleRemove(rule.id)} disabled={removing === rule.id} className="ml-1 hover:text-rose-600 transition-colors" title="Remove rule">
                      {removing === rule.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {rulesBySeva.every((g) => g.rules.length === 0) && (
          <div className="text-center py-10 text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-100">No schedule rules defined. Add rules above.</div>
        )}
      </div>
    </div>
  );
}

// ─── Plan Addon Editor ─────────────────────────────────────────────────────────
function PlanAddonEditor({
  plans, planAddons, sevas, planSevas, loading, onUpdated,
}: {
  plans: Plan[]; planAddons: PlanAddon[]; sevas: Seva[]; planSevas: PlanSeva[];
  loading: boolean; onUpdated: () => void;
}) {
  const [toggling, setToggling] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const getAddon = (planId: string, type: string) => planAddons.find((a) => a.plan_id === planId && a.addon_type === type);

  const handleToggleAddon = async (plan: Plan, addonType: "prasad" | "certificate") => {
    const key = `${plan.id}:${addonType}`;
    setToggling(key); setError(null);
    const existing = getAddon(plan.id, addonType);
    if (existing) {
      // Soft-toggle — never delete the row
      const { error: err } = await supabase.from("plan_addons").update({ is_active: !existing.is_active }).eq("id", existing.id);
      if (err) { setError(err.message); setToggling(null); return; }
    } else {
      const defaultDesc = addonType === "prasad"
        ? "Quarterly Prasad Box — pavitra prasad ghar par daak dwara"
        : "Sankalp Certificate — sankalp praamanpatra varshik";
      const { error: err } = await supabase.from("plan_addons").insert({ plan_id: plan.id, addon_type: addonType, description: defaultDesc, is_active: true });
      if (err) { setError(err.message); setToggling(null); return; }
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
      (freshAddons as PlanAddon[]) ?? planAddons
    );
    if (fe) { showToast(`Addon updated, features regen failed: ${fe}`); } else { showToast(`${addonType} toggled. features JSONB updated.`); }
    setToggling(null); onUpdated();
  };

  if (loading) return <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl bg-amber-100/50" />)}</div>;

  return (
    <div className="space-y-4">
      {toast && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />{toast}
        </div>
      )}
      {error && <div className="bg-rose-50 border border-rose-200 text-rose-900 text-xs px-4 py-3 rounded-xl">{error}</div>}
      <div className="space-y-3">
        {plans.map((plan) => {
          const prasad = getAddon(plan.id, "prasad");
          const cert = getAddon(plan.id, "certificate");
          return (
            <Card key={plan.id} className="border border-amber-900/10 bg-white">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <span className="font-bold text-slate-900">{plan.name}</span>
                  <code className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono">{plan.slug}</code>
                  {!plan.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${prasad?.is_active ? "bg-amber-50 border-amber-300" : "bg-white border-slate-200"}`}>
                    <div className="flex items-center gap-2">
                      <Package className={`w-4 h-4 shrink-0 ${prasad?.is_active ? "text-amber-600" : "text-slate-400"}`} />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Prasad Box</div>
                        <div className="text-[10px] text-slate-500">Quarterly delivery</div>
                      </div>
                    </div>
                    <Switch id={`addon-prasad-${plan.id}`} checked={prasad?.is_active ?? false} disabled={toggling === `${plan.id}:prasad`} onCheckedChange={() => handleToggleAddon(plan, "prasad")} />
                  </div>
                  <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${cert?.is_active ? "bg-blue-50 border-blue-300" : "bg-white border-slate-200"}`}>
                    <div className="flex items-center gap-2">
                      <Award className={`w-4 h-4 shrink-0 ${cert?.is_active ? "text-blue-600" : "text-slate-400"}`} />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Sankalp Certificate</div>
                        <div className="text-[10px] text-slate-500">Annual praamanpatra</div>
                      </div>
                    </div>
                    <Switch id={`addon-certificate-${plan.id}`} checked={cert?.is_active ?? false} disabled={toggling === `${plan.id}:certificate`} onCheckedChange={() => handleToggleAddon(plan, "certificate")} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="text-xs text-amber-800/70 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <strong>Note:</strong> Toggling off sets <code className="bg-amber-100 px-1 rounded text-[10px] font-mono">is_active = false</code> &mdash; the row is never deleted.
        Every toggle auto-regenerates <code className="bg-amber-100 px-1 rounded text-[10px] font-mono">plans.features</code>.
      </div>
    </div>
  );
}
