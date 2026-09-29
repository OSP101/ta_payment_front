/**
 * The manual's version = the system's version. Shown in the docs header and
 * compared against each page's `since:` / each media item's `since` so a
 * reader can tell whether what they're reading still matches what's on
 * screen. Bump this alongside a real release tag (see PLAN-manual-docs-platform.md
 * §5) — not on every commit.
 */
export const APP_VERSION = "1.1.0";

/** `"1.0.0"` → `"1.0"` — the granularity content and media are tagged at. */
export function minorVersion(v: string = APP_VERSION): string {
  const [maj, min] = v.split(".");
  return `${maj}.${min}`;
}

/** Last date the manual's content was revised (ISO). Shown in the manual's
 *  footer; bump it with any content change that readers should notice. */
export const DOCS_UPDATED = "2026-09-30";

/** `"2026-09-30"` → `"30 กันยายน 2569"`. */
export function thaiDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}
