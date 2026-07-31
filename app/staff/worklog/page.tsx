"use client";
import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardCheck,
  AlertTriangle,
  Undo2,
  PencilLine,
  Clock,
  Wallet,
  ChevronDown,
} from "lucide-react";
import { api, errMessage } from "../../lib/api";
import { useTermKey } from "../TermContext";
import { notify } from "../../lib/notify";
import {
  PageHeader, Panel, Button, EmptyState, Chip, Alert,
  ConfirmDialog, TextArea, Spinner, Modal, type ChipTone,
} from "../../components/ui";

/**
 * Staff step 3 — ตรวจสอบเบิกจ่ายค่าตอบแทน.
 *
 * The step the 24/07/2026 meeting added between the lecturer's daily approval
 * and the payout export. Until now this route was a redirect to /staff/exports:
 * the review happened, but outside the system, so nothing recorded who checked
 * a month and the export accepted anything a lecturer had approved.
 *
 * One row = one TA's month on one course, matching the granularity the payout
 * itself uses.
 */

interface ReviewRow {
  period_id: string;
  period_label: string;
  year_month: string;
  ta_id: string;
  ta_name: string;
  teaching_course_id: string;
  course_code: string;
  course_name_th: string;
  status: string;
  approved_hours: number;
  approved_baht: number;
  /** Rows still with the TA or lecturer — the month is not settled yet. */
  open_rows: number;
}

const STATUS_META: Record<string, { tone: ChipTone; label: string }> = {
  pending: { tone: "warn", label: "รอตรวจสอบ" },
  staff_reviewed: { tone: "success", label: "ตรวจสอบแล้ว" },
  exported: { tone: "brand", label: "ส่งออกแล้ว" },
  finance_sent: { tone: "brand", label: "ส่งการเงินแล้ว" },
};

const baht = (n: number) =>
  `฿${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function StaffWorklogReviewPage() {
  // Term comes from the shell's switcher — see TermContext.
  const queueKey = useTermKey("/submission-periods/review-queue");
  const { data, isLoading } = useSWR<{ items: ReviewRow[]; awaiting_appointment?: number }>(queueKey);
  const rows = useMemo(() => data?.items ?? [], [data]);
  // Months of work that are NOT in the queue because their appointment order has
  // not been printed. The queue is gated on that order — the work is not payable
  // until the TA is officially appointed — so an empty screen has two very
  // different meanings and this number is what separates them.
  const awaitingAppointment = data?.awaiting_appointment ?? 0;

  const [busy, setBusy] = useState<string | null>(null);
  const [sendBack, setSendBack] = useState<ReviewRow | null>(null);
  const [reason, setReason] = useState("");

  const waiting = rows.filter(r => r.status === "pending");
  const blocked = waiting.filter(r => r.open_rows > 0);
  const ready = waiting.filter(r => r.open_rows === 0);

  // Course → TA → months. The queue used to be one flat list of (month, TA,
  // course) rows, so a single TA on a single course already took five lines and
  // a term with a hundred TAs was a scroll with no landmarks. Everything staff
  // act on is per course — the budget, the appointment order, the export — so
  // that is the outer grouping, and a TA's months collapse onto one line inside
  // it.
  const grouped = useMemo(() => groupForReview(ready), [ready]);

  // Which month detail is open. null = none; the drawer is the only place the
  // rows behind a total can be seen.
  const [detailFor, setDetailFor] = useState<ReviewRow | null>(null);

  const rowKey = (r: ReviewRow) => `${r.period_id}:${r.ta_id}:${r.teaching_course_id}`;

  async function approve(r: ReviewRow) {
    setBusy(rowKey(r));
    try {
      await api.post(
        `/submission-periods/${r.period_id}/courses/${r.teaching_course_id}/tas/${r.ta_id}/staff-review`,
        { comment: "" },
      );
      notify.success(`ตรวจสอบ ${r.ta_name} · ${r.period_label} เรียบร้อย`);
      if (queueKey) await mutate(queueKey);
    } catch (e) {
      notify.error(e);
    } finally {
      setBusy(null);
    }
  }

  // Approve every month of one TA (or one course) in sequence. There is no bulk
  // endpoint, and inventing one would need its own transaction semantics; the
  // months are few (five at most per TA) and each keeps its own audit entry,
  // which is what the finance office reads back. Failures stop the run rather
  // than pressing on, so a budget refusal on month 2 does not silently skip to
  // month 3.
  async function approveMany(list: ReviewRow[]) {
    if (list.length === 0) return;
    setBusy(rowKey(list[0]));
    let done = 0;
    try {
      for (const r of list) {
        await api.post(
          `/submission-periods/${r.period_id}/courses/${r.teaching_course_id}/tas/${r.ta_id}/staff-review`,
          { comment: "" },
        );
        done++;
      }
      notify.success(`ตรวจสอบผ่าน ${done} รายการ`);
    } catch (e) {
      notify.error(done > 0 ? `ผ่านไป ${done} รายการแล้วหยุดที่รายการถัดไป — ${errMessage(e)}` : e);
    } finally {
      setBusy(null);
      if (queueKey) await mutate(queueKey);
    }
  }

  async function confirmSendBack() {
    if (!sendBack) return;
    const r = sendBack;
    setBusy(rowKey(r));
    try {
      await api.post(
        `/submission-periods/${r.period_id}/courses/${r.teaching_course_id}/tas/${r.ta_id}/send-back`,
        { to_status: "pending", reason },
      );
      notify.success("ตีกลับเรียบร้อย");
      setSendBack(null);
      setReason("");
      if (queueKey) await mutate(queueKey);
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="ตรวจสอบเบิกจ่ายค่าตอบแทน"
        description="ขั้นที่ 3 — ตรวจชั่วโมงและยอดเงินที่อาจารย์อนุมัติแล้ว ก่อนส่งออกเอกสารเบิกจ่าย"
      />

      {/* The export step refuses anything that has not passed through here, so
          say that up front rather than letting staff discover it at step 4. */}
      <div className="mb-4">
        <Alert
          status="accent"
          icon={<ClipboardCheck size={16} />}
          title="รายการที่ยังไม่ผ่านขั้นนี้ จะส่งออกเอกสารไม่ได้"
          description="ตรวจแล้วกด “ผ่าน” เพื่อปล่อยให้ขั้นที่ 4 ดาวน์โหลดได้ — หากตัวเลขไม่ถูกต้อง ให้แก้ที่หน้าวิชา หรือตีกลับให้ TA แก้"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-16 justify-center text-sm text-muted">
          <Spinner size="sm" /> กำลังโหลด…
        </div>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<ClipboardCheck size={24} />}
            title="ยังไม่มีรายการให้ตรวจสอบ"
            description={awaitingAppointment > 0
              ? `มีงาน ${awaitingAppointment} รายการที่รออยู่ แต่ยังไม่ได้พิมพ์คำสั่งแต่งตั้งทีเอ — พิมพ์ที่เมนู “ส่งออกเอกสาร” แท็บ “ใบแต่งตั้งทีเอ (คำสั่ง)” แล้วรายการจะขึ้นที่นี่`
              : "เมื่ออาจารย์อนุมัติบันทึกเวลาของ TA แล้ว รายการจะขึ้นที่นี่"}
          />
        </Panel>
      ) : (
        <>
          {blocked.length > 0 && (
            <Panel
              title="ยังตรวจไม่ได้"
              description="เดือนเหล่านี้ยังมีรายการที่ TA หรืออาจารย์ยังไม่ปิด — ตัวเลขยังเปลี่ยนได้"
              className="mb-4"
              padded={false}
            >
              <ul className="divide-y divide-[var(--hairline)]">
                {blocked.map(r => (
                  <li key={rowKey(r)} className="p-4">
                    <RowHead r={r} />
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                      <AlertTriangle size={12} />
                      เหลืออีก {r.open_rows} รายการที่ยังไม่อนุมัติ
                      <Link
                        href={`/staff/exports/${r.teaching_course_id}`}
                        className="ml-1 underline underline-offset-2"
                      >
                        เปิดหน้าวิชาเพื่อดู
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            title={`รอตรวจสอบ (${ready.length})`}
            description="จัดกลุ่มตามรายวิชา — กดที่เดือนเพื่อดูรายการรายวันที่กำลังอนุมัติ"
            className="mb-4"
            padded={false}
          >
            {ready.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<CheckCircle2 size={22} />}
                  title="ไม่มีรายการรอตรวจ"
                  description="ตรวจครบทุกเดือนที่พร้อมแล้ว"
                />
              </div>
            ) : (
              <div className="divide-y divide-[var(--hairline)]">
                {grouped.map(course => (
                  <CourseGroup
                    key={course.teachingCourseId}
                    group={course}
                    busy={busy}
                    rowKey={rowKey}
                    onOpen={setDetailFor}
                    onApprove={approve}
                    onSendBack={r => { setSendBack(r); setReason(""); }}
                    onApproveMany={approveMany}
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="ตรวจแล้ว"
            description="ปล่อยให้ขั้นที่ 4 ส่งออกได้แล้ว"
            padded={false}
          >
            {rows.filter(r => r.status !== "pending").length === 0 ? (
              <div className="p-6">
                <EmptyState icon={<CheckCircle2 size={22} />} title="ยังไม่มีรายการที่ตรวจแล้ว" />
              </div>
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {rows.filter(r => r.status !== "pending").map(r => (
                  <li key={rowKey(r)} className="p-4">
                    <RowHead r={r} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}

      <MonthDetailDrawer row={detailFor} onClose={() => setDetailFor(null)} />

      <ConfirmDialog
        open={!!sendBack}
        onClose={() => setSendBack(null)}
        title="ตีกลับให้แก้ไข"
        icon={<Undo2 size={18} />}
        danger
        isPending={busy !== null && sendBack !== null && busy === rowKey(sendBack)}
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

/* -------------------------------------------------------------------------- */
/* MonthDetailDrawer — the rows behind one total                              */
/* -------------------------------------------------------------------------- */

interface ReviewDay {
  id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  activity: string;
  note?: string;
  room?: string;
  sec_no: string;
  /** 'auto' = produced by the generator from the section timetable; 'manual' =
   *  typed by the TA. See migration 0057. */
  source: "auto" | "manual";
  on_timetable: boolean;
}
interface ReviewSlot {
  sec_no: string; kind: string; day_of_week: number;
  start_time: string; end_time: string; room?: string;
}
interface MonthDetail {
  days: ReviewDay[];
  slots: ReviewSlot[];
  auto_hours: number; manual_hours: number;
  auto_count: number; manual_count: number;
  days_worked: number;
}

const ACTIVITY_LABEL: Record<string, string> = {
  lecture: "บรรยาย", lab: "ปฏิบัติการ", review: "ตรวจงาน",
  makeup: "ชดเชย", other: "อื่นๆ",
};
const DOW_LABEL = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/**
 * What "ผ่าน" is actually approving.
 *
 * The queue shows a month's total and nothing else, and the only link out led to
 * the whole course workspace — so in practice the total was approved without
 * anyone seeing the days inside it. This drawer is the missing middle.
 *
 * Rows are split by origin rather than listed as one table: a generated row is a
 * copy of class times the lecturer entered and there is nothing in it a second
 * person can verify, while a hand-typed row is a claim with no other source.
 * Putting the hand-typed ones first, and counting them in the header, is the
 * whole of the "focus" this screen can honestly offer.
 */
function MonthDetailDrawer({ row, onClose }: { row: ReviewRow | null; onClose: () => void }) {
  const key = row
    ? `/submission-periods/${row.period_id}/courses/${row.teaching_course_id}/tas/${row.ta_id}/worklog`
    : null;
  const { data, isLoading } = useSWR<MonthDetail>(key);

  const manual = (data?.days ?? []).filter(d => d.source === "manual");
  const auto = (data?.days ?? []).filter(d => d.source === "auto");

  return (
    <Modal
      open={row !== null}
      onClose={onClose}
      size="2xl"
      title={row ? `${row.ta_name} · ${row.course_code} · ${row.period_label}` : ""}
      icon={<ClipboardCheck size={18} />}
    >
      {isLoading || !data ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span>รวม <b className="tabular">{row?.approved_hours.toFixed(1)}</b> ชม.</span>
            <span className="text-muted">ลง {data.days_worked} วัน</span>
            <span className="text-muted">
              ระบบสร้าง {data.auto_hours.toFixed(1)} ชม. ({data.auto_count} รายการ)
            </span>
            <span className={data.manual_count > 0 ? "text-amber-700" : "text-muted"}>
              ทีเอเพิ่มเอง {data.manual_hours.toFixed(1)} ชม. ({data.manual_count} รายการ)
            </span>
          </div>

          {/* The section's weekly timetable — the thing the rows are read
              against. Without it "13:00–15:00 ปฏิบัติการ" is just a number. */}
          {data.slots.length > 0 && (
            <div className="rounded-lg border border-[var(--hairline)] p-3">
              <div className="mb-1.5 text-xs font-medium">ตารางคาบของ section ที่รับผิดชอบ</div>
              <div className="flex flex-wrap gap-1.5">
                {data.slots.map((sl, i) => (
                  <span key={i} className="rounded border border-[var(--hairline)] px-2 py-0.5 text-xs text-muted">
                    sec {sl.sec_no} · {DOW_LABEL[sl.day_of_week]} {sl.start_time.slice(0, 5)}–{sl.end_time.slice(0, 5)} ·{" "}
                    {ACTIVITY_LABEL[sl.kind] ?? sl.kind}
                  </span>
                ))}
              </div>
            </div>
          )}

          <DayTable
            title={`ทีเอเพิ่มเอง (${manual.length})`}
            hint="ไม่ได้มาจากตารางคาบ — ต้องดูว่าสมเหตุสมผลไหม"
            days={manual}
            tone="warn"
            emptyText="ไม่มี — ทุกรายการมาจากตารางคาบทั้งหมด"
          />
          <DayTable
            title={`ระบบสร้างจากตารางคาบ (${auto.length})`}
            hint="ตรงกับเวลาเรียนที่อาจารย์กรอกไว้"
            days={auto}
            tone="muted"
            emptyText="ไม่มี"
          />
        </div>
      )}
    </Modal>
  );
}

function DayTable({
  title, hint, days, tone, emptyText,
}: {
  title: string; hint: string; days: ReviewDay[];
  tone: "warn" | "muted"; emptyText: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] overflow-hidden">
      <div className={"px-3 py-2 " + (tone === "warn" && days.length > 0 ? "bg-amber-50" : "bg-surface-secondary")}>
        <div className={"text-xs font-medium " + (tone === "warn" && days.length > 0 ? "text-amber-800" : "")}>
          {title}
        </div>
        <div className="text-xs text-muted">{hint}</div>
      </div>
      {days.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted">{emptyText}</div>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {days.map(d => (
              <tr key={d.id} className="border-t border-[var(--hairline)]">
                <td className="px-3 py-1.5 whitespace-nowrap text-muted">{d.work_date}</td>
                <td className="px-2 py-1.5 whitespace-nowrap tabular">
                  {d.start_time.slice(0, 5)}–{d.end_time.slice(0, 5)}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap tabular">{d.hours.toFixed(1)} ชม.</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{ACTIVITY_LABEL[d.activity] ?? d.activity}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-muted">sec {d.sec_no}</td>
                <td className="px-3 py-1.5 text-muted">{d.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Grouping — course → TA → months                                            */
/* -------------------------------------------------------------------------- */

interface TAGroup {
  taId: string;
  taName: string;
  months: ReviewRow[];
  hours: number;
  baht: number;
}
interface CourseGroupData {
  teachingCourseId: string;
  courseCode: string;
  courseNameTH: string;
  tas: TAGroup[];
  monthCount: number;
  hours: number;
  baht: number;
}

/**
 * Fold the flat queue into course → TA → months.
 *
 * The queue's natural unit is (month, TA, course) because that is what gets
 * approved, but it is a terrible unit to READ: one TA on one course is already
 * five near-identical lines, and everything a staff member does around the
 * review — budget, appointment order, export — is per course. So the course is
 * the outer group and a TA collapses to one line with their months inside.
 */
function groupForReview(rows: ReviewRow[]): CourseGroupData[] {
  const byCourse = new Map<string, CourseGroupData>();
  for (const r of rows) {
    let c = byCourse.get(r.teaching_course_id);
    if (!c) {
      c = {
        teachingCourseId: r.teaching_course_id,
        courseCode: r.course_code,
        courseNameTH: r.course_name_th,
        tas: [], monthCount: 0, hours: 0, baht: 0,
      };
      byCourse.set(r.teaching_course_id, c);
    }
    let t = c.tas.find(x => x.taId === r.ta_id);
    if (!t) {
      t = { taId: r.ta_id, taName: r.ta_name, months: [], hours: 0, baht: 0 };
      c.tas.push(t);
    }
    t.months.push(r);
    t.hours += r.approved_hours;
    t.baht += r.approved_baht;
    c.monthCount++;
    c.hours += r.approved_hours;
    c.baht += r.approved_baht;
  }
  const out = [...byCourse.values()];
  for (const c of out) {
    c.tas.sort((a, b) => a.taName.localeCompare(b.taName, "th"));
    for (const t of c.tas) t.months.sort((a, b) => a.year_month.localeCompare(b.year_month));
  }
  out.sort((a, b) => a.courseCode.localeCompare(b.courseCode));
  return out;
}

const baht2 = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function CourseGroup({
  group, busy, rowKey, onOpen, onApprove, onSendBack, onApproveMany,
}: {
  group: CourseGroupData;
  busy: string | null;
  rowKey: (r: ReviewRow) => string;
  onOpen: (r: ReviewRow) => void;
  onApprove: (r: ReviewRow) => void;
  onSendBack: (r: ReviewRow) => void;
  onApproveMany: (rows: ReviewRow[]) => void;
}) {
  // Courses start open: a collapsed queue hides the work. It is the hundred
  // identical LINES that were the problem, not the presence of the courses.
  const [open, setOpen] = useState(true);
  const allRows = group.tas.flatMap(t => t.months);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 bg-surface-secondary px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            size={15}
            className={"shrink-0 text-muted transition-transform " + (open ? "" : "-rotate-90")}
          />
          <span className="truncate text-sm font-medium">{group.courseCode}</span>
          <span className="hidden truncate text-xs text-muted sm:inline">{group.courseNameTH}</span>
        </button>
        <span className="shrink-0 text-xs text-muted tabular">
          {group.tas.length} คน · {group.monthCount} เดือน-คน · {group.hours.toFixed(1)} ชม. · {baht2(group.baht)}
        </span>
        <Button size="sm" isDisabled={busy !== null} onPress={() => onApproveMany(allRows)}>
          <CheckCircle2 size={14} /> ผ่านทั้งวิชา ({group.monthCount})
        </Button>
      </div>

      {open && group.tas.map(ta => (
        <TARow
          key={ta.taId}
          ta={ta}
          busy={busy}
          rowKey={rowKey}
          onOpen={onOpen}
          onApprove={onApprove}
          onSendBack={onSendBack}
          onApproveMany={onApproveMany}
        />
      ))}
    </div>
  );
}

/** One TA on one course: a single line, with their months as chips inside it. */
function TARow({
  ta, busy, rowKey, onOpen, onApprove, onSendBack, onApproveMany,
}: {
  ta: TAGroup;
  busy: string | null;
  rowKey: (r: ReviewRow) => string;
  onOpen: (r: ReviewRow) => void;
  onApprove: (r: ReviewRow) => void;
  onSendBack: (r: ReviewRow) => void;
  onApproveMany: (rows: ReviewRow[]) => void;
}) {
  return (
    <div className="border-t border-[var(--hairline)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-[9rem] text-sm font-medium">{ta.taName}</span>

        {/* The months, as one compact strip. A month that reads oddly next to its
            neighbours is the cheapest signal on this screen, and it only works
            when they sit side by side. */}
        <div className="flex flex-1 flex-wrap gap-1.5">
          {ta.months.map(m => (
            <button
              key={rowKey(m)}
              type="button"
              onClick={() => onOpen(m)}
              className="rounded-lg border border-[var(--hairline)] px-2 py-1 text-xs hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]"
              title="ดูรายการรายวันของเดือนนี้"
            >
              <span className="text-muted">{m.period_label.replace(/\s*\d{4}$/, "")}</span>{" "}
              <span className="tabular font-medium">{m.approved_hours.toFixed(1)}</span>
              <span className="text-muted"> ชม.</span>
            </button>
          ))}
        </div>

        <span className="shrink-0 text-xs text-muted tabular">
          {ta.hours.toFixed(1)} ชม. · {baht2(ta.baht)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={busy !== null}
          onPress={() => onApproveMany(ta.months)}
        >
          ผ่าน {ta.months.length} เดือน
        </Button>
      </div>

      {/* Per-month actions stay reachable without opening anything: sending ONE
          month back is a normal outcome and should not need a detour. */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {ta.months.map(m => (
          <span key={rowKey(m)} className="inline-flex items-center gap-2 text-xs">
            <span className="text-muted">{m.period_label}</span>
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => onOpen(m)}
            >
              ดูรายวัน
            </button>
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => onSendBack(m)}
            >
              ตีกลับ
            </button>
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => onApprove(m)}
            >
              ผ่าน
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function RowHead({ r }: { r: ReviewRow }) {
  const meta = STATUS_META[r.status] ?? { tone: "neutral" as ChipTone, label: r.status };
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{r.ta_name}</span>
        <Chip tone="neutral">{r.course_code}</Chip>
        <Chip tone={meta.tone}>{meta.label}</Chip>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span>{r.period_label}</span>
        <span className="inline-flex items-center gap-1">
          <Clock size={12} /> {r.approved_hours.toFixed(1)} ชม.
        </span>
        <span className="inline-flex items-center gap-1">
          <Wallet size={12} /> {baht(r.approved_baht)}
        </span>
      </div>
    </>
  );
}
