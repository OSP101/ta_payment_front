import { pagesForAudience } from "../../../content/docs/registry";
import type { Audience, DocPage } from "../../../content/docs/types";

/**
 * Turns a `DocPage.routes` entry (e.g. `/staff/payouts/[tcId]`, written the
 * same way Next.js itself names a dynamic segment) into a matcher for a real
 * pathname (e.g. `/staff/payouts/abc123`). No separate route-to-slug map to
 * keep in sync by hand — every page already declares which routes it
 * documents, so this is the single source both the in-app "?" button and
 * `scripts/check-docs-coverage.ts` read from.
 */
function routeMatches(pattern: string, pathname: string): boolean {
  const re = new RegExp(
    "^" + pattern.replace(/\[[^\]]+\]/g, "[^/]+").replace(/\//g, "\\/") + "\\/?$",
  );
  return re.test(pathname);
}

/**
 * The doc page for the current app route, preferring the most specific match
 * (longest static prefix) when more than one page's `routes` could apply —
 * e.g. `/ta/courses/[tcId]/worklog` should win over a page merely listing
 * `/ta/courses/[tcId]`.
 *
 * This can only disambiguate pages whose `routes:` strings actually differ —
 * it has no way to tell apart pages that document different tabs/modals of
 * the SAME url (client-side state, not the URL, picks those). Content pages
 * must not declare an identical `routes:` entry on more than one page for
 * exactly that reason: see the comments on `settings/rates` and its sibling
 * tabs, or `payouts/detail` and its sibling sections, in
 * `content/docs/pages/staff.ts`. When candidates DO still tie on length here
 * (a future content bug), `order` breaks the tie explicitly rather than
 * leaving it to `pagesForAudience`'s incidental array order.
 */
export function resolveDocForRoute(pathname: string, audience: Audience): DocPage | undefined {
  const candidates = pagesForAudience(audience).filter((p) =>
    p.routes?.some((r) => routeMatches(r, pathname)),
  );
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => {
    const la = Math.max(...(a.routes ?? [""]).map((r) => r.length));
    const lb = Math.max(...(b.routes ?? [""]).map((r) => r.length));
    return lb - la || a.order - b.order;
  });
  return candidates[0];
}
