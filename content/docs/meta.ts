import type { Audience } from "./types";

/**
 * What the CLIENT may know about a doc page: where it is and what it is
 * called — never its body. `content/docs/registry.ts` (the pages themselves)
 * is server-only; the in-app pill, the drawer and the manual's sidebar work
 * from this shape instead, served per reader by `/docs-index` (only the
 * audiences that reader may open) or passed down by a server layout.
 *
 * Everything here is pure and dependency-free so client components can
 * import it without dragging page content into their bundle.
 */
export interface DocPageMeta {
  slug: string;
  audience: Audience;
  section: string;
  order: number;
  title: string;
  description: string;
  routes?: string[];
  /** Other pages document tabs/modals of this page's screen (see
   *  `screenSubPages`) — the pill opens such a topic in a new tab. */
  hasSubPages: boolean;
}

/** The per-reader index `/docs-index` returns: one list per audience the
 *  reader may open, each already including the shared "common" pages. */
export type DocsIndex = Partial<Record<Audience, DocPageMeta[]>>;

/**
 * A page's audience AS VIEWED from a given switch — pages authored with
 * `audience: "common"` resolve to whichever audience the reader currently
 * has selected, since that's the manual they're reading it from.
 */
export function effectiveAudience(page: { audience: Audience }, viewingAs: Audience): Audience {
  return page.audience === "common" ? viewingAs : page.audience;
}

/** `/docs/<effective audience>/<slug>` for `page` as viewed from `viewingAs`. */
export function docHref(page: { audience: Audience; slug: string }, viewingAs: Audience): string {
  return `/docs/${effectiveAudience(page, viewingAs)}/${page.slug}`;
}
