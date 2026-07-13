"use client";
import useSWR from "swr";
import { useState } from "react";
import { CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api";
import { notify } from "../../lib/notify";
import { PageHeader, Panel, Chip, Button } from "../../components/ui";

interface PendingRow {
  period_id: string;
  label: string;
  due_date: string;
  is_closed: boolean;
  teaching_course_id: string;
  course_code: string;
  course_name_th: string;
  status: "pending" | "ta_signed" | "lecturer_signed" | "submitted" | "skipped";
  ta_signed_at?: string | null;
  lecturer_signed_at?: string | null;
  submitted_at?: string | null;
}

// Group rows by submission period so a TA sees "one card per month" with
// each course they help with underneath.
type Group = { period_id: string; label: string; due_date: string; is_closed: boolean; rows: PendingRow[] };

const STATUS_LABEL: Record<PendingRow["status"], string> = {
  pending:          "รอดำเนินการ",
  ta_signed:        "TA เซ็นแล้ว รอ อ.",
  lecturer_signed:  "อ.เซ็นแล้ว รอส่ง",
  submitted:        "ส่งเรียบร้อย",
  skipped:          "ข้าม",
};
const STATUS_TONE: Record<PendingRow["status"], "brand" | "warn" | "success" | "neutral"> = {
  pending:         "warn",
  ta_signed:       "brand",
  lecturer_signed: "brand",
  submitted:       "success",
  skipped:         "neutral",
};

export default function TAReminderPage() {
  const { data, mutate } = useSWR<PendingRow[]>("/me/submission-periods");
  const [pending, setPending] = useState<string | null>(null);

  const groups: Group[] = (data ?? []).reduce<Group[]>((acc, r) => {
    const g = acc.find(x => x.period_id === r.period_id);
    if (g) {
      g.rows.push(r);
    } else {
      acc.push({
        period_id: r.period_id, label: r.label, due_date: r.due_date, is_closed: r.is_closed,
        rows: [r],
      });
    }
    return acc;
  }, []);

  async function confirm(row: PendingRow) {
    const key = `${row.period_id}/${row.teaching_course_id}`;
    setPending(key);
    try {
      await api.post(`/submission-periods/${row.period_id}/courses/${row.teaching_course_id}/ta-sign`, {});
      notify.success("ยืนยันบันทึกเวลาเรียบร้อย");
      await mutate();
    } catch (e) {
      notify.error(e);
    } finally { setPending(null); }
  }

  return (
    <div>
      <PageHeader
        title="แจ้งเตือนการเบิกจ่ายรายเดือน"
        description="รายเดือนที่ต้อง confirm บันทึกเวลาปฏิบัติงาน เมื่อเซ็นแล้วระบบจะส่งให้อาจารย์ประจำวิชาตรวจสอบและเจ้าหน้าที่ดำเนินการเบิกจ่าย"
      />
      {!data ? (
        <div className="text-sm text-muted p-6">กำลังโหลด…</div>
      ) : groups.length === 0 ? (
        <Panel title="ไม่มีรายการที่ต้องทำ">
          <div className="text-sm text-muted py-4">
            ยังไม่มีรอบเบิกจ่ายที่ต้องยืนยัน เมื่อเจ้าหน้าที่สร้างรอบเดือนใหม่ระบบจะแจ้งเตือนคุณ
          </div>
        </Panel>
      ) : (
        <div className="space-y-6">
          {groups.map(g => {
            const overdue = !g.is_closed && g.due_date < new Date().toISOString().slice(0, 10);
            return (
              <Panel
                key={g.period_id}
                title={g.label}
                description={g.is_closed ? "รอบนี้ปิดรับแล้ว" : `กำหนดส่ง ${g.due_date}`}
                actions={
                  overdue ? (
                    <Chip tone="warn"><AlertTriangle size={12} /> เลยกำหนด</Chip>
                  ) : g.is_closed ? (
                    <Chip tone="neutral">ปิดแล้ว</Chip>
                  ) : (
                    <Chip tone="brand"><CalendarClock size={12} /> เปิดรับ</Chip>
                  )
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-ink-2">
                      <tr>
                        <th className="text-left px-3 py-2">รหัสวิชา</th>
                        <th className="text-left px-3 py-2">ชื่อวิชา</th>
                        <th className="text-left px-3 py-2">สถานะ</th>
                        <th className="text-right px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map(r => {
                        const canConfirm = !g.is_closed && (r.status === "pending" || r.status === "ta_signed");
                        const key = `${r.period_id}/${r.teaching_course_id}`;
                        return (
                          <tr key={r.teaching_course_id} className="border-t border-hairline">
                            <td className="px-3 py-2 tabular">{r.course_code}</td>
                            <td className="px-3 py-2">{r.course_name_th}</td>
                            <td className="px-3 py-2">
                              <Chip tone={STATUS_TONE[r.status]}>
                                {r.status === "submitted" && <CheckCircle2 size={12} />}
                                {STATUS_LABEL[r.status]}
                              </Chip>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                variant={canConfirm ? "primary" : "ghost"}
                                size="sm"
                                onClick={() => confirm(r)}
                                disabled={!canConfirm || pending === key}
                              >
                                {r.status === "pending" ? "ยืนยันบันทึกเวลา" : "ยืนยันอีกครั้ง"}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
