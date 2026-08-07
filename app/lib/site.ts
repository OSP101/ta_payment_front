/**
 * Origins, resolved on the server.
 *
 * The browser never needs either of these: it talks to the API through the
 * same-origin rewrite in next.config.ts, and derives its own origin from
 * `window.location`. Server-rendered metadata has neither luxury — a link
 * preview card is built by Facebook's crawler from absolute URLs in the HTML,
 * so the page has to know what it is publicly reached at.
 */

const trimSlash = (u: string) => u.replace(/\/+$/, "");

/**
 * The public origin this site answers on — what goes into og:url, the canonical
 * link, and the absolute image URLs a crawler fetches.
 *
 * SITE_URL must be set in production. The localhost default keeps development
 * working, and is harmless there because no crawler can reach it anyway.
 */
export function siteURL(): string {
  return trimSlash(process.env.SITE_URL ?? "http://localhost:3000");
}

/** The API, called directly: the rewrite only exists for the browser. */
export function backendURL(): string {
  return trimSlash(process.env.API_URL ?? "http://localhost:8080");
}
