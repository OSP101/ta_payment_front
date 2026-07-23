"use client";
import useSWR from "swr";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, ArrowRight, CalendarClock, CalendarX2, AlertTriangle, RefreshCw, Wallet } from "lucide-react";
import type { Term } from "../../lib/api";
import {
  PageHeader, Panel, StatCard, EmptyState, Chip, SelectField, Spinner, Button, type SelectOption, type ChipTone,
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
  status: SubmissionStage;
  // Worklog readiness for the period's month — lets the badge reflect the
  // daily-approval track instead of showing a bare "รอ TA ยืนยันเวลา" that
  // contradicts an already-approved (or empty) month.
  worklog_total: number;
  worklog_unapproved: number;
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
//   pending + un-approved worklog     → "รออาจารย์อนุมัติงาน" (info)
//   pending + all approved            → "รอเจ้าหน้าที่ส่งออก" (info — staff's turn)
// exported / finance_sent keep their own label so the payout progress shows.
function submissionBadge(r: SubmissionRow, today: string): { label: string; tone: ChipTone } {
  if (r.status === "pending") {
    if (r.starts_on > today)      return { label: "ยังไม่ถึงรอบ", tone: "neutral" };
    if (r.worklog_total === 0)    return { label: "ไม่มีรายการเดือนนี้", tone: "neutral" };
    if (r.worklog_unapproved > 0) return { label: "รออาจารย์อนุมัติงาน", tone: "info" };
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
  const statusById = useMemo(() => {
    const m = new Map<string, TAStatus>();
    (status ?? []).forEach(s => m.set(s.teaching_course_id, s));
    return m;
  }, [status]);
  const totalEstimated = (status ?? []).reduce((a, s) => a + s.estimated_baht, 0);

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
        title="รายวิชาที่ฉันเป็น TA"
        description="เลือกปีการศึกษาและภาคเรียน เพื่อดูรายวิชาที่คุณได้รับมอบหมายเป็นผู้ช่วยสอน"
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <StatCard
              label="ภาคเรียนที่เลือก"
              value={termDisplay || "—"}
              icon={<CalendarClock size={18} />}
              tone="brand"
            />
            <StatCard
              label="วิชาที่เป็น TA"
              value={courses?.length ?? 0}
              icon={<BookOpen size={18} />}
            />
            <StatCard
              label="ยอดเงินโดยประมาณรวม"
              value={`฿${totalEstimated.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              icon={<Wallet size={18} />}
              tone="success"
            />
          </div>

          <Panel
            title="รายวิชาในภาคเรียนนี้"
            description="คลิกเพื่อดูตารางเรียน/บันทึกเวลาปฏิบัติงาน"
            padded={false}
          >
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
              <ul className="divide-y divide-[var(--hairline)]">
                {courses!.map(c => {
                  const st = statusById.get(c.id);
                  const sub = currentByCourse.get(c.id);
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/ta/courses/${c.id}`}
                        className="flex items-center gap-4 px-5 py-4 hover:bg-surface-secondary transition-colors group"
                      >
                        <div className="w-10 h-10 rounded-lg bg-accent-soft text-accent-soft-foreground flex items-center justify-center shrink-0">
                          <BookOpen size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold tabular">{c.code}</span>
                            <span className="text-foreground">{c.name_th}</span>
                          </div>
                          <div className="text-xs text-muted mt-1 flex items-center gap-3 flex-wrap">
                            <span>นักศึกษารวม {c.num_students} คน</span>
                            {c.num_students_regular > 0 && <span>· ปกติ {c.num_students_regular}</span>}
                            {c.num_students_special > 0 && <span>· พิเศษ {c.num_students_special}</span>}
                            {st && (
                              <>
                                <span>· อนุมัติ {st.hours_approved.toFixed(1)} ชม.</span>
                                {st.hours_pending > 0 && <span>· รอ {st.hours_pending.toFixed(1)} ชม.</span>}
                                <span className="text-success font-medium">
                                  · ประมาณ ฿{st.estimated_baht.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="hidden md:flex flex-col items-end gap-1 w-56 shrink-0">
                          {sub ? (
                            <>
                              {(() => {
                                const b = submissionBadge(sub, today);
                                return <Chip tone={b.tone}>{b.label}</Chip>;
                              })()}
                              <div className="text-[11px] text-muted text-right truncate max-w-full">
                                รอบ {sub.label}
                                {sub.is_closed ? " (ปิดแล้ว)" : ` · ครบกำหนด ${sub.due_date}`}
                              </div>
                            </>
                          ) : (
                            <Chip tone="neutral">ยังไม่เปิดรอบเบิกจ่าย</Chip>
                          )}
                        </div>
                        <ArrowRight size={16} className="text-muted group-hover:text-accent transition-colors shrink-0" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
