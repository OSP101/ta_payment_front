"use client";
import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { Save, Trash2, ClipboardEdit } from "lucide-react";
import { api, errMessage, type Term } from "../../lib/api";
import { notify } from "../../lib/notify";
import {
  PageHeader, Panel, Select, TextInput, Button, EmptyState, Chip,
} from "../../components/ui";

interface TC { id: string; code: string; name_th: string; }
interface StaffWorkLog {
  id: string;
  assignment_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  activity: string;
  parent_kind?: "lecture" | "lab" | null;
  room?: string | null;
  note?: string | null;
  status: string;
  ta_id: string;
  ta_name: string;
  course_code: string;
  section_no: string;
  track: string;
  level: string;
}

const STATUS_TONE: Record<string, "success" | "warn" | "danger" | "neutral"> = {
  approved: "success",
  submitted: "warn",
  rejected: "danger",
  draft: "neutral",
};
const STATUS_LABEL: Record<string, string> = {
  approved: "อนุมัติแล้ว",
  submitted: "รออนุมัติ",
  rejected: "ถูกปฏิเสธ",
  draft: "แบบร่าง",
};

export default function StaffWorklogPage() {
  const { data: terms } = useSWR<Term[]>("/terms");
  const [termId, setTermId] = useState("");
  useEffect(() => { if (!termId && terms?.length) setTermId(terms[0].id); }, [terms, termId]);

  const coursesKey = termId ? `/teaching-courses?term_id=${termId}` : null;
  const { data: courses } = useSWR<TC[]>(coursesKey);
  const [tcId, setTcId] = useState("");
  useEffect(() => { setTcId(""); }, [termId]);

  const worklogKey = tcId ? `/staff/courses/${tcId}/worklogs` : null;
  const { data: logs } = useSWR<StaffWorkLog[]>(worklogKey);

  const [taFilter, setTaFilter] = useState<string>("");

  // TA list to filter, derived from returned rows so it always matches data.
  const taOptions = useMemo(() => {
    const seen = new Map<string, string>();
    (logs ?? []).forEach(l => { if (!seen.has(l.ta_id)) seen.set(l.ta_id, l.ta_name); });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [logs]);

  const filtered = useMemo(
    () => (logs ?? []).filter(l => !taFilter || l.ta_id === taFilter),
    [logs, taFilter]
  );

  return (
    <div>
      <PageHeader
        title="แก้ไขบันทึกเวลา (Staff)"
        description="ปรับข้อมูลบันทึกเวลาของ TA ก่อนส่งออกเอกสาร — สถานะของแถวจะคงเดิม (approved ยังคง approved) แต่ตัวเลขที่แก้จะสะท้อนใน ZIP"
        actions={
          <div className="flex gap-2">
            <Select value={termId} onChange={e => setTermId(e.target.value)} className="max-w-xs">
              {terms?.map(t => (
                <option key={t.id} value={t.id}>{t.academic_year}/{t.semester}</option>
              ))}
            </Select>
            <Select value={tcId} onChange={e => setTcId(e.target.value)} className="max-w-xs">
              <option value="">— เลือกวิชา —</option>
              {courses?.map(c => (
                <option key={c.id} value={c.id}>{c.code} · {c.name_th}</option>
              ))}
            </Select>
          </div>
        }
      />

      {!tcId ? (
        <Panel><EmptyState title="เลือกวิชาเพื่อดูรายการ" /></Panel>
      ) : !logs ? (
        <Panel><p className="text-sm text-ink-3">กำลังโหลด…</p></Panel>
      ) : logs.length === 0 ? (
        <Panel><EmptyState title="วิชานี้ยังไม่มีบันทึกเวลา" /></Panel>
      ) : (
        <>
          <Panel className="mb-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ink-3">กรอง TA:</span>
              <Select value={taFilter} onChange={e => setTaFilter(e.target.value)} className="max-w-xs">
                <option value="">— ทุกคน —</option>
                {taOptions.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </Select>
              <span className="ml-auto text-ink-3">{filtered.length} รายการ</span>
            </div>
          </Panel>

          <Panel padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-ink-2">
                  <tr>
                    <th className="text-left px-3 py-2">TA / Sec</th>
                    <th className="text-left px-3 py-2">วันที่</th>
                    <th className="text-left px-3 py-2">เริ่ม</th>
                    <th className="text-left px-3 py-2">สิ้นสุด</th>
                    <th className="text-right px-3 py-2">ชม.</th>
                    <th className="text-left px-3 py-2">กิจกรรม</th>
                    <th className="text-left px-3 py-2">สถานะ</th>
                    <th className="text-right px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <EditableRow key={r.id} row={r} onChanged={() => worklogKey && mutate(worklogKey)} />
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function EditableRow({ row, onChanged }: { row: StaffWorkLog; onChanged: () => void }) {
  const [draft, setDraft] = useState<StaffWorkLog>(row);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(row); }, [row.id, row.work_date, row.start_time, row.end_time, row.hours, row.activity, row.parent_kind]);

  const dirty =
    draft.work_date !== row.work_date ||
    draft.start_time !== row.start_time ||
    draft.end_time !== row.end_time ||
    draft.hours !== row.hours ||
    draft.activity !== row.activity ||
    (draft.parent_kind ?? null) !== (row.parent_kind ?? null);

  async function save() {
    setBusy(true);
    try {
      await api.put(`/staff/worklogs`, {
        id: draft.id,
        assignment_id: draft.assignment_id,
        work_date: draft.work_date,
        start_time: draft.start_time,
        end_time: draft.end_time,
        hours: Number(draft.hours),
        activity: draft.activity,
        parent_kind: draft.activity === "other" ? draft.parent_kind : null,
        room: draft.room,
        note: draft.note,
      });
      notify.success("บันทึกแล้ว");
      onChanged();
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!confirm("ลบแถวนี้?")) return;
    setBusy(true);
    try {
      await api.del(`/staff/worklogs/${row.id}`);
      notify.success("ลบแล้ว");
      onChanged();
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const canDelete = row.status === "draft" || row.status === "rejected";

  return (
    <tr className="border-t border-hairline">
      <td className="px-3 py-2">
        <div className="font-medium">{row.ta_name}</div>
        <div className="text-xs text-ink-3">Sec {row.section_no} · {row.track} · {row.level}</div>
      </td>
      <td className="px-3 py-2">
        <TextInput type="date" value={draft.work_date} onChange={e => setDraft({ ...draft, work_date: e.target.value })} className="w-36" />
      </td>
      <td className="px-3 py-2">
        <TextInput type="time" value={draft.start_time.slice(0, 5)} onChange={e => setDraft({ ...draft, start_time: e.target.value + ":00" })} className="w-24" />
      </td>
      <td className="px-3 py-2">
        <TextInput type="time" value={draft.end_time.slice(0, 5)} onChange={e => setDraft({ ...draft, end_time: e.target.value + ":00" })} className="w-24" />
      </td>
      <td className="px-3 py-2 text-right">
        <TextInput type="number" step="0.25" min="0" value={draft.hours} onChange={e => setDraft({ ...draft, hours: parseFloat(e.target.value) || 0 })} className="w-20 text-right" />
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <Select value={draft.activity} onChange={e => setDraft({ ...draft, activity: e.target.value })} className="w-32">
            <option value="lecture">บรรยาย</option>
            <option value="lab">ปฏิบัติการ</option>
            <option value="review">review</option>
            <option value="other">อื่นๆ</option>
          </Select>
          {draft.activity === "other" && (
            <Select
              value={draft.parent_kind ?? ""}
              onChange={e => setDraft({ ...draft, parent_kind: (e.target.value || null) as "lecture" | "lab" | null })}
              className="w-32"
            >
              <option value="">— คู่กับ —</option>
              <option value="lecture">คู่บรรยาย</option>
              <option value="lab">คู่ปฏิบัติการ</option>
            </Select>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <Chip tone={STATUS_TONE[row.status] ?? "neutral"}>{STATUS_LABEL[row.status] ?? row.status}</Chip>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <Button variant="secondary" size="sm" onClick={save} disabled={!dirty || busy}>
          <Save size={12} /> บันทึก
        </Button>
        {canDelete && (
          <Button variant="ghost" size="sm" onClick={del} disabled={busy}>
            <Trash2 size={12} /> ลบ
          </Button>
        )}
      </td>
    </tr>
  );
}
