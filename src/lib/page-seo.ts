import { supabase } from "@/lib/supabase";

// Per-path SEO override, backed by `page_seo` (RLS: public SELECT,
// is_admin() write). Read from both server (route `head()`, SSR) and
// client (admin editor) via the shared anon client — no service role
// needed since the table is public-readable by design.

export interface PageSeoRow {
  path: string;
  title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  updated_at: string;
}

/** Single row by exact path, or null if never edited / not found. */
export async function fetchPageSeo(path: string): Promise<PageSeoRow | null> {
  const { data, error } = await supabase
    .from("page_seo")
    .select("path, title, meta_description, og_image_url, updated_at")
    .eq("path", path)
    .maybeSingle();
  if (error) {
    console.warn(`[page-seo] fetch failed for "${path}":`, error.message);
    return null;
  }
  return (data as PageSeoRow | null) ?? null;
}

export async function fetchAllPageSeo(): Promise<PageSeoRow[]> {
  const { data, error } = await supabase
    .from("page_seo")
    .select("path, title, meta_description, og_image_url, updated_at")
    .order("path");
  if (error) throw new Error(`page_seo list failed: ${error.message}`);
  return (data ?? []) as PageSeoRow[];
}

/** Builds a TanStack Router head() meta array, falling back to the route's
 * existing hardcoded default when no page_seo row exists yet. */
export function pageSeoMeta(seo: PageSeoRow | null, fallback: { title: string; description: string }) {
  return [
    { title: seo?.title?.trim() || fallback.title },
    { name: "description", content: seo?.meta_description?.trim() || fallback.description },
    ...(seo?.og_image_url?.trim() ? [{ property: "og:image", content: seo.og_image_url.trim() }] : []),
  ];
}
