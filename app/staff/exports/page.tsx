"use client";
import { useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import { Download, Package, Lock, CheckCircle2 } from "lucide-react";
import { type Term } from "../../lib/api";
import { PageHeader, Panel, Button, Select, EmptyState, Chip, ConfirmDialog } from "../../components/ui";

interface TC { id: string; code: string; name_th: string; num_students: number; exported_at?: string | null; }

export default function ExportsPage() {
  const { data: terms } = useSWR<Term[]>("/terms");
  const [termId, setTermId] = useState<string>("");
  useEffect(() => { if (!termId && terms && terms.length) setTermId(terms[0].id); }, [terms, termId]);

  const coursesKey = termId ? `/teaching-courses?term_id=${termId}` : null;
  const { data: courses } = useSWR<TC[]>(coursesKey);

  // Course pending export confirmation. The ZIP export permanently locks the
  // course from further edits, so we gate the download behind a warning.
  const [confirmTarget, setConfirmTarget] = useState<TC | null>(null);
  const [downloading, setDownloading] = useState(false);

  function startExport() {
    if (!confirmTarget) return;
    setDownloading(true);
    // Trigger the file download without navigating away.
    window.location.href = `/api/v1/exports/course/${confirmTarget.id}.zip`;
    // Give the browser a moment to start the download, then refresh the list so
    // the "ส่งออกแล้ว" (locked) badge appears.
    setTimeout(() => {
      if (coursesKey) mutate(coursesKey);
      setDownloading(false);
      setConfirmTarget(null);
    }, 1200);
  }

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
            {courses.map(c => {
              const exported = !!c.exported_at;
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[var(--brand-soft)] text-[var(--brand)] flex items-center justify-center shrink-0">
                      <Package size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-medium truncate">{c.code} — {c.name_th}</div>
                        {exported && (
                          <Chip tone="success">
                            <span className="inline-flex items-center gap-1"><CheckCircle2 size={11} /> ส่งออกแล้ว</span>
                          </Chip>
                        )}
                      </div>
                      <div className="text-xs text-[var(--ink-3)] mt-0.5">นักศึกษา: {c.num_students} คน</div>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setConfirmTarget(c)}>
                    {exported ? <Download size={14} /> : <Lock size={14} />} ดาวน์โหลด ZIP
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <p className="text-xs text-[var(--ink-3)]">
        แต่ละไฟล์ .xlsx ในซิปมี 3 sheet: หน้าปะ / บันทึกเวลา / ตารางสอน+งาน สรุปข้อมูลของ TA แต่ละคนในวิชานั้น
      </p>

      <ConfirmDialog
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onConfirm={startExport}
        isPending={downloading}
        danger={!confirmTarget?.exported_at}
        icon={<Lock size={20} />}
        title="ยืนยันการส่งออก ZIP"
        confirmLabel="ส่งออกและดาวน์โหลด"
        message={
          confirmTarget?.exported_at ? (
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
    </div>
  );
}
