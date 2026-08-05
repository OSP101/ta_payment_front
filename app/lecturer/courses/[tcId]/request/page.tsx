"use client";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import {
  Plus, Send, Trash2, ClipboardList, Wallet, CheckCircle2, AlertCircle, Info,
  UserPlus, Copy, CalendarClock, CalendarOff, Clock,
} from "lucide-react";
import {
  RadioGroup, Radio, Description, Label,
  NumberField,
  Checkbox, CheckboxGroup,
  Autocomplete, ListBox, SearchField, useFilter,
  EmptyState as HEmptyState,
  Input as HInput,
  Label as HLabel,
  TextField as HTextField,
  FieldError as HFieldError,
  toast,
  type Key,
} from "@heroui/react";
import { api } from "../../../../lib/api";
import { notify } from "../../../../lib/notify";
import {
  PageHeader, Panel, Button, IconButton, TextInput, Select, FieldGroup, Chip, EmptyState, Alert, Modal,
} from "../../../../components/ui";
import { RequestsTable, type TARequestRow } from "../../../RequestsTable";
import { TaBudgetCalculator } from "../../../../components/TaBudgetCalculator";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface SectionSchedule { kind: string; day_of_week: number; start_time: string; end_time: string; }

/**
 * The SUM of one side's declared hours may reach this multiple of the group's
 * real teaching time. Mirrors sectionTotalMultiplier on the server.
 *
 * Two, not one: attendance happens inside the session while grading and other
 * work happen after it, so the total legitimately exceeds the class hours — but
 * three fields each at the per-field ceiling would be three times over.
 */
const SECTION_TOTAL_MULTIPLIER = 2;

/** Weekly contact hours of one section, split by kind — the real ceiling. */
function sectionWeeklyHours(s: Section | undefined): { lecture: number; lab: number } {
  const out = { lecture: 0, lab: 0 };
  for (const sc of s?.schedules ?? []) {
    const start = Number(sc.start_time.slice(0, 2)) * 60 + Number(sc.start_time.slice(3, 5));
    const end = Number(sc.end_time.slice(0, 2)) * 60 + Number(sc.end_time.slice(3, 5));
    const hrs = Math.max(0, end - start) / 60;
    if (sc.kind === "lecture") out.lecture += hrs;
    else if (sc.kind === "lab") out.lab += hrs;
  }
  return out;
}
interface Section {
  id: string; sec_no: string; track: string;
  /** Weekly meetings. Present on /teaching-courses/:id. */
  schedules?: SectionSchedule[];
}

/**
 * Partition sections into groups that meet at the same time — co-teaching.
 * Mirrors TARequestService.detectCotaughtGroups so the form's totals agree
 * with the verdict the server will reach. Those sections are one sitting, so
 * their declared hours are the SAME hours and must be counted once.
 */
function cotaughtGroups(sections: Section[], picked: string[]): Map<string, number> {
  const chosen = sections.filter(s => picked.includes(s.id));
  const overlaps = (a: Section, b: Section) =>
    (a.schedules ?? []).some(x =>
      (b.schedules ?? []).some(y =>
        x.day_of_week === y.day_of_week &&
        x.start_time < y.end_time &&
        y.start_time < x.end_time));

  const groups = new Map<string, number>();
  let next = 0;
  for (const s of chosen) {
    if (groups.has(s.id)) continue;
    next += 1;
    groups.set(s.id, next);
    for (const other of chosen) {
      if (other.id === s.id || groups.has(other.id)) continue;
      if (overlaps(s, other)) groups.set(other.id, next);
    }
  }
  return groups;
}
interface TA {
  id: string; first_name: string; last_name: string; email: string; study_level?: string;
  // From /ta-requests/candidates — how many courses this TA is already booked
  // for this term (a submitted request books the slot, not just an approved
  // one), whether that hits the 3-course cap, and whether they are already on
  // this course. The first two make them unselectable but still VISIBLE: a TA
  // filtered out of the list reads as "no account", and lecturers were trying
  // to create duplicates.
  approved_course_count?: number;
  at_quota?: boolean;
  already_in_course?: boolean;
  /** false = no class timetable filed yet for this term. */
  has_schedule?: boolean;
}

/** Why a TA cannot be picked, or null when they can. */
function taBlockedReason(t: TA): string | null {
  if (t.already_in_course) return "อยู่ในคำขอของวิชานี้แล้ว";
  if (t.at_quota) return `รับสอนครบ ${MAX_COURSES_PER_TA} วิชาแล้ว`;
  return null;
}

/** Per-term ceiling on how many courses one TA may assist. */
const MAX_COURSES_PER_TA = 3;
interface SectionConflict {
  section_id: string;
  messages: string[];
  /** Session kinds whose EVERY meeting collides with this TA's own class. */
  blocked_kinds?: string[];
  /** Overlap with a DIFFERENT course the TA already assists — still blocking. */
  cross_conflict?: boolean;
}
interface ConflictsResp { conflicts: SectionConflict[]; }
interface WorkloadFields {
  help_teach_hrs: number; help_teach_desc: string;
  prep_hrs: number; prep_desc: string;
  grade_hrs: number; grade_desc: string;
  other_hrs: number; other_desc: string;
  check_work_hrs: number; attendance_hrs: number; ug_other_hrs: number; ug_other_desc: string;
  lab_hrs: number;
  lab_other_hrs: number; lab_other_desc: string;
}

interface Assignment {
  // A TA can cover several sections of one course. Hours are declared PER
  // SECTION — the lecturers asked for "ชั่วโมงต่อกลุ่มเรียน" — and each
  // section's figure is bounded by the course's weekly contact hours for that
  // kind, i.e. the numbers inside 3(3-0-6).
  section_ids: string[];
  ta_id: string;
  level: string;
  /** Declared hours keyed by section id. */
  section_workloads: Record<string, WorkloadFields>;
}

interface RequestWindow {
  id: string;
  term_id: string;
  opens_at: string;
  closes_at: string;
  is_open: boolean;
  note?: string | null;
}

// มีแค่ 2 สถานะเท่านั้น — "ส่งทันเวลา" กับ "ส่งช้า" (ไม่มีการปิดรับ)
// กำหนดเวลาเป็นแค่ข้อมูล ไม่ได้ใช้บล็อกการส่ง: เลยกำหนดแล้วก็ยังส่งได้
// แต่คำขอจะถูกทำเครื่องหมาย "ล่าช้า" และการเบิกจ่ายจะช้าตามไปด้วย
type WindowState =
  | { phase: "ontime"; window?: RequestWindow; remainingMs?: number }
  | { phase: "late"; window: RequestWindow; closedAt: number };

const GRAD_MIN_HRS = 10;
const GRAD_MAX_HRS = 12;
// ประกาศ 731/2565 + 1080/2565 คุมเป็น "ชม./วัน" แต่ฟอร์มกรอกเป็น "ชม./สัปดาห์"
// จึงแปลงด้วยจำนวนวันทำการ (ต้องตรงกับ workingDaysPerWeek ฝั่ง backend ไม่งั้น
// ฟอร์มจะยอมให้กรอกแล้วไปโดนตีกลับตอนส่ง)
const WORKING_DAYS_PER_WEEK = 5;
/** เพดาน ชม./วัน ตามระดับ+ภาค — บัณฑิตภาคพิเศษเหมาจ่าย ไม่คิดรายชั่วโมง */
function dailyHourCap(level: string, track: string, r?: PayRateCaps): number {
  const isGrad = level === "master" || level === "phd";
  if (isGrad) return track === "special" ? 24 : (r?.grad_regular_daily_hour_cap ?? 6);
  return track === "special" ? (r?.ug_special_daily_hour_cap ?? 6) : (r?.ug_regular_daily_hour_cap ?? 7);
}
interface PayRateCaps {
  ug_regular_daily_hour_cap: number;
  ug_special_daily_hour_cap: number;
  grad_regular_daily_hour_cap: number;
}

const emptyWorkload = (): WorkloadFields => ({
  help_teach_hrs: 0, help_teach_desc: "",
  prep_hrs: 0, prep_desc: "",
  grade_hrs: 0, grade_desc: "",
  other_hrs: 0, other_desc: "",
  check_work_hrs: 0, attendance_hrs: 0, ug_other_hrs: 0, ug_other_desc: "",
  lab_hrs: 0, lab_other_hrs: 0, lab_other_desc: "",
});

/** Hours declared for one section, or zeroes if the lecturer hasn't filled it. */
function workloadOf(a: Assignment, sectionId: string): WorkloadFields {
  return a.section_workloads[sectionId] ?? emptyWorkload();
}

/** Weekly hours for one section, using only the fields its level applies to. */
function sectionHours(w: WorkloadFields, level: string): number {
  if (level === "master" || level === "phd") {
    return w.help_teach_hrs + w.prep_hrs + w.grade_hrs + w.other_hrs;
  }
  return w.check_work_hrs + w.attendance_hrs + w.ug_other_hrs + w.lab_hrs + w.lab_other_hrs;
}

/* -------------------------------------------------------------------------- */
/* Main page                                                                   */
/* -------------------------------------------------------------------------- */

interface CourseBudget {
  per_course_max: number;
  used_baht: number;
  remaining_baht: number;
  over_budget: boolean;
}

export default function RequestPage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  const { data: course } = useSWR<{
    id: string; code: string; name_th: string; term_id?: string;
    lecture_hrs?: number; lab_hrs?: number;
    // ≥1 section without a timetable (registrar "WBA") — backend rejects TA
    // requests for the course until the schedule is filled in.
    has_missing_schedule?: boolean;
    sections?: Section[];
  }>(
    tcId ? `/teaching-courses/${tcId}` : null,
  );
  const { data: allReqs } = useSWR<TARequestRow[]>("/ta-requests");
  const { data: windows } = useSWR<RequestWindow[]>(
    course?.term_id ? `/ta-request/windows?term_id=${course.term_id}` : null,
  );
  const { data: budget } = useSWR<CourseBudget>(
    tcId ? `/teaching-courses/${tcId}/budget` : null,
  );

  const courseReqs = (allReqs ?? []).filter(
    r => r.teaching_course_id === tcId || r.course_code === course?.code,
  );

  const windowState = useWindowState(windows);
  const windowLoading = !!course?.term_id && !windows;
  // WBA gate mirrors the backend: no TA request until every section has a
  // timetable — worklog validation and budget math both read it.
  const wbaBlocked = !!course?.has_missing_schedule;
  // ไม่มีการปิดรับคำขอ — กำหนดเวลาแค่ตัดสินว่า "ทันเวลา" หรือ "ส่งช้า"
  // สิ่งเดียวที่บล็อกการส่งคือ WBA (ยังไม่มีตารางเรียน)
  const canSend = !wbaBlocked;

  return (
    <div>
      <PageHeader
        title="คำขอผู้ช่วยสอน"
        description={course
          ? `${course.code} — ${course.name_th} · กรอกแบบฟอร์มด้านล่างเพื่อขอ TA`
          : "กรอกแบบฟอร์มด้านล่างเพื่อขอ TA"}
      />

      <WindowStatusBanner state={windowState} loading={windowLoading} />

      {/* WBA block: registrar file had no timetable for this course — filling
          the section schedules (ตั้งค่ารายวิชา) unblocks TA requests. */}
      {wbaBlocked && (
        <div className="mb-4">
          <Alert
            status="danger"
            icon={<CalendarOff size={16} />}
            title="ยังส่งคำขอ TA ไม่ได้ — วิชานี้ยังไม่ระบุเวลาเรียน (WBA)"
            description="มี section ที่ยังไม่มีตารางเรียน กรุณากรอกวัน-เวลาเรียนให้ครบทุก section ก่อน แล้วจึงกลับมาส่งคำขอ TA"
            action={
              <Link href={`/lecturer/courses/${tcId}/settings`}>
                <Button variant="secondary" size="sm">ไปกรอกตารางเรียน</Button>
              </Link>
            }
          />
        </div>
      )}

      {/* Inline request form (no modal, always visible — the professor asked for
          the form to be right there, not behind a button). */}
      {!wbaBlocked && (
        <RequestFormSection
          tcId={tcId}
          course={course}
          budget={budget}
          canSend={canSend}
          late={windowState.phase === "late"}
          onSubmitted={() => {
            mutate("/ta-requests");
            toast.success("ส่งคำขอ TA เรียบร้อยแล้ว", { description: "รอเจ้าหน้าที่ตรวจสอบและอนุมัติ" });
          }}
        />
      )}

      <RequestsTable rows={courseReqs} loading={!allReqs} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Budget forecast — course budget summary shown before submitting a request  */
/* -------------------------------------------------------------------------- */

function BudgetForecast({ budget }: { budget: CourseBudget }) {
  const fmt = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return (
    <div className="mb-4">
      <Alert
        status="warning"
        icon={<Wallet size={16} />}
        title="งบวิชานี้เกินเพดานแล้ว (โดยประมาณ)"
        description={
          <>
            ใช้ไปแล้ว ~{fmt(budget.used_baht)} จากเพดาน ~{fmt(budget.per_course_max)} —
            {" "}ถ้าเพิ่ม TA อีก การเบิกจ่ายอาจไม่ครบตามที่ควรได้{" "}
            <b>รบกวนแจ้งนักศึกษาให้ทราบล่วงหน้า</b>
          </>
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Request form (inline — no modal)                                            */
/* -------------------------------------------------------------------------- */

function RequestFormSection({
  tcId, course, budget, canSend, late, onSubmitted,
}: {
  tcId: string;
  course?: {
    id: string; code: string; name_th: string;
    lecture_hrs?: number; lab_hrs?: number;
    sections?: Section[];
  };
  budget?: CourseBudget;
  /** false = นอกช่วงเปิดรับคำขอ — ฟอร์มยังกรอก/คำนวณได้ แต่ส่งไม่ได้ */
  canSend?: boolean;
  late?: boolean;
  onSubmitted: () => void;
}) {
  // Candidates carry each TA's approved-course count so we can keep those who
  // already hit the 3-course cap out of the picker (prevents over-quota requests
  // up front, instead of a reject at submit time).
  const candidatesKey = tcId ? `/ta-requests/candidates?teaching_course_id=${tcId}` : null;
  const { data: tas } = useSWR<{ items: TA[] }>(candidatesKey);
  // เพดาน ชม./วัน ตามประกาศ — ใช้กันไม่ให้กรอกภาระงานที่ลงบันทึกเวลาจริงไม่ได้
  const { data: payCaps } = useSWR<PayRateCaps>("/settings/pay-rate");
  // Every TA stays in the list. Those who cannot be added are shown disabled
  // with the reason attached, because hiding them was actively harmful: a
  // lecturer who could not find someone assumed they had no account and went
  // off to create a duplicate, which then failed on the unique email.
  const allTas = useMemo(() => tas?.items ?? [], [tas]);

  // Q&A rule 3: default reimburse_scope from the course's credit hours.
  //   lecture-only → "lecture"; lab-only → "lab"; both → "both".
  // User can still override to handle mismatch cases (e.g. old IT curriculum
  // where a course has lab credits but the lecturer only teaches lecture).
  const defaultScope = useMemo<"lecture" | "lab" | "both">(() => {
    const lec = course?.lecture_hrs ?? 0;
    const lab = course?.lab_hrs ?? 0;
    if (lec > 0 && lab === 0) return "lecture";
    if (lab > 0 && lec === 0) return "lab";
    return "both";
  }, [course?.id, course?.lecture_hrs, course?.lab_hrs]);

  const [scope, setScope] = useState<"lecture" | "lab" | "both">(defaultScope);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [creatingTa, setCreatingTa] = useState(false);
  // Schedule-conflict cache lifted from AssignmentBlock: keyed by TA id so the
  // modal can gate Submit on "no picked section conflicts anywhere".
  const [conflictsByTa, setConflictsByTa] = useState<Record<string, SectionConflict[]>>({});
  const reportConflicts = useCallback((taId: string, list: SectionConflict[]) => {
    setConflictsByTa(prev => {
      const cur = prev[taId];
      if (cur && cur.length === list.length && cur.every((c, i) => c.section_id === list[i].section_id)) return prev;
      return { ...prev, [taId]: list };
    });
  }, []);

  // The section mounts fresh each time the lecturer opens it, so state starts
  // empty. Re-derive the default scope once the course data loads.
  useEffect(() => {
    setScope(defaultScope);
  }, [defaultScope]);

  /* --- derived --------------------------------------------------------- */
  const firstSectionId = course?.sections?.[0]?.id ?? "";

  const taChosen = assignments.length > 0 && assignments.every(a => a.ta_id);
  // Grad TAs must land in [10, 12] hr/week (regulation for บัณฑิตศึกษา);
  // undergrad just needs > 0. The >12 side is prevented via per-field caps so
  // here we only need to gate the lower bound.
  const weeklyCapFor = useCallback((a: Assignment) => {
    const tracks = (course?.sections ?? [])
      .filter(s => a.section_ids.includes(s.id))
      .map(s => s.track);
    // หลาย section คนละภาค → ยึดเพดานที่เข้มกว่า
    const caps = tracks.map(t => dailyHourCap(a.level, t, payCaps));
    const daily = caps.length ? Math.min(...caps) : dailyHourCap(a.level, "regular", payCaps);
    return daily * WORKING_DAYS_PER_WEEK;
  }, [course?.sections, payCaps]);

  const secs = course?.sections ?? [];

  // Every section's declared hours must fit inside how long THAT SECTION
  // actually meets each week for that kind. Mirrors validateUndergradSectionCaps
  // so the Send button reflects the verdict the server will reach — checked here
  // rather than only on submit.
  const sectionCapsOk = assignments.every(a =>
    a.section_ids.every(sid => {
      const w = workloadOf(a, sid);
      if (a.level === "master" || a.level === "phd") return true; // grad uses the 10–12 total
      const hrs = sectionWeeklyHours(secs.find(x => x.id === sid));
      // ปฏิบัติการ is either-or; declaring both is refused server-side.
      if (w.lab_hrs > 0.001 && w.lab_other_hrs > 0.001) return false;
      // Each field against the class hours, then each SIDE's total against the
      // multiple of them — a field-only check let three lecture fields at the
      // ceiling declare three times the group's real teaching time.
      const lecTotal = w.check_work_hrs + w.attendance_hrs + w.ug_other_hrs;
      const labTotal = w.lab_hrs + w.lab_other_hrs;
      if (hrs.lecture > 0 && lecTotal > hrs.lecture * SECTION_TOTAL_MULTIPLIER + 0.001) return false;
      if (hrs.lab > 0 && labTotal > hrs.lab * SECTION_TOTAL_MULTIPLIER + 0.001) return false;
      return w.check_work_hrs <= hrs.lecture + 0.001
        && w.attendance_hrs <= hrs.lecture + 0.001
        && w.ug_other_hrs <= hrs.lecture + 0.001
        && w.lab_hrs <= hrs.lab + 0.001
        && w.lab_other_hrs <= hrs.lab + 0.001;
    }));

  const workloadOk = assignments.length > 0 && sectionCapsOk && assignments.every(a => {
    const t = sumWorkload(a, secs);
    if (t > weeklyCapFor(a)) return false; // ลงบันทึกเวลาจริงไม่ได้ตามเพดาน ชม./วัน
    if (a.level === "master" || a.level === "phd") return t >= GRAD_MIN_HRS && t <= GRAD_MAX_HRS;
    return t > 0;
  });
  const sectionChosen = assignments.length > 0 && assignments.every(a => a.section_ids.length > 0);
  // Only a clash with ANOTHER course the TA already assists blocks the send.
  //
  // A clash with the TA's own class no longer does. It cannot be resolved by
  // removing the TA — the group still needs one — and it does not stop them
  // working: the in-class duty for the clashing kind is disabled above, while
  // grading and other work carry on outside the session. Refusing the whole
  // request threw away sections that were perfectly workable.
  const anyScheduleConflict = assignments.some(a => {
    if (!a.ta_id) return false;
    const conflicts = conflictsByTa[a.ta_id];
    if (!conflicts?.length) return false;
    const blocking = new Set(conflicts.filter(c => c.cross_conflict).map(c => c.section_id));
    return a.section_ids.some(sid => blocking.has(sid));
  });

  const canSubmit = taChosen && workloadOk && sectionChosen && !anyScheduleConflict;

  // TAs on this form who have not filed a timetable yet. Submitting is still
  // allowed — that is the point of the change — but the request will rest
  // unjudged until they do, and any session that turns out to clash with their
  // own class is dropped. The lecturer has to know that before committing.
  const waitingOnSchedule = useMemo(() => {
    const byId = new Map(allTas.map(t => [t.id, t]));
    const names: string[] = [];
    for (const a of assignments) {
      const t = a.ta_id ? byId.get(a.ta_id) : undefined;
      if (t && t.has_schedule === false) names.push(`${t.first_name} ${t.last_name}`);
    }
    return names;
  }, [assignments, allTas]);

  const [confirming, setConfirming] = useState(false);

  /* --- helpers --------------------------------------------------------- */
  function addAssignment(secId?: string, taId = "", level = "undergrad") {
    const initial = secId ?? firstSectionId;
    setAssignments(a => [...a, {
      section_ids: initial ? [initial] : [],
      ta_id: taId,
      level,
      section_workloads: initial ? { [initial]: emptyWorkload() } : {},
    }]);
  }
  function removeAssignment(idx: number) {
    setAssignments(a => a.filter((_, i) => i !== idx));
  }
  function updateAssign(idx: number, patch: Partial<Assignment>) {
    setAssignments(a => a.map((x, i) => i === idx ? { ...x, ...patch } : x));
  }
  function updateWorkload(idx: number, sectionId: string, patch: Partial<WorkloadFields>) {
    setAssignments(a => a.map((x, i) => {
      if (i !== idx) return x;
      const current = workloadOf(x, sectionId);
      return {
        ...x,
        section_workloads: { ...x.section_workloads, [sectionId]: { ...current, ...patch } },
      };
    }));
  }

  async function submit() {
    if (!tcId) return;
    setErr(null); setPending(true);
    try {
      // Derive per-section counts from the assignment list so the backend
      // still receives the "ta_request_counts" rows it expects. A TA on N
      // sections is counted once per section — matching how the backend
      // materialises N ta_request_assignments rows for the same TA.
      const bySection = new Map<string, { undergrad_count: number; graduate_count: number }>();
      for (const s of course?.sections ?? []) {
        bySection.set(s.id, { undergrad_count: 0, graduate_count: 0 });
      }
      for (const a of assignments) {
        for (const sid of a.section_ids) {
          const c = bySection.get(sid) ?? { undergrad_count: 0, graduate_count: 0 };
          if (a.level === "master" || a.level === "phd") c.graduate_count += 1;
          else c.undergrad_count += 1;
          bySection.set(sid, c);
        }
      }
      const res = await api.post<{
        id: string;
        status: "approved" | "rejected" | "submitted";
        reject_reason?: string;
      }>("/ta-requests", {
        teaching_course_id: tcId,
        reimburse_scope: scope,
        counts: [...bySection.entries()].map(([section_id, c]) => ({ section_id, ...c })),
        assignments: assignments.map(a => ({
          section_ids: a.section_ids,
          ta_id: a.ta_id,
          level: a.level,
          section_workloads: a.section_ids.map(sid => ({
            section_id: sid,
            workload: workloadOf(a, sid),
          })),
        })),
      });
      if (res.status === "rejected") {
        // Under the auto-decide model, business-rule failures come back as a
        // 200 with status='rejected'. Show the system-generated reason inline
        // so the lecturer can fix it and resubmit.
        const reason = res.reject_reason || "ระบบตัดสินว่าคำขอไม่ผ่านเกณฑ์";
        setErr(reason);
        notify.error(reason);
        return;
      }
      if (res.status === "submitted") {
        // Deferred decision: at least one TA has no timetable yet, so there is
        // nothing to judge. Say so plainly rather than implying approval.
        notify.success("ส่งคำขอแล้ว — ระบบจะตัดสินให้อัตโนมัติเมื่อ TA สร้างตารางเรียนครบทุกคน");
        onSubmitted();
        return;
      }
      notify.success("ระบบอนุมัติคำขอเรียบร้อยแล้ว");
      onSubmitted();
    } catch (e) {
      // Structural failures (bad section, negative workload, TA doesn't exist)
      // still throw at Create time — surface the Thai message so the lecturer
      // can correct the form.
      setErr((e as Error).message);
      notify.error(e);
    }
    finally { setPending(false); }
  }

  const steps = [
    { n: 1, label: "ประเภทการเบิก", icon: <Wallet size={14} />, ok: true },
    { n: 2, label: "เลือก TA", icon: <ClipboardList size={14} />, ok: taChosen },
    { n: 3, label: "ภาระงาน", icon: <CheckCircle2 size={14} />, ok: workloadOk },
  ];

  const scopeLabel = scope === "lecture" ? "บรรยาย" : scope === "lab" ? "ปฏิบัติการ" : "บรรยาย+ปฏิบัติการ";
  return (
    <Panel className="mb-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent-soft-foreground flex items-center justify-center shrink-0">
          <Send size={16} />
        </div>
        <div className="min-w-0">
          <div className="font-semibold">ส่งคำขอผู้ช่วยสอน</div>
          <div className="text-xs text-muted">ทำทีละขั้นตามหมายเลข แล้วกด “ส่งคำขอ” ด้านล่าง</div>
        </div>
      </div>

      {late && (
        <div className="mb-4">
          <Alert
            status="warning"
            icon={<AlertCircle size={16} />}
            title="คำขอนี้จะถูกนับเป็น “ส่งช้า”"
            description="เลยกำหนดส่งแล้ว — ยังส่งได้ตามปกติ แต่คำขอจะถูกทำเครื่องหมายว่าล่าช้า และการเบิกจ่ายค่าตอบแทนของ TA จะล่าช้าไปด้วย"
          />
        </div>
      )}

      {/* เครื่องคิดเลขงบ — ให้อาจารย์ลองคำนวณก่อนตัดสินใจว่าจะรับ TA กี่คน */}
      <TaBudgetCalculator
        tcId={tcId}
        hasSpecialSection={(course?.sections ?? []).some(s => s.track === "special")}
      />

      {/* เตือนเฉพาะกรณีงบจริงเกินเพดานแล้ว — ตัวเลขปกติอยู่ในเครื่องคิดเลขข้างบน */}
      {budget?.over_budget && <BudgetForecast budget={budget} />}

      {/* Step progress indicator */}
      <div className="rounded-xl border border-border bg-panel p-3 mb-4 overflow-x-auto">
        <ol className="flex items-center gap-2 min-w-max">
          {steps.map((s, i) => (
            <li key={s.n} className="flex items-center gap-2">
              <StepPill n={s.n} label={s.label} icon={s.icon} ok={s.ok} />
              {i < steps.length - 1 && <span className="w-6 h-px bg-border" />}
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-4">
        {/* Step 1 --------------------------------------------------------- */}
        <StepPanel n={1} title="ประเภทการเบิกค่าตอบแทน" description="เลือกให้ตรงกับหน่วยกิตวิชา">
          <RadioGroup
            value={scope}
            onChange={v => setScope(v as "lecture" | "lab" | "both")}
            orientation="horizontal"
            className="w-full"
          >
            <Label className="sr-only">ประเภทการเบิก</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 w-full">
              <ScopeRadio value="lecture" label="เฉพาะบรรยาย" desc="Lecture only" />
              <ScopeRadio value="lab" label="เฉพาะปฏิบัติการ" desc="Lab only" />
              <ScopeRadio value="both" label="บรรยาย + ปฏิบัติการ" desc="Lec. + Lab" />
            </div>
          </RadioGroup>
        </StepPanel>

        {/* Step 2 --------------------------------------------------------- */}
        <StepPanel
          n={2}
          title="เพิ่มรายชื่อ TA และกำหนดภาระงาน"
          description="เพิ่ม TA ทีละคน เลือก section และกรอกภาระงานของแต่ละคน"
          status={
            assignments.length === 0
              ? { tone: "warn", text: "ยังไม่ได้เพิ่ม TA" }
              : !taChosen
              ? { tone: "warn", text: "ยังไม่ได้เลือก TA" }
              : !sectionChosen
              ? { tone: "warn", text: "ยังไม่ได้เลือก section" }
              : anyScheduleConflict
              ? { tone: "danger", text: "มี TA ที่ตารางทับซ้อน — เอาชื่อออกก่อน" }
              : !workloadOk
              ? { tone: "warn", text: "ภาระงานยังไม่ครบตามระเบียบ" }
              : { tone: "success", text: `${assignments.length} คน · พร้อมส่ง` }
          }
        >
          {!course?.sections?.length ? (
            <EmptyState title="ยังไม่มี section ในรายวิชานี้" />
          ) : (
            <div className="space-y-3">
              {/* Toolbar with add + create buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 border border-hairline px-3 py-2">
                <div className="text-xs text-ink-3">
                  รวม TA ในวิชานี้ <b className="text-ink-1">{assignments.length}</b> คน
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCreatingTa(true)}
                  >
                    <UserPlus size={14} /> สร้างบัญชี TA ใหม่
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => addAssignment()}
                  >
                    <Plus size={14} /> เพิ่ม TA
                  </Button>
                </div>
              </div>

              {/* Inline create-TA panel (no stacked modal) */}
              {creatingTa && (
                <CreateTaPanel
                  onClose={() => setCreatingTa(false)}
                  onCreated={ta => {
                    // Refresh candidates so the new TA (0 courses → not at quota)
                    // appears immediately, then auto-add + close the panel.
                    if (candidatesKey) mutate(candidatesKey);
                    addAssignment(undefined, ta.id, ta.study_level ?? "undergrad");
                    setCreatingTa(false);
                  }}
                />
              )}

              {/* Unified assignment list */}
              {assignments.length === 0 ? (
                <div className="text-xs text-ink-3 text-center py-8 border border-dashed border-hairline rounded-lg">
                  ยังไม่ได้เพิ่ม TA — กดปุ่ม "เพิ่ม TA" ด้านบน
                </div>
              ) : (
                <div className="space-y-3">
                  {assignments.map((a, idx) => {
                    const takenElsewhere = new Set(
                      assignments.filter((_, i) => i !== idx).map(x => x.ta_id).filter(Boolean),
                    );
                    return (
                      <AssignmentBlock
                        key={idx}
                        idx={idx}
                        n={idx + 1}
                        assignment={a}
                        sections={course?.sections ?? []}
                        tas={allTas.filter(t => !takenElsewhere.has(t.id))}
                        scope={scope}
                        weeklyCap={weeklyCapFor(a)}
                        tcId={tcId}
                        onConflicts={reportConflicts}
                        onUpdate={updateAssign}
                        onWorkload={updateWorkload}
                        onRemove={() => removeAssignment(idx)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </StepPanel>

        {waitingOnSchedule.length > 0 && (
          <Alert
            status="warning"
            title="มี TA ที่ยังไม่ได้สร้างตารางเรียน"
            description={
              `${waitingOnSchedule.join(", ")} ยังไม่ได้บันทึกตารางเรียนของภาคเรียนนี้ — ` +
              "ส่งคำขอได้ตามปกติ แต่ระบบจะยังไม่ตัดสินจนกว่าจะสร้างครบทุกคน " +
              "และถ้าคาบใดตรงกับตารางเรียนของเขา คาบนั้นจะถูกตัดออกโดยอัตโนมัติ"
            }
            icon={<CalendarClock size={18} />}
          />
        )}

        {err && (
          <Alert status="danger" title="ส่งคำขอไม่สำเร็จ" description={err} icon={<AlertCircle size={18} />} />
        )}
      </div>

      {/* Inline footer */}
      <div className="mt-4 pt-3 border-t border-hairline flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-ink-3">
          <span>เพิ่มแล้ว <b className="text-ink-1">{assignments.length}</b> คน</span>
          <span>เบิก <b className="text-ink-1">{scopeLabel}</b></span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => { setAssignments([]); setErr(null); }}
            disabled={assignments.length === 0}
          >
            ล้างฟอร์ม
          </Button>
          <Button
            variant="primary"
            // Consequences that only bite AFTER submit (a deferred verdict,
            // sessions dropped later, unapproved documents) are explained in a
            // confirmation step rather than left to be discovered.
            onClick={() => (waitingOnSchedule.length > 0 ? setConfirming(true) : submit())}
            disabled={!canSubmit || pending || canSend === false}
            isPending={pending}
          >
            <Send size={16} />
            {pending ? "กำลังส่ง…" : `ส่งคำขอ (${assignments.length} คน)`}
          </Button>
        </div>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="ยืนยันการส่งคำขอ"
        icon={<CalendarClock size={18} />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>ย้อนกลับ</Button>
            <Button
              variant="primary"
              isPending={pending}
              onClick={() => { setConfirming(false); submit(); }}
            >
              <Send size={16} /> ยืนยันส่งคำขอ
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-ink-2">
            คำขอนี้มี TA ที่ยังไม่ได้บันทึกตารางเรียนของภาคเรียนนี้
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            {waitingOnSchedule.map(n => (
              <li key={n} className="font-medium text-ink-1">{n}</li>
            ))}
          </ul>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1.5 text-xs text-amber-900">
            <p className="font-semibold">สิ่งที่จะเกิดขึ้นหลังกดส่ง</p>
            <p>• คำขอจะยังไม่ถูกตัดสิน จนกว่า TA ทุกคนในคำขอจะสร้างตารางเรียนครบ</p>
            <p>
              • ถ้าคาบสอนใดตรงกับตารางเรียนของ TA ระบบจะ<b>ตัดคาบนั้นออกทั้งคาบ</b>โดยอัตโนมัติ
              เพราะเขาต้องไปเรียน — และจะแจ้งทั้งคุณและ TA
            </p>
            <p>• ถ้าทุกคาบตรงกับตารางเรียนของเขา TA คนนั้นจะถูกตัดออกจากวิชานี้ และคืนโควตาให้ไปรับวิชาอื่นได้</p>
          </div>
          <p className="text-xs text-ink-3">
            ที่นั่งของ TA ทุกคนในคำขอถูกจองไว้ตั้งแต่ตอนกดส่ง (นับเข้าโควตา {MAX_COURSES_PER_TA} วิชา) แม้ยังไม่ได้ตัดสิน
          </p>
        </div>
      </Modal>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function StepPill({
  n, label, icon, ok,
}: { n: number; label: string; icon: React.ReactNode; ok: boolean }) {
  return (
    <div className={
      "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs whitespace-nowrap " +
      (ok
        ? "bg-brand-soft text-brand border border-brand/20"
        : "bg-slate-50 text-ink-3 border border-hairline")
    }>
      <span className={
        "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold " +
        (ok ? "bg-brand text-white" : "bg-white border border-border")
      }>
        {ok ? <CheckCircle2 size={12} /> : n}
      </span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

function StepPanel({
  n, title, description, status, children,
}: {
  n: number;
  title: string;
  description?: string;
  status?: { tone: "success" | "warn" | "danger" | "neutral"; text: string };
  children: React.ReactNode;
}) {
  return (
    <Panel padded={false}>
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-hairline">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand flex items-center justify-center font-semibold shrink-0">
            {n}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm">{title}</div>
            {description && <div className="text-xs text-ink-3 mt-0.5">{description}</div>}
          </div>
        </div>
        {status && (
          <Chip tone={status.tone === "warn" ? "warn" : status.tone === "danger" ? "danger" : status.tone === "success" ? "success" : "neutral"}>
            {status.text}
          </Chip>
        )}
      </div>
      <div className="p-4">{children}</div>
    </Panel>
  );
}

function ScopeRadio({ value, label, desc }: { value: string; label: string; desc: string }) {
  return (
    <Radio value={value} className="border border-border rounded-lg px-3 py-2 hover:bg-slate-50 data-selected:bg-brand-soft data-selected:border-brand/40">
      <Radio.Content>
        <Radio.Control>
          <Radio.Indicator />
        </Radio.Control>
        <div className="flex flex-col">
          <span className="font-medium">{label}</span>
          <Description className="text-xs text-ink-3">{desc}</Description>
        </div>
      </Radio.Content>
    </Radio>
  );
}

/**
 * Total weekly hours this TA actually works, counting each co-taught group
 * once. Two sections meeting in the same slot are one sitting — billing both
 * would double-count time the person spends once. Matches the server's
 * billableWeeklyTotal.
 */
function sumWorkload(a: Assignment, sections: Section[]): number {
  const groups = cotaughtGroups(sections, a.section_ids);
  const counted = new Set<number>();
  let total = 0;
  for (const sid of a.section_ids) {
    const g = groups.get(sid);
    if (g !== undefined) {
      if (counted.has(g)) continue;
      counted.add(g);
    }
    total += sectionHours(workloadOf(a, sid), a.level);
  }
  return total;
}

function AssignmentBlock({
  idx, n, assignment: a, sections, tas, scope, weeklyCap, tcId, onConflicts, onUpdate, onWorkload, onRemove,
}: {
  idx: number;
  n: number;
  assignment: Assignment;
  sections: Section[];
  tas: TA[];
  scope: "lecture" | "lab" | "both";
  /** เพดาน ชม./สัปดาห์ = เพดาน ชม./วัน ตามประกาศ × วันทำการ */
  weeklyCap: number;
  tcId: string;
  onConflicts: (taId: string, list: SectionConflict[]) => void;
  onUpdate: (idx: number, patch: Partial<Assignment>) => void;
  onWorkload: (idx: number, sectionId: string, patch: Partial<WorkloadFields>) => void;
  onRemove: () => void;
}) {
  const isGrad = a.level === "master" || a.level === "phd";
  const total = sumWorkload(a, sections);
  // Which of the picked sections are taught together. Drives the "billed once"
  // badge and keeps the total from double-counting a single sitting.
  const coGroups = useMemo(
    () => cotaughtGroups(sections, a.section_ids),
    [sections, a.section_ids],
  );

  // Preview schedule conflicts for this TA against every section of the
  // course. Runs whenever a TA is picked; the modal's Submit gate consumes
  // this data via onConflicts so a conflicting TA can't be sent through.
  const { data: conflictsData } = useSWR<ConflictsResp>(
    a.ta_id && tcId ? `/ta-requests/preview-conflicts?ta_id=${a.ta_id}&teaching_course_id=${tcId}` : null,
  );
  const conflicts = conflictsData?.conflicts ?? [];
  useEffect(() => {
    if (a.ta_id) onConflicts(a.ta_id, conflicts);
  }, [a.ta_id, conflicts, onConflicts]);
  const conflictBySection = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of conflicts) m.set(c.section_id, c.messages);
    return m;
  }, [conflicts]);
  const pickedConflicts = a.section_ids
    .map(sid => ({ sid, msgs: conflictBySection.get(sid) ?? [] }))
    .filter(x => x.msgs.length > 0);
  const blocked = pickedConflicts.length > 0;

  const ta = tas.find(t => t.id === a.ta_id);

  return (
    <div className={
      "rounded-lg border bg-white overflow-hidden " +
      (blocked ? "border-red-300" : "border-hairline")
    }>
      {/* Header */}
      <div className={
        "flex items-center justify-between gap-2 px-3 py-2 border-b " +
        (blocked ? "bg-red-50 border-red-200" : "bg-slate-50 border-hairline")
      }>
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Chip tone={blocked ? "danger" : "brand"}>คนที่ {n}</Chip>
          {ta ? (
            <>
              <span className="font-medium text-sm truncate">{ta.first_name} {ta.last_name}</span>
              <span className="text-xs text-ink-3 truncate">{ta.email}</span>
            </>
          ) : (
            <span className="text-xs text-ink-3">ยังไม่ได้เลือก TA</span>
          )}
        </div>
        <IconButton label="ลบ" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 size={14} />
        </IconButton>
      </div>

      <div className="p-3 space-y-3">
        {/* TA + level picker */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-3">
          <TaAutocomplete
            tas={tas}
            value={a.ta_id}
            onChange={(taId, level) => onUpdate(idx, { ta_id: taId, level })}
          />
          <FieldGroup label="ระดับ">
            <div className="h-9 flex items-center">
              <Chip tone={isGrad ? "brand" : "neutral"}>
                {a.level === "undergrad" ? "ปริญญาตรี" : a.level === "master" ? "ปริญญาโท" : a.level === "phd" ? "ปริญญาเอก" : a.level}
              </Chip>
            </div>
          </FieldGroup>
        </div>

        {/* Section multi-select — a TA may cover more than one section in the
            same course; each selected section becomes its own worklog target.
            Conflicting sections are surfaced inline so the lecturer sees the
            problem while picking, not after clicking Send. */}
        <SectionPicker
          sections={sections}
          value={a.section_ids}
          onChange={v => onUpdate(idx, { section_ids: v })}
          conflictBySection={conflictBySection}
        />

        {/* Blocking banner when the TA's currently-picked sections clash with
            their own class schedule or an approved TA duty elsewhere. */}
        {blocked && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800 space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertCircle size={13} />
              TA คนนี้มีตารางทับซ้อน — กรุณาเอาชื่อออกหรือเปลี่ยน section
            </div>
            <ul className="pl-5 list-disc space-y-0.5">
              {pickedConflicts.flatMap(x =>
                x.msgs.map((m, i) => <li key={`${x.sid}-${i}`}>{m}</li>),
              )}
            </ul>
          </div>
        )}

        {/* Workload section — disabled visually and via pointer-events while
            a schedule conflict is unresolved so the lecturer must fix the
            picking before entering hours. */}
        <div className={blocked ? "opacity-50 pointer-events-none select-none" : ""}>
          {a.section_ids.length === 0 ? (
            <div className="text-xs text-ink-3 py-3 text-center border border-dashed border-hairline rounded-md">
              เลือก section ก่อน จึงจะกำหนดชั่วโมงได้
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-medium text-ink-2">
                ชั่วโมงทำงานต่อสัปดาห์ — กำหนดแยกแต่ละกลุ่มเรียน
              </div>
              {a.section_ids.map(sid => {
                const sec = sections.find(s => s.id === sid);
                const w = workloadOf(a, sid);
                const group = coGroups.get(sid);
                // Sections sharing a group meet in one sitting, so the hours
                // entered here are billed once for the whole group.
                const mates = group === undefined ? [] : a.section_ids
                  .filter(x => x !== sid && coGroups.get(x) === group)
                  .map(x => sections.find(s => s.id === x)?.sec_no ?? "?");
                return (
                  <div key={sid} className="rounded-md border border-hairline overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap px-3 py-1.5 bg-slate-50 border-b border-hairline">
                      <Chip tone="neutral">Sec {sec?.sec_no ?? "—"}</Chip>
                      {sec?.track === "special" && <span className="text-[11px] text-ink-3">ภาคพิเศษ</span>}
                      {mates.length > 0 && (
                        <span className="text-[11px] text-brand">
                          สอนพร้อมกับ Sec {mates.join(", ")} — เบิกรวมเป็นก้อนเดียว
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      {isGrad ? (
                        (() => {
                          // Grad regulation bounds the TA's TOTAL at 12 h/week,
                          // so each field may only grow by what the total has
                          // left — computed across sections, counting a
                          // co-taught group once.
                          const remaining = Math.max(0, GRAD_MAX_HRS - total);
                          const cap = (v: number) => v + remaining;
                          return (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <HrsRow label="ช่วยสอน" hrs={w.help_teach_hrs} desc={w.help_teach_desc}
                                max={cap(w.help_teach_hrs)}
                                onH={v => onWorkload(idx, sid, { help_teach_hrs: v })}
                                onD={v => onWorkload(idx, sid, { help_teach_desc: v })} />
                              <HrsRow label="เตรียมการสอน" hrs={w.prep_hrs} desc={w.prep_desc}
                                max={cap(w.prep_hrs)}
                                onH={v => onWorkload(idx, sid, { prep_hrs: v })}
                                onD={v => onWorkload(idx, sid, { prep_desc: v })} />
                              <HrsRow label="ตรวจแบบทดสอบ" hrs={w.grade_hrs} desc={w.grade_desc}
                                max={cap(w.grade_hrs)}
                                onH={v => onWorkload(idx, sid, { grade_hrs: v })}
                                onD={v => onWorkload(idx, sid, { grade_desc: v })} />
                              <HrsRow label="อื่น ๆ" hrs={w.other_hrs} desc={w.other_desc}
                                max={cap(w.other_hrs)}
                                onH={v => onWorkload(idx, sid, { other_hrs: v })}
                                onD={v => onWorkload(idx, sid, { other_desc: v })} />
                            </div>
                          );
                        })()
                      ) : (
                        <UndergradWorkload
                          idx={idx}
                          sectionId={sid}
                          workload={w}
                          scope={scope}
                          lectureHrs={sectionWeeklyHours(sections.find(x => x.id === sid)).lecture}
                          labHrs={sectionWeeklyHours(sections.find(x => x.id === sid)).lab}
                          blockedKinds={conflicts.find(c => c.section_id === sid)?.blocked_kinds ?? []}
                          onWorkload={onWorkload}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Total footer */}
        {(() => {
          const gradUnder = isGrad && total < GRAD_MIN_HRS;
          const gradOver = isGrad && total > GRAD_MAX_HRS;
          // เกินเพดานรายวันตามประกาศ → ลงบันทึกเวลาจริงไม่ได้ ต้องบล็อก
          const overDaily = total > weeklyCap;
          const bad = gradUnder || gradOver || overDaily || (!isGrad && total === 0);
          const msg = overDaily
            ? `เกิน ${weeklyCap.toFixed(0)} ชม./สัปดาห์ ที่ลงบันทึกเวลาได้จริง (เพดาน ${(weeklyCap / WORKING_DAYS_PER_WEEK).toFixed(0)} ชม./วัน ตามประกาศ × ${WORKING_DAYS_PER_WEEK} วันทำการ)`
            : gradUnder
            ? `ต้องกรอกอย่างน้อย ${GRAD_MIN_HRS} ชม./สัปดาห์ ตามระเบียบบัณฑิตศึกษา — ยังส่งคำขอไม่ได้`
            : gradOver
            ? `เกินขีดจำกัด ${GRAD_MAX_HRS} ชม./สัปดาห์`
            : !isGrad && total === 0
            ? "ยังไม่ได้ระบุภาระงาน"
            : isGrad
            ? "อยู่ในช่วง 10–12 ชม./สัปดาห์"
            : "ภาระงานรวม";
          return (
            <div className={
              "flex items-center justify-between rounded-md px-3 py-2 text-xs " +
              (bad ? "bg-amber-50 text-amber-800" : total === 0 ? "bg-slate-50 text-ink-3" : "bg-brand-soft text-brand")
            }>
              <span className="flex items-center gap-1.5">
                {bad ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
                {msg}
              </span>
              <span className="font-semibold">{total.toFixed(1)} ชม./สัปดาห์</span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function UndergradWorkload({
  idx, sectionId, workload, scope, lectureHrs, labHrs, blockedKinds, onWorkload,
}: {
  idx: number;
  sectionId: string;
  workload: WorkloadFields;
  scope: "lecture" | "lab" | "both";
  // The ceiling is how long this section ACTUALLY meets each week for that
  // kind, read from its timetable. It used to come from the credit notation —
  // the figures inside 3(2-2-5) — which does not track reality: a course with
  // one credit-hour of lab can meet for three real hours, and the TA standing
  // in that room was capped at one.
  lectureHrs: number;
  labHrs: number;
  // Session kinds whose every meeting collides with this TA's own class. Only
  // the in-class duty is disabled — เช็คชื่อ for lecture, สอนปฏิบัติการ for lab.
  // Grading and other work happen outside the session and stay available, which
  // is why the section is still worth assigning at all.
  blockedKinds: string[];
  onWorkload: (idx: number, sectionId: string, patch: Partial<WorkloadFields>) => void;
}) {
  const showLec = scope === "lecture" || scope === "both";
  const showLab = scope === "lab" || scope === "both";
  const lecBlocked = blockedKinds.includes("lecture");
  const labBlocked = blockedKinds.includes("lab");
  const capHint = (hrs: number) =>
    hrs <= 0
      ? "กลุ่มนี้ไม่มีคาบประเภทนี้ในตารางสอน"
      : `สูงสุด ${hrs.toFixed(1)} ชม./สัปดาห์ ต่อกลุ่ม (ตามตารางสอนจริง)`;

  // ปฏิบัติการ is either-or: running the session, or supporting it from outside.
  // Ticking one clears the other so the form cannot submit a pair the server
  // will refuse.
  const labMode: "teach" | "other" | null =
    workload.lab_hrs > 0 ? "teach" : workload.lab_other_hrs > 0 ? "other" : null;

  return (
    <div className="space-y-3">
      {showLec && (
        <div className="rounded-md border border-hairline p-3">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <div className="text-xs font-medium text-ink-2">1. ชั่วโมงบรรยาย (ปริญญาตรี)</div>
            <div className="flex items-center gap-2 flex-wrap">
              <SideTotal
                used={workload.check_work_hrs + workload.attendance_hrs + workload.ug_other_hrs}
                hrs={lectureHrs}
              />
              <span className="text-[11px] text-ink-3">{capHint(lectureHrs)}</span>
            </div>
          </div>
          {lecBlocked && (
            <div className="mb-2 text-[11px] text-amber-700">
              ทุกคาบบรรยายของกลุ่มนี้ตรงกับตารางเรียนของ TA — เช็คชื่อไม่ได้ แต่ยังช่วยตรวจงาน/งานอื่นนอกคาบได้
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <CheckHrs
              label="ช่วยตรวจงาน"
              hrs={workload.check_work_hrs}
              max={lectureHrs}
              onH={v => onWorkload(idx, sectionId, { check_work_hrs: v })}
            />
            <CheckHrs
              label="เช็คชื่อ / เก็บใบงาน"
              hrs={workload.attendance_hrs}
              max={lectureHrs}
              disabled={lecBlocked}
              disabledHint="ตรงกับตารางเรียนของ TA ทุกคาบ"
              onH={v => onWorkload(idx, sectionId, { attendance_hrs: v })}
            />
            <div className="md:col-span-2">
              <CheckHrs
                label="อื่น ๆ"
                hrs={workload.ug_other_hrs}
                desc={workload.ug_other_desc}
                max={lectureHrs}
                hint={capHint(lectureHrs)}
                onH={v => onWorkload(idx, sectionId, { ug_other_hrs: v })}
                onD={v => onWorkload(idx, sectionId, { ug_other_desc: v })}
              />
            </div>
          </div>
        </div>
      )}
      {showLab && (
        <div className="rounded-md border border-hairline p-3">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <div className="text-xs font-medium text-ink-2">2. ชั่วโมงปฏิบัติการ</div>
            <div className="flex items-center gap-2 flex-wrap">
              <SideTotal used={workload.lab_hrs + workload.lab_other_hrs} hrs={labHrs} />
              <span className="text-[11px] text-ink-3">{capHint(labHrs)}</span>
            </div>
          </div>
          <div className="mb-2 text-[11px] text-ink-3">เลือกได้อย่างใดอย่างหนึ่ง</div>
          {labBlocked && (
            <div className="mb-2 text-[11px] text-amber-700">
              ทุกคาบปฏิบัติการของกลุ่มนี้ตรงกับตารางเรียนของ TA — สอนปฏิบัติการไม่ได้ แต่ยังทำงานอื่นนอกคาบได้
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <CheckHrs
              label="สอนปฏิบัติการ"
              hrs={workload.lab_hrs}
              max={labHrs}
              disabled={labBlocked || labMode === "other"}
              disabledHint={labBlocked ? "ตรงกับตารางเรียนของ TA ทุกคาบ" : "เลือก 'อื่น ๆ' ไว้แล้ว"}
              onH={v => onWorkload(idx, sectionId, { lab_hrs: v, lab_other_hrs: 0, lab_other_desc: "" })}
            />
            <div className="md:col-span-2">
              <CheckHrs
                label="อื่น ๆ (ปฏิบัติการ)"
                hrs={workload.lab_other_hrs}
                desc={workload.lab_other_desc}
                max={labHrs}
                hint={capHint(labHrs)}
                disabled={labMode === "teach"}
                disabledHint="เลือก 'สอนปฏิบัติการ' ไว้แล้ว"
                onH={v => onWorkload(idx, sectionId, { lab_other_hrs: v, lab_hrs: 0 })}
                onD={v => onWorkload(idx, sectionId, { lab_other_desc: v })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "รวม x.x / y.y ชม." for one side of the form, so the lecturer can see the
 * total ceiling while filling the fields rather than discovering it on Send.
 * Stays quiet when the group has no sessions of that kind — the per-field rows
 * already say so, and "0.0 / 0.0" reads like a bug.
 */
function SideTotal({ used, hrs }: { used: number; hrs: number }) {
  if (hrs <= 0) return null;
  const limit = hrs * SECTION_TOTAL_MULTIPLIER;
  const over = used > limit + 0.001;
  return (
    <span
      className={
        "text-[11px] rounded px-1.5 py-0.5 " +
        (over ? "bg-amber-100 text-amber-800 font-medium" : "text-ink-3")
      }
    >
      รวม {used.toFixed(1)} / {limit.toFixed(1)} ชม.
    </span>
  );
}

/**
 * Row with a checkbox (auto-enabled when hrs > 0) + hours + optional description.
 * Mirrors the "checkbox activity + hr/wk" pattern from the design mock-up.
 */
function CheckHrs({
  label, hrs, desc, max, hint, disabled: forced, disabledHint, onH, onD,
}: {
  label: string;
  hrs: number;
  desc?: string;
  max?: number;
  hint?: string;
  /** Disable regardless of the cap — a clash, or the other half of an either-or pair. */
  disabled?: boolean;
  /** Shown in place of `hint` when `disabled` is set, so the row says WHY. */
  disabledHint?: string;
  onH: (v: number) => void;
  onD?: (v: string) => void;
}) {
  const enabled = hrs > 0;
  // Disable the whole row when the cap is 0 (no sections picked yet, or this
  // group simply never meets for this kind), or when the caller forces it.
  const disabled = (max !== undefined && max <= 0) || !!forced;
  const shownHint = forced && disabledHint ? disabledHint : hint;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Checkbox
          isSelected={enabled && !disabled}
          isDisabled={disabled}
          onChange={sel => { if (!sel) onH(0); else if (hrs === 0) onH(1); }}
        >
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <span className="text-sm">{label}</span>
          </Checkbox.Content>
        </Checkbox>
        {shownHint && (
          <span className={"text-[11px] " + (forced ? "text-amber-700" : "text-ink-3")}>{shownHint}</span>
        )}
      </div>
      <div className={"flex items-center gap-2 pl-6 " + (enabled && !disabled ? "" : "opacity-50 pointer-events-none")}>
        <HourInput value={hrs} onChange={onH} maxValue={max ?? 99} />
        {onD && (
          <TextInput
            value={desc ?? ""}
            onChange={e => onD(e.target.value)}
            placeholder="กิจกรรมที่ปฏิบัติ"
            className="flex-1"
          />
        )}
      </div>
    </div>
  );
}

function HrsRow({
  label, hrs, desc, onH, onD, max,
}: { label: string; hrs: number; desc: string; onH: (v: number) => void; onD: (v: string) => void; max?: number }) {
  return (
    <FieldGroup label={label}>
      <div className="flex items-center gap-2">
        <HourInput value={hrs} onChange={onH} maxValue={max} />
        <TextInput
          value={desc}
          onChange={e => onD(e.target.value)}
          placeholder="รายละเอียดกิจกรรม"
          className="flex-1"
        />
      </div>
    </FieldGroup>
  );
}

function SectionPicker({
  sections, value, onChange, conflictBySection,
}: {
  sections: Section[];
  value: string[];
  onChange: (ids: string[]) => void;
  // Conflicting sections (by id) with reason strings. Rendered as red chips
  // with a title tooltip so the lecturer can see the problem before picking.
  conflictBySection?: Map<string, string[]>;
}) {
  const invalid = value.length === 0;
  // A section that clashes cannot be worked, so it must not be pickable — the
  // server refuses it anyway (assertNoKnownClash). Disabling here turns a
  // post-submit rejection into an obvious "you can't choose this, and here's
  // why" at the moment of choosing.
  const blockedIds = useMemo(
    () => new Set([...(conflictBySection?.keys() ?? [])]),
    [conflictBySection],
  );
  return (
    <CheckboxGroup
      value={value}
      onChange={onChange}
      className="w-full"
    >
      <Label className="text-sm font-medium">
        Section <span className="text-red-500">*</span>{" "}
        <span className="text-xs text-ink-3 font-normal">(เลือกได้หลายกลุ่ม รวมกลุ่มที่สอนพร้อมกันเวลาเดียว)</span>
      </Label>
      <div className="flex flex-wrap gap-2 mt-1">
        {sections.map(s => {
          const on = value.includes(s.id);
          const conflictMsgs = conflictBySection?.get(s.id);
          const bad = !!conflictMsgs?.length;
          return (
            <Checkbox
              key={s.id}
              value={s.id}
              isDisabled={blockedIds.has(s.id)}
              aria-label={bad ? `Sec ${s.sec_no} — ${conflictMsgs?.join("; ")}` : `Sec ${s.sec_no}`}
              className={
                "border rounded-lg px-3 py-1.5 transition-colors " +
                (bad
                  ? "border-red-300 bg-red-50/60 cursor-not-allowed opacity-70"
                  : on
                  ? "border-brand/40 bg-brand-soft cursor-pointer"
                  : "border-border hover:bg-slate-50 cursor-pointer")
              }
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <span className="text-sm">
                  Sec {s.sec_no}
                  {s.track === "special" ? (
                    <span className="text-xs text-ink-3 ml-1">· ภาคพิเศษ</span>
                  ) : null}
                  {bad && <span className="text-[10px] text-red-600 ml-1">· เลือกไม่ได้ — ตารางเรียนทับ</span>}
                </span>
              </Checkbox.Content>
            </Checkbox>
          );
        })}
      </div>
      {invalid && (
        <div className="text-xs text-red-600 mt-1">กรุณาเลือก section อย่างน้อย 1 กลุ่ม</div>
      )}
      {blockedIds.size > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {sections
            .filter(s => blockedIds.has(s.id))
            .map(s => (
              <div key={s.id} className="text-xs text-red-600">
                Sec {s.sec_no}: {conflictBySection?.get(s.id)?.join(" · ")}
              </div>
            ))}
        </div>
      )}
    </CheckboxGroup>
  );
}

function TaAutocomplete({
  tas, value, onChange,
}: {
  tas: TA[];
  value: string;
  onChange: (taId: string, level: string) => void;
}) {
  const { contains } = useFilter({ sensitivity: "base" });
  const selected = tas.find(t => t.id === value) ?? null;
  // Blocked TAs stay in the collection so they remain searchable; react-aria
  // renders them dimmed and unselectable via disabledKeys.
  const disabledKeys = useMemo(
    () => tas.filter(t => taBlockedReason(t) !== null).map(t => t.id),
    [tas],
  );

  return (
    <Autocomplete
      selectionMode="single"
      value={value || null}
      disabledKeys={disabledKeys}
      onChange={(k: Key | null) => {
        const id = k ? String(k) : "";
        const t = tas.find(x => x.id === id);
        onChange(id, t?.study_level ?? "undergrad");
      }}
      className="w-full"
      placeholder="พิมพ์ชื่อหรืออีเมลเพื่อค้นหา…"
    >
      <Label>เลือก TA</Label>
      <Autocomplete.Trigger>
        <Autocomplete.Value>
          {({ defaultChildren, isPlaceholder }) => {
            if (isPlaceholder || !selected) return defaultChildren;
            return (
              <span className="truncate">
                {selected.first_name} {selected.last_name}
                <span className="text-ink-3 text-xs ml-1">· {selected.email}</span>
              </span>
            );
          }}
        </Autocomplete.Value>
        <Autocomplete.ClearButton />
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover>
        <Autocomplete.Filter filter={contains}>
          <SearchField autoFocus name="ta-search" variant="secondary">
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="ค้นหา TA…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ListBox renderEmptyState={() => <HEmptyState>ไม่พบ TA ที่ตรงกัน</HEmptyState>}>
            {tas.map(t => {
              const blocked = taBlockedReason(t);
              const booked = t.approved_course_count ?? 0;
              return (
                <ListBox.Item
                  key={t.id}
                  id={t.id}
                  textValue={`${t.first_name} ${t.last_name} ${t.email}`}
                >
                  <div className="flex flex-col min-w-0">
                    <Label>{t.first_name} {t.last_name}</Label>
                    <Description className="text-xs">
                      {t.email} · {t.study_level === "master" ? "ป.โท" : t.study_level === "phd" ? "ป.เอก" : "ป.ตรี"}
                      {/* The count is the whole point of keeping blocked TAs
                          visible — the lecturer can see WHY, not just that the
                          name is missing. */}
                      <span className={"ml-1 font-medium " + (blocked ? "text-red-600" : "text-ink-2")}>
                        · รับสอน {booked}/{MAX_COURSES_PER_TA} วิชา
                      </span>
                      {blocked && <span className="ml-1 text-red-600">· {blocked}</span>}
                      {!blocked && t.has_schedule === false && (
                        <span className="ml-1 text-amber-600">· ยังไม่ได้สร้างตารางเรียน</span>
                      )}
                    </Description>
                  </div>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              );
            })}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}

function HourInput({
  value, onChange, maxValue,
}: { value: number; onChange: (v: number) => void; maxValue?: number }) {
  return (
    <NumberField
      value={value}
      onChange={onChange}
      minValue={0}
      maxValue={maxValue}
      step={0.5}
      formatOptions={{ maximumFractionDigits: 1 }}
      className="w-32 shrink-0"
      aria-label="ชั่วโมง/สัปดาห์"
    >
      <NumberField.Group>
        <NumberField.DecrementButton />
        <NumberField.Input />
        <NumberField.IncrementButton />
      </NumberField.Group>
    </NumberField>
  );
}

/* -------------------------------------------------------------------------- */
/* Create-TA modal — mirrors the staff CreateUserModal but locked to role=ta  */
/* -------------------------------------------------------------------------- */

const TITLE_OPTIONS = ["นาย", "นาง", "นางสาว"];
const STUDY_LEVELS: { value: string; label: string }[] = [
  { value: "undergrad", label: "ปริญญาตรี" },
  { value: "master", label: "ปริญญาโท" },
  { value: "phd", label: "ปริญญาเอก" },
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function CreateTaPanel({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (ta: TA) => void;
}) {
  const [form, setForm] = useState({
    email: "", title: "นาย", first_name: "", last_name: "", study_level: "undergrad",
  });
  const [showErrors, setShowErrors] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{ user: TA; temp_password: string } | null>(null);

  const errors = useMemo(() => ({
    email: !form.email.trim()
      ? "กรุณากรอกอีเมล"
      : !EMAIL_RE.test(form.email.trim())
      ? "รูปแบบอีเมลไม่ถูกต้อง"
      : null,
    first_name: !form.first_name.trim() ? "กรุณากรอกชื่อ" : null,
    last_name: !form.last_name.trim() ? "กรุณากรอกนามสกุล" : null,
    study_level: STUDY_LEVELS.some(l => l.value === form.study_level) ? null : "กรุณาเลือกระดับการศึกษา",
  }), [form]);
  const hasErrors = Object.values(errors).some(Boolean);

  async function submit() {
    setShowErrors(true);
    if (hasErrors) return;
    setPending(true); setErr(null);
    try {
      const res = await api.post<{ user: TA; temp_password: string }>("/users", {
        email: form.email.trim(),
        title: form.title,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        roles: ["ta"],
        study_level: form.study_level,
      });
      setCreated(res);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  function useAndAdd() {
    if (created) onCreated(created.user);
  }

  return (
    <div className="rounded-lg border border-accent/40 bg-accent-soft/30 p-3">
      <div className="flex items-center gap-2 mb-3">
        <UserPlus size={16} className="text-accent" />
        <div className="font-medium text-sm">
          {created ? "สร้างบัญชี TA สำเร็จ" : "สร้างบัญชี TA ใหม่"}
        </div>
      </div>

      {created ? (
        <div className="space-y-3">
          <TempPasswordPanel email={created.user.email} password={created.temp_password} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>ปิด</Button>
            <Button variant="primary" size="sm" onClick={useAndAdd}>
              <Plus size={14} /> เพิ่มเข้ารายวิชานี้
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Alert
            status="accent"
            title="บัญชีนี้จะได้รับสิทธิ์ผู้ช่วยสอน (TA)"
            description="สร้างบัญชีสำหรับ TA ใหม่ที่ยังไม่มีในระบบ ระบบจะสร้างรหัสผ่านชั่วคราวให้"
            icon={<Info size={16} />}
          />
          <VField
            label="อีเมล" required type="email" placeholder="ta@kkumail.com"
            value={form.email} onChange={v => setForm({ ...form, email: v })}
            error={errors.email} show={showErrors}
          />
          <div className="grid grid-cols-[140px_1fr_1fr] gap-3">
            <FieldGroup label="คำนำหน้า">
              <Select value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}>
                {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </FieldGroup>
            <VField label="ชื่อ" required
              value={form.first_name} onChange={v => setForm({ ...form, first_name: v })}
              error={errors.first_name} show={showErrors}
            />
            <VField label="นามสกุล" required
              value={form.last_name} onChange={v => setForm({ ...form, last_name: v })}
              error={errors.last_name} show={showErrors}
            />
          </div>
          <FieldGroup label="ระดับการศึกษา">
            <Select value={form.study_level} onChange={e => setForm({ ...form, study_level: e.target.value })}>
              {STUDY_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </Select>
          </FieldGroup>
          {err && <Alert status="danger" title="สร้างบัญชีไม่สำเร็จ" description={err} />}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>ยกเลิก</Button>
            <Button variant="primary" size="sm" onClick={submit}
              disabled={pending || (showErrors && hasErrors)} isPending={pending}>
              สร้างบัญชี
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function VField({
  label, value, onChange, error, show, type = "text", placeholder, required, autoFocus,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  show: boolean;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const invalid = show && !!error;
  return (
    <HTextField value={value} onChange={onChange} isInvalid={invalid} isRequired={required} autoFocus={autoFocus}>
      <HLabel>{label}</HLabel>
      <HInput type={type} placeholder={placeholder} />
      {invalid && <HFieldError>{error}</HFieldError>}
    </HTextField>
  );
}

function TempPasswordPanel({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  }
  return (
    <div className="space-y-3">
      <Alert
        status="success"
        title="รหัสผ่านชั่วคราวถูกสร้างแล้ว"
        description="โปรดคัดลอกและส่งให้ TA ระบบจะบังคับให้เปลี่ยนรหัสผ่านเมื่อเข้าใช้งานครั้งแรก รหัสนี้จะไม่แสดงอีก"
        icon={<CheckCircle2 size={18} />}
      />
      <div>
        <div className="text-xs text-muted mb-1">อีเมล</div>
        <div className="text-sm font-mono">{email}</div>
      </div>
      <div>
        <div className="text-xs text-muted mb-1">รหัสผ่านชั่วคราว</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 rounded-md bg-default text-sm font-mono select-all">
            {password}
          </code>
          <Button variant="secondary" size="sm" onClick={copy}>
            <Copy size={14} /> {copied ? "คัดลอกแล้ว" : "คัดลอก"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Submission-window status banner                                             */
/* -------------------------------------------------------------------------- */

function useWindowState(windows: RequestWindow[] | undefined): WindowState {
  // Re-render every minute so the countdown ticks down without a manual refresh.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  return useMemo<WindowState>(() => {
    // ไม่มีการกำหนดช่วงเวลา = ไม่มีกำหนดส่งให้เลย → ถือว่าทันเวลาเสมอ
    if (!windows || windows.length === 0) return { phase: "ontime" };

    // ยึดกำหนดปิดรับที่ช้าที่สุดของเทอมเป็นเส้นตาย (ตรงกับ backend)
    const deadline = windows
      .slice()
      .sort((a, b) => new Date(b.closes_at).getTime() - new Date(a.closes_at).getTime())[0];
    const closesAt = new Date(deadline.closes_at).getTime();

    if (now > closesAt) {
      return { phase: "late", window: deadline, closedAt: closesAt };
    }
    return { phase: "ontime", window: deadline, remainingMs: closesAt - now };
  }, [windows, now]);
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "หมดเวลาแล้ว";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `${days} วัน ${hours} ชั่วโมง`;
  if (hours > 0) return `${hours} ชั่วโมง ${minutes} นาที`;
  return `${minutes} นาที`;
}

const THAI_MONTHS_ABBR = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function formatThaiDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = `${d.getDate()} ${THAI_MONTHS_ABBR[d.getMonth()]} ${d.getFullYear() + 543}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${date} ${hh}:${mm} น.`;
}

function WindowStatusBanner({ state, loading }: { state: WindowState; loading: boolean }) {
  if (loading) return null;

  // ส่งช้า — ยังส่งได้ตามปกติ แต่ต้องรู้ว่าเงินจะออกช้า
  if (state.phase === "late") {
    return (
      <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-3">
        <Chip tone="warn"><AlertCircle size={12} /> ส่งช้า</Chip>
        <div className="flex flex-col min-w-0">
          <div className="text-sm font-medium text-amber-900">
            เลยกำหนดแล้ว — ส่งคำขอได้ตามปกติ แต่จะถูกทำเครื่องหมายว่า “ล่าช้า”
          </div>
          <div className="text-xs text-amber-800">
            <b>การเบิกจ่ายค่าตอบแทนจะล่าช้าไปด้วย</b> · กำหนดเดิม: {formatThaiDateTime(state.window.closes_at)}
            {state.window.note ? ` · ${state.window.note}` : ""}
          </div>
        </div>
      </div>
    );
  }

  // ส่งทันเวลา — ถ้าไม่มีกำหนดเลย ก็ทันเวลาเสมอ
  const urgent = state.remainingMs !== undefined && state.remainingMs < 24 * 60 * 60 * 1000;
  return (
    <div className={
      "mb-3 rounded-lg border px-4 py-3 flex flex-wrap items-center gap-3 " +
      (urgent ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50")
    }>
      <Chip tone={urgent ? "warn" : "success"}>
        <CheckCircle2 size={12} /> ส่งทันเวลา
      </Chip>
      <div className="flex flex-col min-w-0">
        <div className={"text-sm font-medium " + (urgent ? "text-amber-900" : "text-emerald-900")}>
          <Clock size={14} className="inline -mt-0.5 mr-1" />
          {state.window && state.remainingMs !== undefined
            ? `เหลืออีก ${formatRemaining(state.remainingMs)} ถึงกำหนดส่ง`
            : "ไม่มีกำหนดส่ง — ส่งคำขอได้ตลอด"}
        </div>
        <div className={"text-xs " + (urgent ? "text-amber-800" : "text-emerald-800")}>
          {state.window
            ? <>กำหนดส่ง: {formatThaiDateTime(state.window.closes_at)}
                {state.window.note ? ` · ${state.window.note}` : ""}
                {" · หลังกำหนดยังส่งได้ แต่จะนับเป็น“ส่งช้า”"}</>
            : "เจ้าหน้าที่ยังไม่ได้กำหนดวันส่งสำหรับภาคเรียนนี้"}
        </div>
      </div>
    </div>
  );
}
