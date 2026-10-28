import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { logAdminAudit } from "@/lib/admin-audit";
import { stripMarkdown } from "@/lib/markdown-lite";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Save,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatusPill,
  TableScroll,
} from "@/components/admin/admin-ui";
import { CloudinaryImageButton } from "@/components/admin/CloudinaryImageButton";

// Admin/owner tier — no extra beforeLoad needed here, the parent
// /admin shell (admin.tsx) already redirects non-staff. Same pattern
// as /admin/plans-sevas, /admin/subscribers etc.
export const Route = createFileRoute("/admin/seo")({
  component: AdminSeoPage,
});

function AdminSeoPage() {
  const [tab, setTab] = useState<"pages" | "blog">("pages");
  return (
    <div className="space-y-6">
      <PageHeader
        title="SEO & Content"
        description="Page meta editor, structured-data wiring and blog content — reflected live in each page's <head>."
      />
      <SegmentedTabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "pages", label: "Page Meta" },
          { value: "blog", label: "Blog Posts" },
        ]}
      />
      {tab === "pages" ? <PageMetaTab /> : <BlogTab />}
    </div>
  );
}

// ─── A2. Page Meta Manager ──────────────────────────────────────────
interface PageSeoRow {
  path: string;
  title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  updated_at: string;
}

interface KnownPage {
  path: string;
  label: string;
}

const STATIC_PAGES: KnownPage[] = [
  { path: "/", label: "Homepage" },
  { path: "/plans", label: "Plans" },
  { path: "/about", label: "About" },
  { path: "/faq", label: "FAQ" },
  { path: "/sevas", label: "Sevas" },
  { path: "/reviews", label: "Reviews" },
  { path: "/blog", label: "Blog (list)" },
];

function PageMetaTab() {
  const [seoRows, setSeoRows] = useState<Map<string, PageSeoRow>>(new Map());
  const [plans, setPlans] = useState<{ slug: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openPath, setOpenPath] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [seoRes, plansRes] = await Promise.all([
        supabase.from("page_seo").select("path, title, meta_description, og_image_url, updated_at"),
        supabase.from("plans").select("slug, name").eq("is_active", true).order("sort_order"),
      ]);
      if (seoRes.error) throw new Error(seoRes.error.message);
      if (plansRes.error) throw new Error(plansRes.error.message);
      setSeoRows(new Map((seoRes.data ?? []).map((r) => [r.path as string, r as PageSeoRow])));
      setPlans(plansRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (error) return <Notice tone="bad">{error}</Notice>;

  const allPages: KnownPage[] = [
    ...STATIC_PAGES,
    ...plans.map((p) => ({ path: `/plan/${p.slug}`, label: `Plan — ${p.name}` })),
  ];

  return (
    <div className="space-y-2.5">
      {allPages.map((page) => (
        <PageSeoRowEditor
          key={page.path}
          page={page}
          row={seoRows.get(page.path) ?? null}
          open={openPath === page.path}
          onToggle={() => setOpenPath((cur) => (cur === page.path ? null : page.path))}
          onSaved={load}
        />
      ))}
    </div>
  );
}

function PageSeoRowEditor({
  page,
  row,
  open,
  onToggle,
  onSaved,
}: {
  page: KnownPage;
  row: PageSeoRow | null;
  open: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(row?.title ?? "");
  const [desc, setDesc] = useState(row?.meta_description ?? "");
  const [ogImage, setOgImage] = useState(row?.og_image_url ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setTitle(row?.title ?? "");
    setDesc(row?.meta_description ?? "");
    setOgImage(row?.og_image_url ?? "");
  }, [row]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.from("page_seo").upsert(
        {
          path: page.path,
          title: title.trim() || null,
          meta_description: desc.trim() || null,
          og_image_url: ogImage.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "path" },
      );
      if (error) throw new Error(error.message);
      await logAdminAudit("page_seo.upsert", "page_seo", null, {
        path: page.path,
        title: title.trim(),
        meta_description: desc.trim(),
      });
      setMsg({ ok: true, text: "Saved — live on the page now." });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-4 sm:px-5 py-3 min-h-12 text-left hover:bg-stone-50/60 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-stone-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
        )}
        <span className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-2">
          <span className="text-sm font-medium text-stone-900 truncate">{page.label}</span>
          <span className="text-xs font-mono text-stone-400 truncate">{page.path}</span>
        </span>
        {!row?.title && <StatusPill tone="warn">Not set</StatusPill>}
      </button>

      {open && (
        <div className="border-t border-stone-100 p-4 sm:p-5 space-y-4">
          <div>
            <Label className="flex items-center justify-between">
              Title
              <span
                className={
                  title.length > 60
                    ? "text-rose-600 text-xs tabular-nums"
                    : "text-stone-400 text-xs tabular-nums"
                }
              >
                {title.length}/60
              </span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Page title for search results"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="flex items-center justify-between">
              Meta Description
              <span
                className={
                  desc.length > 160
                    ? "text-rose-600 text-xs tabular-nums"
                    : "text-stone-400 text-xs tabular-nums"
                }
              >
                {desc.length}/160
              </span>
            </Label>
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="Shown under the title in Google search results"
              className="mt-1"
            />
          </div>
          <div>
            <Label>OG Image</Label>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              {ogImage && (
                <img
                  src={ogImage}
                  alt="OG preview"
                  className="w-16 h-16 object-cover rounded-lg border border-stone-200"
                />
              )}
              <CloudinaryImageButton
                folder="punyata-site/seo"
                label="Upload image"
                onUploaded={setOgImage}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              size="sm"
              disabled={busy}
              onClick={save}
              className="h-9 gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save
            </Button>
            {msg && (
              <span
                className={`text-xs break-words ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}
              >
                {msg.text}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── A4. Blog Manager ───────────────────────────────────────────────
interface BlogPostRow {
  id: string;
  slug: string;
  title: string;
  body_md: string | null;
  cover_image_url: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function BlogTab() {
  const [posts, setPosts] = useState<BlogPostRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BlogPostRow | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, slug, title, body_md, cover_image_url, is_published, published_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      setPosts((data ?? []) as BlogPostRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function deletePost(post: BlogPostRow) {
    if (!window.confirm(`"${post.title}" delete karein? Yeh permanent hai.`)) return;
    const { error } = await supabase.from("blog_posts").delete().eq("id", post.id);
    if (error) {
      window.alert(error.message);
      return;
    }
    await logAdminAudit("blog_posts.delete", "blog_posts", post.id, {
      title: post.title,
      slug: post.slug,
    });
    load();
  }

  if (editing) {
    return (
      <BlogEditor
        post={editing === "new" ? null : editing}
        onDone={() => {
          setEditing(null);
          load();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <Panel
      title="Blog posts"
      description="Drafts and published articles on /blog."
      flush
      actions={
        <Button
          size="sm"
          onClick={() => setEditing("new")}
          className="h-9 sm:h-8 gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
        >
          <Plus className="w-3.5 h-3.5" /> New Post
        </Button>
      }
    >
      {loading && (
        <div className="p-4 sm:p-5">
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      )}
      {error && (
        <div className="p-4 sm:p-5">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}

      {!loading && !error && (posts ?? []).length === 0 && (
        <EmptyState icon={FileText} title="Koi blog post nahi hai." />
      )}

      {!loading && !error && (posts ?? []).length > 0 && (
        <>
          {/* Phone: stacked cards */}
          <ul className="md:hidden divide-y divide-stone-100">
            {(posts ?? []).map((p) => (
              <li key={p.id} className="px-4 py-3 flex items-start gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium text-stone-900 break-words">{p.title}</p>
                  <p className="text-xs font-mono text-stone-500 break-all">/blog/{p.slug}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <BlogStatus published={p.is_published} />
                    <span className="text-xs text-stone-500 tabular-nums">
                      {p.published_at?.slice(0, 10) ?? "—"}
                    </span>
                  </div>
                </div>
                <BlogRowActions onEdit={() => setEditing(p)} onDelete={() => deletePost(p)} />
              </li>
            ))}
          </ul>

          {/* Tablet / desktop: table */}
          <TableScroll className="hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-stone-50/60">
                <tr className="text-left text-xs font-medium text-stone-500 border-b border-stone-100">
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  <th className="px-4 py-2.5 font-medium">Slug</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Published</th>
                  <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {(posts ?? []).map((p) => (
                  <tr key={p.id} className="hover:bg-stone-50/60">
                    <td className="px-4 py-3 font-medium text-stone-900">{p.title}</td>
                    <td className="px-4 py-3 text-xs font-mono text-stone-500 whitespace-nowrap">
                      /blog/{p.slug}
                    </td>
                    <td className="px-4 py-3">
                      <BlogStatus published={p.is_published} />
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-600 tabular-nums whitespace-nowrap">
                      {p.published_at?.slice(0, 10) ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <BlogRowActions
                          onEdit={() => setEditing(p)}
                          onDelete={() => deletePost(p)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </>
      )}
    </Panel>
  );
}

function BlogStatus({ published }: { published: boolean }) {
  return published ? (
    <StatusPill tone="good">Published</StatusPill>
  ) : (
    <StatusPill tone="neutral">Draft</StatusPill>
  );
}

function BlogRowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Button
        size="sm"
        variant="outline"
        onClick={onEdit}
        className="h-9 w-9 sm:h-8 sm:w-8 p-0"
        aria-label="Edit post"
      >
        <Pencil className="w-3.5 h-3.5" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-9 w-9 sm:h-8 sm:w-8 p-0 text-rose-700 border-rose-200 hover:bg-rose-50"
        onClick={onDelete}
        aria-label="Delete post"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function BlogEditor({
  post,
  onDone,
  onCancel,
}: {
  post: BlogPostRow | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!post);
  const [bodyMd, setBodyMd] = useState(post?.body_md ?? "");
  const [coverUrl, setCoverUrl] = useState(post?.cover_image_url ?? "");
  const [isPublished, setIsPublished] = useState(post?.is_published ?? false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(title));
  }, [title, slugTouched]);

  async function save() {
    if (!title.trim() || !slug.trim()) {
      setErr("Title aur slug dono required hain.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const wasPublished = post?.is_published ?? false;
      const payload = {
        title: title.trim(),
        slug: slug.trim(),
        body_md: bodyMd,
        cover_image_url: coverUrl.trim() || null,
        is_published: isPublished,
        ...(isPublished && !post?.published_at ? { published_at: new Date().toISOString() } : {}),
      };

      let savedId = post?.id ?? null;
      if (post) {
        const { error } = await supabase.from("blog_posts").update(payload).eq("id", post.id);
        if (error) throw new Error(error.message);
        await logAdminAudit("blog_posts.update", "blog_posts", post.id, {
          title: title.trim(),
          slug: slug.trim(),
          is_published: isPublished,
        });
      } else {
        const { data, error } = await supabase
          .from("blog_posts")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        savedId = (data as { id: string }).id;
        await logAdminAudit("blog_posts.create", "blog_posts", savedId, {
          title: title.trim(),
          slug: slug.trim(),
          is_published: isPublished,
        });
      }

      // A4 — publish auto-creates a page_seo row if one doesn't exist yet.
      if (isPublished && !wasPublished) {
        const path = `/blog/${slug.trim()}`;
        const { data: existing } = await supabase
          .from("page_seo")
          .select("path")
          .eq("path", path)
          .maybeSingle();
        if (!existing) {
          const { error: seoErr } = await supabase.from("page_seo").insert({
            path,
            title: `${title.trim()} — पुण्यता Blog`,
            meta_description: stripMarkdown(bodyMd).slice(0, 155),
            og_image_url: coverUrl.trim() || null,
          });
          if (!seoErr) {
            await logAdminAudit("page_seo.upsert", "page_seo", null, {
              path,
              source: "blog-auto-publish",
            });
          }
        }
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title={post ? "Edit Post" : "New Post"}
      actions={
        <Button size="sm" variant="outline" onClick={onCancel} className="h-9 sm:h-8">
          Cancel
        </Button>
      }
      bodyClassName="space-y-4"
    >
      <div>
        <Label>Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title"
          className="mt-1"
        />
      </div>
      <div>
        <Label>Slug</Label>
        <Input
          value={slug}
          onChange={(e) => {
            setSlug(slugify(e.target.value));
            setSlugTouched(true);
          }}
          placeholder="post-slug"
          className="mt-1"
        />
        <p className="text-xs text-stone-400 mt-1 break-all">punyata.com/blog/{slug || "…"}</p>
      </div>
      <div>
        <Label>Body (Markdown)</Label>
        <Textarea
          value={bodyMd}
          onChange={(e) => setBodyMd(e.target.value)}
          rows={14}
          className="font-mono text-xs mt-1"
          placeholder={
            "## Heading\n\nContent yahan likhein — **bold**, *italic*, [link](https://...), - bullet list."
          }
        />
      </div>
      <div>
        <Label>Cover Image</Label>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          {coverUrl && (
            <img
              src={coverUrl}
              alt="Cover preview"
              className="w-20 h-20 object-cover rounded-lg border border-stone-200"
            />
          )}
          <CloudinaryImageButton
            folder="punyata-site/blog"
            label="Upload cover"
            onUploaded={setCoverUrl}
          />
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <Switch checked={isPublished} onCheckedChange={setIsPublished} />
        <Label className="cursor-pointer" onClick={() => setIsPublished((v) => !v)}>
          {isPublished ? "Published" : "Draft"}
        </Label>
      </div>
      {err && <Notice tone="bad">{err}</Notice>}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-stone-100">
        <Button
          disabled={busy}
          onClick={save}
          className="mt-3 h-9 gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Save
        </Button>
      </div>
    </Panel>
  );
}
