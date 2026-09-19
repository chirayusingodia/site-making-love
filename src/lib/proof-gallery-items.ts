import { supabase } from "@/lib/supabase";

// Extra, unlimited-count photos appended to the Proof Gallery (the 4 core
// thumbnails stay a fixed SITE_IMAGES slot — see site-image-overrides.ts).
// Admin can add/remove/reorder freely from /admin/images.

export type ProofGalleryItemKind = "photo" | "whatsapp";

export interface ProofGalleryItem {
  id: string;
  image_url: string;
  cloudinary_public_id: string;
  alt_text: string;
  sort_order: number;
  kind: ProofGalleryItemKind;
}

const COLS = "id, image_url, cloudinary_public_id, alt_text, sort_order, kind";

export async function fetchProofGalleryItems(): Promise<ProofGalleryItem[]> {
  const { data, error } = await supabase
    .from("proof_gallery_items")
    .select(COLS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[proof-gallery-items] fetch failed:", error.message);
    return [];
  }
  return (data ?? []) as ProofGalleryItem[];
}

export async function addProofGalleryItem(
  imageUrl: string,
  cloudinaryPublicId: string,
  sortOrder: number,
  kind: ProofGalleryItemKind = "photo",
): Promise<ProofGalleryItem> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from("proof_gallery_items")
    .insert({
      image_url: imageUrl,
      cloudinary_public_id: cloudinaryPublicId,
      sort_order: sortOrder,
      kind,
      updated_by: session?.user?.id ?? null,
    })
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as ProofGalleryItem;
}

export async function deleteProofGalleryItem(id: string): Promise<void> {
  const { error } = await supabase.from("proof_gallery_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateProofGalleryItemOrder(id: string, sortOrder: number): Promise<void> {
  const { error } = await supabase
    .from("proof_gallery_items")
    .update({ sort_order: sortOrder })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
