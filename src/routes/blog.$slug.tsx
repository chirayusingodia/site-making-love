import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, ArrowLeft, RefreshCw } from "lucide-react";
import { SiteChrome } from "@/components/site-chrome";
import { usePublishedBlogPost, fetchPublishedBlogPostBySlug } from "@/lib/blog";
import { renderMarkdown, stripMarkdown } from "@/lib/markdown-lite";
import { fetchPageSeo, pageSeoMeta } from "@/lib/page-seo";

export const Route = createFileRoute("/blog/$slug")({
  head: async ({ params }) => {
    const [seo, post] = await Promise.all([
      fetchPageSeo(`/blog/${params.slug}`),
      fetchPublishedBlogPostBySlug(params.slug).catch(() => null),
    ]);
    const fallbackTitle = post ? `${post.title} — पुण्यता Blog` : "पुण्यता Blog";
    const fallbackDescription = post?.body_md
      ? stripMarkdown(post.body_md).slice(0, 155)
      : "पुण्यता ब्लॉग लेख।";

    const meta: Array<Record<string, unknown>> = pageSeoMeta(seo, {
      title: fallbackTitle,
      description: fallbackDescription,
    });
    if (post) {
      meta.push({
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          datePublished: post.published_at ?? post.created_at,
          image: post.cover_image_url || undefined,
          mainEntityOfPage: `https://www.punyata.com/blog/${params.slug}`,
        },
      });
    }
    return {
      meta,
      links: [{ rel: "canonical", href: `https://www.punyata.com/blog/${params.slug}` }],
    };
  },
  component: BlogDetailPage,
});

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function BlogDetailPage() {
  const { slug } = Route.useParams();
  const { data: post, isLoading, isError, refetch, isRefetching } = usePublishedBlogPost(slug);

  return (
    <SiteChrome>
      <main className="max-w-2xl mx-auto px-4 pb-24 md:pb-16 pt-6 space-y-6">
        <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand">
          <ArrowLeft className="w-4 h-4" /> Blog par wapas
        </Link>

        {isLoading && (
          <div className="space-y-4 animate-pulse">
            <div className="h-6 w-2/3 bg-black/10 rounded" />
            <div className="aspect-video bg-black/5 rounded-2xl" />
            <div className="h-3 w-full bg-black/5 rounded" />
            <div className="h-3 w-5/6 bg-black/5 rounded" />
          </div>
        )}

        {isError && (
          <div className="text-center space-y-3 py-10">
            <p className="text-sm text-muted-foreground">लेख लोड नहीं हो पाया।</p>
            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="inline-flex items-center gap-2 bg-brand text-white text-xs font-bold px-5 py-2.5 rounded-full disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && !post && (
          <div className="text-center py-16 space-y-3">
            <h1 className="text-xl font-bold">Post not found</h1>
            <Link to="/blog" className="text-brand font-semibold">Back to Blog</Link>
          </div>
        )}

        {post && (
          <article className="space-y-4">
            <header className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-bold">{post.title}</h1>
              {post.published_at && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="w-3.5 h-3.5" />
                  {formatDate(post.published_at)}
                </div>
              )}
            </header>
            {post.cover_image_url && (
              <img
                src={post.cover_image_url}
                alt={post.title}
                className="w-full aspect-video object-cover rounded-2xl"
              />
            )}
            <div className="prose prose-sm max-w-none space-y-3">
              {post.body_md ? renderMarkdown(post.body_md) : null}
            </div>
          </article>
        )}
      </main>
    </SiteChrome>
  );
}
