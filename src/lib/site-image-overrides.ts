import { supabase } from "@/lib/supabase";
import { setSiteImageOverride } from "@/lib/site-images";
import { setTestimonialAvatarOverride } from "@/lib/plans";

// Backs /admin/images. `site_image_overrides` is a flat slot_key -> photo
// table (RLS: public read, admin write) covering two kinds of slot:
//   - a SiteImageKey (see site-images.ts)         -> mutates SITE_IMAGES
//   - a "review-<n>" testimonial avatar (plans.ts) -> mutates testimonials
// Both are applied by mutating the shared in-memory objects those modules
// already export, since every consumer reads off them fresh at render time.

export interface SiteImageOverrideRow {
  slot_key: string;
  cloudinary_public_id: string;
  image_url: string;
  updated_at: string;
}

export async function fetchSiteImageOverrides(): Promise<SiteImageOverrideRow[]> {
  const { data, error } = await supabase
    .from("site_image_overrides")
    .select("slot_key, cloudinary_public_id, image_url, updated_at");
  if (error) {
    console.warn("[site-image-overrides] fetch failed:", error.message);
    return [];
  }
  return (data ?? []) as SiteImageOverrideRow[];
}

const REVIEW_SLOT_RE = /^review-(\d+)$/;

/** Applies every override row in place. Unknown/stale slot_keys are ignored. */
export function applySiteImageOverrides(rows: SiteImageOverrideRow[]): void {
  for (const row of rows) {
    const reviewMatch = REVIEW_SLOT_RE.exec(row.slot_key);
    if (reviewMatch) {
      setTestimonialAvatarOverride(Number(reviewMatch[1]) - 1, row.image_url);
      continue;
    }
    setSiteImageOverride(row.slot_key, row.cloudinary_public_id);
  }
}

export async function loadAndApplySiteImageOverrides(): Promise<void> {
  const rows = await fetchSiteImageOverrides();
  applySiteImageOverrides(rows);
}

/** Upserts one override row. Used by /admin/images after a successful Cloudinary upload. */
export async function saveSiteImageOverride(
  slotKey: string,
  secureUrl: string,
  cloudinaryPublicId: string,
): Promise<SiteImageOverrideRow> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from("site_image_overrides")
    .upsert(
      {
        slot_key: slotKey,
        cloudinary_public_id: cloudinaryPublicId,
        image_url: secureUrl,
        updated_at: new Date().toISOString(),
        updated_by: session?.user?.id ?? null,
      },
      { onConflict: "slot_key" },
    )
    .select("slot_key, cloudinary_public_id, image_url, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data as SiteImageOverrideRow;
}

/** Deletes an override row, reverting that slot to its bundled default. */
export async function deleteSiteImageOverride(slotKey: string): Promise<void> {
  const { error } = await supabase.from("site_image_overrides").delete().eq("slot_key", slotKey);
  if (error) throw new Error(error.message);
}
