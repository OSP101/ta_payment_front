// Runs on the server (app/docs-search/route.ts): searching needs every page's
// text, which must not ship to the browser.
import "server-only";
import type { DocPage } from "../../../content/docs/types";
import { DEFAULT_LOCALE, msg, type Locale } from "../i18n/core";

/**
 * Keyword search over the manual — no AI, no server round-trip (per the plan's
 * decision to keep this a plain, free, client-side index like most doc sites
 * run). Runs entirely in the browser against the same `DocPage[]` the pages
 * themselves render from, so it can never drift out of sync with content.
 *
 * Thai has no spaces between words, so naive substring matching either
 * over-matches (any query is "found" inside some long run-on line) or
 * under-matches (a query that isn't an exact substring of anything). This
 * tokenizes with `Intl.Segmenter("th")` where the runtime has it (Chrome/Edge
 * always, Safari 17+, Firefox 125+) and falls back to overlapping bigrams
 * elsewhere, which is coarser but still lets "ลงเวลา" match "การลงเวลาปฏิบัติงาน".
 * The Thai segmenter also splits Latin text on spaces/punctuation, so the
 * same tokenizer serves the English manual; English readers get their own
 * synonym table and the English stopwords below.
 *
 * Indexed per language: English readers search the English pages (the
 * caller passes `pagesForAudience(…, "en")`), and each page's tokenized
 * fields are cached on the page object itself, so the Thai and English
 * sets each build their own index once.
 */

let thSegmenter: Intl.Segmenter | null | undefined;
function getSegmenter(): Intl.Segmenter | null {
  if (thSegmenter !== undefined) return thSegmenter;
  try {
    thSegmenter = new Intl.Segmenter("th", { granularity: "word" });
  } catch {
    thSegmenter = null;
  }
  return thSegmenter;
}

// Matching data, not reader-visible text.
const STOPWORDS = new Set([
  "และ", "หรือ", "ที่", "ใน", "ของ", "ให้", "ได้", "เป็น", "จะ", "ไม่", "แล้ว", "ก็", "มี", // i18n-ignore
  "the", "a", "an", "to", "of", "in", "on", "for", "and", "or", "is", "are", "be", "it", "my", "your", "i", "how", "what", "do", "does",
]);

export function tokenize(input: string): string[] {
  const normalized = input.normalize("NFC").toLowerCase().trim();
  if (!normalized) return [];
  const seg = getSegmenter();
  let words: string[];
  if (seg) {
    words = Array.from(seg.segment(normalized))
      .filter((s) => s.isWordLike)
      .map((s) => s.segment);
  } else {
    // Fallback: split on non-word boundaries for latin/digits, and cut Thai
    // runs into overlapping bigrams so partial queries still hit.
    words = [];
    for (const chunk of normalized.split(/([a-z0-9._/-]+)/g)) {
      if (!chunk) continue;
      if (/^[a-z0-9._/-]+$/.test(chunk)) {
        words.push(chunk);
      } else {
        const thai = chunk.replace(/[^฀-๿]/g, "");
        for (let i = 0; i < thai.length - 1; i++) words.push(thai.slice(i, i + 2));
      }
    }
  }
  return words.filter((w) => w.length > 0 && !STOPWORDS.has(w));
}

/**
 * Query-expansion synonyms — the cheapest way to close the gap between what
 * the app calls something and what a user types. Bidirectional: any term on
 * either side of an entry expands the query to include the whole group.
 */
export const SYNONYMS: string[][] = [
  ["ลงเวลา", "บันทึกเวลา", "worklog", "timesheet", "ลงชั่วโมง"], // i18n-ignore
  ["ตีกลับ", "ส่งกลับ", "reject", "ไม่ผ่าน", "ปฏิเสธ"], // i18n-ignore
  ["2fa", "otp", "ยืนยันตัวตนสองขั้นตอน", "authenticator", "สองปัจจัย"], // i18n-ignore
  ["ใบแจ้งหนี้", "แบบฟอร์มเจ้าหนี้", "แบบแจ้งเจ้าหนี้"], // i18n-ignore
  ["ปะหน้า", "ปะหน้าจ่ายตรง", "transfer cover", "cover sheet"], // i18n-ignore
  ["wba", "ไม่มีตารางเรียน", "ปี4", "ปี 4"], // i18n-ignore
  ["ล็อก", "แก้ไม่ได้", "ส่งออกแล้ว", "locked"], // i18n-ignore
  ["คำขอ", "ขอ ta", "ส่งคำขอ", "request"], // i18n-ignore
  ["ค้างจ่าย", "ยังไม่จ่าย", "รอเบิก"], // i18n-ignore
  ["ส่งออก", "export", "ดาวน์โหลด zip", "zip"], // i18n-ignore
  ["รหัสผ่านชั่วคราว", "temporary password", "รหัสแรกเข้า"], // i18n-ignore
  ["ชดเชย", "วันชดเชย", "makeup", "ชดเชยวันหยุด"], // i18n-ignore
  ["งบ", "งบประมาณ", "budget", "เพดานงบ"], // i18n-ignore
  ["นำเข้า", "import", "อัปโหลด excel", "xlsx"], // i18n-ignore
  ["บัญชี", "ธนาคาร", "bank account", "พร้อมเพย์"], // i18n-ignore
  ["ลายเซ็น", "signature", "เซ็นชื่อ"], // i18n-ignore
  ["แต่งตั้ง", "คำสั่งแต่งตั้ง", "appointment order"], // i18n-ignore
  ["ประกาศ", "announcement", "ข่าว"], // i18n-ignore
  ["สิทธิ์", "บทบาท", "role", "permission"], // i18n-ignore
  ["รหัสผ่าน", "password", "เปลี่ยนรหัส"], // i18n-ignore
];

/** The same idea for English readers, in the words the English manual and
 *  UI use (see app/lib/i18n/GLOSSARY.md). The Thai table is appended too:
 *  English pages keep some Thai keywords, and a reader may paste Thai text
 *  they saw on a document. */
export const SYNONYMS_EN: string[][] = [
  ["worklog", "work log", "timesheet", "log hours", "hours"],
  ["reject", "rejected", "returned", "send back", "sent back", "revision"],
  ["2fa", "otp", "two-factor", "authenticator", "two-step"],
  ["supplier", "creditor", "vendor", "suppliers"],
  ["transfer cover", "cover sheet", "direct payment"],
  ["wba", "no class schedule", "year 4", "year-4"],
  ["lock", "locked", "cannot edit", "exported", "read only"],
  ["request", "requests", "ta request", "request tas"],
  ["unpaid", "outstanding", "not paid", "pending payment"],
  ["export", "download zip", "zip"],
  ["temporary password", "first-time password", "initial password"],
  ["makeup", "make-up", "holiday"],
  ["budget", "budget cap", "cap"],
  ["import", "upload excel", "xlsx", "excel"],
  ["bank", "bank account", "promptpay"],
  ["signature", "sign", "signing"],
  ["appointment", "appointment order"],
  ["announcement", "announcements", "news"],
  ["role", "roles", "permission", "access"],
  ["password", "change password", "reset password"],
];

function buildLookup(groups: string[][]): Map<string, Set<string>> {
  const lookup = new Map<string, Set<string>>();
  for (const group of groups) {
    const set = new Set(group);
    for (const term of group) {
      const existing = lookup.get(term);
      if (existing) group.forEach((g) => existing.add(g));
      else lookup.set(term, new Set(set));
    }
  }
  return lookup;
}

const SYNONYM_LOOKUP: Record<Locale, Map<string, Set<string>>> = {
  th: buildLookup(SYNONYMS),
  en: buildLookup([...SYNONYMS_EN, ...SYNONYMS]),
};

export function expandQuery(tokens: string[], locale: Locale = DEFAULT_LOCALE): string[] {
  const lookup = SYNONYM_LOOKUP[locale];
  const out = new Set(tokens);
  for (const t of tokens) {
    const syn = lookup.get(t);
    if (syn) syn.forEach((s) => out.add(s));
    // substring match against synonym keys too (bigram fallback tokens are short)
    for (const [key, group] of lookup) {
      if (key.includes(t) || t.includes(key)) group.forEach((g) => out.add(g));
    }
  }
  return Array.from(out);
}

export interface SearchResult {
  page: DocPage;
  score: number;
  /** Field labels as Thai keys (msg()); translate with t() before showing. */
  matchedIn: string[];
}

interface IndexedField { tokens: string[]; weight: number; label: string }

// Field labels — keys, translated by the caller.
const F_TITLE = msg("หัวข้อ");
const F_KEYWORDS = msg("คำสำคัญ");
const F_ERRORS = msg("ข้อความในระบบ");
const F_DESC = msg("คำอธิบาย");
const F_SECTION = msg("หมวด");
const F_BODY = msg("เนื้อหา");

/** Tokenized fields per page. Pages are static module data and each
 *  language has its own page objects, so this is the per-language index,
 *  built lazily and kept for the life of the process. */
const FIELD_CACHE = new WeakMap<DocPage, IndexedField[]>();

function fieldsOf(page: DocPage): IndexedField[] {
  const hit = FIELD_CACHE.get(page);
  if (hit) return hit;
  const fields = buildFields(page);
  FIELD_CACHE.set(page, fields);
  return fields;
}

function buildFields(page: DocPage): IndexedField[] {
  const stepText = page.blocks
    .filter((b) => b.type === "steps" || b.type === "journey")
    .flatMap((b) =>
      b.type === "steps" ? b.items.map((s) => `${s.title} ${s.body ?? ""}`)
      : b.type === "journey" ? b.stages.map((s) => `${s.title} ${s.body ?? ""} ${s.notice ?? ""} ${s.warn ?? ""}`)
      : [])
    .join(" ");
  const textBlocks = page.blocks.filter((b) => b.type === "text" || b.type === "callout")
    .map((b) => (b.type === "text" || b.type === "callout" ? b.body : ""))
    .join(" ");
  return [
    { tokens: tokenize(page.title), weight: 6, label: F_TITLE },
    { tokens: tokenize(page.keywords.join(" ")), weight: 5, label: F_KEYWORDS },
    { tokens: tokenize((page.errors ?? []).join(" ")), weight: 5, label: F_ERRORS },
    { tokens: tokenize(page.description), weight: 3, label: F_DESC },
    { tokens: tokenize(page.section), weight: 2, label: F_SECTION },
    { tokens: tokenize(stepText), weight: 1, label: F_BODY },
    { tokens: tokenize(textBlocks), weight: 1, label: F_BODY },
  ];
}

/** Ranks pages for `query` (pages and `opts.locale` in the reader's
 *  language), restricted to the given audience(s) (a page's
 *  own audience plus "common" is always included by the caller via
 *  `pagesForAudience`). Pass the CURRENT page's slug to nudge same-section
 *  results above the rest — a search fired from the worklog page should
 *  surface other worklog answers first. */
export function search(pages: DocPage[], query: string, opts?: { currentSection?: string; locale?: Locale }): SearchResult[] {
  const rawTokens = tokenize(query);
  if (rawTokens.length === 0) return [];
  const tokens = expandQuery(rawTokens, opts?.locale ?? DEFAULT_LOCALE);

  // Whole-phrase bonus. Token hits alone let a long page that mentions each
  // word somewhere outrank the short page whose error message or keyword IS
  // the phrase the reader typed (e.g. pasting "ยังไม่ได้ลงทะเบียน" from a
  // login error). An exact phrase in a title, keyword or error string is the
  // strongest signal the reader has found their page.
  const phrase = query.trim().toLowerCase().replace(/\s+/g, " ");
  const phraseIn = (xs: string[]) => phrase.length >= 2 && xs.some((x) => x.toLowerCase().includes(phrase));

  const results: SearchResult[] = [];
  for (const page of pages) {
    const fields = fieldsOf(page);
    let score = 0;
    const matchedIn = new Set<string>();
    if (phraseIn([page.title])) { score += 40; matchedIn.add(F_TITLE); }
    if (phraseIn(page.errors ?? [])) { score += 35; matchedIn.add(F_ERRORS); }
    if (phraseIn(page.keywords)) { score += 25; matchedIn.add(F_KEYWORDS); }
    for (const field of fields) {
      if (field.tokens.length === 0) continue;
      for (const qt of tokens) {
        let hits = 0;
        for (const ft of field.tokens) {
          if (ft === qt) hits += 1;
          // Partial matches only between tokens of 3+ characters: Thai
          // segments like "ลง" (from ลงทะเบียน) otherwise half-match every
          // "ลงเวลา" on a long page and bury the page the reader wanted.
          else if (qt.length >= 3 && ft.length >= 3 && (ft.includes(qt) || qt.includes(ft))) hits += 0.5;
        }
        if (hits > 0) {
          score += hits * field.weight;
          matchedIn.add(field.label);
        }
      }
    }
    if (score > 0) {
      if (opts?.currentSection && page.section === opts.currentSection) score *= 1.3;
      results.push({ page, score, matchedIn: Array.from(matchedIn) });
    }
  }
  return results.sort((a, b) => b.score - a.score);
}
