// The manual's full text. Server-only: a client import would ship every
// audience's pages — the staff manual included — to anyone who loads any
// page's JS, gate or no gate. Client code works from `./meta` instead.
import "server-only";
import type { Audience, DocPage } from "./types";
import { effectiveAudience, docHref, type DocPageMeta } from "./meta";
import mediaData from "./media.json";
import glossaryData from "./glossary.json";
import { commonPages } from "./pages/common";
import { taPages } from "./pages/ta";
import { lecturerPages } from "./pages/lecturer";
import { staffPages } from "./pages/staff";

export interface MediaEntry {
  id: string;
  kind: "png" | "gif" | "svg";
  audience: Audience | "common";
  route: string;
  desc: string;
  account: string;
  priority: "P1" | "P2";
  since: string;
  captured: boolean;
  file: string; // relative to public/docs/v1/
}

export const MEDIA: Record<string, MediaEntry> = Object.fromEntries(
  (mediaData as MediaEntry[]).map((m) => [m.id, m]),
);

export const GLOSSARY: Record<string, { term: string; def: string }> = glossaryData;

const ALL_PAGES: DocPage[] = [...commonPages, ...taPages, ...lecturerPages, ...staffPages];

/** `pagesForAudience` result per audience, computed once — `ALL_PAGES` is
 *  static module data, so there's nothing to gain from re-filtering and
 *  re-sorting it on every call (registry functions below call each other
 *  and get called from every page render). */
const BY_AUDIENCE: Record<Audience, DocPage[]> = (() => {
  const audiences: Audience[] = ["common", "ta", "lecturer", "staff"];
  const out = {} as Record<Audience, DocPage[]>;
  for (const audience of audiences) {
    out[audience] = ALL_PAGES
      .filter((p) => p.audience === audience || p.audience === "common")
      .sort((a, b) => a.order - b.order);
  }
  return out;
})();

/** All pages visible under a given audience switch — its own pages plus the
 *  shared "ทั่วไป" ones, which every audience folds into its own sidebar. */
export function pagesForAudience(audience: Audience): DocPage[] {
  return BY_AUDIENCE[audience];
}

// Defined in ./meta (pure, client-safe); re-exported so server callers keep
// importing them from here.
export { effectiveAudience, docHref };

/**
 * The sub-pages that document the SAME app screen as `owner` — the pages
 * right after it in its section that declare no `routes:` of their own
 * (a tab, modal or scroll-section of the owner's screen; see the comments on
 * `settings/terms` or `payouts/export`). Stops at the next page that owns a
 * route, since that one is a different screen.
 *
 * `PageHeader`'s docs pill uses this to decide drawer vs new tab: a screen
 * with sub-pages is a topic the reader will step through, which needs the
 * full manual's sidebar; a screen with none is one page, which reads fine
 * in the side drawer.
 */
export function screenSubPages(owner: DocPage, audience: Audience): DocPage[] {
  const section = pagesForAudience(audience).filter((p) => p.section === owner.section);
  const i = section.findIndex((p) => p.slug === owner.slug);
  if (i < 0) return [];
  const subs: DocPage[] = [];
  for (const p of section.slice(i + 1)) {
    if (p.routes?.length) break;
    subs.push(p);
  }
  return subs;
}

export function findPage(audience: Audience, slug: string): DocPage | undefined {
  return pagesForAudience(audience).find((p) => p.slug === slug);
}

export function gettingStarted(audience: Audience): DocPage[] {
  return pagesForAudience(audience)
    .filter((p) => typeof p.gettingStarted === "number")
    .sort((a, b) => (a.gettingStarted ?? 0) - (b.gettingStarted ?? 0));
}

/** Sidebar sections in the order their first page appears. */
export function sidebarSections(audience: Audience): { section: string; pages: DocPage[] }[] {
  const pages = pagesForAudience(audience);
  const order: string[] = [];
  const bySection = new Map<string, DocPage[]>();
  for (const p of pages) {
    if (!bySection.has(p.section)) { bySection.set(p.section, []); order.push(p.section); }
    bySection.get(p.section)!.push(p);
  }
  return order.map((section) => ({ section, pages: bySection.get(section)! }));
}

export function allPages(): DocPage[] {
  return ALL_PAGES;
}

/** Media referenced by a page — every screenshot/gif id its blocks mention. */
export function mediaForPage(page: DocPage): MediaEntry[] {
  const ids: string[] = [];
  for (const b of page.blocks) {
    if (b.type === "screenshot" || b.type === "gif") ids.push(b.id);
    if (b.type === "steps") for (const s of b.items) {
      if (s.screenshot) ids.push(s.screenshot);
      if (s.gif) ids.push(s.gif);
    }
  }
  return ids.map((id) => MEDIA[id]).filter((m): m is MediaEntry => !!m);
}

/** The client-safe view of `page` as listed under `viewingAs` — see
 *  `DocPageMeta`. `hasSubPages` is computed here, where the pages are. */
export function toMeta(page: DocPage, viewingAs: Audience): DocPageMeta {
  const subs = page.audience === "common" ? 0 : screenSubPages(page, viewingAs).length;
  return {
    slug: page.slug,
    audience: page.audience,
    section: page.section,
    order: page.order,
    title: page.title,
    description: page.description,
    routes: page.routes,
    hasSubPages: subs > 0,
    subPageCount: subs,
  };
}
