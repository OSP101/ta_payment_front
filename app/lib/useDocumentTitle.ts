"use client";
import { useEffect } from "react";

const BRAND = "COCO TAS";

// The title this page asked for, and the one observer that holds it there.
// Next 16 streams metadata: the root layout's <title>COCO TAS</title> commits
// AFTER the page's effects have run (on first load and on every client
// navigation), so a one-shot `document.title = …` is overwritten a moment
// later and the tab only ever shows the brand. Watching <head> and putting the
// wanted title back is what makes it stick. Module-level rather than per hook
// call so two mounted callers can never ping-pong: the latest one wins.
let wanted: string | null = null;
let observer: MutationObserver | null = null;

function enforce() {
  if (wanted !== null && document.title !== wanted) document.title = wanted;
}

/** Sets the browser tab title to `${title} | COCO TAS`, or just the brand
 *  when there is no page-specific title yet (e.g. still loading).
 *  `unreadCount`, when positive, prefixes a Facebook/YouTube-style "(N) "
 *  badge — capped at "99+" so a busy inbox doesn't stretch the tab title. */
export default function useDocumentTitle(title?: string | null, unreadCount?: number) {
  useEffect(() => {
    const base = title ? `${title} | ${BRAND}` : BRAND;
    const next = unreadCount && unreadCount > 0
      ? `(${unreadCount > 99 ? "99+" : unreadCount}) ${base}`
      : base;
    wanted = next;
    if (!observer) {
      observer = new MutationObserver(enforce);
      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    }
    enforce();
    return () => {
      // Let go only if nobody replaced us meanwhile; a page without the hook
      // then keeps whatever its own metadata says.
      if (wanted === next) wanted = null;
    };
  }, [title, unreadCount]);
}
