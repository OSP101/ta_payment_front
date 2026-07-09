"use client";
import useSWR, { mutate } from "swr";
import { use, useEffect, useState } from "react";
import { Check, X, CircleAlert, Clock } from "lucide-react";
import { Breadcrumbs } from "@heroui/react";
import { api } from "../../../../lib/api";
import { notify } from "../../../../lib/notify";
import {
  PageHeader, Panel, Button, EmptyState, Modal, TextArea, FieldGroup, Alert, ConfirmDialog, Spinner,
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

const PENDING_KEY = "/reports/pending";

export default function ReportsPage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);

  const { data: course } = useSWR<Course>(`/teaching-courses/${tcId}`);
  // No longer swallow fetch errors to []: read SWR `error` and surface it.
  const { data: all, error, isLoading } = useSWR<Assignment[]>(PENDING_KEY);

  const data = (all ?? []).filter(
    a => a.teaching_course_id === tcId || a.course_code === course?.code,
  );

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<Assignment | null>(null);
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
      await mutate(PENDING_KEY);
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
      await mutate(PENDING_KEY);
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
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{a.ta_name}</div>
                    <div className="text-xs text-muted flex items-center gap-2 flex-wrap">
                      <span>{a.course_code}</span>
                      {summary && (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={11} />{summary}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
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
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

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
