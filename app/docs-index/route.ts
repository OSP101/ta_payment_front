import { NextResponse } from "next/server";
import { getMe } from "../lib/session";
import { docsIndexFor } from "../lib/docs/index";

/**
 * GET /docs-index — the page list (titles, sections, routes; no page text)
 * for every manual the signed-in reader may open. The in-app docs pill and
 * drawer resolve "the doc for this screen" from it.
 *
 * Served per reader instead of bundled: a bundled list would show every
 * visitor — anonymous ones included — the titles of manuals they cannot open.
 * Not under /api: next.config.ts rewrites /api/* to the Go backend.
 */
export async function GET() {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(docsIndexFor(me), { headers: { "Cache-Control": "private, no-store" } });
}
