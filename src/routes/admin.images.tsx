import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  fetchSiteImageOverrides,
  saveSiteImageOverride,
  deleteSiteImageOverride,
  type SiteImageOverrideRow,
} from "@/lib/site-image-overrides";
import {
  fetchProofGalleryItems,
  addProofGalleryItem,
  deleteProofGalleryItem,
  updateProofGalleryItemOrder,
  type ProofGalleryItem,
} from "@/lib/proof-gallery-items";
import { SITE_IMAGES, setSiteImageOverride } from "@/lib/site-images";
import { setTestimonialAvatarOverride } from "@/lib/plans";
import { IMAGE_SLOT_SECTIONS, type ImageSlot } from "@/lib/image-slots";
import { CldImage } from "@/components/CldImage";
import { CloudinaryImageButton } from "@/components/admin/CloudinaryImageButton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Notice, PageHeader, Panel, StatusPill } from "@/components/admin/admin-ui";
import { ImageIcon, ExternalLink, RotateCcw, Info, Trash2, ArrowUp, ArrowDown } from "lucide-react";

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
  const [proofItems, setProofItems] = useState<ProofGalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overrideRows, plansRes, proofRows] = await Promise.all([
        fetchSiteImageOverrides(),
        supabase
          .from("plans")
          .select("id, slug, name, card_image_url")
          .eq("is_active", true)
          .order("sort_order"),
        fetchProofGalleryItems(),
      ]);
      if (plansRes.error) throw new Error(plansRes.error.message);
      setOverrides(new Map(overrideRows.map((r) => [r.slot_key, r])));
      setPlans((plansRes.data ?? []) as PlanCardRow[]);
      setProofItems(proofRows);
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
    <div className="space-y-6">
      <PageHeader
        title="Photos"
        description="Site ki koi bhi photo yahan se badal sakte hain — phone se seedha upload karein."
      />

      <Notice tone="info" icon={Info}>
        <p className="text-[13px] leading-relaxed">
          Har card ke neeche wahi photo dikh rahi hai jo abhi live site par hai. "Photo Badlein"
          dabakar camera ya gallery se nayi photo चुनें — save hote hi live site par turant badal
          jaayegi.{" "}
          <strong className="font-medium">
            Agar upload fail ho jaaye, to purani photo bilkul waisi hi lagi rahegi
          </strong>{" "}
          — site kabhi blank nahi hogi.
        </p>
      </Notice>

      {loading && <Skeleton className="h-64 w-full rounded-xl" />}
      {error && <Notice tone="bad">{error}</Notice>}

      {!loading && !error && (
        <div className="space-y-6">
          {IMAGE_SLOT_SECTIONS.map((section) => (
            <Panel
              key={section.title}
              title={section.title}
              description={section.description}
              actions={<LiveLink href={section.livePage} />}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
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
              {section.title === "Location व Proof Gallery" && (
                <ProofGalleryExtras items={proofItems} onChanged={setProofItems} />
              )}
            </Panel>
          ))}

          <Panel
            title="Plan Card Thumbnails"
            description="/plans page par har plan card ke top par dikhne wali photo."
            actions={<LiveLink href="/plans" />}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {plans.map((plan) => (
                <PlanCardSlot
                  key={plan.id}
                  plan={plan}
                  onChanged={(cardImageUrl) =>
                    setPlans((prev) =>
                      prev.map((p) =>
                        p.id === plan.id ? { ...p, card_image_url: cardImageUrl } : p,
                      ),
                    )
                  }
                />
              ))}
              {plans.length === 0 && (
                <EmptyState
                  icon={ImageIcon}
                  title="Koi active plan nahi mila."
                  className="col-span-full"
                />
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function LiveLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:text-orange-800 whitespace-nowrap"
    >
      Live site par dekhein <ExternalLink className="w-3 h-3" />
    </a>
  );
}

/** Thumbnail + label + status row shared by the slot cards. */
function SlotThumbRow({
  thumb,
  label,
  isCustom,
  defaultText,
}: {
  thumb: ReactNode;
  label: string;
  isCustom: boolean;
  defaultText: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 h-16 rounded-lg overflow-hidden border border-stone-200 flex-none bg-stone-50">
        {thumb}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-900 leading-snug break-words">{label}</p>
        <div className="mt-1">
          <StatusPill tone={isCustom ? "good" : "neutral"}>
            {isCustom ? "Custom photo lagi hai" : defaultText}
          </StatusPill>
        </div>
      </div>
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
      await logAdminAudit("site_image.upload", "site_image_overrides", null, {
        slotKey,
        label: slot.label,
      });
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
      await logAdminAudit("site_image.reset", "site_image_overrides", null, {
        slotKey,
        label: slot.label,
      });
      onChanged(slotKey, null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  const isCustom = !!override;

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3 space-y-3">
      <SlotThumbRow
        label={slot.label}
        isCustom={isCustom}
        defaultText="Default photo"
        thumb={
          slot.kind === "site_image" ? (
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
            <div className="w-full h-full flex items-center justify-center text-[11px] text-stone-400 text-center px-1">
              Initials
            </div>
          )
        }
      />
      <div className="flex flex-wrap items-start gap-2">
        <CloudinaryImageButton
          folder={`punyata-site/manifest/${slotKey}`}
          label={busy ? "..." : "Photo Badlein"}
          onUploaded={handleUploaded}
        />
        {isCustom && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={handleReset}
            className="h-9 sm:h-8 gap-1 text-xs text-stone-600"
          >
            <RotateCcw className="w-3 h-3" /> Default
          </Button>
        )}
      </div>
      {err && <p className="text-xs text-rose-600 break-words">{err}</p>}
    </div>
  );
}

/**
 * Extra Proof Gallery photos — unlimited count, appended after the 4 fixed
 * core thumbnails on the live site (see proof-gallery-items.ts). Lives
 * inside the "Location व Proof Gallery" admin section rather than its own
 * page, right next to the 4 fixed slots it supplements.
 */
function ProofGalleryExtras({
  items,
  onChanged,
}: {
  items: ProofGalleryItem[];
  onChanged: (items: ProofGalleryItem[]) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleAdd(secureUrl: string, publicId: string, kind: "photo" | "whatsapp") {
    setErr(null);
    try {
      const nextOrder = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;
      const row = await addProofGalleryItem(secureUrl, publicId, nextOrder, kind);
      await logAdminAudit("proof_gallery.add", "proof_gallery_items", row.id, { kind });
      onChanged([...items, row]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Add failed");
    }
  }

  async function handleDelete(id: string) {
    setErr(null);
    setBusyId(id);
    try {
      await deleteProofGalleryItem(id);
      await logAdminAudit("proof_gallery.delete", "proof_gallery_items", id, {});
      onChanged(items.filter((i) => i.id !== id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setErr(null);
    const a = items[index];
    const b = items[target];
    setBusyId(a.id);
    try {
      await Promise.all([
        updateProofGalleryItemOrder(a.id, b.sort_order),
        updateProofGalleryItemOrder(b.id, a.sort_order),
      ]);
      const next = [...items];
      next[index] = { ...b, sort_order: a.sort_order };
      next[target] = { ...a, sort_order: b.sort_order };
      onChanged(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reorder failed");
    } finally {
      setBusyId(null);
    }
  }

  const photoItems = items.filter((i) => i.kind === "photo");
  const whatsappItems = items.filter((i) => i.kind === "whatsapp");

  function renderGroup(groupItems: ProofGalleryItem[]) {
    if (groupItems.length === 0) return null;
    return (
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {groupItems.map((item) => {
          const i = items.indexOf(item);
          return (
            <div
              key={item.id}
              className="rounded-lg border border-stone-200 bg-white p-2 space-y-2"
            >
              <div
                className={`w-full rounded-md overflow-hidden bg-stone-50 ${
                  item.kind === "whatsapp" ? "aspect-[3/4]" : "aspect-square"
                }`}
              >
                <img
                  src={item.image_url}
                  alt={item.alt_text}
                  className={`w-full h-full ${item.kind === "whatsapp" ? "object-contain" : "object-cover"}`}
                />
              </div>
              <div className="flex items-center justify-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === item.id || i === 0}
                  onClick={() => handleMove(i, -1)}
                  className="h-9 w-9 sm:h-8 sm:w-8 p-0"
                >
                  <ArrowUp className="w-3 h-3" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === item.id || i === items.length - 1}
                  onClick={() => handleMove(i, 1)}
                  className="h-9 w-9 sm:h-8 sm:w-8 p-0"
                >
                  <ArrowDown className="w-3 h-3" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === item.id}
                  onClick={() => handleDelete(item.id)}
                  className="h-9 w-9 sm:h-8 sm:w-8 p-0 text-rose-600 hover:text-rose-700"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-5 pt-5 border-t border-stone-100 space-y-6">
      <div>
        <p className="text-sm font-medium text-stone-900">
          Extra Photos (ghat, havan, gau seva — jitni chahein utni)
        </p>
        <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
          Reviews page ke "Proof Gallery" grid mein dikhengi — square crop hoga, isliye scenic photo
          hi daalein, screenshot nahi.
        </p>
        {renderGroup(photoItems)}
        <div className="mt-3">
          <CloudinaryImageButton
            folder="punyata-site/proof-gallery"
            label="+ Photo Add Karein"
            onUploaded={(url, id) => handleAdd(url, id, "photo")}
          />
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-stone-900">
          WhatsApp Screenshots (jitne chahein utne)
        </p>
        <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
          Reviews page ke alag "WhatsApp Proof" section mein pura screenshot dikhega — kabhi crop
          nahi hoga, chaahe photo lambi (portrait) ho.
        </p>
        {renderGroup(whatsappItems)}
        <div className="mt-3">
          <CloudinaryImageButton
            folder="punyata-site/proof-gallery-whatsapp"
            label="+ WhatsApp Screenshot Add Karein"
            onUploaded={(url, id) => handleAdd(url, id, "whatsapp")}
          />
        </div>
      </div>

      {err && <p className="text-xs text-rose-600 break-words">{err}</p>}
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
    <div className="rounded-lg border border-stone-200 bg-white p-3 space-y-3">
      <SlotThumbRow
        label={plan.name}
        isCustom={isCustom}
        defaultText="Nahi set"
        thumb={
          plan.card_image_url ? (
            <img src={plan.card_image_url} alt={plan.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[11px] text-stone-400 text-center px-1">
              Nahi set
            </div>
          )
        }
      />
      <div className="flex flex-wrap items-start gap-2">
        <CloudinaryImageButton
          folder="punyata-site/plans"
          label={busy ? "..." : "Photo Badlein"}
          onUploaded={(secureUrl) => save(secureUrl)}
        />
        {isCustom && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => save(null)}
            className="h-9 sm:h-8 gap-1 text-xs text-stone-600"
          >
            <RotateCcw className="w-3 h-3" /> Hataayein
          </Button>
        )}
      </div>
      {err && <p className="text-xs text-rose-600 break-words">{err}</p>}
    </div>
  );
}
