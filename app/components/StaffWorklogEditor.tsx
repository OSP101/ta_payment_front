"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { Save, Trash2, Plus, Lock, X, Pencil } from "lucide-react";
import { Accordion } from "@heroui/react";
import { api, errMessage } from "../lib/api";
import { notify } from "../lib/notify";
import { TextInput, Select, Button, IconButton, Chip, EmptyState, Spinner, DatePicker, TimePicker, StatusChip } from "./ui";

export interface StaffWorkLog {
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
  locked: boolean;
}
interface StaffAssignment {
  assignment_id: string;
  ta_id: string;
  ta_name: string;
  student_id: string;
  section_no: string;
  track: string;
  level: string;
  is_returning: boolean;
}

const LEVEL_TH: Record<string, string> = {
  undergrad: "ปริญญาตรี", master: "ปริญญาโท", phd: "ปริญญาเอก",
};
const TRACK_TH: Record<string, string> = {
  regular: "ภาคปกติ", special: "ภาคพิเศษ",
};

const ACTIVITY_OPTS = [
  { v: "lecture", l: "บรรยาย" },
  { v: "lab", l: "ปฏิบัติการ" },
  { v: "review", l: "ตรวจงาน" },
  { v: "other", l: "อื่นๆ" },
];
const activityLabel = (a: string) => ACTIVITY_OPTS.find(o => o.v === a)?.l ?? a;
const PARENT_KIND_TH: Record<string, string> = { lecture: "บรรยาย", lab: "ปฏิบัติการ" };

const DOW_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTH_TH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
// fmtWorkDate("2026-06-25") → "พฤ. 25 มิ.ย. 2569" — matches the TA page's
// read-only date presentation.
function fmtWorkDate(iso: string): string {
  const [y, m, d] = (iso ?? "").split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return iso;
  return `${DOW_TH[dt.getDay()]} ${d} ${MONTH_TH_SHORT[m - 1]} ${y + 543}`;
}

const THAI_MONTHS = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
// monthLabel("2026-06") → "มิถุนายน 2569".
// The label must match the submission-period label, which keys off the term's
// Buddhist ACADEMIC year — not the raw Gregorian year of the work_date. In the
// KKU calendar the academic year begins in June, so Jan–May fall in the academic
// year that started the previous June: for those months the academic year is
// (Gregorian+543)−1. Without this, semester-2 Jan–Mar rows showed e.g.
// "มกราคม 2570" while the period label said "…2569".
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const academicYear = m >= 6 ? y + 543 : y + 543 - 1;
  return `${THAI_MONTHS[m] ?? ym} ${academicYear}`;
}

// StaffWorklogEditor: view + edit + add + delete a course's worklog, grouped by
// TA. Locked months (exported/finance_sent) render read-only. onDataChange lets
// the parent revalidate the payout preview after any edit.
export function StaffWorklogEditor({
  tcId,
  onDataChange,
}: {
  tcId: string;
  onDataChange?: () => void;
}) {
  const logsKey = `/staff/courses/${tcId}/worklogs`;
  const { data: logs } = useSWR<StaffWorkLog[]>(logsKey);
  const { data: assignments } = useSWR<StaffAssignment[]>(`/staff/courses/${tcId}/assignments`);

  const refetch = () => { mutate(logsKey); onDataChange?.(); };

  // Group by TA from the assignment list (so a TA with zero rows still shows,
  // ready for add-row) then attach their worklog rows.
  const groups = useMemo(() => {
    const m = new Map<string, { taId: string; taName: string; assignments: StaffAssignment[]; rows: StaffWorkLog[] }>();
    for (const a of assignments ?? []) {
      if (!m.has(a.ta_id)) m.set(a.ta_id, { taId: a.ta_id, taName: a.ta_name, assignments: [], rows: [] });
      m.get(a.ta_id)!.assignments.push(a);
    }
    for (const r of logs ?? []) {
      let g = m.get(r.ta_id);
      if (!g) { g = { taId: r.ta_id, taName: r.ta_name, assignments: [], rows: [] }; m.set(r.ta_id, g); }
      g.rows.push(r);
    }
    return [...m.values()].sort((a, b) => a.taName.localeCompare(b.taName, "th"));
  }, [logs, assignments]);

  if (!logs || !assignments) {
    return (
      <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted">
        <Spinner size="sm" /> กำลังโหลดบันทึกเวลา…
      </div>
    );
  }
  if (groups.length === 0) {
    return <EmptyState title="วิชานี้ยังไม่มี TA ที่อนุมัติ" />;
  }

  return (
    <Accordion allowsMultipleExpanded className="w-full">
      {groups.map(g => {
        const approvedHrs = g.rows.filter(r => r.status === "approved").reduce((a, r) => a + r.hours, 0);
        const lockedCount = g.rows.filter(r => r.locked).length;
        // TA metadata for the header — prefer the assignment row (carries
        // student_id + is_returning), fall back to a worklog row for level/track.
        const meta = g.assignments[0];
        const level = meta?.level ?? g.rows[0]?.level;
        const track = meta?.track ?? g.rows[0]?.track;
        return (
          <Accordion.Item key={g.taId} id={g.taId}>
            <Accordion.Heading>
              <Accordion.Trigger className="flex items-center gap-2 w-full px-4 flex-wrap">
                <div className="flex flex-col items-start min-w-0 mr-1">
                  <span className="font-medium text-ink-1 truncate">{g.taName}</span>
                  {meta?.student_id && (
                    <span className="text-[11px] text-ink-3">รหัส {meta.student_id}</span>
                  )}
                </div>
                {level && (
                  <Chip tone="info">
                    {LEVEL_TH[level] ?? level}{track ? ` · ${TRACK_TH[track] ?? track}` : ""}
                  </Chip>
                )}
                {meta && (
                  <Chip tone={meta.is_returning ? "info" : "neutral"}>
                    {meta.is_returning ? "TA เก่า" : "TA ใหม่"}
                  </Chip>
                )}
                <Chip tone="neutral">{g.rows.length} รายการ</Chip>
                <Chip tone="success">{approvedHrs.toFixed(1)} ชม.</Chip>
                {lockedCount > 0 && <Chip tone="warn"><Lock size={11} /> ล็อก {lockedCount}</Chip>}
                <Accordion.Indicator className="ml-auto" />
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body className="px-0 pb-0">
                <TAWorklogTable group={g} onChanged={refetch} />
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion>
  );
}

function TAWorklogTable({
  group,
  onChanged,
}: {
  group: { taId: string; taName: string; assignments: StaffAssignment[]; rows: StaffWorkLog[] };
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState<number[]>([]);
  const [seq, setSeq] = useState(0);

  // Group the TA's rows by month so a long list reads as "one block per เดือน".
  const monthGroups = useMemo(() => {
    const sorted = [...group.rows].sort(
      (a, b) => a.work_date.localeCompare(b.work_date) || a.start_time.localeCompare(b.start_time),
    );
    const m = new Map<string, StaffWorkLog[]>();
    for (const r of sorted) {
      const ym = r.work_date.slice(0, 7);
      if (!m.has(ym)) m.set(ym, []);
      m.get(ym)!.push(r);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [group.rows]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-secondary/50 text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="text-left px-3 py-2 font-medium">วันที่</th>
            <th className="text-left px-3 py-2 font-medium">เวลา</th>
            <th className="text-right px-3 py-2 font-medium">ชม.</th>
            <th className="text-left px-3 py-2 font-medium">กิจกรรม</th>
            <th className="text-left px-3 py-2 font-medium">หมายเหตุ</th>
            <th className="text-left px-3 py-2 font-medium">สถานะ</th>
            <th className="text-right px-3 py-2 font-medium pr-4">การทำงาน</th>
          </tr>
        </thead>
        <tbody>
          {monthGroups.length === 0 && adding.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-4 text-center text-muted text-xs">ยังไม่มีบันทึกเวลา กด “เพิ่มแถว” เพื่อบันทึก</td></tr>
          )}
          {monthGroups.map(([ym, rows]) => {
            const mHrs = rows.filter(r => r.status === "approved").reduce((a, r) => a + r.hours, 0);
            return (
              <Fragment key={ym}>
                <tr className="bg-slate-100/80 dark:bg-slate-800/50 border-t border-hairline">
                  <td colSpan={7} className="px-3 py-1.5 text-xs font-semibold text-ink-2">
                    <span className="inline-flex items-center gap-2">
                      <span>{monthLabel(ym)}</span>
                      <span className="font-normal text-ink-3">· {rows.length} รายการ · อนุมัติ {mHrs.toFixed(1)} ชม.</span>
                    </span>
                  </td>
                </tr>
                {rows.map(r => <EditableRow key={r.id} row={r} onChanged={onChanged} />)}
              </Fragment>
            );
          })}
          {adding.map(tid => (
            <NewRow
              key={tid}
              assignments={group.assignments}
              onDone={() => setAdding(a => a.filter(x => x !== tid))}
              onSaved={onChanged}
            />
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setAdding(a => [...a, seq]); setSeq(s => s + 1); }}
          disabled={group.assignments.length === 0}
        >
          <Plus size={12} /> เพิ่มแถว
        </Button>
      </div>
    </div>
  );
}

function EditableRow({ row, onChanged }: { row: StaffWorkLog; onChanged: () => void }) {
  const [draft, setDraft] = useState<StaffWorkLog>(row);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  // Reset the local draft whenever the server row's content changes. A single
  // joined signature (not a multi-field dep array) keeps the dependency list a
  // constant length — SWR revalidation returning a new `row` object identity
  // won't wipe in-progress edits, and the effect can't trip React's
  // "dependency array size changed" check.
  const rowSig = [
    row.id, row.work_date, row.start_time, row.end_time, row.hours,
    row.activity, row.parent_kind ?? "", row.note ?? "", row.locked,
  ].join("|");
  useEffect(() => {
    setDraft(row);
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSig]);

  const dirty =
    draft.work_date !== row.work_date ||
    draft.start_time !== row.start_time ||
    draft.end_time !== row.end_time ||
    draft.hours !== row.hours ||
    draft.activity !== row.activity ||
    (draft.parent_kind ?? null) !== (row.parent_kind ?? null) ||
    (draft.note ?? "") !== (row.note ?? "");

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
      setEditing(false);
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
  const activityText =
    row.activity === "other" && (row.parent_kind === "lecture" || row.parent_kind === "lab")
      ? `${activityLabel(row.activity)} (${PARENT_KIND_TH[row.parent_kind]})`
      : activityLabel(row.activity);

  // Read-only presentation (default) — mirrors the TA worklog page: values as
  // text, edit controls revealed only on demand. Locked months stay read-only
  // with a lock chip (the server rejects a write anyway).
  if (!editing) {
    return (
      <tr className={"border-t border-hairline " + (row.locked ? "bg-slate-50/40" : "")}>
        <td className="px-3 py-2 align-middle">{fmtWorkDate(row.work_date)}</td>
        <td className="px-3 py-2 align-middle tabular whitespace-nowrap">
          {row.start_time.slice(0, 5)}–{row.end_time.slice(0, 5)}
        </td>
        <td className="px-3 py-2 align-middle text-right tabular">{row.hours.toFixed(1)}</td>
        <td className="px-3 py-2 align-middle">
          <div className="flex flex-col leading-tight">
            <span>{activityText}</span>
            <span className="text-xs text-ink-3 whitespace-nowrap">
              sec {row.section_no} · {TRACK_TH[row.track] ?? row.track}
            </span>
          </div>
        </td>
        <td className="px-3 py-2 align-middle text-ink-2">{row.note || "—"}</td>
        <td className="px-3 py-2 align-middle"><StatusChip status={row.status} /></td>
        <td className="px-3 py-2 align-middle text-right whitespace-nowrap pr-4">
          {row.locked ? (
            <span title="งวดของเดือนนี้ปิดแล้ว หรือส่งออก/ส่งการเงินไปแล้ว แก้ไขย้อนหลังไม่ได้">
              <Chip tone="warn"><Lock size={11} /> ล็อก</Chip>
            </span>
          ) : (
            <div className="inline-flex items-center gap-1">
              <IconButton label="แก้ไข" variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Pencil size={13} />
              </IconButton>
              {canDelete && (
                <IconButton label="ลบ" variant="ghost" size="sm" onClick={del} disabled={busy}>
                  <Trash2 size={13} />
                </IconButton>
              )}
            </div>
          )}
        </td>
      </tr>
    );
  }

  // Edit mode — compact segmented pickers, same components the TA page uses.
  return (
    <tr className="border-t border-hairline bg-brand-soft/10">
      <td className="px-3 py-2 align-middle">
        <DatePicker value={draft.work_date} onChange={v => setDraft({ ...draft, work_date: v })} label="วันที่ปฏิบัติงาน" />
      </td>
      <td className="px-3 py-2 align-middle">
        <div className="flex items-center gap-1 whitespace-nowrap">
          <TimePicker value={draft.start_time} onChange={v => setDraft({ ...draft, start_time: v.length === 5 ? v + ":00" : v })} label="เวลาเริ่ม" />
          <span className="text-ink-3">–</span>
          <TimePicker value={draft.end_time} onChange={v => setDraft({ ...draft, end_time: v.length === 5 ? v + ":00" : v })} label="เวลาสิ้นสุด" />
        </div>
      </td>
      <td className="px-3 py-2 align-middle text-right">
        <TextInput type="number" step="0.25" min="0" value={draft.hours} onChange={e => setDraft({ ...draft, hours: parseFloat(e.target.value) || 0 })} className="w-20 min-w-16 text-right" />
      </td>
      <td className="px-3 py-2 align-middle">
        <div className="flex flex-col gap-1">
          <Select value={draft.activity} onChange={e => setDraft({ ...draft, activity: e.target.value })} className="w-32">
            {ACTIVITY_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
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
      <td className="px-3 py-2 align-middle">
        <TextInput value={draft.note ?? ""} onChange={e => setDraft({ ...draft, note: e.target.value })} className="w-40" placeholder="หมายเหตุ" />
      </td>
      <td className="px-3 py-2 align-middle"><StatusChip status={row.status} /></td>
      <td className="px-3 py-2 align-middle text-right whitespace-nowrap pr-4">
        <div className="inline-flex items-center gap-1">
          <Button variant="primary" size="sm" onClick={save} disabled={!dirty || busy}>
            <Save size={12} /> บันทึก
          </Button>
          <IconButton label="ยกเลิก" variant="ghost" size="sm" onClick={() => { setDraft(row); setEditing(false); }} disabled={busy}>
            <X size={13} />
          </IconButton>
        </div>
      </td>
    </tr>
  );
}

// NewRow is a blank draft entry the staff can fill and save (INSERT). Picks a
// section when the TA holds more than one. Saved rows come back as 'draft' and
// do NOT count toward the payout until approved.
function NewRow({
  assignments,
  onDone,
  onSaved,
}: {
  assignments: StaffAssignment[];
  onDone: () => void;
  onSaved: () => void;
}) {
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.assignment_id ?? "");
  const [workDate, setWorkDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("11:00");
  const [hours, setHours] = useState(2);
  const [activity, setActivity] = useState("lecture");
  const [parentKind, setParentKind] = useState<"lecture" | "lab" | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!assignmentId || !workDate) { notify.error("กรุณาเลือก section และวันที่"); return; }
    setBusy(true);
    try {
      await api.put(`/staff/worklogs`, {
        assignment_id: assignmentId,
        work_date: workDate,
        start_time: start + ":00",
        end_time: end + ":00",
        hours: Number(hours),
        activity,
        parent_kind: activity === "other" ? (parentKind || null) : null,
        note: note || null,
      });
      notify.success("เพิ่มแล้ว (แบบร่าง ต้องอนุมัติจึงจะนับยอด)");
      onSaved();
      onDone();
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t border-hairline bg-brand-soft/20">
      <td className="px-3 py-2 align-middle">
        <DatePicker value={workDate} onChange={setWorkDate} label="วันที่ปฏิบัติงาน" />
        {assignments.length > 1 && (
          <Select value={assignmentId} onChange={e => setAssignmentId(e.target.value)} className="w-36 mt-1">
            {assignments.map(a => <option key={a.assignment_id} value={a.assignment_id}>Sec {a.section_no} · {a.track}</option>)}
          </Select>
        )}
      </td>
      <td className="px-3 py-2 align-middle">
        <div className="flex items-center gap-1 whitespace-nowrap">
          <TimePicker value={start} onChange={setStart} label="เวลาเริ่ม" />
          <span className="text-ink-3">–</span>
          <TimePicker value={end} onChange={setEnd} label="เวลาสิ้นสุด" />
        </div>
      </td>
      <td className="px-3 py-2 align-middle text-right"><TextInput type="number" step="0.25" min="0" value={hours} onChange={e => setHours(parseFloat(e.target.value) || 0)} className="w-20 min-w-16 text-right" /></td>
      <td className="px-3 py-2 align-middle">
        <div className="flex flex-col gap-1">
          <Select value={activity} onChange={e => setActivity(e.target.value)} className="w-32">
            {ACTIVITY_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </Select>
          {activity === "other" && (
            <Select value={parentKind} onChange={e => setParentKind(e.target.value as "lecture" | "lab" | "")} className="w-32">
              <option value="">— คู่กับ —</option>
              <option value="lecture">คู่บรรยาย</option>
              <option value="lab">คู่ปฏิบัติการ</option>
            </Select>
          )}
        </div>
      </td>
      <td className="px-3 py-2 align-middle">
        <TextInput value={note} onChange={e => setNote(e.target.value)} className="w-40" placeholder="หมายเหตุ" />
      </td>
      <td className="px-3 py-2 align-middle"><Chip tone="neutral">ใหม่</Chip></td>
      <td className="px-3 py-2 align-middle text-right whitespace-nowrap pr-4">
        <Button variant="primary" size="sm" onClick={save} disabled={busy}>
          <Save size={12} /> เพิ่ม
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone} disabled={busy}>
          <X size={12} /> ยกเลิก
        </Button>
      </td>
    </tr>
  );
}
