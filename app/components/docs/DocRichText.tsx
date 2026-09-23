"use client";
import { renderInline, renderEmphasis } from "../inlineMarkdown";

/**
 * Same tiny, safe markup as `app/components/RichText.tsx` (announcements):
 * `**bold**`, `*italic*`, `- bullet`, `1. numbered`, `[label](url)` — the
 * link/emphasis layer is the SAME code, imported from `../inlineMarkdown`,
 * not a second copy of it. The one thing this content needs that RichText's
 * doesn't is `` `code` `` spans, which this content leans on constantly for
 * field names, file name patterns and route paths (adapted from the tour
 * descriptions, which used raw `<code>`/`<b>` HTML — this renders the same
 * meaning without `dangerouslySetInnerHTML`) — `renderCode` below is spliced
 * into the shared pipeline as its `renderPlain` step, running before
 * `renderEmphasis` so `` `**not bold**` `` inside a code span stays literal.
 *
 * Kept as its own small file rather than extending RichText itself: RichText
 * documents (in its own header comment) exactly why it has no code-span
 * support today — announcements never needed it — and bolting docs-only
 * markup onto a component whose job is rendering user-authored announcements
 * would blur that boundary. Block-level layout (lists, paragraphs) is also
 * intentionally NOT shared: this content never needs RichText's `:::center`
 * alignment markers, and forcing that feature onto the manual's own simpler
 * loop would import complexity docs content has no use for.
 */

function renderCode(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /`([^`\n]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(...renderEmphasis(text.slice(last, m.index), `${keyBase}-e${last}`));
    out.push(
      <code key={`${keyBase}-code${m.index}`} className="px-1 py-0.5 rounded bg-slate-100 text-[0.9em] font-mono text-slate-700">
        {m[1]}
      </code>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...renderEmphasis(text.slice(last), `${keyBase}-e${last}`));
  return out;
}

/** One line of the same markup, no block layout — for table cells, chip
 *  labels and other spots that hold a phrase rather than a paragraph, so
 *  `**bold**` and `` `code` `` in a cell render instead of showing raw. */
export function DocInline({ text, keyBase = "i" }: { text: string; keyBase?: string }) {
  return <>{renderInline(text, keyBase, renderCode)}</>;
}

export default function DocRichText({ body, className = "" }: { body: string; className?: string }) {
  const lines = (body ?? "").split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let numbers: string[] = [];

  const flushLists = () => {
    if (bullets.length) {
      const items = bullets;
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="my-1.5 list-disc space-y-1 ps-5">
          {items.map((t, i) => <li key={i}>{renderInline(t, `ul${blocks.length}-${i}`, renderCode)}</li>)}
        </ul>,
      );
      bullets = [];
    }
    if (numbers.length) {
      const items = numbers;
      blocks.push(
        <ol key={`ol-${blocks.length}`} className="my-1.5 list-decimal space-y-1 ps-5">
          {items.map((t, i) => <li key={i}>{renderInline(t, `ol${blocks.length}-${i}`, renderCode)}</li>)}
        </ol>,
      );
      numbers = [];
    }
  };

  lines.forEach((raw, idx) => {
    const line = raw.replace(/\s+$/, "");
    const bullet = /^\s*[-•]\s+(.*)$/.exec(line);
    if (bullet) {
      if (numbers.length) flushLists();
      bullets.push(bullet[1]);
      return;
    }
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      if (bullets.length) flushLists();
      numbers.push(numbered[1]);
      return;
    }
    flushLists();
    if (line.trim() === "") {
      blocks.push(<div key={`sp-${idx}`} className="h-2" />);
      return;
    }
    blocks.push(<p key={`p-${idx}`}>{renderInline(line, `p${idx}`, renderCode)}</p>);
  });
  flushLists();

  return <div className={`text-[15px] leading-7 text-foreground/90 space-y-1.5 ${className}`}>{blocks}</div>;
}
