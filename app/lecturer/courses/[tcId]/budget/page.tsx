"use client";
import BudgetCapNotice from "../../../../components/BudgetCapNotice";
import { use, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { mutate } from "swr";
import { AlertTriangle, Info as InfoIcon, Sparkles, HelpCircle, CircleAlert } from "lucide-react";
import { ApiError } from "../../../../lib/api";
import { PageHeader, Panel, Chip, EmptyState, Alert, Button, IconButton } from "../../../../components/ui";
import { FormulaHelpModal } from "../../../../components/formula-help";
import { TaPlanner, planHandoffKey, type PlanItem } from "../../../../components/TaPlanner";
import { SkelValue } from "../../../../components/Skeletons";
import { useI18n } from "../../../../lib/i18n/client";

interface Budget {
  num_students: number;
  num_students_regular: number;
  num_students_special: number;
  credits: number; lecture_credits: number; lab_credits: number;
  lecture_hrs: number; lab_hrs: number;
  per_course_max: number; used_baht: number; remaining_baht: number; over_budget: boolean;
  budget_cap_baht: number | null; formula_baht: number; cap_applied: boolean;
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
  const { t } = useI18n();
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
  const { data: b, error: bError } = useSWR<Budget>(budgetKey);
  const courseName = course;

  const notFound = bError instanceof ApiError && bError.status === 404;

  return (
    <div>
      <PageHeader
        title={t("โปรแกรมคำนวณงบ TA")}
        description={courseName ? `${courseName.code} ${courseName.name_th}` : t("ประเมินภาระงาน จำนวน TA และงบประมาณ")}
        actions={
          <span data-tour="budget-help">
            <Button variant="secondary" onClick={() => setHelpTrack("regular")}>
              <HelpCircle size={16} />{t("วิธีคิดสูตร")}
            </Button>
          </span>
        }
      />

      {notFound ? (
        <Panel>
          <EmptyState title={t("ไม่พบข้อมูลงบประมาณ")} description={t("อาจถูกลบหรือคุณไม่ได้รับผิดชอบวิชานี้")} />
        </Panel>
      ) : bError ? (
        <Panel>
          <Alert
            status="danger"
            icon={<CircleAlert size={16} />}
            title={t("โหลดข้อมูลงบประมาณไม่สำเร็จ")}
            description={(bError as Error).message || t("กรุณาลองใหม่อีกครั้ง")}
            action={
              budgetKey && (
                <Button variant="secondary" size="sm" onPress={() => mutate(budgetKey)}>
                  {t("ลองใหม่")}
                </Button>
              )
            }
          />
        </Panel>
      ) : (
        // Not gated on the budget: the planner fetches its own facts, and the
        // panels below keep their titles and labels while only the figures wait.
        <>
          {b?.over_budget && (
            <div className="mb-4">
              <Alert
                status="danger"
                title={t("งบใช้เกินเพดาน")}
                description={t("โปรดตรวจสอบภาระงาน / จำนวน TA")}
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

          <Panel title={t("ที่มาของเพดานงบ")} className="mb-4" data-tour="budget-info">
            <div className="grid grid-cols-2 gap-4">
              <Info
                k={t("หน่วยกิต")}
                v={!b ? <SkelValue className="h-6 w-32" /> : course ? `${b.credits} (Lec ${course.lecture_hrs} / Lab ${course.lab_hrs})` : `${b.credits}`}
              />
              <Info k={t("เพดานงบ/วิชา")} v={b ? t("{n} บ.", { n: b.per_course_max.toLocaleString() }) : <SkelValue className="h-6 w-24" />} />
              {b && b.budget_cap_baht != null && (
                <div className="col-span-2">
                  <BudgetCapNotice cap={b.budget_cap_baht} formula={b.formula_baht} applied={b.cap_applied} />
                </div>
              )}
              {/* จำนวน TA ที่ควรมี ตอบโดยตัววางแผนด้านบนที่เดียว — ตัวเลขแนะนำ
                  แบบเก่า (นศ./25 ไม่เกิน 3) ไม่ได้ดูงบและขัดกับแผน จึงเอาออก (12/09/2026) */}
            </div>
          </Panel>

          <div data-tour="budget-tracks" className="grid gap-4 md:grid-cols-2 mb-4">
            <TrackPanel
              title={t("ภาคปกติ")}
              tone="brand"
              students={b?.num_students_regular}
              workload={b?.weekly_workload_regular}
              monthly={b?.monthly_pay_regular}
              term={b?.term_pay_regular}
              months={b?.rates.term_months}
              onHelp={() => setHelpTrack("regular")}
            />
            <TrackPanel
              title={t("ภาคพิเศษ")}
              tone="warn"
              students={b?.num_students_special}
              workload={b?.weekly_workload_special}
              monthly={b?.monthly_pay_special}
              term={b?.term_pay_special}
              months={b?.rates.term_months}
              onHelp={() => setHelpTrack("special")}
            />
          </div>

          <Panel title={t("งบรวม")} className="mb-4" data-tour="budget-total">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Info k={t("ภาระงาน TA ตรี / สัปดาห์")} v={b ? t("{h} ชม.", { h: b.weekly_workload_hours.toFixed(2) }) : <InfoSkel />} />
              <Info k={t("ค่าตอบแทน TA ตรี / เดือน")} v={b ? t("{n} บ.", { n: b.monthly_pay_baht.toFixed(0) }) : <InfoSkel />} />
              <Info k={t("รวมทั้งเทอม (ตรี)")} v={b ? t("{n} บ.", { n: b.term_pay_baht.toFixed(0) }) : <InfoSkel />} />
              <Info k={t("ใช้ไปแล้ว")} v={b ? t("{n} บ.", { n: b.used_baht.toFixed(0) }) : <InfoSkel />} />
              <Info k={t("คงเหลือ")} v={b ? t("{n} บ.", { n: b.remaining_baht.toFixed(0) }) : <InfoSkel />}
                    tone={b ? (b.over_budget ? "danger" : "success") : undefined} />
            </div>
          </Panel>

          <Panel
            title={<span className="flex items-center gap-2"><Sparkles size={16} className="text-accent" />{t("เข้าใจสูตร")}</span>}
            description={t("งงว่าตัวเลขข้างบนคำนวณมาจากไหน? ดูวิธีคิดทีละขั้นตอนพร้อมค่าจริง")}
            actions={
              <Button variant="primary" onClick={() => setHelpTrack("regular")}>
                <HelpCircle size={14} />{t("ดูวิธีคิด")}
              </Button>
            }
          >
            <div className="text-sm text-muted">
              {t.rich("สูตรอ้างอิงจากไฟล์ Excel {file} ชีต {sheet} คลิกปุ่ม \"ดูวิธีคิด\" เพื่อดูตัวอย่างการคำนวณของวิชานี้ พร้อมกราฟิกอธิบายทีละขั้น", {
                file: <b>{"ค่า-TA-ภาคต้น-ปี-2560"}</b>, // i18n-ignore — the source file's name
                sheet: <b>{"2_59 ป.ตรี"}</b>, // i18n-ignore — the sheet's name in that file
              })}
            </div>
          </Panel>

          {b && <FormulaHelpModal
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
              trackLabel: helpTrack === "special" ? t("ภาคพิเศษ") : t("ภาคปกติ"),
              isSpecial: helpTrack === "special",
              courseName: courseName ? `${courseName.code} — ${courseName.name_th}` : undefined,
            }}
          />}
        </>
      )}
    </div>
  );
}

function InfoSkel() {
  return <SkelValue className="h-6 w-20" />;
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
  // All undefined while the budget is loading — the rows keep their labels
  // and only the figures wait.
  students?: number;
  workload?: number;
  monthly?: number;
  term?: number;
  months?: number;
  onHelp: () => void;
}) {
  const { t } = useI18n();
  const v = (n: number | undefined, fmt: (n: number) => string, w = "w-16") =>
    n === undefined ? <SkelValue className={`h-4 ${w}`} /> : fmt(n);
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {title}
          {students === undefined
            ? <SkelValue className="h-6 w-14 rounded-full" />
            : <Chip tone={tone}>{t("{n} คน", { n: students })}</Chip>}
        </span>
      }
      actions={
        <IconButton label={t("ดูวิธีคิด")} variant="ghost" size="sm" onClick={onHelp}>
          <InfoIcon size={16} />
        </IconButton>
      }
    >
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">{t("ภาระงาน/สัปดาห์")}</span>
          <span className="tabular font-medium">{v(workload, n => t("{h} ชม.", { h: n.toFixed(2) }))}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">{t("งบ/เดือน")}</span>
          <span className="tabular font-medium">{v(monthly, n => `฿${n.toFixed(0)}`)}{/* i18n-ignore — ฿ symbol stays */}</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-[var(--hairline)]">
          <span className="text-muted">{t.rich("× {n} เดือน", { n: v(months, n => String(n), "w-4") })}</span>
          <span className="tabular font-semibold text-base">{v(term, n => `฿${n.toFixed(0)}`, "w-20")}{/* i18n-ignore — ฿ symbol stays */}</span>
        </div>
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Formula help modal — step-by-step explanation with actual values           */
/* -------------------------------------------------------------------------- */

