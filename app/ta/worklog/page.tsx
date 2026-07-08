"use client";
import { useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import { Wand2, Send, Save } from "lucide-react";
import { api } from "../../lib/api";
import {
  PageHeader, Panel, Select, TextInput, StatusChip, EmptyState,
} from "../../components/ui";
import { LockedActionButton, useTAApproval } from "../TAGate";

interface Assignment { id: string; course_code: string; course_name: string; }
interface WorkLog {
  id: string; assignment_id: string;
  work_date: string; start_time: string; end_time: string;
  hours: number; activity: string; room?: string; note?: string; status: string;
}

export default function WorklogPage() {
  const { approved } = useTAApproval();
  const { data: assignments } = useSWR<Assignment[]>(
    "/me/assignments",
    (p: string) => api.get<Assignment[]>(p).catch(() => [] as Assignment[]),
  );
  const [aid, setAid] = useState<string>("");
  useEffect(() => { if (!aid && assignments && assignments[0]) setAid(assignments[0].id); }, [assignments, aid]);

  const { data: logs } = useSWR<WorkLog[]>(aid ? `/assignments/${aid}/worklog` : null);

  async function generate() {
    if (!aid) return;
    if (!confirm("สร้างตารางบันทึกเวลาอัตโนมัติจากตารางสอน? การกระทำนี้จะเขียนทับ draft ที่มีอยู่")) return;
    await api.post(`/assignments/${aid}/worklog/generate`);
    mutate((k: string) => k.startsWith(`/assignments/${aid}/worklog`));
  }

  async function submit() {
    if (!aid) return;
    await api.post(`/assignments/${aid}/worklog/submit`);
    mutate((k: string) => k.startsWith(`/assignments/${aid}/worklog`));
    alert("ส่งให้อาจารย์อนุมัติแล้ว");
  }

  return (
    <div>
      <PageHeader
        title="บันทึกเวลาปฏิบัติงาน"
        description="บันทึกชั่วโมงการทำงาน แล้วส่งอาจารย์อนุมัติ"
        actions={
          <>
            <Select value={aid} onChange={e => setAid(e.target.value)} className="max-w-md">
              {assignments?.map(a => (
                <option key={a.id} value={a.id}>{a.course_code} — {a.course_name}</option>
              ))}
            </Select>
            <LockedActionButton variant="secondary" onClick={generate}>
              <Wand2 size={14} /> สร้างอัตโนมัติ
            </LockedActionButton>
            <LockedActionButton variant="primary" onClick={submit}>
              <Send size={14} /> ส่งอนุมัติ
            </LockedActionButton>
          </>
        }
      />

      {!approved && (
        <div className="mb-3 text-xs text-muted">
          * ปุ่มบันทึก/ส่งจะปลดล็อกหลังเจ้าหน้าที่อนุมัติเอกสารในโปรไฟล์
        </div>
      )}

      <Panel padded={false}>
        {(!logs || logs.length === 0) ? (
          <EmptyState
            title="ยังไม่มีบันทึก"
            description={`กด "สร้างอัตโนมัติ" เพื่อสร้างจากตารางสอน`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>เริ่ม</th>
                  <th>สิ้นสุด</th>
                  <th className="num">ชม.</th>
                  <th>กิจกรรม</th>
                  <th>ห้อง</th>
                  <th>หมายเหตุ</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <RowEditor
                    key={l.id}
                    log={l}
                    onSaved={() => mutate((k: string) => k.startsWith(`/assignments/${aid}/worklog`))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function RowEditor({ log, onSaved }: { log: WorkLog; onSaved: () => void }) {
  const [w, setW] = useState<WorkLog>(log);
  const [saving, setSaving] = useState(false);
  useEffect(() => setW(log), [log.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const editable = w.status === "draft";
  async function save() {
    setSaving(true);
    try {
      await api.put(`/assignments/${w.assignment_id}/worklog`, w);
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <tr>
      <td>
        <TextInput type="date" disabled={!editable} value={w.work_date}
                   onChange={e => setW({ ...w, work_date: e.target.value })} />
      </td>
      <td>
        <TextInput type="time" disabled={!editable} className="w-24"
                   value={w.start_time} onChange={e => setW({ ...w, start_time: e.target.value })} />
      </td>
      <td>
        <TextInput type="time" disabled={!editable} className="w-24"
                   value={w.end_time} onChange={e => setW({ ...w, end_time: e.target.value })} />
      </td>
      <td className="num">
        <TextInput type="number" step="0.5" disabled={!editable} className="w-20 text-right tabular"
                   value={w.hours} onChange={e => setW({ ...w, hours: Number(e.target.value) })} />
      </td>
      <td>
        <Select disabled={!editable} value={w.activity} onChange={e => setW({ ...w, activity: e.target.value })}>
          <option value="lecture">บรรยาย</option>
          <option value="lab">ปฏิบัติการ</option>
          <option value="review">ตรวจงาน</option>
          <option value="makeup">ชดเชย</option>
          <option value="other">อื่น ๆ</option>
        </Select>
      </td>
      <td>
        <TextInput disabled={!editable} className="w-24"
                   value={w.room ?? ""} onChange={e => setW({ ...w, room: e.target.value })} />
      </td>
      <td>
        <TextInput disabled={!editable}
                   value={w.note ?? ""} onChange={e => setW({ ...w, note: e.target.value })} />
      </td>
      <td>
        <div className="flex items-center gap-2">
          <StatusChip status={w.status} />
          {editable && (
            <LockedActionButton variant="ghost" size="sm" onClick={save} disabled={saving}>
              <Save size={13} />
            </LockedActionButton>
          )}
        </div>
      </td>
    </tr>
  );
}
