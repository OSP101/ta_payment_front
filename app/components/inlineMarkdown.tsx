"use client";
import { Fragment } from "react";

/**
 * The inline layer of the tiny markdown-lite markup both `RichText.tsx`
 * (announcements) and `docs/DocRichText.tsx` (the in-app manual) render:
 * `[label](url)`, bare URLs auto-linked, and `**bold**`/`*italic*`/`***both***`.
 * Extracted here so the two callers share one implementation instead of two
 * copies that can silently drift — `RichText.tsx`'s own header comment
 * documents a cross-language invariant with the Go side stripping the same
 * emphasis markers in the same order, which only means something if there's
 * exactly one place in this codebase that defines "the same order".
 *
 * `renderPlain` is the escape hatch for a caller that needs one more inline
 * pass before emphasis (`DocRichText` splices in `` `code` `` spans here) —
 * it defaults to `renderEmphasis`, so a caller with no extra syntax (RichText)
 * doesn't need to pass anything.
 */

type PlainRenderer = (text: string, keyBase: string) => React.ReactNode[];

const URL_SPLIT_RE = /(https?:\/\/[^\s<>()]+)/g;
// Separate, NON-global copy: a /g regex carries lastIndex between .test()
// calls, so testing the same string twice returns true then false.
const URL_TEST_RE = /^https?:\/\/[^\s<>()]+$/;
const MD_LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g;

/** Inline pass: links first (their text must not be re-scanned for URLs), then `renderPlain`. */
export function renderInline(text: string, keyBase: string, renderPlain: PlainRenderer = renderEmphasis): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(MD_LINK_RE);
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(...renderAutoLinks(text.slice(last, m.index), `${keyBase}-t${last}`, renderPlain));
    out.push(
      <a key={`${keyBase}-l${m.index}`} href={m[2]} target="_blank" rel="noopener noreferrer nofollow"
         className="text-brand underline underline-offset-2 break-words">
        {m[1]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...renderAutoLinks(text.slice(last), `${keyBase}-t${last}`, renderPlain));
  return out;
}

export function renderAutoLinks(text: string, keyBase: string, renderPlain: PlainRenderer = renderEmphasis): React.ReactNode[] {
  const parts = text.split(URL_SPLIT_RE);
  return parts.map((p, i) =>
    URL_TEST_RE.test(p)
      ? (
        <a key={`${keyBase}-u${i}`} href={p} target="_blank" rel="noopener noreferrer nofollow"
           className="text-brand underline underline-offset-2 break-words">
          {p}
        </a>
      )
      : <Fragment key={`${keyBase}-s${i}`}>{renderPlain(p, `${keyBase}-e${i}`)}</Fragment>,
  );
}

/**
 * ***both***, **bold**, *italic* — longest marker first, or the outer stars of
 * the longer marker are left on screen as literal text. The Go side strips them
 * in the same order (announce_text.go), so the mail and the page agree.
 */
export function renderEmphasis(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*\*([^*\n]+)\*\*\*|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(<b key={`${keyBase}-bi${m.index}`} className="font-semibold"><i>{m[1]}</i></b>);
    } else if (m[2] !== undefined) {
      out.push(<b key={`${keyBase}-b${m.index}`} className="font-semibold">{m[2]}</b>);
    } else {
      out.push(<i key={`${keyBase}-i${m.index}`}>{m[3]}</i>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
