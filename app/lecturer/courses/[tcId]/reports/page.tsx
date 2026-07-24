"use client";
import useSWR, { mutate } from "swr";
import { Fragment, use, useMemo, useState } from "react";
import { Accordion, type Key } from "@heroui/react";
import { Check, X, CircleAlert, Clock, ChevronDown, History } from "lucide-react";
import { api } from "../../../../lib/api";
import { notify } from "../../../../lib/notify";
import {
  PageHeader, Panel, Button, EmptyState, TextArea, FieldGroup, Alert, Spinner,
  StatusChip,
} from "../../../../components/ui";

interface Assignment {
  id: string;
  ta_name: string;
  course_code: string;
  teaching_course_id?: string;
  /** Optional worklog summary — shown when the API provides it. */
  total_hours?: number;
  period_label?: string;
}
interface Course { id: string; code: string; name_th: string; }

// ApprovalHistoryEntry matches /teaching-courses/:id/approval-history — one
// approve/reject action the current lecturer has performed on a TA's
// worklog batch within this course.
interface ApprovalHistoryEntry {
  id: number;
  at: string;                     // ISO timestamp
  action: "worklog.approve" | "worklog.reject";
  assignment_id: string;
  ta_name: string;
  sec_no: string;
  track: string;
  note?: string;                  // reject reason; empty for approvals
}

// WorkLog matches the /assignments/:id/worklog response shape. Kept local so
// this page doesn't reach into the TA-facing worklog page's private types.
interface WorkLog {
  id: string;
  assignment_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  activity: string;
  parent_kind?: "lecture" | "lab" | null;
  room?: string;
  note?: string;
  status: string;
}

const ACTIVITY_LABEL: Record<string, string> = {
  lecture: "บรรยาย",
  lab: "ปฏิบัติการ",
  review: "ตรวจงาน",
  makeup: "ชดเชย",
  other: "อื่น ๆ",
};
const PARENT_KIND_LABEL: Record<string, string> = {
  lecture: "คู่กับบรรยาย",
  lab: "คู่กับปฏิบัติการ",
};
const DOW_ABBR_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MONTH_TH_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
const MONTH_TH_LONG = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
function formatWorkDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return iso;
  return `${DOW_ABBR_TH[dt.getDay()]} ${d} ${MONTH_TH_SHORT[m - 1]} ${y + 543}`;
}
// monthKey / formatMonthTH mirror the TA page's monthly grouper so this
// lecturer view reads with the same "name > month > entries" hierarchy the
// TA sees when logging their hours.
function monthKey(iso: string): string {
  return (iso ?? "").slice(0, 7);
}
function formatMonthTH(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return key;
  return `${MONTH_TH_LONG[m - 1]} ${y + 543}`;
}

/** สัปดาห์เริ่มวันจันทร์ — คืนคีย์เป็นวันจันทร์ของสัปดาห์นั้น (YYYY-MM-DD) */
function weekStart(iso: string): string {
  const [y, m, d] = (iso ?? "").split("-").map(Number);
  if (!y || !m || !d) return iso ?? "";
  const dt = new Date(y, m - 1, d);
  const shift = (dt.getDay() + 6) % 7; // อา.=6, จ.=0
  dt.setDate(dt.getDate() - shift);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

interface WeekGroup { key: string; label: string; hours: number; items: WorkLog[] }

/** จัดรายการในเดือนหนึ่งเป็นสัปดาห์ — ใช้เป็นตัวคั่นสายตาเบา ๆ ในตาราง */
function groupByWeek(items: WorkLog[]): WeekGroup[] {
  const buckets = new Map<string, WorkLog[]>();
  for (const r of items) {
    const k = weekStart(r.work_date);
    const arr = buckets.get(k);
    if (arr) arr.push(r);
    else buckets.set(k, [r]);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, list]) => {
      const first = list[0]?.work_date ?? key;
      const last = list[list.length - 1]?.work_date ?? key;
      const dayOf = (iso: string) => Number(iso.split("-")[2]);
      const monthOf = (iso: string) => MONTH_TH_SHORT[Number(iso.split("-")[1]) - 1] ?? "";
      const label = first === last
        ? `สัปดาห์ ${dayOf(first)} ${monthOf(first)}`
        : `สัปดาห์ ${dayOf(first)}–${dayOf(last)} ${monthOf(last)}`;
      return {
        key,
        label,
        hours: list.reduce((s, i) => s + (i.hours || 0), 0),
        items: list,
      };
    });
}

const PENDING_KEY = "/reports/pending";

export default function ReportsPage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);

  const { data: course } = useSWR<Course>(`/teaching-courses/${tcId}`);
  // No longer swallow fetch errors to []: read SWR `error` and surface it.
  const { data: all, error, isLoading } = useSWR<Assignment[]>(PENDING_KEY);
  const historyKey = `/teaching-courses/${tcId}/approval-history`;
  const { data: history, isLoading: historyLoading } = useSWR<ApprovalHistoryEntry[]>(historyKey);

  const data = useMemo(
    () => (all ?? []).filter(a => a.teaching_course_id === tcId || a.course_code === course?.code),
    [all, tcId, course?.code],
  );

  // Accordion แทน Modal เดิม (ผู้ใช้ขอ) — คุม expanded เองเพื่อให้ยิง fetch
  // รายละเอียดเฉพาะ TA ที่กดเปิดจริง ๆ
  const [expanded, setExpanded] = useState<Set<Key>>(new Set());
  // key = `${assignmentId}|${YYYY-MM}` — ทุกการตัดสินผูกกับ "เดือน" เดียว
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  async function decideMonth(
    a: Assignment, ym: string, kind: "approve" | "reject", reason?: string,
  ) {
    setPendingKey(`${a.id}|${ym}`);
    try {
      await api.post(`/assignments/${a.id}/worklog/${kind}`,
        kind === "approve" ? { year_month: ym } : { reason, year_month: ym });
      notify.success(
        kind === "approve"
          ? `อนุมัติบันทึกเวลาเดือน${formatMonthTH(ym)} เรียบร้อยแล้ว`
          : `ส่งกลับให้ TA แก้ไขเดือน${formatMonthTH(ym)} แล้ว`,
      );
      await Promise.all([
        mutate(PENDING_KEY), mutate(historyKey), mutate(`/assignments/${a.id}/worklog`),
      ]);
    } catch (e) {
      notify.error(e);
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="อนุมัติรายงานบันทึกเวลา TA"
        description={course ? `${course.code} — ${course.name_th}` : "รายการที่ TA กดส่งขออนุมัติ"}
      />

      <Panel padded={false}>
        {error && all === undefined ? (
          <div className="p-4">
            <Alert
              status="danger"
              icon={<CircleAlert size={16} />}
              title="โหลดรายการรออนุมัติไม่สำเร็จ"
              description={(error as Error).message || "กรุณาลองใหม่อีกครั้ง"}
              action={
                <Button variant="secondary" size="sm" onPress={() => mutate(PENDING_KEY)}>
                  ลองใหม่
                </Button>
              }
            />
          </div>
        ) : isLoading && all === undefined ? (
          <div className="py-14 flex flex-col items-center justify-center gap-2 text-muted">
            <Spinner />
            <div className="text-xs">กำลังโหลดข้อมูล…</div>
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            title="ไม่มีรายการรออนุมัติ"
            description="เมื่อ TA ในวิชานี้ส่งบันทึกเวลา จะปรากฏที่นี่"
          />
        ) : (
          <div className="p-2">
            <Accordion
              allowsMultipleExpanded
              expandedKeys={expanded}
              onExpandedChange={setExpanded}
              className="w-full"
            >
              {data.map(a => (
                <Accordion.Item key={a.id} id={a.id}>
                  <Accordion.Heading>
                    <Accordion.Trigger>
                      <div className="flex flex-1 flex-wrap items-center gap-2 pr-2 text-left">
                        <span className="text-sm font-medium">{a.ta_name}</span>
                        <span className="text-xs text-muted">{a.course_code}</span>
                        {typeof a.total_hours === "number" && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted">
                            <Clock size={11} /> รอพิจารณา {a.total_hours} ชม.
                          </span>
                        )}
                        {a.period_label && (
                          <span className="text-xs text-muted">· {a.period_label}</span>
                        )}
                      </div>
                      <Accordion.Indicator>
                        <ChevronDown size={16} />
                      </Accordion.Indicator>
                    </Accordion.Trigger>
                  </Accordion.Heading>
                  <Accordion.Panel>
                    <Accordion.Body>
                      {expanded.has(a.id) && (
                        <WorklogMonths
                          assignment={a}
                          pendingKey={pendingKey}
                          onDecide={(ym, kind, reason) => decideMonth(a, ym, kind, reason)}
                        />
                      )}
                    </Accordion.Body>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          </div>
        )}
      </Panel>

      <div className="mt-6">
        <ApprovalHistoryPanel
          history={history}
          loading={historyLoading && history === undefined}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* รายละเอียดของ TA หนึ่งคน — แบ่งเป็นเดือน และตัดสินทีละเดือน                 */
/* -------------------------------------------------------------------------- */

function WorklogMonths({
  assignment, pendingKey, onDecide,
}: {
  assignment: Assignment;
  pendingKey: string | null;
  onDecide: (ym: string, kind: "approve" | "reject", reason?: string) => void;
}) {
  const { data: logs, isLoading } = useSWR<WorkLog[]>(`/assignments/${assignment.id}/worklog`);
  // เดือนที่กำลังกรอกเหตุผลส่งกลับ — ฟอร์มแทรกในเดือนนั้น ไม่เด้ง Modal ซ้อน
  const [rejectYm, setRejectYm] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const rows = useMemo(() => {
    const arr = [...(logs ?? [])];
    arr.sort((a, b) => {
      if (a.work_date !== b.work_date) return a.work_date.localeCompare(b.work_date);
      return (a.start_time ?? "").localeCompare(b.start_time ?? "");
    });
    return arr;
  }, [logs]);

  // แสดงทุกสถานะ (draft/submitted/approved) ให้เห็นภาพรวม แต่ปุ่มของเดือนไหน
  // จะมีผลกับแถว submitted ของเดือนนั้นเท่านั้น
  const months = useMemo(() => {
    const buckets = new Map<string, WorkLog[]>();
    for (const r of rows) {
      const k = monthKey(r.work_date);
      if (!k) continue;
      const arr = buckets.get(k);
      if (arr) arr.push(r);
      else buckets.set(k, [r]);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, items]) => {
        const submittedRows = items.filter(i => i.status === "submitted");
        return {
          key,
          weeks: groupByWeek(items),
          count: items.length,
          submittedHours: submittedRows.reduce((s, i) => s + (i.hours || 0), 0),
          submittedCount: submittedRows.length,
        };
      });
  }, [rows]);

  if (isLoading && !logs) {
    return (
      <div className="py-6 flex flex-col items-center gap-2 text-muted">
        <Spinner />
        <div className="text-xs">กำลังโหลดรายการ…</div>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title="ไม่มีรายการบันทึกเวลา"
        description="TA คนนี้ยังไม่ได้กรอกบันทึกเวลาใด ๆ"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {months.map(mo => {
        const busy = pendingKey === `${assignment.id}|${mo.key}`;
        const actionable = mo.submittedCount > 0;
        return (
          <div key={mo.key} className="overflow-hidden rounded-lg border border-(--hairline)">
            {/* หัวเดือน + ปุ่มตัดสินเฉพาะเดือนนั้น (ไม่ใช่อนุมัติทั้งก้อน) */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-secondary px-3 py-2">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="text-sm font-semibold">{formatMonthTH(mo.key)}</span>
                <span className="text-xs text-muted">
                  {mo.count} รายการ
                  {actionable ? ` · รอพิจารณา ${mo.submittedHours.toFixed(1)} ชม.` : ""}
                </span>
              </div>
              {actionable ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="danger-soft" size="sm" disabled={busy}
                    onClick={() => { setRejectYm(rejectYm === mo.key ? null : mo.key); setReason(""); }}
                  >
                    <X size={14} /> ไม่อนุมัติเดือนนี้
                  </Button>
                  <Button
                    variant="primary" size="sm" disabled={busy} isPending={busy}
                    onClick={() => onDecide(mo.key, "approve")}
                  >
                    <Check size={14} /> อนุมัติเดือนนี้
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-muted">ไม่มีรายการรอพิจารณา</span>
              )}
            </div>

            {rejectYm === mo.key && (
              <div className="border-b border-(--hairline) px-3 py-2">
                <FieldGroup label={`เหตุผลที่ส่งกลับ — ${formatMonthTH(mo.key)}`}>
                  <TextArea
                    rows={2}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="เช่น ชั่วโมงวันที่ 5 ไม่ตรงกับตารางสอน"
                  />
                </FieldGroup>
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setRejectYm(null)}>ยกเลิก</Button>
                  <Button
                    variant="danger" size="sm"
                    disabled={!reason.trim() || busy}
                    isPending={busy}
                    onClick={() => { onDecide(mo.key, "reject", reason.trim()); setRejectYm(null); }}
                  >
                    ส่งกลับให้แก้ไข
                  </Button>
                </div>
              </div>
            )}

            <table className="w-full text-sm">
              <thead className="border-b border-(--hairline) text-xs text-muted">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 text-left">วันที่</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">เวลา</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">ชม.</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">กิจกรรม</th>
                  <th className="px-3 py-2 text-left">หมายเหตุ</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--hairline)">
                {mo.weeks.map(wk => (
                  <Fragment key={wk.key}>
                    {/* ป้ายสัปดาห์ — จงใจให้จาง เป็นตัวคั่นสายตา ไม่ใช่หัวข้อเด่น */}
                    <tr>
                      <td colSpan={6} className="px-3 pt-2 pb-0.5 text-[11px] text-muted">
                        {wk.label} · <span className="tabular">{wk.hours.toFixed(1)} ชม.</span>
                      </td>
                    </tr>
                    {wk.items.map(r => {
                      const activityLabel = ACTIVITY_LABEL[r.activity] ?? r.activity;
                      const parentKindLabel =
                        r.activity === "other" && (r.parent_kind === "lecture" || r.parent_kind === "lab")
                          ? ` (${PARENT_KIND_LABEL[r.parent_kind]})`
                          : "";
                      // แถวที่ไม่ได้อยู่ในรอบพิจารณานี้ทำให้จาง เพื่อให้สายตาไป
                      // ที่รายการที่กำลังตัดสิน
                      const dim = r.status !== "submitted";
                      return (
                        <tr key={r.id} className={dim ? "text-muted" : ""}>
                          <td className="whitespace-nowrap px-3 py-2">{formatWorkDate(r.work_date)}</td>
                          <td className="whitespace-nowrap px-3 py-2 tabular">{r.start_time}–{r.end_time}</td>
                          <td className="px-3 py-2 text-right tabular">{r.hours.toFixed(1)}</td>
                          <td className="whitespace-nowrap px-3 py-2">{activityLabel}{parentKindLabel}</td>
                          <td className="px-3 py-2">{r.note ?? ""}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <StatusChip status={r.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ApprovalHistoryPanel shows the lecturer's own approve/reject actions for
// this course, newest first. Purely informational — the row isn't clickable
// (the underlying assignment might no longer have those exact rows anymore).
// Rejected entries expand their reason inline so the lecturer can recall
// why a batch was bounced.
function formatHistoryAt(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const diff = Date.now() - t.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "เมื่อสักครู่";
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม.ที่แล้ว`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} วันที่แล้ว`;
  // Older than a week — show the calendar date instead of a stale relative.
  const d = t.getDate();
  const m = t.getMonth() + 1;
  const y = t.getFullYear() + 543;
  return `${d}/${m}/${y}`;
}

function ApprovalHistoryPanel({
  history, loading,
}: {
  history: ApprovalHistoryEntry[] | undefined;
  loading: boolean;
}) {
  return (
    <Panel padded={false}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-(--hairline)">
        <History size={16} className="text-muted" />
        <div className="font-medium text-sm">ประวัติการอนุมัติ</div>
        <div className="ml-auto text-xs text-muted">
          {history && history.length > 0 ? `${history.length} รายการล่าสุด` : ""}
        </div>
      </div>
      {loading ? (
        <div className="py-8 flex flex-col items-center gap-2 text-muted">
          <Spinner />
          <div className="text-xs">กำลังโหลดประวัติ…</div>
        </div>
      ) : !history || history.length === 0 ? (
        <EmptyState
          title="ยังไม่มีประวัติ"
          description="เมื่อคุณกดอนุมัติหรือส่งกลับให้ TA แก้ไข รายการจะปรากฏที่นี่"
        />
      ) : (
        <ul className="divide-y divide-(--hairline)">
          {history.map(h => {
            const approved = h.action === "worklog.approve";
            const trackTH = h.track === "special" ? "พิเศษ" : "ปกติ";
            return (
              <li key={h.id} className="px-4 py-3 flex items-start gap-3">
                <span
                  className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                    approved
                      ? "bg-success-soft text-success-soft-foreground border border-success-soft-border"
                      : "bg-danger-soft text-danger-soft-foreground border border-danger-soft-border"
                  }`}
                >
                  {approved ? <Check size={12} /> : <X size={12} />}
                  {approved ? "อนุมัติ" : "ส่งกลับ"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className="font-medium">{h.ta_name}</span>
                    <span className="text-muted"> · sec {h.sec_no} ({trackTH})</span>
                  </div>
                  {!approved && h.note && (
                    <div className="mt-1 text-xs text-warning-soft-foreground bg-warning-soft border border-warning-soft-border rounded px-2 py-1 whitespace-pre-wrap">
                      เหตุผล: {h.note}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-xs text-muted" title={new Date(h.at).toLocaleString("th-TH")}>
                  {formatHistoryAt(h.at)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
