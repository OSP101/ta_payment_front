"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Settings2, Save } from "lucide-react";
import { NumberField } from "@heroui/react";
import { api, errMessage } from "../lib/api";
import { notify } from "../lib/notify";
import { Modal, Button, Spinner, FieldGroup, Chip, EmptyState } from "./ui";

/**
 * The correction path that didn't exist before: TARequestService.Cancel
 * refuses once work_logs exist and tells the caller to "contact staff" for
 * a wrong workload declaration, but staff had no tool to act on that. This
 * modal is that tool — same fields, same caps as the lecturer's own
 * declaration form (app/lecturer/courses/[tcId]/request/page.tsx), reused
 * here locally rather than imported across the route boundary.
 *
 * Shared between app/staff/payouts/[tcId]/WorklogReviewModal.tsx and
 * app/lecturer/courses/[tcId]/reports/page.tsx (the "อนุมัติรายงานบันทึกเวลา
 * TA" screen — where the reported bug actually surfaced) — both need this,
 * so it lives here rather than under either route.
 *
 * Existing work_logs are NOT touched by a correction — it only changes what
 * a future Generate run or approval recheck reads. The 10-12h/week
 * graduate-regulation total that gates NEW requests is deliberately not
 * re-enforced here (some existing assignments predate it and would become
 * uncorrectable if it were) — the total is shown for context only.
 */

interface WorkloadFields {
  help_teach_hrs: number; help_teach_desc: string;
  prep_hrs: number; prep_desc: string;
  grade_hrs: number; grade_desc: string;
  other_hrs: number; other_desc: string;
  check_work_hrs: number; attendance_hrs: number;
  ug_other_hrs: number; ug_other_desc: string;
  lab_hrs: number; lab_other_hrs: number; lab_other_desc: string;
}
interface AssignmentWorkload {
  assignment_id: string;
  section_no: string;
  level: "undergrad" | "master" | "phd";
  workload: WorkloadFields;
}

const LEVEL_TH: Record<string, string> = {
  undergrad: "ปริญญาตรี", master: "ปริญญาโท", phd: "ปริญญาเอก",
};

function Hrs({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <FieldGroup label={label}>
      <NumberField
        value={value}
        onChange={onChange}
        minValue={0}
        maxValue={99}
        step={0.5}
        formatOptions={{ maximumFractionDigits: 1 }}
        className="w-28 shrink-0"
        aria-label={label}
      >
        <NumberField.Group>
          <NumberField.DecrementButton />
          <NumberField.Input />
          <NumberField.IncrementButton />
        </NumberField.Group>
      </NumberField>
    </FieldGroup>
  );
}

function AssignmentCard({
  a, onSaved,
}: { a: AssignmentWorkload; onSaved: () => void }) {
  // Only the hour VALUES are editable here — the bug this fixes is always
  // about a wrong number, never the free-text description — so the *_desc
  // fields ride along unchanged from what was originally declared.
  const [w, setW] = useState<WorkloadFields>(a.workload);
  const [busy, setBusy] = useState(false);
  const isGrad = a.level === "master" || a.level === "phd";
  const total = isGrad
    ? w.help_teach_hrs + w.prep_hrs + w.grade_hrs + w.other_hrs
    : w.check_work_hrs + w.attendance_hrs + w.ug_other_hrs + w.lab_hrs + w.lab_other_hrs;

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/assignments/${a.assignment_id}/workload`, w);
      notify.success(`บันทึกภาระงาน Sec ${a.section_no} แล้ว`);
      onSaved();
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--hairline)] p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Chip tone="neutral">Sec {a.section_no}</Chip>
        <Chip tone={isGrad ? "brand" : "neutral"}>{LEVEL_TH[a.level] ?? a.level}</Chip>
        <span className="flex-1" />
        <span className="text-xs text-muted">รวม {total.toFixed(1)} ชม./สัปดาห์</span>
      </div>

      {isGrad ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Hrs label="ช่วยสอน" value={w.help_teach_hrs}
            onChange={v => setW(s => ({ ...s, help_teach_hrs: v }))} />
          <Hrs label="ตรวจการบ้าน (ไม่เกิน 2 ชม./สัปดาห์)" value={w.grade_hrs}
            onChange={v => setW(s => ({ ...s, grade_hrs: v }))} />
          <Hrs label="เตรียมการสอน" value={w.prep_hrs}
            onChange={v => setW(s => ({ ...s, prep_hrs: v }))} />
          <Hrs label="อื่น ๆ ระบุ" value={w.other_hrs}
            onChange={v => setW(s => ({ ...s, other_hrs: v }))} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Hrs label="ช่วยตรวจงาน" value={w.check_work_hrs}
            onChange={v => setW(s => ({ ...s, check_work_hrs: v }))} />
          <Hrs label="เช็คชื่อ/เก็บใบงาน" value={w.attendance_hrs}
            onChange={v => setW(s => ({ ...s, attendance_hrs: v }))} />
          <Hrs label="อื่น ๆ (บรรยาย)" value={w.ug_other_hrs}
            onChange={v => setW(s => ({ ...s, ug_other_hrs: v }))} />
          <Hrs label="ปฏิบัติการ" value={w.lab_hrs}
            onChange={v => setW(s => ({ ...s, lab_hrs: v }))} />
          <Hrs label="อื่น ๆ (ปฏิบัติการ)" value={w.lab_other_hrs}
            onChange={v => setW(s => ({ ...s, lab_other_hrs: v }))} />
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" isDisabled={busy} onPress={save}>
          {busy ? <Spinner size="sm" /> : <Save size={14} />} บันทึก Sec {a.section_no}
        </Button>
      </div>
    </div>
  );
}

export function WorkloadEditModal({
  open, onClose, tcId, taId, taName,
}: {
  open: boolean;
  onClose: () => void;
  tcId: string;
  taId: string;
  taName: string;
}) {
  const key = open ? `/teaching-courses/${tcId}/ta/${taId}/workload` : null;
  const { data, isLoading, mutate: refresh } = useSWR<AssignmentWorkload[]>(key);

  return (
    <Modal open={open} onClose={onClose} size="lg" icon={<Settings2 size={16} />}
      title={`แก้ไขภาระงาน · ${taName}`}>
      <div className="space-y-3">
        <p className="text-xs text-muted">
          แก้ไขชั่วโมงที่ประกาศไว้สำหรับ TA คนนี้ — ไม่กระทบบันทึกเวลาที่มีอยู่แล้ว
          มีผลกับการสร้างบันทึกเวลาและการตรวจสอบโควตาครั้งถัดไปเท่านั้น
        </p>
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : !data || data.length === 0 ? (
          <EmptyState title="ไม่พบภาระงาน" description="TA คนนี้ไม่มี assignment ในวิชานี้" />
        ) : (
          <div className="space-y-3">
            {data.map(a => (
              <AssignmentCard
                key={a.assignment_id}
                a={a}
                onSaved={() => {
                  refresh();
                  mutate(key);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
