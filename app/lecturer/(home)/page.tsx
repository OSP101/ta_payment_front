"use client";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Users, Calculator, ArrowRight, CalendarClock, CalendarX2, BookPlus, CircleAlert } from "lucide-react";
import type { Term } from "../../lib/api";
import {
  PageHeader, Panel, StatCard, EmptyState, Chip, Button, SelectField, Alert, type SelectOption,
} from "../../components/ui";
import OpenCourseModal from "./OpenCourseModal";

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

export default function LecturerHome() {
  const router = useRouter();
  const params = useSearchParams();
  const yearParam = params.get("year");
  const termParam = params.get("term");
  const [openModal, setOpenModal] = useState(false);

  const { data: terms, error: termsError } = useSWR<Term[]>("/terms");

  // Group terms by academic year (desc).
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

  // Default year: URL → active year → newest year.
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

  // Reflect resolved defaults back into the URL so refresh/bookmark works.
  useEffect(() => {
    if (!terms || byYear.length === 0) return;
    if (yearParam !== defaultYear || termParam !== defaultTerm) {
      const sp = new URLSearchParams();
      if (defaultYear) sp.set("year", defaultYear);
      if (defaultTerm) sp.set("term", defaultTerm);
      router.replace(`/lecturer?${sp.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultYear, defaultTerm, terms]);

  const coursesKey = defaultTerm ? `/teaching-courses?term_id=${defaultTerm}` : null;
  const { data: courses, error: coursesError } = useSWR<TC[]>(coursesKey);

  function setYear(y: string) {
    const list = byYear.find(([yr]) => String(yr) === y)?.[1] ?? [];
    const nextTerm = list.find(t => t.is_active)?.id ?? list[0]?.id ?? "";
    const sp = new URLSearchParams();
    if (y) sp.set("year", y);
    if (nextTerm) sp.set("term", nextTerm);
    router.replace(`/lecturer?${sp.toString()}`);
  }
  function setTerm(t: string) {
    const sp = new URLSearchParams();
    if (defaultYear) sp.set("year", defaultYear);
    if (t) sp.set("term", t);
    router.replace(`/lecturer?${sp.toString()}`);
  }

  const termsLoaded = terms !== undefined;
  const noTerms = termsLoaded && terms!.length === 0;

  const totalStudents = (courses ?? []).reduce((a, c) => a + (c.num_students ?? 0), 0);
  const activeTerm = yearTerms.find(t => t.id === defaultTerm);
  const termDisplay = activeTerm
    ? `${activeTerm.academic_year}/${activeTerm.semester} — ${SEMESTER_LABELS[activeTerm.semester] ?? ""}`
    : "";

  const pageDesc = "เลือกปีการศึกษาและภาคเรียน เพื่อดูรายวิชาที่คุณรับผิดชอบ";

  // Terms failed to load — show a real error (with retry) instead of the
  // misleading "ยังไม่มีภาคเรียน" empty state.
  if (termsError && terms === undefined) {
    return (
      <div>
        <PageHeader title="รายวิชาที่สอน" description={pageDesc} />
        <Panel>
          <Alert
            status="danger"
            icon={<CircleAlert size={16} />}
            title="โหลดข้อมูลภาคเรียนไม่สำเร็จ"
            description={(termsError as Error).message || "กรุณาลองใหม่อีกครั้ง"}
            action={
              <Button variant="secondary" size="sm" onPress={() => mutate("/terms")}>
                ลองใหม่
              </Button>
            }
          />
        </Panel>
      </div>
    );
  }

  // Terms still loading — skeleton, not an empty state.
  if (!termsLoaded) {
    return (
      <div>
        <PageHeader title="รายวิชาที่สอน" description={pageDesc} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-surface-secondary animate-pulse" />)}
        </div>
        <Panel padded={false}>
          <div className="divide-y divide-[var(--hairline)]">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="w-10 h-10 rounded-lg bg-surface-secondary animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-surface-secondary animate-pulse" />
                  <div className="h-3 w-1/4 rounded bg-surface-secondary animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="รายวิชาที่สอน"
        description="เลือกปีการศึกษาและภาคเรียน เพื่อดูรายวิชาที่คุณรับผิดชอบ"
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
              <Button
                variant="primary"
                onClick={() => setOpenModal(true)}
                disabled={!defaultTerm}
              >
                <BookPlus size={16} />เปิดรายวิชา
              </Button>
            </div>
          )
        }
      />

      {noTerms ? (
        <Panel>
          <EmptyState
            icon={<CalendarX2 size={28} />}
            title="ยังไม่มีปีการศึกษา / ภาคเรียนในระบบ"
            description="กรุณาแจ้งเจ้าหน้าที่เพื่อสร้างปีการศึกษาและภาคเรียนก่อน จึงจะแสดงรายวิชาที่คุณรับผิดชอบได้"
          />
        </Panel>
      ) : yearTerms.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<CalendarClock size={28} />}
            title="ไม่มีภาคเรียนในปีการศึกษานี้"
            description="ลองเลือกปีการศึกษาอื่น หรือติดต่อเจ้าหน้าที่เพื่อเพิ่มภาคเรียน"
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
              label="วิชาที่รับผิดชอบ"
              value={courses === undefined ? (coursesError ? "—" : "…") : courses.length}
              icon={<BookOpen size={18} />}
            />
            <StatCard
              label="นักศึกษาลงทะเบียนรวม"
              value={courses === undefined ? (coursesError ? "—" : "…") : totalStudents}
              icon={<Users size={18} />}
            />
          </div>

          <Panel
            title="รายวิชาในภาคเรียนนี้"
            description="คลิกที่วิชาเพื่อเข้าหน้าจัดการ — ส่งคำขอ TA, คำนวณงบ, อนุมัติรายงาน"
            padded={false}
          >
            {coursesError && courses === undefined ? (
              <div className="p-4">
                <Alert
                  status="danger"
                  icon={<CircleAlert size={16} />}
                  title="โหลดรายวิชาไม่สำเร็จ"
                  description={(coursesError as Error).message || "กรุณาลองใหม่อีกครั้ง"}
                  action={
                    coursesKey && (
                      <Button variant="secondary" size="sm" onPress={() => mutate(coursesKey)}>
                        ลองใหม่
                      </Button>
                    )
                  }
                />
              </div>
            ) : courses === undefined ? (
              <div className="divide-y divide-[var(--hairline)]">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center gap-4 px-5 py-4">
                    <div className="w-10 h-10 rounded-lg bg-surface-secondary animate-pulse shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-1/3 rounded bg-surface-secondary animate-pulse" />
                      <div className="h-3 w-1/4 rounded bg-surface-secondary animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : courses.length === 0 ? (
              <EmptyState
                icon={<BookOpen size={28} />}
                title="ยังไม่มีวิชาในภาคเรียนนี้"
                description="ติดต่อเจ้าหน้าที่เพื่อเพิ่มวิชาที่คุณรับผิดชอบในภาคเรียนนี้"
              />
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {courses.map(c => (
                  <li key={c.id}>
                    <Link
                      href={`/lecturer/courses/${c.id}`}
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
                        </div>
                      </div>
                      <ArrowRight size={16} className="text-muted group-hover:text-accent transition-colors shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {(courses ?? []).length > 0 && (
            <div className="mt-4">
              <a
                href="https://labtas.kku.ac.th"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent transition-colors"
              >
                <Calculator size={14} />
                เปิด LabTAS (ระบบภายนอก)
              </a>
            </div>
          )}

          <OpenCourseModal
            open={openModal}
            onClose={() => setOpenModal(false)}
            termId={defaultTerm}
            termLabel={termDisplay}
          />
        </>
      )}
    </div>
  );
}
