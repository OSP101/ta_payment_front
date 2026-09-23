// Runs on the server (app/docs-search/route.ts): searching needs every page's
// text, which must not ship to the browser.
import "server-only";
import type { DocPage } from "../../../content/docs/types";

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

const STOPWORDS = new Set(["และ", "หรือ", "ที่", "ใน", "ของ", "ให้", "ได้", "เป็น", "จะ", "ไม่", "แล้ว", "ก็", "มี", "the", "a", "to", "of", "in"]);

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
  ["ลงเวลา", "บันทึกเวลา", "worklog", "timesheet", "ลงชั่วโมง"],
  ["ตีกลับ", "ส่งกลับ", "reject", "ไม่ผ่าน", "ปฏิเสธ"],
  ["2fa", "otp", "ยืนยันตัวตนสองขั้นตอน", "authenticator", "สองปัจจัย"],
  ["ใบแจ้งหนี้", "แบบฟอร์มเจ้าหนี้", "แบบแจ้งเจ้าหนี้"],
  ["ปะหน้า", "ปะหน้าจ่ายตรง", "transfer cover", "cover sheet"],
  ["wba", "ไม่มีตารางเรียน", "ปี4", "ปี 4"],
  ["ล็อก", "แก้ไม่ได้", "ส่งออกแล้ว", "locked"],
  ["คำขอ", "ขอ ta", "ส่งคำขอ", "request"],
  ["ค้างจ่าย", "ยังไม่จ่าย", "รอเบิก"],
  ["ส่งออก", "export", "ดาวน์โหลด zip", "zip"],
  ["รหัสผ่านชั่วคราว", "temporary password", "รหัสแรกเข้า"],
  ["ชดเชย", "วันชดเชย", "makeup", "ชดเชยวันหยุด"],
  ["งบ", "งบประมาณ", "budget", "เพดานงบ"],
  ["นำเข้า", "import", "อัปโหลด excel", "xlsx"],
  ["บัญชี", "ธนาคาร", "bank account", "พร้อมเพย์"],
  ["ลายเซ็น", "signature", "เซ็นชื่อ"],
  ["แต่งตั้ง", "คำสั่งแต่งตั้ง", "appointment order"],
  ["ประกาศ", "announcement", "ข่าว"],
  ["สิทธิ์", "บทบาท", "role", "permission"],
  ["รหัสผ่าน", "password", "เปลี่ยนรหัส"],
];

const SYNONYM_LOOKUP = new Map<string, Set<string>>();
for (const group of SYNONYMS) {
  const set = new Set(group);
  for (const term of group) {
    const existing = SYNONYM_LOOKUP.get(term);
    if (existing) group.forEach((g) => existing.add(g));
    else SYNONYM_LOOKUP.set(term, new Set(set));
  }
}

export function expandQuery(tokens: string[]): string[] {
  const out = new Set(tokens);
  for (const t of tokens) {
    const syn = SYNONYM_LOOKUP.get(t);
    if (syn) syn.forEach((s) => out.add(s));
    // substring match against synonym keys too (bigram fallback tokens are short)
    for (const [key, group] of SYNONYM_LOOKUP) {
      if (key.includes(t) || t.includes(key)) group.forEach((g) => out.add(g));
    }
  }
  return Array.from(out);
}

export interface SearchResult {
  page: DocPage;
  score: number;
  matchedIn: string[];
}

interface IndexedField { tokens: string[]; weight: number; label: string }

function fieldsOf(page: DocPage): IndexedField[] {
  const stepText = page.blocks
    .filter((b) => b.type === "steps")
    .flatMap((b) => (b.type === "steps" ? b.items.map((s) => `${s.title} ${s.body ?? ""}`) : []))
    .join(" ");
  const textBlocks = page.blocks.filter((b) => b.type === "text" || b.type === "callout")
    .map((b) => (b.type === "text" || b.type === "callout" ? b.body : ""))
    .join(" ");
  return [
    { tokens: tokenize(page.title), weight: 6, label: "หัวข้อ" },
    { tokens: tokenize(page.keywords.join(" ")), weight: 5, label: "คำสำคัญ" },
    { tokens: tokenize((page.errors ?? []).join(" ")), weight: 5, label: "ข้อความในระบบ" },
    { tokens: tokenize(page.description), weight: 3, label: "คำอธิบาย" },
    { tokens: tokenize(page.section), weight: 2, label: "หมวด" },
    { tokens: tokenize(stepText), weight: 1, label: "เนื้อหา" },
    { tokens: tokenize(textBlocks), weight: 1, label: "เนื้อหา" },
  ];
}

/** Ranks pages for `query`, restricted to the given audience(s) (a page's
 *  own audience plus "common" is always included by the caller via
 *  `pagesForAudience`). Pass the CURRENT page's slug to nudge same-section
 *  results above the rest — a search fired from the worklog page should
 *  surface other worklog answers first. */
export function search(pages: DocPage[], query: string, opts?: { currentSection?: string }): SearchResult[] {
  const rawTokens = tokenize(query);
  if (rawTokens.length === 0) return [];
  const tokens = expandQuery(rawTokens);

  const results: SearchResult[] = [];
  for (const page of pages) {
    const fields = fieldsOf(page);
    let score = 0;
    const matchedIn = new Set<string>();
    for (const field of fields) {
      if (field.tokens.length === 0) continue;
      for (const qt of tokens) {
        let hits = 0;
        for (const ft of field.tokens) {
          if (ft === qt) hits += 1;
          else if (qt.length >= 2 && (ft.includes(qt) || qt.includes(ft))) hits += 0.5;
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
