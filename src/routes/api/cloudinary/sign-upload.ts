import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";
import process from "node:process";
import { json, requireAdmin } from "@/lib/supabase-admin.server";

// POST /api/cloudinary/sign-upload
// Body: { folder: string, resourceType?: "image" | "video" }
//
// Returns a signed upload payload so the browser can upload media
// DIRECTLY to Cloudinary (no serverless payload-size limit, no
// server proxying of large files). Signed uploads only — never
// unsigned presets.
//
// `resourceType` defaults to "video" so the existing proof-upload
// flow is unaffected; pass "image" to upload site photography into
// the `punyata-site/` namespace.
//
// Env required (Vercel): CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
// CLOUDINARY_API_SECRET.

export const Route = createFileRoute("/api/cloudinary/sign-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (!auth) return json({ error: "Admin auth required" }, 401);

        let folder: string | undefined;
        let resourceType: "image" | "video" = "video";
        try {
          const body = await request.json();
          folder = typeof body?.folder === "string" ? body.folder : undefined;
          if (body?.resourceType === "image" || body?.resourceType === "video") {
            resourceType = body.resourceType;
          }
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        // Constrain folders to our own namespaces — no arbitrary paths.
        // `punyata-proofs/*` = per-subscriber seva proofs (video).
        // `punyata-site/*`   = marketing site photography (image).
        if (!folder || !/^punyata-(proofs|site)\/[\w\-/]+$/.test(folder)) {
          return json({ error: "Invalid folder" }, 400);
        }

        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;
        if (!cloudName || !apiKey || !apiSecret) {
          return json({ error: "Cloudinary env vars not configured" }, 500);
        }

        const timestamp = Math.floor(Date.now() / 1000);
        // Cloudinary signature: sha1 of "key=value&...sorted" + api_secret
        const toSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
        const signature = createHash("sha1").update(toSign).digest("hex");

        return json({
          cloudName,
          apiKey,
          timestamp,
          folder,
          signature,
          uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
        });
      },
    },
  },
});
