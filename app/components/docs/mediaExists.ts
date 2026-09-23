import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Shared by `Screenshot` and `Gif`: is `file` present under
 * `public/docs/v1/`? A doc page can embed 6-8+ of these, each previously
 * doing its own synchronous `fs.existsSync` on every render with no caching
 * at all — real cost once real screenshots are captured and this stops being
 * the rare case.
 *
 * Cached only in production: a deployed image set doesn't change during the
 * server's lifetime, but in dev someone is actively dropping files into
 * `public/docs/v1/` while editing content, and the whole point of checking
 * on every render there is that a refresh shows the file the moment it
 * lands — caching in dev would silently break that.
 */
const cache = new Map<string, boolean>();

export function mediaExists(file: string): boolean {
  if (process.env.NODE_ENV !== "production") {
    return fs.existsSync(path.join(process.cwd(), "public", "docs", "v1", file));
  }
  const cached = cache.get(file);
  if (cached !== undefined) return cached;
  const exists = fs.existsSync(path.join(process.cwd(), "public", "docs", "v1", file));
  cache.set(file, exists);
  return exists;
}
