"use client";
import { renderInline } from "./inlineMarkdown";

/**
 * Renders an announcement body.
 *
 * The body is plain text carrying a very small markup:
 *
 *   **หนา**              bold
 *   *เอียง*              italic
 *   - รายการ             bullet list
 *   1. รายการ            numbered list
 *   [ข้อความ](https://…) link
 *   :::center            aligns the ONE block that follows, then back to left
 *
 * Everything is parsed into React elements. There is NO dangerouslySetInnerHTML
 * anywhere in this file, and there never should be: the body is written by
 * staff but rendered to every reader including anonymous ones, so a path that
 * injected HTML would turn the composer into a way to run script in someone
 * else's session.
 *
 * Bare URLs are linked automatically — people paste them far more often than
 * they write [label](url). The link/emphasis parsing itself lives in
 * `./inlineMarkdown`, shared with the docs manual's `DocRichText` — only the
 * block-level layout below (lists, alignment, paragraphs) is specific to
 * announcements.
 */

type Align = "left" | "center" | "right";

const ALIGN_CLASS: Record<Align, string> = {
  left: "text-start",
  center: "text-center",
  right: "text-end",
};

export default function RichText({ body, className = "" }: { body: string; className?: string }) {
  const lines = (body ?? "").split("\n");
  const blocks: React.ReactNode[] = [];

  // Alignment applies to the next block only, then resets. The toolbar puts
  // the marker above the line the caret is on, so "จัดกึ่งกลาง" has to mean
  // that line — carrying it forward silently centred the whole rest of the
  // post, lists and all.
  let align: Align = "left";
  const takeAlign = (): Align => {
    const a = align;
    align = "left";
    return a;
  };
  let bullets: string[] = [];
  let numbers: string[] = [];

  const flushLists = () => {
    if (bullets.length) {
      const items = bullets;
      const a = takeAlign();
      blocks.push(
        <ul key={`ul-${blocks.length}`} className={`my-1.5 list-disc space-y-0.5 ps-5 ${ALIGN_CLASS[a]}`}>
          {items.map((t, i) => <li key={i}>{renderInline(t, `ul${blocks.length}-${i}`)}</li>)}
        </ul>,
      );
      bullets = [];
    }
    if (numbers.length) {
      const items = numbers;
      const a = takeAlign();
      blocks.push(
        <ol key={`ol-${blocks.length}`} className={`my-1.5 list-decimal space-y-0.5 ps-5 ${ALIGN_CLASS[a]}`}>
          {items.map((t, i) => <li key={i}>{renderInline(t, `ol${blocks.length}-${i}`)}</li>)}
        </ol>,
      );
      numbers = [];
    }
  };

  lines.forEach((raw, idx) => {
    const line = raw.replace(/\s+$/, "");

    const alignMatch = /^:::(center|right|left)\s*$/.exec(line.trim());
    if (alignMatch) {
      flushLists(); // close any open list under the PREVIOUS alignment first
      align = alignMatch[1] as Align;
      return;
    }

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
      blocks.push(<div key={`sp-${idx}`} className="h-3" />);
      return;
    }
    blocks.push(
      <p key={`p-${idx}`} className={ALIGN_CLASS[takeAlign()]}>
        {renderInline(line, `p${idx}`)}
      </p>,
    );
  });
  flushLists();

  return <div className={`leading-7 ${className}`}>{blocks}</div>;
}
