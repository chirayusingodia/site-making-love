# Session: SEO/Content Editor + Audit Log Viewer

## Pre-flight findings (confirmed before any code was written)

| Assumption in the original ask | Reality |
|---|---|
| `page_seo` / `blog_posts` need to exist as-is | Both exist exactly as described, in `supabase/migrations/20260725_001_core_schema.sql:82-102`, RLS already in place (public read, `is_admin()`-gated write). **Zero app code references either table today** — fully greenfield, no schema change needed. |
| `audit_logs` schema is `admin_id, action, entity, entity_id, meta, created_at` | Confirmed exact match, `20260725_001_core_schema.sql:286-294`. Actively written today from webhooks, checkout, telecaller mutations, and cron — via a shared helper `writeTelecallerAudit()` in [supabase-admin.server.ts:180-198](src/lib/supabase-admin.server.ts). New admin mutations in this feature (page_seo/blog_posts writes) should call the same helper for consistency, not raw `.insert()`. |
| `<head>` meta is static or already templated | Per-route `head:` exports already exist on 9 routes (static hardcoded strings — see [index.tsx:34-41](src/routes/index.tsx), [plans.tsx:18-24](src/routes/plans.tsx)). Root shell ([__root.tsx:76-132](src/routes/__root.tsx)) sets defaults plus two **hardcoded, site-wide** JSON-LD blocks (`ORGANIZATION_JSON_LD`, `WEBSITE_JSON_LD`). `plan.$planId.tsx` has **no** head export at all — full fallback to root defaults. That's the actual gap this feature closes for Product schema. |
| Need to check if sitemap.xml/robots.txt exist | **They already exist** — as static files in `public/`, hand-maintained, 6 hardcoded URLs, fixed `lastmod`. This is not a "create from scratch" task, it's "replace static with dynamic," which has its own platform-specific wrinkle (see A5 below). |
| admin.tsx nav is a simple list | Confirmed — plain array of `{label, href, icon, badge?}` in [admin.tsx:58-105](src/routes/admin.tsx), owner-only items added via conditional array spread (`...(role === "owner" ? [...] : [])`). Three-layer gating is a strict repo convention: nav visibility + route `beforeLoad` + API-level `requireAdmin`/`requireOwner`. Follow all three layers, not just the nav item. |
| `plans` has a `description` column | **It does not.** `plans` has `tagline`, `highlight_text`, `features` (jsonb) — no `description` column ([20260725_001_core_schema.sql:109-125](supabase/migrations/20260725_001_core_schema.sql)). Also note `razorpay_plan_id` was dropped in a later migration — don't reference it. Product JSON-LD must map `tagline`/`highlight_text` → description, not a nonexistent column. |

No schema migration is needed for this feature. If implementation turns up a real gap against this table, **stop and report the diff** before altering schema — per [migration-check-latest-definition](../../.claude/projects/.../memory) convention already in effect for this repo.

---

## PART A — SEO & Content Editor (`/admin/seo`)

### A1. Route + gate
- New route `/admin/seo`, gated **admin or owner** (reuse `requireAdmin` for API routes, mirror the `beforeLoad` role check already in [admin.tsx:29-52](src/routes/admin.tsx) — NOT telecaller).
- Nav item "SEO & Content" goes in the **base nav array** (visible to admin + owner), not inside an owner-only spread block — this matches the explicit admin/owner gate, not the "same tier as Reports" phrasing from the original draft, which was inconsistent (Reports is owner-only). Content editing is lower-sensitivity than financial reports; admin+owner access is the correct tier.

### A2. Page Meta Manager (backed by `page_seo`)
- List view of known routes: `/`, `/plans`, `/about`, `/faq`, `/sevas`, `/reviews`, plus one row per active `plan.$planId` (pull slugs from live `plans` table, not hardcoded).
- Per-row edit: `title`, `meta_description`, `og_image_url` (Cloudinary picker, reuse the existing signed-upload flow at [cloudinary/sign-upload.ts](src/routes/api/cloudinary/sign-upload.ts)).
- Live character-count warnings: title >60 chars, meta_description >160 chars. UI hint only — never block save.
- Upsert into `page_seo` keyed on `path`. Every successful save also writes a `writeTelecallerAudit`-style row (`action: "page_seo.upsert"`, `entity: "page_seo"`, `entity_id`: the page_seo row id) so the audit log viewer in Part B has real data to show for this feature, consistent with how every other admin mutation in this codebase is logged.
- **Wiring must be real, not decorative**: the route loader for each covered page must read `page_seo` by `path` and feed the result into that route's `head()` (falling back to the existing hardcoded string when no row exists yet, so nothing regresses if a page was never edited). Verify end-to-end for homepage and `/plans` before calling this done — load the admin editor, change the title, reload the actual public page, confirm the `<title>` changed.

### A3. Structured Data (JSON-LD)
- **Organization + LocalBusiness**, homepage only, hardcoded fields (name: Punyata, url: punyata.com, description, address: Pushkar, Rajasthan, telephone: 7014098548, `sameAs: []` — leave empty for Chirayu to fill in social URLs later). This replaces/extends the existing hardcoded `ORGANIZATION_JSON_LD` in `__root.tsx` — don't duplicate it site-wide if it's meant to be homepage-specific; confirm with the existing block's placement before adding a second one.
- **Product schema per plan**, on `plan.$planId.tsx` (currently has no head export at all — this is new). Pull `name`, `price_paise` (convert to `offers.price` in INR, i.e. `/100`), and description from `tagline`/`highlight_text` (in that priority order, whichever is non-empty) — never hardcode plan data, same rule as everywhere else in this codebase.

### A4. Blog Manager (backed by `blog_posts`)
- List view: title, slug, is_published, published_at, with CRUD.
- Editor: title, slug (auto-slugify from title, editable, uniqueness enforced by the existing `UNIQUE` constraint), `body_md` (plain textarea — no rich WYSIWYG, per explicit instruction), `cover_image_url` (Cloudinary), `is_published` toggle.
- Public routes: `/blog` (list, `is_published = true` only) and `/blog/:slug` (detail) — both new. Render `body_md` with a lightweight markdown-to-HTML pass (no new heavy dependency — hand-roll a minimal renderer or use a already-present small utility if one exists in package.json; check before adding anything).
- On publish (is_published flips false→true), auto-create a `page_seo` row for `path = "/blog/:slug"` if one doesn't already exist (title = post title, description = first ~155 chars of `body_md` stripped of markdown, as a reasonable default the admin can then override in A2).
- Purpose: long-tail content ("sundarkand path online", "gau seva subscription", "daan punya pushkar") builds topical authority; brand-name ranking rides on site-wide trust signal, not just the homepage.

### A5. Sitemap + robots.txt — dynamic, not static
- This is a **replacement**, not a fresh build: `public/sitemap.xml` and `public/robots.txt` already exist as static, hand-maintained files. They need to become dynamically generated so new blog posts and plans show up automatically.
- **Before implementing**: confirm (a) whether TanStack Router's file-based routing here supports a literal `/sitemap.xml` and `/robots.txt` path via its bracket-escape naming convention for dotted filenames, and (b) whether this deploys to Cloudflare Workers or Pages, and whether static files under `public/` take precedence over a same-path Worker route (if so, the static files must be deleted, not just left alongside a same-path dynamic route that would never actually run). Do not assume — verify against this repo's actual `wrangler` config before writing the route.
- `/sitemap.xml`: static public routes + all `is_published = true` blog posts + all `is_active = true` plans.
- `/robots.txt`: allow all, `Sitemap: https://www.punyata.com/sitemap.xml`, disallow `/admin`, `/telecaller`, `/agent`, `/api/` (matches the existing static file's disallow list — don't narrow it).

---

## PART B — Audit Log Viewer (`/admin/audit-log`)

### B1. Route + gate
- New route `/admin/audit-log`, **owner only** — same gate tier as Reports/Commissions (`requireOwner`, and nav item placed inside the existing `role === "owner" ? [...] : []` block in [admin.tsx](src/routes/admin.tsx), right alongside Reports/Commissions/Performance/Staff Roles/Lead Routing).
- This is sensitive operational data, not admin-tier — do not widen to admin role.

### B2. List view
- Paginated, most-recent-first, from `audit_logs`.
- Columns: `created_at` (IST-formatted), `action`, `entity`, `entity_id`, `admin_id` resolved to `profiles.full_name` via join (show "System" when `admin_id` is NULL — this is common today per the webhook/cron call sites), `meta` as a collapsed/expandable JSON viewer.
- Filters: date range, `action` (dropdown of distinct values actually present), `entity` type, admin (dropdown of profiles who have rows — not all profiles).
- Read-only, permanently. No edit/delete/mutation endpoint of any kind.

### B3. Search
- Text search on `entity_id` (exact/prefix match) and `meta` (`ILIKE`, not full-text search infra).

---

## DO NOT
- Do NOT touch `is_admin()` or widen any RLS policy to add telecaller/agent access to these new screens.
- Do NOT add a mutation endpoint to audit-log — read-only forever.
- Do NOT hardcode plan/seva data into JSON-LD — always read live from `plans`/`sevas`.
- Do NOT reference `plans.description` (doesn't exist) or `plans.razorpay_plan_id` (dropped) anywhere.
- Do NOT add a heavy markdown/WYSIWYG library — keep the blog editor lightweight (plain textarea + light render).
- Do NOT change `page_seo`/`blog_posts`/`audit_logs` schema — confirmed to already match spec; no migration needed.
- Do NOT block save on meta title/description length warnings — UI hint only.
- Do NOT leave a static `public/sitemap.xml`/`public/robots.txt` sitting alongside a same-path dynamic route if static assets win precedence on this deploy target — verify and remove the stale static file if so, rather than shipping a dynamic route that silently never executes.
- Do NOT write raw `.insert()` calls into `audit_logs` — reuse the existing `writeTelecallerAudit()` helper pattern for consistency with every other admin mutation in this codebase.

## DEFINITION OF DONE
- [ ] `/admin/seo` live, admin/owner gated, page meta editor working, verified page `<head>` actually reflects saved values on at least homepage + `/plans` (checked by reloading the real public page after a save)
- [ ] JSON-LD Organization/LocalBusiness confirmed correctly scoped (homepage vs. site-wide, resolved against the existing root-level block), Product schema live on `/plan/:id`, reading live plan data (no `description` column — uses `tagline`/`highlight_text`)
- [ ] Blog CRUD working, `/blog` + `/blog/:slug` public routes live, each publish auto-creates a `page_seo` row
- [ ] `/sitemap.xml` and `/robots.txt` confirmed dynamically generated and actually served (not shadowed by a leftover static file), correct content on both
- [ ] `/admin/audit-log` live, owner-only, paginated + filterable + searchable, zero mutation endpoints
- [ ] page_seo/blog_posts admin mutations write `audit_logs` rows via the shared helper, visible in the new viewer
- [ ] Session summary: list every file created/touched, confirm each DO NOT item was respected, and confirm the static-vs-dynamic sitemap/robots precedence question was actually resolved (not assumed)
