"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import { Wand2, Send, Save, Clock } from "lucide-react";
import { api } from "../../lib/api";
import { notify } from "../../lib/notify";
import {
  PageHeader, Panel, Select, TextInput, StatusChip, ConfirmDialog,
} from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";
import { LockedActionButton, useTAApproval } from "../TAGate";

// Max billable hours per single work-log entry. Kept in sync with backend.
const MAX_ROW_HOURS = 7;

function parseHM(t: string): number {
  const [h, m] = (t ?? "").split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
}

// Returns null when the row is savable, otherwise a Thai reason. Enforced
// client-side so the user gets instant feedback before hitting the server.
function validateRow(w: WorkLog): string | null {
  if (!w.work_date) return "โปรดระบุวันที่ปฏิบัติงาน";
  if (!w.start_time || !w.end_time) return "โปรดระบุเวลาเริ่มและเวลาสิ้นสุด";
  const s = parseHM(w.start_time);
  const e = parseHM(w.end_time);
  if (Number.isNaN(s) || Number.isNaN(e)) return "รูปแบบเวลาไม่ถูกต้อง";
  if (e <= s) return "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม";
  if (!(w.hours > 0)) return "จำนวนชั่วโมงต้องมากกว่า 0";
  if (w.hours > MAX_ROW_HOURS) return `จำนวนชั่วโมงต้องไม่เกิน ${MAX_ROW_HOURS} ชั่วโมงต่อรายการ`;
  const span = (e - s) / 60;
  if (Math.abs(span - w.hours) > 0.25) {
    return `จำนวนชั่วโมง (${w.hours}) ไม่ตรงกับช่วงเวลา ${w.start_time}–${w.end_time} (${span.toFixed(1)} ชม.)`;
  }
  // Q&A rule 2: "อื่นๆ" must be tagged with the parent session type so the
  // server can enforce the per-session credit-hour cap.
  if (w.activity === "other" && w.parent_kind !== "lecture" && w.parent_kind !== "lab") {
    return "กรุณาระบุประเภทกิจกรรมหลัก (บรรยาย/ปฏิบัติการ) สำหรับกิจกรรมอื่นๆ";
  }
  return null;
}

interface Assignment { id: string; course_code: string; course_name: string; }
interface WorkLog {
  id: string; assignment_id: string;
  work_date: string; start_time: string; end_time: string;
  hours: number; activity: string;
  // parent_kind is required (lecture|lab) when activity === "other" so the
  // server can enforce the per-session credit-hour cap (Q&A rule 2).
  parent_kind?: "lecture" | "lab" | null;
  room?: string; note?: string; status: string;
}

const PARENT_KIND_LABEL: Record<string, string> = {
  lecture: "คู่กับบรรยาย",
  lab: "คู่กับปฏิบัติการ",
};

const ACTIVITY_LABEL: Record<string, string> = {
  lecture: "บรรยาย",
  lab: "ปฏิบัติการ",
  review: "ตรวจงาน",
  makeup: "ชดเชย",
  other: "อื่น ๆ",
};

export default function WorklogPage() {
  const { approved } = useTAApproval();
  const searchParams = useSearchParams();
  const courseParam = searchParams.get("course");
  const { data: assignments } = useSWR<Assignment[]>(
    "/me/assignments",
    (p: string) => api.get<Assignment[]>(p).catch(() => [] as Assignment[]),
  );
  const [aid, setAid] = useState<string>("");
  // Pick the initial assignment: honour the ?course= param from the home page
  // when it points at a real assignment, otherwise fall back to the first one.
  useEffect(() => {
    if (aid || !assignments || assignments.length === 0) return;
    const fromParam = courseParam && assignments.find(a => a.id === courseParam);
    setAid(fromParam ? fromParam.id : assignments[0].id);
  }, [assignments, aid, courseParam]);

  const { data: logs } = useSWR<WorkLog[]>(aid ? `/assignments/${aid}/worklog` : null);

  // Per-row edit drafts, keyed by log id. A row without a draft shows server data.
  const [drafts, setDrafts] = useState<Record<string, WorkLog>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  useEffect(() => { setDrafts({}); }, [aid]);

  const view = (l: WorkLog): WorkLog => drafts[l.id] ?? l;
  const patch = (l: WorkLog, p: Partial<WorkLog>) =>
    setDrafts(prev => ({ ...prev, [l.id]: { ...(prev[l.id] ?? l), ...p } }));

  const hasUnsaved = Object.keys(drafts).length > 0;
  const totalHours = useMemo(
    () => (logs ?? []).reduce((sum, l) => sum + (view(l).hours || 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logs, drafts],
  );

  const revalidate = () =>
    mutate((k) => typeof k === "string" && k.startsWith(`/assignments/${aid}/worklog`));

  async function saveRow(l: WorkLog) {
    const w = view(l);
    const err = validateRow(w);
    if (err) { notify.error(err); return; }
    setSavingId(l.id);
    try {
      await api.put(`/assignments/${w.assignment_id}/worklog`, w);
      setDrafts(prev => { const next = { ...prev }; delete next[l.id]; return next; });
      notify.success("บันทึกรายการแล้ว");
      revalidate();
    } catch (e) {
      notify.error(e);
    } finally { setSavingId(null); }
  }

  async function generate() {
    if (!aid) return;
    if (!confirm("สร้างตารางบันทึกเวลาอัตโนมัติจากตารางสอน? การกระทำนี้จะเขียนทับ draft ที่มีอยู่")) return;
    setGenerating(true);
    try {
      await api.post(`/assignments/${aid}/worklog/generate`);
      notify.success("สร้างรายการอัตโนมัติเรียบร้อย");
      revalidate();
    } catch (e) {
      notify.error(e);
    } finally { setGenerating(false); }
  }

  async function submit() {
    setConfirmSubmit(false);
    if (!aid) return;
    setSubmitting(true);
    try {
      await api.post(`/assignments/${aid}/worklog/submit`);
      notify.success("ส่งให้อาจารย์อนุมัติแล้ว");
      revalidate();
    } catch (e) {
      notify.error(e);
    } finally { setSubmitting(false); }
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
          <TextInput type="number" step="0.5" min={0} max={MAX_ROW_HOURS} className="w-20 text-right tabular"
                     value={w.hours} onChange={e => patch(l, { hours: Number(e.target.value) })} />
        ) : w.hours.toFixed(1);
      },
    },
    {
      id: "activity", label: "กิจกรรม",
      render: l => {
        const w = view(l);
        if (w.status !== "draft") {
          const label = ACTIVITY_LABEL[w.activity] ?? w.activity;
          if (w.activity === "other" && (w.parent_kind === "lecture" || w.parent_kind === "lab")) {
            return `${label} (${PARENT_KIND_LABEL[w.parent_kind]})`;
          }
          return label;
        }
        return (
          <div className="flex flex-col gap-1">
            <Select
              value={w.activity}
              onChange={e => {
                const next = e.target.value;
                // When leaving 'other', drop parent_kind so it doesn't stick
                // in the payload and re-trigger the server-side check.
                patch(l, next === "other"
                  ? { activity: next, parent_kind: w.parent_kind ?? "lecture" }
                  : { activity: next, parent_kind: null });
              }}
            >
              {Object.entries(ACTIVITY_LABEL).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </Select>
            {w.activity === "other" && (
              <Select
                value={w.parent_kind ?? "lecture"}
                onChange={e => patch(l, { parent_kind: e.target.value as "lecture" | "lab" })}
                aria-label="ประเภทกิจกรรมหลัก"
              >
                {Object.entries(PARENT_KIND_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </Select>
            )}
          </div>
        );
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
            <LockedActionButton variant="secondary" onClick={generate} isPending={generating} disabled={generating}>
              <Wand2 size={14} /> สร้างอัตโนมัติ
            </LockedActionButton>
            <LockedActionButton variant="primary" onClick={() => setConfirmSubmit(true)} isPending={submitting} disabled={submitting}>
              <Send size={14} /> ส่งอนุมัติ
            </LockedActionButton>
          </>
        }
      />

      {!approved && (
        <div className="mb-4 text-xs text-muted">
          * ปุ่มบันทึก/ส่งจะปลดล็อกหลังเจ้าหน้าที่อนุมัติเอกสารในโปรไฟล์
        </div>
      )}

      {aid && (
        <div className="mb-3 inline-flex items-center gap-2 text-sm text-foreground bg-surface-secondary border border-[var(--hairline)] px-3 py-1.5 rounded-lg">
          <Clock size={14} className="text-muted" />
          <span>รวมชั่วโมงทั้งหมด</span>
          <span className="font-semibold tabular">{totalHours.toFixed(1)}</span>
          <span className="text-muted">ชม.</span>
          {hasUnsaved && (
            <span className="text-xs text-warning-soft-foreground ml-2">(มีรายการที่ยังไม่บันทึก)</span>
          )}
        </div>
      )}

      <Panel padded={false}>
        <div className="p-4">
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
      </Panel>

      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={submit}
        isPending={submitting}
        title="ส่งบันทึกเวลาให้อาจารย์อนุมัติ"
        confirmLabel="ส่งอนุมัติ"
        message={
          hasUnsaved
            ? "มีรายการที่แก้ไขแล้วแต่ยังไม่ได้กดบันทึก — รายการเหล่านั้นจะไม่ถูกส่ง โปรดบันทึกก่อนหากต้องการรวมไปด้วย ต้องการส่งต่อหรือไม่?"
            : "เมื่อส่งแล้วจะไม่สามารถแก้ไขรายการที่ส่งได้จนกว่าอาจารย์จะพิจารณา ต้องการส่งหรือไม่?"
        }
      />
    </div>
  );
}
