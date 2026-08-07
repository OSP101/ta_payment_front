"use client";
import { use, useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { Wand2, Send, Save, Clock, ChevronLeft, Plus, Trash2, AlertTriangle, BookOpenCheck, Pencil, Cloud, CloudOff, Check, CheckCircle2, LayoutGrid } from "lucide-react";
import { api, type Me } from "../../../../lib/api";
import { notify } from "../../../../lib/notify";
import {
  readAddForm, readDrafts, clearAddForm, clearDrafts, sweepStale, writeAddForm, writeDrafts,
} from "../../../../lib/draftStorage";
import { useUnsavedChanges } from "../../../../lib/useUnsavedChanges";
import {
  PageHeader, Panel, Select, TextInput, StatusChip, ConfirmDialog, Button, EmptyState,
  Modal, FieldGroup, Alert, Chip, TimePicker, DatePicker, TipWrap,
} from "../../../../components/ui";
import { type DataColumn } from "../../../../components/DataTable";
import { LockedActionButton, useTAApproval } from "../../../TAGate";

// Max billable hours per single work-log entry. Kept in sync with backend.
const MAX_ROW_HOURS = 7;

// Earliest date the TA may log — the 1st of the current month. Back-dating into
// a month that has already passed is blocked (mirrors the backend rule); future
// dates within the term stay allowed.
function currentMonthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// Which server statuses the TA is allowed to edit inline. Rejected rows are
// editable because the lecturer sent them back for revision — on save the
// backend Upsert flips the row back to draft (see WorkLogService.Upsert's
// UPDATE ... SET status='draft'). Submitted/approved rows are frozen.
function isEditableStatus(status: string): boolean {
  return status === "draft" || status === "rejected";
}

// Compact −/+ stepper for the hours field. Mirrors the TextInput's step/min/max
// so a TA can nudge hours by half-hour taps without touching the keyboard.
// `fullWidth` stretches the whole control to fill its parent (used in the modal
// grid so the stepper aligns with sibling TimePickers).
function HoursStepper({
  value, onChange, min = 0, max = MAX_ROW_HOURS, step = 0.5, fullWidth = false,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  fullWidth?: boolean;
}) {
  const clamp = (n: number) => {
    if (!Number.isFinite(n)) return min;
    const snapped = Math.round(n * 2) / 2;
    return Math.max(min, Math.min(max, snapped));
  };
  const dec = () => onChange(clamp(value - step));
  const inc = () => onChange(clamp(value + step));
  return (
    <div
      className={`${fullWidth ? "flex w-full" : "inline-flex"} items-stretch rounded-lg border border-(--hairline) bg-surface overflow-hidden`}
    >
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        className="px-3 text-base leading-none text-muted hover:bg-surface-secondary disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="ลดจำนวนชั่วโมง"
      >
        −
      </button>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(clamp(Number(e.target.value)))}
        className={`${fullWidth ? "flex-1 min-w-0" : "w-14"} text-center tabular bg-transparent border-x border-(--hairline) px-1 py-1.5 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
        aria-label="จำนวนชั่วโมง"
      />
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        className="px-3 text-base leading-none text-muted hover:bg-surface-secondary disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="เพิ่มจำนวนชั่วโมง"
      >
        +
      </button>
    </div>
  );
}

function parseHM(t: string): number {
  const [h, m] = (t ?? "").split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
}

// Returns null when the row is savable, otherwise a Thai reason. Enforced
// client-side so the user gets instant feedback before hitting the server.
function validateRow(w: WorkLog): string | null {
  if (!w.work_date) return "โปรดระบุวันที่ปฏิบัติงาน";
  if (!w.start_time || !w.end_time) return "โปรดระบุเวลาเริ่มและเวลาสิ้นสุด";
  const s = parseHM(w.start_time);
  const e = parseHM(w.end_time);
  if (Number.isNaN(s) || Number.isNaN(e)) return "รูปแบบเวลาไม่ถูกต้อง";
  if (e <= s) return "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม";
  if (!(w.hours > 0)) return "จำนวนชั่วโมงต้องมากกว่า 0";
  if (w.hours > MAX_ROW_HOURS) return `จำนวนชั่วโมงต้องไม่เกิน ${MAX_ROW_HOURS} ชั่วโมงต่อรายการ`;
  // Tolerance matches the server's 0.01h (worklog.go validateWorkLogEntry) so
  // a row that passes here can't bounce off the API with the same complaint.
  const span = (e - s) / 60;
  if (Math.abs(span - w.hours) > 0.01) {
    return `จำนวนชั่วโมง (${w.hours}) ไม่ตรงกับช่วงเวลา ${w.start_time}–${w.end_time} (${span.toFixed(2)} ชม.) ปรับชั่วโมงให้ตรงกับช่วงเวลา`;
  }
  // Q&A rule 2: "อื่นๆ" must be tagged with the parent session type so the
  // server can enforce the per-session credit-hour cap.
  if (w.activity === "other" && w.parent_kind !== "lecture" && w.parent_kind !== "lab") {
    return "กรุณาระบุประเภทกิจกรรมหลัก (บรรยาย/ปฏิบัติการ) สำหรับกิจกรรมอื่นๆ";
  }
  return null;
}

// One row of GET /me/submission-periods (PendingByTA) — enough to decide
// whether a month is still open for TA writes.
interface MyPeriod {
  period_id: string;
  label: string;
  year_month: string; // "2569-06" — Buddhist academic year + submission month
  due_date: string;   // Gregorian ISO date
  is_closed: boolean;
  teaching_course_id: string;
  status: string;
}
interface MonthLock {
  label: string;
  financeSent: boolean;
  // exported (staff pulled the ZIP) freezes the month for the TA too, exactly
  // like finance_sent — the backend rejects TA writes in both states. Without
  // this the UI let the TA edit an exported month and every save 409'd.
  exported: boolean;
}

interface Assignment {
  id: string;
  teaching_course_id: string;
  course_code: string;
  course_name: string;
  section_id: string;
  sec_no: string;
  track: string;
  // Copied from the parent ta_request — governs which activity types the TA is
  // authorized to log. "lecture" → only lecture-side entries, "lab" → only
  // lab-side, "both" → everything.
  reimburse_scope: "lecture" | "lab" | "both";
  // True when the lecturer has entered class times for the section. Auto-gen
  // reads section_schedules, so an empty schedule means the button would
  // silently produce zero rows — gate the button in the UI instead.
  has_schedule: boolean;
  // Weekly hour caps per activity, derived server-side from the lecturer's
  // workload form. Used by AddWorklogModal to preflight-limit hour entry so
  // the TA doesn't overshoot the quota and get rejected on save. When
  // weekly_caps_set=false the workload form hasn't been filled yet — treat
  // the zeros as "no cap known" and skip the enforcement UI.
  weekly_cap_lecture: number;
  weekly_cap_lab: number;
  weekly_cap_review: number;
  weekly_cap_other: number;
  // For grad-level assignments, help_teach_hrs is a shared cap covering both
  // lecture and lab combined — the UI sums lecture+lab weekly totals when
  // checking against this cap.
  weekly_lecture_lab_shared: boolean;
  weekly_caps_set: boolean;
  // Total hours loggable across the whole term for this assignment =
  // weekly workload total × weeks-in-term. 0 when no workload form is filed.
  term_hour_ceiling: number;
  // Work-log tallies for THIS assignment, so every section a TA holds can show
  // its own state at once. unsent_count is draft+rejected — exactly what
  // "ส่งอนุมัติ" would send for that section.
  unsent_count: number;
  // The part of unsent_count still inside an open period. The difference is
  // stranded — past the deadline, only staff can move it. Server-derived so the
  // cards for sections NOT on screen are right too; their rows are not loaded.
  submittable_count: number;
  // "YYYY-MM" months that have entered review. Upsert refuses a new row in
  // exactly these, so the "+ เพิ่ม" affordance is hidden there — same predicate,
  // server-derived, so the screen cannot offer what the server refuses.
  months_in_review: string[];
  submitted_count: number;
  approved_count: number;
  hours_logged: number;
}
interface SectionScheduleSlot {
  id: string;
  kind: string; // "lecture" | "lab"
  day_of_week: number;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  room?: string;
}
interface SectionWithSchedules {
  id: string;
  sec_no: string;
  track: string;
  schedules?: SectionScheduleSlot[];
}
interface TC {
  id: string;
  code: string;
  name_th: string;
  // Course-level student count. Staff fill this when opening the course; payout
  // is derived from it, so worklog entry is blocked (server + UI) until it's set.
  num_students?: number;
  // Term-bounded date range. Staff already fills these when opening the course;
  // the monthly grouper uses them to seed month sections so a TA sees every
  // month of the term (even empty ones), not just months they've logged into.
  starts_on?: string;
  ends_on?: string;
  // Sections + their weekly time slots. AddWorklogModal reads this to prefill
  // sensible start/end times when the TA picks a lecture/lab activity — the
  // natural class period is a much better default than the fixed 09:00–10:00.
  sections?: SectionWithSchedules[];
}

// Holiday impact shape — same as the lecturer/TA holidays pages consume.
// Kept here so the AddWorklogModal + MonthlyWorklogView can gate on it without
// pulling in a separate SWR key elsewhere.
interface HolidayImpactMakeup {
  id: string;
  makeup_date: string;
  start_time?: string;
  end_time?: string;
}
interface HolidayImpactSection {
  section_id: string;
  sec_no: string;
  kind: "lecture" | "lab";
  makeup: HolidayImpactMakeup | null;
}
interface HolidayImpact {
  original_date: string;
  holiday_name_th: string;
  /** Closure window ("HH:MM"); absent = closed all day. */
  holiday_start?: string;
  holiday_end?: string;
  affected_sections: HolidayImpactSection[];
}
interface HolidayImpactsResponse {
  impacts: HolidayImpact[];
  unresolved_count: number;
}

// One closure on one date. A faculty holiday may cover only part of the day, so
// "is this a holiday?" is only answerable together with the hours being logged.
interface HolidayWindow {
  name: string;
  start: string | null; // "HH:MM", null = all day
  end: string | null;
}

// Derived per-date lookup: given a work_date, tell the modal + row renderer
// which closures fall on it, whether it's some section's approved makeup day,
// and whether the original class day was shifted elsewhere (so lecture/lab
// logging should point the TA at the makeup date instead).
interface DateStatus {
  holidays: HolidayWindow[];       // closures on this date; empty = a normal day
  isMakeupDay: boolean;            // set if this date is any section's makeup
  shiftedTo: string | null;        // if this date is a filed original_date
  hasUnresolvedForThisSection: boolean; // relevant for the current section
}

// The closure covering [start, end), or null when the entry's hours fall outside
// every closure on that date. Mirrors holidaySet.overlapping in
// internal/service/worklog.go — half-open on both ends, so an entry starting at
// 12:00 is clear of a closure ending at 12:00. An entry with no times yet is
// treated as covering the day, which is the honest answer before the TA has
// picked hours: it warns, and the server re-decides on save.
function holidayCovering(
  status: DateStatus | undefined,
  start: string,
  end: string,
): HolidayWindow | null {
  if (!status) return null;
  const s = start || "00:00";
  const e = end || "24:00";
  for (const h of status.holidays) {
    if (!h.start || !h.end) return h;
    if (h.start < e && h.end > s) return h;
  }
  return null;
}

// "ชื่อวันหยุด 08:00–12:00" — the hours matter in a refusal: told only the name,
// a TA whose lab starts after the closure cannot tell a rule from a bug.
function holidayLabel(h: HolidayWindow): string {
  return h.start && h.end ? `${h.name} ${h.start}–${h.end}` : h.name;
}

function buildDateIndex(
  impacts: HolidayImpact[] | undefined,
  currentSectionID: string | undefined,
): Map<string, DateStatus> {
  const idx = new Map<string, DateStatus>();
  if (!impacts) return idx;
  for (const imp of impacts) {
    const status: DateStatus = idx.get(imp.original_date) ?? {
      holidays: [],
      isMakeupDay: false,
      shiftedTo: null,
      hasUnresolvedForThisSection: false,
    };
    // One date can carry several closures (a national holiday plus a faculty
    // window, or two faculty windows), and the API returns one impact per
    // closure — so accumulate instead of overwriting.
    const win: HolidayWindow = {
      name: imp.holiday_name_th,
      start: imp.holiday_start?.slice(0, 5) ?? null,
      end: imp.holiday_end?.slice(0, 5) ?? null,
    };
    if (!status.holidays.some(h => h.name === win.name && h.start === win.start)) {
      status.holidays.push(win);
    }
    // A single holiday × multiple sections: the "shifted-to" is per-section
    // so we can only surface it meaningfully when we know which section the
    // TA is currently logging under.
    for (const sec of imp.affected_sections) {
      if (sec.section_id === currentSectionID) {
        if (sec.makeup) {
          status.shiftedTo = sec.makeup.makeup_date;
        } else {
          status.hasUnresolvedForThisSection = true;
        }
      }
      // Any makeup date on any section is a "makeup day" from the validator's
      // perspective — but for the UX hint, only the current section's makeup
      // matters, so we track that separately below.
    }
    idx.set(imp.original_date, status);
    // Register makeup dates too — a Saturday that's someone's makeup should
    // NOT show a "holiday" chip, but the modal must know it's a valid target.
    for (const sec of imp.affected_sections) {
      if (sec.makeup && sec.section_id === currentSectionID) {
        const existing = idx.get(sec.makeup.makeup_date) ?? {
          holidays: [],
          isMakeupDay: false,
          shiftedTo: null,
          hasUnresolvedForThisSection: false,
        };
        existing.isMakeupDay = true;
        idx.set(sec.makeup.makeup_date, existing);
      }
    }
  }
  return idx;
}
interface WorkLog {
  id: string; assignment_id: string;
  work_date: string; start_time: string; end_time: string;
  hours: number; activity: string;
  // parent_kind is required (lecture|lab) when activity === "other" so the
  // server can enforce the per-session credit-hour cap (Q&A rule 2).
  parent_kind?: "lecture" | "lab" | null;
  room?: string; note?: string; status: string;
  // reject_reason is set on every row that shares a batch rejection so the
  // TA-facing UI can surface a "why" modal on entry. All rejected rows in
  // the same assignment carry the same string — Reject() stamps them all.
  reject_reason?: string | null;
}

/** One reason auto-generation refused a set of sessions, with how many. */
interface SkipGroup {
  reason: string;
  count: number;
}

/**
 * POST /worklog/generate returns what it created AND what it left out, so a
 * short list can be explained rather than looking like a failure.
 */
interface GenerateResult {
  entries: WorkLog[];
  skipped_own_class: SkipGroup[] | null;
}

// Draft payload for the "add row" modal — same shape as WorkLog but without
// server-owned fields (id, status, assignment_id). Kept separate so the modal
// form can't accidentally assign a status or bind to a persisted id.
interface NewWorkLog {
  work_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  activity: string;
  parent_kind: "lecture" | "lab" | null;
  room: string;
  note: string;
}

// BusyBlock is one occupied weekly slot on the TA's timetable, from
// GET /assignments/:id/schedule-busy — used to preview review-slot conflicts.
interface BusyBlock {
  day_of_week: number;
  start_time: string; // "HH:MM"
  end_time: string;
  kind: "class" | "teaching" | "review";
  label: string;
  review_id?: string;
}

const PARENT_KIND_LABEL: Record<string, string> = {
  lecture: "คู่กับบรรยาย",
  lab: "คู่กับปฏิบัติการ",
};

const ACTIVITY_LABEL: Record<string, string> = {
  lecture: "บรรยาย",
  lab: "ปฏิบัติการ",
  review: "ตรวจงาน",
  makeup: "ชดเชย",
  other: "อื่น ๆ",
};

type Scope = "lecture" | "lab" | "both";

// Which activity kinds a TA is allowed to log for a given reimburse_scope.
// review/makeup/other apply to both scopes because they aren't tied to a
// single session type — review = grading student work, makeup = re-run of any
// missed class, other = miscellaneous (still requires parent_kind for "other").
function allowedActivitiesFor(scope: Scope | undefined): string[] {
  const base = ["review", "makeup", "other"];
  if (scope === "lecture") return ["lecture", ...base];
  if (scope === "lab") return ["lab", ...base];
  // "both" or unknown scope — show everything so the TA isn't locked out if
  // the request row is missing scope data.
  return ["lecture", "lab", ...base];
}

// For activity="other", the parent-kind picker is restricted the same way —
// scope=lecture only allows "คู่กับบรรยาย", etc.
function allowedParentKindsFor(scope: Scope | undefined): ("lecture" | "lab")[] {
  if (scope === "lecture") return ["lecture"];
  if (scope === "lab") return ["lab"];
  return ["lecture", "lab"];
}

const SCOPE_LABEL: Record<Scope, string> = {
  lecture: "บรรยายเท่านั้น",
  lab: "ปฏิบัติการเท่านั้น",
  both: "บรรยายและปฏิบัติการ",
};

const MONTH_TH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

// Single-char Thai weekday labels. Distinct from DAY_TH_SHORT below, which
// spells out full names for the review-schedule panel.
const DOW_ABBR_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

// Thai month abbreviations (with the ราชบัณฑิต-style trailing dot).
const MONTH_TH_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// formatWorkDate renders an ISO YYYY-MM-DD in Thai official style —
// "อ 25 พ.ย. 2568" (day-of-week + วันที่ เดือน ปี พ.ศ.).
function formatWorkDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return iso;
  const dow = DOW_ABBR_TH[dt.getDay()];
  const month = MONTH_TH_SHORT[m - 1];
  return `${dow} ${d} ${month} ${y + 543}`;
}

// monthKey extracts the "YYYY-MM" prefix from an ISO date so worklog rows and
// term boundaries can be bucketed by calendar month without pulling in a date
// library. Assumes the caller already validated the input as YYYY-MM-DD.
function monthKey(iso: string): string {
  return (iso ?? "").slice(0, 7);
}

// weekBoundsISO returns [Monday, Sunday] ISO dates for the week containing
// `iso`. Matches PostgreSQL's date_trunc('week', ...) which uses ISO weeks
// (Monday start), so client-side used-hours previews line up with server-side
// weekly cap enforcement.
function weekBoundsISO(iso: string): [string, string] {
  const [y, m, d] = (iso ?? "").split("-").map(Number);
  if (!y || !m || !d) return [iso, iso];
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return [iso, iso];
  const dow = dt.getDay(); // 0=Sun..6=Sat
  const offsetToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(y, m - 1, d + offsetToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const toIso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return [toIso(mon), toIso(sun)];
}

// weeklyUsedHours sums existing work_log hours for the same activity within
// the ISO week that contains `workDate`. `excludeId` skips the row being
// edited so it isn't double-counted against its own historical total. When
// `sharedLectureLab` is true (grad workload with combined help_teach cap),
// lecture and lab are pooled — used only for those two activity kinds.
function weeklyUsedHours(
  logs: { id: string; work_date: string; hours: number; activity: string }[] | undefined,
  workDate: string,
  activity: string,
  sharedLectureLab: boolean,
  excludeId?: string,
): number {
  if (!logs || !workDate) return 0;
  const [start, end] = weekBoundsISO(workDate);
  const kinds =
    sharedLectureLab && (activity === "lecture" || activity === "lab")
      ? new Set(["lecture", "lab"])
      : new Set([activity]);
  let total = 0;
  for (const l of logs) {
    if (excludeId && l.id === excludeId) continue;
    if (l.work_date < start || l.work_date > end) continue;
    if (!kinds.has(l.activity)) continue;
    total += l.hours || 0;
  }
  return total;
}

// formatMonthTH renders a month key as "กรกฎาคม 2569" — Buddhist-era year is
// what the Thai users expect on this UI (Gregorian + 543).
function formatMonthTH(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return key;
  return `${MONTH_TH[m - 1]} ${y + 543}`;
}

// monthsInRange returns every month between two ISO dates, inclusive. Used to
// pre-seed month sections from the term's start/end so a TA sees all months in
// the semester — even ones with no entries yet — as clickable "add here" slots.
function monthsInRange(startIso?: string, endIso?: string): string[] {
  if (!startIso || !endIso) return [];
  const start = new Date(startIso + "T00:00:00");
  const end = new Date(endIso + "T00:00:00");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end < start) return [];
  const out: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    out.push(`${y}-${m}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

export default function WorklogPage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  const { approved } = useTAApproval();

  // /me gives us the userId that namespaces the localStorage draft key —
  // guards against a shared device leaking one TA's drafts to another.
  const { data: me } = useSWR<Me>("/me");
  const userId = me?.id ?? "";
  const { data: course } = useSWR<TC>(tcId ? `/teaching-courses/${tcId}` : null);
  const { data: assignments } = useSWR<Assignment[]>(
    tcId ? `/me/assignments?teaching_course_id=${tcId}` : null,
  );
  // Holiday impacts drive both the AddWorklogModal's inline "you can't log
  // here" hint and the MonthlyWorklogView's per-month warning strip. Shared
  // SWR key = one fetch for the whole page.
  const { data: impacts } = useSWR<HolidayImpactsResponse>(
    tcId ? `/teaching-courses/${tcId}/holiday-impacts` : null,
  );
  // Monthly submission periods gate TA writes: a closed period blocks edits to
  // that month, finance_sent freezes it entirely. The server enforces the same
  // rules — this map only lets the UI disable controls up front. Keyed by the
  // 2-digit Gregorian month ("06") taken from period.year_month, matching how
  // the backend maps work_date → period.
  // Which months the course budget can actually pay for. Read from the same
  // settlement the export uses, so what the TA is warned about is exactly what
  // will be dropped — not a second guess at the same sum.
  const { data: settlement } = useSWR<{
    committed: { unpaid_months?: string[]; partial_months?: string[]; dropped_baht: number; over_budget: boolean };
    forecast: { unpaid_months?: string[]; partial_months?: string[]; dropped_baht: number; over_budget: boolean };
  }>(tcId ? `/teaching-courses/${tcId}/budget-settlement` : null);
  // The forecast, so the TA hears about it while there is still a term left to
  // change something in — not once the money is already spent.
  const budgetForecast = settlement?.forecast;
  const unpaidMonths = useMemo(
    () => new Set(budgetForecast?.over_budget ? (budgetForecast.unpaid_months ?? []) : []),
    [budgetForecast],
  );
  // Since the cutoff moved from the month to the คาบ, a month can be part-paid.
  // Kept apart from unpaidMonths so the chip never tells somebody they get
  // nothing for a month they are in fact partly paid for.
  const partialMonths = useMemo(
    () => new Set(budgetForecast?.over_budget ? (budgetForecast.partial_months ?? []) : []),
    [budgetForecast],
  );

  const { data: myPeriods } = useSWR<MyPeriod[]>("/me/submission-periods");
  const monthLocks = useMemo(() => {
    const m = new Map<string, MonthLock>();
    const d = new Date();
    const todayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (const p of myPeriods ?? []) {
      if (p.teaching_course_id !== tcId) continue;
      const mm = (p.year_month ?? "").slice(5, 7);
      if (mm.length !== 2) continue;
      // Grace day matches the backend: closed once today > due_date + 1 day.
      const gd = new Date(`${p.due_date}T00:00:00`);
      gd.setDate(gd.getDate() + 1);
      const graceIso = `${gd.getFullYear()}-${String(gd.getMonth() + 1).padStart(2, "0")}-${String(gd.getDate()).padStart(2, "0")}`;
      const closed = p.is_closed || todayIso > graceIso;
      const financeSent = p.status === "finance_sent";
      const exported = p.status === "exported";
      if (closed || financeSent || exported) m.set(mm, { label: p.label, financeSent, exported });
    }
    return m;
  }, [myPeriods, tcId]);
  // Deadlines for months still OPEN. The lock map above can only ever say "too
  // late"; this is what lets the screen say so BEFORE it is, which is the only
  // thing that actually prevents a stranded month.
  const monthDeadlines = useMemo(() => {
    const m = new Map<string, { label: string; daysLeft: number }>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const p of myPeriods ?? []) {
      if (p.teaching_course_id !== tcId) continue;
      const mm = (p.year_month ?? "").slice(5, 7);
      if (mm.length !== 2 || monthLocks.has(mm)) continue;
      // Same grace day the backend applies, so the countdown ends when the
      // server stops accepting rather than a day early.
      const gd = new Date(`${p.due_date}T00:00:00`);
      gd.setDate(gd.getDate() + 1);
      m.set(mm, {
        label: p.label,
        daysLeft: Math.round((gd.getTime() - today.getTime()) / 86400000),
      });
    }
    return m;
  }, [myPeriods, tcId, monthLocks]);

  // Lock info for a work_date's month, or null when the month is writable.
  const monthLockFor = (iso: string): MonthLock | null =>
    monthLocks.get((iso ?? "").slice(5, 7)) ?? null;
  const rowEditable = (w: WorkLog) =>
    isEditableStatus(w.status) && !monthLockFor(w.work_date);
  const monthLockMessage = (lock: MonthLock) =>
    lock.financeSent
      ? `เดือน ${lock.label} ถูกส่งการเงินแล้ว แก้ไขไม่ได้`
      : lock.exported
      ? `เดือน ${lock.label} ถูกส่งออกไฟล์เบิกจ่ายแล้ว แก้ไขไม่ได้ กรุณาติดต่อเจ้าหน้าที่ให้ตีกลับก่อน`
      : `งวดส่งบันทึกเวลาเดือน ${lock.label} ปิดแล้ว แก้ไขและส่งย้อนหลังไม่ได้ รายการที่ไม่ได้ส่งถือว่าไม่ประสงค์ลงเวลา`;

  // A TA can hold multiple assignments on the same course (one per section).
  // Let them switch between them; default to the first.
  const [aid, setAid] = useState<string>("");
  useEffect(() => {
    if (aid || !assignments || assignments.length === 0) return;
    setAid(assignments[0].id);
  }, [assignments, aid]);

  const { data: logs } = useSWR<WorkLog[]>(aid ? `/assignments/${aid}/worklog` : null);

  // Per-row edit drafts, keyed [assignment_id][row_id] → WorkLog. The outer
  // key preserves drafts across section switches (a TA who edits sec 1 then
  // toggles to sec 2 and back should still see their sec-1 edits), and it
  // matches the localStorage key shape used by draftStorage — so persistence
  // is a straight write of `drafts[aid]` per slice.
  const [drafts, setDrafts] = useState<Record<string, Record<string, WorkLog>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  // quickAddDate: when the user clicks a month section's "+ เพิ่มในเดือนนี้"
  // we open the same modal but seed the date field to the first-of-month. null
  // means the modal opens with today (or the last chosen default).
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Stable reference so debounced effects that depend on `aidDrafts` don't
  // reset their timers on every render (a plain `drafts[aid] ?? {}` returns
  // a fresh empty object per render when the slice is missing, which would
  // continuously clear the debounce and cause the timer to never fire).
  const aidDrafts = useMemo(() => drafts[aid] ?? {}, [drafts, aid]);
  const view = (l: WorkLog): WorkLog => aidDrafts[l.id] ?? l;
  const patch = (l: WorkLog, p: Partial<WorkLog>) =>
    setDrafts(prev => {
      const slice = prev[aid] ?? {};
      return { ...prev, [aid]: { ...slice, [l.id]: { ...(slice[l.id] ?? l), ...p } } };
    });
  // Remove a single row from the current assignment's draft slice. When the
  // slice ends up empty we drop the aid key too so `drafts` stays small.
  const dropDraft = (rowId: string) =>
    setDrafts(prev => {
      const slice = prev[aid];
      if (!slice || !(rowId in slice)) return prev;
      const nextSlice = { ...slice };
      delete nextSlice[rowId];
      const next = { ...prev };
      if (Object.keys(nextSlice).length === 0) delete next[aid];
      else next[aid] = nextSlice;
      return next;
    });

  const hasUnsaved = Object.keys(aidDrafts).length > 0;

  // One-shot: purge any localStorage draft entries older than 30 days so a
  // long-lived tab doesn't accumulate cruft. Cheap; runs after paint.
  useEffect(() => { sweepStale(); }, []);

  // Debounced localStorage mirror — every draft mutation triggers a 400ms
  // timer, and only the last edit in a burst actually hits disk. Silent —
  // no toast, no visible state change. The stored payload is exactly
  // `drafts[aid]`, matching the slice we'd restore on recovery.
  useEffect(() => {
    if (!userId || !aid) return;
    const t = window.setTimeout(() => {
      writeDrafts<WorkLog>(userId, aid, aidDrafts);
    }, 400);
    return () => window.clearTimeout(t);
  }, [userId, aid, aidDrafts]);

  // Recovery: on first arrival at (aid, logs both ready) check if a stored
  // draft slice exists that isn't already mirrored in React state. If so,
  // surface a banner giving the TA an explicit กู้คืน / ทิ้ง choice — we
  // never restore silently. `recoveryDismissed` remembers per-aid choices
  // so switching sections back and forth doesn't nag repeatedly.
  interface RecoveryOffer {
    aid: string;
    restorable: WorkLog[]; // draft rows whose ids still exist server-side
    dropped: number;       // rows in storage whose server row is gone
    savedAt: number;
  }
  const [recovery, setRecovery] = useState<RecoveryOffer | null>(null);
  const [recoveryDismissed, setRecoveryDismissed] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!userId || !aid || !logs) return;
    if (recoveryDismissed.has(aid)) return;
    // Skip if we've already merged this slice into React state — happens
    // after กู้คืน, or when the user made a fresh edit that debounced-wrote
    // the same content back.
    if (Object.keys(aidDrafts).length > 0) return;
    const stored = readDrafts<WorkLog>(userId, aid);
    if (!stored) return;
    const serverIds = new Set(logs.map(l => l.id));
    const restorable: WorkLog[] = [];
    let dropped = 0;
    for (const [rowId, wl] of Object.entries(stored.drafts)) {
      if (serverIds.has(rowId)) restorable.push(wl);
      else dropped++;
    }
    if (restorable.length === 0 && dropped === 0) return;
    setRecovery({ aid, restorable, dropped, savedAt: stored.savedAt });
  }, [userId, aid, logs, aidDrafts, recoveryDismissed]);

  function acceptRecovery() {
    if (!recovery) return;
    const targetAid = recovery.aid;
    setDrafts(prev => {
      const slice = { ...(prev[targetAid] ?? {}) };
      for (const wl of recovery.restorable) slice[wl.id] = wl;
      return { ...prev, [targetAid]: slice };
    });
    if (recovery.restorable.length > 0) {
      notify.success(`กู้คืน ${recovery.restorable.length} รายการที่ยังไม่ได้บันทึก`);
    }
    setRecoveryDismissed(prev => new Set(prev).add(targetAid));
    setRecovery(null);
  }
  function dismissRecovery() {
    if (!recovery) return;
    if (userId) clearDrafts(userId, recovery.aid);
    setRecoveryDismissed(prev => new Set(prev).add(recovery.aid));
    setRecovery(null);
  }

  // Rejection surfacing: when the lecturer sends the batch back, every row
  // in the assignment carries a shared `reject_reason`. The chip alone
  // ("ไม่ผ่าน") doesn't explain why, so on first arrival at an assignment
  // with rejected rows we open a modal with the reason and two paths —
  // แก้ไข inline, or ลบทั้งหมด and start over. `rejectionSeenAids` tracks
  // per-session dismissals so section-switching back and forth doesn't nag.
  const rejectedRows = useMemo(
    () => (logs ?? []).filter(l => l.status === "rejected"),
    [logs],
  );
  const rejectReason = useMemo(
    () => rejectedRows.find(r => r.reject_reason)?.reject_reason ?? null,
    [rejectedRows],
  );
  const [rejectionSeenAids, setRejectionSeenAids] = useState<Set<string>>(new Set());
  const [showRejection, setShowRejection] = useState(false);
  const [deletingRejected, setDeletingRejected] = useState(false);
  useEffect(() => {
    if (!aid || !logs) return;
    if (rejectionSeenAids.has(aid)) return;
    if (rejectedRows.length === 0) return;
    setShowRejection(true);
  }, [aid, logs, rejectedRows, rejectionSeenAids]);
  function dismissRejection() {
    if (aid) setRejectionSeenAids(prev => new Set(prev).add(aid));
    setShowRejection(false);
  }
  async function deleteAllRejected() {
    if (!aid || rejectedRows.length === 0) return;
    setDeletingRejected(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const r of rejectedRows) {
        try {
          await api.del(`/assignments/${aid}/worklog/${r.id}`);
          ok++;
        } catch {
          failed++;
        }
      }
      if (failed === 0) notify.success(`ลบรายการที่ไม่ผ่านแล้ว ${ok} รายการ`);
      else notify.error(`ลบสำเร็จ ${ok} รายการ ล้มเหลว ${failed} รายการ`);
      revalidate();
    } finally {
      setDeletingRejected(false);
      dismissRejection();
    }
  }

  // Browser-close / reload guard. Only nags when there's actually something
  // to lose. Step 2's persistence is belt-and-suspenders — even if the user
  // dismisses the prompt, the draft is already on disk.
  useEffect(() => {
    if (!hasUnsaved) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [hasUnsaved]);

  // In-app nav guard — same intent as beforeunload, but for internal Link
  // clicks (breadcrumbs, sidebar, buttons). The hook returns pendingHref +
  // handlers; we render a ConfirmDialog below in the JSX tree.
  const navGuard = useUnsavedChanges(hasUnsaved);

  // Autosave: after 1500ms of quiet, walk `aidDrafts`, and for every row
  // that (a) still exists server-side as a draft, (b) passes client
  // validation, (c) isn't already saving, fire the same api.put the manual
  // Save button uses — silently. Failures stay in the drafts map so the
  // next valid edit gets another attempt; a single global error banner
  // surfaces the last message so the TA isn't left wondering. We
  // intentionally skip while the TA is un-approved (their save endpoint
  // would 403 anyway) to avoid noisy failures on the onboarding path.
  // Long-tail debounce so the API request never fires while the TA is still
  // actively editing — every keystroke / stepper click resets the timer, so
  // this only flushes after 30s of quiet. Loss-safety is covered by the
  // localStorage mirror (400ms) + beforeunload + recovery banner, so the
  // slower API cadence trades no data for a much snappier feel while typing.
  const AUTOSAVE_DELAY_MS = 30_000;
  const [autosavingIds, setAutosavingIds] = useState<Set<string>>(new Set());
  const [autoSavedAt, setAutoSavedAt] = useState<number | null>(null);
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  useEffect(() => {
    if (!approved || !aid) return;
    if (Object.keys(aidDrafts).length === 0) return;
    const t = window.setTimeout(async () => {
      const serverById = new Map((logs ?? []).map(l => [l.id, l] as const));
      const candidates: [string, WorkLog][] = [];
      for (const [rowId, w] of Object.entries(aidDrafts)) {
        if (savingId === rowId) continue;
        if (autosavingIds.has(rowId)) continue;
        const server = serverById.get(rowId);
        // Autosave only touches editable rows (draft + rejected). The
        // backend Upsert flips a rejected row back to draft on success.
        if (!server || !isEditableStatus(server.status)) continue;
        if (monthLockFor(w.work_date) || monthLockFor(server.work_date)) continue;
        if (validateRow(w) !== null) continue;
        candidates.push([rowId, w]);
      }
      if (candidates.length === 0) return;
      setAutosavingIds(prev => {
        const next = new Set(prev);
        for (const [id] of candidates) next.add(id);
        return next;
      });
      let anyOk = false;
      let lastError: string | null = null;
      for (const [rowId, w] of candidates) {
        try {
          await api.put(`/assignments/${w.assignment_id}/worklog`, w);
          dropDraft(rowId);
          anyOk = true;
        } catch (e) {
          lastError = e instanceof Error ? e.message : "บันทึกอัตโนมัติไม่สำเร็จ";
        } finally {
          setAutosavingIds(prev => {
            const next = new Set(prev);
            next.delete(rowId);
            return next;
          });
        }
      }
      if (anyOk) {
        setAutoSavedAt(Date.now());
        setAutosaveError(null);
        revalidate();
      } else if (lastError) {
        setAutosaveError(lastError);
      }
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(t);
    // aidDrafts drives cadence; `logs` gate keeps us from clobbering; other
    // deps ensure the effect re-registers when auth or savingId flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aidDrafts, aid, approved, logs, savingId]);

  // Rolling clock for the "บันทึกล่าสุด X นาที" pill so the label freshens
  // without a full re-render on every state change.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    if (!autoSavedAt) return;
    const t = window.setInterval(() => setNowTick(x => x + 1), 15000);
    return () => window.clearInterval(t);
  }, [autoSavedAt]);
  const autosaveBusy = autosavingIds.size > 0;
  const autosavePending = hasUnsaved && !autosaveBusy;
  const savedAgo = autoSavedAt ? formatSavedAgo(autoSavedAt) : "";

  const totalHours = useMemo(
    () => (logs ?? []).reduce((sum, l) => sum + (view(l).hours || 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logs, aidDrafts],
  );
  // Only rows already saved as draft on the server can be submitted — unsaved
  // in-memory edits don't count until the row is persisted.
  // Only drafts the server would actually delete. A draft parked in a closed
  // month is refused by Delete (assertWorklogWritable), so counting it here lit
  // up "ลบฉบับร่าง" on a pile that can never be cleared — the same live-button-
  // that-always-fails trap as the submit button and the staff pencil.
  const draftCount = (logs ?? []).filter(
    l => l.status === "draft" && !monthLockFor(l.work_date),
  ).length;
  // Submittable = draft + rejected. Backend's Submit picks up both statuses
  // so the whole batch goes together — TAs who fix only a handful of rows
  // expect the untouched rejected rows to be resubmitted alongside them.
  //
  // Rows in a CLOSED month are excluded: the server skips them (Submit's
  // unsubmittableMonthSQL), so counting them here produced a live button
  // offering to send ten rows and an error saying it sent none. A TA who missed
  // a deadline was left pressing it.
  const editableRows = (logs ?? []).filter(l => isEditableStatus(l.status));
  const submittableCount = editableRows.filter(l => !monthLockFor(l.work_date)).length;
  // The remainder is stranded: past the deadline, only staff can move it now.
  const strandedRows = editableRows.filter(l => !!monthLockFor(l.work_date));
  const strandedMonths = [...new Set(strandedRows.map(l => monthLockFor(l.work_date)!.label))];
  const canSubmit = !!aid && submittableCount > 0;

  const activeAssignment = assignments?.find(a => a.id === aid);
  // Server-derived, never re-computed here: the rule that decides it lives in
  // Upsert, and a second copy would drift into offering buttons that fail.
  const monthsInReview = useMemo(
    () => new Set(activeAssignment?.months_in_review ?? []),
    [activeAssignment],
  );
  // The top-level "+ เพิ่มรายการ" targets any date, so it survives while at
  // least one month can still take a row. A month is out if it has entered
  // review OR its period has closed — checking only the first left the button
  // live on a section whose every month was one or the other.
  const openMonths = useMemo(() => {
    const months = new Set((logs ?? []).map(l => monthKey(l.work_date)).filter(Boolean));
    return [...months].filter(
      m => !monthsInReview.has(m) && !monthLocks.get(m.slice(5, 7)),
    );
  }, [logs, monthsInReview, monthLocks]);
  const canAddRows = (logs ?? []).length === 0 || openMonths.length > 0;
  // "สร้างอัตโนมัติ" wipes and recreates the term, so the server refuses it
  // outright once anything has been submitted or approved (Generate). Same
  // predicate, so the button is not offered on a section it can never run for.
  const generateAllowed = monthsInReview.size === 0;
  const activeScope = activeAssignment?.reimburse_scope;
  const canGenerate = !!activeAssignment?.has_schedule;

  // Refetches the visible log AND the per-section tallies. The tallies drive the
  // section cards and the sidebar badge, so leaving them stale meant a section
  // still advertising rows the TA had just sent — the cards would have been
  // decoration rather than status.
  const revalidate = () =>
    mutate(
      (k) =>
        typeof k === "string" &&
        (k.startsWith(`/assignments/${aid}/worklog`) || k.startsWith("/me/assignments")),
    );

  async function saveRow(l: WorkLog) {
    const w = view(l);
    const err = validateRow(w);
    if (err) { notify.error(err); return; }
    const lock = monthLockFor(w.work_date) ?? monthLockFor(l.work_date);
    if (lock) { notify.error(monthLockMessage(lock)); return; }
    setSavingId(l.id);
    try {
      await api.put(`/assignments/${w.assignment_id}/worklog`, w);
      dropDraft(l.id);
      notify.success("บันทึกรายการแล้ว");
      revalidate();
    } catch (e) {
      notify.error(e);
    } finally { setSavingId(null); }
  }

  async function generate() {
    setConfirmGenerate(false);
    if (!aid) return;
    setGenerating(true);
    try {
      const res = await api.post<GenerateResult>(`/assignments/${aid}/worklog/generate`);
      const n = res?.entries?.length ?? 0;
      const skipped = res?.skipped_own_class ?? [];
      await revalidate();

      // Sessions dropped because the TA's own class runs at the same time.
      // Reported separately from the count so "ได้น้อยกว่าที่คิด" has a reason
      // attached instead of looking like a malfunction.
      const skippedTotal = skipped.reduce((sum, s) => sum + s.count, 0);
      if (skippedTotal > 0) {
        notify.info(
          `ข้ามไป ${skippedTotal} คาบ เพราะตรงกับตารางเรียนของคุณ ` +
            skipped.map(s => `${s.reason} (${s.count} คาบ)`).join(", "),
        );
      }

      if (n === 0) {
        notify.info(
          skippedTotal > 0
            ? "ไม่ได้สร้างรายการใดเลย เพราะทุกคาบตรงกับตารางเรียนของคุณ หากตารางเรียนไม่ถูกต้อง ให้แก้ที่หน้า 'ตารางเรียนของฉัน'"
            : "ยังไม่ได้สร้างรายการใด อาจเป็นเพราะ section นี้ยังไม่มีตารางสอนในระบบ หรือทุกคาบตกวันหยุด/สอบ/สุดสัปดาห์ ลองตรวจในหน้า 'วันหยุดและวันชดเชย' หรือให้อาจารย์เพิ่มตารางสอนของ section",
        );
      } else {
        notify.success(`สร้างรายการอัตโนมัติเรียบร้อย (${n} รายการ)`);
      }
    } catch (e) {
      notify.error(e);
    } finally { setGenerating(false); }
  }

  async function createRow(form: NewWorkLog): Promise<boolean> {
    if (!aid) return false;
    const err = validateRow({ ...form, id: "", assignment_id: aid, status: "draft" });
    if (err) { notify.error(err); return false; }
    const lock = monthLockFor(form.work_date);
    if (lock) { notify.error(monthLockMessage(lock)); return false; }
    setCreating(true);
    try {
      // Omit `id` so the backend's uuid.UUID field defaults to uuid.Nil, which
      // Upsert treats as "insert new row" (the server assigns the id and returns
      // it). Sending "" here fails BodyParser under google/uuid v1.6+.
      await api.put(`/assignments/${aid}/worklog`, {
        assignment_id: aid,
        work_date: form.work_date,
        start_time: form.start_time,
        end_time: form.end_time,
        hours: form.hours,
        activity: form.activity,
        parent_kind: form.activity === "other" ? form.parent_kind : null,
        room: form.room ?? "",
        note: form.note ?? "",
      });
      notify.success("เพิ่มรายการเรียบร้อย");
      revalidate();
      return true;
    } catch (e) {
      notify.error(e);
      return false;
    } finally {
      setCreating(false);
    }
  }

  async function deleteRow(id: string) {
    if (!aid) return;
    const target = (logs ?? []).find(l => l.id === id);
    const lock = target ? monthLockFor(target.work_date) : null;
    if (lock) {
      notify.error(monthLockMessage(lock));
      setConfirmDeleteId(null);
      return;
    }
    setDeletingId(id);
    try {
      await api.del(`/assignments/${aid}/worklog/${id}`);
      dropDraft(id);
      notify.success("ลบรายการแล้ว");
      revalidate();
    } catch (e) {
      notify.error(e);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  async function submit() {
    setConfirmSubmit(false);
    if (!aid) return;
    setSubmitting(true);
    try {
      await api.post(`/assignments/${aid}/worklog/submit`);
      // Name the section, and — the point of the whole change — say what is
      // still outstanding elsewhere. This is the moment the TA believes they are
      // finished, so it is the only moment where the reminder lands.
      const others = (assignments ?? []).filter(a => a.id !== aid && a.unsent_count > 0);
      if (showMultiSection && others.length > 0) {
        notify.success(
          `ส่ง sec ${activeAssignment?.sec_no ?? ""} เรียบร้อย ยังเหลือ ` +
          others.map(a => `sec ${a.sec_no} (${a.unsent_count} รายการ)`).join(", ") +
          " ที่ยังไม่ได้ส่ง",
        );
      } else {
        notify.success(
          showMultiSection
            ? `ส่ง sec ${activeAssignment?.sec_no ?? ""} ให้อาจารย์อนุมัติแล้ว`
            : "ส่งให้อาจารย์อนุมัติแล้ว",
        );
      }
      revalidate();
    } catch (e) {
      notify.error(e);
    } finally { setSubmitting(false); }
  }

  // Delete every draft row whose month key is in `months`. Only touches draft
  // status — submitted/approved rows are filtered out here so the backend
  // never sees a request it would reject. No bulk endpoint exists, so we
  // loop sequentially and swallow per-row errors to surface a summary toast.
  async function bulkDelete(months: Set<string>): Promise<void> {
    if (!aid) return;
    const targets = (logs ?? []).filter(
      l => l.status === "draft" && months.has(monthKey(l.work_date)),
    );
    if (targets.length === 0) {
      notify.info("ไม่มีรายการฉบับร่างในเดือนที่เลือก");
      return;
    }
    setBulkDeleting(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const l of targets) {
        try {
          await api.del(`/assignments/${aid}/worklog/${l.id}`);
          ok++;
        } catch {
          failed++;
        }
      }
      setDrafts(prev => {
        const slice = prev[aid];
        if (!slice) return prev;
        const nextSlice = { ...slice };
        for (const l of targets) delete nextSlice[l.id];
        const next = { ...prev };
        if (Object.keys(nextSlice).length === 0) delete next[aid];
        else next[aid] = nextSlice;
        return next;
      });
      if (failed === 0) notify.success(`ลบรายการฉบับร่างแล้ว ${ok} รายการ`);
      else notify.error(`ลบสำเร็จ ${ok} รายการ ล้มเหลว ${failed} รายการ`);
      revalidate();
    } finally {
      setBulkDeleting(false);
      setShowBulkDelete(false);
    }
  }

  // Cached label for the current assignment's section — used in the "กลุ่มเรียน"
  // column so each row echoes which section+track the entry is for. Every row
  // in this view belongs to the active assignment, so the value is constant
  // per render, but showing it in-table matches the payroll document and
  // keeps screenshots self-describing.
  const sectionLabel = activeAssignment
    ? `${activeAssignment.track === "special" ? "พิเศษ" : "ปกติ"} sec ${activeAssignment.sec_no}`
    : "—";

  const columns: DataColumn<WorkLog>[] = [
    {
      id: "work_date", label: "วันที่", sortable: true, isRowHeader: true,
      sortValue: l => view(l).work_date,
      render: l => {
        const w = view(l);
        return rowEditable(w) ? (
          <DatePicker value={w.work_date}
                      onChange={v => patch(l, { work_date: v })}
                      minValue={currentMonthStartIso()}
                      label="วันที่ปฏิบัติงาน" />
        ) : formatWorkDate(w.work_date);
      },
    },
    {
      id: "time", label: "เวลา",
      className: "whitespace-nowrap",
      render: l => {
        const w = view(l);
        return rowEditable(w) ? (
          <div className="flex items-center gap-1">
            <TimePicker value={w.start_time}
                        onChange={v => patch(l, { start_time: v })}
                        label="เวลาเริ่ม" />
            –
            <TimePicker value={w.end_time}
                        onChange={v => patch(l, { end_time: v })}
                        label="เวลาสิ้นสุด" />
          </div>
        ) : `${w.start_time}–${w.end_time}`;
      },
    },
    {
      id: "section", label: "กลุ่มเรียน",
      className: "whitespace-nowrap",
      render: () => sectionLabel,
    },
    {
      id: "hours", label: "จำนวนชั่วโมง",
      className: "whitespace-nowrap",
      render: l => {
        const w = view(l);
        return rowEditable(w) ? (
          <HoursStepper value={w.hours} onChange={v => patch(l, { hours: v })} />
        ) : <span className="tabular">{w.hours.toFixed(1)}</span>;
      },
    },
    {
      id: "activity", label: "กิจกรรม",
      render: l => {
        const w = view(l);
        if (!rowEditable(w)) {
          const label = ACTIVITY_LABEL[w.activity] ?? w.activity;
          if (w.activity === "other" && (w.parent_kind === "lecture" || w.parent_kind === "lab")) {
            return `${label} (${PARENT_KIND_LABEL[w.parent_kind]})`;
          }
          return label;
        }
        const scope = activeAssignment?.reimburse_scope;
        const activityKeys = allowedActivitiesFor(scope);
        const parentKindKeys = allowedParentKindsFor(scope);
        return (
          <div className="flex flex-col gap-1">
            <Select
              value={w.activity}
              onChange={e => {
                const next = e.target.value;
                // When leaving 'other', drop parent_kind so it doesn't stick
                // in the payload and re-trigger the server-side check. When
                // entering 'other', seed parent_kind from what the scope allows.
                patch(l, next === "other"
                  ? { activity: next, parent_kind: parentKindKeys.includes(w.parent_kind as "lecture" | "lab") ? w.parent_kind : parentKindKeys[0] }
                  : { activity: next, parent_kind: null });
              }}
            >
              {activityKeys.map(v => (
                <option key={v} value={v}>{ACTIVITY_LABEL[v]}</option>
              ))}
            </Select>
            {w.activity === "other" && (
              <Select
                value={parentKindKeys.includes(w.parent_kind as "lecture" | "lab") ? (w.parent_kind ?? parentKindKeys[0]) : parentKindKeys[0]}
                onChange={e => patch(l, { parent_kind: e.target.value as "lecture" | "lab" })}
                aria-label="ประเภทกิจกรรมหลัก"
                disabled={parentKindKeys.length === 1}
              >
                {parentKindKeys.map(v => (
                  <option key={v} value={v}>{PARENT_KIND_LABEL[v]}</option>
                ))}
              </Select>
            )}
          </div>
        );
      },
    },
    {
      id: "note", label: "หมายเหตุ",
      render: l => {
        const w = view(l);
        return rowEditable(w) ? (
          <TextInput value={w.note ?? ""}
                     onChange={e => patch(l, { note: e.target.value })} />
        ) : (w.note ?? "");
      },
    },
    {
      id: "status", label: "สถานะ",
      render: l => {
        const w = view(l);
        const canEdit = rowEditable(w);
        // A draft whose period has closed is not a draft any more — nothing will
        // ever move it, and "ฉบับร่าง" reads as work in progress. Say what it
        // actually is, so the row and the banner above tell the same story.
        const forfeited = isEditableStatus(w.status) && !!monthLockFor(w.work_date);
        return (
          <div className="flex items-center gap-1">
            {forfeited ? <Chip tone="neutral">หมดเวลาส่ง</Chip> : <StatusChip status={w.status} />}
            {canEdit && (
              <LockedActionButton
                variant={aidDrafts[l.id] ? "primary" : "ghost"} size="sm"
                onClick={() => saveRow(l)} disabled={savingId === l.id}
                isIconOnly aria-label="บันทึกแถวนี้" title="บันทึกแถวนี้"
              >
                <Save size={13} />
              </LockedActionButton>
            )}
            {canEdit && (
              <LockedActionButton
                variant="ghost" size="sm"
                onClick={() => setConfirmDeleteId(l.id)}
                disabled={deletingId === l.id}
                isIconOnly aria-label="ลบแถวนี้" title="ลบแถวนี้"
              >
                <Trash2 size={13} />
              </LockedActionButton>
            )}
          </div>
        );
      },
    },
  ];

  const showMultiSection = (assignments?.length ?? 0) > 1;
  // Payout is derived from the course student count; staff must fill it before
  // any worklog entry (the server enforces this too — this just guides the TA).
  const needStudentCount = !!course && (course.num_students ?? 0) <= 0;

  // Sections OTHER than the one on screen that still have unsent rows — the
  // thing a TA cannot see from here and therefore forgets.
  const otherUnsent = (assignments ?? []).filter(a => a.id !== aid && a.unsent_count > 0);

  // Term-total hour ceiling for the selected assignment (workload × weeks).
  const selectedAssignment = assignments?.find(a => a.id === aid);
  const termCeiling = selectedAssignment?.term_hour_ceiling ?? 0;
  const usedTermHours = (logs ?? []).filter(l => l.status !== "rejected").reduce((sum, l) => sum + (l.hours ?? 0), 0);
  const remainingTermHours = Math.max(0, termCeiling - usedTermHours);

  return (
    <div>
      <PageHeader
        title="บันทึกเวลาปฏิบัติงาน"
        info={
          <>
            บันทึกชั่วโมงปฏิบัติงานเป็นรายวัน ระบบจะเก็บเป็น <b>ฉบับร่าง</b> จนกว่าจะกด <b>ส่งอนุมัติ</b> ให้อาจารย์พิจารณา
            <br /><br />
            หรือใช้ปุ่ม <b>สร้างอัตโนมัติ</b> เพื่อสร้างรายการจากตารางสอนของ section ทั้งเทอมในครั้งเดียว (ข้ามวันหยุด/สอบให้)
          </>
        }
        actions={
          <>
            {/* <Link href={`/ta/courses/${tcId}`}>
              <Button variant="ghost" size="sm">
                <ChevronLeft size={14} /> ภาพรวมวิชา
              </Button>
            </Link> */}
            {/* No section dropdown here any more — see SectionStrip below. A
                control that only changes which pile the OTHER buttons act on has
                no business sitting among them looking like one of them. */}
            {/* Gone entirely once the section has entered review: a disabled
                button invites a hover looking for the reason, and there is
                nothing the TA can do to re-enable it. */}
            {canAddRows && (
              <LockedActionButton variant="secondary" onClick={() => setShowAdd(true)} disabled={!aid || creating || needStudentCount}>
                <Plus size={14} /> เพิ่มรายการ
              </LockedActionButton>
            )}
            <LockedActionButton
              variant="ghost"
              onClick={() => setShowBulkDelete(true)}
              disabled={!aid || draftCount === 0 || bulkDeleting}
              aria-label="ลบรายการฉบับร่าง"
            >
              <Trash2 size={14} /> ลบฉบับร่าง
            </LockedActionButton>
            <TipWrap
              content={
                !aid
                  ? undefined
                  : !generateAllowed
                  // Generate wipes and recreates the term; the server refuses
                  // once anything is submitted or approved, so say that rather
                  // than let the click fail.
                  ? "มีรายการที่ส่งอนุมัติหรืออนุมัติแล้ว จึงสร้างใหม่ทั้งชุดไม่ได้"
                  : !canGenerate
                  ? "อาจารย์ยังไม่ได้ตั้งตารางสอนของ section นี้ในระบบ จึงยังสร้างอัตโนมัติไม่ได้"
                  : undefined
              }
            >
              <LockedActionButton
                variant="secondary"
                onClick={() => setConfirmGenerate(true)}
                isPending={generating}
                disabled={generating || !aid || !canGenerate || !generateAllowed || needStudentCount}
              >
                <Wand2 size={14} /> สร้างอัตโนมัติ
              </LockedActionButton>
            </TipWrap>
            {/* With several sections the submit button lives on each section's
                card instead: on the toolbar it reads as "submit the course", which
                is what let a TA send one section and believe they were done. */}
            {!showMultiSection && (
              <LockedActionButton
                variant="primary"
                onClick={() => setConfirmSubmit(true)}
                isPending={submitting}
                disabled={submitting || !canSubmit}
              >
                <Send size={14} /> ส่งอนุมัติ
              </LockedActionButton>
            )}
          </>
        }
      />

      {needStudentCount && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            รอเจ้าหน้าที่กรอกจำนวนนักศึกษาของวิชานี้ก่อน จึงจะบันทึกเวลาปฏิบัติงานได้
            (ยอดเบิกจ่ายคำนวณจากจำนวนนักศึกษา)
          </span>
        </div>
      )}

      {/* The budget ran out before the term did. Stated in months, because that
          is the unit the cutoff works in and the only form a TA can act on. */}
      {(unpaidMonths.size > 0 || partialMonths.size > 0) && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            {settlement?.committed?.over_budget
              ? "งบของวิชานี้ไม่พอจ่ายทุกเดือนแล้ว "
              : "ถ้าอาจารย์อนุมัติครบตามที่ลงไว้ งบจะไม่พอ "}
            {partialMonths.size > 0 && (
              <>
                <b>{[...partialMonths].map(formatMonthTH).join(", ")}</b> ได้ไม่ครบทุกคาบ
                {unpaidMonths.size > 0 ? " และ " : " "}
              </>
            )}
            {unpaidMonths.size > 0 && (
              <><b>{[...unpaidMonths].map(formatMonthTH).join(", ")}</b> ไม่ได้รับค่าตอบแทน </>
            )}
            ชั่วโมงยังถูกบันทึกไว้ครบและอาจารย์อนุมัติได้ตามปกติ แต่คาบที่เกินงบจะไม่ถูกนำไปเบิก
            <br /><span className="text-red-900/75">งบเป็นของทั้งวิชา ใช้ร่วมกับ TA คนอื่น ทุกคนถูกตัดที่คาบเดียวกัน ใครสอนคาบไหนก่อนได้ก่อน</span>
          </span>
        </div>
      )}

      {/* Rows whose deadline passed unsent.
          Stated as a settled outcome, not as a problem with a workaround: staff
          decided (03/08/2026) that there is no back-dated submission, so an
          unsent month is a month the TA chose not to claim. The earlier draft of
          this banner pointed at the office, which invited exactly the negotiation
          the rule exists to end. */}
      {strandedRows.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-ink-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ink-3" />
          <span>
            <b>{strandedRows.length} รายการ</b> ในงวดที่ปิดไปแล้ว ({strandedMonths.join(", ")}){" "}
            ไม่ได้ส่งภายในกำหนด <b>ถือว่าไม่ประสงค์ลงเวลา</b> ระบบจะไม่นำมาคิดค่าตอบแทน
            และส่งย้อนหลังไม่ได้
            {submittableCount > 0 && <> ส่วนอีก {submittableCount} รายการในงวดที่ยังเปิดอยู่ ยังกดส่งได้ตามปกติ</>}
          </span>
        </div>
      )}

      {showMultiSection && assignments && (
        <SectionStrip
          assignments={assignments}
          activeId={aid}
          onSelect={setAid}
          onSubmit={() => setConfirmSubmit(true)}
          submitting={submitting}
          canSubmitActive={canSubmit}
        />
      )}

      {termCeiling > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-(--hairline) bg-surface-secondary px-3 py-2 text-sm">
          <Clock size={14} className="text-muted" />
          <span className="text-muted">ชั่วโมงที่ลงได้ทั้งเทอม (ตามภาระงาน):</span>
          <span className="tabular-nums">
            ใช้ไป <b>{usedTermHours.toFixed(2)}</b> / {termCeiling.toFixed(1)} ชม.
          </span>
          <span className={"tabular-nums " + (remainingTermHours <= 0 ? "text-danger font-medium" : "text-success")}>
            · เหลือ {remainingTermHours.toFixed(2)} ชม.
          </span>
        </div>
      )}

      {!approved && (
        <div className="mb-4 text-xs text-muted">
          * ปุ่มบันทึก/ส่งจะปลดล็อกหลังเจ้าหน้าที่อนุมัติเอกสารในโปรไฟล์
        </div>
      )}

      {aid && activeAssignment && !canGenerate && (
        <div className="mb-4">
          <Alert
            status="warning"
            title="ยังไม่มีตารางสอนของ section นี้ในระบบ"
            description="ปุ่ม 'สร้างอัตโนมัติ' ต้องอ่านจากตารางสอน (วันไหน คาบไหน กี่ชั่วโมง) เพื่อสร้างรายการให้อัตโนมัติ กรุณาแจ้งอาจารย์ให้เพิ่มตารางสอนของ section นี้ก่อน หรือใช้ปุ่ม 'เพิ่มรายการ' เพื่อกรอกเอง"
          />
        </div>
      )}

      {assignments && assignments.length === 0 ? (
        <Panel>
          <EmptyState
            title="ยังไม่พบ assignment ในรายวิชานี้"
            description="อาจารย์อาจยังไม่ได้ยืนยันการมอบหมาย หรือคำขอยังอยู่ระหว่างพิจารณา"
          />
        </Panel>
      ) : (
        <>
          {aid && (
            <div className="mb-4">
              <DutySchedulePanels assignmentId={aid} />
            </div>
          )}

          {recovery && recovery.aid === aid && (
            <div className="mb-4">
              <RecoveryBanner
                offer={recovery}
                onAccept={acceptRecovery}
                onDismiss={dismissRecovery}
              />
            </div>
          )}

          {aid && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 text-sm text-foreground bg-surface-secondary border border-[var(--hairline)] px-3 py-1.5 rounded-lg">
                <Clock size={14} className="text-muted" />
                {activeAssignment && showMultiSection && (
                  <>
                    <span>section {activeAssignment.sec_no}</span>
                    <span className="text-muted">·</span>
                  </>
                )}
                <span>รวมชั่วโมงทั้งหมด</span>
                <span className="font-semibold tabular">{totalHours.toFixed(1)}</span>
                <span className="text-muted">ชม.</span>
              </div>
              <WorklogSaveStatus
                busy={autosaveBusy}
                pending={autosavePending}
                savedAgo={savedAgo}
                error={autosaveError}
              />
              {rejectedRows.length > 0 && !showRejection && (
                <button
                  type="button"
                  onClick={() => setShowRejection(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-danger-soft-foreground bg-danger-soft border border-danger-soft-border rounded-md px-2 py-1 hover:opacity-90"
                >
                  <AlertTriangle size={13} />
                  <span>อาจารย์ส่งกลับ {rejectedRows.length} รายการ · ดูเหตุผล</span>
                </button>
              )}
            </div>
          )}

          <MonthlyWorklogView
            rows={logs}
            loading={!!aid && !logs}
            columns={columns}
            termStart={course?.starts_on}
            termEnd={course?.ends_on}
            view={view}
            onQuickAdd={date => { setQuickAddDate(date); setShowAdd(true); }}
            impacts={impacts?.impacts ?? []}
            monthLocks={monthLocks}
            monthDeadlines={monthDeadlines}
            monthsInReview={monthsInReview}
            unpaidMonths={unpaidMonths}
            partialMonths={partialMonths}
            tcId={tcId}
            sectionId={activeAssignment?.section_id}
          />
        </>
      )}

      <Modal
        open={showRejection}
        onClose={dismissRejection}
        title="อาจารย์ส่งบันทึกเวลากลับให้แก้ไข"
        icon={<AlertTriangle size={18} />}
        size="md"
        footer={
          <div className="flex justify-between gap-2 w-full">
            <Button
              variant="danger-soft"
              onClick={deleteAllRejected}
              isPending={deletingRejected}
              disabled={deletingRejected}
            >
              <Trash2 size={14} /> ลบทั้งหมด ({rejectedRows.length})
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={dismissRejection} disabled={deletingRejected}>ปิด</Button>
              <Button variant="primary" onClick={dismissRejection} disabled={deletingRejected}>
                <Pencil size={14} /> แก้ไขในตาราง
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="text-sm">
            อาจารย์ส่งบันทึกเวลา <span className="font-semibold">{rejectedRows.length}</span> รายการกลับให้แก้ไข พร้อมกับเหตุผลด้านล่าง
          </div>
          <div className="rounded-lg border border-warning-soft-border bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground whitespace-pre-wrap">
            {rejectReason || "(อาจารย์ไม่ได้ระบุเหตุผล)"}
          </div>
          <div className="text-xs text-muted">
            คุณสามารถ:
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>กด <b>แก้ไขในตาราง</b> เพื่อกลับไปแก้ไขรายการที่ถูกปฏิเสธในตารางด้านล่าง แล้วส่งอนุมัติใหม่</li>
              <li>กด <b>ลบทั้งหมด</b> เพื่อลบรายการที่ถูกปฏิเสธออก แล้วสร้างขึ้นใหม่ (เช่น กด &quot;สร้างอัตโนมัติ&quot; อีกครั้ง)</li>
            </ul>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={navGuard.pendingHref !== null}
        onClose={navGuard.cancel}
        onConfirm={navGuard.confirm}
        danger
        title="ทิ้งการแก้ไขที่ยังไม่ได้บันทึก?"
        confirmLabel="ออกโดยไม่บันทึก"
        cancelLabel="อยู่หน้านี้ต่อ"
        message="ข้อมูลที่ยังไม่ได้บันทึกจะเก็บไว้ในเครื่องนี้ และจะเจอเมื่อกลับมาที่หน้านี้อีกครั้ง"
      />

      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={submit}
        isPending={submitting}
        title="ส่งบันทึกเวลาให้อาจารย์อนุมัติ"
        confirmLabel={`ส่งอนุมัติ (${submittableCount} รายการ)`}
        message={
          /* The last screen before an irreversible hand-off, so it spells out the
             scope: which section is going, and which sections are staying behind.
             "ทั้งหมด" in the old copy was true of one section and read as true of
             the course. */
          <div className="space-y-2 text-sm">
            <p className="text-muted">
              {showMultiSection && activeAssignment ? (
                <>
                  จะส่งเฉพาะ{" "}
                  <b className="font-medium text-foreground">
                    sec {activeAssignment.sec_no} ({activeAssignment.track === "special" ? "พิเศษ" : "ปกติ"})
                  </b>{" "}
                  จำนวน {submittableCount} รายการ ให้อาจารย์พิจารณา
                </>
              ) : (
                <>จะส่งรายการฉบับร่างและรายการที่ไม่ผ่านทั้งหมด {submittableCount} รายการให้อาจารย์พิจารณา</>
              )}
              {" "}เมื่อส่งแล้วจะแก้ไขไม่ได้จนกว่าอาจารย์จะพิจารณา
            </p>
            {hasUnsaved && (
              <p className="text-amber-700">
                มีรายการที่แก้ไขแล้วแต่ยังไม่ได้บันทึก จะไม่ถูกส่งไปด้วย โปรดบันทึกก่อนหากต้องการรวมไปด้วย
              </p>
            )}
            {otherUnsent.length > 0 && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800">
                กลุ่มอื่นจะไม่ถูกส่งไปด้วย —{" "}
                {otherUnsent.map(a => `sec ${a.sec_no} (${a.unsent_count} รายการ)`).join(", ")}{" "}
                ต้องกดส่งแยกอีกครั้ง
              </p>
            )}
          </div>
        }
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => { if (confirmDeleteId) deleteRow(confirmDeleteId); }}
        isPending={deletingId !== null}
        danger
        title="ลบรายการบันทึกเวลา"
        confirmLabel="ลบรายการ"
        message="ต้องการลบรายการนี้หรือไม่? การลบจะมีผลทันทีและไม่สามารถย้อนกลับได้"
      />

      <ConfirmDialog
        open={confirmGenerate}
        onClose={() => setConfirmGenerate(false)}
        onConfirm={generate}
        isPending={generating}
        danger={draftCount > 0}
        title="สร้างตารางบันทึกเวลาอัตโนมัติ"
        confirmLabel="สร้างอัตโนมัติ"
        message={
          draftCount > 0
            ? `ระบบจะสร้างรายการจากตารางสอนของ section นี้ทั้งเทอม โดยจะเขียนทับ draft ที่มีอยู่ ${draftCount} รายการ ต้องการดำเนินการต่อหรือไม่?`
            : "ระบบจะสร้างรายการบันทึกเวลาจากตารางสอนของ section นี้ทั้งเทอมให้อัตโนมัติ (ข้ามวันหยุดที่อาจารย์ยังไม่ระบุวันชดเชย) ต้องการดำเนินการต่อหรือไม่?"
        }
      />

      <AddWorklogModal
        open={showAdd}
        onClose={() => { setShowAdd(false); setQuickAddDate(null); }}
        onSave={async form => {
          const ok = await createRow(form);
          if (ok) { setShowAdd(false); setQuickAddDate(null); }
        }}
        isPending={creating}
        scope={activeScope}
        sectionNo={activeAssignment?.sec_no}
        sectionTrack={activeAssignment?.track}
        defaultDate={quickAddDate}
        // Months that cannot take a new row, so the dialog can say so on the
        // date field instead of letting the save round-trip and fail. Closed
        // periods and months already in review are refused by Upsert.
        blockedMonth={(iso: string) => {
          const lock = monthLockFor(iso);
          if (lock) return monthLockMessage(lock);
          if (monthsInReview.has((iso ?? "").slice(0, 7))) {
            return "เดือนนี้ส่งอนุมัติหรืออนุมัติไปแล้ว เพิ่มรายการใหม่ในเดือนนี้ไม่ได้";
          }
          return null;
        }}
        impacts={impacts?.impacts ?? []}
        sectionId={activeAssignment?.section_id}
        tcId={tcId}
        weeklyCaps={activeAssignment ? {
          lecture: activeAssignment.weekly_cap_lecture,
          lab: activeAssignment.weekly_cap_lab,
          review: activeAssignment.weekly_cap_review,
          other: activeAssignment.weekly_cap_other,
          lectureLabShared: activeAssignment.weekly_lecture_lab_shared,
          capsSet: activeAssignment.weekly_caps_set,
        } : undefined}
        existingLogs={logs}
        sectionSchedules={
          course?.sections?.find(s => s.id === activeAssignment?.section_id)?.schedules
        }
        userId={userId}
        aid={aid}
      />

      <BulkDeleteModal
        open={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        isPending={bulkDeleting}
        rows={logs ?? []}
        onConfirm={bulkDelete}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* RecoveryBanner — surfaces stored drafts from a previous session and lets    */
/* the TA restore or discard them explicitly. Kept dumb (props-only) so the    */
/* page owns all persistence side-effects.                                     */
/* -------------------------------------------------------------------------- */

interface RecoveryBannerProps {
  offer: {
    restorable: WorkLog[];
    dropped: number;
    savedAt: number;
  };
  onAccept: () => void;
  onDismiss: () => void;
}

// formatSavedAgo renders a Thai relative time — "เมื่อ 2 ชม.ที่แล้ว" — so
// the TA has a sense of freshness without needing to read a timestamp.
function formatSavedAgo(savedAt: number): string {
  const diff = Math.max(0, Date.now() - savedAt);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "เมื่อสักครู่";
  if (min < 60) return `เมื่อ ${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `เมื่อ ${hr} ชม.ที่แล้ว`;
  const day = Math.floor(hr / 24);
  return `เมื่อ ${day} วันที่แล้ว`;
}

// WorklogSaveStatus is the compact pill next to "รวมชั่วโมงทั้งหมด" that
// tells the TA whether their edits are safe. Four states, distinguished by
// icon + color so the meaning reads at a glance:
//   error   → last autosave attempt failed; will retry on next edit
//   busy    → API round-trip in flight
//   pending → dirty local edits queued, waiting for the debounce
//   saved   → nothing dirty; last save timestamp
function WorklogSaveStatus({
  busy, pending, savedAgo, error,
}: {
  busy: boolean;
  pending: boolean;
  savedAgo: string;
  error: string | null;
}) {
  if (error && !pending && !busy) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-danger-soft-foreground bg-danger-soft border border-danger-soft-border rounded-md px-2 py-1"
        title={error}
      >
        <CloudOff size={13} />
        <span className="truncate max-w-[16rem]">บันทึกอัตโนมัติไม่สำเร็จ แก้ไขอีกครั้งเพื่อลองใหม่</span>
      </span>
    );
  }
  if (busy) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <Cloud size={13} className="animate-pulse" />
        <span>กำลังบันทึกอัตโนมัติ…</span>
      </span>
    );
  }
  if (pending) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-muted"
        title="ระบบจะบันทึกอัตโนมัติเมื่อไม่มีการแก้ไขต่อเนื่อง 30 วินาที (ระหว่างนี้ร่างถูกเก็บในเครื่องแล้ว)"
      >
        <Cloud size={13} />
        <span>กำลังจะบันทึกอัตโนมัติ…</span>
      </span>
    );
  }
  if (savedAgo) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <Check size={13} className="text-success" />
        <span>บันทึกล่าสุด {savedAgo}</span>
      </span>
    );
  }
  return null;
}

function RecoveryBanner({ offer, onAccept, onDismiss }: RecoveryBannerProps) {
  const { restorable, dropped } = offer;
  const n = restorable.length;
  const detail =
    dropped > 0
      ? `กู้คืนได้ ${n} จาก ${n + dropped} รายการ (${dropped} รายการถูกลบไปแล้ว)`
      : `${n} รายการ`;
  return (
    <Alert
      status="warning"
      icon={<AlertTriangle size={14} />}
      title="พบการแก้ไขที่ยังไม่ได้บันทึกจากครั้งก่อน"
      description={
        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted">
            {detail} · {formatSavedAgo(offer.savedAt)}
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={onAccept} disabled={n === 0}>
              กู้คืน
            </Button>
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              ทิ้ง
            </Button>
          </div>
        </div>
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/* AddWorklogModal — form for manually creating a single work_log entry.       */
/* Kept in-file because the form's field set is tightly coupled to WorkLog.    */
/* -------------------------------------------------------------------------- */

interface AddWorklogModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (form: NewWorkLog) => void | Promise<void>;
  isPending: boolean;
  // Scope + section come from the TA's assignment — used to restrict which
  // activity types the form offers and to surface the section context in the
  // modal header so the TA knows which slot they're logging under.
  scope?: Scope;
  sectionNo?: string;
  sectionTrack?: string;
  // defaultDate seeds the work_date field. null → fall back to today. Set by
  // the per-month "+ เพิ่มในเดือนนี้" affordance so a click on July opens the
  // form pre-scoped to July 1st instead of today.
  defaultDate?: string | null;
  // Holiday impacts + section context let the modal surface an inline error
  // when the user picks a date that will get rejected by the server (holiday,
  // no makeup, moved elsewhere). tcId is used to link to the holidays page.
  impacts?: HolidayImpact[];
  sectionId?: string;
  tcId?: string;
  // Returns why a date's MONTH cannot take a new row, or null when it can. The
  // rules live on the server (assertWorklogWritable / Upsert); this reports them
  // on the field instead of after a failed round-trip.
  blockedMonth?: (iso: string) => string | null;
  // Weekly-cap context so the modal can preflight-limit hour entry to what
  // the lecturer's workload declaration allows. capsSet=false means no
  // workload form yet → skip enforcement UI. existingLogs is the current
  // assignment's worklog list, used to compute this week's running total.
  weeklyCaps?: {
    lecture: number;
    lab: number;
    review: number;
    other: number;
    lectureLabShared: boolean;
    capsSet: boolean;
  };
  existingLogs?: WorkLog[];
  // Section's weekly time slots — used to prefill start/end times to the
  // natural class period when the TA picks lecture or lab.
  sectionSchedules?: SectionScheduleSlot[];
  // Namespace + selector for draftStorage.readAddForm/writeAddForm so a
  // half-filled form survives a modal close / page reload. When userId or
  // aid are empty (e.g. modal opens before /me resolves) persistence is a
  // no-op — better than persisting under a broken key.
  userId?: string;
  aid?: string;
}

// StoredAddFormData mirrors NewWorkLog + hoursTouched so the auto-derive
// behavior is preserved on restore (a TA who hand-set 4.5 shouldn't have it
// recomputed from time span the moment they hit "ใช้ต่อ"). Kept as a
// dedicated shape so a future NewWorkLog rename doesn't silently break the
// stored payload.
interface StoredAddFormData {
  workDate: string;
  start: string;
  end: string;
  hours: number;
  hoursTouched: boolean;
  activity: string;
  parentKind: "lecture" | "lab";
  note: string;
}

// Default the date field to today so a common "log today's hours" flow needs
// no date typing. `toISOString` would use UTC and drift the day for tz East of
// UTC (Bangkok = +7), so build the string from the local Date parts instead.
function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Round a raw hour count to the nearest 0.5 so the auto-derived value matches
// what the number input's step allows the user to enter.
function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

// defaultTimesForActivity picks a sensible start/end pair based on the
// section's weekly schedule for the activity kind the TA is logging. If the
// section has multiple slots for the same kind (e.g., Mon 9-11 and Wed 13-15),
// prefer the one whose day-of-week matches workDate — else fall back to the
// earliest slot. Returns null when there's no matching schedule so the caller
// can keep the previous values.
function defaultTimesForActivity(
  activity: string,
  schedules: SectionScheduleSlot[] | undefined,
  workDate: string,
): { start: string; end: string } | null {
  if (!schedules || schedules.length === 0) return null;
  // Only lecture/lab have a natural class-period default. review/makeup/other
  // are TA-driven so we don't overwrite whatever they set.
  const targetKind = activity === "lecture" ? "lecture" : activity === "lab" ? "lab" : null;
  if (!targetKind) return null;
  const matches = schedules.filter(s => s.kind === targetKind);
  if (matches.length === 0) return null;
  let pick = matches[0];
  const [y, m, d] = (workDate ?? "").split("-").map(Number);
  if (y && m && d) {
    const dow = new Date(y, m - 1, d).getDay();
    const sameDay = matches.find(s => s.day_of_week === dow);
    if (sameDay) pick = sameDay;
  }
  // section_schedules stores time as "HH:MM:SS" — the TimePicker binds to
  // "HH:MM" so trim the trailing seconds.
  return {
    start: (pick.start_time ?? "").slice(0, 5),
    end: (pick.end_time ?? "").slice(0, 5),
  };
}

function AddWorklogModal({
  open, onClose, onSave, isPending, scope, sectionNo, sectionTrack, defaultDate,
  impacts, sectionId, tcId, blockedMonth, weeklyCaps, existingLogs, sectionSchedules,
  userId, aid,
}: AddWorklogModalProps) {
  // Per-date lookup rebuilt only when impacts/section change — cheap since the
  // impacts list is capped to the term's holidays (< a dozen typically).
  const dateIndex = useMemo(() => buildDateIndex(impacts, sectionId), [impacts, sectionId]);
  // Cache the allowed key lists per render — the caller usually doesn't switch
  // scope mid-modal, but we still recompute so a section switch behind the
  // modal doesn't leave stale options showing.
  const activityKeys = allowedActivitiesFor(scope);
  const parentKindKeys = allowedParentKindsFor(scope);
  // Sensible default activity given the scope: lecture-scope → บรรยาย,
  // lab-scope → ปฏิบัติการ, both → บรรยาย (first option).
  const defaultActivity = activityKeys[0] ?? "lecture";
  const defaultParentKind = parentKindKeys[0] ?? "lecture";

  const [workDate, setWorkDate] = useState(todayISO());
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  // hoursTouched: once the user manually edits the hours field, we stop
  // auto-syncing it from the start/end span so a deliberate override sticks.
  const [hoursTouched, setHoursTouched] = useState(false);
  const [hours, setHours] = useState(1);
  const [activity, setActivity] = useState<string>(defaultActivity);
  const [parentKind, setParentKind] = useState<"lecture" | "lab">(defaultParentKind);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Weekly quota derived from the assignment's workload declaration. The
  // running total is computed from existingLogs so no extra fetch is needed —
  // the parent already loads the full list for the table. When no cap is
  // configured (workload form unfilled, or activity has 0 hrs declared) we
  // fall back to MAX_ROW_HOURS so the stepper still lets the TA type.
  const weeklyInfo = useMemo(() => {
    if (!weeklyCaps || !weeklyCaps.capsSet) return null;
    const capFor = (a: string): number => {
      switch (a) {
        case "lecture": return weeklyCaps.lecture;
        case "lab":     return weeklyCaps.lab;
        case "review":  return weeklyCaps.review;
        case "other":   return weeklyCaps.other;
        default:        return 0; // makeup — no weekly cap enforced
      }
    };
    const cap = capFor(activity);
    if (cap <= 0) return null;
    const used = weeklyUsedHours(
      existingLogs, workDate, activity, weeklyCaps.lectureLabShared,
    );
    const remaining = Math.max(0, cap - used);
    const shared = weeklyCaps.lectureLabShared && (activity === "lecture" || activity === "lab");
    return {
      cap,
      used,
      remaining,
      // labelTH describes what the cap covers so the hint text can be
      // specific ("ช่วยสอน (บรรยาย+ปฏิบัติ)" for grad shared, else per-kind).
      labelTH: shared
        ? "ช่วยสอน (บรรยาย+ปฏิบัติการ)"
        : ACTIVITY_LABEL[activity] ?? activity,
    };
  }, [weeklyCaps, existingLogs, workDate, activity]);

  // Effective max the stepper will allow. MAX_ROW_HOURS is the hard per-row
  // ceiling; when a weekly quota is in play we further clamp to how much is
  // left this week so the TA can't over-enter and get a 400 on save.
  const effectiveMax = weeklyInfo
    ? Math.min(MAX_ROW_HOURS, weeklyInfo.remaining)
    : MAX_ROW_HOURS;

  // recovered holds the last-persisted form (if any) from a prior modal
  // session that was closed without saving. Read once on open so the debounced
  // write below doesn't clobber it while the TA decides. Cleared once acted on.
  const [recovered, setRecovered] = useState<StoredAddFormData | null>(null);
  // dirty flips true on the first real field interaction. Guards the
  // debounced write from persisting the freshly-reset defaults over the
  // recovered form.
  const [dirty, setDirty] = useState(false);

  // Reset every time the modal (re)opens so a previous entry doesn't leak in.
  useEffect(() => {
    if (!open) return;
    setWorkDate(defaultDate ?? todayISO());
    setStart("09:00");
    setEnd("10:00");
    setHoursTouched(false);
    setHours(1);
    setActivity(defaultActivity);
    setParentKind(defaultParentKind);
    setNote("");
    setError(null);
    setDirty(false);
    // Pull any recovery candidate straight from storage. Don't auto-apply —
    // surface the choice in the banner so an accidental leftover from a
    // different day doesn't silently overwrite the TA's fresh input.
    if (userId && aid) {
      const stored = readAddForm<StoredAddFormData>(userId, aid);
      setRecovered(stored?.form ?? null);
    } else {
      setRecovered(null);
    }
    // Intentionally re-run on scope + defaultDate changes too, since defaults
    // depend on both.
  }, [open, defaultActivity, defaultParentKind, defaultDate, userId, aid]);

  // Debounced persistence — only fires once the TA actually starts editing,
  // so the "just opened, hasn't chosen yet" state can't overwrite the
  // recovered snapshot. Cleared on save + on explicit ล้าง in the banner.
  useEffect(() => {
    if (!open || !dirty || !userId || !aid) return;
    const t = window.setTimeout(() => {
      const payload: StoredAddFormData = {
        workDate, start, end, hours, hoursTouched, activity, parentKind, note,
      };
      writeAddForm<StoredAddFormData>(userId, aid, payload);
    }, 400);
    return () => window.clearTimeout(t);
  }, [open, dirty, userId, aid, workDate, start, end, hours, hoursTouched, activity, parentKind, note]);

  function markDirty() { if (!dirty) setDirty(true); }
  function applyRecovered() {
    if (!recovered) return;
    setWorkDate(recovered.workDate);
    setStart(recovered.start);
    setEnd(recovered.end);
    setHours(recovered.hours);
    setHoursTouched(recovered.hoursTouched);
    setActivity(recovered.activity);
    setParentKind(recovered.parentKind);
    setNote(recovered.note);
    setDirty(true); // recovered content is worth persisting again
    setRecovered(null);
  }
  function discardRecovered() {
    if (userId && aid) clearAddForm(userId, aid);
    setRecovered(null);
  }

  // Auto-derive hours from the time span while the user hasn't manually
  // overridden it — matches the "generate" flow's behavior and avoids the
  // "hours doesn't match span" server error for the common case. Clamp to
  // effectiveMax so an auto-derived value never exceeds the weekly quota.
  useEffect(() => {
    if (hoursTouched) return;
    const s = parseHM(start);
    const e = parseHM(end);
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return;
    const raw = (e - s) / 60;
    const rounded = Math.max(0, Math.min(effectiveMax, roundHalf(raw)));
    setHours(rounded);
  }, [start, end, hoursTouched, effectiveMax]);

  // Prefill start/end from the section's weekly schedule whenever the TA
  // picks a lecture/lab activity (or opens the modal on such an activity).
  // The user's message: "each activity has its own class period — just make
  // that the default, TA will edit if wrong." We reset hoursTouched too so
  // the hours auto-derive from the new span.
  useEffect(() => {
    if (!open) return;
    const times = defaultTimesForActivity(activity, sectionSchedules, workDate);
    if (!times) return;
    setStart(times.start);
    setEnd(times.end);
    setHoursTouched(false);
  }, [open, activity, workDate, sectionSchedules]);

  // If the user picks a new activity whose remaining quota is smaller than
  // the current hours, pull the value down so the stepper's displayed number
  // matches what the +/− buttons will actually allow.
  useEffect(() => {
    if (hours > effectiveMax) setHours(effectiveMax);
  }, [effectiveMax, hours]);

  function handleSave() {
    const form: NewWorkLog = {
      work_date: workDate,
      start_time: start,
      end_time: end,
      hours,
      activity,
      parent_kind: activity === "other" ? parentKind : null,
      room: "",
      note: note.trim(),
    };
    // Reuse the same validator the inline-edit path uses so both flows enforce
    // identical rules client-side.
    const err = validateRow({
      ...form, id: "", assignment_id: "__new__", status: "draft",
    });
    if (err) { setError(err); return; }
    // The month has to be able to accept the row at all — checked before the
    // quota, because "this month is closed" makes the quota moot.
    const monthErr = blockedMonth?.(workDate);
    if (monthErr) { setError(monthErr); return; }
    // Weekly quota preflight — mirrors the server-side enforceWeeklyActivityCap
    // check. Gives the TA a clear reason before hitting the network.
    if (weeklyInfo && hours > weeklyInfo.remaining + 0.01) {
      setError(
        `เกินโควตา ${weeklyInfo.labelTH} ประจำสัปดาห์ (${weeklyInfo.cap.toFixed(1)} ชม./สัปดาห์) สัปดาห์นี้เหลือ ${weeklyInfo.remaining.toFixed(2)} ชม.`,
      );
      return;
    }
    setError(null);
    // Optimistic clear: the parent's onSave awaits the API; either it
    // succeeds (row is created — no reason to keep the modal draft) or it
    // fails and the modal stays open with the form state still in React —
    // the debounced write below will re-populate storage from the retry.
    if (userId && aid) clearAddForm(userId, aid);
    onSave(form);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="เพิ่มรายการบันทึกเวลา"
      icon={<Plus size={18} />}
      size="lg"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>ยกเลิก</Button>
          <Button variant="primary" onClick={handleSave} isPending={isPending} disabled={isPending}>
            <Save size={14} /> บันทึกรายการ
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {(sectionNo || scope) && (
          <div className="rounded-lg bg-surface-secondary border border-(--hairline) px-3 py-2 text-xs text-muted flex flex-wrap items-center gap-x-3 gap-y-1">
            {sectionNo && (
              <span>
                กำลังลงเวลาให้ <span className="font-semibold text-foreground">section {sectionNo}</span>
                {sectionTrack ? ` (${sectionTrack === "special" ? "ภาคพิเศษ" : "ภาคปกติ"})` : ""}
              </span>
            )}
            {scope && (
              <span>
                · ขอบเขตจากคำขอของอาจารย์: <span className="font-semibold text-foreground">{SCOPE_LABEL[scope]}</span>
              </span>
            )}
          </div>
        )}

        {recovered && (
          <Alert
            status="accent"
            icon={<AlertTriangle size={14} />}
            title="พบร่างจากครั้งก่อน"
            description={
              <div className="flex gap-2 mt-1">
                <Button variant="primary" size="sm" onClick={applyRecovered}>ใช้ต่อ</Button>
                <Button variant="ghost" size="sm" onClick={discardRecovered}>ล้าง</Button>
              </div>
            }
          />
        )}

        {/* Activity comes first — hours limits and even which time makes sense
            depend on which activity kind the TA is logging, so we ask for it
            up-front instead of letting them fill time and discover a cap
            violation on save. */}
        <div className={activity === "other" ? "grid grid-cols-2 gap-3" : ""}>
          <FieldGroup label="ประเภทกิจกรรม">
            <Select
              value={activity}
              onChange={e => {
                markDirty();
                const next = e.target.value;
                setActivity(next);
                // Reset parent-kind to a scope-legal value when entering
                // "อื่นๆ" so an unauthorized value can't leak through.
                if (next === "other" && !parentKindKeys.includes(parentKind)) {
                  setParentKind(defaultParentKind);
                }
              }}
            >
              {activityKeys.map(v => (
                <option key={v} value={v}>{ACTIVITY_LABEL[v]}</option>
              ))}
            </Select>
          </FieldGroup>
          {activity === "other" && (
            <FieldGroup
              label="ประเภทกิจกรรมหลัก"
              hint={parentKindKeys.length === 1 ? "ล็อกไว้ตามขอบเขตของคำขอ" : undefined}
            >
              <Select
                value={parentKindKeys.includes(parentKind) ? parentKind : defaultParentKind}
                onChange={e => { markDirty(); setParentKind(e.target.value as "lecture" | "lab"); }}
                disabled={parentKindKeys.length === 1}
              >
                {parentKindKeys.map(v => (
                  <option key={v} value={v}>{PARENT_KIND_LABEL[v]}</option>
                ))}
              </Select>
            </FieldGroup>
          )}
        </div>

        {weeklyInfo && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs flex flex-wrap items-center gap-x-3 gap-y-1 ${
              weeklyInfo.remaining <= 0
                ? "border-danger-soft-border bg-danger-soft text-danger-soft-foreground"
                : weeklyInfo.remaining < 1
                  ? "border-warning-soft-border bg-warning-soft text-warning-soft-foreground"
                  : "border-(--hairline) bg-surface-secondary text-muted"
            }`}
          >
            <span>
              โควตา <span className="font-semibold">{weeklyInfo.labelTH}</span>{" "}
              {weeklyInfo.cap.toFixed(1)} ชม./สัปดาห์
            </span>
            <span>· ใช้ไปแล้ว <span className="font-semibold tabular">{weeklyInfo.used.toFixed(2)}</span> ชม.</span>
            <span>· เหลือ <span className="font-semibold tabular">{weeklyInfo.remaining.toFixed(2)}</span> ชม.</span>
          </div>
        )}

        <FieldGroup label="วันที่ปฏิบัติงาน">
          <DatePicker
            value={workDate}
            onChange={v => { markDirty(); setWorkDate(v); }}
            minValue={currentMonthStartIso()}
            label="วันที่ปฏิบัติงาน"
            autoFocus
          />
        </FieldGroup>

        <HolidayHint
          workDate={workDate}
          startTime={start}
          endTime={end}
          activity={activity}
          parentKind={parentKind}
          dateIndex={dateIndex}
          tcId={tcId}
        />

        {/* Two times fit a phone row; the third field does not. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <FieldGroup label="เวลาเริ่ม">
            <TimePicker value={start} onChange={v => { markDirty(); setStart(v); }} label="เวลาเริ่ม" />
          </FieldGroup>
          <FieldGroup label="เวลาสิ้นสุด">
            <TimePicker value={end} onChange={v => { markDirty(); setEnd(v); }} label="เวลาสิ้นสุด" />
          </FieldGroup>
          <FieldGroup
            label="จำนวนชั่วโมง"
            hint={
              weeklyInfo
                ? `สูงสุด ${effectiveMax.toFixed(1)} ชม. (เหลือในสัปดาห์นี้)`
                : `คำนวณให้อัตโนมัติ (สูงสุด ${MAX_ROW_HOURS} ชม.)`
            }
          >
            <HoursStepper
              value={hours}
              onChange={v => { markDirty(); setHoursTouched(true); setHours(v); }}
              max={effectiveMax}
              fullWidth
            />
          </FieldGroup>
        </div>

        <FieldGroup label="หมายเหตุ (ระบุก็ได้)">
          <TextInput value={note} onChange={e => { markDirty(); setNote(e.target.value); }} placeholder="รายละเอียดเพิ่มเติม" />
        </FieldGroup>

        {error && (
          <Alert status="danger" icon={<AlertTriangle size={14} />} title={error} />
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* BulkDeleteModal — pick which months (or "all") to purge draft rows from.    */
/* Only offered when there is at least one draft; submitted/approved rows are  */
/* filtered out both from the list shown here and from the delete loop upstream*/
/* so the backend never sees a request it would reject.                        */
/* -------------------------------------------------------------------------- */

function BulkDeleteModal({
  open, onClose, isPending, rows, onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  isPending: boolean;
  rows: WorkLog[];
  onConfirm: (months: Set<string>) => void | Promise<void>;
}) {
  // Bucket draft-only rows by month so the list shows exactly what will be
  // deletable — non-draft rows are invisible here to avoid a checkbox next
  // to "0 รายการ" that would confuse the TA.
  const monthCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.status !== "draft") continue;
      const k = monthKey(r.work_date);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset selection whenever the modal (re)opens so a previous confirmation
  // doesn't leak into the next.
  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  const allKeys = monthCounts.map(([k]) => k);
  const allSelected = allKeys.length > 0 && allKeys.every(k => selected.has(k));
  const totalSelected = monthCounts.reduce(
    (sum, [k, n]) => sum + (selected.has(k) ? n : 0),
    0,
  );

  function toggle(k: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allKeys));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ลบรายการฉบับร่าง"
      icon={<Trash2 size={18} />}
      size="lg"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>ยกเลิก</Button>
          <Button
            variant="danger"
            onClick={() => onConfirm(selected)}
            isPending={isPending}
            disabled={isPending || totalSelected === 0}
          >
            <Trash2 size={14} /> ลบ {totalSelected} รายการ
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Alert
          status="warning"
          icon={<AlertTriangle size={14} />}
          title="ลบเฉพาะรายการฉบับร่าง"
          description="รายการที่ส่งอนุมัติ/อนุมัติแล้วจะไม่ถูกลบ และการลบไม่สามารถย้อนกลับได้"
        />

        {monthCounts.length === 0 ? (
          <div className="text-sm text-muted text-center py-6">
            ไม่มีรายการฉบับร่างให้ลบ
          </div>
        ) : (
          <>
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-secondary border border-(--hairline) cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 accent-accent"
              />
              <span className="text-sm font-medium">
                ลบทั้งหมด ({monthCounts.reduce((s, [, n]) => s + n, 0)} รายการ)
              </span>
            </label>
            <div className="flex flex-col gap-1">
              {monthCounts.map(([k, n]) => (
                <label
                  key={k}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-surface-secondary border border-(--hairline) cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(k)}
                      onChange={() => toggle(k)}
                      className="h-4 w-4 accent-accent"
                    />
                    <span className="text-sm">{formatMonthTH(k)}</span>
                  </span>
                  <span className="text-xs text-muted">{n} รายการ</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* SectionStrip — one card per section the TA holds on this course             */
/* -------------------------------------------------------------------------- */

/**
 * A TA can assist several sections of one course, and EVERY action on this page
 * — add, auto-generate, delete drafts, submit — is scoped to one of them. That
 * used to be expressed by a single dropdown sitting among the action buttons,
 * which reads as a view filter rather than "you have two separate jobs here":
 * the other section was invisible until you opened the menu, its state was
 * invisible even then, and after submitting one the screen looked finished.
 *
 * So each section gets a card carrying its own state — and, crucially, its own
 * submit button. While the submit button sits on the shared toolbar it will read
 * as "submit the course" no matter how it is labelled; moving it onto the card
 * makes its scope self-evident, and TWO submit buttons say "submit twice" better
 * than any sentence could.
 *
 * Sized for the real data: TAs hold 2 sections (9 cases) or 3 (1 case), and no
 * course has more than 4 — a horizontal strip fits without wrapping games.
 */
function SectionStrip({
  assignments, activeId, onSelect, onSubmit, submitting, canSubmitActive,
}: {
  assignments: Assignment[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Opens the confirm dialog for the ACTIVE section. */
  onSubmit: () => void;
  submitting: boolean;
  canSubmitActive: boolean;
}) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2 text-sm text-muted">
        <LayoutGrid size={15} className="shrink-0" />
        <span>
          วิชานี้คุณดูแล <b className="font-medium text-foreground">{assignments.length} กลุ่ม</b>{" "}
          บันทึกเวลาและส่งอนุมัติ <b className="font-medium text-foreground">แยกกันแต่ละกลุ่ม</b>
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {assignments.map(a => {
          const active = a.id === activeId;
          const used = a.hours_logged ?? 0;
          const ceiling = a.term_hour_ceiling ?? 0;
          const pct = ceiling > 0 ? Math.min(100, (used / ceiling) * 100) : 0;
          return (
            <div
              key={a.id}
              className={
                "rounded-xl bg-surface p-3 transition-colors " +
                (active
                  ? "border-2 border-[var(--brand)]"
                  : "border border-[var(--hairline)] hover:border-[var(--ink-3)]")
              }
            >
              {/* The whole card is the switch target, not just a link: the card
                  IS the section, and a small hit area on a card-sized object is
                  the kind of thing people miss. */}
              <button
                type="button"
                onClick={() => onSelect(a.id)}
                className="w-full text-left"
                aria-current={active ? "true" : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={"text-sm font-medium " + (active ? "" : "text-muted")}>
                    sec {a.sec_no} · {a.track === "special" ? "พิเศษ" : "ปกติ"}
                  </span>
                  {active && <Chip tone="brand">กำลังดู</Chip>}
                </div>

                <div className="mt-1.5 text-sm">
                  <SectionStateLine a={a} />
                </div>

                {ceiling > 0 && (
                  <>
                    <div className="mt-1 text-xs text-muted tabular">
                      {used.toFixed(1)} / {ceiling.toFixed(1)} ชม.
                    </div>
                    <div className="mt-1.5 h-1 rounded-full bg-surface-secondary overflow-hidden">
                      <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </>
                )}
              </button>

              <div className="mt-2.5">
                {active ? (
                  <LockedActionButton
                    variant="primary"
                    size="sm"
                    className="w-full"
                    onClick={onSubmit}
                    isPending={submitting}
                    disabled={submitting || !canSubmitActive}
                  >
                    <Send size={13} /> ส่งอนุมัติ sec {a.sec_no}
                  </LockedActionButton>
                ) : a.unsent_count > 0 && a.submittable_count === 0 ? (
                  // Nothing here can be sent any more, so the card offers the
                  // step that CAN move it instead of a button that cannot.
                  <div className="rounded-md border border-border bg-surface-secondary px-2 py-1.5 text-center text-[11px] leading-tight text-ink-3">
                    ไม่ประสงค์ลงเวลา (เลยกำหนดแล้ว)
                  </div>
                ) : (
                  <Button variant="secondary" size="sm" className="w-full" onClick={() => onSelect(a.id)}>
                    เปิดกลุ่มนี้
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One line describing where a section stands. Ordered by what the TA has to act
 * on: anything unsent outranks anything already handed over, because the unsent
 * pile is the only one that can be forgotten.
 */
function SectionStateLine({ a }: { a: Assignment }) {
  if (a.unsent_count > 0) {
    const stranded = a.unsent_count - a.submittable_count;
    // A single "unsent 10" hid the difference that decides what to do next:
    // some of those ten may be past their deadline and beyond the TA entirely.
    return (
      <span className={"inline-flex items-center gap-1.5 " + (a.submittable_count > 0 ? "text-amber-700" : "text-red-700")}>
        <Pencil size={14} className="shrink-0" />
        {stranded > 0
          ? a.submittable_count > 0
            ? `ยังไม่ได้ส่ง ${a.submittable_count} รายการ · ไม่ประสงค์ลงเวลา ${stranded}`
            : `ไม่ประสงค์ลงเวลา ${stranded} รายการ`
          : `ยังไม่ได้ส่ง ${a.unsent_count} รายการ`}
      </span>
    );
  }
  if (a.submitted_count > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted">
        <Clock size={14} className="shrink-0" />
        ส่งแล้ว {a.submitted_count} รายการ · รออาจารย์
      </span>
    );
  }
  if (a.approved_count > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-success-soft-foreground">
        <CheckCircle2 size={14} className="shrink-0" />
        อนุมัติแล้ว {a.approved_count} รายการ
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-muted">
      <Clock size={14} className="shrink-0" />
      ยังไม่มีรายการ
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* MonthlyWorklogView — groups work-logs into month sections seeded from the   */
/* term's start/end dates so a TA sees every month of the semester, even ones  */
/* they haven't logged into yet. Reuses the column render functions so edit /  */
/* save / delete behavior stays consistent with the flat-table days.           */
/* -------------------------------------------------------------------------- */

interface MonthlyWorklogViewProps {
  rows: WorkLog[] | undefined;
  loading: boolean;
  columns: DataColumn<WorkLog>[];
  termStart?: string;
  termEnd?: string;
  // view() lets the section header show the *edited* hours (draft override)
  // instead of the server value — so the subtotal matches what the user sees.
  view: (row: WorkLog) => WorkLog;
  // Fired when the user clicks "+ เพิ่มในเดือนนี้" — the parent seeds the
  // AddWorklogModal's date to the first day of that month.
  onQuickAdd: (dateISO: string) => void;
  // Holiday impacts drive the per-month "N holidays waiting for makeup" strip
  // and let empty months warn instead of just showing "no entries".
  impacts?: HolidayImpact[];
  // Months (keyed "MM") whose submission period is closed or finance_sent —
  // the header shows a lock chip and hides the quick-add for those months.
  monthLocks?: Map<string, MonthLock>;
  monthDeadlines?: Map<string, { label: string; daysLeft: number }>;
  monthsInReview?: Set<string>;
  unpaidMonths?: Set<string>;
  partialMonths?: Set<string>;
  tcId?: string;
  sectionId?: string;
}

function MonthlyWorklogView({
  monthDeadlines,
  monthsInReview,
  unpaidMonths,
  partialMonths,
  rows, loading, columns, termStart, termEnd, view, onQuickAdd,
  impacts, monthLocks, tcId, sectionId,
}: MonthlyWorklogViewProps) {
  // Months with nothing left to do start folded.
  //
  // A settled month is a wall of green rows the TA will never act on again, and
  // it pushed the months that DO need something off the screen. The header still
  // carries the counts, so nothing is hidden — only the rows behind a number
  // that already summarises them.
  //
  // "Settled" is every row approved, or the period closed with the rest
  // forfeited. A rejected row keeps its month open however old it is: somebody
  // is waiting on the TA to look at it.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Keyed by section, not a bare flag: switching sections swaps in a different
  // pile of months that has to be folded on its own terms.
  const [foldedFor, setFoldedFor] = useState<string | null>(null);
  // Per-date lookup for the row-level "🏖 holiday" chip and the per-month
  // count of unresolved impacts on the ACTIVE section.
  const dateIndex = useMemo(() => buildDateIndex(impacts, sectionId), [impacts, sectionId]);

  // Fold once, on first load. Re-folding on every change would spring the month
  // shut under the TA the moment their last row was approved, mid-scroll.
  useEffect(() => {
    const key = sectionId ?? "";
    if (foldedFor === key || !rows || rows.length === 0) return;
    const byMonthLocal = new Map<string, WorkLog[]>();
    for (const r of rows) {
      const k = monthKey(r.work_date);
      byMonthLocal.set(k, [...(byMonthLocal.get(k) ?? []), r]);
    }
    const fold = new Set<string>();
    for (const [m, list] of byMonthLocal) {
      const rejected = list.some(r => r.status === "rejected");
      const unsent = list.some(r => r.status === "draft");
      const locked = !!monthLocks?.get(m.slice(5, 7));
      if (rejected) continue;                 // needs the TA's attention
      if (unsent && !locked) continue;        // still sendable
      fold.add(m);                            // all approved, or closed for good
    }
    setCollapsed(fold);
    setFoldedFor(key);
  }, [rows, monthLocks, sectionId, foldedFor]);

  if (loading && !rows) {
    return (
      <Panel>
        <div className="flex items-center justify-center py-10 text-sm text-muted">
          กำลังโหลด…
        </div>
      </Panel>
    );
  }

  const list = rows ?? [];

  // Union of months in the term range with months that actually have entries.
  // The latter set covers edge cases where staff moved term dates after a TA
  // already logged rows — we don't want those rows to silently disappear.
  const termMonths = monthsInRange(termStart, termEnd);
  const entryMonths = new Set(list.map(r => monthKey(r.work_date)).filter(Boolean));
  const allMonths = Array.from(new Set([...termMonths, ...entryMonths])).sort();

  if (allMonths.length === 0) {
    // No term dates and no entries — fall back to a single "unassigned" bucket
    // so the empty state still renders sensibly.
    return (
      <Panel>
        <EmptyState
          title="ยังไม่มีบันทึก"
          description={`กด "เพิ่มรายการ" เพื่อสร้างเอง หรือ "สร้างอัตโนมัติ" เพื่อสร้างจากตารางสอน`}
        />
      </Panel>
    );
  }

  // Bucket rows by month + sort each bucket by date/time so a section reads
  // chronologically. Rows outside every known month bucket shouldn't happen but
  // are logged under the "unknown" catch-all to avoid data loss.
  const byMonth = new Map<string, WorkLog[]>();
  for (const m of allMonths) byMonth.set(m, []);
  for (const r of list) {
    const k = monthKey(r.work_date);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push(r);
  }
  for (const [, arr] of byMonth) {
    arr.sort((a, b) => {
      if (a.work_date !== b.work_date) return a.work_date.localeCompare(b.work_date);
      return (a.start_time ?? "").localeCompare(b.start_time ?? "");
    });
  }

  const sortedMonths = Array.from(byMonth.keys()).sort();

  // Bucket unresolved-holiday impacts by month for the active section so each
  // month header can flag "N holidays waiting for makeup" without re-walking
  // the impact list per render.
  const unresolvedByMonth = new Map<string, number>();
  if (impacts && sectionId) {
    for (const imp of impacts) {
      const isUnresolvedForThisSection = imp.affected_sections.some(
        s => s.section_id === sectionId && !s.makeup,
      );
      if (!isUnresolvedForThisSection) continue;
      const key = monthKey(imp.original_date);
      unresolvedByMonth.set(key, (unresolvedByMonth.get(key) ?? 0) + 1);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {sortedMonths.map(month => {
        const monthRows = byMonth.get(month) ?? [];
        const isCollapsed = collapsed.has(month);
        const subtotal = monthRows.reduce((s, r) => s + (view(r).hours || 0), 0);
        const draftInMonth = monthRows.filter(r => r.status === "draft").length;
        const submittedInMonth = monthRows.filter(r => r.status === "submitted").length;
        const rejectedInMonth = monthRows.filter(r => r.status === "rejected").length;
        const approvedInMonth = monthRows.filter(r => r.status === "approved").length;
        const unresolvedInMonth = unresolvedByMonth.get(month) ?? 0;
        const monthLock = monthLocks?.get(month.slice(5, 7)) ?? null;
        const deadline = monthDeadlines?.get(month.slice(5, 7)) ?? null;
        const unsentInMonth = monthRows.filter(r => r.status === "draft" || r.status === "rejected").length;

        return (
          <Panel key={month} padded={false}>
            {/* Header — clickable to expand/collapse the month */}
            <button
              type="button"
              onClick={() => {
                const next = new Set(collapsed);
                if (next.has(month)) next.delete(month); else next.add(month);
                setCollapsed(next);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-secondary transition-colors rounded-t-xl"
              aria-expanded={!isCollapsed}
            >
              <span className={"inline-block transition-transform " + (isCollapsed ? "" : "rotate-90")}>
                ▶
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground flex items-center gap-2 flex-wrap">
                  <span>{formatMonthTH(month)}</span>
                  {/* Only on months that still hold unsent rows: a deadline
                      with nothing outstanding behind it is noise. */}
                  {!monthLock && unsentInMonth > 0 && deadline && deadline.daysLeft <= 14 && (
                    <Chip tone={deadline.daysLeft <= 3 ? "danger" : "warn"}>
                      {/* With no way back after the deadline, the warning has to
                          name the consequence, not just the date. */}
                      {deadline.daysLeft <= 0
                        ? "⏰ วันนี้วันสุดท้าย ไม่ส่งถือว่าไม่ประสงค์ลงเวลา"
                        : deadline.daysLeft <= 3
                        ? `⏰ เหลือ ${deadline.daysLeft} วัน ไม่ส่งถือว่าไม่ประสงค์ลงเวลา`
                        : `⏰ เหลืออีก ${deadline.daysLeft} วันต้องส่ง`}
                    </Chip>
                  )}
                  {monthLock && (
                    <Chip tone={monthLock.financeSent ? "success" : "neutral"}>
                      {monthLock.financeSent ? "🔒 ส่งการเงินแล้ว" : "🔒 งวดปิดรับแล้ว"}
                    </Chip>
                  )}
                  {unresolvedInMonth > 0 && (
                    <Chip tone="warn">
                      🏖 รอวันชดเชย {unresolvedInMonth}
                    </Chip>
                  )}
                </div>
                {/* Status reads at a glance, in the order it has to be acted on.
                    A single grey run-on line ("5 รายการ · รวม 10.0 ชม. · อนุมัติ 5")
                    made a bounced month and a finished one look identical — the
                    reader had to open every card to find the one that needed
                    them. The counts carry colour now, and each state is named.

                    It also printed "ฉบับร่าง 0" on a month whose seven rows were
                    all rejected: the label read draftInMonth while the condition
                    tested draft+rejected. Each state now counts its own rows. */}
                <div className="text-xs text-muted mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="tabular">{monthRows.length} รายการ</span>
                  <span>· รวม <span className="font-semibold text-foreground tabular">{subtotal.toFixed(1)}</span> ชม.</span>
                  {/* In a closed month a bounced row is as lost as an unsent
                      one — the TA cannot fix and resend it either — so the two
                      collapse into one grey "หมดเวลาส่ง" rather than a red
                      "ต้องแก้ไข" nobody can act on. */}
                  {monthLock ? (
                    unsentInMonth > 0 && (
                      <span className="ml-1 rounded-full border border-border bg-surface-secondary px-2 py-0.5 font-medium text-ink-3">
                        หมดเวลาส่ง {unsentInMonth}
                      </span>
                    )
                  ) : (
                    <>
                      {rejectedInMonth > 0 && (
                        <span className="ml-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-medium text-red-700">
                          ✏️ ต้องแก้ไข {rejectedInMonth}
                        </span>
                      )}
                      {draftInMonth > 0 && (
                        <span className="ml-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                          ฉบับร่าง {draftInMonth}
                        </span>
                      )}
                    </>
                  )}
                  {submittedInMonth > 0 && (
                    <span className="ml-1 rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700 border border-blue-200">
                      รออาจารย์ {submittedInMonth}
                    </span>
                  )}
                  {approvedInMonth > 0 && (
                    <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 border border-emerald-200">
                      ✓ อนุมัติแล้ว {approvedInMonth}
                    </span>
                  )}
                  {/* Approved and still unpaid: the hours are fine, the money
                      ran out. Kept separate from the approval chip so the two
                      facts are not confused for one another. */}
                  {unpaidMonths?.has(month) && (
                    <span className="ml-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-medium text-red-700">
                      งบไม่ถึง · ไม่ได้รับค่าตอบแทน
                    </span>
                  )}
                  {partialMonths?.has(month) && (
                    <span className="ml-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                      งบไม่ถึงบางคาบ
                    </span>
                  )}
                </div>
              </div>
              {!monthLock && !monthsInReview?.has(month) && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={e => { e.stopPropagation(); onQuickAdd(`${month}-01`); }}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onQuickAdd(`${month}-01`);
                    }
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline px-2 py-1 rounded"
                >
                  <Plus size={12} /> เพิ่มในเดือนนี้
                </span>
              )}
            </button>

            {!isCollapsed && (
              <div className="border-t border-(--hairline)">
                {unresolvedInMonth > 0 && (
                  <div className="px-4 pt-3">
                    <Alert
                      status="warning"
                      icon={<AlertTriangle size={14} />}
                      title={`มีวันหยุด ${unresolvedInMonth} วันในเดือนนี้ที่ยังไม่ได้กำหนดวันชดเชย`}
                      description="เข้าไปดูรายละเอียดและแจ้งอาจารย์ได้ที่หน้า 'วันหยุดและวันชดเชย'"
                    />
                  </div>
                )}
                {monthRows.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted">
                    ยังไม่มีบันทึกในเดือนนี้
                  </div>
                ) : (
                  <MonthTable columns={columns} rows={monthRows} dateIndex={dateIndex} />
                )}
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}

// Compact HTML table that renders a column set for a single month's rows.
// Kept intentionally separate from DataTable — no pagination/search/sort here
// because a month typically has <30 rows and the outer grouping already gives
// the "which page am I on" affordance the paginator would provide.
function MonthTable({
  columns, rows, dateIndex,
}: {
  columns: DataColumn<WorkLog>[];
  rows: WorkLog[];
  dateIndex?: Map<string, DateStatus>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm border-collapse sm:min-w-0">
        <thead>
          <tr className="bg-surface-secondary/50 text-xs uppercase tracking-wider text-muted">
            {columns.map(col => (
              // Deliberately do NOT spread col.className onto the header —
              // per-cell classes (text-right, text-sm, etc.) would misalign
              // header text. Header stays uniformly left-aligned; only body
              // cells get the column's alignment/typography rules.
              <th key={col.id} className="px-3 py-2 text-left font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            // Row-level holiday context: a row whose HOURS fall inside a closure
            // gets a "🏖" chip in the "วันที่" column so the TA sees at a glance
            // why it will be refused. Matched on the row's times, not just its
            // date — a 13:00 lab on a morning-only faculty closure is a normal
            // row and must not be flagged. We render the chip via a wrapper only
            // for the row-header column (id="work_date") so it doesn't clutter
            // other cells.
            const status = dateIndex?.get(r.work_date);
            const holiday = holidayCovering(status, r.start_time ?? "", r.end_time ?? "");
            return (
              <tr key={r.id} className="border-t border-(--hairline)">
                {columns.map(col => (
                  <td key={col.id} className={"px-3 py-2 align-middle " + (col.className ?? "")}>
                    {col.render(r)}
                    {col.id === "work_date" && holiday && (
                      <div className="mt-1">
                        <Chip tone="danger">🏖 {holidayLabel(holiday)}</Chip>
                      </div>
                    )}
                    {col.id === "work_date" && status?.isMakeupDay && !holiday && (
                      <div className="mt-1">
                        <Chip tone="info">📅 วันชดเชย</Chip>
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* HolidayHint — client-side mirror of the server's holiday+makeup validator.  */
/* Same rules as internal/service/worklog.go validateWorkLogEntry so the TA    */
/* sees the block reason immediately instead of round-tripping to a toast.     */
/* -------------------------------------------------------------------------- */

function HolidayHint({
  workDate, startTime, endTime, activity, parentKind, dateIndex, tcId,
}: {
  workDate: string;
  /** The entry's hours. A partial-day closure only blocks what it overlaps, so
   *  the hint cannot be decided from the date alone. */
  startTime: string;
  endTime: string;
  activity: string;
  parentKind: "lecture" | "lab";
  dateIndex: Map<string, DateStatus>;
  tcId?: string;
}) {
  if (!workDate) return null;
  const status = dateIndex.get(workDate);
  if (!status) return null;
  const holiday = holidayCovering(status, startTime, endTime);

  // If the day is another section's approved makeup date, everything is fine —
  // surface it as a positive info hint so the TA understands why a Saturday is
  // allowed.
  if (status.isMakeupDay && !holiday) {
    return (
      <Alert status="accent" title="วันนี้เป็นวันชดเชยที่อาจารย์กำหนดไว้" />
    );
  }

  // Original date that was moved to a makeup → block lecture/lab and tell the
  // TA where to log instead.
  if (status.shiftedTo && (activity === "lecture" || activity === "lab")) {
    return (
      <Alert
        status="warning"
        icon={<AlertTriangle size={14} />}
        title={`คาบนี้ถูกย้ายไปวันชดเชย ${status.shiftedTo}`}
        description="กรุณาลงเวลาบน 'วันชดเชย' แทนที่จะเป็นวันเดิม"
      />
    );
  }

  // Hours that fall outside every closure on the date are ordinary work — this
  // is the case the partial-day holiday exists for, so it must produce no
  // warning at all, not a softened one.
  if (!holiday) {
    const partialOnDate = status.holidays.find(h => h.start && h.end);
    if (!partialOnDate) return null;
    return (
      <Alert
        status="accent"
        title={`วันนี้หยุดเฉพาะช่วง ${partialOnDate.start}–${partialOnDate.end} (${partialOnDate.name}) ช่วงเวลาที่คุณเลือกอยู่นอกช่วงหยุด จึงลงเวลาได้ตามปกติ`}
      />
    );
  }

  // Holiday hours. Decide allow/block per activity — mirrors the server.
  const isPartial = !!(holiday.start && holiday.end);
  const canDoOnHoliday =
    activity === "review" ||
    (activity === "other" && parentKind === "lecture");
  if (canDoOnHoliday) {
    return (
      <Alert
        status="accent"
        icon={<AlertTriangle size={14} />}
        title={`ช่วงเวลานี้ตรงกับวันหยุด (${holidayLabel(holiday)}) อนุญาตเฉพาะ${activity === "review" ? "การตรวจงาน" : "งานอื่นๆ ที่คู่กับบรรยาย"}`}
      />
    );
  }
  // Blocked case — server will 400 this. Surface link back to the impacts page.
  const link = tcId ? `/ta/courses/${tcId}/holidays` : null;
  return (
    <Alert
      status="danger"
      icon={<AlertTriangle size={14} />}
      title={isPartial
        ? `เวลา ${startTime || "—"}–${endTime || "—"} อยู่ในช่วงวันหยุด (${holidayLabel(holiday)})`
        : `วันนี้เป็นวันหยุด (${holiday.name}) ยังไม่ได้กำหนดวันชดเชย`}
      description={
        isPartial ? (
          // The cheapest fix for a partial closure is usually to move the entry a
          // few hours, not to wait on a makeup — lead with that.
          <span>
            ลงเวลาได้เฉพาะช่วงที่ไม่คาบเกี่ยวกับ {holiday.start}–{holiday.end} หรือกำหนดวันชดเชย
            {link && <> · <a href={link} className="text-accent hover:underline">ไปหน้าวันหยุดและวันชดเชย</a></>}
          </span>
        ) : link ? (
          <span>
            คุณจะลงเวลาคาบเรียนวันนี้ไม่ได้ <a href={link} className="text-accent hover:underline">ไปหน้าวันหยุดและวันชดเชย</a> เพื่อกำหนดวันชดเชย หรือแจ้งอาจารย์
          </span>
        ) : "คุณจะลงเวลาคาบเรียนวันนี้ไม่ได้ ต้องกำหนดวันชดเชยก่อน"
      }
    />
  );
}

// ---------------------------------------------------------------------------
// ReviewSchedulePanel — TA-owned weekly pattern for grading homework. Each row
// expands into review entries on auto-generate. TAs configure once per term.
// ---------------------------------------------------------------------------

interface TAReviewSchedule {
  id: string;
  assignment_id: string;
  kind: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room?: string;
  note?: string;
}

/**
 * The duties a TA nominates their own weekly slots for. All three are done
 * OUTSIDE the class session, which is why they exist as a schedule of their own
 * rather than following the section timetable.
 */
const DUTY_KINDS = ["review", "other_lecture", "other_lab"] as const;

const DUTY_META: Record<string, { title: string; short: string; blurb: string; activity: string }> = {
  review: {
    title: "ตารางตรวจการบ้านของคุณ",
    short: "ตรวจงาน",
    blurb: "กำหนดวันเวลาที่คุณตรวจการบ้านเป็นประจำ",
    activity: "ตรวจงาน",
  },
  other_lecture: {
    title: "ตารางงานอื่น ๆ (บรรยาย) ของคุณ",
    short: "งานอื่นๆ (บรรยาย)",
    blurb: "กำหนดวันเวลาที่คุณทำงานอื่นที่คู่กับคาบบรรยาย",
    activity: "อื่นๆ",
  },
  other_lab: {
    title: "ตารางงานอื่น ๆ (ปฏิบัติการ) ของคุณ",
    short: "งานอื่นๆ (ปฏิบัติการ)",
    blurb: "กำหนดวันเวลาที่คุณทำงานอื่นที่คู่กับคาบปฏิบัติการ",
    activity: "อื่นๆ",
  },
};

const DAY_TH_SHORT = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

// Response shape for GET /assignments/:id/review-schedules. The budget is what
// the LECTURER declared per duty — a duty they did not ask for comes back as 0
// and gets no card at all, instead of the old always-visible grading panel that
// let a TA plan a whole term of work the system would silently discard.
interface TAReviewScheduleList {
  items: TAReviewSchedule[];
  declared_hours_per_week: Record<string, number>;
  used_hours_per_week: Record<string, number>;
}

function hoursOf(start: string, end: string): number {
  const s = parseHM(start), e = parseHM(end);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
  return (e - s) / 60;
}

/**
 * All the duty cards for one assignment. Renders a card per duty the lecturer
 * actually declared — none at all when they declared none, which is the point:
 * the grading card used to appear unconditionally.
 */
function DutySchedulePanels({ assignmentId }: { assignmentId: string }) {
  const { data } = useSWR<TAReviewScheduleList>(
    assignmentId ? `/assignments/${assignmentId}/review-schedules` : null,
  );
  const declared = data?.declared_hours_per_week ?? {};
  const shown = DUTY_KINDS.filter(k => (declared[k] ?? 0) > 0);
  if (shown.length === 0) return null;
  return (
    <div className="space-y-4">
      {shown.map(k => (
        <DutySchedulePanel key={k} assignmentId={assignmentId} kind={k} />
      ))}
    </div>
  );
}

function DutySchedulePanel({ assignmentId, kind }: { assignmentId: string; kind: string }) {
  const meta = DUTY_META[kind];
  const { data, isLoading } = useSWR<TAReviewScheduleList>(
    assignmentId ? `/assignments/${assignmentId}/review-schedules` : null,
  );
  const [editing, setEditing] = useState<TAReviewSchedule | "new" | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    await mutate(`/assignments/${assignmentId}/review-schedules`);
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await api.del(`/assignments/${assignmentId}/review-schedules/${confirmDeleteId}`);
      notify.success(`ลบ${meta.short}แล้ว`);
      setConfirmDeleteId(null);
      await refresh();
    } catch (e) {
      notify.error(e);
    } finally { setDeleting(false); }
  }

  const rows = (data?.items ?? []).filter(r => r.kind === kind);
  const declaredHrs = data?.declared_hours_per_week?.[kind] ?? 0;
  const usedHrs = data?.used_hours_per_week?.[kind] ?? 0;
  const isFull = declaredHrs > 0 && usedHrs >= declaredHrs;

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <BookOpenCheck size={16} className="text-muted" />
          <span>{meta.title}</span>
          {declaredHrs > 0 && (
            <Chip tone={isFull ? "warn" : "info"}>
              {usedHrs.toFixed(1)}/{declaredHrs.toFixed(1)} ชม./สัปดาห์
            </Chip>
          )}
        </span>
      }
      info={
        <>
          {meta.blurb} ตอนกด <b>สร้างอัตโนมัติ</b> ระบบจะขยายเป็นรายการ <b>{meta.activity}</b> ให้ตลอดเทอม
          <br /><br />
          รวมต่อสัปดาห์ต้องไม่เกินชั่วโมงที่อาจารย์ระบุไว้ในคำขอ ({declaredHrs.toFixed(1)} ชม.)
        </>
      }
      actions={
        <LockedActionButton
          variant="secondary"
          size="sm"
          onClick={() => setEditing("new")}
          disabled={isFull}
        >
          <Plus size={13} /> เพิ่มช่วงเวลา
        </LockedActionButton>
      }
      padded={false}
    >
      {isLoading && !data ? (
        <div className="p-4 text-sm text-muted text-center">กำลังโหลด…</div>
      ) : rows.length === 0 ? (
        <div className="p-4 text-sm text-muted">
          ยังไม่ได้ตั้งช่วงเวลา กด "เพิ่มช่วงเวลา" เพื่อกำหนดวันประจำสัปดาห์ที่คุณจะทำงานนี้
        </div>
      ) : (
        <div className="divide-y divide-(--hairline)">
          {rows.map(r => (
            <div key={r.id} className="flex items-center gap-3 p-3 flex-wrap">
              <div className="w-24 shrink-0 text-sm font-medium">{DAY_TH_SHORT[r.day_of_week]}</div>
              <div className="text-sm tabular-nums text-foreground">
                {r.start_time}–{r.end_time}
              </div>
              {r.room && <div className="text-xs text-muted">· {r.room}</div>}
              {r.note && <div className="text-xs text-muted truncate flex-1">— {r.note}</div>}
              <div className="ml-auto flex items-center gap-1">
                <LockedActionButton variant="ghost" size="sm" onClick={() => setEditing(r)} isIconOnly aria-label="แก้ไข" title="แก้ไข">
                  <Pencil size={13} />
                </LockedActionButton>
                <LockedActionButton
                  variant="ghost" size="sm"
                  onClick={() => setConfirmDeleteId(r.id)}
                  isIconOnly aria-label="ลบ" title="ลบ"
                >
                  <Trash2 size={13} />
                </LockedActionButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ReviewScheduleModal
          assignmentId={assignmentId}
          kind={kind}
          initial={editing === "new" ? null : editing}
          lectureHrs={declaredHrs}
          reviewHrs={usedHrs}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await refresh(); }}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={handleDelete}
        isPending={deleting}
        danger
        title="ลบวันตรวจการบ้าน"
        confirmLabel="ลบ"
        message="รายการที่เคยสร้างไปแล้วจะไม่ถูกลบ แต่การกด 'สร้างอัตโนมัติ' ครั้งถัดไปจะไม่มีรายการของวันนี้อีก ต้องการลบหรือไม่?"
      />
    </Panel>
  );
}

function ReviewScheduleModal({
  assignmentId, kind, initial, lectureHrs, reviewHrs, onClose, onSaved,
}: {
  assignmentId: string;
  /** Which declared duty this slot belongs to. */
  kind: string;
  initial: TAReviewSchedule | null;
  /** Weekly ceiling for this duty — the hours the LECTURER declared. */
  lectureHrs: number;
  /** Hours already nominated for this duty. */
  reviewHrs: number;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const meta = DUTY_META[kind];
  const [dow, setDow] = useState<number>(initial?.day_of_week ?? 1);
  const [start, setStart] = useState(initial?.start_time ?? "14:00");
  const [end, setEnd] = useState(initial?.end_time ?? "16:00");
  const [room, setRoom] = useState(initial?.room ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);

  // Weekly cap preview: existing review hours (minus this row's contribution
  // when editing) + the slot being drafted must stay within lectureHrs.
  const currentSlotHrs = hoursOf(start, end);
  const priorSlotHrs = initial ? hoursOf(initial.start_time, initial.end_time) : 0;
  const projected = reviewHrs - priorSlotHrs + currentSlotHrs;
  const overCap = lectureHrs > 0 && projected > lectureHrs + 1e-6;

  // Time-conflict preview: fetch the TA's occupied slots (class timetable +
  // teaching + review) once and flag overlap with the drafted slot before
  // saving. The server enforces the same rule authoritatively on save.
  const { data: busy } = useSWR<BusyBlock[]>(
    `/assignments/${assignmentId}/schedule-busy`,
  );
  const conflict = useMemo(() => {
    const s = parseHM(start), e = parseHM(end);
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null;
    for (const b of busy ?? []) {
      if (b.day_of_week !== dow) continue;
      if (b.kind === "review" && initial && b.review_id === initial.id) continue;
      const bs = parseHM(b.start_time), be = parseHM(b.end_time);
      if (s < be && e > bs) return b; // half-open overlap
    }
    return null;
  }, [busy, dow, start, end, initial]);
  const conflictKindTH: Record<BusyBlock["kind"], string> = {
    class: "ตารางเรียนของคุณ",
    teaching: "คาบสอนที่คุณเป็น TA",
    review: "ตารางงานอื่นของคุณ",
  };

  async function handleSave() {
    if (parseHM(end) <= parseHM(start)) {
      notify.error("เวลาสิ้นสุดต้องหลังเวลาเริ่ม");
      return;
    }
    if (conflict) {
      notify.error(
        `เวลาชนกับ${conflictKindTH[conflict.kind]} (${conflict.label} ${conflict.start_time}–${conflict.end_time})`,
      );
      return;
    }
    if (overCap) {
      notify.error(`ชั่วโมง${meta.short}รวมต่อสัปดาห์ (${projected.toFixed(1)} ชม.) เกินที่อาจารย์ระบุไว้ (${lectureHrs.toFixed(1)} ชม.)`);
      return;
    }
    setSaving(true);
    try {
      const body = { kind, day_of_week: dow, start_time: start, end_time: end, room, note };
      if (initial) {
        await api.patch(`/assignments/${assignmentId}/review-schedules/${initial.id}`, body);
        notify.success(`แก้ไข${meta.short}แล้ว`);
      } else {
        await api.post(`/assignments/${assignmentId}/review-schedules`, body);
        notify.success(`เพิ่ม${meta.short}แล้ว`);
      }
      await onSaved();
    } catch (e) {
      notify.error(e);
    } finally { setSaving(false); }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${initial ? "แก้ไข" : "เพิ่ม"}ช่วงเวลา ${meta.short}`}
      icon={<BookOpenCheck size={18} />}
      size="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" onClick={handleSave} isPending={saving} disabled={saving || overCap || !!conflict}>
            บันทึก
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <FieldGroup label="วันของสัปดาห์">
          <Select value={String(dow)} onChange={e => setDow(Number(e.target.value))}>
            {DAY_TH_SHORT.map((label, i) => (
              <option key={i} value={i}>{label}</option>
            ))}
          </Select>
        </FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="เวลาเริ่ม">
            <TimePicker value={start} onChange={setStart} label="เวลาเริ่ม" />
          </FieldGroup>
          <FieldGroup label="เวลาสิ้นสุด">
            <TimePicker value={end} onChange={setEnd} label="เวลาสิ้นสุด" />
          </FieldGroup>
        </div>
        <FieldGroup label="ห้อง (ระบุก็ได้)">
          <TextInput value={room} onChange={e => setRoom(e.target.value)} placeholder="เช่น SC5.5 หรือ ที่บ้าน" />
        </FieldGroup>
        <FieldGroup label="หมายเหตุ (ระบุก็ได้)">
          <TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น ตรวจการบ้านสัปดาห์ที่ 1–3" />
        </FieldGroup>

        {conflict && (
          <Alert
            status="danger"
            icon={<AlertTriangle size={14} />}
            title={`เวลาชนกับ${conflictKindTH[conflict.kind]}`}
            description={`${conflict.label} · ${DAY_TH_SHORT[conflict.day_of_week]} ${conflict.start_time}–${conflict.end_time} เลือกช่วงเวลาที่ไม่ทับกัน`}
          />
        )}

        {lectureHrs > 0 && (
          overCap ? (
            <Alert
              status="danger"
              icon={<AlertTriangle size={14} />}
              title={`เกินเพดาน รวมต่อสัปดาห์ ${projected.toFixed(1)} ชม. เกินชั่วโมงบรรยาย ${lectureHrs.toFixed(1)} ชม.`}
              description="ลดช่วงเวลาลง หรือลบวันตรวจอื่นก่อน"
            />
          ) : (
            <div className="text-xs text-muted">
              รวมต่อสัปดาห์หลังบันทึก: <span className="tabular-nums font-medium text-foreground">{projected.toFixed(1)}</span> / {lectureHrs.toFixed(1)} ชม. (ชั่วโมงบรรยายของ section)
            </div>
          )
        )}
      </div>
    </Modal>
  );
}
