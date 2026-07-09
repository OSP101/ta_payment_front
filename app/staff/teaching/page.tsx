"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { Download, Save, CalendarPlus, Settings, BookPlus } from "lucide-react";
import { toast } from "@heroui/react";
import { api, type Term } from "../../lib/api";
import {
  PageHeader, Panel, Button, Select, TextInput, Chip, EmptyState,
} from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";
import OpenCourseModal from "../../lecturer/(home)/OpenCourseModal";

interface TC {
  id: string; code: string; name_th: string; term_id: string;
  num_students: number;
  num_students_regular: number;
  num_students_special: number;
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
    render: c => c.name_th,
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
        <a href={`/api/v1/exports/course/${c.id}.zip`}>
          <Button variant="ghost" size="sm"><Download size={14} /> ZIP</Button>
        </a>
      </div>
    ),
  },
];

function NumStudentsEditor({
  id, track, value,
}: { id: string; track: "regular" | "special"; value: number }) {
  const [v, setV] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setV(value); }, [value]);
  const dirty = v !== value;
  return (
    <div className="inline-flex items-center gap-2">
      <TextInput
        type="number" className="w-20 text-right"
        value={v} onChange={e => setV(Number(e.target.value))}
      />
      <Button
        variant={dirty ? "primary" : "ghost"} size="sm"
        disabled={!dirty || saving}
        isPending={saving}
        onClick={async () => {
          const body = track === "regular"
            ? { num_students_regular: v }
            : { num_students_special: v };
          setSaving(true);
          try {
            await api.patch(`/teaching-courses/${id}/num-students`, body);
            await mutate((k: string) => k.startsWith("/teaching-courses"));
            toast.success(
              `บันทึกจำนวน นศ. ${track === "regular" ? "ปกติ" : "พิเศษ"} เรียบร้อยแล้ว`,
              { description: `${v} คน` },
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

