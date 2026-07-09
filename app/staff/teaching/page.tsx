"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { Download, Save, CalendarPlus, Settings, BookPlus, Lock, CheckCircle2 } from "lucide-react";
import { toast } from "@heroui/react";
import { api, type Term } from "../../lib/api";
import { notify } from "../../lib/notify";
import {
  PageHeader, Panel, Button, Select, TextInput, Chip, EmptyState, ConfirmDialog,
} from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";
import OpenCourseModal from "../../lecturer/(home)/OpenCourseModal";

interface TC {
  id: string; code: string; name_th: string; term_id: string;
  num_students: number;
  num_students_regular: number;
  num_students_special: number;
  exported_at?: string | null;
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
            <DataTable
              ariaLabel="วิชาที่เปิดสอน"
              rows={courses}
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
    id: "regular", label: "นศ. ปกติ",
    render: c => <NumStudentsEditor id={c.id} track="regular" value={c.num_students_regular} />,
  },
  {
    id: "special", label: "นศ. พิเศษ",
    render: c => <NumStudentsEditor id={c.id} track="special" value={c.num_students_special} />,
  },
  {
    id: "budget", label: "งบประมาณ",
    render: c => <BudgetBadge id={c.id} />,
  },
  {
    id: "actions", label: <span className="sr-only">การจัดการ</span>,
    className: "text-right",
    render: c => (
      <div className="inline-flex gap-1">
        <Link href={`/staff/teaching/${c.id}`}>
          <Button variant="ghost" size="sm"><Settings size={14} /> จัดการ</Button>
        </Link>
        <ZipExportButton course={c} />
      </div>
    ),
  },
];

// ZIP export permanently locks the course from editing sections/schedules, so
// gate the download behind a confirmation dialog explaining that.
function ZipExportButton({ course }: { course: TC }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const exported = !!course.exported_at;

  function startExport() {
    setDownloading(true);
    try {
      window.location.href = `/api/v1/exports/course/${course.id}.zip`;
    } catch (e) {
      notify.error(e);
    }
    setTimeout(() => {
      mutate((k: string) => k.startsWith("/teaching-courses"));
      setDownloading(false);
      setOpen(false);
    }, 1200);
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {exported ? <Download size={14} /> : <Lock size={14} />} ZIP
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={startExport}
        isPending={downloading}
        danger={!exported}
        icon={<Lock size={20} />}
        title="ยืนยันการส่งออก ZIP"
        confirmLabel="ส่งออกและดาวน์โหลด"
        message={
          exported ? (
            <p className="text-sm text-muted">
              รายวิชานี้ถูกส่งออก (ล็อก) ไปแล้ว — ดาวน์โหลดซ้ำได้โดยไม่มีผลกระทบเพิ่มเติม
            </p>
          ) : (
            <p className="text-sm text-muted">
              การส่งออกจะล็อกรายวิชานี้ ไม่สามารถแก้ไข section/ตารางได้อีก การกระทำนี้ย้อนกลับไม่ได้
            </p>
          )
        }
      />
    </>
  );
}

function NumStudentsEditor({
  id, track, value,
}: { id: string; track: "regular" | "special"; value: number }) {
  // Keep the raw string so an empty field isn't silently coerced to 0.
  const [v, setV] = useState(String(value));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setV(String(value)); }, [value]);

  const num = Number(v);
  const invalid = v.trim() === "" || !Number.isInteger(num) || num < 0;
  const dirty = !invalid && num !== value;

  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <div className="inline-flex items-center gap-2">
        <TextInput
          type="number" min={0} step={1} className="w-20 text-right"
          aria-invalid={invalid || undefined}
          value={v} onChange={e => setV(e.target.value)}
        />
        <Button
          variant={dirty ? "primary" : "ghost"} size="sm"
          disabled={!dirty || invalid || saving}
          isPending={saving}
          onClick={async () => {
            if (invalid) return;
            const body = track === "regular"
              ? { num_students_regular: num }
              : { num_students_special: num };
            setSaving(true);
            try {
              await api.patch(`/teaching-courses/${id}/num-students`, body);
              await mutate((k: string) => k.startsWith("/teaching-courses"));
              toast.success(
                `บันทึกจำนวน นศ. ${track === "regular" ? "ปกติ" : "พิเศษ"} เรียบร้อยแล้ว`,
                { description: `${num} คน` },
              );
            } catch (e) {
              toast.danger("บันทึกไม่สำเร็จ", { description: (e as Error).message });
            } finally {
              setSaving(false);
            }
          }}
        >
          <Save size={13} />บันทึก
        </Button>
      </div>
      {invalid && (
        <span className="text-[11px] text-danger">ต้องเป็นจำนวนเต็ม ≥ 0</span>
      )}
    </div>
  );
}

interface Budget {
  per_course_max: number; used_baht: number; remaining_baht: number;
  over_budget: boolean; hours_cap: number;
}
function BudgetBadge({ id }: { id: string }) {
  const { data } = useSWR<Budget>(`/teaching-courses/${id}/budget`);
  if (!data) return <span className="text-[var(--ink-4)] text-xs">…</span>;
  const tone = data.over_budget ? "danger" : data.remaining_baht < data.per_course_max * 0.1 ? "warn" : "success";
  return (
    <Chip tone={tone}>
      {data.used_baht.toFixed(0)}/{data.per_course_max.toFixed(0)} บ. · {data.hours_cap} ชม.
    </Chip>
  );
}

