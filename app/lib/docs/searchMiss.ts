import type { Audience } from "../../../content/docs/types";

/** Persisted locally (per browser) so the "no results" screen can eventually
 *  tell a maintainer what people search for and don't find — read today only
 *  as a manual export; wiring it to a `docs_events` table is Phase 5 in the
 *  plan. Client-side, split from `search.ts` (server-only) for that reason. */
const MISS_KEY = "ta-payment:docs-search-misses";
export function recordMiss(query: string, audience: Audience) {
  try {
    const raw = localStorage.getItem(MISS_KEY);
    const list: { q: string; audience: Audience; t: number }[] = raw ? JSON.parse(raw) : [];
    list.push({ q: query, audience, t: Date.now() });
    localStorage.setItem(MISS_KEY, JSON.stringify(list.slice(-200)));
  } catch { /* private mode — miss just isn't recorded */ }
}
