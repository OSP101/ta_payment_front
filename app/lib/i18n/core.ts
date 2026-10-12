// Interface language — shared by server and client code. See README.md here.
//
// The Thai text IS the key: t("ออกจากระบบ") looks the string up in the
// English dictionary (messages/en.json) and falls back to the Thai itself, so
// a string nobody has translated yet still reads correctly in Thai and Thai
// readers load no dictionary at all.

export type Locale = "th" | "en";
export type Messages = Record<string, string>;
export type Vars = Record<string, string | number | null | undefined>;

export const LOCALES: Locale[] = ["th", "en"];
export const DEFAULT_LOCALE: Locale = "th";
export const LOCALE_COOKIE = "ui_locale";

export function isLocale(v: unknown): v is Locale {
  return v === "th" || v === "en";
}

/** Replaces {name} placeholders. A missing var leaves the placeholder in, so
 *  a slip is visible instead of silently blank. */
export function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

/** A key may end in "@context" when one Thai word needs two English ones
 *  ("ปิด@state" → "Off", plain "ปิด" → "Close"). Thai readers see the key
 *  without the suffix. */
const CONTEXT = /@[a-z][a-z0-9-]*$/;

export function translate(messages: Messages | null | undefined, key: string, vars?: Vars): string {
  const hit = messages && Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : undefined;
  return interpolate(hit || key.replace(CONTEXT, ""), vars);
}

/** BCP-47 tag for Intl / toLocale*String. th-TH writes Buddhist-era years;
 *  en-GB gives "15 Jun 2026" (day first, as Thai readers expect). */
export function intlLocale(locale: Locale): string {
  return locale === "en" ? "en-GB" : "th-TH";
}

const TH_MONTHS_ABBR = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const EN_MONTHS_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Month name, 1-based. Thai uses the Buddhist-era convention elsewhere; the
 *  month names themselves are just names. */
export function monthName(locale: Locale, m: number, short = true): string {
  const list = locale === "en" ? (short ? EN_MONTHS_ABBR : EN_MONTHS) : (short ? TH_MONTHS_ABBR : TH_MONTHS);
  return list[m - 1] ?? String(m);
}

/** Calendar year as written in this language: BE in Thai, CE in English.
 *  `ce` is the Gregorian year. Academic-year labels (2569/1) are identifiers
 *  and are NOT passed through this. */
export function displayYear(locale: Locale, ce: number): number {
  return locale === "en" ? ce : ce + 543;
}

/** "2026-06-15" → "15 มิ.ย. 2569" / "15 Jun 2026". Unparsable input returns
 *  unchanged; empty returns "-". */
export function formatDate(locale: Locale, iso?: string | null, opts?: { long?: boolean }): string {
  if (!iso) return "-";
  const parts = iso.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return iso;
  const [y, m, d] = parts;
  if (m < 1 || m > 12) return iso;
  return `${d} ${monthName(locale, m, !opts?.long)} ${displayYear(locale, y)}`;
}

/** Marks a Thai string as a translation key without translating it yet — for
 *  constants and maps (status labels, menus) that are translated where they
 *  are shown: `label: msg("อนุมัติแล้ว")` … `{t(s.label)}`. The extractor and
 *  scripts/i18n-check.mjs treat it like t(). */
export function msg<S extends string>(key: S): S {
  return key;
}
