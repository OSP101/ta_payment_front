"use client";
import { use, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { mutate } from "swr";
import { AlertTriangle, Info as InfoIcon, Sparkles, HelpCircle, CircleAlert } from "lucide-react";
import { ApiError } from "../../../../lib/api";
import { PageHeader, Panel, Chip, EmptyState, Alert, Button, IconButton } from "../../../../components/ui";
import { FormulaHelpModal } from "../../../../components/formula-help";
import { TaPlanner, planHandoffKey, type PlanItem } from "../../../../components/TaPlanner";

interface Budget {
  num_students: number;
  num_students_regular: number;
  num_students_special: number;
  credits: number; lecture_credits: number; lab_credits: number;
  lecture_hrs: number; lab_hrs: number;
  per_course_max: number; used_baht: number; remaining_baht: number; over_budget: boolean;
  weekly_workload_hours: number; monthly_pay_baht: number; term_pay_baht: number;
  weekly_workload_regular: number; monthly_pay_regular: number; term_pay_regular: number;
  weekly_workload_special: number; monthly_pay_special: number; term_pay_special: number;
  suggested_tas: { undergrad: number; graduate: number };
  rates: {
    ug_workload_rate_regular: number;
    graduate_regular_monthly?: number; graduate_special_monthly?: number;
    term_months: number;
  };
}

export default function BudgetPage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  const [helpTrack, setHelpTrack] = useState<"regular" | "special" | null>(null);

  const router = useRouter();
  const { data: course } = useSWR<{
    id: string; code: string; name_th: string; num_students: number;
    lecture_hrs: number; lab_hrs: number;
    sections?: { id: string; schedules?: { day_of_week: number; start_time: string; end_time: string }[] }[];
  }>(
    tcId ? `/teaching-courses/${tcId}` : null,
  );
  const schedules = useMemo(() => {
    const out: Record<string, { day_of_week: number; start_time: string; end_time: string }[]> = {};
    for (const sec of course?.sections ?? []) out[sec.id] = sec.schedules ?? [];
    return out;
  }, [course?.sections]);
  // A plan chosen here is carried to the request form, which reads it once on
  // arrival — the lecturer lands on a form that already has the rows.
  const goRequestWith = useCallback((items: PlanItem[]) => {
    try { sessionStorage.setItem(planHandoffKey(tcId), JSON.stringify(items)); } catch { /* private mode */ }
    router.push(`/lecturer/courses/${tcId}/request`);
  }, [router, tcId]);
  const budgetKey = tcId ? `/teaching-courses/${tcId}/budget` : null;
  const { data: b, error: bError, isLoading: bLoading } = useSWR<Budget>(budgetKey);
  const courseName = course;

  const notFound = bError instanceof ApiError && bError.status === 404;

  return (
    <div>
      <PageHeader
        title="โปรแกรมคำนวณงบ TA"
        description={courseName ? `${courseName.code} ${courseName.name_th}` : "ประเมินภาระงาน จำนวน TA และงบประมาณ"}
        actions={
          <span data-tour="budget-help">
            <Button variant="secondary" onClick={() => setHelpTrack("regular")}>
              <HelpCircle size={16} />วิธีคิดสูตร
            </Button>
          </span>
        }
      />

      {notFound ? (
        <Panel>
          <EmptyState title="ไม่พบข้อมูลงบประมาณ" description="อาจถูกลบหรือคุณไม่ได้รับผิดชอบวิชานี้" />
        </Panel>
      ) : bError ? (
        <Panel>
          <Alert
            status="danger"
            icon={<CircleAlert size={16} />}
            title="โหลดข้อมูลงบประมาณไม่สำเร็จ"
            description={(bError as Error).message || "กรุณาลองใหม่อีกครั้ง"}
            action={
              budgetKey && (
                <Button variant="secondary" size="sm" onPress={() => mutate(budgetKey)}>
                  ลองใหม่
                </Button>
              )
            }
          />
        </Panel>
      ) : bLoading || !b ? (
        <div className="space-y-4">
          <div className="h-16 rounded-xl bg-surface-secondary animate-pulse" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-40 rounded-xl bg-surface-secondary animate-pulse" />
            <div className="h-40 rounded-xl bg-surface-secondary animate-pulse" />
          </div>
        </div>
      ) : (
        <>
          {b.over_budget && (
            <div className="mb-4">
              <Alert
                status="danger"
                title="งบใช้เกินเพดาน"
                description="โปรดตรวจสอบภาระงาน / จำนวน TA"
                icon={<AlertTriangle size={18} />}
              />
            </div>
          )}

          {/* The planner: pools, approved TAs and what they will be paid, and
              what still fits — all from the course's own timetable. */}
          <TaPlanner
            tcId={tcId}
            variant="budget"
            scope={course && course.lab_hrs <= 0 ? "lecture" : course && course.lecture_hrs <= 0 ? "lab" : "both"}
            schedules={schedules}
            drafts={[]}
            onApplyPlan={goRequestWith}
          />

          <Panel title="ที่มาของเพดานงบ" className="mb-4" data-tour="budget-info">
            <div className="grid grid-cols-2 gap-4">
              <Info
                k="หน่วยกิต"
                v={course ? `${b.credits} (Lec ${course.lecture_hrs} / Lab ${course.lab_hrs})` : `${b.credits}`}
              />
              <Info k="เพดานงบ/วิชา" v={`${b.per_course_max.toLocaleString()} บ.`} />
              {/* จำนวน TA ที่ควรมี ตอบโดยตัววางแผนด้านบนที่เดียว — ตัวเลขแนะนำ
                  แบบเก่า (นศ./25 ไม่เกิน 3) ไม่ได้ดูงบและขัดกับแผน จึงเอาออก (12/09/2026) */}
            </div>
          </Panel>

          <div data-tour="budget-tracks" className="grid gap-4 md:grid-cols-2 mb-4">
            <TrackPanel
              title="ภาคปกติ"
              tone="brand"
              students={b.num_students_regular}
              workload={b.weekly_workload_regular}
              monthly={b.monthly_pay_regular}
              term={b.term_pay_regular}
              months={b.rates.term_months}
              onHelp={() => setHelpTrack("regular")}
            />
            <TrackPanel
              title="ภาคพิเศษ"
              tone="warn"
              students={b.num_students_special}
              workload={b.weekly_workload_special}
              monthly={b.monthly_pay_special}
              term={b.term_pay_special}
              months={b.rates.term_months}
              onHelp={() => setHelpTrack("special")}
            />
          </div>

          <Panel title="งบรวม" className="mb-4" data-tour="budget-total">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Info k="ภาระงาน TA ตรี / สัปดาห์" v={`${b.weekly_workload_hours.toFixed(2)} ชม.`} />
              <Info k="ค่าตอบแทน TA ตรี / เดือน" v={`${b.monthly_pay_baht.toFixed(0)} บ.`} />
              <Info k="รวมทั้งเทอม (ตรี)" v={`${b.term_pay_baht.toFixed(0)} บ.`} />
              <Info k="ใช้ไปแล้ว" v={`${b.used_baht.toFixed(0)} บ.`} />
              <Info k="คงเหลือ" v={`${b.remaining_baht.toFixed(0)} บ.`}
                    tone={b.over_budget ? "danger" : "success"} />
            </div>
          </Panel>

          <Panel
            title={<span className="flex items-center gap-2"><Sparkles size={16} className="text-accent" />เข้าใจสูตร</span>}
            description="งงว่าตัวเลขข้างบนคำนวณมาจากไหน? ดูวิธีคิดทีละขั้นตอนพร้อมค่าจริง"
            actions={
              <Button variant="primary" onClick={() => setHelpTrack("regular")}>
                <HelpCircle size={14} />ดูวิธีคิด
              </Button>
            }
          >
            <div className="text-sm text-muted">
              สูตรอ้างอิงจากไฟล์ Excel <b>ค่า-TA-ภาคต้น-ปี-2560</b> ชีต <b>2_59 ป.ตรี</b>
              คลิกปุ่ม "ดูวิธีคิด" เพื่อดูตัวอย่างการคำนวณของวิชานี้ พร้อมกราฟิกอธิบายทีละขั้น
            </div>
          </Panel>

          <FormulaHelpModal
            open={helpTrack !== null}
            onClose={() => setHelpTrack(null)}
            constants={{
              hrsPerLecCr: 3, hrsPerLabCr: 4.5,
              baseLec: 60, baseLab: 30,
              rate: b.rates.ug_workload_rate_regular,
              termMonths: b.rates.term_months,
            }}
            example={{
              lecCr: b.lecture_credits,
              labCr: b.lab_credits,
              lecHrs: b.lecture_hrs,
              labHrs: b.lab_hrs,
              students: helpTrack === "special" ? b.num_students_special : b.num_students_regular,
              trackLabel: helpTrack === "special" ? "ภาคพิเศษ" : "ภาคปกติ",
              isSpecial: helpTrack === "special",
              courseName: courseName ? `${courseName.code} — ${courseName.name_th}` : undefined,
            }}
          />
        </>
      )}
    </div>
  );
}

function Info({ k, v, tone }: { k: string; v: React.ReactNode; tone?: "success" | "danger" }) {
  const cls = tone === "danger" ? "text-red-600" : tone === "success" ? "text-emerald-700" : "";
  return (
    <div>
      <div className="text-xs text-[var(--ink-3)]">{k}</div>
      <div className={`text-lg font-semibold tabular mt-0.5 ${cls}`}>{v}</div>
    </div>
  );
}

function TrackPanel({
  title, tone, students, workload, monthly, term, months, onHelp,
}: {
  title: string;
  tone: "brand" | "warn";
  students: number;
  workload: number;
  monthly: number;
  term: number;
  months: number;
  onHelp: () => void;
}) {
  return (
    <Panel
      title={<span className="flex items-center gap-2">{title}<Chip tone={tone}>{students} คน</Chip></span>}
      actions={
        <IconButton label="ดูวิธีคิด" variant="ghost" size="sm" onClick={onHelp}>
          <InfoIcon size={16} />
        </IconButton>
      }
    >
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">ภาระงาน/สัปดาห์</span>
          <span className="tabular font-medium">{workload.toFixed(2)} ชม.</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">งบ/เดือน</span>
          <span className="tabular font-medium">฿{monthly.toFixed(0)}</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-[var(--hairline)]">
          <span className="text-muted">× {months} เดือน</span>
          <span className="tabular font-semibold text-base">฿{term.toFixed(0)}</span>
        </div>
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Formula help modal — step-by-step explanation with actual values           */
/* -------------------------------------------------------------------------- */

