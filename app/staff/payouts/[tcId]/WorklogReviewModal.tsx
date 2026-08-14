"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import {
  ClipboardCheck, ChevronLeft, ChevronRight, CheckCircle2, Check, Undo2,
  Pencil, Trash2, X, ShieldCheck, ImagePlus, RotateCcw,
} from "lucide-react";
import { api, errMessage, type Me } from "../../../lib/api";
import { notify } from "../../../lib/notify";
import {
  Modal, Button, Spinner, Chip, TextArea, TextInput, Alert, IconButton,
  ConfirmDialog,
} from "../../../components/ui";
import { packLanes, parseTime } from "../../../components/ScheduleGrid";
import { readAddForm, writeAddForm, clearAddForm } from "../../../lib/draftStorage";

/**
 * One TA's month, checked against their own week.
 *
 * The old drawer showed a list of rows and a list of the section's slots in two
 * boxes, which left the reviewer to hold "13:00–15:00 ปฏิบัติการ" in their head
 * while they looked for the period it came from. The two halves are the same
 * fact seen twice, so they belong side by side and LINKED: hovering a row lights
 * the period it came from, clicking a period lights every row it produced.
 *
 * The linking key is (weekday, start, end, section). Nothing new is stored for
 * it — which also means a row that lights NOTHING is the interesting case: it did
 * not come from the timetable at all, and that is the signal the reviewer is
 * here for.
 *
 * Editing is a batch, not a field. See ApplyStaffEditBatch: one reason, one
 * password, up to three images, applied to the whole month — because an officer
 * fixing five rows has one explanation, and asking five times teaches them to
 * type "แก้ไข" five times instead of explaining once.
 */

interface ReviewDay {
  id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  activity: string;
  note?: string;
  sec_no: string;
  track: string;
  source: "auto" | "manual";
  on_timetable: boolean;
}
interface ReviewSlot {
  sec_no: string; kind: string; day_of_week: number;
  start_time: string; end_time: string;
}
interface MonthDetail {
  days: ReviewDay[]; slots: ReviewSlot[];
  auto_hours: number; manual_hours: number;
  auto_count: number; manual_count: number;
  days_worked: number;
}
interface OwnBlock {
  kind: "own_class" | "lecture" | "lab" | "review";
  course_code: string; sec_no?: string; track?: string;
  day_of_week: number; start_time: string; end_time: string;
}

/** One month of one TA on one course — what the modal is pointed at. */
export interface ReviewTarget {
  periodId: string;
  periodLabel: string;
  yearMonth: string;
  taId: string;
  taName: string;
  status: string;
  openRows: number;
}

const ACTIVITY_LABEL: Record<string, string> = {
  lecture: "บรรยาย", lab: "ปฏิบัติการ", review: "ตรวจงาน", other: "อื่นๆ", makeup: "ชดเชย",
};
/**
 * ภาคปกติ vs ภาคพิเศษ decides the hourly rate (ป.ตรี: 40฿ vs 50฿), so a section
 * number without it does not tell the reviewer what an hour on that row is
 * worth. Short forms because it sits inside a narrow column beside the number.
 */
const TRACK_TH: Record<string, string> = { regular: "ปกติ", special: "พิเศษ" };

const DOW_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const MONTH_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const START_HR = 8;
const END_HR = 21;
const TOTAL_MIN = (END_HR - START_HR) * 60;
// Lane height. packLanes has no ceiling on how many blocks can share an hour —
// a course taught to four sections at once gets four lanes — but at 20px the
// stack read as a single smear. The row grows to fit whatever the day needs.
const LANE_PX = 24;
const DAYS = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABEL: Record<number, string> = {
  1: "จันทร์", 2: "อังคาร", 3: "พุธ", 4: "พฤหัส", 5: "ศุกร์", 6: "เสาร์", 0: "อาทิตย์",
};
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

/** Colour by duty kind — the same meaning as the printed form. */
const KIND_BG: Record<string, string> = {
  lecture: "#C0DD97", lab: "#B5D4F4", review: "#CECBF6", own_class: "#F5C4B3",
};
const KIND_LABEL: Record<string, string> = {
  lecture: "บรรยาย", lab: "ปฏิบัติการ", review: "ตรวจงาน", own_class: "คาบเรียนของเขา",
};
const KIND_FG: Record<string, string> = {
  lecture: "#173404", lab: "#042C53", review: "#26215C", own_class: "#4A1B0C",
};

/**
 * The link between a logged row and the weekly period it came from.
 *
 * Section is part of the key on purpose: co-taught sections meet at the same
 * hour, and a key without it would light both when only one was worked.
 */
const linkKey = (dow: number, start: string, end: string, sec: string) =>
  `${dow}|${start.slice(0, 5)}|${end.slice(0, 5)}|${sec}`;

const dowOf = (isoDate: string) => new Date(isoDate + "T00:00:00").getDay();

// Draft key for one officer's in-progress edits to one TA's one month, reusing
// the same localStorage helpers the TA worklog page uses (see draftStorage.ts)
// — "aid" there just means "the string that scopes this draft", not literally
// an assignment id. Session now ends the moment 15 minutes pass with no
// activity (see SessionActivityGuard) instead of warning first, so an officer
// who steps away mid-edit to answer a phone call loses the page, not just the
// tab — this is what makes re-opening the same TA's month hand the edits back.
const staffBatchAid = (tcId: string, taId: string, yearMonth: string) =>
  `staffbatch:${tcId}:${taId}:${yearMonth}`;
const staffBatchReasonAid = (tcId: string, taId: string, yearMonth: string) =>
  `staffbatch-reason:${tcId}:${taId}:${yearMonth}`;

/** A pending change the officer has made but not yet committed. */
type Pending =
  | { action: "delete" }
  | { action: "update"; start_time: string; end_time: string; hours: number; note: string };

export function WorklogReviewModal({
  open, onClose, tcId, courseCode, termId, target, months, onJump, onChanged,
}: {
  open: boolean;
  onClose: () => void;
  tcId: string;
  courseCode: string;
  termId: string | null;
  target: ReviewTarget | null;
  /** Every month of this TA on this course, so the header can step between them. */
  months: ReviewTarget[];
  onJump: (t: ReviewTarget) => void;
  onChanged: () => void;
}) {
  const detailKey = open && target
    ? `/submission-periods/${target.periodId}/courses/${tcId}/tas/${target.taId}/worklog`
    : null;
  const formKey = open && termId && target
    ? `/timetable-form?term_id=${termId}&user_id=${target.taId}`
    : null;
  const { data, isLoading } = useSWR<MonthDetail>(detailKey);
  const { data: form } = useSWR<{ blocks: OwnBlock[] }>(formKey);
  const { data: me } = useSWR<Me>("/me");

  const [secTab, setSecTab] = useState<string>("__all");
  const [pending, setPending] = useState<Record<string, Pending>>({});
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const [commitOpen, setCommitOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Moving to another month must not carry the previous month's uncommitted
  // edits with it — they reference row ids that are not on screen any more.
  // If this exact (course, TA, month) has a draft left over from a session
  // that ended mid-edit (idle timeout, closed tab), restore it instead of
  // starting blank — see staffBatchAid above.
  useEffect(() => {
    if (target && me?.id) {
      const saved = readAddForm<Record<string, Pending>>(
        me.id, staffBatchAid(tcId, target.taId, target.yearMonth));
      if (saved && Object.keys(saved.form).length > 0) {
        setPending(saved.form);
        notify.info(`กู้คืนการแก้ไขที่ยังไม่ได้บันทึก ${Object.keys(saved.form).length} รายการ`);
      } else {
        setPending({});
      }
    } else {
      setPending({});
    }
    setPinnedKey(null);
    setSecTab("__all");
    // me?.id starts undefined while /me is loading and arrives a tick later —
    // it has to be a dependency so the restore actually runs once it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.periodId, target?.taId, target?.yearMonth, me?.id]);

  // Mirror every edit to localStorage as it happens, not just on unmount —
  // an idle-timeout logout doesn't give the page a chance to run cleanup.
  useEffect(() => {
    if (!target || !me?.id) return;
    const aid = staffBatchAid(tcId, target.taId, target.yearMonth);
    if (Object.keys(pending).length === 0) clearAddForm(me.id, aid);
    else writeAddForm(me.id, aid, pending);
  }, [pending, target?.taId, target?.yearMonth, me?.id, tcId]);

  const days = data?.days ?? [];
  // Sections as (number, track) pairs — the tab label has to say which fund the
  // hours behind it come out of.
  const sections = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of days) m.set(d.sec_no, d.track);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [days]);
  const shown = secTab === "__all" ? days : days.filter(d => d.sec_no === secTab);

  // Hours by activity, for the header. Computed here rather than fetched: the
  // rows are already on the client and a second endpoint could disagree with
  // what the table below is showing.
  const totals = useMemo(() => {
    const t: Record<string, number> = { lecture: 0, lab: 0, review: 0, other: 0 };
    for (const d of shown) t[d.activity] = (t[d.activity] ?? 0) + d.hours;
    return t;
  }, [shown]);

  const activeKey = pinnedKey ?? hoverKey;
  const idx = months.findIndex(m => m.periodId === target?.periodId);

  async function approve() {
    if (!target) return;
    setBusy(true);
    try {
      await api.post(
        `/submission-periods/${target.periodId}/courses/${tcId}/tas/${target.taId}/staff-review`,
        { comment: "" },
      );
      notify.success(`ตรวจผ่าน ${target.periodLabel}`);
      if (detailKey) await mutate(detailKey);
      onChanged();
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Sending a month back is the other half of a verdict, and it was missing:
  // the modal could approve but not refuse, so an officer who found a problem
  // had to close everything and find the row again on the grid behind.
  async function sendBack() {
    if (!target) return;
    setBusy(true);
    try {
      await api.post(
        `/submission-periods/${target.periodId}/courses/${tcId}/tas/${target.taId}/send-back`,
        { to_status: "pending", reason: rejectReason },
      );
      notify.success(`ตีกลับ ${target.periodLabel} แล้ว`);
      setRejectOpen(false);
      setRejectReason("");
      if (detailKey) await mutate(detailKey);
      onChanged();
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const pendingCount = Object.keys(pending).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="full"
      icon={<ClipboardCheck size={18} />}
      title={target ? `${target.taName} · ${courseCode}` : ""}
    >
      {!target ? null : (
        <div className="flex h-full min-h-0 flex-col">
          {/* Header: month stepper + verdict. Both live here so a reviewer can
              clear a TA's whole term without closing anything. */}
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--hairline)] pb-2">
            <div className="inline-flex items-center overflow-hidden rounded-lg border border-[var(--hairline)]">
              <IconButton
                label="เดือนก่อนหน้า"
                variant="ghost"
                size="sm"
                isDisabled={idx <= 0}
                onClick={() => idx > 0 && onJump(months[idx - 1])}
              >
                <ChevronLeft size={14} />
              </IconButton>
              <span className="px-3 text-sm font-medium">{target.periodLabel}</span>
              <IconButton
                label="เดือนถัดไป"
                variant="ghost"
                size="sm"
                isDisabled={idx < 0 || idx >= months.length - 1}
                onClick={() => idx >= 0 && idx < months.length - 1 && onJump(months[idx + 1])}
              >
                <ChevronRight size={14} />
              </IconButton>
            </div>
            {target.status !== "pending" ? (
              <Chip tone="success">ตรวจแล้ว</Chip>
            ) : target.openRows > 0 ? (
              <Chip tone="warn">ยังมี {target.openRows} รายการไม่ปิด</Chip>
            ) : null}

            <span className="flex-1" />

            {pendingCount > 0 && (
              <>
                <Chip tone="warn">แก้ไว้ {pendingCount} รายการ ยังไม่บันทึก</Chip>
                <Button variant="ghost" size="sm" onPress={() => setPending({})}>
                  <RotateCcw size={14} /> ยกเลิก
                </Button>
                <Button variant="primary" size="sm" onPress={() => setCommitOpen(true)}>
                  <ShieldCheck size={14} /> บันทึกการแก้ไข
                </Button>
              </>
            )}
            {pendingCount === 0 && (
              <>
                <Button variant="secondary" size="sm" isDisabled={busy} onPress={() => setRejectOpen(true)}>
                  <Undo2 size={14} /> ตีกลับ
                </Button>
                {target.status === "pending" && target.openRows === 0 && (
                  <Button size="sm" isDisabled={busy} onPress={approve}>
                    <CheckCircle2 size={14} /> ผ่านเดือนนี้
                  </Button>
                )}
              </>
            )}
          </div>

          {isLoading || !data ? (
            <div className="flex flex-1 items-center justify-center"><Spinner /></div>
          ) : (
            <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              {/* ── left: the week ─────────────────────────────────────────── */}
              <div className="min-h-0 overflow-auto">
                <p className="mb-1.5 text-xs text-muted">
                  ตารางสัปดาห์ คาบของวิชาอื่นเป็นสีเทา · กดคาบเพื่อไฮไลต์แถวที่มาจากคาบนั้น
                </p>
                <WeekGrid
                  blocks={form?.blocks ?? []}
                  courseCode={courseCode}
                  activeKey={activeKey}
                  onPick={k => setPinnedKey(cur => (cur === k ? null : k))}
                />
                {/* Without this the colours are a code nobody was given. */}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                  {(["lecture", "lab", "review"] as const).map(k => (
                    <span key={k} className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: KIND_BG[k] }} />
                      {KIND_LABEL[k]}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-surface-secondary ring-1 ring-[var(--hairline)]" />
                    วิชาอื่น / คาบเรียนของเขา
                  </span>
                </div>
              </div>

              {/* ── right: the rows ────────────────────────────────────────── */}
              <div className="flex min-h-0 flex-col overflow-hidden">
                {sections.length > 1 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {[["__all", ""] as [string, string], ...sections].map(([sec, track]) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setSecTab(sec)}
                        className={
                          "cursor-pointer rounded-lg px-2.5 py-1 text-xs " +
                          (secTab === sec
                            ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                            : "border border-[var(--hairline)]")
                        }
                      >
                        {sec === "__all"
                          ? "ทุก sec"
                          : `sec ${sec}${TRACK_TH[track] ? ` · ภาค${TRACK_TH[track]}` : ""}`}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mb-2 grid grid-cols-4 gap-2">
                  <Stat label="บรรยาย" value={totals.lecture} />
                  <Stat label="ปฏิบัติการ" value={totals.lab} />
                  <Stat label="ตรวจงาน + อื่นๆ" value={totals.review + totals.other} />
                  <Stat label="รวม" value={shown.reduce((a, d) => a + d.hours, 0)} strong />
                </div>

                <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--hairline)]">
                  <WeekTable
                    days={shown}
                    pending={pending}
                    activeKey={activeKey}
                    onHover={setHoverKey}
                    onStage={(id, p) => setPending(prev => ({ ...prev, [id]: p }))}
                    onUndo={id =>
                      setPending(p => {
                        const n = { ...p };
                        delete n[id];
                        return n;
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="ตีกลับให้แก้ไข"
        icon={<Undo2 size={18} />}
        danger
        isPending={busy}
        message={
          <div className="space-y-2">
            <p className="text-sm text-muted">
              {target?.taName} · {target?.periodLabel} เดือนนี้จะกลับไปให้แก้ไข
              และส่งออกเอกสารไม่ได้จนกว่าจะตรวจผ่านอีกครั้ง
            </p>
            <TextArea
              className="w-full"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="เหตุผล เช่น ชั่วโมงวันที่ 12 ไม่ตรงกับตารางสอน"
              rows={3}
            />
            {rejectReason.trim() === "" && (
              <p className="text-xs text-red-600">ต้องระบุเหตุผล เพื่อให้ทีเอรู้ว่าต้องแก้อะไร</p>
            )}
          </div>
        }
        confirmLabel="ตีกลับ"
        onConfirm={() => { if (rejectReason.trim() !== "") void sendBack(); }}
      />

      {commitOpen && target && (
        <CommitDialog
          tcId={tcId}
          taId={target.taId}
          yearMonth={target.yearMonth}
          days={days}
          pending={pending}
          onClose={() => setCommitOpen(false)}
          onDone={async () => {
            setCommitOpen(false);
            setPending({});
            if (detailKey) await mutate(detailKey);
            onChanged();
          }}
        />
      )}
    </Modal>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-secondary px-2 py-1.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={"tabular " + (strong ? "text-sm font-medium" : "text-sm")}>
        {value.toFixed(1)} ชม.
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The TA's week. Periods of OTHER courses stay on the grid but go grey — the
 * reviewer still needs to see that an hour was already spoken for, while the
 * course under review is what should catch the eye.
 */
function WeekGrid({
  blocks, courseCode, activeKey, onPick,
}: {
  blocks: OwnBlock[]; courseCode: string;
  activeKey: string | null; onPick: (k: string) => void;
}) {
  const byDay = useMemo(() => {
    const m = new Map<number, { block: OwnBlock; lane: number; laneCount: number }[]>();
    for (const dow of DAYS) {
      const arr = blocks.filter(
        b => b.day_of_week === dow && parseTime(b.start_time) < parseTime(b.end_time),
      );
      if (arr.length) m.set(dow, packLanes(arr));
    }
    return m;
  }, [blocks]);

  const days = DAYS.filter(d => (d >= 1 && d <= 5) || byDay.has(d));
  const hours = Array.from({ length: END_HR - START_HR + 1 }, (_, i) => START_HR + i);

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--hairline)]">
      <div className="min-w-[520px]">
        <div className="flex border-b border-[var(--hairline)] bg-surface-secondary">
          <div className="w-14 shrink-0 px-2 py-1 text-[11px] text-muted">เวลา</div>
          <div className="relative flex-1" style={{ height: 20 }}>
            {hours.map((h, i) => (
              <span
                key={h}
                className={
                  "absolute bottom-0.5 text-[10px] tabular text-muted " +
                  (i === 0 ? "" : i === hours.length - 1 ? "-translate-x-full" : "-translate-x-1/2")
                }
                style={{ left: pct(i / (END_HR - START_HR)) }}
              >
                {String(h).padStart(2, "0")}
              </span>
            ))}
          </div>
        </div>
        {days.map(dow => {
          const packed = byDay.get(dow) ?? [];
          const laneCount = packed.length ? packed[0].laneCount : 1;
          const rowH = Math.max(32, laneCount * LANE_PX + 8);
          return (
            <div key={dow} className="flex border-b border-[var(--hairline)] last:border-b-0">
              <div
                className="flex w-14 shrink-0 items-center justify-center bg-surface-secondary text-[11px]"
                style={{ minHeight: rowH }}
              >
                {DAY_LABEL[dow]}
              </div>
              <div className="relative flex-1" style={{ height: rowH }}>
                {hours.slice(1, -1).map((h, i) => (
                  <div
                    key={h}
                    aria-hidden
                    className="absolute top-0 bottom-0 w-px bg-[var(--hairline)]"
                    style={{ left: pct((i + 1) / (END_HR - START_HR)) }}
                  />
                ))}
                {packed.map(({ block: b, lane }, i) => {
                  const s = Math.max(parseTime(b.start_time), START_HR * 60) - START_HR * 60;
                  const e = Math.min(parseTime(b.end_time), END_HR * 60) - START_HR * 60;
                  if (e <= s) return null;
                  const mine = b.course_code === courseCode && b.kind !== "own_class";
                  const key = linkKey(dow, b.start_time, b.end_time, b.sec_no ?? "");
                  const on = mine && activeKey === key;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!mine}
                      onClick={() => mine && onPick(key)}
                      className={
                        "absolute overflow-hidden rounded px-1 text-left text-[10px] leading-[16px] whitespace-nowrap " +
                        (mine ? "cursor-pointer" : "cursor-default")
                      }
                      style={{
                        left: pct(s / TOTAL_MIN),
                        width: pct((e - s) / TOTAL_MIN),
                        top: 4 + lane * LANE_PX,
                        height: LANE_PX - 6,
                        background: mine ? KIND_BG[b.kind] : "var(--surface-secondary)",
                        color: mine ? KIND_FG[b.kind] : "var(--ink-3)",
                        outline: on ? "2px solid var(--brand)" : undefined,
                        outlineOffset: on ? "-2px" : undefined,
                        opacity: mine ? 1 : 0.7,
                      }}
                      title={
                        `${b.course_code}${b.sec_no ? ` sec ${b.sec_no}` : ""}` +
                        (TRACK_TH[b.track ?? ""] ? ` · ภาค${TRACK_TH[b.track ?? ""]}` : "") +
                        ` · ${KIND_LABEL[b.kind] ?? ""}` +
                        ` · ${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)}` +
                        (mine ? "" : " (วิชาอื่น)")
                      }
                    >
                      {b.course_code}{b.sec_no ? ` s${b.sec_no}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Monday-start week key, so rows group the way a calendar reads. */
function weekStart(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d.toISOString().slice(0, 10);
}
// Spelled out, with the Buddhist year the rest of the system prints. "อ. 23/6"
// saved a few pixels and cost the reviewer the one thing they cross-check
// against a paper form: which day of which month.
const fullDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return `${DOW_TH[d.getDay()]} ${d.getDate()} ${MONTH_TH[d.getMonth()]} ${d.getFullYear() + 543}`;
};

function WeekTable({
  days, pending, activeKey, onHover, onStage, onUndo,
}: {
  days: ReviewDay[];
  pending: Record<string, Pending>;
  activeKey: string | null;
  onHover: (k: string | null) => void;
  onStage: (id: string, p: Pending) => void;
  onUndo: (id: string) => void;
}) {
  // Which row is open for editing, and its draft. Editing happens IN the row:
  // a dialog on top of a dialog hid the very table the reviewer was checking
  // the numbers against, which is the only reason they opened this screen.
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ start: "", end: "", note: "" });

  const weeks = useMemo(() => {
    const m = new Map<string, ReviewDay[]>();
    for (const d of [...days].sort((a, b) =>
      a.work_date.localeCompare(b.work_date) || a.start_time.localeCompare(b.start_time))) {
      const k = weekStart(d.work_date);
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return [...m.entries()];
  }, [days]);

  if (days.length === 0) {
    return <p className="p-4 text-sm text-muted">ไม่มีบันทึกเวลาในเดือนนี้</p>;
  }

  const beginEdit = (d: ReviewDay) => {
    const p = pending[d.id];
    setEditId(d.id);
    setDraft({
      start: p?.action === "update" ? p.start_time : d.start_time.slice(0, 5),
      end: p?.action === "update" ? p.end_time : d.end_time.slice(0, 5),
      note: p?.action === "update" ? p.note : (d.note ?? ""),
    });
  };

  const draftMins = parseTime(draft.end) - parseTime(draft.start);
  const draftOK = Number.isFinite(draftMins) && draftMins > 0;

  return (
    <table className="w-full text-xs">
      {/* A header, at last. Seven unlabelled columns of numbers asked the
          reviewer to infer which was hours and which was the section. */}
      <thead className="sticky top-0 z-10 bg-surface-secondary text-muted">
        <tr>
          <th className="px-2 py-1.5 text-left font-normal">วันที่</th>
          <th className="px-1 py-1.5 text-left font-normal">เวลา</th>
          <th className="px-1 py-1.5 text-right font-normal">ชม.</th>
          <th className="px-1 py-1.5 text-left font-normal">กิจกรรม</th>
          <th className="px-1 py-1.5 text-left font-normal">Sec · ภาค</th>
          <th className="px-1 py-1.5 text-left font-normal">หมายเหตุ</th>
          <th className="px-1 py-1.5 text-left font-normal">ที่มา</th>
          <th className="px-1 py-1.5 text-right font-normal">แก้ไข</th>
        </tr>
      </thead>
      <tbody>
        {weeks.map(([wk, rows]) => (
          <Fragment key={wk}>
            <tr>
              <td colSpan={8} className="bg-surface-secondary/60 px-2 py-1 text-[11px] text-muted">
                สัปดาห์ {fullDate(wk)} · {rows.reduce((a, r) => a + r.hours, 0).toFixed(1)} ชม.
              </td>
            </tr>
            {rows.map(d => {
              const key = linkKey(dowOf(d.work_date), d.start_time, d.end_time, d.sec_no);
              const lit = activeKey === key;
              const p = pending[d.id];
              const editing = editId === d.id;
              return (
                <tr
                  key={d.id}
                  onMouseEnter={() => onHover(key)}
                  onMouseLeave={() => onHover(null)}
                  className={
                    "border-t border-[var(--hairline)] " +
                    (p?.action === "delete"
                      ? "bg-red-50 opacity-60"
                      : editing
                        ? "bg-[var(--brand-soft)]"
                        : p
                          ? "bg-amber-50"
                          : lit
                            ? "bg-[var(--brand-soft)]"
                            : d.source === "manual"
                              ? "bg-amber-50/40"
                              : "")
                  }
                >
                  <td className={"whitespace-nowrap px-2 py-1 " + (p?.action === "delete" ? "line-through" : "")}>
                    {fullDate(d.work_date)}
                  </td>

                  {editing ? (
                    <>
                      <td className="px-1 py-1">
                        <div className="flex items-center gap-1">
                          <TextInput
                            className="w-16"
                            value={draft.start}
                            onChange={e => setDraft(v => ({ ...v, start: e.target.value }))}
                          />
                          <span className="text-muted">–</span>
                          <TextInput
                            className="w-16"
                            value={draft.end}
                            onChange={e => setDraft(v => ({ ...v, end: e.target.value }))}
                          />
                        </div>
                      </td>
                      <td className={"px-1 py-1 text-right tabular " + (draftOK ? "" : "text-red-600")}>
                        {draftOK ? (draftMins / 60).toFixed(2) : "—"}
                      </td>
                      <td className="px-1 py-1">{ACTIVITY_LABEL[d.activity] ?? d.activity}</td>
                      <td className="whitespace-nowrap px-1 py-1">
                        {d.sec_no}
                        {TRACK_TH[d.track] && (
                          <span className="text-muted"> · {TRACK_TH[d.track]}</span>
                        )}
                      </td>
                      <td className="px-1 py-1">
                        <TextInput
                          className="w-full"
                          value={draft.note}
                          placeholder="ทำอะไรในคาบนี้"
                          onChange={e => setDraft(v => ({ ...v, note: e.target.value }))}
                        />
                      </td>
                      <td className="px-1 py-1" />
                      <td className="whitespace-nowrap px-1 py-1 text-right">
                        <IconButton
                          label="เก็บการแก้ไขไว้"
                          variant="ghost"
                          size="sm"
                          isDisabled={!draftOK}
                          onClick={() => {
                            onStage(d.id, {
                              action: "update",
                              start_time: draft.start,
                              end_time: draft.end,
                              hours: draftMins / 60,
                              note: draft.note,
                            });
                            setEditId(null);
                          }}
                        >
                          <Check size={12} />
                        </IconButton>
                        <IconButton label="เลิกแก้" variant="ghost" size="sm" onClick={() => setEditId(null)}>
                          <X size={12} />
                        </IconButton>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={"whitespace-nowrap px-1 py-1 tabular " + (p?.action === "delete" ? "line-through" : "")}>
                        {p?.action === "update"
                          ? `${p.start_time}–${p.end_time}`
                          : `${d.start_time.slice(0, 5)}–${d.end_time.slice(0, 5)}`}
                      </td>
                      <td className={"px-1 py-1 text-right tabular " + (p?.action === "delete" ? "line-through" : "")}>
                        {(p?.action === "update" ? p.hours : d.hours).toFixed(1)}
                      </td>
                      <td className="whitespace-nowrap px-1 py-1">{ACTIVITY_LABEL[d.activity] ?? d.activity}</td>
                      <td className="whitespace-nowrap px-1 py-1">
                        {d.sec_no}
                        {TRACK_TH[d.track] && (
                          <span className="text-muted"> · {TRACK_TH[d.track]}</span>
                        )}
                      </td>
                      <td className="px-1 py-1 text-muted">
                        {(p?.action === "update" ? p.note : d.note) || "—"}
                      </td>
                      <td className="px-1 py-1">
                        {d.source === "manual" ? (
                          <Chip tone="warn">ทีเอเพิ่มเอง</Chip>
                        ) : (
                          <span className="text-[11px] text-muted">ระบบ</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-1 py-1 text-right">
                        {p ? (
                          <IconButton label="ยกเลิกการแก้" variant="ghost" size="sm" onClick={() => onUndo(d.id)}>
                            <RotateCcw size={12} />
                          </IconButton>
                        ) : (
                          <>
                            <IconButton label="แก้ไข" variant="ghost" size="sm" onClick={() => beginEdit(d)}>
                              <Pencil size={12} />
                            </IconButton>
                            <IconButton
                              label="ลบ"
                              variant="ghost"
                              size="sm"
                              onClick={() => onStage(d.id, { action: "delete" })}
                            >
                              <Trash2 size={12} />
                            </IconButton>
                          </>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */

/**
 * The commit gate. Reason, evidence and password in one dialog, because the
 * server refuses the batch without all three — asking for them one at a time
 * would just move the refusal later.
 */
function CommitDialog({
  tcId, taId, yearMonth, days, pending, onClose, onDone,
}: {
  tcId: string; taId: string; yearMonth: string;
  days: ReviewDay[];
  pending: Record<string, Pending>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const { data: me } = useSWR<Me>("/me");

  // Reason text only — never the password, never the File objects (not
  // serializable, and re-attaching evidence is a small ask compared to
  // retyping the explanation). See staffBatchAid above for why this exists.
  const reasonAid = staffBatchReasonAid(tcId, taId, yearMonth);
  useEffect(() => {
    if (!me?.id) return;
    const saved = readAddForm<{ reason: string }>(me.id, reasonAid);
    if (saved?.form.reason) setReason(saved.form.reason);
    // Restore once, when the user id first resolves — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);
  useEffect(() => {
    if (!me?.id) return;
    if (reason.trim() === "") clearAddForm(me.id, reasonAid);
    else writeAddForm(me.id, reasonAid, { reason });
  }, [reason, me?.id, reasonAid]);

  const byId = new Map(days.map(d => [d.id, d]));
  const entries = Object.entries(pending);
  const reasonOK = reason.trim().length >= 10;

  async function submit() {
    setBusy(true);
    try {
      const changes = entries.map(([id, p]) => {
        const d = byId.get(id)!;
        if (p.action === "delete") return { work_log_id: id, action: "delete" };
        return {
          work_log_id: id,
          action: "update",
          after: {
            id,
            work_date: d.work_date,
            start_time: p.start_time,
            end_time: p.end_time,
            hours: p.hours,
            activity: d.activity,
            note: p.note,
          },
        };
      });
      const fd = new FormData();
      fd.append("payload", JSON.stringify({ year_month: yearMonth, reason, password, changes }));
      for (const f of files) fd.append("file", f);

      const res = await api.upload<{ applied: number; failed: number; errors?: string[] }>(
        `/submission-periods/courses/${tcId}/tas/${taId}/worklog-batch`, fd,
      );
      if (res.failed > 0) {
        notify.error(`บันทึก ${res.applied} รายการ · ไม่ผ่าน ${res.failed}: ${(res.errors ?? []).join(" · ")}`);
      } else {
        notify.success(`บันทึกการแก้ไข ${res.applied} รายการ แจ้งอาจารย์และทีเอแล้ว`);
      }
      if (me?.id) clearAddForm(me.id, reasonAid);
      onDone();
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="md" title="ยืนยันการแก้ไขบันทึกเวลา" icon={<ShieldCheck size={16} />}>
      <div className="space-y-3">
        <Alert
          status="warning"
          title={`จะแก้ ${entries.length} รายการของเดือนนี้`}
          description="เหตุผลจะถูกส่งถึงอาจารย์ผู้สอนและทีเอ พร้อมบันทึกไว้ในประวัติการแก้ไขถาวร"
        />

        <ul className="max-h-32 space-y-0.5 overflow-auto text-xs text-muted">
          {entries.map(([id, p]) => {
            const d = byId.get(id);
            if (!d) return null;
            return (
              <li key={id}>
                {fullDate(d.work_date)} {d.start_time.slice(0, 5)}–{d.end_time.slice(0, 5)} →{" "}
                {p.action === "delete"
                  ? <span className="text-red-600">ลบ</span>
                  : `${p.start_time}–${p.end_time} (${p.hours.toFixed(2)} ชม.)`}
              </li>
            );
          })}
        </ul>

        <div>
          <label className="mb-1 block text-xs text-ink-2">เหตุผล (อย่างน้อย 10 ตัวอักษร)</label>
          <TextArea
            className="w-full"
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="เช่น ตารางสอนเปลี่ยนกลางเทอม เวลาที่ลงไว้ไม่ตรงกับคาบจริง"
          />
          {!reasonOK && reason.length > 0 && (
            <p className="mt-1 text-xs text-red-600">ยังสั้นเกินไป ({reason.trim().length}/10)</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-ink-2">แนบหลักฐาน (ไม่เกิน 3 รูป)</label>
          <div className="flex flex-wrap items-center gap-2">
            {files.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded border border-[var(--hairline)] px-2 py-0.5 text-xs">
                {f.name.slice(0, 18)}
                <button type="button" className="cursor-pointer" onClick={() => setFiles(v => v.filter((_, j) => j !== i))}>
                  <X size={11} />
                </button>
              </span>
            ))}
            {files.length < 3 && (
              <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-[var(--hairline)] px-2 py-0.5 text-xs hover:border-[var(--brand)]">
                <ImagePlus size={12} /> เพิ่มรูป
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) setFiles(v => [...v, f].slice(0, 3));
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        </div>

        <label className="block text-xs text-ink-2">
          รหัสผ่านของคุณ
          <TextInput
            className="mt-1 w-full"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="ยืนยันว่าเป็นคุณจริง"
          />
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onPress={onClose}>ยกเลิก</Button>
          <Button
            variant="primary"
            size="sm"
            isDisabled={busy || !reasonOK || password === ""}
            onPress={submit}
          >
            {busy ? <Spinner size="sm" /> : <ShieldCheck size={14} />} บันทึกการแก้ไข
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* Re-exported so the grid can build a target without importing the type twice. */
export { linkKey };
