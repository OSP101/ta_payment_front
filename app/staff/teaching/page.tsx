"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { Upload, Download, Save, CalendarPlus } from "lucide-react";
import { toast } from "@heroui/react";
import { api, type Term } from "../../lib/api";
import {
  PageHeader, Panel, Button, Select, TextInput, FieldGroup, Modal, Chip, EmptyState,
} from "../../components/ui";

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
  const [importing, setImporting] = useState(false);

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
              <Button variant="primary" disabled={!termId} onClick={() => setImporting(true)}>
                <Upload size={16} /> นำเข้า Excel
              </Button>
            </>
          )
        }
      />

      <Panel padded={false}>
        {noTerms ? (
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
        ) : (courses ?? []).length === 0 ? (
          <EmptyState title="ยังไม่มีวิชาในภาคเรียนนี้" description="เริ่มจากการนำเข้าไฟล์ Excel" />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>รหัสวิชา</th>
                  <th>ชื่อวิชา</th>
                  <th className="num">นศ. ปกติ</th>
                  <th className="num">นศ. พิเศษ</th>
                  <th>งบประมาณ</th>
                  <th className="actions">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {courses!.map(c => (
                  <tr key={c.id}>
                    <td className="font-medium tabular">{c.code}</td>
                    <td>{c.name_th}</td>
                    <td className="num">
                      <NumStudentsEditor id={c.id} track="regular" value={c.num_students_regular} />
                    </td>
                    <td className="num">
                      <NumStudentsEditor id={c.id} track="special" value={c.num_students_special} />
                    </td>
                    <td><BudgetBadge id={c.id} /></td>
                    <td className="actions">
                      <a href={`/api/v1/exports/course/${c.id}.zip`}>
                        <Button variant="ghost" size="sm"><Download size={14} /> ZIP</Button>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ImportModal open={importing && !!termId} termId={termId} onClose={() => setImporting(false)} />
    </div>
  );
}

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

function ImportModal({
  open, termId, onClose,
}: { open: boolean; termId: string; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ row_count: number; error_count: number; errors?: string[] } | null>(null);

  async function submit() {
    if (!file) return;
    setPending(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("term_id", termId);
    try {
      const r = await api.upload<{ row_count: number; error_count: number; errors?: string[] }>(
        "/teaching-courses/import", fd,
      );
      setResult(r);
      mutate((k: string) => k.startsWith("/teaching-courses"));
    } catch (e) { alert((e as Error).message); }
    setPending(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="นำเข้าตารางสอน (.xlsx)" size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>ปิด</Button>
        <Button variant="primary" onClick={submit} disabled={!file || pending}>
          {pending ? "กำลังนำเข้า…" : "นำเข้า"}
        </Button>
      </>}
    >
      <div className="space-y-3">
        <div className="text-sm text-[var(--ink-3)]">
          หัวคอลัมน์: <code className="text-xs bg-slate-100 rounded px-1">code, name, sec_no, track, kind, day, start, end, room</code>
          <div className="mt-1">
            <code className="text-xs">kind</code>: lecture | lab &nbsp;·&nbsp;
            <code className="text-xs">track</code>: regular | special &nbsp;·&nbsp;
            <code className="text-xs">day</code>: 0=อาทิตย์…6=เสาร์
          </div>
        </div>
        <FieldGroup label="ไฟล์ Excel">
          <input type="file" accept=".xlsx"
                 onChange={e => setFile(e.target.files?.[0] ?? null)}
                 className="block w-full text-sm text-[var(--ink-2)] file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[var(--brand-soft)] file:text-[var(--brand)] hover:file:brightness-95" />
        </FieldGroup>
        {result && (
          <div className="text-sm bg-slate-50 border border-[var(--hairline)] rounded-lg p-3">
            <div>อ่านสำเร็จ: <b>{result.row_count}</b> แถว · ผิดพลาด: <b>{result.error_count}</b> แถว</div>
            {result.errors && result.errors.length > 0 && (
              <ul className="mt-2 text-xs text-red-600 max-h-40 overflow-y-auto space-y-0.5">
                {result.errors.map((er, i) => <li key={i}>• {er}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
