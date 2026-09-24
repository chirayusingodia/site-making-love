import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Link2, Loader2, MessageCircle } from "lucide-react";
import { callAdminApi } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/telecaller/refer-link")({
  component: ReferLinkPage,
});

interface PlanOption {
  slug: string;
  name: string;
  billing_period: string;
  price_paise: number;
}

interface ReferralLinkResult {
  planName: string;
  planSlug: string;
  shareLink: string;
  waLink: string;
}

function fmtPrice(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

// Self-serve referral link — NOT tied to any one lead (that flow
// lives on /telecaller/lead/$leadId). She picks a plan here and gets
// back one stable link for herself + that plan, forever. Anyone who
// completes checkout through it is stamped with her telecaller_id
// exactly like the lead flow (create-checkout.ts resolves
// telecaller_referral_links.token the same way it resolves
// leads.attribution_token) — same commission ledger, no separate
// payout mechanism (§9/§10 of migration 013).
function ReferLinkPage() {
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [planSel, setPlanSel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, ReferralLinkResult>>({});

  useEffect(() => {
    callAdminApi<{ plans: PlanOption[] }>("/api/telecaller/plans")
      .then((r) => setPlans(r.plans))
      .catch(() => setPlans([]));
  }, []);

  async function generate() {
    if (!planSel) return;
    setBusy(true);
    setError(null);
    try {
      const res = await callAdminApi<ReferralLinkResult>("/api/telecaller/referral-link", {
        plan_id_or_slug: planSel,
      });
      setLinks((prev) => ({ ...prev, [res.planSlug]: res }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link ban nahi paya");
    } finally {
      setBusy(false);
    }
  }

  const activeResult = planSel ? links[planSel] : null;

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Link2 className="w-5 h-5 text-indigo-700" />
          Apna Referral Link
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Package chunein, link generate karein, aur khud se kisi ko bhi bhejein — usi link se koi
          join kare toh commission aapko milegi. Kisi lead ki zaroorat nahi.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <select
            value={planSel}
            onChange={(e) => setPlanSel(e.target.value)}
            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Package chunein…</option>
            {plans.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name} ({p.billing_period}) — {fmtPrice(p.price_paise)}
              </option>
            ))}
          </select>
          <Button
            onClick={generate}
            disabled={!planSel || busy}
            size="sm"
            className="bg-indigo-700 hover:bg-indigo-800 h-9"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Link generate karein"}
          </Button>
        </div>
        {error && <div className="text-xs text-red-700">{error}</div>}

        {activeResult && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-2">
            <div className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {activeResult.planName} ka link taiyaar
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-[11px] bg-white border border-slate-200 rounded px-2 py-1 break-all max-w-full">
                {activeResult.shareLink}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(activeResult.shareLink)}
                className="gap-1 h-9 md:h-7 text-xs"
              >
                <Copy className="w-3 h-3" /> Copy
              </Button>
              <a href={activeResult.waLink} target="_blank" rel="noreferrer">
                <Button
                  size="sm"
                  className="gap-1.5 h-9 md:h-7 text-xs bg-emerald-700 hover:bg-emerald-800"
                >
                  <MessageCircle className="w-3 h-3" /> WhatsApp par bhejein
                </Button>
              </a>
            </div>
          </div>
        )}

        {Object.keys(links).length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-500 mb-1.5">
              Aapke pehle se bane links
            </div>
            <div className="space-y-1.5">
              {Object.values(links).map((r) => (
                <div
                  key={r.planSlug}
                  className="flex items-center gap-2 flex-wrap text-xs text-slate-600"
                >
                  <span className="font-medium text-slate-800 min-w-24">{r.planName}</span>
                  <code className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 break-all">
                    {r.shareLink}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(r.shareLink)}
                    className="gap-1 h-7 text-[11px]"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-slate-400 pt-1">
          Yeh link ek hi rehta hai — dobara generate karne par same link milega. Isse jo bhi
          customer join karega, aapki "Meri Kamai" mein commission dikhega.
        </p>
      </div>
    </div>
  );
}
