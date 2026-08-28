import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "पुण्यता — तीर्थ गुरु पुष्करराज से मासिक सेवा" },
      { name: "description", content: "तीर्थ गुरु पुष्करराज से आपके नाम एवं गोत्र से मासिक सुंदरकांड, हवन, गौ सेवा एवं साधु संतों को भोजन। WhatsApp पर Video Proof।" },
      { property: "og:title", content: "पुण्यता — मासिक सेवा" },
      { property: "og:description", content: "सनातन सेवा का सामूहिक यज्ञ — पूर्ण पारदर्शिता के साथ।" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "पुण्यता" },
      { property: "og:locale", content: "hi_IN" },
      { property: "og:image", content: "https://www.punyata.com/og-image.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "पुण्यता — तीर्थ गुरु पुष्करराज से मासिक सेवा" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://www.punyata.com/og-image.jpg" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/punyata-logo.svg?v=3" },
      { rel: "icon", type: "image/png", href: "/favicon.png?v=3" },
      { rel: "shortcut icon", href: "/favicon.ico?v=3" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=3" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700;800&family=Tiro+Devanagari+Hindi&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "पुण्यता",
  alternateName: "Punyata",
  url: "https://www.punyata.com/",
  logo: "https://www.punyata.com/apple-touch-icon.png",
  image: "https://www.punyata.com/og-image.jpg",
  description:
    "तीर्थ गुरु पुष्करराज से आपके नाम एवं गोत्र से मासिक सुंदरकांड, हवन, गौ सेवा एवं साधु संतों को भोजन। WhatsApp पर Video Proof।",
  areaServed: "IN",
};

const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "पुण्यता",
  url: "https://www.punyata.com/",
};

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <script
          type="application/ld+json"
          // Site-wide identity schema — same on every page, used by Google
          // for the brand knowledge panel / sitelinks searchbox.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(ORGANIZATION_JSON_LD),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
        />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [loading, setLoading] = useState(true);

  // [Bug 3.5] Dismiss on actual readiness (first painted frame) —
  // the fixed 1500ms timer blocked the whole app, including 404 and
  // error pages, behind a delay unrelated to real load state.
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setLoading(false));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* [Bug 3.5b] No key={pathname}: keying the wrapper remounted the
          entire route subtree on every navigation just to replay a CSS
          fade-in, discarding all component state. The fade now plays
          once per full page load, like any normal app shell. */}
      <div className="animate-fade-in">
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </div>
    </QueryClientProvider>
  );
}
