"use client";
import { use, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { BookOpen, Clock, Wallet, CalendarClock, ArrowRight, MapPin, AlertTriangle, CircleAlert } from "lucide-react";
import { Breadcrumbs } from "@heroui/react";
import { ApiError } from "../../../lib/api";
import {
  PageHeader, Panel, StatCard, EmptyState, Chip, Alert, Button, type ChipTone,
} from "../../../components/ui";

interface SectionSchedule {
  id: string;
  kind: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room?: string;
}
interface Section {
  id: string;
  sec_no: string;
  track: string;
  room?: string;
  num_students: number;
  schedules?: SectionSchedule[];
}
interface TC {
  id: string;
  code: string;
  name_th: string;
  num_students: number;
  num_students_regular: number;
  num_students_special: number;
  sections?: Section[];
}

interface TAStatus {
  teaching_course_id: string;
  stage: "draft" | "submitted" | "approved" | "exported";
  hours_approved: number;
  hours_pending: number;
  estimated_baht: number;
}

interface Assignment {
  id: string;
  teaching_course_id: string;
  course_code: string;
  course_name: string;
  section_id: string;
  sec_no: string;
  track: string;
  level: string;
}

const DOW_LABEL = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const KIND_LABEL: Record<string, string> = {
  lecture: "บรรยาย",
  lab: "ปฏิบัติการ",
  review: "ตรวจงาน",
};

const STAGE_LABEL: Record<TAStatus["stage"], string> = {
  draft: "แบบร่าง",
  submitted: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  exported: "ส่งออกแล้ว",
};
const STAGE_TONE: Record<TAStatus["stage"], ChipTone> = {
  draft: "neutral",
  submitted: "warn",
  approved: "success",
  exported: "brand",
};

export default function TACoursePage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  const courseKey = tcId ? `/teaching-courses/${tcId}` : null;
  const { data: course, error: courseError, isLoading } = useSWR<TC>(courseKey);
  const { data: status } = useSWR<TAStatus[]>("/dashboard/ta/me");
  const { data: myAssignments } = useSWR<Assignment[]>(
    tcId ? `/me/assignments?teaching_course_id=${tcId}` : null,
  );

  const myStatus = useMemo(
    () => (status ?? []).find(s => s.teaching_course_id === tcId),
    [status, tcId],
  );

  // Only sections the TA is actually assigned to — surface those so the TA
  // sees their schedule, not the whole course.
  const mySectionIds = useMemo(
    () => new Set((myAssignments ?? []).map(a => a.section_id)),
    [myAssignments],
  );
  const mySections = useMemo(() => {
    const secs = (course?.sections ?? []).filter(s => mySectionIds.has(s.id));
    return secs.length > 0 ? secs : (course?.sections ?? []);
  }, [course, mySectionIds]);

  const notFound = courseError instanceof ApiError && courseError.status === 404;

  return (
    <div>
      <Breadcrumbs className="mb-3">
        <Breadcrumbs.Item href="/ta">รายวิชาที่ฉันเป็น TA</Breadcrumbs.Item>
        <Breadcrumbs.Item>{course ? `${course.code} — ${course.name_th}` : "…"}</Breadcrumbs.Item>
      </Breadcrumbs>

      <PageHeader
        title={course ? `${course.code} — ${course.name_th}` : "รายวิชา"}
        description="ภาพรวมสถานะภาระงาน TA ในรายวิชานี้"
        actions={
          <Link href={`/ta/courses/${tcId}/worklog`}>
            <Button variant="primary">
              <Clock size={14} /> ลงเวลาปฏิบัติงาน
            </Button>
          </Link>
        }
      />

      {notFound ? (
        <Panel>
          <EmptyState title="ไม่พบรายวิชา" description="อาจถูกลบ หรือคุณไม่ได้เป็น TA ของรายวิชานี้" />
        </Panel>
      ) : courseError ? (
        <Panel>
          <Alert
            status="danger"
            icon={<CircleAlert size={16} />}
            title="โหลดข้อมูลรายวิชาไม่สำเร็จ"
            description={(courseError as Error).message || "กรุณาลองใหม่อีกครั้ง"}
          />
        </Panel>
      ) : isLoading || !course ? (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-xl bg-surface-secondary animate-pulse" />)}
          </div>
          <div className="h-40 rounded-xl bg-surface-secondary animate-pulse" />
        </div>
      ) : (
        <>
          {/* Hours + stage summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard
              label="สถานะ"
              value={myStatus ? STAGE_LABEL[myStatus.stage] : "—"}
              icon={<CalendarClock size={18} />}
              tone={myStatus?.stage === "approved" ? "success" : myStatus?.stage === "submitted" ? "warn" : "brand"}
            />
            <StatCard
              label="ชม.อนุมัติแล้ว"
              value={(myStatus?.hours_approved ?? 0).toFixed(1)}
              icon={<Clock size={18} />}
              tone="success"
            />
            <StatCard
              label="ชม.รออนุมัติ"
              value={(myStatus?.hours_pending ?? 0).toFixed(1)}
              icon={<Clock size={18} />}
              tone="warn"
            />
            <StatCard
              label="ยอดเงินโดยประมาณ"
              value={`฿${(myStatus?.estimated_baht ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              icon={<Wallet size={18} />}
              tone="brand"
            />
          </div>

          {myAssignments && myAssignments.length === 0 && (
            <div className="mb-4">
              <Alert
                status="warning"
                icon={<AlertTriangle size={16} />}
                title="ยังไม่พบ assignment ของคุณในรายวิชานี้"
                description="อาจารย์อาจยังไม่ได้ยืนยันการมอบหมาย หรือคำขอยังอยู่ระหว่างพิจารณา"
              />
            </div>
          )}

          {/* Section schedule */}
          <Panel
            title="ตารางสอนของรายวิชา"
            description={
              mySections.length > 0 && mySectionIds.size > 0
                ? `แสดงเฉพาะ section ที่คุณเป็น TA (${mySections.length} section)`
                : `รายวิชานี้มี ${course.sections?.length ?? 0} section`
            }
            className="mb-4"
            padded={false}
          >
            {mySections.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<BookOpen size={24} />}
                  title="ยังไม่มี section"
                  description="อาจารย์ยังไม่ได้สร้าง section สำหรับรายวิชานี้"
                />
              </div>
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {mySections.map(sec => (
                  <li key={sec.id} className="p-4 flex flex-col md:flex-row md:items-start gap-3">
                    <div className="flex items-center gap-2 md:w-40 shrink-0">
                      <span className={
                        "inline-flex items-center justify-center min-w-8 h-7 px-2 rounded-full text-xs font-semibold tabular-nums " +
                        (sec.track === "special" ? "bg-warning-soft text-warning-soft-foreground" : "bg-accent-soft text-accent-soft-foreground")
                      }>
                        sec {sec.sec_no}
                      </span>
                      <span className="text-xs text-muted">
                        {sec.track === "special" ? "ภาคพิเศษ" : "ภาคปกติ"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {sec.room && (
                        <div className="text-xs text-muted flex items-center gap-1 mb-1">
                          <MapPin size={12} /> {sec.room}
                        </div>
                      )}
                      {(sec.schedules ?? []).length === 0 ? (
                        <div className="text-xs text-muted">ยังไม่ระบุตารางสอน</div>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {sec.schedules!.map(sch => (
                            <li key={sch.id} className="text-sm flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded bg-surface-secondary text-xs font-medium">
                                {DOW_LABEL[sch.day_of_week] ?? "-"}
                              </span>
                              <span className="tabular-nums text-foreground/90">
                                {sch.start_time.slice(0, 5)}–{sch.end_time.slice(0, 5)}
                              </span>
                              <Chip tone={sch.kind === "lab" ? "warn" : "info"}>
                                {KIND_LABEL[sch.kind] ?? sch.kind}
                              </Chip>
                              {sch.room && (
                                <span className="text-xs text-muted inline-flex items-center gap-1">
                                  <MapPin size={11} /> {sch.room}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Big CTA to worklog */}
          <Panel>
            <Link
              href={`/ta/courses/${tcId}/worklog`}
              className="flex items-center gap-4 group"
            >
              <div className="w-10 h-10 rounded-lg bg-accent-soft text-accent-soft-foreground flex items-center justify-center shrink-0">
                <Clock size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground">ลงเวลาปฏิบัติงาน</div>
                <div className="text-xs text-muted mt-0.5">
                  บันทึกชั่วโมงการทำงานประจำวัน แล้วส่งให้อาจารย์อนุมัติ
                </div>
              </div>
              <ArrowRight size={16} className="text-muted group-hover:text-accent transition-colors shrink-0" />
            </Link>
          </Panel>
        </>
      )}
    </div>
  );
}
