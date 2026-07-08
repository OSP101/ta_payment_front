"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Download, Package } from "lucide-react";
import { api, type Term } from "../../lib/api";
import { PageHeader, Panel, Button, Select, EmptyState } from "../../components/ui";

interface TC { id: string; code: string; name_th: string; num_students: number; }

export default function ExportsPage() {
  const { data: terms } = useSWR<Term[]>("/terms");
  const [termId, setTermId] = useState<string>("");
  useEffect(() => { if (!termId && terms && terms.length) setTermId(terms[0].id); }, [terms, termId]);

  const { data: courses } = useSWR<TC[]>(termId ? `/teaching-courses?term_id=${termId}` : null);

  return (
    <div>
      <PageHeader
        title="ส่งออกเอกสาร"
        description="สร้าง ZIP รวมเอกสารเบิกจ่ายทั้งวิชา"
        actions={
          <Select value={termId} onChange={e => setTermId(e.target.value)} className="max-w-xs">
            {terms?.map(t => (<option key={t.id} value={t.id}>{t.academic_year}/{t.semester}</option>))}
          </Select>
        }
      />

      <Panel padded={false} className="mb-3">
        {(!courses || courses.length === 0) ? (
          <EmptyState title="ไม่มีวิชาในภาคเรียนนี้" />
        ) : (
          <ul className="divide-y divide-[var(--hairline)]">
            {courses.map(c => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[var(--brand-soft)] text-[var(--brand)] flex items-center justify-center shrink-0">
                    <Package size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.code} — {c.name_th}</div>
                    <div className="text-xs text-[var(--ink-3)] mt-0.5">นักศึกษา: {c.num_students} คน</div>
                  </div>
                </div>
                <a href={`/api/v1/exports/course/${c.id}.zip`}>
                  <Button variant="secondary" size="sm"><Download size={14} /> ดาวน์โหลด ZIP</Button>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-xs text-[var(--ink-3)]">
        แต่ละไฟล์ .xlsx ในซิปมี 3 sheet: หน้าปะ / บันทึกเวลา / ตารางสอน+งาน สรุปข้อมูลของ TA แต่ละคนในวิชานั้น
      </p>
    </div>
  );
}
