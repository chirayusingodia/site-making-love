import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  Loader2,
  Wand2,
  Save,
  Copy,
  Check,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  CalendarDays,
  BarChart3,
  TrendingUp,
  Send,
  Heart,
  MessageCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { callAdminApi, AdminApiError } from "@/lib/admin-api";
import { uploadToCloudinary, type SignResponse } from "@/lib/cloudinary-upload";
import { renderCardToFile } from "@/lib/content-card-render";
import {
  PILLARS,
  FORMATS,
  type Pillar,
  type PostFormat,
  type PostStatus,
  type GeneratedContent,
  type ContentPost,
} from "@/lib/content-playbook";

// Local mirror of meta.server's AccountSnapshot (server module is not
// imported into the client bundle — only its shape is needed here).
interface AnalyzeMedia {
  caption: string | null;
  media_type: string | null;
  like_count: number;
  comments_count: number;
  permalink: string | null;
  timestamp: string | null;
  saved?: number | null;
  reach?: number | null;
}
interface AnalyzeSnapshot {
  account: string;
  ig_username: string | null;
  followers: number | null;
  media: AnalyzeMedia[];
}

export const Route = createFileRoute("/admin/content-studio")({
  component: ContentStudioPage,
});

const FORMAT_ICON: Record<PostFormat, typeof Film> = {
  reel: Film,
  card: ImageIcon,
  carousel: LayoutGrid,
};

function ContentStudioPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-700" />
          Content Studio
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          AI-generated Instagram posts (Hindi + English) on the immortaltalks model — captions,
          hooks, reel scripts, carousels & CTAs. Review, schedule, mark posted.
        </p>
      </div>
      <Tabs defaultValue="create">
        <TabsList>
          <TabsTrigger value="create">Create</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="analyze">Analyze</TabsTrigger>
        </TabsList>
        <TabsContent value="create">
          <CreateTab />
        </TabsContent>
        <TabsContent value="library">
          <LibraryTab />
        </TabsContent>
        <TabsContent value="analyze">
          <AnalyzeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Create tab ──────────────────────────────────────────────────────
function CreateTab() {
  const [format, setFormat] = useState<PostFormat>("reel");
  const [pillar, setPillar] = useState<Pillar>("mirror");
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [content, setContent] = useState<GeneratedContent | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await callAdminApi<{ content: GeneratedContent; model: string }>(
        "/api/admin/content/generate",
        { format, pillar, topic: topic.trim() || undefined },
      );
      setContent(res.content);
      setModel(res.model);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }, [format, pillar, topic]);

  const save = useCallback(
    async (status: PostStatus) => {
      if (!content) return;
      setSaving(true);
      setError(null);
      setNotice(null);
      try {
        await callAdminApi<{ id: string }>("/api/admin/content/save", {
          format,
          pillar,
          topic: topic.trim() || null,
          status,
          content,
          model,
        });
        setNotice(status === "approved" ? "Saved & approved ✓" : "Saved to Library ✓");
      } catch (err) {
        setError(err instanceof AdminApiError ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [content, format, pillar, topic, model],
  );

  return (
    <div className="grid md:grid-cols-[320px_1fr] gap-5">
      {/* Controls */}
      <div className="space-y-4 rounded-xl border border-amber-900/10 bg-white p-4 h-fit">
        <div className="space-y-1.5">
          <Label>Format</Label>
          <Select value={format} onValueChange={(v) => setFormat(v as PostFormat)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMATS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label} — {f.hint}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Pillar</Label>
          <Select value={pillar} onValueChange={(v) => setPillar(v as Pillar)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PILLARS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label} — {p.hint}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Topic / angle (optional)</Label>
          <Textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. overthinking at night, gratitude, forgiveness…"
            rows={2}
          />
        </div>

        <Button onClick={generate} disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 mr-2" /> Generate
            </>
          )}
        </Button>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
            {error}
          </p>
        )}
        {notice && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2">
            {notice}
          </p>
        )}
      </div>

      {/* Preview */}
      <div className="min-w-0">
        {!content ? (
          <div className="rounded-xl border border-dashed border-amber-900/20 bg-amber-50/30 p-10 text-center text-sm text-amber-900/50">
            Pick a format & pillar, then Generate. The post appears here in Hindi + English for you
            to review and edit.
          </div>
        ) : (
          <div className="space-y-4">
            <ContentEditor format={format} content={content} onChange={setContent} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => save("draft")} disabled={saving}>
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save draft
              </Button>
              <Button onClick={() => save("approved")} disabled={saving}>
                <Check className="w-4 h-4 mr-2" /> Save & approve
              </Button>
              <Button variant="ghost" onClick={generate} disabled={loading}>
                <Wand2 className="w-4 h-4 mr-2" /> Regenerate
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Editable preview of one generated post ──────────────────────────
function ContentEditor({
  format,
  content,
  onChange,
}: {
  format: PostFormat;
  content: GeneratedContent;
  onChange: (c: GeneratedContent) => void;
}) {
  const setPair = (key: "on_screen" | "caption" | "cta", lang: "en" | "hi", val: string) =>
    onChange({ ...content, [key]: { ...content[key], [lang]: val } });

  return (
    <div className="rounded-xl border border-amber-900/10 bg-white p-4 space-y-5">
      {/* On-screen text */}
      <Field
        label={
          format === "carousel"
            ? "Cover line (on-card)"
            : "On-screen / on-card text (wisdom only — no selling)"
        }
      >
        <BilingualText
          en={content.on_screen.en}
          hi={content.on_screen.hi}
          rows={format === "reel" ? 3 : 2}
          onEn={(v) => setPair("on_screen", "en", v)}
          onHi={(v) => setPair("on_screen", "hi", v)}
        />
      </Field>

      {format === "reel" && (
        <Field label="Reel script (beat-by-beat)">
          <BilingualText
            en={content.reel_script.en}
            hi={content.reel_script.hi}
            rows={4}
            onEn={(v) => onChange({ ...content, reel_script: { ...content.reel_script, en: v } })}
            onHi={(v) => onChange({ ...content, reel_script: { ...content.reel_script, hi: v } })}
          />
        </Field>
      )}

      {format === "carousel" && (
        <Field label="Carousel slides (one per line)">
          <div className="grid sm:grid-cols-2 gap-2">
            <Textarea
              value={content.carousel.en.join("\n")}
              rows={6}
              onChange={(e) =>
                onChange({
                  ...content,
                  carousel: { ...content.carousel, en: e.target.value.split("\n") },
                })
              }
              placeholder="English slides…"
            />
            <Textarea
              value={content.carousel.hi.join("\n")}
              rows={6}
              onChange={(e) =>
                onChange({
                  ...content,
                  carousel: { ...content.carousel, hi: e.target.value.split("\n") },
                })
              }
              placeholder="हिन्दी स्लाइड…"
            />
          </div>
        </Field>
      )}

      {/* Caption */}
      <Field label="Caption (below the post)">
        <BilingualText
          en={content.caption.en}
          hi={content.caption.hi}
          rows={5}
          onEn={(v) => setPair("caption", "en", v)}
          onHi={(v) => setPair("caption", "hi", v)}
        />
      </Field>

      {/* CTA */}
      <Field label="CTA (soft invite)">
        <BilingualText
          en={content.cta.en}
          hi={content.cta.hi}
          rows={2}
          onEn={(v) => setPair("cta", "en", v)}
          onHi={(v) => setPair("cta", "hi", v)}
        />
      </Field>

      {/* Hooks */}
      {content.hooks.length > 0 && (
        <Field label="Alternative hooks">
          <div className="flex flex-wrap gap-1.5">
            {content.hooks.map((h, i) => (
              <span
                key={i}
                className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-full px-2.5 py-1"
              >
                {h}
              </span>
            ))}
          </div>
        </Field>
      )}

      {/* Hashtags */}
      <Field label="Hashtags">
        <div className="grid sm:grid-cols-2 gap-2 text-xs">
          <p className="text-slate-600">
            <span className="font-semibold text-slate-400">EN: </span>
            {content.hashtags.en.join(" ")}
          </p>
          <p className="text-slate-600">
            <span className="font-semibold text-slate-400">HI: </span>
            {content.hashtags.hi.join(" ")}
          </p>
        </div>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-amber-900/70">{label}</Label>
      {children}
    </div>
  );
}

function BilingualText({
  en,
  hi,
  rows,
  onEn,
  onHi,
}: {
  en: string;
  hi: string;
  rows: number;
  onEn: (v: string) => void;
  onHi: (v: string) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-2">
      <div className="space-y-1">
        <span className="text-[10px] font-semibold text-slate-400 uppercase">English</span>
        <Textarea value={en} rows={rows} onChange={(e) => onEn(e.target.value)} />
      </div>
      <div className="space-y-1">
        <span className="text-[10px] font-semibold text-slate-400 uppercase">हिन्दी</span>
        <Textarea value={hi} rows={rows} onChange={(e) => onHi(e.target.value)} />
      </div>
    </div>
  );
}

// ─── Library tab ─────────────────────────────────────────────────────
function LibraryTab() {
  const [status, setStatus] = useState<PostStatus | "all">("all");
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await callAdminApi<{ posts: ContentPost[] }>("/api/admin/content/list", {
        status: status === "all" ? undefined : status,
      });
      setPosts(res.posts);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const setPostStatus = useCallback(
    async (id: string, next: PostStatus) => {
      try {
        await callAdminApi("/api/admin/content/update-status", { id, status: next });
        void load();
      } catch (err) {
        setError(err instanceof AdminApiError ? err.message : "Update failed");
      }
    },
    [load],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v as PostStatus | "all")}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="posted">Posted</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 p-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-amber-900/20 bg-amber-50/30 p-10 text-center text-sm text-amber-900/50">
          Nothing here yet. Generate a post in the Create tab.
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <LibraryCard key={p.id} post={p} onStatus={setPostStatus} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryCard({
  post,
  onStatus,
  onRefresh,
}: {
  post: ContentPost;
  onStatus: (id: string, s: PostStatus) => void;
  onRefresh: () => void;
}) {
  const Icon = FORMAT_ICON[post.format];
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard may be blocked; ignore */
    }
  };

  // Phase 3 — render the quote card client-side, upload to Cloudinary,
  // persist the URL. Uses the EN on-screen line (Hindi cards can be
  // rendered the same way with the HI text if needed).
  const renderCard = async (lang: "en" | "hi") => {
    setBusy("render");
    setCardError(null);
    try {
      const text = post.content.on_screen?.[lang]?.trim();
      if (!text) throw new Error("No on-screen text to render");
      const file = await renderCardToFile({ text }, `card-${post.id}`);
      const sign = await callAdminApi<SignResponse>("/api/cloudinary/sign-upload", {
        folder: `punyata-content/${post.id}`,
        resourceType: "image",
      });
      const { secure_url } = await uploadToCloudinary(sign, file, () => {});
      await callAdminApi("/api/admin/content/set-image", { id: post.id, image_url: secure_url });
      onRefresh();
    } catch (err) {
      setCardError(
        err instanceof AdminApiError || err instanceof Error ? err.message : "Render failed",
      );
    } finally {
      setBusy(null);
    }
  };

  const publish = async (lang: "en" | "hi") => {
    setBusy("publish");
    setCardError(null);
    try {
      await callAdminApi("/api/admin/content/publish", { id: post.id, language: lang });
      onRefresh();
    } catch (err) {
      setCardError(
        err instanceof AdminApiError || err instanceof Error ? err.message : "Publish failed",
      );
    } finally {
      setBusy(null);
    }
  };

  const statusColor =
    post.status === "posted"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : post.status === "approved"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <div className="rounded-xl border border-amber-900/10 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-amber-700 flex-none" />
          <span className="text-sm font-semibold text-slate-800 capitalize">{post.format}</span>
          {post.pillar && (
            <Badge variant="outline" className="text-[10px] capitalize">
              {post.pillar}
            </Badge>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded-full border capitalize ${statusColor}`}>
            {post.status}
          </span>
        </div>
        <span className="text-[11px] text-slate-400 flex-none">
          {new Date(post.created_at).toLocaleDateString()}
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase mb-0.5">On-screen</p>
          <p className="text-slate-700 whitespace-pre-wrap">{post.content.on_screen?.en}</p>
          <p className="text-slate-500 whitespace-pre-wrap mt-1">{post.content.on_screen?.hi}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase mb-0.5">Caption (EN)</p>
          <p className="text-slate-700 whitespace-pre-wrap line-clamp-4">
            {post.content.caption?.en}
          </p>
        </div>
      </div>

      {/* Phase 3 — card image render + publish (card format only) */}
      {post.format === "card" && (
        <div className="rounded-lg border border-amber-900/10 bg-amber-50/40 p-3 space-y-2">
          <div className="flex items-center gap-3">
            {post.image_url ? (
              <img
                src={post.image_url}
                alt="Rendered card"
                className="w-16 h-20 object-cover rounded-md border border-amber-900/10"
              />
            ) : (
              <div className="w-16 h-20 rounded-md border border-dashed border-amber-900/20 grid place-items-center text-[10px] text-amber-900/40 text-center">
                No card yet
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => renderCard("en")}
              >
                {busy === "render" ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <ImageIcon className="w-3.5 h-3.5 mr-1.5" />
                )}
                {post.image_url ? "Re-render (EN)" : "Render card (EN)"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => renderCard("hi")}
              >
                <ImageIcon className="w-3.5 h-3.5 mr-1.5" /> Render (HI)
              </Button>
              {post.image_url && post.status !== "posted" && (
                <>
                  <Button size="sm" disabled={busy !== null} onClick={() => publish("en")}>
                    {busy === "publish" ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Publish EN
                  </Button>
                  <Button size="sm" disabled={busy !== null} onClick={() => publish("hi")}>
                    <Send className="w-3.5 h-3.5 mr-1.5" /> Publish HI
                  </Button>
                </>
              )}
              {post.ig_permalink && (
                <a
                  href={post.ig_permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1"
                >
                  <ExternalLink className="w-3 h-3" /> View on Instagram
                </a>
              )}
            </div>
          </div>
          {cardError && <p className="text-xs text-red-600">{cardError}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <CopyBtn
          label="Caption EN"
          active={copied === "cap-en"}
          onClick={() =>
            copy(
              "cap-en",
              `${post.content.caption?.en ?? ""}\n\n${(post.content.hashtags?.en ?? []).join(" ")}`,
            )
          }
        />
        <CopyBtn
          label="Caption HI"
          active={copied === "cap-hi"}
          onClick={() =>
            copy(
              "cap-hi",
              `${post.content.caption?.hi ?? ""}\n\n${(post.content.hashtags?.hi ?? []).join(" ")}`,
            )
          }
        />
        <div className="flex-1" />
        {post.status !== "approved" && (
          <Button size="sm" variant="outline" onClick={() => onStatus(post.id, "approved")}>
            Approve
          </Button>
        )}
        {post.status !== "posted" ? (
          <Button size="sm" onClick={() => onStatus(post.id, "posted")}>
            <CalendarDays className="w-3.5 h-3.5 mr-1.5" /> Mark posted
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => onStatus(post.id, "draft")}>
            Undo
          </Button>
        )}
      </div>
    </div>
  );
}

function CopyBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md px-2 py-1 transition-colors"
    >
      {active ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {active ? "Copied" : label}
    </button>
  );
}

// ─── Analyze tab (Phase 2) ───────────────────────────────────────────
function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function AnalyzeTab() {
  const [competitors, setCompetitors] = useState("immortaltalks");
  const [snapshots, setSnapshots] = useState<AnalyzeSnapshot[]>([]);
  const [errors, setErrors] = useState<{ account: string; error: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<string | null>(null);
  const [stratLoading, setStratLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStrategy(null);
    try {
      const list = competitors
        .split(",")
        .map((s) => s.trim().replace(/^@/, ""))
        .filter(Boolean);
      const res = await callAdminApi<{
        snapshots: AnalyzeSnapshot[];
        errors: { account: string; error: string }[];
      }>("/api/admin/content/analyze", { competitors: list });
      setSnapshots(res.snapshots);
      setErrors(res.errors);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Analyze failed");
    } finally {
      setLoading(false);
    }
  }, [competitors]);

  const genStrategy = useCallback(async () => {
    setStratLoading(true);
    setError(null);
    try {
      const res = await callAdminApi<{ strategy: string }>("/api/admin/content/strategy", {});
      setStrategy(res.strategy);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Strategy failed");
    } finally {
      setStratLoading(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-900/10 bg-white p-4 space-y-3">
        <div className="space-y-1.5">
          <Label>Reference accounts (comma-separated, public business/creator handles)</Label>
          <div className="flex gap-2">
            <Input
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
              placeholder="immortaltalks, tantratalks"
            />
            <Button onClick={fetchData} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Fetching…
                </>
              ) : (
                <>
                  <BarChart3 className="w-4 h-4 mr-2" /> Fetch latest
                </>
              )}
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">
            Our own page shows full insights (likes, comments, saves, reach). Reference accounts
            show public likes &amp; comments only — Meta blocks their saves/reach.
          </p>
        </div>
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
            {error}
          </p>
        )}
        {errors.length > 0 && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 space-y-0.5">
            {errors.map((e) => (
              <p key={e.account}>
                <span className="font-semibold">{e.account}:</span> {e.error}
              </p>
            ))}
          </div>
        )}
      </div>

      {snapshots.length > 0 && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            {snapshots.map((s) => (
              <AccountCard key={s.account} snap={s} />
            ))}
          </div>
          <div className="rounded-xl border border-amber-900/10 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-700" /> AI Strategy
              </h3>
              <Button size="sm" onClick={genStrategy} disabled={stratLoading}>
                {stratLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-2" />
                )}
                Generate strategy
              </Button>
            </div>
            {strategy ? (
              <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {strategy}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Gemini reads the ranked data above and tells you which topics &amp; formats to post
                more of.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AccountCard({ snap }: { snap: AnalyzeSnapshot }) {
  const isSelf = snap.account === "self";
  const likes = snap.media.map((m) => m.like_count);
  const top = [...snap.media].sort((a, b) => b.like_count - a.like_count).slice(0, 5);

  return (
    <div className="rounded-xl border border-amber-900/10 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900">
            {isSelf ? "Punyata (self)" : `@${snap.ig_username ?? snap.account}`}
          </span>
          {isSelf && <Badge className="text-[10px]">You</Badge>}
        </div>
        <span className="text-xs text-slate-500">
          {snap.followers != null ? `${snap.followers.toLocaleString()} followers` : "—"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Posts" value={String(snap.media.length)} />
        <Stat label="Avg likes" value={avg(likes).toLocaleString()} />
        <Stat
          label="Avg comments"
          value={avg(snap.media.map((m) => m.comments_count)).toLocaleString()}
        />
      </div>
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase">Top posts by likes</p>
        {top.map((m, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="text-slate-400 w-4 flex-none">{i + 1}.</span>
            <span className="text-slate-600 flex-1 line-clamp-2">
              {(m.caption ?? "").replace(/\s+/g, " ").slice(0, 90) || <em>(no caption)</em>}
            </span>
            <span className="flex items-center gap-1 text-rose-600 flex-none">
              <Heart className="w-3 h-3" /> {m.like_count.toLocaleString()}
            </span>
            <span className="flex items-center gap-1 text-slate-400 flex-none">
              <MessageCircle className="w-3 h-3" /> {m.comments_count.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-amber-50/60 border border-amber-900/5 py-2">
      <div className="text-base font-bold text-amber-900">{value}</div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}
