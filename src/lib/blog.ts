import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Public blog content — 100% live from `blog_posts` (RLS: public SELECT
// only where is_published = true, or admin). No hardcoded posts here,
// same rule as plans/sevas in @/lib/plans.

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  body_md: string | null;
  cover_image_url: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

export async function fetchPublishedBlogPosts(): Promise<BlogPost[]> {
  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, body_md, cover_image_url, is_published, published_at, created_at")
    .eq("is_published", true)
    .order("published_at", { ascending: false });
  if (error) throw new Error(`blog_posts list failed: ${error.message}`);
  return (data ?? []) as BlogPost[];
}

export async function fetchPublishedBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, body_md, cover_image_url, is_published, published_at, created_at")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (error) throw new Error(`blog_posts fetch failed: ${error.message}`);
  return (data as BlogPost | null) ?? null;
}

export function usePublishedBlogPosts() {
  return useQuery({
    queryKey: ["blog-posts-published"],
    queryFn: fetchPublishedBlogPosts,
    staleTime: 60_000,
    retry: 1,
  });
}

export function usePublishedBlogPost(slug: string) {
  return useQuery({
    queryKey: ["blog-post-published", slug],
    queryFn: () => fetchPublishedBlogPostBySlug(slug),
    staleTime: 60_000,
    retry: 1,
    enabled: !!slug,
  });
}
