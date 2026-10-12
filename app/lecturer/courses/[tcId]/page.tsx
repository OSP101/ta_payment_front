"use client";
import BudgetCapNotice from "../../../components/BudgetCapNotice";
import { use } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import {
  ArrowRight, ChevronLeft, CircleAlert, Wallet, Send, ClipboardCheck, AlertTriangle,
  CalendarOff,
} from "lucide-react";
import { ApiError } from "../../../lib/api";
import {
  PageHeader, Panel, Button, Chip, EmptyState, Alert, Tip,
} from "../../../components/ui";
import { CourseSubmissionPanel } from "../../../components/CourseSubmissionPanel";
import { type TARequestRow } from "../../RequestsTable";
import { courseCodeLabel } from "../../../lib/courseCode";
import { Skel, SkelValue } from "../../../components/Skeletons";
import { useI18n } from "../../../lib/i18n/client";

interface Section {
  id: string; sec_no: string; track: string; room?: string;
}
interface TC {
  id: string; code: string; alt_codes?: string[]; name_th: string; term_id: string;
  /** คาบที่ตรงวันหยุดและยังไม่กำหนดวันชดเชย */
  unresolved_makeups?: number;
  num_students: number;
  num_students_regular: number;
  num_students_special: number;
  credits: number;
  lecture_hrs: number;
  lab_hrs: number;
  sections?: Section[];
}
interface Budget {
  per_course_max: number;
  /** เพดานงบรายวิชาของภาค (null = ไม่กำหนด) — see BudgetCapNotice. */
  budget_cap_baht: number | null;
  formula_baht: number;
  cap_applied: boolean;
  used_baht: number;
  /** used_baht split by pool — used_baht_regular + used_baht_special == used_baht.
   *  Drives the usage bar's two coloured segments below. */
  used_baht_regular: number;
  used_baht_special: number;
  remaining_baht: number;
  over_budget: boolean;
  credits: number;
  lecture_credits: number;
  lab_credits: number;
  /** งบโดยประมาณทั้งเทอม แยกตามภาค (ปกติ/พิเศษ) — รวมกันได้ = per_course_max */
  term_pay_regular: number;
  term_pay_special: number;
  num_students_regular: number;
  num_students_special: number;
  suggested_tas: { undergrad: number; graduate: number };
}

// ภาคปกติ/ภาคพิเศษ get a warm/cool pair, deliberately far from the ป.ตรี/
// บัณฑิต blue-indigo pair used on the budget-planner cards elsewhere — a
// lecturer flipping between this card and that one shouldn't have to work
// out whether blue means the same thing on both.
const TRACK_BAR_COLOR = { regular: "bg-teal-500", special: "bg-orange-500" };

/** 12,345 ฿ — ตัดเศษสตางค์ทิ้ง เพราะเป็นตัวเลข "โดยประมาณ" อยู่แล้ว */
const baht = (n: number, intl: string) => Math.round(n).toLocaleString(intl);
interface PendingReport {
  id: string;
  course_code: string;
  teaching_course_id?: string;
}

export default function CoursePage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  const { t } = useI18n();
  const courseKey = tcId ? `/teaching-courses/${tcId}` : null;
  const budgetKey = tcId ? `/teaching-courses/${tcId}/budget` : null;

  const { data: course, error: courseError } = useSWR<TC>(courseKey);
  const { data: allReqs } = useSWR<TARequestRow[]>("/ta-requests");
  const { data: budget } = useSWR<Budget>(budgetKey);
  const { data: pending } = useSWR<PendingReport[]>("/reports/pending");

  const notFound = courseError instanceof ApiError && courseError.status === 404;

  const courseReqs = (allReqs ?? []).filter(
    r => r.teaching_course_id === tcId || r.course_code === course?.code,
  );
  const reqCounts = countByStatus(courseReqs);

  const pendingReports = (pending ?? []).filter(
    p => p.teaching_course_id === tcId || p.course_code === course?.code,
  );

  const regularSecs = (course?.sections ?? []).filter(s => s.track === "regular").length;
  const specialSecs = (course?.sections ?? []).filter(s => s.track === "special").length;

  // จำนวน TA จริงในรายวิชา = รวม TA จากคำขอที่อนุมัติแล้ว (ไม่ใช่จำนวนสูงสุดที่งบรองรับ)
  const approvedTaCount = courseReqs
    .filter(r => r.status === "approved")
    .reduce((sum, r) => sum + (r.ta_count ?? 0), 0);

  return (
    <div>
      <PageHeader
        title={course ? `${courseCodeLabel(course)} ${course.name_th}` : t("รายวิชา")}
        description={t("ภาพรวมสถานะและข้อมูลของรายวิชานี้")}
        actions={
          <Link href="/lecturer">
            <Button variant="ghost" size="sm">
              <ChevronLeft size={14} /> {t("วิชาอื่น")}
            </Button>
          </Link>
        }
      />

      {notFound ? (
        <Panel>
          <EmptyState title={t("ไม่พบรายวิชา")} description={t("อาจถูกลบหรือคุณไม่ได้รับผิดชอบวิชานี้")} />
        </Panel>
      ) : courseError ? (
        <Panel>
          <Alert
            status="danger"
            icon={<CircleAlert size={16} />}
            title={t("โหลดข้อมูลรายวิชาไม่สำเร็จ")}
            description={(courseError as Error).message || t("กรุณาลองใหม่อีกครั้ง")}
            action={
              courseKey && (
                <Button variant="secondary" size="sm" onPress={() => mutate(courseKey)}>
                  {t("ลองใหม่")}
                </Button>
              )
            }
          />
        </Panel>
      ) : (
        // No whole-page gate: the course, the request list, the budget and the
        // pending reports are four independent requests, and each block below
        // fills in from its own — the labels are fixed, only values wait.
        <>
          {/* Compact info strip — everything at a glance, no drilling */}
          <Panel className="mb-4" data-tour="course-info">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              <InfoItem label={t("นักศึกษา")}>
                {course ? (
                  <>
                    <span className="text-lg font-semibold tabular-nums">{course.num_students}</span>
                    <span className="text-muted ml-1">{t("คน")}</span>
                    <span className="text-xs text-muted ml-2">
                      {t("({regular} ปกติ / {special} พิเศษ)", { regular: course.num_students_regular, special: course.num_students_special })}
                    </span>
                  </>
                ) : <InfoSkel />}
              </InfoItem>
              <Divider />
              <InfoItem label="Section">
                {course ? (
                  <>
                    <span className="text-lg font-semibold tabular-nums">
                      {course.sections?.length ?? 0}
                    </span>
                    <span className="text-xs text-muted ml-2">
                      {t("({regular} ปกติ / {special} พิเศษ)", { regular: regularSecs, special: specialSecs })}
                    </span>
                  </>
                ) : <InfoSkel />}
              </InfoItem>
              <Divider />
              <InfoItem label={t("TA ในรายวิชา")}>
                {/* Matching falls back to the course code, so wait for both. */}
                {course && allReqs ? (
                  <>
                    <span className="text-lg font-semibold tabular-nums">{approvedTaCount}</span>
                    <span className="text-muted ml-1">{t("คน")}</span>
                    <span className="text-xs text-muted ml-2">{t("(อนุมัติแล้ว)")}</span>
                  </>
                ) : <InfoSkel />}
              </InfoItem>
              <Divider />
              <InfoItem label={t("หน่วยกิต")}>
                {course ? (
                  <>
                    <span className="text-lg font-semibold tabular-nums">{course.credits}</span>
                    <span className="text-xs text-muted ml-2">
                      (Lec {course.lecture_hrs} / Lab {course.lab_hrs})
                    </span>
                  </>
                ) : <InfoSkel />}
              </InfoItem>
            </div>
          </Panel>

          {/* วันชดเชยค้าง = TA ลงเวลาวันนั้นไม่ได้ → เบิกไม่ได้ ต้องดันให้เห็นตั้งแต่หน้าแรก */}
          {!!course?.unresolved_makeups && course.unresolved_makeups > 0 && (
            <div className="mb-4">
              <Alert
                status="danger"
                icon={<CalendarOff size={16} />}
                title={t("ต้องกำหนดวันชดเชย {n} คาบ", { n: course.unresolved_makeups })}
                description={t("คาบเหล่านี้ตรงกับวันหยุด ถ้ายังไม่กำหนดวันชดเชย ระบบจะข้ามวันนั้น TA จะลงเวลาไม่ได้และเบิกค่าตอบแทนส่วนนี้ไม่ได้")}
                action={
                  <Link href={`/lecturer/courses/${tcId}/holidays`}>
                    <Button variant="primary" size="sm">{t("กำหนดวันชดเชย")}</Button>
                  </Link>
                }
              />
            </div>
          )}

          {budget?.over_budget && (
            <div className="mb-4">
              <Alert
                status="danger"
                icon={<AlertTriangle size={16} />}
                title={t("งบใช้เกินเพดาน")}
                description={t("ลดจำนวน TA หรือปรับภาระงานเพื่อให้ไม่เกินเพดานงบต่อวิชา")}
                action={
                  <Link href={`/lecturer/courses/${tcId}/budget`}>
                    <Button variant="secondary" size="sm">{t("ตรวจสอบงบ")}</Button>
                  </Link>
                }
              />
            </div>
          )}

          {/* Status cards — real state, not just navigation */}
          <div data-tour="course-cards" className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <BudgetStatusCard tcId={tcId} budget={budget} />
            <RequestStatusCard
              tcId={tcId}
              counts={reqCounts}
              total={courseReqs.length}
              loading={allReqs === undefined || !course}
            />
            <ReportStatusCard tcId={tcId} count={pendingReports.length} loading={pending === undefined} />
          </div>

          {/* Monthly reimbursement status, grouped per TA */}
          <div data-tour="course-submissions" className="mb-4">
            <CourseSubmissionPanel tcId={tcId} role="lecturer" />
          </div>

          {/* Sections — compact inline chips */}
          <Panel
            data-tour="course-sections-list"
            title={t("Section ทั้งหมด")}
            description={
              course
                ? t("รายวิชานี้มี {n} section", { n: course.sections?.length ?? 0 })
                : t.rich("รายวิชานี้มี {n} section", { n: <SkelValue className="h-3 w-4" /> })
            }
            className="mb-4"
          >
            {!course ? (
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2].map(i => <Skel key={i} className="h-8 w-28 rounded-full" />)}
              </div>
            ) : (course.sections ?? []).length === 0 ? (
              <div className="text-sm text-muted">{t("ยังไม่มี section")}</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {course.sections!.map(s => (
                  <div
                    key={s.id}
                    className="inline-flex items-center gap-2 rounded-full border border-border pl-1 pr-3 py-1"
                  >
                    <span className={
                      "inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-semibold tabular-nums " +
                      (s.track === "special" ? "bg-warning-soft text-warning-soft-foreground" : "bg-accent-soft text-accent-soft-foreground")
                    }>
                      {s.sec_no}
                    </span>
                    <span className="text-xs text-muted">
                      {s.track === "special" ? t("ภาคพิเศษ") : t("ภาคปกติ")}
                      {s.room ? ` · ${s.room}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bits                                                                       */
/* -------------------------------------------------------------------------- */

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-muted font-medium">{label}</div>
      <div className="mt-0.5 leading-none">{children}</div>
    </div>
  );
}

/** Value line of an InfoItem while its request is in flight. */
function InfoSkel() {
  return (
    <span className="inline-flex items-baseline gap-2">
      <SkelValue className="h-5 w-8" />
      <SkelValue className="h-3 w-24" />
    </span>
  );
}

function Divider() {
  return <div className="hidden md:block w-px h-8 bg-(--hairline) self-center" />;
}

function countByStatus(rows: TARequestRow[]) {
  const c = { approved: 0, submitted: 0, draft: 0, rejected: 0, cancelled: 0, pending: 0 };
  for (const r of rows) {
    if (r.status in c) (c as Record<string, number>)[r.status]++;
  }
  return c;
}

/* -------------------------------------------------------------------------- */
/* Status cards                                                               */
/* -------------------------------------------------------------------------- */

function StatusCardShell({
  icon, title, tone = "brand", href, hrefLabel, children,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: "brand" | "warn" | "danger" | "success";
  href: string;
  hrefLabel: string;
  children: React.ReactNode;
}) {
  const iconBg = {
    brand: "bg-accent-soft text-accent-soft-foreground",
    warn: "bg-warning-soft text-warning-soft-foreground",
    danger: "bg-danger-soft text-danger-soft-foreground",
    success: "bg-success-soft text-success-soft-foreground",
  }[tone];
  return (
    <Panel className="h-full">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <div className="min-h-22">{children}</div>
      <Link
        href={href}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
      >
        {hrefLabel} <ArrowRight size={12} />
      </Link>
    </Panel>
  );
}

function BudgetStatusCard({ tcId, budget }: { tcId: string; budget?: Budget }) {
  const { t, intl } = useI18n();
  if (!budget) {
    return (
      <StatusCardShell
        icon={<Wallet size={16} />}
        title={t("งบประมาณโดยประมาณ")}
        href={`/lecturer/courses/${tcId}/budget`}
        hrefLabel={t("คำนวณงบ / ดูรายละเอียด")}
      >
        {/* Same rows as the loaded card: total, two track boxes, bar, legend. */}
        <div className="flex items-baseline justify-between mb-2">
          <Skel className="h-3.5 w-16" />
          <Skel className="h-6 w-28" />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Skel className="h-[58px] rounded-lg" />
          <Skel className="h-[58px] rounded-lg" />
        </div>
        <Skel className="h-2 w-full rounded-full" />
        <Skel className="mt-2 h-3 w-2/3" />
      </StatusCardShell>
    );
  }
  const pct = budget.per_course_max > 0
    ? (budget.used_baht / budget.per_course_max) * 100
    : 0;
  const tone: "brand" | "warn" | "danger" | "success" =
    budget.over_budget ? "danger" : pct >= 80 ? "warn" : "success";
  return (
    <StatusCardShell
      icon={<Wallet size={16} />}
      title={t("งบประมาณโดยประมาณ")}
      tone={tone}
      href={`/lecturer/courses/${tcId}/budget`}
      hrefLabel={t("คำนวณงบ / ดูรายละเอียด")}
    >
      {/* งบทั้งเทอมของรายวิชา (โดยประมาณ) + แยกภาคปกติ/ภาคพิเศษ */}
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm text-muted">{t("งบทั้งเทอม")}</span>
        <span className="text-xl font-semibold tabular-nums">
          ~{baht(budget.per_course_max, intl)} <span className="text-sm font-normal text-muted">{t("บ.")}</span>
        </span>
      </div>

      <div className="mb-2">
        <BudgetCapNotice cap={budget.budget_cap_baht} formula={budget.formula_baht} applied={budget.cap_applied} compact />
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <TrackBudget
          label={t("ภาคปกติ")}
          amount={budget.term_pay_regular}
          students={budget.num_students_regular}
        />
        <TrackBudget
          label={t("ภาคพิเศษ")}
          amount={budget.term_pay_special}
          students={budget.num_students_special}
        />
      </div>

      {/* Segmented by pool rather than one flat fill — "how full" is still the
          same %, but a lecturer can now also see whether it's ภาคปกติ or
          ภาคพิเศษ money doing the filling. Whether the pool is in trouble is
          still the tone above and the text below; the bar itself only says
          which pool. */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
        {budget.used_baht_regular > 0.5 && (
          <Tip content={t("ภาคปกติ ~{n} บ.", { n: baht(budget.used_baht_regular, intl) })}><div
            className={TRACK_BAR_COLOR.regular}
            style={{ width: `${Math.min(100, (budget.used_baht_regular / budget.per_course_max) * 100)}%` }}
          /></Tip>
        )}
        {budget.used_baht_special > 0.5 && (
          <Tip content={t("ภาคพิเศษ ~{n} บ.", { n: baht(budget.used_baht_special, intl) })}><div
            className={TRACK_BAR_COLOR.special}
            style={{ width: `${Math.min(100, (budget.used_baht_special / budget.per_course_max) * 100)}%` }}
          /></Tip>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {budget.used_baht_regular > 0.5 && (
            <span className="inline-flex items-center gap-1">
              <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + TRACK_BAR_COLOR.regular} /> {t("ปกติ ~{n}", { n: baht(budget.used_baht_regular, intl) })}
            </span>
          )}
          {budget.used_baht_special > 0.5 && (
            <span className="inline-flex items-center gap-1">
              <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + TRACK_BAR_COLOR.special} /> {t("พิเศษ ~{n}", { n: baht(budget.used_baht_special, intl) })}
            </span>
          )}
        </span>
        <span>
          {t("ใช้ไปแล้ว ~{n} บ. ({pct}%)", { n: baht(budget.used_baht, intl), pct: pct.toFixed(0) })}
          {budget.over_budget
            ? " " + t("เกินเพดานงบ (โดยประมาณ)")
            : pct >= 80
            ? " " + t("ใกล้เต็มงบ (โดยประมาณ)")
            : ""}
        </span>
      </div>
    </StatusCardShell>
  );
}

/** งบแยกรายภาค — จำนวน นศ. บอกที่มาของตัวเลข (0 คน = ไม่มีภาคนั้น) */
function TrackBudget({
  label, amount, students,
}: {
  label: string; amount: number; students: number;
}) {
  const { t, intl } = useI18n();
  return (
    <div className="rounded-lg border border-(--hairline) px-2.5 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={
        "text-sm font-semibold tabular-nums " + (students === 0 ? "text-muted" : "")
      }>
        ~{baht(amount, intl)} <span className="text-[11px] font-normal text-muted">{t("บ.")}</span>
      </div>
      <div className="text-[11px] text-muted">
        {students === 0 ? t("ไม่มีนักศึกษา") : t("{n} คน", { n: students })}
      </div>
    </div>
  );
}

function RequestStatusCard({
  tcId, counts, total, loading,
}: {
  tcId: string;
  counts: Record<string, number>;
  total: number;
  loading: boolean;
}) {
  const { t } = useI18n();
  const active = counts.approved + counts.submitted + counts.pending;
  return (
    <StatusCardShell
      icon={<Send size={16} />}
      title={t("คำขอ TA")}
      tone={counts.rejected > 0 ? "warn" : counts.approved > 0 ? "success" : "brand"}
      href={`/lecturer/courses/${tcId}/request`}
      hrefLabel={total === 0 ? t("ส่งคำขอ TA") : t("จัดการคำขอ")}
    >
      {loading ? (
        <>
          <div className="flex items-baseline gap-2 mb-2">
            <Skel className="h-6 w-8" />
            <Skel className="h-3 w-28" />
          </div>
          <div className="flex gap-1.5">
            <Skel className="h-6 w-20 rounded-full" />
            <Skel className="h-6 w-16 rounded-full" />
          </div>
        </>
      ) : total === 0 ? (
        <div className="text-sm text-muted">
          {t("ยังไม่มีคำขอ TA สำหรับวิชานี้")}
          <div className="text-xs mt-1">{t("ส่งคำขอเพื่อระบุ TA และภาระงานรายสัปดาห์")}</div>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xl font-semibold tabular-nums">{total}</span>
            <span className="text-xs text-muted">{t("คำขอ · {n} ยัง active", { n: active })}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {counts.approved > 0 && (
              <Chip tone="success">{t("อนุมัติ {n}", { n: counts.approved })}</Chip>
            )}
            {counts.submitted > 0 && (
              <Chip tone="info">{t("รอตรวจ {n}", { n: counts.submitted })}</Chip>
            )}
            {counts.pending > 0 && (
              <Chip tone="warn">{t("รอดำเนินการ {n}", { n: counts.pending })}</Chip>
            )}
            {counts.draft > 0 && (
              <Chip tone="neutral">{t("ร่าง {n}", { n: counts.draft })}</Chip>
            )}
            {counts.rejected > 0 && (
              <Chip tone="danger">{t("ปฏิเสธ {n}", { n: counts.rejected })}</Chip>
            )}
          </div>
        </>
      )}
    </StatusCardShell>
  );
}

function ReportStatusCard({
  tcId, count, loading,
}: {
  tcId: string;
  count: number;
  loading: boolean;
}) {
  const { t } = useI18n();
  return (
    <StatusCardShell
      icon={<ClipboardCheck size={16} />}
      title={t("รายงาน TA")}
      tone={count > 0 ? "warn" : "brand"}
      href={`/lecturer/courses/${tcId}/reports`}
      hrefLabel={count > 0 ? t("ตรวจและอนุมัติ") : t("ดูรายการ")}
    >
      {loading ? (
        <>
          <div className="flex items-baseline gap-2 mb-1">
            <Skel className="h-6 w-8" />
            <Skel className="h-3 w-24" />
          </div>
          <Skel className="h-3 w-3/4" />
        </>
      ) : count === 0 ? (
        <div className="text-sm text-muted">
          {t("ไม่มีรายงานรออนุมัติ")}
          <div className="text-xs mt-1">{t("TA จะส่งบันทึกเวลาให้อนุมัติเมื่อสิ้นสุดรอบ")}</div>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-xl font-semibold tabular-nums text-orange-700">{count}</span>
            <span className="text-xs text-muted">{t("รายการรออนุมัติ")}</span>
          </div>
          <div className="text-xs text-muted">
            {t("TA รอให้คุณตรวจบันทึกเวลาที่ส่งเข้ามาสำหรับวิชานี้")}
          </div>
        </>
      )}
    </StatusCardShell>
  );
}
