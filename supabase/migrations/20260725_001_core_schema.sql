-- =============================================================
-- PUNYATA — Session 0 Core Schema Migration
-- Project : omjivlmfsikeqwndtlcn  (Supabase "Punyata")
-- Branch  : staging
-- Created : 2026-07-25
-- =============================================================
-- EXECUTION ORDER:
--   1. Extensions & helpers
--   2. Reference / catalogue tables (no FK deps)
--   3. Operational tables  (FK deps on reference tables)
--   4. Transaction / log tables (FK deps on operational tables)
--   5. Seed data
--   6. RLS enablement + policies
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 0. SAFETY: Extensions
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid() on older PG
-- uuid-ossp is pre-installed on Supabase; gen_random_uuid() is built-in PG 13+

-- ─────────────────────────────────────────────────────────────
-- 1. REFERENCE / CATALOGUE TABLES
-- ─────────────────────────────────────────────────────────────

-- 1a. locations
CREATE TABLE IF NOT EXISTS public.locations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    deity_name  text NOT NULL,
    city        text NOT NULL,
    state       text NOT NULL,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- 1b. teams
CREATE TABLE IF NOT EXISTS public.teams (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id     uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    name            text NOT NULL,
    contact_phone   text,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- 1c. sevas
CREATE TABLE IF NOT EXISTS public.sevas (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name             text NOT NULL,
    slug             text NOT NULL UNIQUE,
    description      text,
    location_id      uuid REFERENCES public.locations(id) ON DELETE SET NULL,
    requires_sankalp boolean NOT NULL DEFAULT true,
    is_active        boolean NOT NULL DEFAULT true,
    sort_order       int NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- 1d. seva_schedule_rules
-- weekday: 'MON'|'TUE'|'WED'|'THU'|'FRI'|'SAT'|'SUN'
-- occurrence: 'first'|'second'|'third'|'fourth'|'last'
CREATE TABLE IF NOT EXISTS public.seva_schedule_rules (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    seva_id     uuid NOT NULL REFERENCES public.sevas(id) ON DELETE CASCADE,
    weekday     text NOT NULL CHECK (weekday IN ('MON','TUE','WED','THU','FRI','SAT','SUN')),
    occurrence  text NOT NULL CHECK (occurrence IN ('first','second','third','fourth','last')),
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- 1e. sales_agents
CREATE TABLE IF NOT EXISTS public.sales_agents (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name          text NOT NULL,
    phone              text,
    agent_code         text NOT NULL UNIQUE,
    commission_percent numeric(5,2) NOT NULL DEFAULT 0,
    is_active          boolean NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now()
);

-- 1f. page_seo
CREATE TABLE IF NOT EXISTS public.page_seo (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    path              text NOT NULL UNIQUE,
    title             text,
    meta_description  text,
    og_image_url      text,
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 1g. blog_posts
CREATE TABLE IF NOT EXISTS public.blog_posts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            text NOT NULL UNIQUE,
    title           text NOT NULL,
    body_md         text,
    cover_image_url text,
    is_published    boolean NOT NULL DEFAULT false,
    published_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 2. PLANS (depends on locations + teams)
-- ─────────────────────────────────────────────────────────────

-- 2a. plans
CREATE TABLE IF NOT EXISTS public.plans (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                text NOT NULL,
    slug                text NOT NULL UNIQUE,
    price_paise         int NOT NULL CHECK (price_paise > 0),
    billing_period      text NOT NULL CHECK (billing_period IN ('monthly','yearly')),
    razorpay_plan_id    text,
    location_id         uuid REFERENCES public.locations(id) ON DELETE SET NULL,
    default_team_id     uuid REFERENCES public.teams(id) ON DELETE SET NULL,
    tagline             text,
    highlight_text      text,
    features            jsonb,
    card_image_url      text,
    is_active           boolean NOT NULL DEFAULT true,
    sort_order          int NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- 2b. plan_sevas  (junction — source of truth for tier composition)
CREATE TABLE IF NOT EXISTS public.plan_sevas (
    plan_id  uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    seva_id  uuid NOT NULL REFERENCES public.sevas(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, seva_id)
);

-- 2c. plan_addons
CREATE TABLE IF NOT EXISTS public.plan_addons (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id     uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    addon_type  text NOT NULL,           -- e.g. 'prasad', 'certificate'
    description text,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 3. USER / IDENTITY TABLES
-- ─────────────────────────────────────────────────────────────

-- 3a. profiles (mirrors auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   text,
    phone       text UNIQUE,
    email       text,
    city        text,
    country     text NOT NULL DEFAULT 'India',
    role        text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','agent')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 3b. coupons
CREATE TABLE IF NOT EXISTS public.coupons (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                  text NOT NULL UNIQUE,
    discount_type         text NOT NULL CHECK (discount_type IN ('flat','percent')),
    discount_value        numeric(10,2) NOT NULL,
    applicable_plans      uuid[],
    visibility            text NOT NULL DEFAULT 'private' CHECK (visibility IN ('public','private','agent')),
    is_customer_facing    boolean NOT NULL DEFAULT false,
    assigned_to_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_to_agent_id  uuid REFERENCES public.sales_agents(id) ON DELETE SET NULL,
    max_redemptions       int,
    times_redeemed        int NOT NULL DEFAULT 0,
    valid_from            timestamptz,
    valid_until           timestamptz,
    is_active             boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 4. OPERATIONAL / TRANSACTION TABLES
-- ─────────────────────────────────────────────────────────────

-- 4a. subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    plan_id              uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
    coupon_id            uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
    sales_agent_id       uuid REFERENCES public.sales_agents(id) ON DELETE SET NULL,
    razorpay_sub_id      text UNIQUE,
    razorpay_customer_id text,
    -- IMPORTANT: 'active' status CANNOT be set by any client-facing RLS policy.
    -- It is set exclusively by the Razorpay webhook handler (server-side, service-role key).
    status               text NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','active','paused','cancelled','expired')),
    start_date           date,
    next_billing_date    date,
    paused_at            timestamptz,
    cancelled_at         timestamptz,
    cancel_reason        text,
    acquisition_channel  text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

-- 4b. family_members
CREATE TABLE IF NOT EXISTS public.family_members (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id  uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    full_name        text NOT NULL,
    gotra            text,
    relation         text,
    slot_number      int NOT NULL CHECK (slot_number BETWEEN 1 AND 4),
    is_primary       boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (subscription_id, slot_number)
);

-- 4c. payments
CREATE TABLE IF NOT EXISTS public.payments (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id      uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE RESTRICT,
    razorpay_payment_id  text UNIQUE,
    razorpay_order_id    text,
    amount_paise         int NOT NULL,
    status               text NOT NULL CHECK (status IN ('captured','failed','refunded','pending')),
    method               text,
    cycle_number         int,
    paid_at              timestamptz,
    failure_reason       text,
    created_at           timestamptz NOT NULL DEFAULT now()
);

-- 4d. seva_proofs
-- NOTE: batch_id FK to a 'batches' table is deferred to Session 0.5.
--       Column present but FK constraint NOT added yet.
CREATE TABLE IF NOT EXISTS public.seva_proofs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        uuid,
    seva_id         uuid REFERENCES public.sevas(id) ON DELETE SET NULL,
    team_id         uuid REFERENCES public.teams(id) ON DELETE SET NULL,
    month           int NOT NULL CHECK (month BETWEEN 1 AND 12),
    year            int NOT NULL CHECK (year >= 2024),
    media_url       text NOT NULL,
    media_type      text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
    caption         text,
    is_delivered    boolean NOT NULL DEFAULT false,
    delivered_at    timestamptz,
    whatsapp_msg_id text,
    uploaded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- 4e. prasad_shipments
CREATE TABLE IF NOT EXISTS public.prasad_shipments (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id  uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    month            int NOT NULL CHECK (month BETWEEN 1 AND 12),
    year             int NOT NULL CHECK (year >= 2024),
    status           text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','packed','shipped','delivered','returned')),
    tracking_id      text,
    shipped_at       timestamptz,
    delivered_at     timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 5. NOTIFICATION / AUDIT TABLES
-- ─────────────────────────────────────────────────────────────

-- 5a. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    type     text NOT NULL,
    channel  text NOT NULL CHECK (channel IN ('whatsapp','email','sms','push')),
    message  text,
    status   text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
    meta     jsonb,
    sent_at  timestamptz
);

-- 5b. audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    action     text NOT NULL,
    entity     text NOT NULL,
    entity_id  uuid,
    meta       jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ═════════════════════════════════════════════════════════════
-- 6. SEED DATA
-- ═════════════════════════════════════════════════════════════

-- 6a. Location
INSERT INTO public.locations (id, name, deity_name, city, state)
VALUES (
    'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
    'Tirth Guru Pushkarraj, Pushkar',
    'Pushkarraj',
    'Pushkar',
    'Rajasthan'
) ON CONFLICT (id) DO NOTHING;

-- 6b. Team
INSERT INTO public.teams (id, location_id, name, contact_phone)
VALUES (
    'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
    'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
    'Pushkar Seva Team',
    NULL
) ON CONFLICT (id) DO NOTHING;

-- 6c. Sevas (6 rows)
INSERT INTO public.sevas (id, name, slug, location_id, sort_order) VALUES
    ('c1c1c1c1-0001-0001-0001-c1c1c1c1c1c1', 'Sundarkand Path',         'sundarkand-path',          'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1', 1),
    ('c2c2c2c2-0002-0002-0002-c2c2c2c2c2c2', 'Gau Seva',                'gau-seva',                 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1', 2),
    ('c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3', 'Vanar Seva',              'vanar-seva',               'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1', 3),
    ('c4c4c4c4-0004-0004-0004-c4c4c4c4c4c4', 'Saadhu Santo Ko Bhojan', 'saadhu-santo-ko-bhojan',   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1', 4),
    ('c5c5c5c5-0005-0005-0005-c5c5c5c5c5c5', 'Griha Shanti Hawan',     'griha-shanti-hawan',       'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1', 5),
    ('c6c6c6c6-0006-0006-0006-c6c6c6c6c6c6', 'Sarv Rog Nivaran Hawan', 'sarv-rog-nivaran-hawan',   'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1', 6)
ON CONFLICT (id) DO NOTHING;

-- 6d. Seva schedule rules (7 rows)
INSERT INTO public.seva_schedule_rules (seva_id, weekday, occurrence) VALUES
    ('c1c1c1c1-0001-0001-0001-c1c1c1c1c1c1', 'TUE', 'first'),
    ('c2c2c2c2-0002-0002-0002-c2c2c2c2c2c2', 'TUE', 'first'),
    ('c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3', 'TUE', 'first'),
    ('c4c4c4c4-0004-0004-0004-c4c4c4c4c4c4', 'TUE', 'first'),
    ('c4c4c4c4-0004-0004-0004-c4c4c4c4c4c4', 'SAT', 'last'),
    ('c5c5c5c5-0005-0005-0005-c5c5c5c5c5c5', 'TUE', 'first'),
    ('c6c6c6c6-0006-0006-0006-c6c6c6c6c6c6', 'SAT', 'last')
ON CONFLICT DO NOTHING;

-- 6e. Plans (3 rows)
INSERT INTO public.plans (id, name, slug, price_paise, billing_period, location_id, default_team_id, tagline, sort_order) VALUES
    (
        'd1d1d1d1-0001-0001-0001-d1d1d1d1d1d1',
        'Basic',
        'basic',
        25100,
        'monthly',
        'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
        'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
        'Seva ki shuruaat — Rs 251/month mein maasik Sundarkand, Gau Seva evam Vanar Seva',
        1
    ),
    (
        'd2d2d2d2-0002-0002-0002-d2d2d2d2d2d2',
        'Premium',
        'premium',
        39900,
        'monthly',
        'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
        'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
        'Sampoorna parivarik seva — 2 Sundarkand, 2 hawan, Saadhu Bhojan, Gau/Vanar seva har maah',
        2
    ),
    (
        'd3d3d3d3-0003-0003-0003-d3d3d3d3d3d3',
        'Premium Annual',
        'premium-annual',
        410100,
        'yearly',
        'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
        'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
        'Poore varsh ka sankalp — sabhi sevayen 12 maah + Prasad Box + Sankalp Certificate',
        3
    )
ON CONFLICT (id) DO NOTHING;

-- 6f. plan_sevas — source of truth for tier composition
INSERT INTO public.plan_sevas (plan_id, seva_id) VALUES
    -- Basic: Sundarkand Path, Gau Seva, Vanar Seva
    ('d1d1d1d1-0001-0001-0001-d1d1d1d1d1d1', 'c1c1c1c1-0001-0001-0001-c1c1c1c1c1c1'),
    ('d1d1d1d1-0001-0001-0001-d1d1d1d1d1d1', 'c2c2c2c2-0002-0002-0002-c2c2c2c2c2c2'),
    ('d1d1d1d1-0001-0001-0001-d1d1d1d1d1d1', 'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3'),
    -- Premium: all 6 sevas
    ('d2d2d2d2-0002-0002-0002-d2d2d2d2d2d2', 'c1c1c1c1-0001-0001-0001-c1c1c1c1c1c1'),
    ('d2d2d2d2-0002-0002-0002-d2d2d2d2d2d2', 'c2c2c2c2-0002-0002-0002-c2c2c2c2c2c2'),
    ('d2d2d2d2-0002-0002-0002-d2d2d2d2d2d2', 'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3'),
    ('d2d2d2d2-0002-0002-0002-d2d2d2d2d2d2', 'c4c4c4c4-0004-0004-0004-c4c4c4c4c4c4'),
    ('d2d2d2d2-0002-0002-0002-d2d2d2d2d2d2', 'c5c5c5c5-0005-0005-0005-c5c5c5c5c5c5'),
    ('d2d2d2d2-0002-0002-0002-d2d2d2d2d2d2', 'c6c6c6c6-0006-0006-0006-c6c6c6c6c6c6'),
    -- Premium Annual: same 6 as Premium
    ('d3d3d3d3-0003-0003-0003-d3d3d3d3d3d3', 'c1c1c1c1-0001-0001-0001-c1c1c1c1c1c1'),
    ('d3d3d3d3-0003-0003-0003-d3d3d3d3d3d3', 'c2c2c2c2-0002-0002-0002-c2c2c2c2c2c2'),
    ('d3d3d3d3-0003-0003-0003-d3d3d3d3d3d3', 'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3'),
    ('d3d3d3d3-0003-0003-0003-d3d3d3d3d3d3', 'c4c4c4c4-0004-0004-0004-c4c4c4c4c4c4'),
    ('d3d3d3d3-0003-0003-0003-d3d3d3d3d3d3', 'c5c5c5c5-0005-0005-0005-c5c5c5c5c5c5'),
    ('d3d3d3d3-0003-0003-0003-d3d3d3d3d3d3', 'c6c6c6c6-0006-0006-0006-c6c6c6c6c6c6')
ON CONFLICT DO NOTHING;

-- 6g. plan_addons — Premium Annual: prasad + certificate
INSERT INTO public.plan_addons (plan_id, addon_type, description) VALUES
    ('d3d3d3d3-0003-0003-0003-d3d3d3d3d3d3', 'prasad',      'Quarterly Prasad Box — pavitra prasad ghar par daak dwara'),
    ('d3d3d3d3-0003-0003-0003-d3d3d3d3d3d3', 'certificate', 'Sankalp Certificate — sankalp praamanpatra varshik')
ON CONFLICT DO NOTHING;


-- ═════════════════════════════════════════════════════════════
-- 7. HELPER FUNCTION
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

-- ═════════════════════════════════════════════════════════════
-- 8. ROW LEVEL SECURITY — ENABLE ON ALL TABLES
-- ═════════════════════════════════════════════════════════════

ALTER TABLE public.locations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sevas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seva_schedule_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_sevas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_addons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_agents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seva_proofs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prasad_shipments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_seo            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs          ENABLE ROW LEVEL SECURITY;

-- ═════════════════════════════════════════════════════════════
-- 9. RLS POLICIES
-- ═════════════════════════════════════════════════════════════

-- ── PUBLIC READ catalogue (admin write) ──────────────────────

CREATE POLICY "locations: public read"
    ON public.locations FOR SELECT USING (true);
CREATE POLICY "locations: admin write"
    ON public.locations FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "teams: public read"
    ON public.teams FOR SELECT USING (true);
CREATE POLICY "teams: admin write"
    ON public.teams FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "sevas: public read"
    ON public.sevas FOR SELECT USING (true);
CREATE POLICY "sevas: admin write"
    ON public.sevas FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "seva_schedule_rules: public read"
    ON public.seva_schedule_rules FOR SELECT USING (true);
CREATE POLICY "seva_schedule_rules: admin write"
    ON public.seva_schedule_rules FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "plans: public read"
    ON public.plans FOR SELECT USING (true);
CREATE POLICY "plans: admin write"
    ON public.plans FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "plan_sevas: public read"
    ON public.plan_sevas FOR SELECT USING (true);
CREATE POLICY "plan_sevas: admin write"
    ON public.plan_sevas FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "plan_addons: public read"
    ON public.plan_addons FOR SELECT USING (true);
CREATE POLICY "plan_addons: admin write"
    ON public.plan_addons FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "page_seo: public read"
    ON public.page_seo FOR SELECT USING (true);
CREATE POLICY "page_seo: admin write"
    ON public.page_seo FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "blog_posts: public read published"
    ON public.blog_posts FOR SELECT USING (is_published = true OR public.is_admin());
CREATE POLICY "blog_posts: admin write"
    ON public.blog_posts FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── PROFILES ─────────────────────────────────────────────────

CREATE POLICY "profiles: user reads own"
    ON public.profiles FOR SELECT USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles: user inserts own"
    ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "profiles: user updates own"
    ON public.profiles FOR UPDATE
    USING (id = auth.uid() OR public.is_admin())
    WITH CHECK (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles: admin delete"
    ON public.profiles FOR DELETE USING (public.is_admin());

-- ── COUPONS ──────────────────────────────────────────────────

CREATE POLICY "coupons: user reads assigned or customer-facing"
    ON public.coupons FOR SELECT USING (
        assigned_to_user_id = auth.uid()
        OR (is_customer_facing = true AND is_active = true)
        OR public.is_admin()
    );
CREATE POLICY "coupons: admin write"
    ON public.coupons FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── SALES AGENTS (admin only) ─────────────────────────────────

CREATE POLICY "sales_agents: admin only"
    ON public.sales_agents FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── SUBSCRIPTIONS ────────────────────────────────────────────
-- Clients can INSERT with status='pending' only; no client can set status='active'.
-- Webhook uses service-role key (bypasses RLS entirely).

CREATE POLICY "subscriptions: user reads own"
    ON public.subscriptions FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "subscriptions: user inserts pending only"
    ON public.subscriptions FOR INSERT WITH CHECK (
        user_id = auth.uid() AND status = 'pending'
    );
CREATE POLICY "subscriptions: admin full access"
    ON public.subscriptions FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── FAMILY MEMBERS ───────────────────────────────────────────

CREATE POLICY "family_members: user reads own"
    ON public.family_members FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.id = subscription_id AND s.user_id = auth.uid())
        OR public.is_admin()
    );
CREATE POLICY "family_members: user inserts own"
    ON public.family_members FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.id = subscription_id AND s.user_id = auth.uid())
    );
CREATE POLICY "family_members: user updates own"
    ON public.family_members FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.id = subscription_id AND s.user_id = auth.uid())
        OR public.is_admin()
    );
CREATE POLICY "family_members: admin delete"
    ON public.family_members FOR DELETE USING (public.is_admin());

-- ── PAYMENTS ─────────────────────────────────────────────────

CREATE POLICY "payments: user reads own"
    ON public.payments FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.id = subscription_id AND s.user_id = auth.uid())
        OR public.is_admin()
    );
CREATE POLICY "payments: admin write"
    ON public.payments FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── SEVA PROOFS ──────────────────────────────────────────────
-- Delivered proofs = public read; non-delivered = admin only.
-- Team upload uses service-role key (Session 0.5).

CREATE POLICY "seva_proofs: delivered public read"
    ON public.seva_proofs FOR SELECT USING (is_delivered = true OR public.is_admin());
CREATE POLICY "seva_proofs: admin write"
    ON public.seva_proofs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── PRASAD SHIPMENTS ─────────────────────────────────────────

CREATE POLICY "prasad_shipments: user reads own"
    ON public.prasad_shipments FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.id = subscription_id AND s.user_id = auth.uid())
        OR public.is_admin()
    );
CREATE POLICY "prasad_shipments: admin write"
    ON public.prasad_shipments FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── NOTIFICATIONS ────────────────────────────────────────────

CREATE POLICY "notifications: user reads own"
    ON public.notifications FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "notifications: admin write"
    ON public.notifications FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── AUDIT LOGS ───────────────────────────────────────────────

CREATE POLICY "audit_logs: admin only"
    ON public.audit_logs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ═════════════════════════════════════════════════════════════
-- 10. PERFORMANCE INDEXES
-- ═════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id  ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id  ON public.subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status   ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_family_members_sub_id  ON public.family_members(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_sub_id        ON public.payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_seva_proofs_seva_id    ON public.seva_proofs(seva_id);
CREATE INDEX IF NOT EXISTS idx_seva_proofs_team_id    ON public.seva_proofs(team_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id  ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code           ON public.coupons(code);

-- ═════════════════════════════════════════════════════════════
-- END OF MIGRATION 20260725_001_core_schema
-- ═════════════════════════════════════════════════════════════
