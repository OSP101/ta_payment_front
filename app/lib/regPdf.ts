import type { Block } from "../components/ScheduleGrid";
import type { ScheduleImportResult } from "./scheduleImport";

export interface PdfText { text: string; x: number; y: number; width: number; height: number }
export interface PdfRect { x: number; y: number; width: number; height: number; fill?: string }
export interface PdfSchedulePage { texts: PdfText[]; rects: PdfRect[] }
const DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"]; // i18n-ignore
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
function lines(texts: PdfText[]): string[] {
  const rows: { y: number; items: PdfText[] }[] = [];
  for (const t of [...texts].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find(r => Math.abs(r.y - t.y) < 2);
    if (row) row.items.push(t); else rows.push({ y: t.y, items: [t] });
  }
  return rows.map(r => clean(r.items.sort((a, b) => a.x - b.x).map(t => t.text).join(" "))).filter(Boolean);
}
const inside = (t: PdfText, r: PdfRect) => t.x + t.width / 2 > r.x - 0.5 && t.x + t.width / 2 < r.x + r.width + 0.5 && t.y > r.y && t.y < r.y + r.height;

/** Deliberately fail closed: every course heading needs exactly one readable class frame. */
export function regPdfPagesToBlocks(pages: PdfSchedulePage[], termId: string): ScheduleImportResult {
  const result: ScheduleImportResult = { source: "pdf", blocks: [], eventsTotal: 0, examSkipped: 0, malformedSkipped: 0, outOfRangeSkipped: 0, duplicatesCollapsed: 0, kindResolved: 0, reviewIds: [], rawById: {} };
  for (const [pageIndex, page] of pages.entries()) {
    const fullText = lines(page.texts).join("\n");
    const term = fullText.match(/ภาคการศึกษา\s*(\d+)\s*\/\s*(\d{4})/); // i18n-ignore
    if (!term) throw new Error("ไม่พบภาคการศึกษาใน PDF กรุณาเลือกไฟล์ตารางเรียนที่ส่งออกจาก REG โดยตรง"); // i18n-ignore
    if (result.academicYear && (result.academicYear !== +term[2] || result.semester !== +term[1])) throw new Error("PDF มีตารางจากหลายภาคการศึกษา กรุณาแยกไฟล์ก่อนนำเข้า"); // i18n-ignore
    result.academicYear = +term[2]; result.semester = +term[1];
    const headerTexts = page.texts.filter(t => /^\d{2}\.00-$/.test(t.text.trim()));
    const headers = headerTexts.map(t => {
      const r = page.rects.filter(r => inside(t, r) && r.width > 10 && r.height > 10).sort((a, b) => a.width * a.height - b.width * b.height)[0];
      return r ? { hour: +t.text.slice(0, 2), x: r.x, width: r.width, y: r.y, height: r.height } : null;
    }).filter(h => h !== null).sort((a, b) => a.hour - b.hour);
    const dayTexts = page.texts.filter(t => DAYS.includes(t.text.trim()));
    if (headers.length < 2 || dayTexts.length !== 7) throw new Error("อ่านเส้นเวลาและวันใน PDF ไม่ครบ กรุณาเลือกไฟล์ที่ส่งออกจาก REG โดยตรง"); // i18n-ignore
    const first = headers[0], last = headers.at(-1)!;
    const hourWidth = (last.x - first.x) / (last.hour - first.hour);
    if (!(hourWidth > 0) || headers.some(h => Math.abs(h.x - first.x - (h.hour - first.hour) * hourWidth) > 1)) throw new Error("รูปแบบเส้นเวลาใน PDF ไม่รองรับ กรุณากรอกตารางด้วยตนเอง"); // i18n-ignore
    const headings = page.texts.filter(t => /^[A-Za-z]*\d{3,7}\s+Sec\s+\d+\s*$/.test(clean(t.text)));
    // A heading can be split into multiple PDF text items; reconstruct each row first.
    const courseLines = lines(page.texts.filter(t => t.y > first.y + first.height));
    const expected = courseLines.join("\n").match(/[A-Za-z]*\d{3,7}\s+Sec\s+\d+/g) ?? [];
    if (!headings.length || headings.length !== expected.length) throw new Error("อ่านรหัสวิชาใน PDF ไม่ครบ กรุณาตรวจไฟล์หรือกรอกตารางด้วยตนเอง"); // i18n-ignore
    const classRects = page.rects.filter(r => r.fill && /^#[0-9a-f]{6}$/i.test(r.fill) && parseInt(r.fill.slice(5, 7), 16) > parseInt(r.fill.slice(1, 3), 16) && parseInt(r.fill.slice(5, 7), 16) > parseInt(r.fill.slice(3, 5), 16) && r.width > hourWidth / 4 && r.height > 12 && r.height < 100 && r.y > first.y + first.height - 2);
    if (classRects.some(r => headings.filter(t => inside(t, r)).length !== 1)) throw new Error("อ่านข้อมูลในกรอบคาบเรียนไม่ครบ กรุณาเลือกไฟล์ใหม่หรือกรอกตารางด้วยตนเอง"); // i18n-ignore
    for (const [index, heading] of headings.entries()) {
      result.eventsTotal++;
      const candidates = classRects.filter(r => inside(heading, r)).sort((a, b) => a.width * a.height - b.width * b.height);
      const rect = candidates[0];
      if (!rect) { result.malformedSkipped++; continue; }
      const body = lines(page.texts.filter(t => inside(t, rect)));
      const m = clean(heading.text).match(/^([A-Za-z]*\d{3,7})\s+Sec\s+(\d+)$/)!;
      const day = dayTexts.reduce((a, b) => Math.abs(a.y - (rect.y + rect.height / 2)) < Math.abs(b.y - (rect.y + rect.height / 2)) ? a : b);
      // REG draws frames with small layout offsets (up to a few minutes).
      // Estimate on a 5-minute scale, retain off-half-hour warnings, and require TA review.
      const time = (x: number) => {
        const raw = first.hour * 60 + (x - first.x) * 60 / hourWidth;
        const quarter = Math.round(raw / 15) * 15;
        const min = Math.abs(raw - quarter) <= 4 ? quarter : Math.round(raw / 5) * 5;
        return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
      };
      const id = `pdf-${pageIndex}-${index}`;
      const lastLine = body.at(-1) ?? "";
      const hasRoom = /WBA|^[A-Za-z]{1,8}\d+[A-Za-z0-9]*-/i.test(lastLine);
      const block: Block = { id, term_id: termId, course_code: m[1].toUpperCase(), sec_no: m[2], course_name: body.slice(1, hasRoom ? -1 : undefined).join(""), day_of_week: DAYS.indexOf(day.text.trim()), start_time: time(rect.x), end_time: time(rect.x + rect.width), kind: "", note: hasRoom ? lastLine : "", is_wba: false };
      result.blocks.push(block);
      result.rawById![id] = body.join("\n");
      if (![block.start_time, block.end_time].every(t => /:(00|30)$/.test(t))) result.reviewIds!.push(id);
    }
  }
  result.blocks.sort((a, b) => (a.day_of_week || 7) - (b.day_of_week || 7) || a.start_time.localeCompare(b.start_time));
  return result;
}

/** Loads only after file selection; PDF bytes stay in the browser. */
export async function readRegPdfPages(data: Uint8Array): Promise<PdfSchedulePage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined") pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const loading = pdfjs.getDocument({ data, useSystemFonts: true, stopAtErrors: true });
  try {
    const doc = await loading.promise;
    if (doc.numPages > 10) throw new Error("PDF มีเกิน 10 หน้า กรุณาเลือกเฉพาะตารางเรียนของภาคการศึกษานี้"); // i18n-ignore
    const pages: PdfSchedulePage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const texts = content.items.filter(i => "str" in i && i.str.trim()).map(item => {
        const t = item as import("pdfjs-dist/types/src/display/api").TextItem;
        const [x, y] = viewport.convertToViewportPoint(t.transform[4], t.transform[5]);
        return { text: t.str, x, y: y - t.height / 3, width: t.width, height: t.height };
      });
      const ops = await page.getOperatorList();
      let matrix = [1, 0, 0, 1, 0, 0];
      let fill = "#000000";
      const stack: { matrix: number[]; fill: string }[] = [], rects: PdfRect[] = [];
      for (let i = 0; i < ops.fnArray.length; i++) {
        const op = ops.fnArray[i], args = ops.argsArray[i];
        if (op === pdfjs.OPS.save) stack.push({ matrix: [...matrix], fill });
        else if (op === pdfjs.OPS.restore) { const state = stack.pop(); if (state) { matrix = state.matrix; fill = state.fill; } }
        else if (op === pdfjs.OPS.setFillRGBColor) fill = args[0];
        else if (op === pdfjs.OPS.transform) matrix = pdfjs.Util.transform(matrix, args);
        else if (op === pdfjs.OPS.constructPath && [pdfjs.OPS.fill, pdfjs.OPS.eoFill, pdfjs.OPS.fillStroke, pdfjs.OPS.eoFillStroke].includes(args[0])) {
          const path = args[1]?.[0], box = args[2];
          // PDF.js DrawOPS rectangle = move, line, line, line, close. Ignore clips and curves.
          if (!box || path?.length !== 13 || path[0] !== 0 || path[3] !== 1 || path[6] !== 1 || path[9] !== 1 || path[12] !== 4) continue;
          const points = [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]].map(p => {
            pdfjs.Util.applyTransform(p, matrix);
            return viewport.convertToViewportPoint(p[0], p[1]);
          });
          const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
          rects.push({ fill, x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
        }
      }
      pages.push({ texts, rects }); page.cleanup();
    }
    return pages;
  } finally { await loading.destroy(); }
}

export async function pdfToBlocks(data: Uint8Array, termId: string): Promise<ScheduleImportResult> {
  return regPdfPagesToBlocks(await readRegPdfPages(data), termId);
}
