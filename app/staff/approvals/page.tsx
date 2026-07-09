"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import {
  Check, X, Eye, AlertTriangle, Users, FileCheck2, CalendarCheck2, BookOpenCheck,
} from "lucide-react";
import { api } from "../../lib/api";
import {
  PageHeader, Button, Modal, TextArea, FieldGroup, Alert, Chip,
} from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";

interface Item {
  id: string; course_code: string; course_name: string;
  status: string; submitted_at?: string; teaching_course_id: string;
  lecturer_name: string; ta_count: number;
}

interface AssignmentDetail {
  section_no: string;
  ta_id: string;
  ta_name: string;
  email: string;
  student_id?: string;
  level: string;
  total_hrs: number;
  profile_status: string;
  has_schedule: boolean;
  approved_course_count: number;
  warnings: string[];
}

interface RequestDetail extends Item {
  reimburse_scope: string;
  counts: { section_no: string; undergrad_count: number; graduate_count: number }[] | null;
  assignments: AssignmentDetail[] | null;
}

const LEVEL_LABEL: Record<string, string> = { undergrad: "ป.ตรี", master: "ป.โท", phd: "ป.เอก" };
const SCOPE_LABEL: Record<string, string> = { lecture: "เฉพาะบรรยาย", lab: "เฉพาะปฏิบัติการ", both: "บรรยาย + ปฏิบัติการ" };

export default function ApprovalsPage() {
  const { data } = useSWR<Item[]>("/ta-requests?pending=1");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function approve(id: string) {
    setErr(null); setBusyId(id);
    try {
      await api.post(`/ta-requests/${id}/approve`);
      setDetailId(null);
      mutate("/ta-requests?pending=1");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อนุมัติไม่สำเร็จ");
    } finally { setBusyId(null); }
  }
  async function confirmReject(id: string, reason: string) {
    setErr(null); setBusyId(id);
    try {
      await api.post(`/ta-requests/${id}/reject`, { reason });
      setRejectId(null); setDetailId(null);
      mutate("/ta-requests?pending=1");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ปฏิเสธไม่สำเร็จ");
    } finally { setBusyId(null); }
  }

  return (
    <div>
      <PageHeader
        title="อนุมัติคำขอ TA"
        description={data?.length ? `รอ ${data.length} คำขอ` : "ไม่มีคำขอที่รออนุมัติ"}
      />

      {err && (
        <div className="mb-3">
          <Alert status="danger" icon={<AlertTriangle size={16} />} title="ดำเนินการไม่สำเร็จ" description={err} />
        </div>
      )}

      <DataTable
        ariaLabel="คำขอ TA ที่รออนุมัติ"
        rows={data}
        loading={!data}
        rowKey={r => r.id}
        searchFn={r => `${r.course_code} ${r.course_name} ${r.lecturer_name}`}
        searchPlaceholder="ค้นหารหัสวิชา / ชื่อวิชา / อาจารย์…"
        initialSort={{ column: "submitted_at", direction: "ascending" }}
        emptyTitle="ไม่มีคำขอที่รออนุมัติ"
        emptyDescription="เมื่ออาจารย์ส่งคำขอ TA จะแสดงที่นี่"
        columns={approvalColumns(setDetailId, setRejectId)}
      />

      <DetailModal
        id={detailId}
        busy={busyId === detailId}
        onClose={() => setDetailId(null)}
        onApprove={approve}
        onReject={id => setRejectId(id)}
      />

      <RejectModal
        id={rejectId}
        busy={busyId === rejectId}
        onClose={() => setRejectId(null)}
        onConfirm={confirmReject}
      />
    </div>
  );
}

function approvalColumns(
  onDetail: (id: string) => void,
  onReject: (id: string) => void,
): DataColumn<Item>[] {
  return [
    {
      id: "course_code", label: "รหัสวิชา", sortable: true, isRowHeader: true,
      sortValue: r => r.course_code,
      className: "font-medium tabular-nums",
      render: r => r.course_code,
    },
    {
      id: "course_name", label: "ชื่อวิชา", sortable: true,
      sortValue: r => r.course_name,
      render: r => r.course_name,
    },
    {
      id: "lecturer", label: "อาจารย์", sortable: true,
      sortValue: r => r.lecturer_name,
      className: "text-(--ink-3)",
      render: r => r.lecturer_name,
    },
    {
      id: "ta_count", label: "TA",
      render: r => <Chip tone="brand">{r.ta_count} คน</Chip>,
    },
    {
      id: "submitted_at", label: "ส่งเมื่อ", sortable: true,
      sortValue: r => r.submitted_at ?? "",
      className: "text-(--ink-3) text-xs whitespace-nowrap",
      render: r => r.submitted_at ? new Date(r.submitted_at).toLocaleString("th-TH") : "-",
    },
    {
      id: "actions", label: <span className="sr-only">การจัดการ</span>,
      className: "text-right",
      render: r => (
        <div className="inline-flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => onDetail(r.id)}>
            <Eye size={14} /> ตรวจสอบ
          </Button>
          <Button variant="danger-soft" size="sm" onClick={() => onReject(r.id)}>
            <X size={14} /> ปฏิเสธ
          </Button>
        </div>
      ),
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Detail modal — full review before approving                                 */
/* -------------------------------------------------------------------------- */

function DetailModal({
  id, busy, onClose, onApprove, onReject,
}: {
  id: string | null;
  busy: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const { data: d, isLoading } = useSWR<RequestDetail>(id ? `/ta-requests/${id}` : null);
  const assignments = d?.assignments ?? [];
  const hasBlockers = assignments.some(a => a.warnings.length > 0);

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title="ตรวจสอบคำขอ TA"
      icon={<BookOpenCheck size={18} />}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <div className="text-xs text-(--ink-3)">
            {hasBlockers && (
              <span className="inline-flex items-center gap-1 text-red-600">
                <AlertTriangle size={12} /> มีเงื่อนไขไม่ผ่าน — อนุมัติไม่ได้
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>ปิด</Button>
            <Button variant="danger-soft" onClick={() => id && onReject(id)} disabled={busy}>
              <X size={14} /> ปฏิเสธ
            </Button>
            <Button
              variant="primary"
              onClick={() => id && onApprove(id)}
              disabled={busy || isLoading || hasBlockers}
              isPending={busy}
            >
              <Check size={14} /> อนุมัติ
            </Button>
          </div>
        </div>
      }
    >
      {!d ? (
        <div className="py-10 text-center text-sm text-(--ink-3)">กำลังโหลด…</div>
      ) : (
        <div className="space-y-4">
          {/* Course header */}
          <div className="rounded-lg border border-(--hairline) bg-slate-50 px-4 py-3">
            <div className="font-semibold">{d.course_code} — {d.course_name}</div>
            <div className="text-xs text-(--ink-3) mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <span>อาจารย์: {d.lecturer_name}</span>
              <span>เบิก: {SCOPE_LABEL[d.reimburse_scope] ?? d.reimburse_scope}</span>
              {d.submitted_at && <span>ส่งเมื่อ: {new Date(d.submitted_at).toLocaleString("th-TH")}</span>}
            </div>
            {(d.counts?.length ?? 0) > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {d.counts!.map(c => (
                  <Chip key={c.section_no} tone="neutral">
                    Sec {c.section_no}: ตรี {c.undergrad_count} · โท/เอก {c.graduate_count}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          {/* Per-TA cards */}
          <div>
            <div className="text-xs font-medium text-(--ink-2) mb-2 flex items-center gap-1.5">
              <Users size={13} /> รายชื่อผู้ช่วยสอน ({assignments.length})
            </div>
            <div className="space-y-2">
              {assignments.map((a, i) => (
                <TaCard key={`${a.ta_id}-${a.section_no}-${i}`} a={a} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function TaCard({ a }: { a: AssignmentDetail }) {
  const blocked = a.warnings.length > 0;
  const overLimit = a.approved_course_count >= 3;
  return (
    <div className={
      "rounded-lg border px-3 py-2.5 " +
      (blocked ? "border-red-200 bg-red-50/50" : "border-(--hairline) bg-white")
    }>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{a.ta_name}</span>
        <span className="text-xs text-(--ink-3)">{a.email}{a.student_id ? ` · ${a.student_id}` : ""}</span>
        <Chip tone="neutral">Sec {a.section_no}</Chip>
        <Chip tone={a.level === "undergrad" ? "neutral" : "brand"}>{LEVEL_LABEL[a.level] ?? a.level}</Chip>
        <Chip tone="neutral">{a.total_hrs.toFixed(1)} ชม./สัปดาห์</Chip>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <StatusBadge
          ok={a.profile_status === "approved"}
          icon={<FileCheck2 size={11} />}
          okText="เอกสารผ่านแล้ว"
          badText="เอกสารยังไม่ผ่าน"
        />
        <StatusBadge
          ok={a.has_schedule}
          icon={<CalendarCheck2 size={11} />}
          okText="บันทึกตารางเรียนแล้ว"
          badText="ยังไม่บันทึกตารางเรียน"
        />
        <span className={
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border " +
          (overLimit
            ? "bg-red-50 text-red-700 border-red-200 font-medium"
            : "bg-slate-50 text-slate-600 border-slate-200")
        }>
          <BookOpenCheck size={11} /> เป็น TA แล้ว {a.approved_course_count}/3 วิชา
        </span>
      </div>

      {blocked && (
        <ul className="mt-2 space-y-1">
          {a.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-red-700">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({
  ok, icon, okText, badText,
}: { ok: boolean; icon: React.ReactNode; okText: string; badText: string }) {
  return (
    <span className={
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border " +
      (ok
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-red-50 text-red-700 border-red-200 font-medium")
    }>
      {icon} {ok ? okText : badText}
    </span>
  );
}

function RejectModal({
  id, busy, onClose, onConfirm,
}: { id: string | null; busy: boolean; onClose: () => void; onConfirm: (id: string, reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open={!!id} onClose={onClose} title="ระบุเหตุผลการปฏิเสธ"
      footer={<>
        <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
        <Button variant="primary" onClick={() => id && onConfirm(id, reason)}
          disabled={!reason.trim() || busy} isPending={busy}>ยืนยัน</Button>
      </>}
    >
      <FieldGroup label="เหตุผล (บังคับ)">
        <TextArea rows={4} value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="อธิบายเหตุผลให้อาจารย์เข้าใจ…" />
      </FieldGroup>
    </Modal>
  );
}
