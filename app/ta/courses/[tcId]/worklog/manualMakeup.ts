export interface MakeupImpact {
  original_date: string;
  holiday_start?: string;
  holiday_end?: string;
  affected_sections: {
    section_id: string;
    kind: "lecture" | "lab";
    start_time?: string;
    end_time?: string;
    makeup: { id: string; makeup_date?: string | null; start_time?: string; end_time?: string; waived?: boolean } | null;
  }[];
}

export type ManualDateResolution =
  | { state: "normal"; workDate: string }
  | { state: "makeup"; workDate: string; originalDate: string; makeupID: string; start: string; end: string }
  | { state: "blocked"; workDate: string; reason: "missing" | "waived" | "invalid" };

// Resolve the selected ORIGINAL period, never another section or class kind.
// Ordinary review/preparation/other duties retain their own date rules.
export function resolveManualClassDate(date: string, activity: string, sectionID: string | undefined,
  impacts: readonly MakeupImpact[], originalTimes?: { start: string; end: string } | null): ManualDateResolution {
  const normal: ManualDateResolution = { state: "normal", workDate: date };
  if (!date || !sectionID || !["lecture", "lab"].includes(activity)) return normal;
  const holidays = impacts.filter(i => i.original_date === date);
  if (!holidays.length) return normal;
  const periods = holidays.flatMap(i => i.affected_sections.filter(s => s.section_id === sectionID && s.kind === activity));
  if (!periods.length) {
    // A partial closure does not cancel an afternoon period. Full closures
    // still block when the timetable/impact data has no matching period.
    const closed = holidays.some(i => !i.holiday_start || !i.holiday_end ||
      (!!originalTimes && originalTimes.start < i.holiday_end && originalTimes.end > i.holiday_start));
    return closed ? { state: "blocked", workDate: date, reason: "missing" } : normal;
  }
  if (periods.some(s => s.makeup?.waived)) return { state: "blocked", workDate: date, reason: "waived" };
  const targets = new Map(periods.filter(s => s.makeup?.makeup_date).map(s => [s.makeup!.id, s]));
  if (!targets.size) return { state: "blocked", workDate: date, reason: "missing" };
  if (targets.size !== 1) return { state: "blocked", workDate: date, reason: "invalid" };
  const period = [...targets.values()][0];
  const makeup = period.makeup!;
  const start = (makeup.start_time ?? period.start_time ?? originalTimes?.start ?? "").slice(0, 5);
  const end = (makeup.end_time ?? period.end_time ?? originalTimes?.end ?? "").slice(0, 5);
  if (!makeup.id || !/^\d{4}-\d{2}-\d{2}$/.test(makeup.makeup_date!) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) {
    return { state: "blocked", workDate: date, reason: "invalid" };
  }
  return { state: "makeup", workDate: makeup.makeup_date!, originalDate: date, makeupID: makeup.id, start, end };
}
