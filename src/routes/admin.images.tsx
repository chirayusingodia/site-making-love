import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  fetchSiteImageOverrides,
  saveSiteImageOverride,
  deleteSiteImageOverride,
  type SiteImageOverrideRow,
} from "@/lib/site-image-overrides";
import { SITE_IMAGES, setSiteImageOverride } from "@/lib/site-images";
import { setTestimonialAvatarOverride } from "@/lib/plans";
import { IMAGE_SLOT_SECTIONS, type ImageSlot } from "@/lib/image-slots";
import { CldImage } from "@/components/CldImage";
import { CloudinaryImageButton } from "@/components/admin/CloudinaryImageButton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageIcon, ExternalLink, RotateCcw, Info } from "lucide-react";

// Admin/owner tier — no extra beforeLoad needed here, the parent /admin
// shell already redirects non-staff. Same pattern as /admin/seo.
export const Route = createFileRoute("/admin/images")({
  component: AdminImagesPage,
});

interface PlanCardRow {
  id: string;
  slug: string;
  name: string;
  card_image_url: string | null;
}

function AdminImagesPage() {
  const [overrides, setOverrides] = useState<Map<string, SiteImageOverrideRow>>(new Map());
  const [plans, setPlans] = useState<PlanCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overrideRows, plansRes] = await Promise.all([
        fetchSiteImageOverrides(),
        supabase
          .from("plans")
          .select("id, slug, name, card_image_url")
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      if (plansRes.error) throw new Error(plansRes.error.message);
      setOverrides(new Map(overrideRows.map((r) => [r.slot_key, r])));
      setPlans((plansRes.data ?? []) as PlanCardRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-amber-700" />
          Photos
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Site ki koi bhi photo yahan se badal sakte hain — phone se seedha upload karein.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-2.5 text-xs text-amber-900">
        <Info className="w-4 h-4 flex-none mt-0.5 text-amber-700" />
        <p>
          Har card ke neeche wahi photo dikh rahi hai jo abhi live site par hai. "Photo Badlein" dabakar
          camera ya gallery se nayi photo चुनें — save hote hi live site par turant badal jaayegi.{" "}
          <strong>Agar upload fail ho jaaye, to purani photo bilkul waisi hi lagi rahegi</strong> — site kabhi
          blank nahi hogi.
        </p>
      </div>

      {loading && <Skeleton className="h-64 w-full rounded-2xl" />}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          {IMAGE_SLOT_SECTIONS.map((section) => (
            <section key={section.title} className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">{section.title}</h2>
                  <p className="text-xs text-slate-500 mt-0.5 max-w-xl">{section.description}</p>
                </div>
                <a
                  href={section.livePage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 whitespace-nowrap"
                >
                  Live site par dekhein <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {section.slots.map((slot) => (
                  <SlotCard
                    key={slot.kind === "site_image" ? slot.key : slot.slotKey}
                    slot={slot}
                    override={
                      overrides.get(slot.kind === "site_image" ? slot.key : slot.slotKey) ?? null
                    }
                    onChanged={(slotKey, row) =>
                      setOverrides((prev) => {
                        const next = new Map(prev);
                        if (row) next.set(slotKey, row);
                        else next.delete(slotKey);
                        return next;
                      })
                    }
                  />
                ))}
              </div>
            </section>
          ))}

          <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Plan Card Thumbnails</h2>
                <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
                  /plans page par har plan card ke top par dikhne wali photo.
                </p>
              </div>
              <a
                href="/plans"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 whitespace-nowrap"
              >
                Live site par dekhein <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {plans.map((plan) => (
                <PlanCardSlot
                  key={plan.id}
                  plan={plan}
                  onChanged={(cardImageUrl) =>
                    setPlans((prev) =>
                      prev.map((p) => (p.id === plan.id ? { ...p, card_image_url: cardImageUrl } : p)),
                    )
                  }
                />
              ))}
              {plans.length === 0 && (
                <div className="text-slate-400 text-sm px-2 py-4 col-span-full text-center">
                  Koi active plan nahi mila.
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function SlotCard({
  slot,
  override,
  onChanged,
}: {
  slot: ImageSlot;
  override: SiteImageOverrideRow | null;
  onChanged: (slotKey: string, row: SiteImageOverrideRow | null) => void;
}) {
  const slotKey = slot.kind === "site_image" ? slot.key : slot.slotKey;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleUploaded(secureUrl: string, publicId: string) {
    setErr(null);
    setBusy(true);
    try {
      const row = await saveSiteImageOverride(slotKey, secureUrl, publicId);
      if (slot.kind === "site_image") setSiteImageOverride(slot.key, publicId);
      else setTestimonialAvatarOverride(slot.reviewIndex, secureUrl);
      await logAdminAudit("site_image.upload", "site_image_overrides", slotKey, { slotKey, label: slot.label });
      onChanged(slotKey, row);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed — photo purani hi rahegi.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setErr(null);
    setBusy(true);
    try {
      await deleteSiteImageOverride(slotKey);
      if (slot.kind === "site_image") setSiteImageOverride(slot.key, "");
      else setTestimonialAvatarOverride(slot.reviewIndex, undefined);
      await logAdminAudit("site_image.reset", "site_image_overrides", slotKey, { slotKey, label: slot.label });
      onChanged(slotKey, null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  const isCustom = !!override;

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2.5">
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 flex-none bg-slate-50">
          {slot.kind === "site_image" ? (
            <CldImage
              publicId={override?.cloudinary_public_id ?? SITE_IMAGES[slot.key].publicId}
              fallback={SITE_IMAGES[slot.key].fallback}
              alt={slot.label}
              width={64}
              height={64}
              sizes="64px"
              crop="fill"
              className="w-full h-full object-cover"
            />
          ) : override ? (
            <img src={override.image_url} alt={slot.label} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 text-center px-1">
              Initials
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 leading-snug">{slot.label}</p>
          <span
            className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${
              isCustom
                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                : "bg-slate-100 text-slate-600 border-slate-200"
            }`}
          >
            {isCustom ? "Custom photo lagi hai" : "Default photo"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <CloudinaryImageButton
          folder={`punyata-site/manifest/${slotKey}`}
          label={busy ? "..." : "Photo Badlein"}
          onUploaded={handleUploaded}
        />
        {isCustom && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={handleReset}
            className="gap-1 text-xs text-slate-600"
          >
            <RotateCcw className="w-3 h-3" /> Default
          </Button>
        )}
      </div>
      {err && <p className="text-[11px] text-rose-600">{err}</p>}
    </div>
  );
}

function PlanCardSlot({
  plan,
  onChanged,
}: {
  plan: PlanCardRow;
  onChanged: (cardImageUrl: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(cardImageUrl: string | null) {
    setErr(null);
    setBusy(true);
    try {
      const { error } = await supabase
        .from("plans")
        .update({ card_image_url: cardImageUrl })
        .eq("id", plan.id);
      if (error) throw new Error(error.message);
      await logAdminAudit("plans.card_image_url", "plans", plan.id, { cardImageUrl });
      onChanged(cardImageUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed — photo purani hi rahegi.");
    } finally {
      setBusy(false);
    }
  }

  const isCustom = !!plan.card_image_url;

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2.5">
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 flex-none bg-slate-50">
          {plan.card_image_url ? (
            <img src={plan.card_image_url} alt={plan.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 text-center px-1">
              Nahi set
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 leading-snug">{plan.name}</p>
          <span
            className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${
              isCustom
                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                : "bg-slate-100 text-slate-600 border-slate-200"
            }`}
          >
            {isCustom ? "Custom photo lagi hai" : "Nahi set"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <CloudinaryImageButton
          folder="punyata-site/plans"
          label={busy ? "..." : "Photo Badlein"}
          onUploaded={(secureUrl) => save(secureUrl)}
        />
        {isCustom && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => save(null)}
            className="gap-1 text-xs text-slate-600"
          >
            <RotateCcw className="w-3 h-3" /> Hataayein
          </Button>
        )}
      </div>
      {err && <p className="text-[11px] text-rose-600">{err}</p>}
    </div>
  );
}
