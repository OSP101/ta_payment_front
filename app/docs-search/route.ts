import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "../lib/session";
import { search } from "../lib/docs/search";
import { searchablePagesFor, isAudience } from "../lib/docs/index";
import { defaultAudience, canViewAudience } from "../lib/docs/audience";
import { findPage, toMeta } from "../../content/docs/registry";
import { getT } from "../lib/i18n/server";

const MAX_QUERY = 200;

/**
 * GET /docs-search?q=&audience=&slug= — keyword search over the manuals the
 * signed-in reader may open. Runs here, not in the browser, because it needs
 * every page's text and that text must not ship to the client. `audience` +
 * `slug` name the page the search was opened from, so results in its
 * section rank first. Searches the manual in the reader's language and
 * returns titles and match labels in it.
 */
export async function GET(req: NextRequest) {
  const noStore = { "Cache-Control": "private, no-store" };
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });

  const params = req.nextUrl.searchParams;
  const q = (params.get("q") ?? "").slice(0, MAX_QUERY);
  const rawAudience = params.get("audience");
  const viewing = isAudience(rawAudience) && rawAudience !== "common" && canViewAudience(me, rawAudience)
    ? rawAudience
    : defaultAudience(me);
  const { t, locale } = await getT();
  const slug = params.get("slug");
  const currentSection = slug ? findPage(viewing, slug, locale)?.section : undefined;

  const results = search(searchablePagesFor(me, locale), q, { currentSection, locale })
    .slice(0, 12)
    .map((r) => ({ page: toMeta(r.page, viewing, locale), matchedIn: r.matchedIn.map((m) => t(m)) }));
  return NextResponse.json(results, { headers: noStore });
}
