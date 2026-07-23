// KKU REG (kku.ac.th/reg) exports weekly class schedules as .ics with one
// VEVENT per session for the whole term (no RRULE). Each recurring session
// therefore shows up 15–17 times — we deduplicate by (day, time, course, loc)
// to recover the underlying weekly slot. Exam events prefixed with "(สอบ..." in
// SUMMARY are intentionally dropped: the schedule grid represents weekly
// classes only, and exam windows are tracked per-term at the server side.

import type { Block, BlockKind } from "../components/ScheduleGrid";

export interface IcsImportResult {
  blocks: Block[];
  /** Number of exam VEVENTs skipped (informational). */
  examSkipped: number;
  /** VEVENTs whose start/end fell outside the 08:00–20:00 grid window. */
  outOfRangeSkipped: number;
  /** VEVENTs the parser couldn't turn into a block (bad summary, bad time). */
  malformedSkipped: number;
  /** Total raw VEVENTs found in the file. */
  eventsTotal: number;
  /** VEVENTs that collapsed into an existing weekly slot (recurring copies). */
  duplicatesCollapsed: number;
}

// The schedule grid clamps to 08:00–20:00 Bangkok time; anything outside is
// silently dropped rather than saved as invalid. KKU classes are always inside
// this window, so a hit here almost always means a genuinely-wrong record.
const GRID_START_HR = 8;
const GRID_END_HR = 20;

interface RawEvent {
  start?: Date;
  end?: Date;
  location?: string;
  summary?: string;
}

/**
 * Parse an .ics text into raw VEVENTs. Handles line unfolding (RFC 5545 §3.1)
 * and simple `\n \, \;` unescaping in property values. Property parameters
 * (e.g. `DTSTART;TZID=...`) are ignored — this project only sees UTC (`Z`)
 * datetimes from KKU REG.
 */
export function parseIcsEvents(text: string): RawEvent[] {
  // Unfold folded lines: RFC 5545 wraps long lines at 75 chars with a leading
  // space/tab. Also normalize CRLF → LF so the split works uniformly.
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }

  const events: RawEvent[] = [];
  let current: RawEvent | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
    } else if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
    } else if (current) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const head = line.slice(0, colon);
      const value = line.slice(colon + 1);
      const name = head.split(";")[0].toUpperCase();
      switch (name) {
        case "DTSTART": current.start = parseIcsDate(value); break;
        case "DTEND":   current.end   = parseIcsDate(value); break;
        case "LOCATION": current.location = decodeIcsText(value); break;
        case "SUMMARY":  current.summary  = decodeIcsText(value); break;
      }
    }
  }
  return events;
}

function parseIcsDate(v: string): Date {
  // Accepts 20210712T060000Z, 20210712T060000, or 20210712 (date only).
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/);
  if (!m) return new Date(NaN);
  const [, y, mo, d, hh = "0", mm = "0", ss = "0", z] = m;
  if (z === "Z") return new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss));
  return new Date(+y, +mo - 1, +d, +hh, +mm, +ss);
}

function decodeIcsText(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

// Bangkok is UTC+7 year-round (no DST). We shift the UTC Date by +7h and read
// UTC getters — that avoids any dependency on the browser's local timezone.
function toBangkokParts(d: Date): { dow: number; hm: string } {
  const shifted = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const dow = shifted.getUTCDay(); // Sun=0..Sat=6, matches the grid convention
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return { dow, hm: `${hh}:${mm}` };
}

function parseHM(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Parse the KKU REG SUMMARY line into course code + section.
 *
 * Observed formats:
 *   "342222 (3) 3."                    → { code: "342222", sec: "3" }
 *   "(สอบปลายภาค)316201 (3) 1."        → { isExam: true, code: "316201", sec: "1" }
 *   "LI102003 (3) 74."                 → { code: "LI102003", sec: "74" }
 *
 * The leading parenthetical (if any) marks an exam session. Anything else in
 * parentheses inside the body is course credits and is skipped.
 */
function parseSummary(s: string): { isExam: boolean; code: string; sec: string } {
  const trimmed = s.trim();
  const isExam = /^\(สอบ/.test(trimmed);
  // Strip the leading (…) tag if present so the body regex is uniform
  const body = trimmed.replace(/^\([^)]*\)/, "").trim();
  const m = body.match(/^([A-Za-z]*\d{3,7})\s*\(\s*\d+\s*\)\s*(\d+)/);
  return {
    isExam,
    code: m?.[1] ?? "",
    sec: m?.[2] ?? "",
  };
}

// KKU REG puts room + building in LOCATION, e.g. "SC5103 SC5" or "WBA -.
// (Seat::)". For online/WBA rows we intentionally leave note empty — the room
// string carries no useful info for the student.
function cleanLocation(loc: string | undefined): string {
  if (!loc) return "";
  const collapsed = loc.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  // KKU REG marker for online / WBA sessions (no physical room).
  if (/^WBA\b/i.test(collapsed)) return "";
  // Placeholder dashes-only rows like "-. (Seat::)" carry no room info.
  if (/^[-.\s]+(\(.*\))?$/.test(collapsed)) return "";
  return collapsed;
}

/**
 * Turn a raw .ics text into an ordered list of weekly Block candidates, plus
 * counts of how many events were skipped for each reason. Callers show these
 * numbers in the import preview so the student knows what was dropped.
 */
export function icsToBlocks(text: string, termId: string): IcsImportResult {
  const events = parseIcsEvents(text);
  const seen = new Map<string, Block>();
  let examSkipped = 0;
  let outOfRangeSkipped = 0;
  let malformedSkipped = 0;
  let duplicatesCollapsed = 0;

  for (const ev of events) {
    if (!ev.start || !ev.end || Number.isNaN(ev.start.getTime()) || Number.isNaN(ev.end.getTime())) {
      malformedSkipped++;
      continue;
    }
    const { isExam, code, sec } = parseSummary(ev.summary ?? "");
    if (isExam) { examSkipped++; continue; }
    if (!code) { malformedSkipped++; continue; }

    const s = toBangkokParts(ev.start);
    const e = toBangkokParts(ev.end);
    const startMin = parseHM(s.hm);
    const endMin = parseHM(e.hm);
    if (startMin < GRID_START_HR * 60 || endMin > GRID_END_HR * 60 || startMin >= endMin) {
      outOfRangeSkipped++;
      continue;
    }

    const loc = cleanLocation(ev.location);
    const key = `${s.dow}|${s.hm}|${e.hm}|${code}|${sec}|${loc}`;
    if (seen.has(key)) { duplicatesCollapsed++; continue; }

    seen.set(key, {
      id: newBlockId(),
      term_id: termId,
      course_code: code.toUpperCase(),
      course_name: "",
      kind: "" as BlockKind,
      sec_no: sec,
      day_of_week: s.dow,
      start_time: s.hm,
      end_time: e.hm,
      note: loc,
      is_wba: false,
    });
  }

  const blocks = Array.from(seen.values()).sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    if (a.start_time !== b.start_time) return parseHM(a.start_time) - parseHM(b.start_time);
    return a.course_code.localeCompare(b.course_code);
  });

  return {
    blocks,
    examSkipped,
    outOfRangeSkipped,
    malformedSkipped,
    eventsTotal: events.length,
    duplicatesCollapsed,
  };
}

function newBlockId(): string {
  return "ics-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}
