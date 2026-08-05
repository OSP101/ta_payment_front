"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { Save, CalendarPlus, CalendarOff, Settings, BookPlus, CheckCircle2, FileSpreadsheet, Trash2, Pencil, Users } from "lucide-react";
import { toast } from "@heroui/react";
import { api } from "../../lib/api";
import { useTerm, useTermKey } from "../TermContext";
import { notify } from "../../lib/notify";
import {
  PageHeader, Panel, Button, IconButton, TextInput, Chip, EmptyState, ConfirmDialog, Modal, FieldGroup,
} from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";
import OpenCourseModal from "./OpenCourseModal";
import ImportModal from "./ImportModal";

interface TC {
  id: string; code: string; name_th: string; term_id: string;
  credits: number; lecture_hrs: number; lab_hrs: number; self_hrs: number;
  num_students: number;
  num_students_regular: number;
  num_students_special: number;
  // has_special = the course has ≥1 special-track section (runs a special
  // program). When false, the "นศ. พิเศษ" field is not applicable and is locked.
  has_special: boolean;
  // has_missing_schedule = ≥1 section has no class timetable (registrar "WBA").
  // Such a course cannot accept a TA request until the schedule is filled in.
  has_missing_schedule: boolean;
  num_sections_regular: number;
  num_sections_special: number;
  lecturer_names?: string;
  exported_at?: string | null;
}

// needsStudentCount reports whether staff still has to fill in a student count
// for the course: the regular count is always required; the special count is
// required only when the course runs a special program (has_special).
function needsStudentCount(c: TC): boolean {
  return c.num_students_regular === 0 || (c.has_special && c.num_students_special === 0);
}

export default function TeachingPage() {
  // Term comes from the shell's switcher — see TermContext. This page used to
  // default to terms[0] ("the newest term that exists"), which is not the same
  // thing as the active term the dashboard showed.
  const { terms, termId, term, loaded } = useTerm();

  // Gate: the whole teaching flow depends on at least one academic term existing.
  // `loaded` distinguishes "still loading" from "confirmed none created yet".
  const noTerms = loaded && (terms?.length ?? 0) === 0;

  const { data: courses } = useSWR<TC[]>(useTermKey("/teaching-courses"));
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [onlyWba, setOnlyWba] = useState(false);
  // Course whose student counts are being edited in the modal (null = closed).
  const [editStudents, setEditStudents] = useState<TC | null>(null);

  // A course "needs attention" when a required student count is still 0: the
  // regular count always, plus the special count when the course runs a special
  // program. Drives the filter chip + count below.
  const missingCourses = (courses ?? []).filter(needsStudentCount);
  // WBA courses: the registrar file carried no timetable — the lecturer/staff
  // must fill it in before the course can accept a TA request.
  const wbaCourses = (courses ?? []).filter(c => c.has_missing_schedule);
  const shownCourses = onlyMissing ? missingCourses : onlyWba ? wbaCourses : courses;

  const termLabel = term ? `${term.academic_year}/${term.semester}` : "";

  return (
    <div>
      <PageHeader
        title="วิชาที่เปิดสอน"
        description="จัดการรายวิชาที่เปิดสอนในแต่ละภาคการศึกษา"
        actions={
          noTerms ? null : (
            <>
              <span data-tour="teaching-import">
                <Button variant="secondary" disabled={!termId} onClick={() => setImporting(true)}>
                  <FileSpreadsheet size={16} /> นำเข้า Excel
                </Button>
              </span>
              <span data-tour="teaching-open">
                <Button variant="primary" disabled={!termId} onClick={() => setCreating(true)}>
                  <BookPlus size={16} /> เปิดรายวิชา
                </Button>
              </span>
            </>
          )
        }
      />

      {noTerms ? (
        <Panel padded={false}>
          <EmptyState
            icon={<CalendarPlus size={28} />}
            title="ยังไม่ได้สร้างปีการศึกษา / ภาคเรียน"
            description="ก่อนกำหนดวิชาที่เปิดสอน ต้องสร้างปีการศึกษาและภาคเรียนอย่างน้อย 1 รายการก่อน จึงจะเลือกได้ว่าวิชาที่เปิดสอนอยู่ในปีไหน ภาคไหน"
            action={
              <Link href="/staff/settings?tab=terms">
                <Button variant="primary">
                  <CalendarPlus size={16} /> สร้างปีการศึกษา / ภาคเรียน
                </Button>
              </Link>
            }
          />
        </Panel>
      ) : (
        <Panel padded={false}>
          <div className="p-4">
            {/* Missing-count reminder: staff often forget to fill the enrolled
                student count (the budget depends on it, and export is blocked
                without it). One click filters the list down to the offenders. */}
            {missingCourses.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-2 text-sm">
                <span className="text-amber-800 dark:text-amber-200">
                  มี <b>{missingCourses.length}</b> วิชาที่ยังไม่ได้กรอกจำนวนนักศึกษา — ต้องกรอกก่อนจึงจะส่งออกได้
                </span>
                <Button
                  variant={onlyMissing ? "primary" : "secondary"}
                  size="sm"
                  className="ms-auto"
                  onClick={() => { setOnlyMissing(v => !v); setOnlyWba(false); }}
                >
                  {onlyMissing ? "แสดงทั้งหมด" : "แสดงเฉพาะที่ยังไม่กรอก"}
                </Button>
              </div>
            )}
            {/* WBA reminder: the registrar file had no timetable for these
                courses — the lecturer (or staff on their behalf) must fill the
                section schedules in, otherwise TA requests are blocked. */}
            {wbaCourses.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-300 bg-red-50/60 dark:border-red-800 dark:bg-red-950/30 px-3 py-2 text-sm">
                <span className="text-red-800 dark:text-red-200">
                  มี <b>{wbaCourses.length}</b> วิชาที่ยังไม่ระบุเวลาเรียน (WBA) — อาจารย์หรือเจ้าหน้าที่ต้องกรอกตารางเรียนก่อน จึงจะส่งคำขอ TA ได้
                </span>
                <Button
                  variant={onlyWba ? "primary" : "secondary"}
                  size="sm"
                  className="ms-auto"
                  onClick={() => { setOnlyWba(v => !v); setOnlyMissing(false); }}
                >
                  {onlyWba ? "แสดงทั้งหมด" : "แสดงเฉพาะที่ยังไม่มีตาราง"}
                </Button>
              </div>
            )}
            <div data-tour="teaching-table">
            <DataTable
              ariaLabel="วิชาที่เปิดสอน"
              rows={shownCourses}
              loading={!!termId && !courses}
              rowKey={c => c.id}
              searchFn={c => `${c.code} ${c.name_th}`}
              searchPlaceholder="ค้นหารหัสวิชา / ชื่อวิชา…"
              initialSort={{ column: "code", direction: "ascending" }}
              pageSize={10}
              emptyTitle="ยังไม่มีวิชาในภาคเรียนนี้"
              emptyDescription="กดปุ่ม “เปิดรายวิชา” เพื่อสร้างวิชาใหม่"
              // 8 คอลัมน์ — ถ้าไม่กันความกว้างขั้นต่ำไว้ ชื่อวิชาจะถูกบีบจนตัดเป็น
              // 3 บรรทัด อ่านยาก สู้ให้เลื่อนตารางแนวนอนแทน
              minWidth="1080px"
              columns={makeCourseColumns(setEditStudents)}
            />
            </div>
          </div>
        </Panel>
      )}

      <OpenCourseModal
        open={creating && !!termId}
        onClose={() => setCreating(false)}
        termId={termId}
        termLabel={termLabel}
        redirectBase="/staff/teaching"
        pickLecturers
      />

      <ImportModal
        open={importing}
        onClose={() => setImporting(false)}
        termId={termId}
        termLabel={termLabel}
      />

      <StudentCountsModal course={editStudents} onClose={() => setEditStudents(null)} />
    </div>
  );
}

// Column factory — the students column needs the page's "open edit modal"
// callback, so the columns are built per render instead of as a module const.
function makeCourseColumns(onEditStudents: (c: TC) => void): DataColumn<TC>[] {
  return [
    {
      id: "code", label: "รหัสวิชา", sortable: true, isRowHeader: true,
      sortValue: c => c.code,
      className: "font-medium tabular-nums whitespace-nowrap",
      render: c => c.code,
    },
    {
      id: "name", label: "ชื่อวิชา", sortable: true,
      sortValue: c => c.name_th,
      // ชื่อวิชาเป็นคอลัมน์ยืดหยุ่นตัวเดียว ถ้าปล่อยให้ตัดบรรทัดจะโดนบีบเหลือ
      // 3-4 บรรทัดจนอ่านยาก — ให้เลื่อนตารางแนวนอนแทนการตัดคำ
      className: "whitespace-nowrap",
      render: c => (
        <span className="inline-flex items-center gap-2">
          {c.name_th}
          {c.exported_at && (
            <Chip tone="success">
              <span className="inline-flex items-center gap-1"><CheckCircle2 size={11} /> ส่งออกแล้ว</span>
            </Chip>
          )}
          {c.has_missing_schedule && (
            <Chip tone="warn">
              <span className="inline-flex items-center gap-1"><CalendarOff size={11} /> ยังไม่ระบุเวลาเรียน</span>
            </Chip>
          )}
        </span>
      ),
    },
    {
      id: "credits", label: "หน่วยกิต", sortable: true,
      sortValue: c => c.credits,
      className: "tabular-nums whitespace-nowrap",
      render: c => `${c.credits} (${c.lecture_hrs}-${c.lab_hrs}-${c.self_hrs})`,
    },
    {
      id: "lecturers", label: "อาจารย์ผู้สอน",
      render: c => c.lecturer_names ? (
        <span className="block max-w-[180px] truncate" title={c.lecturer_names}>
          {c.lecturer_names}
        </span>
      ) : (
        <span className="text-warning text-xs">ยังไม่ผูกอาจารย์</span>
      ),
    },
    {
      id: "sections", label: "Sec (ปกติ / พิเศษ)",
      className: "tabular-nums whitespace-nowrap",
      // แสดง "x / y" เสมอ แม้ฝั่งใดเป็น 0 — ทุกแถวอ่านด้วยรูปแบบเดียวกัน
      render: c => (
        <span title={`ภาคปกติ ${c.num_sections_regular} sec · ภาคพิเศษ ${c.num_sections_special} sec`}>
          {c.num_sections_regular} / {c.num_sections_special}
        </span>
      ),
    },
    {
      id: "students", label: "นักศึกษา (ปกติ / พิเศษ)",
      render: c => {
        const missing = needsStudentCount(c);
        return (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Users size={13} className="text-muted shrink-0" />
            <span className="tabular-nums" title={`ภาคปกติ ${c.num_students_regular} คน · ภาคพิเศษ ${c.num_students_special} คน`}>
              {c.num_students_regular} / {c.num_students_special}
            </span>
            {missing && <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">ยังไม่กรอก</span>}
            <IconButton
              label={`แก้ไขจำนวนนักศึกษา ${c.code}`}
              variant="ghost" size="sm"
              onClick={() => onEditStudents(c)}
            >
              <Pencil size={13} />
            </IconButton>
          </span>
        );
      },
    },
    {
      id: "budget", label: "งบประมาณ (ใช้ไป / ทั้งหมด)",
      render: c => <BudgetBadge id={c.id} />,
    },
    {
      id: "actions", label: <span className="sr-only">การจัดการ</span>,
      className: "text-right",
      render: c => (
        <div className="inline-flex items-center gap-1 whitespace-nowrap">
          {/* Open the lecturer view in a new tab so staff can operate on the
              course on behalf of the lecturer without losing their place in
              this list. The lecturer shell shows an admin banner when the
              visitor has admin/staff role.

              The button IS the anchor (render), not a button inside one: nested
              in a <Link> the press handler ate the click and target="_blank"
              never applied — it navigated in place. As a real anchor,
              middle-click and "open in new tab" work too. */}
          <IconButton
            label="จัดการ (แท็บใหม่)"
            variant="ghost"
            size="sm"
            render={props => (
              <a
                // The render props are typed for the <button> this normally is;
                // only the ref type actually differs, and at runtime it just
                // holds whichever DOM node we rendered.
                {...(props as unknown as React.ComponentProps<"a">)}
                href={`/lecturer/courses/${c.id}`}
                target="_blank"
                rel="noopener noreferrer"
              />
            )}
          >
            <Settings size={14} />
          </IconButton>
          <DeleteCourseButton course={c} />
        </div>
      ),
    },
  ];
}

// DeleteCourseButton removes a mistakenly-opened course straight from the list.
// The server refuses (with a clear reason) if the course has any TA / worklog /
// export data, so no data is ever lost.
function DeleteCourseButton({ course }: { course: TC }) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function del() {
    setDeleting(true);
    try {
      await api.del(`/teaching-courses/${course.id}`);
      await mutate((k: string) => typeof k === "string" && k.startsWith("/teaching-courses"));
      toast.success("ลบรายวิชาแล้ว", { description: `${course.code} — ${course.name_th}` });
      setConfirm(false);
    } catch (e) {
      notify.error(e); // backend returns a clear Thai reason when it has data
      setConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <IconButton
        label={`ลบรายวิชา ${course.code}`}
        variant="ghost"
        size="sm"
        className="text-danger hover:bg-danger/10"
        onClick={() => setConfirm(true)}
        disabled={deleting}
      >
        <Trash2 size={14} />
      </IconButton>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={del}
        isPending={deleting}
        danger
        icon={<Trash2 size={20} />}
        title="ยืนยันการลบรายวิชา"
        confirmLabel="ลบรายวิชา"
        message={
          <p className="text-sm text-muted">
            จะลบรายวิชา <b>{course.code} — {course.name_th}</b> พร้อม section และตารางเวลาทั้งหมด
            การกระทำนี้ย้อนกลับไม่ได้ (ระบบจะไม่ลบให้หากวิชานี้มี TA / บันทึกเวลา หรือถูกส่งออกแล้ว)
          </p>
        }
      />
    </>
  );
}

// StudentCountsEditor edits a course's regular + special student counts in one
// place with a SINGLE save button (sends only the changed field(s)). The special
// input is locked when the course has no special program.
// StudentCountsModal — edit a course's enrolment in a dialog instead of inline
// inputs; the table row only displays the numbers plus a pencil button.
function StudentCountsModal({ course, onClose }: { course: TC | null; onClose: () => void }) {
  // Keep raw strings so an empty field isn't silently coerced to 0.
  const [reg, setReg] = useState("");
  const [spc, setSpc] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (course) {
      setReg(String(course.num_students_regular));
      setSpc(String(course.num_students_special));
    }
  }, [course]);

  const hasSpecial = !!course?.has_special;
  const regNum = Number(reg);
  const spcNum = Number(spc);
  const regInvalid = reg.trim() === "" || !Number.isInteger(regNum) || regNum < 0;
  const spcInvalid = hasSpecial && (spc.trim() === "" || !Number.isInteger(spcNum) || spcNum < 0);
  const regDirty = !!course && !regInvalid && regNum !== course.num_students_regular;
  const spcDirty = !!course && hasSpecial && !spcInvalid && spcNum !== course.num_students_special;
  const dirty = regDirty || spcDirty;
  const invalid = regInvalid || spcInvalid;

  async function save() {
    if (!course || invalid || !dirty) return;
    setSaving(true);
    try {
      const body: Record<string, number> = {};
      if (regDirty) body.num_students_regular = regNum;
      if (spcDirty) body.num_students_special = spcNum;
      await api.patch(`/teaching-courses/${course.id}/num-students`, body);
      await mutate((k: string) => typeof k === "string" && k.startsWith("/teaching-courses"));
      toast.success("บันทึกจำนวนนักศึกษาแล้ว", { description: course.code });
      onClose();
    } catch (e) {
      toast.danger("บันทึกไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!course}
      onClose={() => { if (!saving) onClose(); }}
      size="sm"
      icon={<Users size={18} />}
      title={course ? `แก้ไขจำนวนนักศึกษา · ${course.code}` : ""}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" onClick={save} disabled={!dirty || invalid || saving} isPending={saving}>
            <Save size={14} />บันทึก
          </Button>
        </>
      }
    >
      {course && (
        <div className="space-y-3">
          <div className="text-xs text-muted">{course.name_th}</div>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup
              label="ภาคปกติ"
              error={regInvalid ? "ต้องเป็นจำนวนเต็ม ≥ 0" : undefined}
            >
              <TextInput
                type="number" min={0} step={1}
                aria-invalid={regInvalid || undefined}
                value={reg} onChange={e => setReg(e.target.value)}
                className="text-right tabular"
              />
            </FieldGroup>
            <FieldGroup
              label="ภาคพิเศษ"
              hint={hasSpecial ? undefined : "วิชานี้ไม่มีโครงการพิเศษ"}
              error={spcInvalid ? "ต้องเป็นจำนวนเต็ม ≥ 0" : undefined}
            >
              {hasSpecial ? (
                <TextInput
                  type="number" min={0} step={1}
                  aria-invalid={spcInvalid || undefined}
                  value={spc} onChange={e => setSpc(e.target.value)}
                  className="text-right tabular"
                />
              ) : (
                <div className="h-9 rounded-lg border border-border bg-surface-secondary px-3 flex items-center justify-center text-muted select-none">
                  —
                </div>
              )}
            </FieldGroup>
          </div>
          <div className="text-xs text-muted">
            จำนวนนักศึกษาใช้คำนวณงบประมาณโดยประมาณของวิชา — ต้องกรอกก่อนจึงจะส่งออกเอกสารได้
          </div>
        </div>
      )}
    </Modal>
  );
}

interface Budget {
  per_course_max: number; used_baht: number; remaining_baht: number;
  over_budget: boolean;
  term_pay_regular: number; term_pay_special: number;
}
// BudgetBadge — used/ceiling chip plus the ceiling split by track (ปกติ/พิเศษ),
// so staff can see how the course budget divides across the two pools.
function BudgetBadge({ id }: { id: string }) {
  const { data } = useSWR<Budget>(`/teaching-courses/${id}/budget`);
  if (!data) return <span className="text-[var(--ink-4)] text-xs">…</span>;
  const tone = data.over_budget ? "danger" : data.remaining_baht < data.per_course_max * 0.1 ? "warn" : "success";
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return (
    <div className="flex flex-col items-start gap-1 whitespace-nowrap">
      <Chip tone={tone}>
        {fmt(data.used_baht)}/{fmt(data.per_course_max)} บ.
      </Chip>
      {/* บรรทัดล่าง = แบ่งเพดานงบตามภาค (รวมกันได้เท่ากับตัวหลังของ chip) */}
      <span className="text-[11px] text-muted tabular-nums">
        ปกติ {fmt(data.term_pay_regular)} · พิเศษ {fmt(data.term_pay_special)} บ.
      </span>
    </div>
  );
}

