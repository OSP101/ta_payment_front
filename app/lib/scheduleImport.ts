import type { Block } from "../components/ScheduleGrid";
import type { IcsImportResult } from "./ics";

export interface ScheduleImportResult extends IcsImportResult {
  source?: "pdf" | "ics";
  academicYear?: number;
  semester?: number;
  /** PDF coordinates estimate times; the source contains no exact time per class. */
  reviewIds?: string[];
  rawById?: Record<string, string>;
}

export function duplicateScheduleBlock(a: Block, b: Block): boolean {
  if (a.course_code.toUpperCase() !== b.course_code.toUpperCase() || a.kind !== b.kind) return false;
  if (a.kind) return true;
  return a.day_of_week === b.day_of_week && a.start_time.slice(0, 5) === b.start_time.slice(0, 5) && a.end_time.slice(0, 5) === b.end_time.slice(0, 5);
}

export function scheduleImportErrors(blocks: Block[]): Map<string, string> {
  const errors = new Map<string, string>();
  const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  for (const b of blocks) {
    // These keys are translated by the review UI.
    if (!b.course_code.trim() && !b.course_name.trim()) errors.set(b.id, "โปรดระบุรหัสวิชาหรือชื่อวิชาอย่างน้อยหนึ่งอย่าง"); // i18n-ignore
    else if (!/^[A-Za-z0-9-]{0,16}$/.test(b.course_code) || b.course_name.length > 120 || b.note.length > 200 || !/^\d{0,8}$/.test(b.sec_no)) errors.set(b.id, "รหัสวิชา กลุ่ม ชื่อวิชา หรือห้องไม่ถูกต้อง"); // i18n-ignore
    else if (!Number.isInteger(b.day_of_week) || b.day_of_week < 0 || b.day_of_week > 6 || !["", "lecture", "lab"].includes(b.kind)) errors.set(b.id, "วันหรือประเภทคาบไม่ถูกต้อง"); // i18n-ignore
    else if (![b.start_time, b.end_time].every(s => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)) || minutes(b.start_time) < 480 || minutes(b.end_time) > 1200 || minutes(b.start_time) >= minutes(b.end_time)) errors.set(b.id, "เวลาเรียนต้องอยู่ในช่วง 08:00–20:00 และสิ้นสุดหลังเวลาเริ่ม"); // i18n-ignore
  }
  blocks.forEach((a, i) => blocks.slice(i + 1).forEach(b => {
    const duplicate = duplicateScheduleBlock(a, b);
    const overlap = a.course_code.toUpperCase() !== b.course_code.toUpperCase() && a.day_of_week === b.day_of_week && minutes(a.start_time) < minutes(b.end_time) && minutes(b.start_time) < minutes(a.end_time);
    if (duplicate || overlap) {
      const key = duplicate ? "มีคาบวิชาและประเภทเดียวกันซ้ำ โปรดตรวจประเภทหรือลบคาบซ้ำ" : "เวลาเรียนต่างวิชาทับซ้อนกัน โปรดแก้เวลา"; // i18n-ignore
      errors.set(a.id, key); errors.set(b.id, key);
    }
  }));
  return errors;
}

export function canConfirmScheduleImport(result: ScheduleImportResult | null, confirmed: boolean, busy: boolean, termId: string): boolean {
  return !!result && result.blocks.length > 0 && confirmed && !busy && !!termId && scheduleImportErrors(result.blocks).size === 0 && result.malformedSkipped === 0;
}
