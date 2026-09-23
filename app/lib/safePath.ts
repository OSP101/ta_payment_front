// Redirect targets that reach router.push must be proven same-origin first.
//
// Checking `raw.startsWith("/")` is not enough and cannot be made enough by
// pattern-matching: "//evil.com" and "/\evil.com" both start with a slash yet
// resolve to a different origin, and the URL parser strips ASCII tab/newline
// from anywhere in the string, so "/\tevil.com" reconstitutes "//evil.com"
// after any regex has already accepted it. The only reliable test is to resolve
// the candidate the way the browser will and compare the resulting origin.

/** Resolve `raw` against the current origin; return a safe in-app path, or `fallback` if it points elsewhere. */
export function sameOriginPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

/** True when `raw` resolves to this app's own origin. */
export function isSameOrigin(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    return new URL(raw, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}
