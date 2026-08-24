import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    // [Pass-2 L7] API routes must keep the JSON contract even for an
    // uncaught throw — an HTML error page made every browser client's
    // res.json() blow up with an opaque SyntaxError. Pages keep the
    // branded HTML page.
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Kuch galat ho gaya — dobara try karein." }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
