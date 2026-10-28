import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
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
  RefreshCw,
  Send,
  Heart,
  MessageCircle,
  ExternalLink,
} from "lucide-react";
import {
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatusPill,
  type Tone,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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

type StudioTab = "create" | "library" | "analyze";

function ContentStudioPage() {
  const [tab, setTab] = useState<StudioTab>("create");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Studio"
        description="AI-generated Instagram posts (Hindi + English) on the immortaltalks model — captions, hooks, reel scripts, carousels & CTAs. Review, schedule, mark posted."
      />
      <div className="space-y-4">
        <SegmentedTabs<StudioTab>
          value={tab}
          onChange={setTab}
          items={[
            { value: "create", label: "Create" },
            { value: "library", label: "Library" },
            { value: "analyze", label: "Analyze" },
          ]}
        />
        {tab === "create" && <CreateTab />}
        {tab === "library" && <LibraryTab />}
        {tab === "analyze" && <AnalyzeTab />}
      </div>
    </div>
  );
}

// ─── Create tab ──────────────────────────────────────────────────────
function CreateTab() {
  const [format, setFormat] = useState<PostFormat>("reel");
  const [pillar, setPillar] = useState<Pillar>("mirror");
  const [topic, setTopic] = useState("");
  const [promo, setPromo] = useState(false);
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
        { format, pillar, topic: topic.trim() || undefined, promo },
      );
      setContent(res.content);
      setModel(res.model);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }, [format, pillar, topic, promo]);

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
    <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)] gap-4 sm:gap-6 items-start">
      {/* Controls */}
      <Panel title="Post settings" bodyClassName="space-y-4">
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

        <div className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-800">Promo post</p>
            <p className="mt-0.5 text-xs text-stone-500 leading-relaxed">
              Off = pure wisdom, empty caption (the normal, high-engagement post — verified against
              immortaltalks' own top posts). On = a rare, one-line offer caption.
            </p>
          </div>
          <Switch checked={promo} onCheckedChange={setPromo} className="mt-0.5 shrink-0" />
        </div>

        <Button
          onClick={generate}
          disabled={loading}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white"
        >
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
          <Notice tone="bad" icon={AlertTriangle}>
            <span className="break-words">{error}</span>
          </Notice>
        )}
        {notice && (
          <Notice tone="good" icon={Check}>
            {notice}
          </Notice>
        )}
      </Panel>

      {/* Preview */}
      <div className="min-w-0">
        {!content ? (
          <div className="admin-card border-dashed">
            <EmptyState
              icon={Wand2}
              title="Nothing generated yet"
              description="Pick a format & pillar, then Generate. The post appears here in Hindi + English for you to review and edit."
              className="py-14"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <ContentEditor format={format} content={content} onChange={setContent} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => save("draft")} disabled={saving}>
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save draft
              </Button>
              <Button
                onClick={() => save("approved")}
                disabled={saving}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
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
    <Panel title="Preview & edit" bodyClassName="space-y-5">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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

      {/* Caption — usually intentionally empty (verified against
          immortaltalks' live posts: wisdom posts carry no caption at
          all, and that's the pattern behind their top engagement). */}
      <Field label="Caption (below the post) — empty is normal for wisdom posts">
        <BilingualText
          en={content.caption.en}
          hi={content.caption.hi}
          rows={3}
          onEn={(v) => setPair("caption", "en", v)}
          onHi={(v) => setPair("caption", "hi", v)}
        />
      </Field>

      {/* CTA — only meaningful on a Promo post; empty otherwise */}
      <Field label="CTA (promo posts only)">
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
                className="text-xs bg-stone-50 border border-stone-200 text-stone-700 rounded-full px-2.5 py-1 break-words"
              >
                {h}
              </span>
            ))}
          </div>
        </Field>
      )}

      {/* Hashtags — empty by default. immortaltalks uses none, on any
          post type; leave this blank unless you deliberately want to
          deviate from the model. */}
      {(content.hashtags.en.length > 0 || content.hashtags.hi.length > 0) && (
        <Field label="Hashtags (off-model — immortaltalks uses none)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <p className="text-stone-600 break-words">
              <span className="font-medium text-stone-400">EN: </span>
              {content.hashtags.en.join(" ")}
            </p>
            <p className="text-stone-600 break-words">
              <span className="font-medium text-stone-400">HI: </span>
              {content.hashtags.hi.join(" ")}
            </p>
          </div>
        </Field>
      )}
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[13px] font-medium text-stone-700 leading-snug">{label}</Label>
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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div className="space-y-1">
        <span className="text-xs text-stone-500">English</span>
        <Textarea value={en} rows={rows} onChange={(e) => onEn(e.target.value)} />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-stone-500">हिन्दी</span>
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
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v as PostStatus | "all")}>
          <SelectTrigger className="w-full sm:w-44 flex-1 sm:flex-none bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="posted">Posted</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => void load()} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {error && (
        <Notice tone="bad" icon={AlertTriangle}>
          <span className="break-words">{error}</span>
        </Notice>
      )}

      {loading ? (
        <div className="admin-card flex items-center justify-center gap-2 text-sm text-stone-500 p-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : posts.length === 0 ? (
        <div className="admin-card border-dashed">
          <EmptyState
            title="Nothing here yet. Generate a post in the Create tab."
            className="py-14"
          />
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

  const statusTone: Tone =
    post.status === "posted" ? "good" : post.status === "approved" ? "warn" : "neutral";

  return (
    <div className="admin-card p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-stone-400 flex-none" />
          <span className="text-sm font-semibold text-stone-900 capitalize">{post.format}</span>
          {post.pillar && (
            <Badge variant="outline" className="text-xs font-normal text-stone-600 capitalize">
              {post.pillar}
            </Badge>
          )}
          <span className="capitalize">
            <StatusPill tone={statusTone}>{post.status}</StatusPill>
          </span>
        </div>
        <span className="text-xs text-stone-400 flex-none tabular-nums">
          {new Date(post.created_at).toLocaleDateString()}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="min-w-0">
          <p className="text-xs font-medium text-stone-500 mb-0.5">On-screen</p>
          <p className="text-stone-800 whitespace-pre-wrap break-words">
            {post.content.on_screen?.en}
          </p>
          <p className="text-stone-500 whitespace-pre-wrap break-words mt-1">
            {post.content.on_screen?.hi}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-stone-500 mb-0.5">Caption (EN)</p>
          <p className="text-stone-800 whitespace-pre-wrap break-words line-clamp-4">
            {post.content.caption?.en || (
              <em className="text-stone-400">(empty — pure wisdom post, by design)</em>
            )}
          </p>
        </div>
      </div>

      {/* Phase 3 — card image render + publish (card format only) */}
      {post.format === "card" && (
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 space-y-2">
          <div className="flex items-start gap-3">
            {post.image_url ? (
              <img
                src={post.image_url}
                alt="Rendered card"
                className="w-16 h-20 flex-none object-cover rounded-md border border-stone-200"
              />
            ) : (
              <div className="w-16 h-20 flex-none rounded-md border border-dashed border-stone-300 bg-white grid place-items-center text-xs text-stone-400 text-center leading-tight">
                No card yet
              </div>
            )}
            <div className="flex flex-wrap gap-2 min-w-0">
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
                  className="inline-flex items-center gap-1 h-8 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2.5"
                >
                  <ExternalLink className="w-3 h-3" /> View on Instagram
                </a>
              )}
            </div>
          </div>
          {cardError && <p className="text-xs text-rose-700 break-words">{cardError}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-3">
        <CopyBtn
          label="Caption EN"
          active={copied === "cap-en"}
          onClick={() =>
            copy(
              "cap-en",
              [post.content.caption?.en, (post.content.hashtags?.en ?? []).join(" ")]
                .filter(Boolean)
                .join("\n\n"),
            )
          }
        />
        <CopyBtn
          label="Caption HI"
          active={copied === "cap-hi"}
          onClick={() =>
            copy(
              "cap-hi",
              [post.content.caption?.hi, (post.content.hashtags?.hi ?? []).join(" ")]
                .filter(Boolean)
                .join("\n\n"),
            )
          }
        />
        <div className="hidden sm:block flex-1" />
        {post.status !== "approved" && (
          <Button size="sm" variant="outline" onClick={() => onStatus(post.id, "approved")}>
            Approve
          </Button>
        )}
        {post.status !== "posted" ? (
          <Button
            size="sm"
            onClick={() => onStatus(post.id, "posted")}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
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
      type="button"
      className="inline-flex items-center gap-1.5 h-8 text-xs font-medium text-stone-700 bg-white hover:bg-stone-50 border border-stone-200 rounded-md px-2.5 transition-colors"
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
      <Panel bodyClassName="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-[13px] font-medium text-stone-700 leading-snug">
            Reference accounts (comma-separated, public business/creator handles)
          </Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
              placeholder="immortaltalks, tantratalks"
              className="bg-white"
            />
            <Button
              onClick={fetchData}
              disabled={loading}
              className="shrink-0 bg-orange-600 hover:bg-orange-700 text-white"
            >
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
          <p className="text-xs text-stone-500">
            Our own page shows full insights (likes, comments, saves, reach). Reference accounts
            show public likes &amp; comments only — Meta blocks their saves/reach.
          </p>
        </div>
        {error && (
          <Notice tone="bad" icon={AlertTriangle}>
            <span className="break-words">{error}</span>
          </Notice>
        )}
        {errors.length > 0 && (
          <Notice tone="warn" icon={AlertTriangle}>
            <div className="space-y-0.5 text-xs">
              {errors.map((e) => (
                <p key={e.account} className="break-words">
                  <span className="font-semibold">{e.account}:</span> {e.error}
                </p>
              ))}
            </div>
          </Notice>
        )}
      </Panel>

      {snapshots.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {snapshots.map((s) => (
              <AccountCard key={s.account} snap={s} />
            ))}
          </div>
          <Panel
            title="AI strategy"
            actions={
              <Button size="sm" variant="outline" onClick={genStrategy} disabled={stratLoading}>
                {stratLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-2" />
                )}
                Generate strategy
              </Button>
            }
          >
            {strategy ? (
              <div className="text-sm text-stone-700 whitespace-pre-wrap break-words leading-relaxed">
                {strategy}
              </div>
            ) : (
              <p className="text-xs text-stone-500">
                Gemini reads the ranked data above and tells you which topics &amp; formats to post
                more of.
              </p>
            )}
          </Panel>
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
    <div className="admin-card p-4 sm:p-5 space-y-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-stone-900 truncate">
            {isSelf ? "Punyata (self)" : `@${snap.ig_username ?? snap.account}`}
          </span>
          {isSelf && <StatusPill tone="info">You</StatusPill>}
        </div>
        <span className="text-xs text-stone-500 tabular-nums">
          {snap.followers != null ? `${snap.followers.toLocaleString()} followers` : "—"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Posts" value={String(snap.media.length)} />
        <Stat label="Avg likes" value={avg(likes).toLocaleString()} />
        <Stat
          label="Avg comments"
          value={avg(snap.media.map((m) => m.comments_count)).toLocaleString()}
        />
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-stone-500">Top posts by likes</p>
        {top.map((m, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="text-stone-400 w-4 flex-none tabular-nums">{i + 1}.</span>
            <span className="text-stone-600 flex-1 min-w-0 break-words line-clamp-2">
              {(m.caption ?? "").replace(/\s+/g, " ").slice(0, 90) || <em>(no caption)</em>}
            </span>
            <span className="flex items-center gap-1 text-stone-700 flex-none tabular-nums">
              <Heart className="w-3 h-3 text-rose-500" /> {m.like_count.toLocaleString()}
            </span>
            <span className="flex items-center gap-1 text-stone-400 flex-none tabular-nums">
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
    <div className="rounded-lg bg-stone-50 border border-stone-100 px-2 py-2.5 min-w-0">
      <div className="text-xs text-stone-500 truncate">{label}</div>
      <div className="mt-0.5 text-base font-semibold text-stone-900 tabular-nums truncate">
        {value}
      </div>
    </div>
  );
}
