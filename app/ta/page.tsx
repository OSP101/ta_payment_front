"use client";
import useSWR from "swr";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Users, ArrowRight, CalendarClock, CalendarX2, AlertTriangle, RefreshCw, Wallet } from "lucide-react";
import type { Term } from "../lib/api";
import {
  PageHeader, Panel, StatCard, EmptyState, Chip, SelectField, Spinner, Button, type SelectOption, type ChipTone,
} from "../components/ui";

interface TAStatus {
  teaching_course_id: string;
  stage: "draft" | "submitted" | "approved" | "exported";
  hours_approved: number;
  hours_pending: number;
  estimated_baht: number;
}

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

  const totalStudents = (courses ?? []).reduce((a, c) => a + (c.num_students ?? 0), 0);
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
              label="นักศึกษาลงทะเบียนรวม"
              value={totalStudents}
              icon={<Users size={18} />}
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
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/ta/worklog?course=${c.id}`}
                        className="flex items-center gap-4 px-5 py-4 hover:bg-surface-secondary transition-colors group"
                      >
                        <div className="w-10 h-10 rounded-lg bg-accent-soft text-accent-soft-foreground flex items-center justify-center shrink-0">
                          <BookOpen size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold tabular">{c.code}</span>
                            <span className="text-foreground">{c.name_th}</span>
                            {st && <Chip tone={STAGE_TONE[st.stage]}>{STAGE_LABEL[st.stage]}</Chip>}
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
