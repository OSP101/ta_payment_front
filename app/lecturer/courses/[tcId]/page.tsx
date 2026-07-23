"use client";
import { use } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { Breadcrumbs } from "@heroui/react";
import {
  ArrowRight, ChevronLeft, CircleAlert, Wallet, Send, ClipboardCheck, AlertTriangle,
} from "lucide-react";
import { ApiError } from "../../../lib/api";
import {
  PageHeader, Panel, Button, Chip, EmptyState, Alert, ProgressBar,
} from "../../../components/ui";
import { CourseSubmissionPanel } from "../../../components/CourseSubmissionPanel";
import { type TARequestRow } from "../../RequestsTable";

interface Section {
  id: string; sec_no: string; track: string; room?: string;
}
interface TC {
  id: string; code: string; name_th: string; term_id: string;
  num_students: number;
  num_students_regular: number;
  num_students_special: number;
  sections?: Section[];
}
interface Budget {
  per_course_max: number;
  used_baht: number;
  remaining_baht: number;
  over_budget: boolean;
  credits: number;
  lecture_credits: number;
  lab_credits: number;
  suggested_tas: { undergrad: number; graduate: number };
}
interface PendingReport {
  id: string;
  course_code: string;
  teaching_course_id?: string;
}

export default function CoursePage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  const courseKey = tcId ? `/teaching-courses/${tcId}` : null;
  const budgetKey = tcId ? `/teaching-courses/${tcId}/budget` : null;

  const { data: course, error: courseError, isLoading: courseLoading } = useSWR<TC>(courseKey);
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
      <Breadcrumbs className="mb-3">
        <Breadcrumbs.Item href="/lecturer">รายวิชาที่สอน</Breadcrumbs.Item>
        <Breadcrumbs.Item>{course ? `${course.code} — ${course.name_th}` : "…"}</Breadcrumbs.Item>
      </Breadcrumbs>

      <PageHeader
        title={course ? `${course.code} — ${course.name_th}` : "รายวิชา"}
        description="ภาพรวมสถานะและข้อมูลของรายวิชานี้"
        actions={
          <Link href="/lecturer">
            <Button variant="ghost" size="sm">
              <ChevronLeft size={14} /> วิชาอื่น
            </Button>
          </Link>
        }
      />

      {notFound ? (
        <Panel>
          <EmptyState title="ไม่พบรายวิชา" description="อาจถูกลบหรือคุณไม่ได้รับผิดชอบวิชานี้" />
        </Panel>
      ) : courseError ? (
        <Panel>
          <Alert
            status="danger"
            icon={<CircleAlert size={16} />}
            title="โหลดข้อมูลรายวิชาไม่สำเร็จ"
            description={(courseError as Error).message || "กรุณาลองใหม่อีกครั้ง"}
            action={
              courseKey && (
                <Button variant="secondary" size="sm" onPress={() => mutate(courseKey)}>
                  ลองใหม่
                </Button>
              )
            }
          />
        </Panel>
      ) : courseLoading || !course ? (
        <div>
          <div className="h-14 rounded-xl bg-surface-secondary animate-pulse mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {[0, 1, 2].map(i => <div key={i} className="h-40 rounded-xl bg-surface-secondary animate-pulse" />)}
          </div>
          <div className="h-40 rounded-xl bg-surface-secondary animate-pulse" />
        </div>
      ) : (
        <>
          {/* Compact info strip — everything at a glance, no drilling */}
          <Panel className="mb-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              <InfoItem label="นักศึกษา">
                <span className="text-lg font-semibold tabular-nums">{course.num_students}</span>
                <span className="text-muted ml-1">คน</span>
                <span className="text-xs text-muted ml-2">
                  ({course.num_students_regular} ปกติ / {course.num_students_special} พิเศษ)
                </span>
              </InfoItem>
              <Divider />
              <InfoItem label="Section">
                <span className="text-lg font-semibold tabular-nums">
                  {course.sections?.length ?? 0}
                </span>
                <span className="text-xs text-muted ml-2">
                  ({regularSecs} ปกติ / {specialSecs} พิเศษ)
                </span>
              </InfoItem>
              <Divider />
              <InfoItem label="TA ในรายวิชา">
                <span className="text-lg font-semibold tabular-nums">{approvedTaCount}</span>
                <span className="text-muted ml-1">คน</span>
                <span className="text-xs text-muted ml-2">(อนุมัติแล้ว)</span>
              </InfoItem>
              {budget && (
                <>
                  <Divider />
                  <InfoItem label="หน่วยกิต">
                    <span className="text-lg font-semibold tabular-nums">{budget.credits}</span>
                    <span className="text-xs text-muted ml-2">
                      (Lec {budget.lecture_credits} / Lab {budget.lab_credits})
                    </span>
                  </InfoItem>
                </>
              )}
            </div>
          </Panel>

          {budget?.over_budget && (
            <div className="mb-4">
              <Alert
                status="danger"
                icon={<AlertTriangle size={16} />}
                title="งบใช้เกินเพดาน"
                description="ลดจำนวน TA หรือปรับภาระงานเพื่อให้ไม่เกินเพดานงบต่อวิชา"
                action={
                  <Link href={`/lecturer/courses/${tcId}/budget`}>
                    <Button variant="secondary" size="sm">ตรวจสอบงบ</Button>
                  </Link>
                }
              />
            </div>
          )}

          {/* Status cards — real state, not just navigation */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <BudgetStatusCard tcId={tcId} budget={budget} />
            <RequestStatusCard tcId={tcId} counts={reqCounts} total={courseReqs.length} />
            <ReportStatusCard tcId={tcId} count={pendingReports.length} loading={pending === undefined} />
          </div>

          {/* Monthly reimbursement status, grouped per TA */}
          <div className="mb-4">
            <CourseSubmissionPanel tcId={tcId} role="lecturer" />
          </div>

          {/* Sections — compact inline chips */}
          <Panel
            title="Section ทั้งหมด"
            description={`รายวิชานี้มี ${course.sections?.length ?? 0} section`}
            className="mb-4"
          >
            {(course.sections ?? []).length === 0 ? (
              <div className="text-sm text-muted">ยังไม่มี section</div>
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
                      {s.track === "special" ? "ภาคพิเศษ" : "ภาคปกติ"}
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
  if (!budget) {
    return (
      <StatusCardShell
        icon={<Wallet size={16} />}
        title="งบประมาณโดยประมาณ"
        href={`/lecturer/courses/${tcId}/budget`}
        hrefLabel="คำนวณงบ / ดูรายละเอียด"
      >
        <div className="h-4 rounded bg-surface-secondary animate-pulse mb-2" />
        <div className="h-3 rounded bg-surface-secondary animate-pulse w-2/3" />
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
      title="งบประมาณโดยประมาณ"
      tone={tone}
      href={`/lecturer/courses/${tcId}/budget`}
      hrefLabel="คำนวณงบ / ดูรายละเอียด"
    >
      <div className="flex items-baseline justify-between mb-1">
        <div>
          <span className="text-xl font-semibold tabular-nums">
            ฿{budget.used_baht.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span className="text-xs text-muted ml-1">
            / ฿{budget.per_course_max.toLocaleString()}
          </span>
        </div>
        <span className={
          "text-xs font-medium tabular-nums " +
          (budget.over_budget ? "text-red-600" : "text-muted")
        }>
          {pct.toFixed(0)}%
        </span>
      </div>
      <ProgressBar value={pct} tone={tone} />
      <div className="text-xs text-muted mt-2">
        คงเหลือ{" "}
        <span className={
          "font-semibold tabular-nums " +
          (budget.over_budget ? "text-red-600" : "text-emerald-700")
        }>
          ฿{budget.remaining_baht.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>
      <div className="text-[11px] text-muted mt-1">ตัวเลขโดยประมาณ (ไม่แน่นอน)</div>
    </StatusCardShell>
  );
}

function RequestStatusCard({
  tcId, counts, total,
}: {
  tcId: string;
  counts: Record<string, number>;
  total: number;
}) {
  const active = counts.approved + counts.submitted + counts.pending;
  return (
    <StatusCardShell
      icon={<Send size={16} />}
      title="คำขอ TA"
      tone={counts.rejected > 0 ? "warn" : counts.approved > 0 ? "success" : "brand"}
      href={`/lecturer/courses/${tcId}/request`}
      hrefLabel={total === 0 ? "ส่งคำขอ TA" : "จัดการคำขอ"}
    >
      {total === 0 ? (
        <div className="text-sm text-muted">
          ยังไม่มีคำขอ TA สำหรับวิชานี้
          <div className="text-xs mt-1">ส่งคำขอเพื่อระบุ TA และภาระงานรายสัปดาห์</div>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xl font-semibold tabular-nums">{total}</span>
            <span className="text-xs text-muted">คำขอ · {active} ยัง active</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {counts.approved > 0 && (
              <Chip tone="success">อนุมัติ {counts.approved}</Chip>
            )}
            {counts.submitted > 0 && (
              <Chip tone="info">รอตรวจ {counts.submitted}</Chip>
            )}
            {counts.pending > 0 && (
              <Chip tone="warn">รอดำเนินการ {counts.pending}</Chip>
            )}
            {counts.draft > 0 && (
              <Chip tone="neutral">ร่าง {counts.draft}</Chip>
            )}
            {counts.rejected > 0 && (
              <Chip tone="danger">ปฏิเสธ {counts.rejected}</Chip>
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
  return (
    <StatusCardShell
      icon={<ClipboardCheck size={16} />}
      title="รายงาน TA"
      tone={count > 0 ? "warn" : "brand"}
      href={`/lecturer/courses/${tcId}/reports`}
      hrefLabel={count > 0 ? "ตรวจและอนุมัติ" : "ดูรายการ"}
    >
      {loading ? (
        <div className="h-4 rounded bg-surface-secondary animate-pulse w-1/2" />
      ) : count === 0 ? (
        <div className="text-sm text-muted">
          ไม่มีรายงานรออนุมัติ
          <div className="text-xs mt-1">TA จะส่งบันทึกเวลาให้อนุมัติเมื่อสิ้นสุดรอบ</div>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-xl font-semibold tabular-nums text-orange-700">{count}</span>
            <span className="text-xs text-muted">รายการรออนุมัติ</span>
          </div>
          <div className="text-xs text-muted">
            TA รอให้คุณตรวจบันทึกเวลาที่ส่งเข้ามาสำหรับวิชานี้
          </div>
        </>
      )}
    </StatusCardShell>
  );
}
