"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { api } from "../../lib/api";
import {
  PageHeader, Panel, Button, EmptyState, Modal, TextArea, FieldGroup,
} from "../../components/ui";

interface Item {
  id: string; course_code: string; course_name: string;
  status: string; submitted_at?: string; teaching_course_id: string;
}

export default function ApprovalsPage() {
  const { data } = useSWR<Item[]>("/ta-requests?pending=1");
  const [rejectId, setRejectId] = useState<string | null>(null);

  async function approve(id: string) {
    await api.post(`/ta-requests/${id}/approve`);
    mutate("/ta-requests?pending=1");
  }
  async function confirmReject(id: string, reason: string) {
    await api.post(`/ta-requests/${id}/reject`, { reason });
    setRejectId(null);
    mutate("/ta-requests?pending=1");
  }

  return (
    <div>
      <PageHeader
        title="อนุมัติคำขอ TA"
        description={data?.length ? `รอ ${data.length} คำขอ` : "ไม่มีคำขอที่รออนุมัติ"}
      />

      <Panel padded={false}>
        {(!data || data.length === 0) ? (
          <EmptyState title="ไม่มีคำขอที่รออนุมัติ" description="เมื่ออาจารย์ส่งคำขอ TA จะแสดงที่นี่" />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>รหัสวิชา</th>
                  <th>ชื่อวิชา</th>
                  <th>ส่งเมื่อ</th>
                  <th className="actions">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {data.map(r => (
                  <tr key={r.id}>
                    <td className="font-medium tabular">{r.course_code}</td>
                    <td>{r.course_name}</td>
                    <td className="text-[var(--ink-3)] text-xs">
                      {r.submitted_at ? new Date(r.submitted_at).toLocaleString("th-TH") : "-"}
                    </td>
                    <td className="actions">
                      <div className="inline-flex gap-2">
                        <Button variant="primary" size="sm" onClick={() => approve(r.id)}>
                          <Check size={14} /> อนุมัติ
                        </Button>
                        <Button variant="danger-soft" size="sm" onClick={() => setRejectId(r.id)}>
                          <X size={14} /> ปฏิเสธ
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    <Modal open={!!id} onClose={onClose} title="ระบุเหตุผลการปฏิเสธ"
      footer={<>
        <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
        <Button variant="primary" onClick={() => id && onConfirm(id, reason)} disabled={!reason.trim()}>ยืนยัน</Button>
      </>}
    >
      <FieldGroup label="เหตุผล (บังคับ)">
        <TextArea rows={4} value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="อธิบายเหตุผลให้อาจารย์เข้าใจ…" />
      </FieldGroup>
    </Modal>
  );
}
