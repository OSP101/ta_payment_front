"use client";
import { useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import { Save, CheckCircle2 } from "lucide-react";
import { api, type Term } from "../../lib/api";
import ScheduleGrid, { type Block } from "../../components/ScheduleGrid";
import { PageHeader, Panel, Select } from "../../components/ui";
import { LockedActionButton, useTAApproval } from "../TAGate";

export default function TASchedulePage() {
  const { approved } = useTAApproval();
  const { data: terms } = useSWR<Term[]>("/terms");
  const [termId, setTermId] = useState<string>("");
  useEffect(() => {
    if (!termId && terms && terms.length) {
      setTermId(terms.find(t => t.is_active)?.id ?? terms[0].id);
    }
  }, [terms, termId]);

  const { data: blocks } = useSWR<Block[]>(termId ? `/me/schedule?term_id=${termId}` : null);
  const [local, setLocal] = useState<Block[]>([]);
  useEffect(() => { setLocal(blocks ?? []); }, [blocks]);

  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!termId) return;
    setSaving(true);
    try {
      await api.put(`/me/schedule?term_id=${termId}`, local);
      setMsg("บันทึกตารางเรียนเรียบร้อย");
      mutate((k: string) => k.startsWith("/me/schedule"));
      setTimeout(() => setMsg(null), 2000);
    } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader
        title="ตารางเรียนของฉัน"
        description="ลากช่วงเวลาบนตารางเพื่อสร้างคาบเรียน · คลิกเพื่อลบ"
        actions={
          <>
            <Select value={termId} onChange={e => setTermId(e.target.value)} className="max-w-xs">
              {terms?.map(t => (<option key={t.id} value={t.id}>{t.academic_year}/{t.semester}</option>))}
            </Select>
            <LockedActionButton variant="primary" onClick={save} disabled={saving}>
              <Save size={14} /> {saving ? "กำลังบันทึก…" : "บันทึก"}
            </LockedActionButton>
          </>
        }
      />

      {msg && (
        <div className="mb-3 inline-flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
          <CheckCircle2 size={14} /> {msg}
        </div>
      )}
      {!approved && (
        <div className="mb-3 text-xs text-muted">
          * ปุ่มบันทึกจะปลดล็อกหลังเจ้าหน้าที่อนุมัติเอกสารในโปรไฟล์
        </div>
      )}

      <ScheduleGrid blocks={local} onChange={setLocal} termId={termId} />

      <Panel title="กรณีพิเศษ" className="mt-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={local.some(b => b.is_wba)}
            onChange={e => setLocal(l => e.target.checked
              ? [{
                  id: "wba-" + Date.now(),
                  term_id: termId,
                  course_label: "WBA / ปี 4",
                  day_of_week: 0,
                  start_time: "00:00", end_time: "00:00",
                  note: "ไม่มีตารางเรียนปกติ",
                  is_wba: true,
                }, ...l]
              : l.filter(b => !b.is_wba))}
          />
          <span>ฉันเป็นนักศึกษาปี 4 / WBA (ไม่มีตารางเรียนปกติ)</span>
        </label>
      </Panel>
    </div>
  );
}
