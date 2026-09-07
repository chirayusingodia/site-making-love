# Content Studio — Technical Plan

**Goal:** An admin-panel tool that (1) reads the "immortaltalks model" playbook, (2) connects to Meta to analyze Punyata's own page + immortaltalks' public data, (3) uses **Google Gemini** to generate ready-to-post content (captions, hooks, reel scripts, carousel outlines, CTAs) in **Hindi + English**, and (4) lets the owner review → schedule → mark posted. Strategy is data-driven: post more of what earns more likes.

**Stack it plugs into:** TanStack Start (React 19) + Supabase (service-role server routes) + existing admin auth (`requireAdmin`) + Cloudinary + canvas image render (reused from Ashirwad Patra) + cron.

---

## What is actually possible (honest capability map)

| Requirement | Feasible? | Mechanism | Constraint |
|---|---|---|---|
| Generate captions / hooks / reel scripts / carousels / CTAs (Hi+En) | ✅ Full | Gemini API + playbook system prompt | Needs `GEMINI_API_KEY` |
| Analyze **our own** page (likes, comments, **saves, reach, impressions**) | ✅ Full | IG Graph API `/{ig-user-id}/media` + `/insights` | Needs IG Business acct + FB Page + token |
| Analyze **immortaltalks** (public: posts, **likes, comments**, followers, captions) | ✅ Public only | IG Graph API **Business Discovery** (`business_discovery.username(immortaltalks)`) | No saves/reach/shares for other accounts (Meta blocks it) |
| "More likes → make more like that" | ✅ | Rank both accounts' posts by likes → Gemini extracts winning patterns → generates in that style | Competitor ranking by likes+comments only |
| Public-view side-by-side compare | ✅ | Business Discovery for both, one dashboard | — |
| Auto quote-card PNG | ✅ | Reuse canvas renderer (Ashirwad Patra) | — |
| Auto-post to Instagram | ✅ Phase 3 | IG Graph API Content Publishing + cron | Reels need media hosted (Cloudinary); app review for some perms |
| Auto-create reel VIDEO | ❌ | Not automatable here | Script provided; edit in CapCut |

**Key insight:** Meta's Business Discovery gives another account's **like & comment counts publicly** — which is exactly what "jaha zyada likes wesi post zyada" needs. Only saves/reach/shares are private to our own account.

---

## Prerequisites (owner must supply)

1. **Gemini API key** — from https://aistudio.google.com (the Gemini *app* subscription does NOT grant API access; a separate API key is required — generous free tier). Env: `GEMINI_API_KEY`, optional `GEMINI_MODEL` (default `gemini-2.0-flash`).
2. **Meta / Instagram** (for Analyze + Auto-post):
   - Instagram account switched to **Business/Creator**.
   - Linked to a **Facebook Page**.
   - A **Meta Developer App** with Instagram Graph API; generate a long-lived Page access token.
   - Env: `META_ACCESS_TOKEN`, `META_IG_USER_ID` (our IG business account id), `META_GRAPH_VERSION` (default `v21.0`).
3. Existing: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (already set for other features).

Content generation (Phase 1) works with ONLY the Gemini key. Meta is needed for Phase 2 (analyze/compare) and Phase 3 (auto-post).

---

## Architecture

```
Admin UI (admin.content-studio.tsx)
  ├─ Create tab   → POST /api/admin/content/generate  → Gemini (playbook prompt) → structured JSON
  │                → POST /api/admin/content/save       → content_posts
  ├─ Library tab  → POST /api/admin/content/list        → content_posts
  │                → POST /api/admin/content/update-status (draft→approved→posted, schedule)
  └─ Analyze tab  → POST /api/admin/content/analyze      → Meta Graph (self insights + business_discovery) → social_snapshots
                   → POST /api/admin/content/strategy    → Gemini(snapshots) → recommendations

Server libs:
  src/lib/content-playbook.ts   — the model as a system prompt + pillars/formats constants
  src/lib/gemini.server.ts      — thin fetch wrapper (JSON mode, schema)
  src/lib/meta.server.ts        — Graph API: own media+insights, business_discovery, publish
```

---

## Database (migration `20260907_033_content_studio.sql`)

```sql
-- content_posts: every generated / drafted post
create table if not exists content_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  topic text,
  pillar text,                          -- mirror|mind|detachment|parable|stillness|custom
  format text not null,                 -- reel|card|carousel
  status text not null default 'draft', -- draft|approved|posted
  scheduled_for date,
  posted_at timestamptz,
  source text not null default 'gemini',
  model text,
  content jsonb not null default '{}'   -- {on_screen:{en,hi}, caption:{en,hi}, hooks:[], reel_script:{en,hi}, carousel:{en:[],hi:[]}, hashtags:{en:[],hi:[]}, cta}
);

-- social_snapshots: cached Meta reads for analyze/compare
create table if not exists social_snapshots (
  id uuid primary key default gen_random_uuid(),
  fetched_at timestamptz not null default now(),
  account text not null,   -- 'self' | competitor username
  ig_username text,
  followers int,
  media jsonb not null default '[]'  -- [{id,caption,media_type,like_count,comments_count,permalink,timestamp,saved?,reach?}]
);

alter table content_posts   enable row level security; -- service-role only (admin API gate)
alter table social_snapshots enable row level security; -- no public policies = deny all but service role
```

RLS enabled with **no policies** → only the service-role client (behind `requireAdmin`) can touch these, matching the codebase's admin-table convention.

---

## API routes (all `POST`, gated by `requireAdmin`)

| Route | Body | Returns |
|---|---|---|
| `/api/admin/content/generate` | `{format, pillar?, topic?}` | structured bilingual content (not saved) |
| `/api/admin/content/save` | `{post}` | `{id}` |
| `/api/admin/content/list` | `{status?}` | `{posts:[]}` |
| `/api/admin/content/update-status` | `{id, status?, scheduled_for?}` | `{ok}` |
| `/api/admin/content/analyze` *(Phase 2)* | `{competitors?:[]}` | `{self, competitors:[]}` cached snapshots |
| `/api/admin/content/strategy` *(Phase 2)* | none | Gemini recommendations from snapshots |
| `/api/admin/content/publish` *(Phase 3)* | `{id}` | IG publish result |

---

## Gemini integration

- Plain `fetch` to `generativelanguage.googleapis.com` (no new npm dep).
- JSON mode: `generationConfig.responseMimeType = "application/json"` + a `responseSchema` so output parses deterministically into the `content` shape.
- System instruction = the playbook (Section: brand, voice, pillars, formats, caption formula) from `content-playbook.ts`.
- For strategy, feed ranked snapshot data + ask for topic/format recommendations.

---

## UI (`admin.content-studio.tsx`)

- **Create:** pick Format (reel/card/carousel) + Pillar (or "Surprise me") + optional custom topic → Generate → bilingual preview (on-screen text, caption, hooks, script/carousel, hashtags, CTA) → edit inline → Save / Approve.
- **Library / Calendar:** list saved posts, filter by status, schedule date, one-click Copy caption (Hi/En), Mark posted.
- **Analyze (Phase 2):** self vs immortaltalks — top posts by likes, best format, best pillar, posting cadence; a "Generate strategy" button.
- Follows existing admin visual system (amber theme, Radix components, `callAdminApi`).

Nav: add `{ label: "Content Studio", href: "/admin/content-studio", icon: Sparkles/PenSquare, badge: "New" }` to `admin.tsx`.

---

## Phasing

- **Phase 1 — Text Studio** *(build now; needs only Gemini key)*: migration, playbook lib, gemini lib, generate/save/list/update-status routes, Create + Library UI, nav.
- **Phase 2 — Analyze & Strategy** *(needs Meta token)*: meta lib, analyze/strategy routes, Analyze UI, compare dashboard.
- **Phase 3 — Auto card images + Auto-post** *(needs Meta publish perms)*: canvas card PNG, publish route + cron scheduler.

---

## Security notes

- All routes behind `requireAdmin` (admin/owner). Consider owner-only later if desired.
- API keys/tokens only in server env, never shipped to client.
- Gemini output is untrusted text → rendered as data in the UI, never executed.
- Business Discovery only reads public data; no scraping, no private-account access.
```
