"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { Save, CalendarPlus, Settings, BookPlus, CheckCircle2, FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "@heroui/react";
import { api, type Term } from "../../lib/api";
import { notify } from "../../lib/notify";
import {
  PageHeader, Panel, Button, IconButton, Select, TextInput, Chip, EmptyState, ConfirmDialog,
} from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";
import OpenCourseModal from "../../lecturer/(home)/OpenCourseModal";
import ImportModal from "./ImportModal";

interface TC {
  id: string; code: string; name_th: string; term_id: string;
  num_students: number;
  num_students_regular: number;
  num_students_special: number;
  // has_special = the course has ≥1 special-track section (runs a special
  // program). When false, the "นศ. พิเศษ" field is not applicable and is locked.
  has_special: boolean;
  exported_at?: string | null;
}

// needsStudentCount reports whether staff still has to fill in a student count
// for the course: the regular count is always required; the special count is
// required only when the course runs a special program (has_special).
function needsStudentCount(c: TC): boolean {
  return c.num_students_regular === 0 || (c.has_special && c.num_students_special === 0);
}

export default function TeachingPage() {
  const { data: terms } = useSWR<Term[]>("/terms");
  const [termId, setTermId] = useState<string>("");

  useEffect(() => {
    if (!termId && terms && terms.length) setTermId(terms[0].id);
  }, [terms, termId]);

  // Gate: the whole teaching flow depends on at least one academic term existing.
  // `terms === undefined` = still loading; empty array = confirmed none created yet.
  const termsLoaded = terms !== undefined;
  const noTerms = termsLoaded && terms.length === 0;

  const { data: courses } = useSWR<TC[]>(termId ? `/teaching-courses?term_id=${termId}` : null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(false);

  // A course "needs attention" when a required student count is still 0: the
  // regular count always, plus the special count when the course runs a special
  // program. Drives the filter chip + count below.
  const missingCourses = (courses ?? []).filter(needsStudentCount);
  const shownCourses = onlyMissing ? missingCourses : courses;

  const activeTerm = terms?.find(t => t.id === termId);
  const termLabel = activeTerm ? `${activeTerm.academic_year}/${activeTerm.semester}` : "";

  return (
    <div>
      <PageHeader
        title="วิชาที่เปิดสอน"
        description="จัดการรายวิชาที่เปิดสอนในแต่ละภาคการศึกษา"
        actions={
          noTerms ? null : (
            <>
              <Select value={termId} onChange={e => setTermId(e.target.value)} className="max-w-xs">
                {terms?.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.academic_year}/{t.semester}{t.is_active ? " (active)" : ""}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" disabled={!termId} onClick={() => setImporting(true)}>
                <FileSpreadsheet size={16} /> นำเข้า Excel
              </Button>
              <Button variant="primary" disabled={!termId} onClick={() => setCreating(true)}>
                <BookPlus size={16} /> เปิดรายวิชา
              </Button>
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
                  onClick={() => setOnlyMissing(v => !v)}
                >
                  {onlyMissing ? "แสดงทั้งหมด" : "แสดงเฉพาะที่ยังไม่กรอก"}
                </Button>
              </div>
            )}
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
              columns={courseColumns}
            />
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
    </div>
  );
}

const courseColumns: DataColumn<TC>[] = [
  {
    id: "code", label: "รหัสวิชา", sortable: true, isRowHeader: true,
    sortValue: c => c.code,
    className: "font-medium tabular-nums",
    render: c => c.code,
  },
  {
    id: "name", label: "ชื่อวิชา", sortable: true,
    sortValue: c => c.name_th,
    render: c => (
      <span className="inline-flex items-center gap-2">
        {c.name_th}
        {c.exported_at && (
          <Chip tone="success">
            <span className="inline-flex items-center gap-1"><CheckCircle2 size={11} /> ส่งออกแล้ว</span>
          </Chip>
        )}
      </span>
    ),
  },
  {
    id: "students", label: "จำนวนนักศึกษา (ปกติ / พิเศษ)",
    render: c => <StudentCountsEditor course={c} />,
  },
  {
    id: "budget", label: "งบประมาณ",
    render: c => <BudgetBadge id={c.id} />,
  },
  {
    id: "actions", label: <span className="sr-only">การจัดการ</span>,
    className: "text-right",
    render: c => (
      <div className="inline-flex items-center gap-1 whitespace-nowrap">
        {/* Open the lecturer view in a new tab so staff can operate on the
            course on behalf of the lecturer. The lecturer shell shows an admin
            banner when the visitor has admin/staff role. */}
        <Link href={`/lecturer/courses/${c.id}`} target="_blank" rel="noopener noreferrer">
          <IconButton label="จัดการ" variant="ghost" size="sm"><Settings size={14} /></IconButton>
        </Link>
        <DeleteCourseButton course={c} />
      </div>
    ),
  },
];

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
function StudentCountsEditor({ course }: { course: TC }) {
  // Keep raw strings so an empty field isn't silently coerced to 0.
  const [reg, setReg] = useState(String(course.num_students_regular));
  const [spc, setSpc] = useState(String(course.num_students_special));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setReg(String(course.num_students_regular));
    setSpc(String(course.num_students_special));
  }, [course.num_students_regular, course.num_students_special]);

  const hasSpecial = course.has_special;
  const regNum = Number(reg);
  const spcNum = Number(spc);
  const regInvalid = reg.trim() === "" || !Number.isInteger(regNum) || regNum < 0;
  const spcInvalid = hasSpecial && (spc.trim() === "" || !Number.isInteger(spcNum) || spcNum < 0);
  const regDirty = !regInvalid && regNum !== course.num_students_regular;
  const spcDirty = hasSpecial && !spcInvalid && spcNum !== course.num_students_special;
  const dirty = regDirty || spcDirty;
  const invalid = regInvalid || spcInvalid;
  const regNeeds = !regDirty && !regInvalid && course.num_students_regular === 0;
  const spcNeeds = hasSpecial && !spcDirty && !spcInvalid && course.num_students_special === 0;

  async function save() {
    if (invalid || !dirty) return;
    setSaving(true);
    try {
      const body: Record<string, number> = {};
      if (regDirty) body.num_students_regular = regNum;
      if (spcDirty) body.num_students_special = spcNum;
      await api.patch(`/teaching-courses/${course.id}/num-students`, body);
      await mutate((k: string) => typeof k === "string" && k.startsWith("/teaching-courses"));
      toast.success("บันทึกจำนวนนักศึกษาแล้ว", { description: course.code });
    } catch (e) {
      toast.danger("บันทึกไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const field = (
    label: string,
    node: ReactNode,
    hint: string | null,
    hintDanger?: boolean,
  ) => (
    <div className="flex w-16 flex-col items-stretch gap-0.5">
      <span className="text-[10px] leading-none text-ink-3">{label}</span>
      {node}
      <span className={
        "text-[10px] leading-none text-center truncate " +
        (hintDanger ? "text-danger" : "text-amber-600 dark:text-amber-400")
      }>
        {hint ?? " "}
      </span>
    </div>
  );

  return (
    <div className="inline-flex items-start gap-2">
      {field("ปกติ",
        <TextInput
          type="number" min={0} step={1} className="w-full text-right"
          aria-invalid={regInvalid || undefined}
          value={reg} onChange={e => setReg(e.target.value)}
        />,
        regInvalid ? "ต้อง ≥ 0" : regNeeds ? "ยังไม่กรอก" : null,
        regInvalid,
      )}
      {field("พิเศษ",
        hasSpecial ? (
          <TextInput
            type="number" min={0} step={1} className="w-full text-right"
            aria-invalid={spcInvalid || undefined}
            value={spc} onChange={e => setSpc(e.target.value)}
          />
        ) : (
          <div
            className="w-full rounded-lg border border-hairline bg-slate-50/70 dark:bg-slate-900/30 px-2 py-2 text-center text-ink-3 select-none"
            title="วิชานี้ไม่มีโครงการพิเศษ (ระบบตรวจจากกลุ่มเรียนตอนเปิดวิชา)"
          >—</div>
        ),
        hasSpecial ? (spcInvalid ? "ต้อง ≥ 0" : spcNeeds ? "ยังไม่กรอก" : null) : "ไม่มีพิเศษ",
        hasSpecial && spcInvalid,
      )}
      {/* single save button for the row; transparent label keeps it aligned with the inputs */}
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-[10px] leading-none select-none">{" "}</span>
        <Button
          variant={dirty ? "primary" : "ghost"} size="sm"
          disabled={!dirty || invalid || saving}
          isPending={saving}
          onClick={save}
        >
          <Save size={13} />บันทึก
        </Button>
      </div>
    </div>
  );
}

interface Budget {
  per_course_max: number; used_baht: number; remaining_baht: number;
  over_budget: boolean;
}
function BudgetBadge({ id }: { id: string }) {
  const { data } = useSWR<Budget>(`/teaching-courses/${id}/budget`);
  if (!data) return <span className="text-[var(--ink-4)] text-xs">…</span>;
  const tone = data.over_budget ? "danger" : data.remaining_baht < data.per_course_max * 0.1 ? "warn" : "success";
  return (
    <Chip tone={tone}>
      {data.used_baht.toFixed(0)}/{data.per_course_max.toFixed(0)} บ.
    </Chip>
  );
}

