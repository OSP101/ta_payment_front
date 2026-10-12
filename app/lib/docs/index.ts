import "server-only";
import type { Me } from "../api";
import type { Audience, DocPage } from "../../../content/docs/types";
import type { DocsIndex } from "../../../content/docs/meta";
import { pagesForAudience, toMeta } from "../../../content/docs/registry";
import { allowedAudiences } from "./audience";
import { DEFAULT_LOCALE, type Locale } from "../i18n/core";

/** The client-safe page list for every audience `me` may open — never an
 *  audience they may not (a TA's index has no `staff` key at all) — in the
 *  reader's language. */
export function docsIndexFor(me: Me, locale: Locale = DEFAULT_LOCALE): DocsIndex {
  const out: DocsIndex = {};
  for (const a of allowedAudiences(me)) {
    out[a] = pagesForAudience(a, locale).map((p) => toMeta(p, a, locale));
  }
  return out;
}

/** Every page `me` may search, each once (common pages appear under every
 *  audience), in the same order the old client-side pool used. */
export function searchablePagesFor(me: Me, locale: Locale = DEFAULT_LOCALE): DocPage[] {
  const seen = new Set<string>();
  const pages: DocPage[] = [];
  for (const a of allowedAudiences(me)) {
    for (const p of pagesForAudience(a, locale)) {
      const key = `${p.audience}:${p.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pages.push(p);
    }
  }
  return pages;
}

export function isAudience(v: string | null): v is Audience {
  return v === "staff" || v === "lecturer" || v === "ta" || v === "common";
}
