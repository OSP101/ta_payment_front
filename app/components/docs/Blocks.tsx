import Link from "next/link";
import { ChevronRight, Info, Lightbulb, AlertTriangle, OctagonAlert, ExternalLink, PlayCircle } from "lucide-react";
import type { Block, CalloutTone } from "../../../content/docs/types";
import DocRichText, { DocInline } from "./DocRichText";
import Screenshot from "./Screenshot";
import Gif from "./Gif";
import { Chip, type ChipTone } from "../ui";

const CALLOUT_STYLE: Record<CalloutTone, { cls: string; icon: React.ReactNode }> = {
  info: { cls: "border-accent/30 bg-accent-soft/40 text-accent-soft-foreground", icon: <Info size={16} /> },
  tip: { cls: "border-success/30 bg-success-soft/40 text-success-soft-foreground", icon: <Lightbulb size={16} /> },
  warn: { cls: "border-warning/30 bg-warning-soft/50 text-warning-soft-foreground", icon: <AlertTriangle size={16} /> },
  danger: { cls: "border-danger/30 bg-danger-soft/40 text-danger-soft-foreground", icon: <OctagonAlert size={16} /> },
};

const TONE_MAP: Record<string, ChipTone> = {
  success: "success", info: "info", warn: "warn", danger: "danger", neutral: "neutral",
};

/** Renders one page's `Block[]` — the entire docs content-rendering surface.
 *  Adding a block type means adding one case here and one helper in
 *  `content/docs/types.ts`; page data never imports React. */
export default function DocBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-6">
      {blocks.map((b, i) => <BlockView key={i} block={b} blockIndex={i} />)}
    </div>
  );
}

/** Anchor id of step `stepIndex` inside the page's `blockIndex`-th block —
 *  the one contract `stepEntries` (the "ในหน้านี้" column) and the rendered
 *  `<li id>` share, so a TOC link always lands on its step. */
export const stepId = (blockIndex: number, stepIndex: number) => `step-${blockIndex + 1}-${stepIndex + 1}`;

/** Every step title on the page with its anchor, in reading order. */
export function stepEntries(blocks: Block[]): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  blocks.forEach((b, bi) => {
    if (b.type === "steps") b.items.forEach((s, si) => out.push({ id: stepId(bi, si), title: s.title }));
  });
  return out;
}

function BlockView({ block, blockIndex = 0 }: { block: Block; blockIndex?: number }) {
  switch (block.type) {
    case "text":
      return <DocRichText body={block.body} />;

    case "callout": {
      const s = CALLOUT_STYLE[block.tone];
      return (
        <div className={`rounded-lg border px-4 py-3 ${s.cls}`}>
          <div className="flex gap-2.5">
            <span className="mt-0.5 shrink-0">{s.icon}</span>
            <div className="min-w-0 flex-1">
              {block.title && <div className="font-semibold text-[15px] mb-1">{block.title}</div>}
              <DocRichText body={block.body} />
            </div>
          </div>
        </div>
      );
    }

    case "steps":
      return (
        <ol className="space-y-5">
          {block.items.map((s, i) => (
            // scroll-mt clears the sticky header when a TOC link jumps here.
            <li key={i} id={stepId(blockIndex, i)} className="group flex gap-3 scroll-mt-24">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--brand) text-sm font-semibold text-white">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-base font-semibold text-foreground leading-7">
                  {s.title}
                  <a
                    href={`#${stepId(blockIndex, i)}`}
                    aria-label={`ลิงก์ไปยังขั้นตอน ${s.title}`}
                    className="text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-(--brand) focus:opacity-100"
                  >
                    #
                  </a>
                </div>
                {s.body && <div className="mt-1"><DocRichText body={s.body} /></div>}
                {s.screenshot && <Screenshot id={s.screenshot} />}
                {s.gif && <Gif id={s.gif} />}
                {s.callout && (
                  <div className="mt-2">
                    <BlockView block={{ type: "callout", tone: s.callout.tone, body: s.callout.body }} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      );

    case "screenshot":
      return <Screenshot id={block.id} caption={block.caption} hotspots={block.hotspots} />;

    case "gif":
      return <Gif id={block.id} caption={block.caption} />;

    case "statusTable":
      return (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-medium">สถานะ</th>
                <th className="px-3 py-2 text-start font-medium">ความหมาย</th>
                <th className="px-3 py-2 text-start font-medium">ใครต้องทำต่อ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {block.rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 whitespace-nowrap"><Chip tone={TONE_MAP[r.tone]}>{r.status}</Chip></td>
                  <td className="px-3 py-2"><DocInline text={r.meaning} keyBase={`m${i}`} /></td>
                  <td className="px-3 py-2 text-muted">{r.whoActsNext ? <DocInline text={r.whoActsNext} keyBase={`w${i}`} /> : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "table":
      return (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-muted">
              <tr>{block.headers.map((h, i) => <th key={i} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {block.rows.map((row, i) => (
                <tr key={i}>{row.map((c, j) => <td key={j} className="px-3 py-2 align-top"><DocInline text={c} keyBase={`c${i}-${j}`} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "uiPath":
      return (
        <div className="inline-flex flex-wrap items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1.5 text-sm text-slate-700">
          {block.path.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {i > 0 && <ChevronRight size={13} className="text-slate-400" />}
              <span className={i === block.path.length - 1 ? "font-semibold" : ""}>{p}</span>
            </span>
          ))}
        </div>
      );

    case "since":
      return (
        <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft/50 px-2.5 py-1 text-xs text-accent-soft-foreground">
          <span className="font-semibold">เพิ่มในเวอร์ชัน {block.version}</span>
          {block.note && <span className="text-accent-soft-foreground/80">({block.note})</span>}
        </div>
      );

    case "goToApp":
      // target="_top": inside the DocsPanel drawer this page is an
      // <iframe>, and "go do it" must navigate the app, not the drawer.
      // On the full manual (top-level window) _top is a plain navigation.
      return (
        <Link
          href={block.route}
          target="_top"
          className="inline-flex items-center gap-1.5 rounded-lg bg-(--brand) px-3.5 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          {block.label}
          <ExternalLink size={14} />
        </Link>
      );

    case "tryInDemo":
      // app/demo/page.tsx picks the role purely from which account card the
      // visitor clicks and doesn't read any search params — a `?role=`/`?tour=`
      // link would silently be ignored, not pre-select the role or launch the
      // tour the label promises. Link to the plain picker until that page is
      // taught to read them; `block.role`/`block.tourKey` stay on the type as
      // the intent for whoever wires that up, they're just not in the href yet.
      return (
        <Link
          href="/demo"
          target="_top"
          className="inline-flex items-center gap-1.5 rounded-lg border border-(--brand) px-3.5 py-2 text-sm font-medium text-(--brand) hover:bg-accent-soft/40 transition-colors"
        >
          <PlayCircle size={16} />
          {block.label}
        </Link>
      );

    default:
      return null;
  }
}
