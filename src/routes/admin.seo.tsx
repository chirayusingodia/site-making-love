import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callAdminApi, uploadToCloudinary } from "@/lib/cloudinary-upload";
import { logAdminAudit } from "@/lib/admin-audit";
import { stripMarkdown } from "@/lib/markdown-lite";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Loader2,
  Save,
  Upload,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

// Admin/owner tier — no extra beforeLoad needed here, the parent
// /admin shell (admin.tsx) already redirects non-staff. Same pattern
// as /admin/plans-sevas, /admin/subscribers etc.
export const Route = createFileRoute("/admin/seo")({
  component: AdminSeoPage,
});

function AdminSeoPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Search className="w-5 h-5 text-amber-700" />
          SEO & Content
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Page meta editor, structured-data wiring and blog content — reflected live in each page's
          &lt;head&gt;.
        </p>
      </div>
      <Tabs defaultValue="pages">
        <TabsList>
          <TabsTrigger value="pages">Page Meta</TabsTrigger>
          <TabsTrigger value="blog">Blog Posts</TabsTrigger>
        </TabsList>
        <TabsContent value="pages">
          <PageMetaTab />
        </TabsContent>
        <TabsContent value="blog">
          <BlogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Shared: signed Cloudinary image upload button ─────────────────
function CloudinaryImageButton({
  folder,
  label,
  onUploaded,
}: {
  folder: string;
  label: string;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File) {
    setErr(null);
    setProgress(0);
    try {
      const sign = await callAdminApi<import("@/lib/cloudinary-upload").SignResponse>(
        "/api/cloudinary/sign-upload",
        { folder, resourceType: "image" },
      );
      const { secure_url } = await uploadToCloudinary(sign, file, setProgress);
      onUploaded(secure_url);
      setProgress(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
      setProgress(null);
    }
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={progress != null}
        className="gap-1.5 text-xs"
      >
        {progress != null ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Upload className="w-3.5 h-3.5" />
        )}
        {progress != null ? `Uploading ${progress}%` : label}
      </Button>
      {err && <div className="text-[11px] text-rose-600">{err}</div>}
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

  if (loading) return <Skeleton className="h-64 w-full rounded-2xl mt-3" />;
  if (error) {
    return (
      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
        {error}
      </div>
    );
  }

  const allPages: KnownPage[] = [
    ...STATIC_PAGES,
    ...plans.map((p) => ({ path: `/plan/${p.slug}`, label: `Plan — ${p.name}` })),
  ];

  return (
    <div className="space-y-2.5 mt-3">
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
    <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
          {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          {page.label}
          <span className="text-[11px] font-mono font-normal text-slate-400">{page.path}</span>
          {!row?.title && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
              Not set
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100 p-5 space-y-3.5">
          <div>
            <Label className="flex items-center justify-between">
              Title
              <span className={title.length > 60 ? "text-rose-600 text-[11px]" : "text-slate-400 text-[11px]"}>
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
              <span className={desc.length > 160 ? "text-rose-600 text-[11px]" : "text-slate-400 text-[11px]"}>
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
            <div className="flex items-center gap-3 mt-1">
              {ogImage && (
                <img src={ogImage} alt="OG preview" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
              )}
              <CloudinaryImageButton folder="punyata-site/seo" label="Upload image" onUploaded={setOgImage} />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button size="sm" disabled={busy} onClick={save} className="gap-1.5 bg-amber-700 hover:bg-amber-800 text-white">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </Button>
            {msg && (
              <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</span>
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
    <div className="space-y-4 mt-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")} className="gap-1.5 bg-amber-700 hover:bg-amber-800 text-white">
          <Plus className="w-3.5 h-3.5" /> New Post
        </Button>
      </div>

      {loading && <Skeleton className="h-48 w-full rounded-2xl" />}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{error}</div>
      )}

      {!loading && !error && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5 overflow-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2">Title</th>
                <th className="pb-2">Slug</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Published</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(posts ?? []).map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="py-2 font-semibold">{p.title}</td>
                  <td className="py-2 text-xs font-mono text-slate-500">/blog/{p.slug}</td>
                  <td className="py-2">
                    {p.is_published ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Published
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-xs">{p.published_at?.slice(0, 10) ?? "—"}</td>
                  <td className="py-2 text-right space-x-1.5">
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-700 border-rose-200 hover:bg-rose-50"
                      onClick={() => deletePost(p)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && posts?.length === 0 && (
            <div className="text-slate-400 text-sm px-2 py-6 text-center">Koi blog post nahi hai.</div>
          )}
        </section>
      )}
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
        const { data, error } = await supabase.from("blog_posts").insert(payload).select("id").single();
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
        const { data: existing } = await supabase.from("page_seo").select("path").eq("path", path).maybeSingle();
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
    <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs p-5 space-y-4 mt-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">{post ? "Edit Post" : "New Post"}</h2>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div>
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Post title" className="mt-1" />
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
        <p className="text-[11px] text-slate-400 mt-1">punyata.com/blog/{slug || "…"}</p>
      </div>
      <div>
        <Label>Body (Markdown)</Label>
        <Textarea
          value={bodyMd}
          onChange={(e) => setBodyMd(e.target.value)}
          rows={14}
          className="font-mono text-xs mt-1"
          placeholder={"## Heading\n\nContent yahan likhein — **bold**, *italic*, [link](https://...), - bullet list."}
        />
      </div>
      <div>
        <Label>Cover Image</Label>
        <div className="flex items-center gap-3 mt-1">
          {coverUrl && (
            <img src={coverUrl} alt="Cover preview" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
          )}
          <CloudinaryImageButton folder="punyata-site/blog" label="Upload cover" onUploaded={setCoverUrl} />
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <Switch checked={isPublished} onCheckedChange={setIsPublished} />
        <Label className="cursor-pointer" onClick={() => setIsPublished((v) => !v)}>
          {isPublished ? "Published" : "Draft"}
        </Label>
      </div>
      {err && <p className="text-xs text-rose-700">{err}</p>}
      <Button disabled={busy} onClick={save} className="gap-1.5 bg-amber-700 hover:bg-amber-800 text-white">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        Save
      </Button>
    </section>
  );
}
