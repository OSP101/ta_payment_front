"use client";
import useSWR, { mutate } from "swr";
import { use, useEffect, useMemo, useState } from "react";
import { Check, X, CircleAlert, Clock, ChevronRight, Eye, History } from "lucide-react";
import { Breadcrumbs } from "@heroui/react";
import { api } from "../../../../lib/api";
import { notify } from "../../../../lib/notify";
import {
  PageHeader, Panel, Button, EmptyState, Modal, TextArea, FieldGroup, Alert, ConfirmDialog, Spinner,
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

const PENDING_KEY = "/reports/pending";

export default function ReportsPage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);

  const { data: course } = useSWR<Course>(`/teaching-courses/${tcId}`);
  // No longer swallow fetch errors to []: read SWR `error` and surface it.
  const { data: all, error, isLoading } = useSWR<Assignment[]>(PENDING_KEY);
  const historyKey = `/teaching-courses/${tcId}/approval-history`;
  const { data: history, isLoading: historyLoading } = useSWR<ApprovalHistoryEntry[]>(historyKey);

  const data = (all ?? []).filter(
    a => a.teaching_course_id === tcId || a.course_code === course?.code,
  );

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<Assignment | null>(null);
  // detailTarget opens the read-only worklog viewer so the lecturer can
  // double-check what the TA actually submitted before pressing approve.
  const [detailTarget, setDetailTarget] = useState<Assignment | null>(null);
  // While a request is in flight for a given row, disable its buttons so a
  // double-click can't fire the mutation twice.
  const [pendingId, setPendingId] = useState<string | null>(null);

  function worklogSummary(a: Assignment): string | undefined {
    const parts: string[] = [];
    if (typeof a.total_hours === "number") parts.push(`${a.total_hours} ชม.`);
    if (a.period_label) parts.push(a.period_label);
    return parts.length ? parts.join(" · ") : undefined;
  }

  async function approve(id: string) {
    setPendingId(id);
    try {
      await api.post(`/assignments/${id}/worklog/approve`);
      notify.success("อนุมัติรายงานบันทึกเวลาเรียบร้อยแล้ว");
      setApproveTarget(null);
      setDetailTarget(null);
      await Promise.all([mutate(PENDING_KEY), mutate(historyKey)]);
    } catch (e) {
      notify.error(e);
    } finally {
      setPendingId(null);
    }
  }
  async function confirmReject(id: string, reason: string) {
    setPendingId(id);
    try {
      await api.post(`/assignments/${id}/worklog/reject`, { reason });
      notify.success("ส่งกลับให้ TA แก้ไขเรียบร้อยแล้ว");
      setRejectId(null);
      setDetailTarget(null);
      await Promise.all([mutate(PENDING_KEY), mutate(historyKey)]);
    } catch (e) {
      notify.error(e);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div>
      <Breadcrumbs className="mb-3">
        <Breadcrumbs.Item href="/lecturer">รายวิชาที่สอน</Breadcrumbs.Item>
        <Breadcrumbs.Item href={`/lecturer/courses/${tcId}`}>
          {course ? `${course.code} — ${course.name_th}` : "…"}
        </Breadcrumbs.Item>
        <Breadcrumbs.Item>อนุมัติรายงาน TA</Breadcrumbs.Item>
      </Breadcrumbs>
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
          <ul className="divide-y divide-(--hairline)">
            {data.map(a => {
              const summary = worklogSummary(a);
              const busy = pendingId === a.id;
              return (
                <li key={a.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailTarget(a)}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailTarget(a);
                      }
                    }}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left cursor-pointer hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    aria-label={`ดูรายละเอียดบันทึกเวลาของ ${a.ta_name}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{a.ta_name}</div>
                      <div className="text-xs text-muted flex items-center gap-2 flex-wrap">
                        <span>{a.course_code}</span>
                        {summary && (
                          <span className="inline-flex items-center gap-1">
                            <Clock size={11} />{summary}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-accent">
                          <Eye size={11} /> ดูรายละเอียด
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                      <Button
                        variant="primary" size="sm"
                        onClick={() => setApproveTarget(a)}
                        disabled={busy}
                      >
                        <Check size={14} /> อนุมัติ
                      </Button>
                      <Button
                        variant="danger-soft" size="sm"
                        onClick={() => setRejectId(a.id)}
                        disabled={busy}
                      >
                        <X size={14} /> ไม่อนุมัติ
                      </Button>
                      <ChevronRight size={16} className="text-muted" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="mt-6">
        <ApprovalHistoryPanel
          history={history}
          loading={historyLoading && history === undefined}
        />
      </div>

      <WorklogDetailModal
        assignment={detailTarget}
        pending={!!detailTarget && pendingId === detailTarget.id}
        onClose={() => setDetailTarget(null)}
        onApprove={() => detailTarget && setApproveTarget(detailTarget)}
        onReject={() => detailTarget && setRejectId(detailTarget.id)}
      />

      <ConfirmDialog
        open={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        onConfirm={() => approveTarget && approve(approveTarget.id)}
        title="ยืนยันการอนุมัติรายงาน"
        message={
          approveTarget
            ? `อนุมัติบันทึกเวลาของ ${approveTarget.ta_name} (${approveTarget.course_code})${
                worklogSummary(approveTarget) ? ` — ${worklogSummary(approveTarget)}` : ""
              }? เมื่ออนุมัติแล้วรายการจะถูกส่งต่อและไม่สามารถย้อนกลับได้`
            : undefined
        }
        confirmLabel="อนุมัติ"
        isPending={!!approveTarget && pendingId === approveTarget.id}
      />

      <RejectModal
        id={rejectId}
        pending={!!rejectId && pendingId === rejectId}
        onClose={() => setRejectId(null)}
        onConfirm={confirmReject}
      />
    </div>
  );
}

// WorklogDetailModal renders every entry the TA submitted so the lecturer
// can double-check dates, hours, and activity kinds before pressing อนุมัติ.
// Read-only — approve/reject buttons in the footer hand back to the parent's
// existing confirm dialogs so the mutation flow stays unified.
function WorklogDetailModal({
  assignment, pending, onClose, onApprove, onReject,
}: {
  assignment: Assignment | null;
  pending: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  // Only fetch when open — SWR's null key convention. Lecturer/staff/admin
  // are all authorized by the /assignments/:id/worklog endpoint's server
  // side gate (assertCanView), so no extra permission plumbing needed here.
  const { data: logs, isLoading } = useSWR<WorkLog[]>(
    assignment ? `/assignments/${assignment.id}/worklog` : null,
  );
  // Show every entry — draft/submitted/approved — so the lecturer sees the
  // full picture. The pending-review batch (status=submitted) is what the
  // Approve/Reject buttons act on, but any lingering drafts or previously
  // approved rows deserve visibility too.
  const rows = useMemo(() => {
    const arr = [...(logs ?? [])];
    arr.sort((a, b) => {
      if (a.work_date !== b.work_date) return a.work_date.localeCompare(b.work_date);
      return (a.start_time ?? "").localeCompare(b.start_time ?? "");
    });
    return arr;
  }, [logs]);
  // Group into month sections so the modal mirrors the TA's own worklog
  // view (name > month > entries). Each section shows a per-month subtotal
  // limited to submitted rows so the lecturer immediately sees the impact
  // of the approval decision within that month.
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
          items,
          submittedHours: submittedRows.reduce((s, i) => s + (i.hours || 0), 0),
          submittedCount: submittedRows.length,
        };
      });
  }, [rows]);
  const submittedTotal = rows
    .filter(r => r.status === "submitted")
    .reduce((s, r) => s + (r.hours || 0), 0);
  const submittedCount = rows.filter(r => r.status === "submitted").length;

  return (
    <Modal
      open={!!assignment}
      onClose={onClose}
      size="xl"
      title={assignment ? `บันทึกเวลาของ ${assignment.ta_name}` : "รายละเอียดบันทึกเวลา"}
      footer={
        <div className="flex justify-between gap-2 w-full">
          <Button variant="ghost" onClick={onClose} disabled={pending}>ปิด</Button>
          <div className="flex gap-2">
            <Button variant="danger-soft" onClick={onReject} disabled={pending}>
              <X size={14} /> ไม่อนุมัติ
            </Button>
            <Button variant="primary" onClick={onApprove} disabled={pending}>
              <Check size={14} /> อนุมัติ
            </Button>
          </div>
        </div>
      }
    >
      {assignment && (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg bg-surface-secondary border border-(--hairline) px-3 py-2 text-xs text-muted flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>รายวิชา: <span className="font-semibold text-foreground">{assignment.course_code}</span></span>
            {typeof assignment.total_hours === "number" && (
              <span>· รวม (รอพิจารณา): <span className="font-semibold text-foreground tabular">{submittedTotal.toFixed(1)}</span> ชม.</span>
            )}
            <span>· {submittedCount} รายการที่รอพิจารณา (จากทั้งหมด {rows.length})</span>
            {assignment.period_label && <span>· {assignment.period_label}</span>}
          </div>

          {isLoading && !logs ? (
            <div className="py-8 flex flex-col items-center gap-2 text-muted">
              <Spinner />
              <div className="text-xs">กำลังโหลดรายการ…</div>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="ไม่มีรายการบันทึกเวลา"
              description="TA คนนี้ยังไม่ได้กรอกบันทึกเวลาใด ๆ"
            />
          ) : (
            <div className="flex flex-col gap-3">
              {months.map(mo => (
                <div key={mo.key} className="border border-(--hairline) rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-3 py-2 bg-surface-secondary text-sm">
                    <div className="font-semibold">{formatMonthTH(mo.key)}</div>
                    <div className="text-xs text-muted flex items-center gap-2">
                      <span>{mo.items.length} รายการ</span>
                      {mo.submittedCount > 0 && (
                        <>
                          <span>·</span>
                          <span>
                            รอพิจารณา{" "}
                            <span className="font-semibold text-foreground tabular">
                              {mo.submittedHours.toFixed(1)}
                            </span>{" "}
                            ชม.
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted border-b border-(--hairline)">
                      <tr>
                        <th className="text-left px-3 py-2 whitespace-nowrap">วันที่</th>
                        <th className="text-left px-3 py-2 whitespace-nowrap">เวลา</th>
                        <th className="text-right px-3 py-2 whitespace-nowrap">ชม.</th>
                        <th className="text-left px-3 py-2 whitespace-nowrap">กิจกรรม</th>
                        <th className="text-left px-3 py-2">หมายเหตุ</th>
                        <th className="text-left px-3 py-2 whitespace-nowrap">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--hairline)">
                      {mo.items.map(r => {
                        const activityLabel = ACTIVITY_LABEL[r.activity] ?? r.activity;
                        const parentKindLabel =
                          r.activity === "other" && (r.parent_kind === "lecture" || r.parent_kind === "lab")
                            ? ` (${PARENT_KIND_LABEL[r.parent_kind]})`
                            : "";
                        // Dim rows that aren't in this pending batch so the
                        // lecturer's eye lands on what they're deciding on.
                        const dim = r.status !== "submitted";
                        return (
                          <tr key={r.id} className={dim ? "text-muted" : ""}>
                            <td className="px-3 py-2 whitespace-nowrap">{formatWorkDate(r.work_date)}</td>
                            <td className="px-3 py-2 whitespace-nowrap tabular">{r.start_time}–{r.end_time}</td>
                            <td className="px-3 py-2 text-right tabular">{r.hours.toFixed(1)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{activityLabel}{parentKindLabel}</td>
                            <td className="px-3 py-2">{r.note ?? ""}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <StatusChip status={r.status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
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

function RejectModal({
  id, pending, onClose, onConfirm,
}: {
  id: string | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (id: string, reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  // Clear the reason whenever the target changes so it isn't carried over from
  // a previously rejected TA.
  useEffect(() => { if (id) setReason(""); }, [id]);
  return (
    <Modal open={!!id} onClose={onClose} title="เหตุผลการไม่อนุมัติ"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={pending}>ยกเลิก</Button>
        <Button
          variant="primary"
          onClick={() => id && onConfirm(id, reason)}
          disabled={!reason.trim() || pending}
          isPending={pending}
        >
          ยืนยัน
        </Button>
      </>}
    >
      <FieldGroup label="เหตุผล (บังคับ)">
        <TextArea rows={4} value={reason} onChange={e => setReason(e.target.value)} />
      </FieldGroup>
    </Modal>
  );
}
