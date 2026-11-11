import type { REGReview, REGIssue } from "./REGReviewEditor";

export const REG_CURRICULA = ["CS", "IT", "GIS", "AI", "CY", "KKBS", "OTHER"] as const;
export type REGBulkAction =
  | { type: "curriculum"; value: string; onlyMissing: boolean }
  | { type: "track"; value: string }
  | { type: "level"; value: string }
  | { type: "lecturer"; value: string; primary: boolean }
  | { type: "acknowledge"; kinds: string[] };
export interface REGBulkChange { id: string; code: string; section?: string; track?: string; sourceRow?: number; before: string; after: string; message?: string }

// Older preview responses have no kind. Keep them usable without guessing a
// category: staff can still read the full text of every item in the preview.
export function regIssueKind(issue: REGIssue): string { return issue.kind || "other"; }
export function canBulkAcknowledge(issue: REGIssue): boolean {
  return issue.severity === "warning" && !["unmatched_names", "lecturer"].includes(regIssueKind(issue))
    && !/ชื่อจาก REG ที่ไม่พบหรือกำกวม|ยังไม่ผูกอาจารย์/.test(issue.message);
}

/** One plan powers both the reviewable preview and the applied values. No DB writes. */
export function planREGBulk(review: REGReview, codes: string[], action: REGBulkAction) {
  const targets = new Set(codes);
  const included = review.courses.filter(c => targets.has(c.code) && !c.skip && !c.existing_id);
  const eligible = new Set(included.map(c => c.code));
  const changes: REGBulkChange[] = [];
  const result: REGReview = { ...review, confirmed: false, ready: false, validation_hash: "" };
  if (action.type === "acknowledge") {
    // Only current server-validated warning IDs can be acknowledged in bulk.
    if (!review.validation_hash) return { changes, review };
    const issues = review.issues.filter(i => eligible.has(i.code) && canBulkAcknowledge(i)
      && action.kinds.includes(regIssueKind(i)) && !review.acknowledged.includes(i.id));
    for (const i of issues) {
      const section = review.courses.find(c => c.code === i.code)?.sections.find(s => s.id === i.section_id);
      changes.push({ id: i.id, code: i.code, section: section?.sec_no, track: section?.track, sourceRow: section?.source_row, before: "", after: "", message: i.message });
    }
    result.acknowledged = [...new Set([...review.acknowledged, ...issues.map(i => i.id)])];
  } else {
    const valid = action.type === "curriculum" ? REG_CURRICULA.includes(action.value as typeof REG_CURRICULA[number])
      : action.type === "track" ? ["regular", "special"].includes(action.value)
      : action.type === "level" ? ["undergrad", "graduate"].includes(action.value)
      : review.lecturers.some(l => l.id === action.value);
    if (!valid) return { changes, review };
    result.courses = review.courses.map(c => {
      if (!eligible.has(c.code)) return c;
      if (action.type === "lecturer") {
        const ids = action.primary ? [action.value, ...c.lecturer_ids.filter(id => id !== action.value)] : [...new Set([...c.lecturer_ids, action.value])];
        if (ids.join() === c.lecturer_ids.join()) return c;
        const names = (values: string[]) => values.map(id => { const l = review.lecturers.find(l => l.id === id); return l ? `${l.name} (${l.email || l.id})` : id; }).join(", ");
        changes.push({ id: c.code, code: c.code, before: names(c.lecturer_ids), after: names(ids) });
        return { ...c, lecturer_ids: ids, unassigned_reason: "" };
      }
      if (action.type === "level") {
        if (c.level === action.value) return c;
        changes.push({ id: c.code, code: c.code, before: c.level, after: action.value });
        return { ...c, level: action.value };
      }
      return { ...c, sections: c.sections.map(s => {
        const before = s[action.type];
        if ((action.type === "curriculum" && action.onlyMissing && REG_CURRICULA.includes(s.curriculum as typeof REG_CURRICULA[number])) || before === action.value) return s;
        changes.push({ id: `${c.code}:${s.id}`, code: c.code, section: s.sec_no, track: s.track, sourceRow: s.source_row, before, after: action.value });
        return { ...s, [action.type]: action.value };
      }) };
    });
  }
  return { changes, review: changes.length ? result : review };
}
