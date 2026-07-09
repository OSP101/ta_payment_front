"use client";
import { useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import { Wand2, Send, Save } from "lucide-react";
import { api } from "../../lib/api";
import {
  PageHeader, Select, TextInput, StatusChip,
} from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";
import { LockedActionButton, useTAApproval } from "../TAGate";

interface Assignment { id: string; course_code: string; course_name: string; }
interface WorkLog {
  id: string; assignment_id: string;
  work_date: string; start_time: string; end_time: string;
  hours: number; activity: string; room?: string; note?: string; status: string;
}

const ACTIVITY_LABEL: Record<string, string> = {
  lecture: "บรรยาย",
  lab: "ปฏิบัติการ",
  review: "ตรวจงาน",
  makeup: "ชดเชย",
  other: "อื่น ๆ",
};

export default function WorklogPage() {
  const { approved } = useTAApproval();
  const { data: assignments } = useSWR<Assignment[]>(
    "/me/assignments",
    (p: string) => api.get<Assignment[]>(p).catch(() => [] as Assignment[]),
  );
  const [aid, setAid] = useState<string>("");
  useEffect(() => { if (!aid && assignments && assignments[0]) setAid(assignments[0].id); }, [assignments, aid]);

  const { data: logs } = useSWR<WorkLog[]>(aid ? `/assignments/${aid}/worklog` : null);

  // Per-row edit drafts, keyed by log id. A row without a draft shows server data.
  const [drafts, setDrafts] = useState<Record<string, WorkLog>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  useEffect(() => { setDrafts({}); }, [aid]);

  const view = (l: WorkLog): WorkLog => drafts[l.id] ?? l;
  const patch = (l: WorkLog, p: Partial<WorkLog>) =>
    setDrafts(prev => ({ ...prev, [l.id]: { ...(prev[l.id] ?? l), ...p } }));

  async function saveRow(l: WorkLog) {
    const w = view(l);
    setSavingId(l.id);
    try {
      await api.put(`/assignments/${w.assignment_id}/worklog`, w);
      setDrafts(prev => { const next = { ...prev }; delete next[l.id]; return next; });
      mutate((k: string) => k.startsWith(`/assignments/${aid}/worklog`));
    } finally { setSavingId(null); }
  }

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

  const columns: DataColumn<WorkLog>[] = [
    {
      id: "work_date", label: "วันที่", sortable: true, isRowHeader: true,
      sortValue: l => view(l).work_date,
      render: l => {
        const w = view(l);
        return w.status === "draft" ? (
          <TextInput type="date" value={w.work_date}
                     onChange={e => patch(l, { work_date: e.target.value })} />
        ) : new Date(w.work_date).toLocaleDateString("th-TH");
      },
    },
    {
      id: "time", label: "เวลา",
      className: "whitespace-nowrap",
      render: l => {
        const w = view(l);
        return w.status === "draft" ? (
          <div className="flex items-center gap-1">
            <TextInput type="time" className="w-24" value={w.start_time}
                       onChange={e => patch(l, { start_time: e.target.value })} />
            –
            <TextInput type="time" className="w-24" value={w.end_time}
                       onChange={e => patch(l, { end_time: e.target.value })} />
          </div>
        ) : `${w.start_time}–${w.end_time}`;
      },
    },
    {
      id: "hours", label: "ชม.",
      className: "text-right",
      render: l => {
        const w = view(l);
        return w.status === "draft" ? (
          <TextInput type="number" step="0.5" className="w-20 text-right tabular"
                     value={w.hours} onChange={e => patch(l, { hours: Number(e.target.value) })} />
        ) : w.hours.toFixed(1);
      },
    },
    {
      id: "activity", label: "กิจกรรม",
      render: l => {
        const w = view(l);
        return w.status === "draft" ? (
          <Select value={w.activity} onChange={e => patch(l, { activity: e.target.value })}>
            {Object.entries(ACTIVITY_LABEL).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </Select>
        ) : (ACTIVITY_LABEL[w.activity] ?? w.activity);
      },
    },
    {
      id: "room", label: "ห้อง",
      render: l => {
        const w = view(l);
        return w.status === "draft" ? (
          <TextInput className="w-24" value={w.room ?? ""}
                     onChange={e => patch(l, { room: e.target.value })} />
        ) : (w.room ?? "-");
      },
    },
    {
      id: "note", label: "หมายเหตุ",
      render: l => {
        const w = view(l);
        return w.status === "draft" ? (
          <TextInput value={w.note ?? ""}
                     onChange={e => patch(l, { note: e.target.value })} />
        ) : (w.note ?? "");
      },
    },
    {
      id: "status", label: "สถานะ",
      render: l => {
        const w = view(l);
        return (
          <div className="flex items-center gap-2">
            <StatusChip status={w.status} />
            {w.status === "draft" && (
              <LockedActionButton
                variant={drafts[l.id] ? "primary" : "ghost"} size="sm"
                onClick={() => saveRow(l)} disabled={savingId === l.id}
              >
                <Save size={13} />
              </LockedActionButton>
            )}
          </div>
        );
      },
    },
  ];

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

      <DataTable
        ariaLabel="บันทึกเวลาปฏิบัติงาน"
        rows={logs}
        loading={!!aid && !logs}
        rowKey={l => l.id}
        searchFn={l => `${l.work_date} ${ACTIVITY_LABEL[l.activity] ?? l.activity} ${l.room ?? ""} ${l.note ?? ""}`}
        searchPlaceholder="ค้นหาวันที่ / กิจกรรม / ห้อง…"
        filters={[
          {
            id: "status",
            placeholder: "ทุกสถานะ",
            options: [
              { id: "", label: "ทุกสถานะ" },
              { id: "draft", label: "ฉบับร่าง" },
              { id: "submitted", label: "รออนุมัติ" },
              { id: "approved", label: "อนุมัติแล้ว" },
              { id: "rejected", label: "ไม่ผ่าน" },
            ],
            predicate: (l, v) => l.status === v,
          },
          {
            id: "activity",
            placeholder: "ทุกกิจกรรม",
            options: [
              { id: "", label: "ทุกกิจกรรม" },
              ...Object.entries(ACTIVITY_LABEL).map(([v, label]) => ({ id: v, label })),
            ],
            predicate: (l, v) => l.activity === v,
          },
        ]}
        initialSort={{ column: "work_date", direction: "ascending" }}
        pageSize={15}
        emptyTitle="ยังไม่มีบันทึก"
        emptyDescription={`กด "สร้างอัตโนมัติ" เพื่อสร้างจากตารางสอน`}
        columns={columns}
      />
    </div>
  );
}
