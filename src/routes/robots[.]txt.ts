import { createFileRoute } from "@tanstack/react-router";

// Dynamic replacement for the old static public/robots.txt (deleted —
// see SESSION_SEO_AUDIT_LOG_PROMPT.md A5). Content matches the old
// static file's disallow list; only the sitemap reference now points
// at the dynamically-generated /sitemap.xml route.

const ROBOTS_TXT = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /agent
Disallow: /telecaller
Disallow: /checkout
Disallow: /login
Disallow: /profile
Disallow: /complete-profile
Disallow: /my-subscription
Disallow: /subscription-success
Disallow: /api/

Sitemap: https://www.punyata.com/sitemap.xml
`;

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () =>
        new Response(ROBOTS_TXT, {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
