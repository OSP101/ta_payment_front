import Link from "next/link";
import { ArrowRight, BellRing, ExternalLink, Hourglass } from "lucide-react";
import type { Audience, JourneyStage } from "../../../content/docs/types";
import DocRichText from "./DocRichText";
import Screenshot from "./Screenshot";
import Gif from "./Gif";

/** Anchor id of a journey stage; `journeyEntries` and the `<li id>` share it. */
export const stageId = (blockIndex: number, stageIndex: number) => `stage-${blockIndex + 1}-${stageIndex + 1}`;

/**
 * The first-use walkthrough a newcomer gets as a link: the whole path on one
 * page, in the order the work really happens. Numbered stages are the
 * reader's turn; hourglass stages are someone else's, and say what the
 * reader will receive when it is their turn again, so "what now?" never
 * needs a second page.
 */
export default function Journey({
  stages,
  blockIndex,
  audience,
  linkBase,
}: {
  stages: JourneyStage[];
  blockIndex: number;
  audience: Audience;
  linkBase: "/docs" | "/docs-embed";
}) {
  let n = 0;
  const moreHref = (ref: string) => {
    const i = ref.indexOf(":");
    const aud = i > 0 ? ref.slice(0, i) : audience;
    const slug = i > 0 ? ref.slice(i + 1) : ref;
    // a common page is listed under whichever manual the reader is in
    return `${linkBase}/${aud === "common" ? audience : aud}/${slug}`;
  };

  return (
    <ol className="relative">
      {stages.map((s, i) => {
        const isDo = s.kind === "do";
        if (isDo) n += 1;
        const last = i === stages.length - 1;
        return (
          <li key={i} id={stageId(blockIndex, i)} className="relative flex gap-3.5 pb-7 scroll-mt-24 sm:gap-4">
            {/* spine between markers */}
            {!last && <span className="absolute left-[15px] top-9 bottom-0 w-px bg-border sm:left-[17px]" aria-hidden="true" />}
            {isDo ? (
              <span className="relative z-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--brand) text-sm font-bold text-white ring-4 ring-white sm:h-9 sm:w-9 sm:text-base">
                {n}
              </span>
            ) : (
              <span className="relative z-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 bg-white text-slate-400 ring-4 ring-white sm:h-9 sm:w-9">
                <Hourglass size={15} aria-hidden="true" />
              </span>
            )}

            <div
              className={
                "min-w-0 flex-1 rounded-xl border px-4 py-3.5 " +
                (isDo ? "border-border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]" : "border-dashed border-slate-300 bg-slate-50/70")
              }
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {!isDo && <span className="text-xs font-semibold text-slate-500">ช่วงรอ</span>}
                <h3 className={"text-base font-semibold leading-7 " + (isDo ? "text-foreground" : "text-slate-600")}>{s.title}</h3>
                {s.when && (
                  <span className="rounded-full bg-accent-soft/60 px-2 py-0.5 text-[11.5px] font-medium text-accent-soft-foreground">{s.when}</span>
                )}
              </div>

              {s.body && <div className="mt-1.5"><DocRichText body={s.body} /></div>}

              {s.warn && (
                <div className="mt-3 rounded-lg border border-warning/40 bg-warning-soft/40 px-3 py-2 text-sm text-warning-soft-foreground">
                  <DocRichText body={s.warn} />
                </div>
              )}

              {s.screenshot && <Screenshot id={s.screenshot} />}
              {s.gif && <Gif id={s.gif} />}

              {s.notice && (
                <div className="mt-3 flex gap-2 rounded-lg bg-accent-soft/40 px-3 py-2 text-sm text-foreground/85">
                  <BellRing size={15} className="mt-1 shrink-0 text-(--brand)" aria-hidden="true" />
                  <div className="min-w-0"><DocRichText body={s.notice} /></div>
                </div>
              )}

              {(s.go || s.more) && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {s.go && (
                    // _top: in the docs panel this page is an iframe, and the
                    // button must move the app, not the panel.
                    <Link
                      href={s.go.route}
                      target="_top"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-(--brand) px-3.5 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                    >
                      {s.go.label}
                      <ExternalLink size={14} aria-hidden="true" />
                    </Link>
                  )}
                  {s.more && (
                    <Link href={moreHref(s.more)} className="inline-flex items-center gap-1 text-sm font-medium text-(--brand) hover:underline underline-offset-2">
                      อ่านวิธีทำแบบละเอียด
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
