"use client";
import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { CheckCircle2, Undo2, Check, BellRing, CalendarDays } from "lucide-react";
import { api, errMessage } from "../../../lib/api";
import { useTerm, useTermKey } from "../../TermContext";
import { notify } from "../../../lib/notify";
import {
  Button, Spinner, ConfirmDialog, TextArea,
} from "../../../components/ui";
import { TimetableModal } from "../../../components/TimetableModal";
import { WorklogReviewModal, type ReviewTarget } from "./WorklogReviewModal";

/**
 * TA × month review grid for one course.
 *
 * The two real dimensions of this job are "who" and "which month", and the flat
 * queue expressed neither: a TA's five months were five separate rows, so
 * "is September late for everyone or just for him?" — the question that actually
 * decides what to do — could not be answered without reading the whole list.
 *
 * A grid answers it by shape. Every cell is one (TA, month), which is exactly
 * the unit staff-review acts on, so the cell can also BE the control: hours,
 * status, and its own ผ่าน / ตีกลับ, with no drawer in between for the common
 * case and one click to the day rows when the number looks wrong.
 */

interface ReviewRow {
  period_id: string;
  period_label: string;
  year_month: string;
  ta_id: string;
  ta_name: string;
  teaching_course_id: string;
  course_code: string;
  status: string;
  approved_hours: number;
  approved_baht: number;
  open_rows: number;
  waiting_ta: number;
  waiting_lecturer: number;
  row_count: number;
  manual_count: number;
}

const shortMonth = (label: string) => {
  const m = label.replace(/\s*\d{4}$/, "").trim();
  const map: Record<string, string> = {
    มกราคม: "ม.ค.", กุมภาพันธ์: "ก.พ.", มีนาคม: "มี.ค.", เมษายน: "เม.ย.",
    พฤษภาคม: "พ.ค.", มิถุนายน: "มิ.ย.", กรกฎาคม: "ก.ค.", สิงหาคม: "ส.ค.",
    กันยายน: "ก.ย.", ตุลาคม: "ต.ค.", พฤศจิกายน: "พ.ย.", ธันวาคม: "ธ.ค.",
  };
  return map[m] ?? m;
};

export function ReviewGrid({ tcId, onChanged }: { tcId: string; onChanged?: () => void }) {
  const { termId } = useTerm();
  const queueKey = useTermKey("/submission-periods/review-queue");
  const { data, isLoading } = useSWR<{ items: ReviewRow[] }>(queueKey);
  const rows = useMemo(
    () => (data?.items ?? []).filter(r => r.teaching_course_id === tcId),
    [data, tcId],
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [sendBack, setSendBack] = useState<ReviewRow | null>(null);
  const [reason, setReason] = useState("");
  const [detailFor, setDetailFor] = useState<ReviewRow | null>(null);
  const [remindOpen, setRemindOpen] = useState(false);
  const [timetableFor, setTimetableFor] = useState<{ id: string; name: string } | null>(null);

  const cellKey = (r: ReviewRow) => `${r.period_id}:${r.ta_id}`;

  // Columns are the months this course actually has work in — a term's full
  // period list would print empty columns for months the course never ran.
  const months = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.year_month, r.period_label);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const tas = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.ta_id, r.ta_name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "th"));
  }, [rows]);

  const cell = (taId: string, ym: string) =>
    rows.find(r => r.ta_id === taId && r.year_month === ym);

  const readyRows = rows.filter(r => r.status === "pending" && r.open_rows === 0);
  // Rows genuinely sitting in the lecturer's approval queue. The nudge lives
  // here now: the payout list dropped its "waiting on someone else" section, and
  // this is the screen that can already name which months are held and by whom.
  const waitingLecturer = rows.reduce((n, r) => n + r.waiting_lecturer, 0);

  const revalidate = async () => {
    if (queueKey) await mutate(queueKey);
    onChanged?.();
  };

  async function approve(list: ReviewRow[]) {
    if (list.length === 0) return;
    setBusy(cellKey(list[0]));
    let done = 0;
    try {
      for (const r of list) {
        await api.post(
          `/submission-periods/${r.period_id}/courses/${r.teaching_course_id}/tas/${r.ta_id}/staff-review`,
          { comment: "" },
        );
        done++;
      }
      notify.success(`ตรวจผ่าน ${done} รายการ`);
    } catch (e) {
      notify.error(done > 0 ? `ผ่านไป ${done} รายการแล้วหยุด — ${errMessage(e)}` : e);
    } finally {
      setBusy(null);
      await revalidate();
    }
  }

  async function confirmRemind() {
    setBusy("remind");
    try {
      await api.post(`/submission-periods/courses/${tcId}/remind-lecturer`, {});
      notify.success("แจ้งเตือนอาจารย์แล้ว");
      setRemindOpen(false);
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function confirmSendBack() {
    if (!sendBack) return;
    const r = sendBack;
    setBusy(cellKey(r));
    try {
      await api.post(
        `/submission-periods/${r.period_id}/courses/${r.teaching_course_id}/tas/${r.ta_id}/send-back`,
        { to_status: "pending", reason },
      );
      notify.success("ตีกลับเรียบร้อย");
      setSendBack(null);
      setReason("");
      await revalidate();
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return <div className="flex justify-center py-8"><Spinner /></div>;
  }
  if (rows.length === 0) {
    return (
      <p className="py-4 text-sm text-muted">
        ไม่มีเดือนที่รอตรวจในวิชานี้ — ทุกเดือนผ่านการตรวจแล้ว หรือยังไม่มีบันทึกเวลาที่อาจารย์อนุมัติ
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        {/* table-fixed with explicit widths: left to itself the browser sized
            columns by content, so a month whose cells held short text (a blocked
            month with no buttons) came out half the width of its neighbours and
            the row read as ragged. min-w scrolls rather than crushing the cells
            when a course has many months. */}
        <table className="w-full table-fixed text-xs" style={{ minWidth: 160 + months.length * 132 }}>
          <thead>
            <tr className="text-muted">
              <th className="px-2 py-1.5 text-left font-normal" style={{ width: 160 }}>TA \ เดือน</th>
              {months.map(([ym, label]) => (
                <th key={ym} className="px-2 py-1.5 text-center font-normal">{shortMonth(label)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tas.map(([taId, taName]) => (
              <tr key={taId} className="border-t border-[var(--hairline)]">
                <td className="px-2 py-2 align-top">
                  <div className="text-sm font-medium">{taName}</div>
                  {/* The weekly view is the only place the hours in this row
                      can be checked against something: the TA's own classes and
                      their duty slots, side by side. A modal rather than a new
                      tab — the officer is mid-review, and the answer they want
                      is a glance, not a destination. */}
                  {termId && (
                    <button
                      type="button"
                      onClick={() => setTimetableFor({ id: taId, name: taName })}
                      className="mt-1 inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--hairline)] px-1.5 py-0.5 text-[11px] text-muted hover:border-[var(--brand)] hover:text-[var(--brand)]"
                    >
                      <CalendarDays size={11} /> ตารางเรียน/ทำงาน
                    </button>
                  )}
                </td>
                {months.map(([ym]) => {
                  const r = cell(taId, ym);
                  if (!r) {
                    return (
                      <td key={ym} className="px-1.5 py-2 text-center text-muted">—</td>
                    );
                  }
                  return (
                    <td key={ym} className="px-1.5 py-1.5 align-top">
                      <Cell
                        r={r}
                        busy={busy === cellKey(r)}
                        disabled={busy !== null}
                        onOpen={() => setDetailFor(r)}
                        onApprove={() => approve([r])}
                        onSendBack={() => { setSendBack(r); setReason(""); }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(readyRows.length > 0 || waitingLecturer > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] pt-3">
          <p className="flex-1 text-xs text-muted">
            {readyRows.length > 0
              ? "ตรวจครบทุกเดือนแล้ว แถบส่งออกด้านล่างจะเปิดให้ดาวน์โหลดทันที"
              : `มี ${waitingLecturer} รายการรออาจารย์อนุมัติ — ตรวจต่อไม่ได้จนกว่าจะอนุมัติครบ`}
          </p>
          {waitingLecturer > 0 && (
            <Button variant="secondary" size="sm" isDisabled={busy !== null} onPress={() => setRemindOpen(true)}>
              <BellRing size={14} /> เตือนอาจารย์
            </Button>
          )}
          {readyRows.length > 0 && (
            <Button size="sm" isDisabled={busy !== null} onPress={() => approve(readyRows)}>
              <CheckCircle2 size={14} /> ผ่านทั้งวิชา ({readyRows.length} รายการ)
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={remindOpen}
        onClose={() => setRemindOpen(false)}
        title="แจ้งเตือนอาจารย์"
        icon={<BellRing size={18} />}
        isPending={busy === "remind"}
        message={
          <p className="text-sm text-muted">
            ส่งการแจ้งเตือนถึงอาจารย์ผู้สอนวิชานี้ว่ามีบันทึกเวลา {waitingLecturer} รายการรออนุมัติอยู่ —
            ส่งได้วันละครั้งต่อวิชา
          </p>
        }
        confirmLabel="ส่งแจ้งเตือน"
        onConfirm={() => void confirmRemind()}
      />

      <WorklogReviewModal
        open={detailFor !== null}
        onClose={() => setDetailFor(null)}
        tcId={tcId}
        courseCode={rows[0]?.course_code ?? ""}
        termId={termId ?? null}
        target={detailFor ? toTarget(detailFor) : null}
        // Every month of the SAME TA, so the stepper walks that person's term
        // rather than jumping between people.
        months={
          detailFor
            ? rows.filter(r => r.ta_id === detailFor.ta_id)
                  .sort((a, b) => a.year_month.localeCompare(b.year_month))
                  .map(toTarget)
            : []
        }
        onJump={t => setDetailFor(rows.find(r => r.period_id === t.periodId && r.ta_id === t.taId) ?? null)}
        onChanged={revalidate}
      />

      <TimetableModal
        open={timetableFor !== null}
        onClose={() => setTimetableFor(null)}
        termId={termId ?? null}
        taId={timetableFor?.id ?? null}
        taName={timetableFor?.name}
      />

      <ConfirmDialog
        open={!!sendBack}
        onClose={() => setSendBack(null)}
        title="ตีกลับให้แก้ไข"
        icon={<Undo2 size={18} />}
        danger
        isPending={busy !== null && sendBack !== null && busy === cellKey(sendBack)}
        message={
          <div className="space-y-2">
            <p className="text-sm text-muted">
              {sendBack?.ta_name} · {sendBack?.period_label} — รายการจะกลับไปให้แก้ไข
              และจะส่งออกเอกสารไม่ได้จนกว่าจะตรวจผ่านอีกครั้ง
            </p>
            <TextArea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="เหตุผล เช่น ชั่วโมงวันที่ 12 ไม่ตรงกับตารางสอน"
              rows={3}
            />
            {reason.trim() === "" && (
              <p className="text-xs text-red-600">ต้องระบุเหตุผล เพื่อให้ TA รู้ว่าต้องแก้อะไร</p>
            )}
          </div>
        }
        confirmLabel="ตีกลับ"
        onConfirm={() => { if (reason.trim() !== "") void confirmSendBack(); }}
      />
    </>
  );
}

/**
 * One (TA, month).
 *
 * Rebuilt 31/07/2026 because the affordance was inverted: the HOURS were the
 * button that opened the day-level detail, styled as plain text, while ผ่าน and
 * ตีกลับ — the two actions that move money — were the only underlined things in
 * the cell. Officers read the cell as "two links", never found the detail view,
 * and signed off totals without seeing a single row behind them.
 *
 * So the cell now says three things, in the order they are needed:
 *
 *   1. the number;
 *   2. WHETHER IT IS WORTH OPENING — "ทีเอเพิ่มเอง 2" is the only content on
 *      this screen that selects work for a human, because a generated row is a
 *      copy of times the lecturer already entered and holds nothing a second
 *      person can check. A month marked "ระบบสร้างล้วน" can be signed off
 *      without reading it, and saying so is what makes the click meaningful
 *      rather than merely possible;
 *   3. the actions — "ดู" widest of the three, because it is the safe
 *      one and the one that should happen first; approve and send-back as small
 *      icons, reachable but no longer competing for the eye.
 *
 * A cell with nothing to sign off gets no buttons at all.
 */
function Cell({
  r, busy, disabled, onOpen, onApprove, onSendBack,
}: {
  r: ReviewRow; busy: boolean; disabled: boolean;
  onOpen: () => void; onApprove: () => void; onSendBack: () => void;
}) {
  const reviewed = r.status !== "pending";
  const blocked = !reviewed && r.open_rows > 0;
  const tone = reviewed
    ? "border-emerald-200 bg-emerald-50"
    : blocked
      ? "border-amber-200 bg-amber-50"
      : "border-[var(--hairline)] bg-surface-secondary";
  // Something to read exists whenever hours have been approved — even in a month
  // still open elsewhere, the approved part is real and inspectable.
  const hasContent = r.row_count > 0;

  return (
    <div className={"rounded-lg border px-2 py-1.5 text-center " + tone}>
      <div className={"tabular text-sm font-medium " + (reviewed ? "text-emerald-900" : blocked ? "text-amber-900" : "")}>
        {r.approved_hours.toFixed(1)} ชม.
      </div>

      <div className="mt-1 text-[11px] leading-tight">
        {blocked ? (
          <span className="text-amber-800">
            {r.waiting_lecturer > 0 ? `รออาจารย์อนุมัติ ${r.waiting_lecturer}` : ""}
            {r.waiting_lecturer > 0 && r.waiting_ta > 0 ? " · " : ""}
            {r.waiting_ta > 0 ? `TA ยังไม่ส่ง ${r.waiting_ta}` : ""}
          </span>
        ) : reviewed ? (
          <span className="text-emerald-800">ตรวจแล้ว · {r.row_count} รายการ</span>
        ) : r.manual_count > 0 ? (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">
            ทีเอเพิ่มเอง {r.manual_count}
          </span>
        ) : (
          <span className="text-muted">{r.row_count} รายการ · ระบบสร้างล้วน</span>
        )}
      </div>

      {busy ? (
        <div className="mt-1.5 flex justify-center"><Spinner size="sm" /></div>
      ) : (
        <div className="mt-1.5 flex items-center gap-1">
          {/* Nothing stands in for an absent button. A cell with no approved
              rows already says so on the line above ("รออาจารย์อนุมัติ 10"), and
              repeating it underneath filled the emptiest cells with the most
              text. */}
          {hasContent && (
            <button
              type="button"
              onClick={onOpen}
              className="flex-1 whitespace-nowrap rounded-md border border-[var(--hairline)] bg-surface px-1 py-0.5 text-[11px] hover:border-[var(--brand)] hover:text-[var(--brand)]"
            >
              ดู
            </button>
          )}
          {!reviewed && !blocked && (
            <>
              <button
                type="button"
                disabled={disabled}
                onClick={onApprove}
                title="ผ่าน"
                aria-label="ผ่าน"
                className="rounded-md border border-[var(--hairline)] bg-surface px-1.5 py-0.5 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-40"
              >
                <Check size={12} />
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={onSendBack}
                title="ตีกลับ"
                aria-label="ตีกลับ"
                className="rounded-md border border-[var(--hairline)] bg-surface px-1.5 py-0.5 hover:border-red-400 hover:text-red-700 disabled:opacity-40"
              >
                <Undo2 size={12} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Queue row → what the reviewer modal needs. Kept next to the grid because the
 *  grid is the only thing that has both shapes in scope. */
function toTarget(r: ReviewRow): ReviewTarget {
  return {
    periodId: r.period_id,
    periodLabel: r.period_label,
    // work_logs.work_date is Gregorian; year_month here is the BE label the
    // period carries, so the month number is taken from it and the year from
    // the date the rows actually use.
    yearMonth: r.year_month,
    taId: r.ta_id,
    taName: r.ta_name,
    status: r.status,
    openRows: r.open_rows,
  };
}
