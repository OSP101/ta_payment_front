// Date helpers shared across pages.

import { formatDate, type Locale } from "./i18n/core";

// submission_periods.year_month is an ACADEMIC-year key ("2568-01" is
// มกราคม 2569), so plain string order puts ม.ค.–พ.ค. before มิ.ย.–ธ.ค. of the
// same academic year. Chronological order within a year is 06..12 then 01..05.
function ymRank(ym: string): number {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return y * 12 + (m < 6 ? m + 12 : m);
}

/** Sort comparator for academic "YYYY-MM" keys, oldest first. */
export function compareYearMonth(a: string, b: string): number {
  return ymRank(a) - ymRank(b) || a.localeCompare(b);
}

/** Local calendar date as "YYYY-MM-DD". toISOString() is UTC, which is still
 *  "yesterday" until 07:00 in Bangkok. */
export function localDateISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-06-15" (ISO Gregorian) → "15 มิ.ย. 2569" (BE), or "15 Jun 2026"
 *  with locale "en". Anything unparsable is returned unchanged. Components
 *  should prefer fmtDate() from useI18n(); this stays for callers that pass
 *  the locale themselves (or still expect Thai). */
export function thaiDate(iso?: string | null, locale: Locale = "th"): string {
  return formatDate(locale, iso);
}

/** Hours for display. work_logs.hours is stored exact (minutes/60, e.g.
 *  0.983333), so printing it raw shows six decimals; two is what every
 *  money figure is rounded to. Trailing zeros are dropped ("3", "0.98"). */
export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined || !Number.isFinite(h)) return "—";
  return String(Number(h.toFixed(2)));
}
