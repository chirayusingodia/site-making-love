import { createElement, type ReactNode } from "react";

// Minimal, dependency-free markdown -> React renderer for blog_posts.body_md.
// Deliberately NOT a full CommonMark implementation — covers the subset
// long-form seva/daan content actually needs: headings, paragraphs, bold,
// italic, links, and simple bullet/numbered lists. No new package per the
// "keep the blog editor lightweight" instruction.

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: links before bold/italic so "**[a](b)**" still resolves.
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const key = `${keyPrefix}-${i++}`;
    if (match[1] !== undefined) {
      nodes.push(
        createElement(
          "a",
          { key, href: match[2], className: "text-brand underline underline-offset-2" },
          match[1],
        ),
      );
    } else if (match[3] !== undefined) {
      nodes.push(createElement("strong", { key }, match[3]));
    } else if (match[4] !== undefined) {
      nodes.push(createElement("em", { key }, match[4]));
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/** Strips markdown syntax down to plain text — used for auto-generated meta descriptions. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_>#`-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Renders body_md into an array of block-level React elements. */
export function renderMarkdown(md: string): ReactNode[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] | null = null;
  let listOrdered = false;

  function flushList() {
    if (!listItems) return;
    const tag = listOrdered ? "ol" : "ul";
    blocks.push(
      createElement(
        tag,
        {
          key: `list-${blocks.length}`,
          className: listOrdered ? "list-decimal pl-5 space-y-1" : "list-disc pl-5 space-y-1",
        },
        listItems.map((item, idx) =>
          createElement("li", { key: idx }, renderInline(item, `li-${blocks.length}-${idx}`)),
        ),
      ),
    );
    listItems = null;
    listOrdered = false;
  }

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const sizes: Record<number, string> = {
        1: "text-3xl font-bold mt-6 mb-2",
        2: "text-2xl font-bold mt-5 mb-2",
        3: "text-xl font-bold mt-4 mb-1.5",
      };
      blocks.push(
        createElement(
          `h${Math.min(level, 6)}`,
          { key: `h-${idx}`, className: sizes[level] ?? "text-lg font-bold mt-3 mb-1" },
          renderInline(heading[2], `h-${idx}`),
        ),
      );
      return;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (listItems && listOrdered !== ordered) flushList();
      listOrdered = ordered;
      listItems = listItems ?? [];
      listItems.push((bullet ?? numbered)![1]);
      return;
    }
    flushList();
    blocks.push(
      createElement(
        "p",
        { key: `p-${idx}`, className: "leading-relaxed" },
        renderInline(line, `p-${idx}`),
      ),
    );
  });
  flushList();
  return blocks;
}
