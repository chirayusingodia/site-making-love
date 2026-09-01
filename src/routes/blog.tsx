import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, RefreshCw } from "lucide-react";
import { SiteChrome } from "@/components/site-chrome";
import { usePublishedBlogPosts } from "@/lib/blog";
import { stripMarkdown } from "@/lib/markdown-lite";
import { fetchPageSeo, pageSeoMeta } from "@/lib/page-seo";

export const Route = createFileRoute("/blog")({
  head: async () => {
    const seo = await fetchPageSeo("/blog");
    return {
      meta: pageSeoMeta(seo, {
        title: "Blog — पुण्यता | सुंदरकांड, गौ सेवा एवं दान-पुण्य पर लेख",
        description: "पुण्यता ब्लॉग — सुंदरकांड पाठ, हवन, गौ सेवा एवं दान-पुण्य से जुड़े लेख एवं जानकारी।",
      }),
      links: [{ rel: "canonical", href: "https://www.punyata.com/blog" }],
    };
  },
  component: BlogListPage,
});

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function BlogListPage() {
  const { data: posts, isLoading, isError, refetch, isRefetching } = usePublishedBlogPosts();

  return (
    <SiteChrome>
      <main className="max-w-3xl mx-auto px-4 pb-24 md:pb-16 pt-6 space-y-6">
        <header className="text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-brand">Blog</div>
          <h1 className="mt-2 text-3xl font-bold">पुण्यता ब्लॉग</h1>
          <p className="mt-2 text-[15px] text-muted-foreground max-w-xl mx-auto">
            सेवा, दान-पुण्य एवं सनातन परंपरा से जुड़े लेख।
          </p>
        </header>

        {isLoading && (
          <div className="space-y-4 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-black/5" />
            ))}
          </div>
        )}

        {isError && (
          <div className="text-center space-y-3 py-10">
            <p className="text-sm text-muted-foreground">लेख लोड नहीं हो पाए।</p>
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

        {!isLoading && !isError && posts?.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">
            जल्द ही नए लेख प्रकाशित होंगे।
          </p>
        )}

        {!isLoading && !isError && posts && posts.length > 0 && (
          <div className="space-y-4">
            {posts.map((post) => (
              <Link
                key={post.id}
                to="/blog/$slug"
                params={{ slug: post.slug }}
                className="block card-soft overflow-hidden hover:shadow-md transition-shadow"
              >
                {post.cover_image_url && (
                  <img
                    src={post.cover_image_url}
                    alt={post.title}
                    className="w-full aspect-video object-cover"
                    loading="lazy"
                  />
                )}
                <div className="p-4 space-y-1.5">
                  <h2 className="text-lg font-bold">{post.title}</h2>
                  {post.published_at && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {formatDate(post.published_at)}
                    </div>
                  )}
                  {post.body_md && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {stripMarkdown(post.body_md).slice(0, 160)}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </SiteChrome>
  );
}
