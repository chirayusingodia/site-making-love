import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

// Dynamic replacement for the old hand-maintained public/sitemap.xml —
// that static file has been deleted (see SESSION_SEO_AUDIT_LOG_PROMPT.md
// A5). On Cloudflare Workers with a static `assets` binding, a file
// left in public/ at the same path would shadow this route entirely, so
// the static file MUST stay deleted for this to ever run.

const SITE_URL = "https://www.punyata.com";

const STATIC_ROUTES: Array<{ path: string; priority: string; changefreq: string }> = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/plans", priority: "0.9", changefreq: "weekly" },
  { path: "/sevas", priority: "0.8", changefreq: "monthly" },
  { path: "/reviews", priority: "0.6", changefreq: "monthly" },
  { path: "/about", priority: "0.6", changefreq: "monthly" },
  { path: "/faq", priority: "0.6", changefreq: "monthly" },
  { path: "/blog", priority: "0.7", changefreq: "weekly" },
];

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function urlEntry(loc: string, lastmod: string, priority: string, changefreq: string): string {
  return `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

async function buildSitemap(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);

  const [plansRes, postsRes] = await Promise.all([
    supabase.from("plans").select("slug, is_active").eq("is_active", true),
    supabase
      .from("blog_posts")
      .select("slug, is_published, published_at")
      .eq("is_published", true),
  ]);

  const entries: string[] = STATIC_ROUTES.map((r) =>
    urlEntry(`${SITE_URL}${r.path}`, today, r.priority, r.changefreq),
  );

  for (const plan of plansRes.data ?? []) {
    entries.push(urlEntry(`${SITE_URL}/plan/${plan.slug}`, today, "0.8", "weekly"));
  }
  for (const post of postsRes.data ?? []) {
    const lastmod = post.published_at ? String(post.published_at).slice(0, 10) : today;
    entries.push(urlEntry(`${SITE_URL}/blog/${post.slug}`, lastmod, "0.6", "monthly"));
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const xml = await buildSitemap();
        return new Response(xml, {
          status: 200,
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
