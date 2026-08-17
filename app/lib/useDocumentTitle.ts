"use client";
import { useEffect } from "react";

const BRAND = "COCO TAS";

/** Sets the browser tab title to `${title} | COCO TAS`, or just the brand
 *  when there is no page-specific title yet (e.g. still loading).
 *  `unreadCount`, when positive, prefixes a Facebook/YouTube-style "(N) "
 *  badge — capped at "99+" so a busy inbox doesn't stretch the tab title. */
export default function useDocumentTitle(title?: string | null, unreadCount?: number) {
  useEffect(() => {
    const base = title ? `${title} | ${BRAND}` : BRAND;
    document.title = unreadCount && unreadCount > 0
      ? `(${unreadCount > 99 ? "99+" : unreadCount}) ${base}`
      : base;
  }, [title, unreadCount]);
}
