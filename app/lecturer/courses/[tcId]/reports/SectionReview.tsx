"use client";
import { fmtHours } from "@/app/lib/dates";
import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import {
  Check, X, ChevronDown, Link2, Pencil, Scissors, AlertTriangle, History,
} from "lucide-react";
import { HoursSplit } from "../../../../lib/trackSplit";
import { api } from "../../../../lib/api";
import { notify } from "../../../../lib/notify";
import {
  Button, IconButton, TextArea, FieldGroup, Chip, StatusChip, Modal, TimePicker, Alert, Tip,
} from "../../../../components/ui";
import { Skel } from "../../../../components/Skeletons";

/**
 * The review of one TA, laid out section by section (09/2026).
 *
 * The old view merged every section into one list per month, so a lecturer
 * with sec 1–3 in front of them could not tell which section a day belonged
 * to, approve one section and not another, or fix a wrong row without sending
 * the whole month back. Here:
 *
 *   • each SECTION GROUP is its own block — a co-taught set (sec 1+2+3 in one
 *     room at one hour) is one block, because it is one set of sittings paid
 *     once; a section taught alone is its own block;
 *   • each month of a block is approved or sent back on its own;
 *   • a row still awaiting review can be corrected (clock/hours) or cut, with a
 *     reason the TA sees and the record keeps;
 *   • rows that look wrong are flagged — outside the timetable, overlapping
 *     another sitting, or dated in the future — so a mistake stands out
 *     without reading every line.
 */

export interface ReviewSection {
  id: string;                  // assignment id
  sec_no: string;
  track: string;               // "regular" | "special"
  cotaught_group?: number | null;
}

interface WorkLog {
  id: string;
  assignment_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  activity: string;
  parent_kind?: "lecture" | "lab" | null;
  note?: string;
  status: string;
}

interface ChangeSnapshot {
  work_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  activity: string;
  parent_kind?: string | null;
  note?: string | null;
  sec_no: string;
}
interface WorkLogChange {
  id: number;
  assignment_id: string;
  work_log_id: string;
  action: "edit" | "cut";
  work_date: string;
  before: ChangeSnapshot;
  after?: ChangeSnapshot;
  reason: string;
  actor_name: string;
  actor_role: string;
  at: string;
}

interface ScheduleSlot { kind: string; day_of_week: number; start_time: string; end_time: string }
interface CourseWithSchedules {
  sections?: { id: string; sec_no: string; schedules?: ScheduleSlot[] }[];
}
interface HolidayImpactsResponse {
  impacts?: {
    affected_sections?: { sec_no: string; kind: string; makeup: { makeup_date: string; start_time?: string; end_time?: string } | null }[];
  }[];
}

const ACTIVITY_LABEL: Record<string, string> = {
  lecture: "บรรยาย", lab: "ปฏิบัติการ", review: "ตรวจงาน", makeup: "ชดเชย", other: "อื่น ๆ",
};
const PARENT_KIND_LABEL: Record<string, string> = { lecture: "คู่กับบรรยาย", lab: "คู่กับปฏิบัติการ" };
const TRACK_LABEL: Record<string, string> = { regular: "ภาคปกติ", special: "ภาคพิเศษ" };
const DOW_ABBR_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MONTH_TH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const MONTH_TH_LONG = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const REASON_MIN = 10; // editReasonMinLen on the server

function hhmm(t?: string): string { return (t ?? "").slice(0, 5); }
function toMin(t?: string): number {
  const [h, m] = (t ?? "").split(":").map(Number);
  return Number.isNaN(h) || Number.isNaN(m) ? NaN : h * 60 + m;
}
function spanHours(start: string, end: string): number | null {
  const s = toMin(start), e = toMin(end);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null;
  return Math.round(((e - s) / 60) * 100) / 100;
}
function dateTH(iso: string): string {
  const [y, m, d] = (iso ?? "").split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return `${DOW_ABBR_TH[dt.getDay()]} ${d} ${MONTH_TH_SHORT[m - 1]} ${y + 543}`;
}
function monthTH(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return y && m ? `${MONTH_TH_LONG[m - 1]} ${y + 543}` : key;
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function activityText(r: { activity: string; parent_kind?: string | null }): string {
  const base = ACTIVITY_LABEL[r.activity] ?? r.activity;
  return r.activity === "other" && r.parent_kind && PARENT_KIND_LABEL[r.parent_kind]
    ? `${base} (${PARENT_KIND_LABEL[r.parent_kind]})` : base;
}

/* ------------------------------------------------------------------ */
/* Section groups and sittings                                         */
/* ------------------------------------------------------------------ */

interface SectionBlock {
  key: string;
  sections: ReviewSection[];   // sorted by sec_no
  coTaught: boolean;
}

function blocksOf(sections: ReviewSection[]): SectionBlock[] {
  const byKey = new Map<string, ReviewSection[]>();
  for (const s of sections) {
    const k = s.cotaught_group == null ? `solo:${s.id}` : `g${s.cotaught_group}`;
    byKey.set(k, [...(byKey.get(k) ?? []), s]);
  }
  const num = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return [...byKey.entries()]
    .map(([key, secs]) => {
      const sorted = [...secs].sort((a, b) => num(a.sec_no, b.sec_no));
      return { key, sections: sorted, coTaught: sorted.length > 1 };
    })
    .sort((a, b) => num(a.sections[0].sec_no, b.sections[0].sec_no));
}

/** One real session: the co-taught copies of it folded together. */
interface Sitting {
  id: string;                  // first copy — what the edit/cut endpoints take
  work_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  activity: string;
  parent_kind?: "lecture" | "lab" | null;
  note?: string;
  status: string;
  assignmentIds: string[];
  logIds: string[];
  regular: boolean;            // billed on the regular side (rule B2)
}

function sittingsOf(rows: WorkLog[], block: SectionBlock): Sitting[] {
  const trackOf = new Map(block.sections.map(s => [s.id, s.track]));
  const out = new Map<string, Sitting>();
  for (const r of rows) {
    const k = block.coTaught ? `${r.work_date}|${hhmm(r.start_time)}|${hhmm(r.end_time)}|${r.status}` : r.id;
    const found = out.get(k);
    const regular = trackOf.get(r.assignment_id) === "regular";
    if (found) {
      found.assignmentIds.push(r.assignment_id);
      found.logIds.push(r.id);
      found.regular ||= regular;
      continue;
    }
    out.set(k, {
      id: r.id, work_date: r.work_date, start_time: hhmm(r.start_time), end_time: hhmm(r.end_time),
      hours: r.hours, activity: r.activity, parent_kind: r.parent_kind, note: r.note, status: r.status,
      assignmentIds: [r.assignment_id], logIds: [r.id], regular,
    });
  }
  return [...out.values()].sort((a, b) =>
    a.work_date !== b.work_date ? a.work_date.localeCompare(b.work_date) : a.start_time.localeCompare(b.start_time));
}

/* ------------------------------------------------------------------ */
/* Flags — what a reviewer should look at twice                        */
/* ------------------------------------------------------------------ */

interface FlagContext {
  slots: ScheduleSlot[];                          // the block's weekly class periods
  makeups: { date: string; start?: string; end?: string }[];
  today: string;
}

function flagsFor(s: Sitting, all: Sitting[], ctx: FlagContext): string[] {
  const out: string[] = [];
  const st = toMin(s.start_time), en = toMin(s.end_time);
  // A class activity (or its "อื่น ๆ" companion) belongs inside a class period
  // of that kind — or on a makeup day the lecturer set.
  const kind = s.activity === "lecture" || s.activity === "lab" ? s.activity
    : s.activity === "other" && s.parent_kind ? s.parent_kind : null;
  if (kind && ctx.slots.some(x => x.kind === kind)) {
    const [y, m, d] = s.work_date.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    const inSlot = ctx.slots.some(x => x.kind === kind && x.day_of_week === dow &&
      toMin(x.start_time) <= st && en <= toMin(x.end_time));
    const onMakeup = ctx.makeups.some(mk => mk.date === s.work_date &&
      (!mk.start || !mk.end || (toMin(mk.start) <= st && en <= toMin(mk.end))));
    if (!inSlot && !onMakeup && s.activity !== "makeup") out.push("นอกเวลาตารางสอน");
  }
  if (all.some(o => o !== s && o.work_date === s.work_date &&
      toMin(o.start_time) < en && st < toMin(o.end_time))) {
    out.push("เวลาซ้อนกับรายการอื่น");
  }
  if (s.work_date > ctx.today) out.push("ยังไม่ถึงวันที่ปฏิบัติงาน");
  return out;
}

/* ------------------------------------------------------------------ */

export function SectionReview({
  taId, taName, sections, tcId, onDecide, onChanged, onRejectingChange,
}: {
  taId: string;
  taName: string;
  sections: ReviewSection[];
  tcId: string;
  /** Approve or send back one block's month. Resolves when the queue is refreshed. */
  onDecide: (ym: string, assignmentIds: string[], kind: "approve" | "reject", reason?: string) => Promise<void>;
  /** After a correction: refresh the queue, totals and budget panels. */
  onChanged: () => Promise<void>;
  onRejectingChange?: (rejecting: boolean) => void;
}) {
  // Same composite key the page has always used, so its invalidation after a
  // decision (k[0] === "worklogs") still reaches this view.
  const paths = sections.map(s => `/assignments/${s.id}/worklog`);
  const { data: perAssignment, isLoading, mutate: reloadLogs } = useSWR<WorkLog[][]>(
    paths.length ? ["worklogs", ...paths] : null,
    async ([, ...ks]: string[]) => Promise.all(ks.map(k => api.get<WorkLog[]>(k))),
  );
  const changePaths = sections.map(s => `/assignments/${s.id}/worklog/changes`);
  const { data: perChanges, mutate: reloadChanges } = useSWR<WorkLogChange[][]>(
    changePaths.length ? ["worklog-changes", ...changePaths] : null,
    async ([, ...ks]: string[]) => Promise.all(ks.map(k => api.get<WorkLogChange[]>(k))),
  );
  const { data: course } = useSWR<CourseWithSchedules>(`/teaching-courses/${tcId}`);
  const { data: impacts } = useSWR<HolidayImpactsResponse>(`/teaching-courses/${tcId}/holiday-impacts`);

  const blocks = useMemo(() => blocksOf(sections), [sections]);
  const [editing, setEditing] = useState<Sitting | null>(null);
  const [cutting, setCutting] = useState<Sitting | null>(null);
  const [rejectingKey, setRejectingKey] = useState<string | null>(null);
  useEffect(() => { onRejectingChange?.(rejectingKey !== null); }, [rejectingKey, onRejectingChange]);

  async function afterChange() {
    await Promise.all([reloadLogs(), reloadChanges(), onChanged()]);
  }

  if (isLoading && !perAssignment) {
    return (
      <div className="border-t border-(--hairline) px-4 py-3" role="status" aria-busy="true">
        <span className="sr-only">กำลังโหลด</span>
        <Skel className="h-4 w-40" />
        <Skel className="mt-3 h-8 w-full rounded-lg" />
      </div>
    );
  }
  const logs = (perAssignment ?? []).flat().filter(r => r.status !== "draft");
  const changes = (perChanges ?? []).flat();

  return (
    <div className="border-t border-(--hairline)">
      {blocks.map(block => (
        <BlockView
          key={block.key}
          block={block}
          taId={taId}
          logs={logs.filter(r => block.sections.some(s => s.id === r.assignment_id))}
          changes={changes.filter(c => block.sections.some(s => s.id === c.assignment_id))}
          course={course}
          impacts={impacts}
          onDecide={onDecide}
          onEdit={setEditing}
          onCut={setCutting}
          rejectingKey={rejectingKey}
          setRejectingKey={setRejectingKey}
        />
      ))}

      <EditSittingModal
        sitting={editing}
        taName={taName}
        onClose={() => setEditing(null)}
        onDone={async () => { setEditing(null); await afterChange(); }}
      />
      <CutSittingModal
        sitting={cutting}
        taName={taName}
        onClose={() => setCutting(null)}
        onDone={async () => { setCutting(null); await afterChange(); }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One section block                                                   */
/* ------------------------------------------------------------------ */

function BlockView({
  block, taId, logs, changes, course, impacts, onDecide, onEdit, onCut, rejectingKey, setRejectingKey,
}: {
  block: SectionBlock;
  taId: string;
  logs: WorkLog[];
  changes: WorkLogChange[];
  course?: CourseWithSchedules;
  impacts?: HolidayImpactsResponse;
  onDecide: (ym: string, assignmentIds: string[], kind: "approve" | "reject", reason?: string) => Promise<void>;
  onEdit: (s: Sitting) => void;
  onCut: (s: Sitting) => void;
  rejectingKey: string | null;
  setRejectingKey: (k: string | null) => void;
}) {
  const sittings = useMemo(() => sittingsOf(logs, block), [logs, block]);
  const secNos = block.sections.map(s => s.sec_no);
  const flagCtx = useMemo<FlagContext>(() => {
    const secIds = new Set(block.sections.map(s => s.sec_no));
    const slots = (course?.sections ?? [])
      .filter(s => secIds.has(s.sec_no))
      .flatMap(s => s.schedules ?? []);
    const makeups = (impacts?.impacts ?? []).flatMap(i => (i.affected_sections ?? [])
      .filter(a => secIds.has(a.sec_no) && a.makeup)
      .map(a => ({ date: a.makeup!.makeup_date, start: a.makeup!.start_time, end: a.makeup!.end_time })));
    return { slots, makeups, today: todayISO() };
  }, [course, impacts, block]);

  // Cut sittings, folded like live ones (one record per co-taught copy).
  const cuts = useMemo(() => {
    const seen = new Map<string, WorkLogChange>();
    for (const c of changes.filter(c => c.action === "cut")) {
      const k = `${c.at.slice(0, 19)}|${c.work_date}|${c.before.start_time}|${c.before.end_time}`;
      if (!seen.has(k)) seen.set(k, c);
    }
    return [...seen.values()];
  }, [changes]);
  // Latest edit per work_log, to mark corrected rows.
  const editOf = useMemo(() => {
    const m = new Map<string, WorkLogChange>();
    for (const c of changes) {
      if (c.action !== "edit") continue;
      const cur = m.get(c.work_log_id);
      if (!cur || cur.at < c.at) m.set(c.work_log_id, c);
    }
    return m;
  }, [changes]);

  const months = useMemo(() => {
    const keys = new Set([...sittings.map(s => s.work_date.slice(0, 7)), ...cuts.map(c => c.work_date.slice(0, 7))]);
    return [...keys].sort().map(ym => {
      const items = sittings.filter(s => s.work_date.startsWith(ym));
      const submitted = items.filter(s => s.status === "submitted");
      const flagged = submitted.filter(s => flagsFor(s, items, flagCtx).length > 0).length;
      return {
        ym,
        items,
        cuts: cuts.filter(c => c.work_date.startsWith(ym)),
        submittedRegular: submitted.filter(s => s.regular).reduce((a, s) => a + s.hours, 0),
        submittedSpecial: submitted.filter(s => !s.regular).reduce((a, s) => a + s.hours, 0),
        submittedCount: submitted.length,
        approvedCount: items.filter(s => s.status === "approved").length,
        rejectedCount: items.filter(s => s.status === "rejected").length,
        flagged,
        ids: [...new Set(submitted.flatMap(s => s.assignmentIds))],
      };
    });
  }, [sittings, cuts, flagCtx]);

  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const pendingTotal = months.reduce((a, m) => a + m.submittedCount, 0);

  async function decide(ym: string, ids: string[], kind: "approve" | "reject", why?: string) {
    setBusy(`${ym}|${kind}`);
    try { await onDecide(ym, ids, kind, why); } finally { setBusy(null); }
  }

  return (
    <section className="border-b border-(--hairline) last:border-b-0">
      {/* Block header: which sections this is, and whether they are one set of sittings. */}
      <div className="flex flex-wrap items-center gap-2 bg-surface-secondary/60 px-4 py-2">
        {block.sections.map(s => (
          <Chip key={s.id} tone={s.track === "special" ? "brand" : "neutral"}>
            sec {s.sec_no} · {TRACK_LABEL[s.track] ?? s.track}
          </Chip>
        ))}
        {block.coTaught && (
          <Tip content="คาบเดียวกันบันทึกไว้ทุกเซคชันที่สอนพร้อมกัน ระบบนับและจ่ายครั้งเดียว อนุมัติ/แก้ไขพร้อมกันทุกเซคชัน"><span className="inline-flex items-center gap-1 text-xs text-muted">
            <Link2 size={12} /> สอนพร้อมกัน นับชั่วโมงครั้งเดียว
          </span></Tip>
        )}
        <span className="ms-auto text-xs text-muted">
          {pendingTotal > 0 ? `รอพิจารณา ${pendingTotal} คาบ` : "ไม่มีรายการรอพิจารณา"}
        </span>
      </div>

      {months.length === 0 && (
        <div className="px-4 py-4 text-center text-xs text-muted">ยังไม่มีบันทึกเวลาที่ส่งมาในเซคชันนี้</div>
      )}

      {months.map(mo => {
        const key = `${taId}|${block.key}|${mo.ym}`;
        const open = openMonth === mo.ym;
        const actionable = mo.submittedCount > 0;
        const rejectingThis = rejectingKey === key;
        return (
          <div key={mo.ym} className="border-t border-(--hairline) first:border-t-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
              <button
                type="button"
                onClick={() => setOpenMonth(open ? null : mo.ym)}
                aria-expanded={open}
                className="-mx-1 flex min-w-0 basis-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md px-1 py-0.5 text-left hover:bg-surface-secondary sm:flex-1 sm:basis-auto"
              >
                <ChevronDown size={14} className={`shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`} />
                <span className="text-sm font-medium">{monthTH(mo.ym)}</span>
                <span className="whitespace-nowrap text-xs text-muted">
                  {actionable
                    ? <>รอพิจารณา <HoursSplit regular={mo.submittedRegular} special={mo.submittedSpecial} /> · {mo.submittedCount} คาบ</>
                    : mo.rejectedCount > 0
                      ? `ส่งกลับให้ TA แก้ไข ${mo.rejectedCount} คาบ`
                      : mo.approvedCount > 0 ? `${mo.approvedCount} คาบ · ตรวจครบแล้ว` : "ไม่มีรายการ"}
                </span>
                {mo.flagged > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                    <AlertTriangle size={11} /> ควรตรวจ {mo.flagged}
                  </span>
                )}
                {mo.cuts.length > 0 && (
                  <span className="rounded-full border border-border bg-surface-secondary px-2 py-0.5 text-xs text-muted">
                    ตัดออก {mo.cuts.length}
                  </span>
                )}
              </button>

              {actionable ? (
                <div className={"ms-auto flex shrink-0 items-center gap-2 transition-opacity " +
                  (rejectingThis ? "pointer-events-none opacity-40" : "")}>
                  <Button variant="danger-soft" size="sm" disabled={!!busy || rejectingThis}
                          onClick={() => { setRejectingKey(key); setReason(""); }}>
                    <X size={14} /> ส่งกลับ
                  </Button>
                  <Button variant="primary" size="sm" disabled={!!busy || rejectingThis}
                          isPending={busy === `${mo.ym}|approve`}
                          onClick={() => decide(mo.ym, mo.ids, "approve")}>
                    <Check size={14} /> อนุมัติ{block.sections.length > 1 ? ` sec ${secNos.join(", ")}` : ""}
                  </Button>
                </div>
              ) : mo.rejectedCount > 0 ? (
                <span className="ms-auto shrink-0"><Chip tone="warn"><X size={12} /> รอ TA แก้ไข</Chip></span>
              ) : mo.approvedCount > 0 ? (
                <span className="ms-auto shrink-0"><Chip tone="success"><Check size={12} /> อนุมัติแล้ว</Chip></span>
              ) : null}
            </div>

            {rejectingThis && (
              <div className="border-t border-(--hairline) bg-surface-secondary px-4 py-3">
                <FieldGroup label={`เหตุผลที่ส่งกลับ ${monthTH(mo.ym)} (sec ${secNos.join(", ")})`}>
                  <TextArea rows={2} value={reason} onChange={e => setReason(e.target.value)}
                            placeholder="เช่น ชั่วโมงวันที่ 5 ไม่ตรงกับตารางสอน" />
                </FieldGroup>
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setRejectingKey(null)}>ยกเลิก</Button>
                  <Button variant="danger" size="sm" disabled={!reason.trim() || !!busy}
                          isPending={busy === `${mo.ym}|reject`}
                          onClick={async () => { setRejectingKey(null); await decide(mo.ym, mo.ids, "reject", reason.trim()); }}>
                    ส่งกลับให้แก้ไข
                  </Button>
                </div>
              </div>
            )}

            {open && (
              <SittingTable
                items={mo.items}
                cuts={mo.cuts}
                editOf={editOf}
                flagCtx={flagCtx}
                onEdit={onEdit}
                onCut={onCut}
              />
            )}
          </div>
        );
      })}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The rows of one month                                               */
/* ------------------------------------------------------------------ */

function SittingTable({
  items, cuts, editOf, flagCtx, onEdit, onCut,
}: {
  items: Sitting[];
  cuts: WorkLogChange[];
  editOf: Map<string, WorkLogChange>;
  flagCtx: FlagContext;
  onEdit: (s: Sitting) => void;
  onCut: (s: Sitting) => void;
}) {
  // Live rows and cut rows in one date order, so a cut day sits where it was.
  type Line = { kind: "row"; s: Sitting } | { kind: "cut"; c: WorkLogChange };
  const lines: Line[] = [
    ...items.map(s => ({ kind: "row" as const, s })),
    ...cuts.map(c => ({ kind: "cut" as const, c })),
  ].sort((a, b) => {
    const da = a.kind === "row" ? a.s.work_date + a.s.start_time : a.c.work_date + a.c.before.start_time;
    const db = b.kind === "row" ? b.s.work_date + b.s.start_time : b.c.work_date + b.c.before.start_time;
    return da.localeCompare(db);
  });
  const total = items.filter(s => s.status !== "rejected").reduce((a, s) => a + s.hours, 0);

  return (
    <div className="overflow-x-auto border-t border-(--hairline)">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-(--hairline) text-xs text-muted">
          <tr>
            <th className="whitespace-nowrap px-4 py-2 text-left font-medium">วันที่</th>
            <th className="whitespace-nowrap px-3 py-2 text-left font-medium">เวลา</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-medium">ชม.</th>
            <th className="whitespace-nowrap px-3 py-2 text-left font-medium">กิจกรรม</th>
            <th className="px-3 py-2 text-left font-medium">หมายเหตุ / ข้อสังเกต</th>
            <th className="whitespace-nowrap px-3 py-2 text-left font-medium">สถานะ</th>
            <th className="whitespace-nowrap px-4 py-2 text-right font-medium">
              <span className="sr-only">จัดการ</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--hairline)">
          {lines.map(line => {
            if (line.kind === "cut") {
              const c = line.c;
              return (
                <tr key={`cut-${c.id}`} className="bg-surface-secondary/50 text-muted">
                  <td className="whitespace-nowrap px-4 py-2 line-through">{dateTH(c.work_date)}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular line-through">{c.before.start_time}–{c.before.end_time}</td>
                  <td className="px-3 py-2 text-right tabular line-through">{c.before.hours.toFixed(1)}</td>
                  <td className="whitespace-nowrap px-3 py-2 line-through">{activityText(c.before)}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="inline-flex items-start gap-1">
                      <Scissors size={12} className="mt-0.5 shrink-0" />
                      <span>ตัดออกโดย {c.actor_name || "อาจารย์"} · {c.reason}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2"><Chip tone="neutral">ตัดออก</Chip></td>
                  <td />
                </tr>
              );
            }
            const s = line.s;
            const flags = s.status === "submitted" ? flagsFor(s, items, flagCtx) : [];
            const edit = s.logIds.map(id => editOf.get(id)).find(Boolean);
            const canTouch = s.status === "submitted";
            return (
              <tr key={s.id} className={s.status === "submitted" ? "" : "text-muted"}>
                <td className="whitespace-nowrap px-4 py-2">{dateTH(s.work_date)}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular">{s.start_time}–{s.end_time}</td>
                <td className="px-3 py-2 text-right tabular">{s.hours.toFixed(s.hours % 0.5 ? 2 : 1)}</td>
                <td className="whitespace-nowrap px-3 py-2">{activityText(s)}</td>
                <td className="px-3 py-2">
                  {s.note && <div>{s.note}</div>}
                  {flags.map(f => (
                    <div key={f} className="mt-0.5 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800 me-1">
                      <AlertTriangle size={11} /> {f}
                    </div>
                  ))}
                  {edit && (
                    <div className="mt-0.5 flex items-start gap-1 text-xs text-muted">
                      <History size={12} className="mt-0.5 shrink-0" />
                      <span>
                        แก้จาก {edit.before.start_time}–{edit.before.end_time} ({fmtHours(edit.before.hours)} ชม.)
                        {" "}โดย {edit.actor_name || "อาจารย์"} · {edit.reason}
                      </span>
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2"><StatusChip status={s.status} /></td>
                <td className="whitespace-nowrap px-4 py-1.5 text-right">
                  {canTouch && (
                    <div className="inline-flex gap-1">
                      <IconButton variant="ghost" size="sm" label="แก้ไขเวลา" onClick={() => onEdit(s)}>
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton variant="ghost" size="sm" label="ตัดรายการนี้ออก" onClick={() => onCut(s)}>
                        <Scissors size={14} />
                      </IconButton>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-(--hairline) text-xs text-muted">
          <tr>
            <td className="px-4 py-2" colSpan={2}>รวมเดือนนี้ (ไม่นับที่ตัดออกและที่ส่งกลับ)</td>
            <td className="px-3 py-2 text-right tabular font-medium text-foreground">{total.toFixed(1)}</td>
            <td colSpan={4} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Correct / cut dialogs                                               */
/* ------------------------------------------------------------------ */

function SittingSummary({ s }: { s: Sitting }) {
  return (
    <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm">
      <b>{dateTH(s.work_date)}</b> · {s.start_time}–{s.end_time} · {fmtHours(s.hours)} ชม. · {activityText(s)}
      {s.assignmentIds.length > 1 && (
        <div className="mt-1 text-xs text-muted">คาบนี้สอนพร้อมกันหลายเซคชัน จะแก้ทุกเซคชันพร้อมกัน</div>
      )}
    </div>
  );
}

function EditSittingModal({
  sitting, taName, onClose, onDone,
}: { sitting: Sitting | null; taName: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!sitting) return;
    setStart(sitting.start_time); setEnd(sitting.end_time); setReason(""); setError(null);
  }, [sitting]);
  const hours = spanHours(start, end);
  const unchanged = sitting && start === sitting.start_time && end === sitting.end_time;
  const reasonOK = reason.trim().length >= REASON_MIN;

  async function save() {
    if (!sitting || hours === null) return;
    setSaving(true); setError(null);
    try {
      await api.post(`/worklogs/${sitting.id}/review-edit`, { start_time: start, end_time: end, hours, reason: reason.trim() });
      notify.success(`แก้ไขเวลาวันที่ ${dateTH(sitting.work_date)} ของ ${taName} แล้ว`);
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  }

  return (
    <Modal
      open={sitting !== null}
      onClose={() => { if (!saving) onClose(); }}
      title="แก้ไขเวลาที่ TA บันทึก"
      icon={<Pencil size={18} />}
      size="md"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" onClick={save} isPending={saving}
                  disabled={saving || hours === null || !!unchanged || !reasonOK}>
            บันทึกการแก้ไข
          </Button>
        </div>
      }
    >
      {sitting && (
        <div className="flex flex-col gap-3">
          <SittingSummary s={sitting} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <FieldGroup label="เวลาเริ่ม"><TimePicker value={start} onChange={setStart} label="เวลาเริ่ม" /></FieldGroup>
            <FieldGroup label="เวลาสิ้นสุด"><TimePicker value={end} onChange={setEnd} label="เวลาสิ้นสุด" /></FieldGroup>
            <FieldGroup label="จำนวนชั่วโมง">
              <div className="flex h-9 items-center rounded-lg border border-border bg-surface-secondary px-3 tabular">
                {fmtHours(hours)}
              </div>
            </FieldGroup>
          </div>
          <FieldGroup label="เหตุผล (TA จะเห็นข้อความนี้)"
                      hint={`อย่างน้อย ${REASON_MIN} ตัวอักษร เก็บไว้ตรวจสอบย้อนหลัง`}>
            <TextArea rows={2} value={reason} onChange={e => setReason(e.target.value)}
                      placeholder="เช่น ปฏิบัติการวันนี้เลิก 15.00 น. ตามตารางจริง" />
          </FieldGroup>
          {error && <Alert status="danger" icon={<AlertTriangle size={14} />} title={error} />}
        </div>
      )}
    </Modal>
  );
}

function CutSittingModal({
  sitting, taName, onClose, onDone,
}: { sitting: Sitting | null; taName: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (sitting) { setReason(""); setError(null); } }, [sitting]);
  const reasonOK = reason.trim().length >= REASON_MIN;

  async function cut() {
    if (!sitting) return;
    setSaving(true); setError(null);
    try {
      await api.post(`/worklogs/${sitting.id}/review-cut`, { reason: reason.trim() });
      notify.success(`ตัดรายการวันที่ ${dateTH(sitting.work_date)} ของ ${taName} ออกแล้ว`);
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ");
    } finally { setSaving(false); }
  }

  return (
    <Modal
      open={sitting !== null}
      onClose={() => { if (!saving) onClose(); }}
      title="ตัดรายการนี้ออกจากการเบิก"
      icon={<Scissors size={18} />}
      size="md"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="danger" onClick={cut} isPending={saving} disabled={saving || !reasonOK}>
            <Scissors size={14} /> ตัดออก
          </Button>
        </div>
      }
    >
      {sitting && (
        <div className="flex flex-col gap-3">
          <SittingSummary s={sitting} />
          <p className="text-sm text-muted">
            รายการจะไม่ถูกนับชั่วโมงและค่าตอบแทน TA แก้กลับไม่ได้ ระบบเก็บรายการเดิมพร้อมเหตุผลไว้ให้ตรวจสอบย้อนหลัง
            และแจ้งให้ TA ทราบ
          </p>
          <FieldGroup label="เหตุผล (TA จะเห็นข้อความนี้)" hint={`อย่างน้อย ${REASON_MIN} ตัวอักษร`}>
            <TextArea rows={2} value={reason} onChange={e => setReason(e.target.value)}
                      placeholder="เช่น วันนี้งดการเรียนการสอน ไม่มีการปฏิบัติงาน" />
          </FieldGroup>
          {error && <Alert status="danger" icon={<AlertTriangle size={14} />} title={error} />}
        </div>
      )}
    </Modal>
  );
}
