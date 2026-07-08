"use client";
import useSWR from "swr";
import { use, useState } from "react";
import { Check, X } from "lucide-react";
import { Breadcrumbs } from "@heroui/react";
import { api } from "../../../../lib/api";
import {
  PageHeader, Panel, Button, EmptyState, Modal, TextArea, FieldGroup,
} from "../../../../components/ui";

interface Assignment {
  id: string;
  ta_name: string;
  course_code: string;
  teaching_course_id?: string;
}
interface Course { id: string; code: string; name_th: string; }

export default function ReportsPage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);

  const { data: course } = useSWR<Course>(`/teaching-courses/${tcId}`);
  const { data: all } = useSWR<Assignment[]>(
    "/reports/pending",
    (p: string) => api.get<Assignment[]>(p).catch(() => [] as Assignment[]),
  );

  const data = (all ?? []).filter(
    a => a.teaching_course_id === tcId || a.course_code === course?.code,
  );

  const [rejectId, setRejectId] = useState<string | null>(null);

  async function approve(id: string) {
    await api.post(`/assignments/${id}/worklog/approve`);
    location.reload();
  }
  async function confirmReject(id: string, reason: string) {
    await api.post(`/assignments/${id}/worklog/reject`, { reason });
    setRejectId(null);
    location.reload();
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
        {data.length === 0 ? (
          <EmptyState
            title="ไม่มีรายการรออนุมัติ"
            description="เมื่อ TA ในวิชานี้ส่งบันทึกเวลา จะปรากฏที่นี่"
          />
        ) : (
          <ul className="divide-y divide-(--hairline)">
            {data.map(a => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{a.ta_name}</div>
                  <div className="text-xs text-muted">{a.course_code}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="primary" size="sm" onClick={() => approve(a.id)}>
                    <Check size={14} /> อนุมัติ
                  </Button>
                  <Button variant="danger-soft" size="sm" onClick={() => setRejectId(a.id)}>
                    <X size={14} /> ไม่อนุมัติ
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <RejectModal
        id={rejectId}
        onClose={() => setRejectId(null)}
        onConfirm={confirmReject}
      />
    </div>
  );
}

function RejectModal({
  id, onClose, onConfirm,
}: { id: string | null; onClose: () => void; onConfirm: (id: string, reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open={!!id} onClose={onClose} title="เหตุผลการไม่อนุมัติ"
      footer={<>
        <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
        <Button variant="primary" onClick={() => id && onConfirm(id, reason)} disabled={!reason.trim()}>
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
