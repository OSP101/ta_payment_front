/**
 * The manual's version = the system's version. Shown in the docs header and
 * compared against each page's `since:` / each media item's `since` so a
 * reader can tell whether what they're reading still matches what's on
 * screen. Bump this alongside a real release tag (see PLAN-manual-docs-platform.md
 * §5) — not on every commit.
 */
export const APP_VERSION = "1.0.0";

/** `"1.0.0"` → `"1.0"` — the granularity content and media are tagged at. */
export function minorVersion(v: string = APP_VERSION): string {
  const [maj, min] = v.split(".");
  return `${maj}.${min}`;
}
