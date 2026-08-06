"use client";
import useSWR from "swr";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen, ArrowRight, CalendarClock, CalendarX2, AlertTriangle, RefreshCw,
  FileCheck2,
} from "lucide-react";
import type { Term } from "../../lib/api";
import AnnouncementFeed from "../../components/AnnouncementFeed";
import OnboardingChecklistCard from "../OnboardingChecklistCard";
import {
  PageHeader, Panel, EmptyState, Chip, SelectField, Spinner, Button,
  Alert, type SelectOption, type ChipTone,
} from "../../components/ui";
type SubmissionStage =
  | "pending"
  | "exported"
  | "finance_sent"
  | "skipped";

interface SubmissionRow {
  period_id: string;
  label: string;
  year_month: string;        // '2569-06' — Buddhist year + submission month
  starts_on: string;         // 'YYYY-MM-DD' — window opens (Gregorian)
  due_date: string;          // 'YYYY-MM-DD'
  is_closed: boolean;
  teaching_course_id: string;
  course_code: string;
  status: SubmissionStage;
  // Worklog readiness for the period's month — lets the badge reflect the
  // daily-approval track instead of showing a bare "รอ TA ยืนยันเวลา" that
  // contradicts an already-approved (or empty) month.
  worklog_total: number;
  worklog_unapproved: number;
  // Who the unapproved rows are with. The single "unapproved" number could not
  // say, so this page blamed the lecturer for rows the TA had never sent.
  worklog_waiting_ta: number;
  worklog_waiting_lecturer: number;
  // Rows the LECTURER sent back. Part of waiting_ta, but a bounced row and a
  // never-sent row need different words and different urgency.
  worklog_rejected: number;
  worklog_approved_hrs: number;
}

const SUBMISSION_LABEL: Record<SubmissionStage, string> = {
  pending:      "รอดำเนินการ",
  exported:     "ส่งออกแล้ว รอส่งการเงิน",
  finance_sent: "ส่งการเงินแล้ว",
  skipped:      "ข้ามรอบนี้",
};

const SUBMISSION_TONE: Record<SubmissionStage, ChipTone> = {
  pending:      "warn",
  exported:     "brand",
  finance_sent: "success",
  skipped:      "neutral",
};

// submissionBadge derives the label+tone actually shown for a period. There is
// no TA "confirm" step anymore — the lecturer's daily worklog approval is the
// review, then staff export (lock) and send to finance. While a month is still
// pending we fold in the worklog-approval state so the TA sees what's happening:
//   pending + window not open yet    → "ยังไม่ถึงรอบ" (neutral — nothing to do)
//   pending + no worklog in month    → "ไม่มีรายการเดือนนี้" (neutral)
//   pending + rows still with the TA → "ยังไม่ได้ส่งอนุมัติ" (warn — the TA's move)
//   pending + rows with the lecturer  → "รออาจารย์อนุมัติงาน" (info)
//   pending + all approved            → "รอเจ้าหน้าที่ส่งออก" (info — staff's turn)
// exported / finance_sent keep their own label so the payout progress shows.
// A period is past due once today passes due_date + the one grace day the
// backend applies (period_lock.go). The is_closed flag alone is not enough —
// most closed periods are closed by time, not by anyone flipping it.
function periodPastDue(r: { is_closed: boolean; due_date: string }, today: string): boolean {
  if (r.is_closed) return true;
  const g = new Date(`${r.due_date}T00:00:00`);
  g.setDate(g.getDate() + 1);
  const iso = `${g.getFullYear()}-${String(g.getMonth() + 1).padStart(2, "0")}-${String(g.getDate()).padStart(2, "0")}`;
  return today > iso;
}

function submissionBadge(r: SubmissionRow, today: string): { label: string; tone: ChipTone } {
  if (r.status === "pending") {
    if (r.starts_on > today)      return { label: "ยังไม่ถึงรอบ", tone: "neutral" };
    if (r.worklog_total === 0)    return { label: "ไม่มีรายการเดือนนี้", tone: "neutral" };
    // Past the deadline the month is settled, whichever way it went: unsent
    // rows are forfeited and there is nothing left to chase. Keeping the
    // "ยังไม่ได้ส่งอนุมัติ" badge here would ask for an action that no longer
    // exists.
    if (periodPastDue(r, today)) {
      return r.worklog_waiting_ta > 0
        ? { label: "หมดเวลาส่ง", tone: "neutral" }
        : { label: "รอเจ้าหน้าที่ส่งออก", tone: "info" };
    }
    // Bounced work first: it is the only state where somebody has already
    // looked at the hours and said no, and it was reading as a plain "not sent
    // yet" — indistinguishable from a TA who simply had not got round to it.
    if (r.worklog_rejected > 0)          return { label: "อาจารย์ตีกลับ", tone: "danger" };
    // The TA's own move outranks the lecturer's: it is the only one they can
    // act on, and it was the one being hidden behind the lecturer's name.
    if (r.worklog_waiting_ta > 0)        return { label: "ยังไม่ได้ส่งอนุมัติ", tone: "warn" };
    if (r.worklog_waiting_lecturer > 0)  return { label: "รออาจารย์อนุมัติงาน", tone: "info" };
    return { label: "รอเจ้าหน้าที่ส่งออก", tone: "info" };
  }
  return { label: SUBMISSION_LABEL[r.status], tone: SUBMISSION_TONE[r.status] };
}

interface TAStatus {
  teaching_course_id: string;
  stage: "draft" | "submitted" | "approved" | "exported";
  hours_approved: number;
  hours_pending: number;
  estimated_baht: number;
}

interface TC {
  id: string; code: string; name_th: string;
  num_students: number;
  num_students_regular: number;
  num_students_special: number;
}

const SEMESTER_LABELS: Record<number, string> = {
  1: "ภาคต้น",
  2: "ภาคปลาย",
  3: "ภาคฤดูร้อน",
};

/** national_id + bank_book + creditor_form — see service.DocKinds. */
const REQUIRED_DOC_COUNT = 3;

interface DocRow {
  id: string;
  kind: string;
  status: string;
  reject_reason?: string | null;
}

/**
 * Render a 'YYYY-MM-DD' due date the way the rest of the app does — Thai
 * month, Buddhist year. Raw ISO dates read as machine output next to
 * "28 ก.ค. 2569" elsewhere, and 2026 vs 2569 invites a double-take about
 * which calendar a deadline is in.
 */
function thDueDate(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export default function TAHome() {
  const router = useRouter();
  const params = useSearchParams();
  const yearParam = params.get("year");
  const termParam = params.get("term");

  const { data: terms } = useSWR<Term[]>("/terms");

  const byYear = useMemo(() => {
    const map = new Map<number, Term[]>();
    (terms ?? []).forEach(t => {
      if (!map.has(t.academic_year)) map.set(t.academic_year, []);
      map.get(t.academic_year)!.push(t);
    });
    for (const [, list] of map) list.sort((a, b) => a.semester - b.semester);
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [terms]);

  const yearOptions: SelectOption[] = byYear.map(([y, list]) => ({
    id: String(y),
    label: (
      <span className="inline-flex items-center gap-2">
        <span className="tabular">ปีการศึกษา {y}</span>
        {list.some(t => t.is_active) && <Chip tone="success">active</Chip>}
      </span>
    ),
    textValue: `${y}`,
  }));

  const defaultYear = useMemo(() => {
    if (yearParam && byYear.some(([y]) => String(y) === yearParam)) return yearParam;
    const active = (terms ?? []).find(t => t.is_active);
    if (active) return String(active.academic_year);
    return byYear[0] ? String(byYear[0][0]) : "";
  }, [yearParam, byYear, terms]);

  const yearTerms = useMemo(() => {
    const y = Number(defaultYear);
    return byYear.find(([yr]) => yr === y)?.[1] ?? [];
  }, [byYear, defaultYear]);

  const termOptions: SelectOption[] = yearTerms.map(t => ({
    id: t.id,
    label: (
      <span className="inline-flex items-center gap-2">
        <span>{SEMESTER_LABELS[t.semester] ?? `ภาค ${t.semester}`}</span>
        {t.is_active && <Chip tone="success">active</Chip>}
      </span>
    ),
    textValue: SEMESTER_LABELS[t.semester] ?? `ภาค ${t.semester}`,
  }));

  const defaultTerm = useMemo(() => {
    if (termParam && yearTerms.some(t => t.id === termParam)) return termParam;
    const active = yearTerms.find(t => t.is_active);
    return active?.id ?? yearTerms[0]?.id ?? "";
  }, [termParam, yearTerms]);

  useEffect(() => {
    if (!terms || byYear.length === 0) return;
    if (yearParam !== defaultYear || termParam !== defaultTerm) {
      const sp = new URLSearchParams();
      if (defaultYear) sp.set("year", defaultYear);
      if (defaultTerm) sp.set("term", defaultTerm);
      router.replace(`/ta?${sp.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultYear, defaultTerm, terms]);

  const {
    data: courses,
    error: coursesError,
    isLoading: coursesLoading,
    mutate: reloadCourses,
  } = useSWR<TC[]>(defaultTerm ? `/me/ta-courses?term_id=${defaultTerm}` : null);

  const { data: status } = useSWR<TAStatus[]>("/dashboard/ta/me");
  // Document state drives the "ต้องดำเนินการ" band — a rejected file is the
  // one thing that silently blocks payout for every course at once.
  const { data: docs } = useSWR<DocRow[]>("/me/documents");
  const statusById = useMemo(() => {
    const m = new Map<string, TAStatus>();
    (status ?? []).forEach(s => m.set(s.teaching_course_id, s));
    return m;
  }, [status]);

  // Local calendar date (YYYY-MM-DD) to compare against a period's Gregorian
  // window. Computed once; the badge only needs day-granularity.
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // Per-course monthly submission rows so the home page can show the current
  // step without the TA having to click into /ta/reminders.
  const { data: submissions } = useSWR<SubmissionRow[]>("/me/submission-periods");
  const currentByCourse = useMemo(() => {
    // Surface the single period a TA most needs to see: the OLDEST month not yet
    // finished, so signing one month keeps that month on the card (now reading
    // "รออาจารย์ลงนาม") instead of the card jumping to the next pending month and
    // looking perpetually stuck. A month whose window hasn't opened is never
    // actionable, so it only wins when there's nothing open left to do.
    //   tier 2 — not finished, window open  → the live bottleneck
    //   tier 1 — not finished, window future → coming up, can't act yet
    //   tier 0 — finished (finance_sent/skipped)
    const isDone = (r: SubmissionRow) => r.status === "finance_sent" || r.status === "skipped";
    const tier = (r: SubmissionRow) => (isDone(r) ? 0 : r.starts_on <= today ? 2 : 1);
    const key = (r: SubmissionRow) => r.starts_on || r.due_date;
    // Within a not-finished tier prefer the oldest month; among finished ones
    // prefer the newest so the card reflects the most recent payout.
    const better = (r: SubmissionRow, prev: SubmissionRow) => {
      const tr = tier(r), tp = tier(prev);
      if (tr !== tp) return tr > tp;
      return tr === 0 ? key(r) > key(prev) : key(r) < key(prev);
    };
    const map = new Map<string, SubmissionRow>();
    for (const r of submissions ?? []) {
      const prev = map.get(r.teaching_course_id);
      if (!prev || better(r, prev)) map.set(r.teaching_course_id, r);
    }
    return map;
  }, [submissions, today]);

  function setYear(y: string) {
    const list = byYear.find(([yr]) => String(yr) === y)?.[1] ?? [];
    const nextTerm = list.find(t => t.is_active)?.id ?? list[0]?.id ?? "";
    const sp = new URLSearchParams();
    if (y) sp.set("year", y);
    if (nextTerm) sp.set("term", nextTerm);
    router.replace(`/ta?${sp.toString()}`);
  }
  function setTerm(t: string) {
    const sp = new URLSearchParams();
    if (defaultYear) sp.set("year", defaultYear);
    if (t) sp.set("term", t);
    router.replace(`/ta?${sp.toString()}`);
  }

  const termsLoaded = terms !== undefined;
  const noTerms = termsLoaded && terms!.length === 0;

  const activeTerm = yearTerms.find(t => t.id === defaultTerm);
  const termDisplay = activeTerm
    ? `${activeTerm.academic_year}/${activeTerm.semester} — ${SEMESTER_LABELS[activeTerm.semester] ?? ""}`
    : "";

  return (
    <div>
      <PageHeader
        title="หน้าหลักของฉัน"
        description="รายวิชาที่รับเป็น TA และสิ่งที่ต้องดำเนินการในภาคเรียนนี้"
        actions={
          noTerms ? null : (
            <div className="flex gap-2 items-end flex-wrap">
              <SelectField
                label="ปีการศึกษา"
                value={defaultYear}
                onChange={setYear}
                options={yearOptions}
                className="min-w-[180px]"
              />
              <SelectField
                label="ภาคเรียน"
                value={defaultTerm}
                onChange={setTerm}
                options={termOptions}
                isDisabled={yearTerms.length === 0}
                className="min-w-[180px]"
              />
            </div>
          )
        }
      />

      {noTerms ? (
        <Panel>
          <EmptyState
            icon={<CalendarX2 size={28} />}
            title="ยังไม่มีปีการศึกษา / ภาคเรียนในระบบ"
            description="กรุณาแจ้งเจ้าหน้าที่เพื่อสร้างปีการศึกษาและภาคเรียนก่อน"
          />
        </Panel>
      ) : yearTerms.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<CalendarClock size={28} />}
            title="ไม่มีภาคเรียนในปีการศึกษานี้"
            description="ลองเลือกปีการศึกษาอื่น"
          />
        </Panel>
      ) : (
        <>
          {/* Setup first: until these are done the TA cannot log hours, so the
              course list below is academic. Above AlertsSection because those
              are recurring term chores, this is a one-time prerequisite. */}
          <OnboardingChecklistCard />

          <AlertsSection
            docs={docs}
            submissions={submissions}
            courses={courses}
            today={today}
          />

          <SectionHeading>รายวิชาที่ฉันเป็น TA</SectionHeading>
          <Panel padded={false}>
            {coursesError ? (
              <EmptyState
                icon={<AlertTriangle size={28} />}
                title="โหลดรายวิชาไม่สำเร็จ"
                description="เกิดข้อผิดพลาดขณะดึงข้อมูล โปรดลองใหม่อีกครั้ง"
                action={
                  <Button variant="secondary" size="sm" onPress={() => reloadCourses()}>
                    <RefreshCw size={14} /> ลองใหม่
                  </Button>
                }
              />
            ) : coursesLoading || courses === undefined ? (
              <div className="flex items-center justify-center gap-3 py-12 text-sm text-muted">
                <Spinner size="sm" /> กำลังโหลดรายวิชา…
              </div>
            ) : !courses || courses.length === 0 ? (
              <EmptyState
                icon={<BookOpen size={28} />}
                title="ยังไม่มีวิชาในภาคเรียนนี้"
                description="อาจารย์ยังไม่ได้เสนอชื่อคุณเป็น TA หรือคำขอยังอยู่ระหว่างการพิจารณา"
              />
            ) : (
              // Card grid rather than table rows: each course carries several
              // independent facts (hours, money, submission step) that a row
              // squeezes into one line and truncates first on narrow screens.
              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {courses!.map(c => (
                  <CourseCard
                    key={c.id}
                    course={c}
                    status={statusById.get(c.id)}
                    submission={currentByCourse.get(c.id)}
                    today={today}
                  />
                ))}
              </div>
            )}
          </Panel>

          {/* Announcements sit beside the courses rather than under them: a TA
              with no course assigned yet sees an otherwise empty page, and the
              faculty's news is the one thing that is still worth reading. The
              feed renders its own "ยังไม่มีประกาศ" state, so the card is always
              present and the page never changes shape. */}
          <SectionHeading
            action={
              <Link
                href="/announcements"
                className="text-xs font-medium text-muted underline underline-offset-2 hover:text-foreground"
              >
                ดูทั้งหมด
              </Link>
            }
          >
            ประชาสัมพันธ์
          </SectionHeading>
          {/* title={null}, not undefined: the prop defaults to "ประชาสัมพันธ์"
              when undefined, which would print the heading twice — once here
              and once inside the card. null is falsy so Panel drops its header
              entirely, matching the courses section above. */}
          <AnnouncementFeed title={null} compact limit={5} />
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Section pieces                                                             */
/* -------------------------------------------------------------------------- */

/** Small-caps heading that separates the page into scannable bands. */
function SectionHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between gap-3 first:mt-0">
      <h2 className="text-sm font-semibold text-foreground">{children}</h2>
      {action}
    </div>
  );
}

/**
 * What the TA is spending against their limits. Every number here is one the
 * system enforces elsewhere, so seeing it early explains a later refusal
 * instead of leaving it to be discovered at the work-log screen.
 */
// UsageSection (the "ภาพรวมของฉัน" stat cards) was removed at the lecturers'
// request. Everything it showed is available where it is actionable: the quota
// and hours on each course card below, the document status on /ta/documents.
// A row of counters at the top of the page repeated all of it without giving
// the TA anything to do about any of it.

/**
 * Things that need the TA to act. Rendered only when there is something —
 * a permanent "all clear" panel trains people to skip the region entirely.
 */
function AlertsSection({
  docs, submissions, courses, today,
}: {
  docs?: DocRow[];
  submissions?: SubmissionRow[];
  courses?: TC[];
  today: string;
}) {
  const rejected = (docs ?? []).filter(d => d.status === "rejected");
  // "ต้องดำเนินการ" means the TA has to do something. Waiting for staff is not
  // that. This block used to count APPROVED documents and then title the alert
  // "ยังส่งเอกสารไม่ครบ" with a "ไปส่งเอกสาร" link — so a TA who had sent all
  // three files was told to go send them, every visit, until an officer got
  // round to reviewing. Count what the TA controls: files not yet sent.
  const notSent = REQUIRED_DOC_COUNT - (docs ?? []).filter(
    d => d.status !== "rejected" && d.status !== "needs_fix").length;

  // Only months whose window has opened can be acted on.
  //
  // "Closed" is not just the flag: the backend also closes a period once today
  // passes due_date + one grace day (period_lock.go). Testing the flag alone put
  // a past-due month under "ต้องดำเนินการ" with the future-tense warning
  // "ถ้าเลยกำหนด เดือนนี้จะถูกปิด" — on a month that had already closed.
  // Bounced worklogs, by course. The band handled rejected DOCUMENTS and
  // nothing else, so a lecturer sending hours back produced one bell
  // notification and no trace anywhere the TA actually looks.
  const bounced = (submissions ?? []).filter(
    r => r.status === "pending" && !periodPastDue(r, today) && r.worklog_rejected > 0,
  );
  const openPeriods = (submissions ?? []).filter(
    r => r.status === "pending" && !periodPastDue(r, today) &&
         r.starts_on <= today && r.worklog_unapproved > 0,
  );
  // Past-due months with rows the TA never sent. Nothing they can do alone, but
  // hiding it is how ten rows sat unnoticed until payday.
  const missed = (submissions ?? []).filter(
    r => r.status === "pending" && periodPastDue(r, today) && r.worklog_waiting_ta > 0,
  );
  const dueSoon = openPeriods;

  const hasCourses = (courses?.length ?? 0) > 0;
  if (rejected.length === 0 && notSent <= 0 && dueSoon.length === 0 &&
      missed.length === 0 && bounced.length === 0) return null;

  return (
    <>
      <SectionHeading>ต้องดำเนินการ</SectionHeading>
      <div className="space-y-2">
        {rejected.length > 0 && (
          <Alert
            status="danger"
            icon={<AlertTriangle size={16} />}
            title={`มีเอกสารถูกตีกลับ ${rejected.length} รายการ`}
            description={rejected.map(d => d.reject_reason).filter(Boolean).join(" · ") || "เจ้าหน้าที่ขอให้แก้ไขและส่งใหม่"}
            action={
              <Link href="/ta/documents" className="text-sm font-medium underline underline-offset-2">
                ไปแก้เอกสาร
              </Link>
            }
          />
        )}
        {notSent > 0 && rejected.length === 0 && (
          <Alert
            status="warning"
            icon={<FileCheck2 size={16} />}
            title={`ยังส่งเอกสารไม่ครบ (ขาดอีก ${notSent} รายการ)`}
            description={
              hasCourses
                ? "ต้องผ่านครบทั้ง 3 ไฟล์ ก่อนจึงจะเบิกค่าตอบแทนได้"
                : "เตรียมเอกสารไว้ล่วงหน้าได้ แม้ยังไม่ได้รับมอบหมายวิชา"
            }
            action={
              <Link href="/ta/documents" className="text-sm font-medium underline underline-offset-2">
                ไปส่งเอกสาร
              </Link>
            }
          />
        )}
        {bounced.map(r => (
          <Alert
            key={"bounced" + r.period_id + r.teaching_course_id}
            status="danger"
            icon={<CalendarClock size={16} />}
            title={`${r.course_code} อาจารย์ตีกลับบันทึกเวลา ${r.worklog_rejected} รายการ`}
            description={`รอบ ${r.label} · แก้ไขแล้วส่งอนุมัติใหม่ภายใน ${thDueDate(r.due_date)}`}
            action={
              <Link
                href={`/ta/courses/${r.teaching_course_id}/worklog`}
                className="text-sm font-medium underline underline-offset-2"
              >
                ไปแก้ไข
              </Link>
            }
          />
        ))}
        {dueSoon.map(r => (
          <Alert
            key={r.period_id + r.teaching_course_id}
            status="warning"
            icon={<CalendarClock size={16} />}
            // Named by who has to move. Telling a TA the lecturer has not
            // approved rows the TA never sent points them at the wrong person
            // and hides the one action that would fix it.
            title={
              r.worklog_waiting_ta > 0
                ? `รอบ ${r.label} คุณยังไม่ได้ส่งอนุมัติ ${r.worklog_waiting_ta} รายการ`
                : `รอบ ${r.label} รออาจารย์อนุมัติ ${r.worklog_waiting_lecturer} รายการ`
            }
            description={
              r.worklog_waiting_ta > 0
                ? `ครบกำหนด ${thDueDate(r.due_date)} ถ้าเลยกำหนด เดือนนี้จะถูกปิดและส่งเองไม่ได้อีก`
                : `ครบกำหนด ${thDueDate(r.due_date)} คุณส่งครบแล้ว รออาจารย์กดอนุมัติ`
            }
            action={
              <Link
                href={`/ta/courses/${r.teaching_course_id}/worklog`}
                className="text-sm font-medium underline underline-offset-2"
              >
                เปิดบันทึกเวลา
              </Link>
            }
          />
        ))}
      </div>

      {/* Settled, not outstanding.
          A month whose deadline passed with rows unsent is closed for good —
          staff decided (03/08/2026) there is no back-dated submission: the
          hours are treated as not claimed. So it is reported as an OUTCOME,
          below the action list and with no link, rather than as another thing
          to chase. Listing it under "ต้องดำเนินการ" promised a way back that
          does not exist. */}
      {missed.length > 0 && (
        <>
          <h2 className="mt-5 mb-2 text-sm font-medium text-ink-2">รอบที่ปิดไปแล้ว</h2>
          <div className="space-y-2">
            {missed.map(r => (
              <Alert
                key={"missed" + r.period_id + r.teaching_course_id}
                status="default"
                icon={<CalendarClock size={16} />}
                title={`รอบ ${r.label} ถือว่าไม่ประสงค์ลงเวลา ${r.worklog_waiting_ta} รายการ`}
                description={`ครบกำหนดไปแล้วเมื่อ ${thDueDate(r.due_date)} รายการที่ไม่ได้ส่งภายในกำหนดถือเป็นการไม่ประสงค์ลงเวลา และไม่นำมาคิดค่าตอบแทน`}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

/** One course, with its independent facts given room to breathe. */
function CourseCard({
  course, status, submission, today,
}: {
  course: TC;
  status?: TAStatus;
  submission?: SubmissionRow;
  today: string;
}) {
  const badge = submission ? submissionBadge(submission, today) : null;
  return (
    <Link
      href={`/ta/courses/${course.id}`}
      className="group flex flex-col rounded-xl border border-[var(--hairline)] bg-surface p-4 transition-colors hover:bg-surface-secondary"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-foreground">
          <BookOpen size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold tabular">{course.code}</div>
          <div className="truncate text-xs text-muted">{course.name_th}</div>
        </div>
        <ArrowRight
          size={15}
          className="mt-1 shrink-0 text-muted transition-colors group-hover:text-accent"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>นักศึกษา {course.num_students} คน</span>
        {status && (
          <>
            <span>· อนุมัติ {status.hours_approved.toFixed(1)} ชม.</span>
            {status.hours_pending > 0 && <span>· รอ {status.hours_pending.toFixed(1)} ชม.</span>}
          </>
        )}
      </div>

      {status && (
        <div className="mt-2 text-sm font-medium text-success">
          ฿{status.estimated_baht.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--hairline)] pt-3">
        {badge ? <Chip tone={badge.tone}>{badge.label}</Chip> : <Chip tone="neutral">ยังไม่เปิดรอบเบิกจ่าย</Chip>}
        {submission && (
          <span className="truncate text-[11px] text-muted">
            {submission.is_closed ? "ปิดแล้ว" : `ครบกำหนด ${thDueDate(submission.due_date)}`}
          </span>
        )}
      </div>
    </Link>
  );
}
