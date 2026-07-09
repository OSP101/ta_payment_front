"use client";
import { use } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Breadcrumbs } from "@heroui/react";
import {
  Send, Calculator, ClipboardCheck, ArrowRight, Users, GraduationCap, BookOpen, ChevronLeft,
} from "lucide-react";
import {
  PageHeader, Panel, StatCard, Button, Chip, EmptyState,
} from "../../../components/ui";
import { RequestsTable, type TARequestRow } from "../../RequestsTable";

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

export default function CoursePage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  const { data: course } = useSWR<TC>(tcId ? `/teaching-courses/${tcId}` : null);
  const { data: allReqs } = useSWR<TARequestRow[]>("/ta-requests");

  const courseReqs = (allReqs ?? []).filter(
    r => r.teaching_course_id === tcId || r.course_code === course?.code,
  );

  const regularSecs = (course?.sections ?? []).filter(s => s.track === "regular").length;
  const specialSecs = (course?.sections ?? []).filter(s => s.track === "special").length;

  return (
    <div>
      <Breadcrumbs className="mb-3">
        <Breadcrumbs.Item href="/lecturer">รายวิชาที่สอน</Breadcrumbs.Item>
        <Breadcrumbs.Item>{course ? `${course.code} — ${course.name_th}` : "…"}</Breadcrumbs.Item>
      </Breadcrumbs>

      <PageHeader
        title={course ? `${course.code} — ${course.name_th}` : "รายวิชา"}
        description="เลือกการดำเนินการที่ต้องการทำในรายวิชานี้"
        actions={
          <Link href="/lecturer">
            <Button variant="ghost" size="sm">
              <ChevronLeft size={14} /> กลับไปเลือกวิชาอื่น
            </Button>
          </Link>
        }
      />

      {!course ? (
        <Panel>
          <EmptyState title="ไม่พบรายวิชา" description="อาจถูกลบหรือคุณไม่ได้รับผิดชอบวิชานี้" />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard
              label="นักศึกษาทั้งหมด"
              value={course.num_students}
              icon={<Users size={18} />}
              tone="brand"
            />
            <StatCard
              label="ภาคปกติ"
              value={course.num_students_regular}
              hint={`${regularSecs} sec`}
              icon={<GraduationCap size={18} />}
            />
            <StatCard
              label="ภาคพิเศษ"
              value={course.num_students_special}
              hint={`${specialSecs} sec`}
              icon={<GraduationCap size={18} />}
              tone="warn"
            />
            <StatCard
              label="Section รวม"
              value={course.sections?.length ?? 0}
              icon={<BookOpen size={18} />}
            />
          </div>

          <Panel title="การจัดการรายวิชา" description="ขั้นตอนการดำเนินงานตามลำดับ" padded={false} className="mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-(--hairline)">
              <ActionCard
                step={1}
                href={`/lecturer/courses/${tcId}/budget`}
                title="คำนวณงบประมาณ"
                description="ประเมินภาระงาน จำนวน TA ที่แนะนำ และงบประมาณต่อวิชา"
                icon={<Calculator size={20} />}
              />
              <ActionCard
                step={2}
                href={`/lecturer/courses/${tcId}/request`}
                title="ส่งคำขอ TA"
                description="เลือก TA ต่อ section และกำหนดภาระงานเพื่อขออนุมัติ"
                icon={<Send size={20} />}
              />
              <ActionCard
                step={3}
                href={`/lecturer/courses/${tcId}/reports`}
                title="อนุมัติรายงาน TA"
                description="ตรวจและอนุมัติรายงานเวลาที่ TA ในวิชานี้ส่งเข้ามา"
                icon={<ClipboardCheck size={20} />}
              />
            </div>
          </Panel>

          <Panel title="Sections" description="รายการ section ในรายวิชานี้" className="mb-4">
            {(course.sections ?? []).length === 0 ? (
              <div className="text-sm text-muted py-4">ยังไม่มี section</div>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {course.sections!.map(s => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium tabular">Sec {s.sec_no}</span>
                      <Chip tone={s.track === "special" ? "warn" : "neutral"}>
                        {s.track === "special" ? "ภาคพิเศษ" : "ภาคปกติ"}
                      </Chip>
                    </div>
                    {s.room && <div className="text-xs text-muted truncate">{s.room}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="mb-2">
            <div className="text-sm font-semibold">ประวัติคำขอ TA ของวิชานี้</div>
            <div className="text-xs text-muted mt-0.5">คำขอทั้งหมดที่คุณเคยส่งสำหรับวิชานี้</div>
          </div>
          <RequestsTable rows={courseReqs} loading={!allReqs} emptyDescription="เริ่มจาก 'ส่งคำขอ TA' ด้านบน" />
        </>
      )}
    </div>
  );
}

function ActionCard({
  step, href, title, description, icon,
}: {
  step: number;
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 p-5 hover:bg-surface-secondary transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-accent-soft text-accent-soft-foreground flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          ขั้นตอน {step}
        </div>
        <div className="text-sm font-semibold text-foreground mt-0.5">{title}</div>
        <div className="text-xs text-muted mt-1 leading-relaxed">{description}</div>
      </div>
      <ArrowRight size={16} className="text-muted group-hover:text-accent transition-colors mt-1 shrink-0" />
    </Link>
  );
}

