"use client";
import { useEffect, useState } from "react";

export interface TocEntry { id: string; title: string }

/**
 * The right-hand "ในหน้านี้" column of a doc page — the list of the page's
 * numbered steps, with the one currently on screen highlighted (the same
 * scroll-spy pattern as developers.cloudflare.com's "On this page").
 *
 * Entries come from the page's `steps` blocks: `DocBlocks` gives every step
 * an `id` and `DocArticle` collects them, so a page with no steps simply
 * has no column. Only rendered from `xl` up; below that the content
 * column needs the width more than the reader needs a map of it.
 */
export default function OnThisPage({ entries }: { entries: TocEntry[] }) {
  const [active, setActive] = useState<string | null>(entries[0]?.id ?? null);

  useEffect(() => {
    if (entries.length === 0) return;
    const els = entries
      .map((e) => document.getElementById(e.id))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;

    // The active step is the last one whose top has passed a line a third
    // of the way down the viewport — so the highlight moves when the reader
    // has actually reached a step, not when its first pixel appears.
    const update = () => {
      const line = window.innerHeight / 3;
      let current = els[0].id;
      for (const el of els) {
        if (el.getBoundingClientRect().top <= line) current = el.id;
      }
      setActive(current);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <nav aria-label="ในหน้านี้" className="text-sm">
      <div className="mb-2 text-xs font-semibold text-foreground">ในหน้านี้</div>
      <ol className="border-s border-border">
        {entries.map((e) => {
          const isActive = e.id === active;
          return (
            <li key={e.id}>
              <a
                href={`#${e.id}`}
                className={
                  "-ms-px block border-s-2 py-1 ps-3 leading-5 transition-colors " +
                  (isActive
                    ? "border-(--brand) text-(--brand) font-medium"
                    : "border-transparent text-muted hover:text-foreground")
                }
              >
                {e.title}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
