"use client";
import useSWR, { mutate } from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2, Save, Pencil, X, Check, CircleAlert, HelpCircle, Sparkles, CalendarDays, Power, PowerOff } from "lucide-react";
import {
  Tabs, Pagination, toast, Accordion, Switch,
  DatePicker, DateField, Calendar, I18nProvider,
} from "@heroui/react";
import { parseDate, parseDateTime, type DateValue } from "@internationalized/date";
import { api } from "../../lib/api";
import {
  PageHeader, Panel, Button, TextInput, FieldGroup, Chip, Modal, Alert, SearchField, Select,
} from "../../components/ui";
import { FormulaHelpModal } from "../../components/formula-help";

interface Rate {
  id?: string;
  effective_from: string;
  undergrad_regular: number; undergrad_special: number;
  graduate_regular: number; graduate_special_lumpsum: number;
  ug_lecture_hours_per_credit: number;
  ug_lab_hours_per_credit: number;
  baseline_students_lecture: number;
  baseline_students_lab: number;
  ug_workload_rate_regular: number;
  ug_workload_rate_special: number;
  term_months: number;
  ug_max_hours_per_day: number;
  max_courses_per_student: number;
  note?: string;
}
interface Cap { id?: string; credits: number; hours_cap: number; note?: string; }
interface FC {
  id?: string; code: string; name_th: string; name_en?: string;
  credits: number; lecture_hrs: number; lab_hrs: number; self_hrs: number; is_active: boolean;
}

export default function SettingsPage() {
  const params = useSearchParams();
  // Allow deep-linking to a specific tab, e.g. /staff/settings?tab=terms
  const tabParam = params.get("tab");
  const initialTab = ["rate", "cap", "courses", "terms", "windows"].includes(tabParam ?? "")
    ? (tabParam as string)
    : "rate";
  return (
    <div>
      <PageHeader title="ตั้งค่าระบบ" description="อัตราค่าตอบแทน เพดานงบ วิชา และภาคเรียน" />
      <Tabs defaultSelectedKey={initialTab}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="หมวดตั้งค่า">
            <Tabs.Tab id="rate">อัตราค่าตอบแทน<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="cap">เพดานชั่วโมง<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="courses">รายวิชา<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="terms">ภาคเรียน<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="windows">ระยะเวลารับสมัคร TA<Tabs.Indicator /></Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="rate" className="pt-6">
          <PayRateSection />
        </Tabs.Panel>
        <Tabs.Panel id="cap" className="pt-6">
          <HourCapSection />
        </Tabs.Panel>
        <Tabs.Panel id="courses" className="pt-6">
          <FacultyCoursesSection />
        </Tabs.Panel>
        <Tabs.Panel id="terms" className="pt-6">
          <TermsSection />
        </Tabs.Panel>
        <Tabs.Panel id="windows" className="pt-6">
          <RequestWindowsSection />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pay rate — read-only view + edit mode + confirm-save flow                  */
/* -------------------------------------------------------------------------- */

function PayRateSection() {
  const { data } = useSWR<Rate>("/settings/pay-rate");
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showFormula, setShowFormula] = useState(false);
  const empty: Rate = {
    effective_from: new Date().toISOString().slice(0, 10),
    undergrad_regular: 40, undergrad_special: 50,
    graduate_regular: 50, graduate_special_lumpsum: 4000,
    ug_lecture_hours_per_credit: 3, ug_lab_hours_per_credit: 4.5,
    baseline_students_lecture: 60, baseline_students_lab: 30,
    ug_workload_rate_regular: 200, ug_workload_rate_special: 250,
    term_months: 4,
    ug_max_hours_per_day: 7,
    max_courses_per_student: 3,
  };
  const [draft, setDraft] = useState<Rate>(empty);

  function startEdit() {
    setDraft({
      ...(data ?? empty),
      effective_from: new Date().toISOString().slice(0, 10),
    });
    setEditing(true);
  }
  function cancel() { setEditing(false); }

  // Field-level validation — every rate must be a finite number > 0. Empty
  // inputs coerce to 0 via Number(), which these checks reject.
  const rateErrors = {
    undergrad_regular: vPositive(draft.undergrad_regular),
    ug_max_hours_per_day: vPositive(draft.ug_max_hours_per_day),
    undergrad_special: vPositive(draft.undergrad_special),
    graduate_regular: vPositive(draft.graduate_regular),
    graduate_special_lumpsum: vPositive(draft.graduate_special_lumpsum),
    max_courses_per_student: vPositiveInt(draft.max_courses_per_student),
    ug_lecture_hours_per_credit: vPositive(draft.ug_lecture_hours_per_credit),
    ug_lab_hours_per_credit: vPositive(draft.ug_lab_hours_per_credit),
    baseline_students_lecture: vPositive(draft.baseline_students_lecture),
    baseline_students_lab: vPositive(draft.baseline_students_lab),
    ug_workload_rate_regular: vPositive(draft.ug_workload_rate_regular),
  };
  const hasRateErrors = Object.values(rateErrors).some(Boolean);
  const effectiveFromError = !draft.effective_from ? "กรุณาระบุวันเริ่มใช้" : null;
  const effectiveFromPast =
    !!draft.effective_from && draft.effective_from < new Date().toISOString().slice(0, 10);
  const canSaveRate = !hasRateErrors && !effectiveFromError;

  async function doSave() {
    if (!canSaveRate) return;
    setSaving(true);
    try {
      await api.post("/settings/pay-rate", draft);
      await mutate("/settings/pay-rate");
      setEditing(false);
      setConfirming(false);
      toast.success("บันทึกเวอร์ชันใหม่เรียบร้อยแล้ว", {
        description: `เริ่มใช้ ${draft.effective_from}`,
      });
    } catch (e) {
      toast.danger("บันทึกไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title="อัตราค่าตอบแทน TA"
      description="ค่าตอบแทนแบบมีเวอร์ชัน — สร้างเวอร์ชันใหม่ทุกครั้งที่แก้ (เก็บประวัติ)"
      actions={
        editing ? (
          <>
            <Button variant="ghost" onClick={cancel}><X size={14} />ยกเลิก</Button>
            <Button variant="primary" onClick={() => setConfirming(true)} disabled={!canSaveRate}>
              <Save size={14} />บันทึกเวอร์ชันใหม่
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setShowFormula(true)}>
              <HelpCircle size={14} />ดูตัวอย่างการคำนวณ
            </Button>
            <Button variant="secondary" onClick={startEdit}><Pencil size={14} />แก้ไข</Button>
          </>
        )
      }
    >
      {/* Current values — read-only */}
      {!editing && (
        data ? (
          <div className="space-y-5">
            <ViewGroup title="อัตราค่าจ้าง — ปริญญาตรี">
              <ViewRow label="ภาคปกติ" value={`${data.undergrad_regular} บาท/ชั่วโมง`} />
              <ViewRow label="ชั่วโมงสูงสุด/วัน (ปกติ)" value={`${data.ug_max_hours_per_day ?? 7} ชั่วโมง`} />
              <ViewRow label="ภาคพิเศษ" value={`${data.undergrad_special} บาท/ชั่วโมง`} />
            </ViewGroup>
            <ViewGroup title="อัตราค่าจ้าง — บัณฑิตศึกษา (โท/เอก)">
              <ViewRow label="ภาคปกติ" value={`${data.graduate_regular} บาท/ชั่วโมง`} />
              <ViewRow label="ภาคพิเศษ (เหมาจ่าย)" value={`${data.graduate_special_lumpsum.toLocaleString()} บาท/เดือน`} />
            </ViewGroup>
            <ViewGroup title="ข้อกำหนดทั่วไป" hint={`ใช้ตั้งแต่ ${data.effective_from}`}>
              <ViewRow label="จำนวนวิชา TA สูงสุด/คน" value={`${data.max_courses_per_student ?? 3} วิชา`} />
            </ViewGroup>
            <ViewGroup title="สูตรคำนวณโหลด TA ปริญญาตรี">
              <ViewRow label="ชั่วโมงบรรยาย / หน่วยกิต" value={data.ug_lecture_hours_per_credit} />
              <ViewRow label="ชั่วโมงปฏิบัติ / หน่วยกิต" value={data.ug_lab_hours_per_credit} />
              <ViewRow label="Baseline นศ./sec บรรยาย" value={data.baseline_students_lecture} />
              <ViewRow label="Baseline นศ./sec ปฏิบัติ" value={data.baseline_students_lab} />
              <ViewRow label="Effective rate (บาท/ชั่วโมงสัปดาห์/เดือน)" value={data.ug_workload_rate_regular} />
            </ViewGroup>

            <button
              type="button"
              onClick={() => setShowFormula(true)}
              className="w-full rounded-lg border border-accent/30 bg-accent-soft/40 hover:bg-accent-soft transition-colors p-4 text-left flex items-center gap-3 group"
            >
              <span className="w-10 h-10 rounded-lg bg-accent text-accent-foreground flex items-center justify-center shrink-0">
                <Sparkles size={18} />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">ดูตัวอย่างการคำนวณทีละขั้น</span>
                <span className="block text-xs text-muted mt-0.5">
                  ใช้ค่า rate ปัจจุบันด้านบน + วิชาตัวอย่าง 2 หน่วยกิตบรรยาย + 1 หน่วยกิตปฏิบัติ + 5 นักศึกษาภาคปกติ
                </span>
              </span>
              <span className="text-muted group-hover:text-accent transition-colors">→</span>
            </button>
          </div>
        ) : (
          <div className="text-sm text-muted py-4">ยังไม่มีอัตราค่าตอบแทน — กด "แก้ไข" เพื่อกำหนดครั้งแรก</div>
        )
      )}

      {/* Edit mode */}
      {editing && (
        <div className="space-y-6">
          <EditGroup title="อัตราค่าจ้าง — ปริญญาตรี" description="ค่าตอบแทน TA ต่อชั่วโมง">
            <F label="ตรี ปกติ (บาท/ชั่วโมง)" type="number" min={0} value={draft.undergrad_regular}
               error={rateErrors.undergrad_regular}
               onChange={v => setDraft({ ...draft, undergrad_regular: Number(v) })} />
            <F label="ชั่วโมงสูงสุด/วัน (ปกติ)" type="number" min={0} value={draft.ug_max_hours_per_day}
               error={rateErrors.ug_max_hours_per_day}
               onChange={v => setDraft({ ...draft, ug_max_hours_per_day: Number(v) })} />
            <F label="ตรี พิเศษ (บาท/ชั่วโมง)" type="number" min={0} value={draft.undergrad_special}
               error={rateErrors.undergrad_special}
               onChange={v => setDraft({ ...draft, undergrad_special: Number(v) })} />
          </EditGroup>

          <EditGroup title="อัตราค่าจ้าง — บัณฑิตศึกษา (โท/เอก)" description="ปกติเป็นรายชั่วโมง, พิเศษเป็นเหมาจ่ายต่อเดือน">
            <F label="ภาคปกติ" type="number" min={0} value={draft.graduate_regular}
               error={rateErrors.graduate_regular}
               onChange={v => setDraft({ ...draft, graduate_regular: Number(v) })} />
            <F label="ภาคพิเศษ (เหมาจ่าย)" type="number" min={0} value={draft.graduate_special_lumpsum}
               error={rateErrors.graduate_special_lumpsum}
               onChange={v => setDraft({ ...draft, graduate_special_lumpsum: Number(v) })} />
          </EditGroup>

          <EditGroup title="ข้อกำหนดทั่วไป" description="เริ่มใช้เมื่อไร + ข้อจำกัดตามระเบียบ (จำนวนเดือนของแต่ละเทอมกำหนดที่แท็บ 'ภาคเรียน')">
            <F label="เริ่มใช้" type="date" value={draft.effective_from}
               error={effectiveFromError}
               onChange={v => setDraft({ ...draft, effective_from: v })} />
            <F label="จำนวนวิชา TA สูงสุด/คน" type="number" min={0} value={draft.max_courses_per_student}
               error={rateErrors.max_courses_per_student}
               onChange={v => setDraft({ ...draft, max_courses_per_student: Number(v) })} />
          </EditGroup>

          {effectiveFromPast && (
            <Alert
              status="warning"
              icon={<CircleAlert size={16} />}
              title="วันเริ่มใช้เป็นวันในอดีต"
              description="เวอร์ชันนี้จะเริ่มใช้ย้อนหลัง อาจกระทบการคำนวณค่าจ้างของรายการที่ผ่านมา — โปรดตรวจสอบก่อนบันทึก"
            />
          )}

          <EditGroup
            title="สูตรคำนวณโหลด TA ปริญญาตรี"
            description="ตามชีต 2_59 ป.ตรี — ปกติ/พิเศษ ใช้ effective rate เดียวกัน (default 300 = 50% × 200 ตรี + 50% × 400 บัณฑิต)"
          >
            <F label="ชั่วโมงบรรยาย / หน่วยกิต" type="number" min={0} value={draft.ug_lecture_hours_per_credit}
               error={rateErrors.ug_lecture_hours_per_credit}
               onChange={v => setDraft({ ...draft, ug_lecture_hours_per_credit: Number(v) })} />
            <F label="ชั่วโมงปฏิบัติ / หน่วยกิต" type="number" min={0} value={draft.ug_lab_hours_per_credit}
               error={rateErrors.ug_lab_hours_per_credit}
               onChange={v => setDraft({ ...draft, ug_lab_hours_per_credit: Number(v) })} />
            <F label="Baseline นักศึกษา/section บรรยาย" type="number" min={0} value={draft.baseline_students_lecture}
               error={rateErrors.baseline_students_lecture}
               onChange={v => setDraft({ ...draft, baseline_students_lecture: Number(v) })} />
            <F label="Baseline นักศึกษา/section ปฏิบัติ" type="number" min={0} value={draft.baseline_students_lab}
               error={rateErrors.baseline_students_lab}
               onChange={v => setDraft({ ...draft, baseline_students_lab: Number(v) })} />
            <F label="Effective rate (บาท/ชั่วโมง/สัปดาห์/เดือน)" type="number" min={0} value={draft.ug_workload_rate_regular}
               error={rateErrors.ug_workload_rate_regular}
               onChange={v => setDraft({ ...draft, ug_workload_rate_regular: Number(v) })} />
          </EditGroup>
        </div>
      )}

      <ConfirmSaveModal
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={doSave}
        saving={saving}
        title="ยืนยันสร้างเวอร์ชันใหม่?"
        description={`ระบบจะสร้างอัตราค่าตอบแทนเวอร์ชันใหม่ เริ่มใช้ ${draft.effective_from} เวอร์ชันเก่ายังเก็บไว้เป็นประวัติ`}
      />

      <FormulaHelpModal
        open={showFormula}
        onClose={() => setShowFormula(false)}
        constants={{
          hrsPerLecCr: (editing ? draft : (data ?? draft)).ug_lecture_hours_per_credit,
          hrsPerLabCr: (editing ? draft : (data ?? draft)).ug_lab_hours_per_credit,
          baseLec:     (editing ? draft : (data ?? draft)).baseline_students_lecture,
          baseLab:     (editing ? draft : (data ?? draft)).baseline_students_lab,
          rate:        (editing ? draft : (data ?? draft)).ug_workload_rate_regular,
          termMonths:  (editing ? draft : (data ?? draft)).term_months || 4,
        }}
        example={{
          lecCr: 2, labCr: 1, students: 5,
          trackLabel: "ภาคปกติ (ตัวอย่าง)",
          courseName: "ตัวอย่าง — SW-TESTING (3 นก.)",
        }}
      />
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Hour cap — table + modal-based add / edit                                   */
/* -------------------------------------------------------------------------- */

function HourCapSection() {
  const { data } = useSWR<Cap[]>("/settings/hour-caps");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCap, setEditingCap] = useState<Cap | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Cap | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openAdd() {
    setEditingCap(null);
    setModalOpen(true);
  }
  function openEdit(cap: Cap) {
    setEditingCap(cap);
    setModalOpen(true);
  }
  function handleSaved(msg: string) {
    toast.success(msg);
    setModalOpen(false);
  }
  async function doDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.del(`/settings/hour-caps/${deleteTarget.credits}`);
      await mutate("/settings/hour-caps");
      toast.success(`ลบเพดาน ${deleteTarget.credits} หน่วยกิต เรียบร้อยแล้ว`);
      setDeleteTarget(null);
    } catch (e) {
      toast.danger("ลบไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Panel
      title="เพดานชั่วโมงต่อหน่วยกิต"
      description="ชั่วโมง TA สูงสุดตามหน่วยกิตของวิชา"
      actions={
        <Button variant="primary" onClick={openAdd}>
          <Plus size={14} />เพิ่มเพดาน
        </Button>
      }
    >
      {(data?.length ?? 0) > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>หน่วยกิต</th>
                <th className="num">ชั่วโมงสูงสุด</th>
                <th className="actions" />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).slice().sort((a, b) => a.credits - b.credits).map(c => (
                <tr key={c.credits}>
                  <td className="tabular">{c.credits}</td>
                  <td className="num tabular">{c.hours_cap}</td>
                  <td className="actions">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                        <Pencil size={13} />แก้ไข
                      </Button>
                      <Button variant="danger-soft" size="sm" onClick={() => setDeleteTarget(c)}>
                        <Trash2 size={13} />ลบ
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm text-muted py-4">ยังไม่มีข้อมูล — กด "เพิ่มเพดาน" เพื่อเริ่ม</div>
      )}

      <HourCapModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editingCap={editingCap}
        existing={data ?? []}
        onSaved={handleSaved}
      />

      <ConfirmSaveModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        saving={deleting}
        title="ยืนยันลบเพดานชั่วโมง?"
        description={
          deleteTarget
            ? `ลบเพดานสำหรับ ${deleteTarget.credits} หน่วยกิต (${deleteTarget.hours_cap} ชั่วโมง) — การลบไม่สามารถย้อนกลับได้`
            : ""
        }
        variant="danger"
        confirmLabel="ลบ"
        confirmIcon={<Trash2 size={14} />}
      />
    </Panel>
  );
}

function HourCapModal({
  open, onClose, editingCap, existing, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editingCap: Cap | null;              // null = add mode
  existing: Cap[];
  onSaved: (msg: string) => void;
}) {
  const isEdit = editingCap !== null;
  const [credits, setCredits] = useState<string>("");
  const [hoursCap, setHoursCap] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setCredits(editingCap ? String(editingCap.credits) : "");
      setHoursCap(editingCap ? String(editingCap.hours_cap) : "");
      setError(null);
    }
  }, [open, editingCap]);

  const creditsNum = Number(credits);
  const hoursCapNum = Number(hoursCap);
  const creditsValid = credits.trim() !== "" && Number.isInteger(creditsNum) && creditsNum > 0 && creditsNum <= 30;
  const hoursValid = hoursCap.trim() !== "" && !Number.isNaN(hoursCapNum) && hoursCapNum > 0 && hoursCapNum <= 500;

  // In edit mode, credits is locked (users can only change hours_cap).
  // Duplicate detection only matters in add mode.
  const duplicate = !isEdit ? existing.find(c => c.credits === creditsNum) : null;

  const creditsError =
    credits.trim() === "" ? null :
    !Number.isInteger(creditsNum) ? "หน่วยกิตต้องเป็นจำนวนเต็ม" :
    creditsNum <= 0 ? "หน่วยกิตต้องมากกว่า 0" :
    creditsNum > 30 ? "หน่วยกิตดูสูงเกินไป (สูงสุด 30)" :
    null;
  const hoursError =
    hoursCap.trim() === "" ? null :
    Number.isNaN(hoursCapNum) ? "ชั่วโมงต้องเป็นตัวเลข" :
    hoursCapNum <= 0 ? "ชั่วโมงต้องมากกว่า 0" :
    hoursCapNum > 500 ? "ชั่วโมงดูสูงเกินไป (สูงสุด 500)" :
    null;

  const noChange = isEdit && editingCap && hoursCapNum === editingCap.hours_cap;
  const canSave = creditsValid && hoursValid && !noChange;

  function askSave() {
    setError(null);
    if (!canSave) return;
    // Confirm when overwriting an existing row (add mode with duplicate) or on any edit
    if (duplicate || isEdit) {
      setConfirming(true);
    } else {
      doSave();
    }
  }
  async function doSave() {
    setSaving(true);
    try {
      await api.post("/settings/hour-caps", { credits: creditsNum, hours_cap: hoursCapNum });
      await mutate("/settings/hour-caps");
      const verb = isEdit ? "อัปเดต" : duplicate ? "แทนที่" : "เพิ่ม";
      onSaved(`${verb}เพดาน ${creditsNum} หน่วยกิต → ${hoursCapNum} ชั่วโมง เรียบร้อยแล้ว`);
      setConfirming(false);
    } catch (e) {
      setError((e as Error).message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={isEdit ? `แก้ไขเพดานชั่วโมง — ${editingCap!.credits} หน่วยกิต` : "เพิ่มเพดานชั่วโมงใหม่"}
        icon={<Plus size={20} />}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
            <Button variant="primary" onClick={askSave} disabled={!canSave || saving} isPending={saving}>
              <Save size={14} />บันทึก
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FieldGroup
            label="หน่วยกิต"
            hint={isEdit ? "แก้ไขไม่ได้ — หากต้องการเปลี่ยน ให้ลบและเพิ่มใหม่" : "ตัวเลขจำนวนเต็ม 1–30"}
            error={creditsError ?? undefined}
          >
            <TextInput
              type="number" min={1} max={30} step={1}
              value={credits}
              disabled={isEdit}
              onChange={e => setCredits(e.target.value)}
              placeholder="เช่น 3"
            />
          </FieldGroup>

          <FieldGroup label="ชั่วโมงสูงสุด" hint="จำนวนชั่วโมง TA ต่อเทอมสำหรับหน่วยกิตนี้" error={hoursError ?? undefined}>
            <TextInput
              type="number" min={1} max={500} step={1}
              value={hoursCap}
              onChange={e => setHoursCap(e.target.value)}
              placeholder="เช่น 40"
              autoFocus={isEdit}
            />
          </FieldGroup>

          {duplicate && (
            <Alert
              status="warning"
              icon={<CircleAlert size={16} />}
              title={`หน่วยกิต ${duplicate.credits} มีอยู่แล้ว (${duplicate.hours_cap} ชม.)`}
              description={`ถ้าบันทึก จะแทนที่ค่าเดิม ${duplicate.hours_cap} → ${hoursCapNum || "?"} ชั่วโมง`}
            />
          )}

          {noChange && (
            <div className="text-xs text-muted">ยังไม่มีการเปลี่ยนแปลง</div>
          )}

          {error && (
            <Alert status="danger" icon={<CircleAlert size={16} />} title="บันทึกไม่สำเร็จ" description={error} />
          )}
        </div>
      </Modal>

      <ConfirmSaveModal
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={doSave}
        saving={saving}
        title={duplicate ? "ยืนยันแทนที่ค่าเดิม?" : "ยืนยันบันทึก?"}
        description={
          duplicate
            ? `หน่วยกิต ${creditsNum} เคยมี ${duplicate.hours_cap} ชั่วโมง จะเปลี่ยนเป็น ${hoursCapNum} ชั่วโมง`
            : `บันทึกเพดาน ${creditsNum} หน่วยกิต → ${hoursCapNum} ชั่วโมง`
        }
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Faculty courses                                                            */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 10;

function FacultyCoursesSection() {
  const { data } = useSWR<FC[]>("/faculty-courses");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<FC | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<FC | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [page, setPage] = useState(1);

  function openAdd() { setEditingCourse(null); setFormOpen(true); }
  function openEdit(c: FC) { setEditingCourse(c); setFormOpen(true); }

  const all = data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(c => {
      if (statusFilter === "active" && !c.is_active) return false;
      if (statusFilter === "inactive" && c.is_active) return false;
      if (q === "") return true;
      return (
        c.code.toLowerCase().includes(q) ||
        c.name_th.toLowerCase().includes(q) ||
        (c.name_en?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [all, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  return (
    <Panel
      title="รายวิชาของคณะ"
      description="รายวิชาหลักสูตรที่ใช้อ้างอิงการเปิดสอน"
      actions={
        <Button variant="primary" onClick={openAdd}>
          <Plus size={14} />เพิ่มวิชา
        </Button>
      }
    >
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-[220px]">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="ค้นหารหัสหรือชื่อวิชา…"
            ariaLabel="ค้นหารายวิชา"
          />
        </div>
        <FieldGroup label="สถานะ">
          <Select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="min-w-[140px]"
          >
            <option value="active">เปิดใช้งาน</option>
            <option value="inactive">ปิดใช้งาน</option>
            <option value="all">ทั้งหมด</option>
          </Select>
        </FieldGroup>
      </div>

      {all.length === 0 ? (
        <div className="text-sm text-muted py-4">ยังไม่มีรายวิชา — กด "เพิ่มวิชา" เพื่อเริ่ม</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted py-4">
          ไม่พบรายวิชาที่ตรงกับ "{search}"{statusFilter !== "all" && ` (สถานะ: ${statusFilter === "active" ? "เปิดใช้งาน" : "ปิดใช้งาน"})`}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>ชื่อ</th>
                  <th className="tabular" title="หน่วยกิต(บรรยาย-ปฏิบัติ-ศึกษาเอง)">หน่วยกิต (REG)</th>
                  <th>สถานะ</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map(c => (
                  <tr key={c.id} className={!c.is_active ? "opacity-60" : ""}>
                    <td className="font-medium tabular">{c.code}</td>
                    <td>{c.name_th}</td>
                    <td className="tabular font-medium">
                      {c.credits}({c.lecture_hrs}-{c.lab_hrs}-{c.self_hrs})
                    </td>
                    <td>
                      {c.is_active
                        ? <Chip tone="success">เปิดใช้งาน</Chip>
                        : <Chip tone="neutral">ปิดใช้งาน</Chip>}
                    </td>
                    <td className="actions">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                          <Pencil size={13} /> แก้ไข
                        </Button>
                        {c.is_active && (
                          <Button variant="danger-soft" size="sm" onClick={() => setDeactivateTarget(c)}>
                            <Trash2 size={13} /> ปิด
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted tabular">
              แสดง {startIdx}–{endIdx} จาก {filtered.length} รายการ
            </div>
            {totalPages > 1 && (
              <Pagination size="sm">
                <Pagination.Content>
                  <Pagination.Item>
                    <Pagination.Previous
                      isDisabled={currentPage === 1}
                      onPress={() => setPage(p => Math.max(1, p - 1))}
                    >
                      <Pagination.PreviousIcon />
                    </Pagination.Previous>
                  </Pagination.Item>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <Pagination.Item key={p}>
                      <Pagination.Link isActive={p === currentPage} onPress={() => setPage(p)}>
                        {p}
                      </Pagination.Link>
                    </Pagination.Item>
                  ))}
                  <Pagination.Item>
                    <Pagination.Next
                      isDisabled={currentPage === totalPages}
                      onPress={() => setPage(p => Math.min(totalPages, p + 1))}
                    >
                      <Pagination.NextIcon />
                    </Pagination.Next>
                  </Pagination.Item>
                </Pagination.Content>
              </Pagination>
            )}
          </div>
        </>
      )}

      <FacultyCourseFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editingCourse}
        existing={data ?? []}
        onSaved={(code, mode) => {
          setFormOpen(false);
          toast.success(mode === "edit" ? `แก้ไขวิชา ${code} เรียบร้อยแล้ว` : `เพิ่มวิชา ${code} เรียบร้อยแล้ว`);
        }}
      />

      <FacultyCourseDeactivateModal
        target={deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onDone={code => { setDeactivateTarget(null); toast.success(`ปิดใช้งานวิชา ${code} เรียบร้อยแล้ว`); }}
      />
    </Panel>
  );
}

function FacultyCourseFormModal({
  open, onClose, editing, existing, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: FC | null;                       // null = add mode
  existing: FC[];
  onSaved: (code: string, mode: "add" | "edit") => void;
}) {
  const isEdit = editing !== null;
  const empty: FC = {
    code: "", name_th: "", credits: 3, lecture_hrs: 3, lab_hrs: 0, self_hrs: 6, is_active: true,
  };
  const [draft, setDraft] = useState<FC>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(editing ?? empty);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const codeTrim = draft.code.trim();
  const nameTrim = draft.name_th.trim();

  const codeError =
    codeTrim === "" ? null :
    codeTrim.length < 3 ? "รหัสวิชาสั้นเกินไป" :
    codeTrim.length > 20 ? "รหัสวิชายาวเกินไป" :
    null;
  // Duplicate check — case-insensitive, includes ACTIVE + INACTIVE, excludes self (in edit mode).
  const duplicate = codeTrim
    ? existing.find(c =>
        c.code.toLowerCase() === codeTrim.toLowerCase() &&
        (!isEdit || c.id !== editing!.id))
    : null;
  const creditsError =
    !Number.isInteger(draft.credits) || draft.credits <= 0 ? "หน่วยกิตต้องเป็นจำนวนเต็ม > 0" :
    draft.credits > 30 ? "หน่วยกิตดูสูงเกินไป" : null;
  const hoursError =
    draft.lecture_hrs < 0 || draft.lab_hrs < 0 || draft.self_hrs < 0
      ? "ชั่วโมงต้องไม่เป็นค่าลบ" : null;

  const noChange = isEdit && editing &&
    codeTrim === editing.code &&
    nameTrim === editing.name_th &&
    draft.credits === editing.credits &&
    draft.lecture_hrs === editing.lecture_hrs &&
    draft.lab_hrs === editing.lab_hrs &&
    draft.self_hrs === editing.self_hrs;

  const canSave =
    codeTrim !== "" && nameTrim !== "" &&
    !codeError && !creditsError && !hoursError && !duplicate && !noChange;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...draft,
        code: codeTrim,
        name_th: nameTrim,
        // In edit mode, keep the existing id so backend does UPDATE (not INSERT).
        ...(isEdit && editing ? { id: editing.id } : {}),
      };
      await api.post("/faculty-courses", payload);
      await mutate("/faculty-courses");
      onSaved(codeTrim, isEdit ? "edit" : "add");
    } catch (e) {
      setError((e as Error).message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const regFormat = `${draft.credits}(${draft.lecture_hrs}-${draft.lab_hrs}-${draft.self_hrs})`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          {isEdit ? <Pencil size={18} /> : <Plus size={18} />}
          {isEdit ? `แก้ไขวิชา ${editing!.code}` : "เพิ่มวิชาใหม่"}
        </span>
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" onClick={save} disabled={!canSave || saving} isPending={saving}>
            {isEdit ? <><Save size={14} />บันทึกการแก้ไข</> : <><Plus size={14} />เพิ่มวิชา</>}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-4 sm:col-span-1">
            <FieldGroup
              label="รหัสวิชา"
              hint="6–8 ตัว · ห้ามซ้ำกับที่มีอยู่ (รวมทั้งที่ปิดใช้งาน)"
              error={codeError ?? undefined}
            >
              <TextInput
                value={draft.code}
                onChange={e => setDraft({ ...draft, code: e.target.value })}
                placeholder="342235"
                maxLength={20}
                autoFocus={!isEdit}
              />
            </FieldGroup>
          </div>
          <div className="col-span-4 sm:col-span-3">
            <FieldGroup label="ชื่อวิชา (TH)">
              <TextInput
                value={draft.name_th}
                onChange={e => setDraft({ ...draft, name_th: e.target.value })}
                placeholder="เช่น SOFTWARE TESTING AND QUALITY ASSURANCE"
              />
            </FieldGroup>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <FieldGroup label="หน่วยกิต" error={creditsError ?? undefined}>
            <TextInput type="number" min={1} max={30} step={1}
              value={draft.credits}
              onChange={e => setDraft({ ...draft, credits: Number(e.target.value) })} />
          </FieldGroup>
          <FieldGroup label="ชม.บรรยาย" error={hoursError ?? undefined}>
            <TextInput type="number" min={0}
              value={draft.lecture_hrs}
              onChange={e => setDraft({ ...draft, lecture_hrs: Number(e.target.value) })} />
          </FieldGroup>
          <FieldGroup label="ชม.ปฏิบัติ">
            <TextInput type="number" min={0}
              value={draft.lab_hrs}
              onChange={e => setDraft({ ...draft, lab_hrs: Number(e.target.value) })} />
          </FieldGroup>
          <FieldGroup label="ชม.ศึกษาเอง">
            <TextInput type="number" min={0}
              value={draft.self_hrs}
              onChange={e => setDraft({ ...draft, self_hrs: Number(e.target.value) })} />
          </FieldGroup>
        </div>

        <div className="rounded-lg border border-border bg-accent-soft/40 p-3 flex items-center gap-3">
          <div className="text-xs text-muted uppercase tracking-wider">ตามรูปแบบ REG</div>
          <div className="text-lg font-semibold tabular">{regFormat}</div>
          <div className="text-xs text-muted ml-auto">= หน่วยกิต(บรรยาย-ปฏิบัติ-ศึกษาเอง)</div>
        </div>

        {duplicate && (
          <Alert
            status="danger"
            icon={<CircleAlert size={16} />}
            title={`รหัสวิชา ${duplicate.code} มีอยู่แล้ว`}
            description={`ชื่อปัจจุบัน: ${duplicate.name_th} (${duplicate.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}) — โปรดใช้รหัสอื่น`}
          />
        )}

        {noChange && (
          <div className="text-xs text-muted">ยังไม่มีการเปลี่ยนแปลง</div>
        )}

        {error && (
          <Alert status="danger" icon={<CircleAlert size={16} />} title="บันทึกไม่สำเร็จ" description={error} />
        )}
      </div>
    </Modal>
  );
}

function FacultyCourseDeactivateModal({
  target, onClose, onDone,
}: {
  target: FC | null;
  onClose: () => void;
  onDone: (code: string) => void;
}) {
  const open = target !== null;
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setTyped(""); setError(null); }
  }, [open]);

  if (!target) {
    return (
      <Modal open={false} onClose={onClose} title="">
        <span />
      </Modal>
    );
  }

  const codeMatch = typed.trim() === target.code;

  async function doDeactivate() {
    if (!codeMatch || !target) return;
    setSaving(true);
    setError(null);
    try {
      await api.del(`/faculty-courses/${target.id}`);
      await mutate("/faculty-courses");
      onDone(target.code);
    } catch (e) {
      setError((e as Error).message || "ปิดใช้งานไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ยืนยันปิดใช้งานวิชา"
      icon={<CircleAlert size={20} />}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="danger" onClick={doDeactivate} disabled={!codeMatch || saving} isPending={saving}>
            <Trash2 size={14} />ปิดใช้งาน
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-slate-50 p-3">
          <div className="text-xs text-muted mb-1">วิชาที่จะปิดใช้งาน</div>
          <div className="tabular font-medium">{target.code}</div>
          <div className="text-sm">{target.name_th}</div>
          <div className="text-xs text-muted mt-1 tabular">
            REG: {target.credits}({target.lecture_hrs}-{target.lab_hrs}-{target.self_hrs})
          </div>
        </div>

        <div className="text-sm">
          การปิดใช้งานจะทำให้วิชานี้ไม่แสดงในตัวเลือกเปิดสอนใหม่ (ข้อมูลเก่ายังคงอยู่)
          — เพื่อยืนยัน กรุณาพิมพ์รหัสวิชา <b className="tabular">{target.code}</b> ด้านล่าง
        </div>

        <FieldGroup label={`พิมพ์รหัสวิชา "${target.code}" เพื่อยืนยัน`}>
          <TextInput
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={target.code}
            autoFocus
          />
        </FieldGroup>

        {typed.trim() !== "" && !codeMatch && (
          <div className="text-xs text-red-600">รหัสวิชาไม่ตรง</div>
        )}

        {error && (
          <Alert status="danger" icon={<CircleAlert size={16} />} title="ปิดใช้งานไม่สำเร็จ" description={error} />
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Terms                                                                      */
/* -------------------------------------------------------------------------- */

interface Term {
  id?: string;
  academic_year: number; semester: number;
  starts_on?: string; ends_on?: string;
  months: number;
  is_active: boolean;
}

interface TermUsage {
  teaching_courses: number;
  class_schedules: number;
  budget_allocations: number;
  request_windows: number;
}

const SEMESTER_LABELS: Record<number, string> = {
  1: "ภาคต้น",
  2: "ภาคปลาย",
  3: "ภาคฤดูร้อน",
};

function semesterLabel(n: number): string {
  return SEMESTER_LABELS[n] ?? `ภาค ${n}`;
}

function termLabel(t: Pick<Term, "academic_year" | "semester">) {
  return `${t.academic_year} ${semesterLabel(t.semester)}`;
}

const THAI_MONTHS_ABBR = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
] as const;

// "2569-06-22" or "2026-06-22" (ISO Gregorian) → "22 มิ.ย. 2569" (BE).
function formatThaiDate(iso?: string | null): string {
  if (!iso) return "—";
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return iso;
  const [y, m, d] = parts;
  if (m < 1 || m > 12) return iso;
  return `${d} ${THAI_MONTHS_ABBR[m - 1]} ${y + 543}`;
}

// Wrap a Thai-locale DatePicker around an ISO-YYYY-MM-DD string. The
// backend keeps Gregorian ISO, the picker just displays it in th-TH format
// (day-month-BE year with Thai month names).
function TermDateField({
  label, value, onChange, autoFocus,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  autoFocus?: boolean;
}) {
  let dv: DateValue | null = null;
  if (value) {
    try { dv = parseDate(value); } catch { dv = null; }
  }
  return (
    <I18nProvider locale="th-TH">
      <DatePicker
        aria-label={label}
        value={dv}
        onChange={v => onChange(v ? v.toString() : "")}
        autoFocus={autoFocus}
      >
        <DateField.Group fullWidth>
          <DateField.Input>
            {segment => <DateField.Segment segment={segment} />}
          </DateField.Input>
          <DateField.Suffix>
            <DatePicker.Trigger>
              <DatePicker.TriggerIndicator />
            </DatePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DatePicker.Popover>
          <Calendar aria-label={label}>
            <Calendar.Header>
              <Calendar.YearPickerTrigger>
                <Calendar.YearPickerTriggerHeading />
                <Calendar.YearPickerTriggerIndicator />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton slot="previous" />
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>
                {day => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
              </Calendar.GridHeader>
              <Calendar.GridBody>{date => <Calendar.Cell date={date} />}</Calendar.GridBody>
            </Calendar.Grid>
            <Calendar.YearPickerGrid>
              <Calendar.YearPickerGridBody>
                {({ year }) => <Calendar.YearPickerCell year={year} />}
              </Calendar.YearPickerGridBody>
            </Calendar.YearPickerGrid>
          </Calendar>
        </DatePicker.Popover>
      </DatePicker>
    </I18nProvider>
  );
}

// Client-only "pending years" — a year the user chose but hasn't populated
// with any term yet. Once a term is created for the year it becomes real and
// this entry is discarded. Cleared on refresh (that's fine — user just clicks
// "เพิ่มปีการศึกษา" again).
// How many most-recent years to load by default. Older years hide behind a
// "แสดงปีเก่ากว่านี้" button that widens the server-side year_from filter.
// Chosen small so users with 10+ years don't drown in whitespace.
const YEAR_PAGE_SIZE = 5;

const CURRENT_BE = new Date().getFullYear() + 543;

// Invalidate every /terms* SWR key so save/delete refresh both the paginated
// list and the total-year count. Using a matcher function is more resilient
// than exact-key strings, which drift as we add new query variants.
function mutateAllTerms() {
  return mutate(key => typeof key === "string" && key.startsWith("/terms"));
}

function TermsSection() {
  // Progressive load: start with the last N years, widen when the user asks.
  // Null = load everything (no filter).
  const [yearFromLimit, setYearFromLimit] = useState<number | null>(CURRENT_BE - YEAR_PAGE_SIZE + 1);
  const swrKey = yearFromLimit !== null ? `/terms?year_from=${yearFromLimit}` : "/terms";
  const { data } = useSWR<Term[]>(swrKey);
  // Cheap separate count so the "X จาก Y ปี" label is honest even before we
  // have loaded every year's rows.
  const { data: yearsCount } = useSWR<{ count: number }>("/terms/years/count");
  const totalYears = yearsCount?.count;
  const [pendingYears, setPendingYears] = useState<number[]>([]);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [prefillYear, setPrefillYear] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Term | null>(null);
  const [yearFilter, setYearFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Track whether we've done the initial auto-expand so subsequent data
  // refreshes (SWR revalidation) don't re-clobber the user's choices.
  const initialisedRef = useRef(false);

  const terms = useMemo(
    () => (data ?? []).slice().sort((a, b) =>
      b.academic_year !== a.academic_year
        ? b.academic_year - a.academic_year
        : a.semester - b.semester,
    ),
    [data],
  );
  const activeCount = terms.filter(t => t.is_active).length;

  // Group by academic year (desc). Include years that exist only in pendingYears.
  const grouped = useMemo(() => {
    const map = new Map<number, Term[]>();
    for (const t of terms) {
      if (!map.has(t.academic_year)) map.set(t.academic_year, []);
      map.get(t.academic_year)!.push(t);
    }
    for (const y of pendingYears) {
      if (!map.has(y)) map.set(y, []);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [terms, pendingYears]);

  const existingYears = useMemo(
    () => Array.from(new Set([...terms.map(t => t.academic_year), ...pendingYears])),
    [terms, pendingYears],
  );

  // Client-side substring filter across the loaded years. Server-side
  // pagination controls WHICH years are loaded; the search box just narrows
  // what's shown from those. If the user's query doesn't match any loaded
  // year, we prompt them to widen the range.
  const visibleGroups = useMemo(() => {
    const q = yearFilter.trim();
    if (!q) return grouped;
    return grouped.filter(([y]) => String(y).includes(q));
  }, [grouped, yearFilter]);

  // How many more years exist on the server beyond what we've loaded.
  const hiddenCount = totalYears !== undefined && yearFromLimit !== null
    ? Math.max(0, totalYears - grouped.length)
    : 0;

  // Auto-expand latest year on first load. Once the user has interacted (or
  // filtered), we hand back control — no more auto-clobbering.
  useEffect(() => {
    if (initialisedRef.current || grouped.length === 0) return;
    initialisedRef.current = true;
    setExpanded(new Set([String(grouped[0][0])]));
  }, [grouped]);

  // When searching, expand every match — helps when the user is hunting for a
  // specific term rather than browsing.
  useEffect(() => {
    if (!yearFilter.trim()) return;
    setExpanded(new Set(visibleGroups.map(([y]) => String(y))));
  }, [yearFilter, visibleGroups]);

  function openAddYear() { setYearPickerOpen(true); }
  function onYearPicked(year: number) {
    setYearPickerOpen(false);
    // Only remember as pending if it doesn't have terms yet.
    if (!terms.some(t => t.academic_year === year) && !pendingYears.includes(year)) {
      setPendingYears(ys => [...ys, year]);
    }
    setPrefillYear(year);
    setEditingTerm(null);
    setFormOpen(true);
    // Ensure the new year is visible + expanded.
    setExpanded(prev => new Set([...prev, String(year)]));
  }
  function openAddTerm(year: number) {
    setPrefillYear(year);
    setEditingTerm(null);
    setFormOpen(true);
  }
  function openEdit(t: Term) {
    setPrefillYear(null);
    setEditingTerm(t);
    setFormOpen(true);
  }
  function onSavedTerm(label: string, mode: "add" | "edit") {
    setFormOpen(false);
    // Once a real term exists for that year, drop the pending marker.
    if (prefillYear !== null) {
      setPendingYears(ys => ys.filter(y => y !== prefillYear));
    }
    toast.success(mode === "edit" ? `แก้ไข${label} เรียบร้อยแล้ว` : `เพิ่ม${label} เรียบร้อยแล้ว`);
  }

  return (
    <Panel
      title="ปีการศึกษา / ภาคเรียน"
      description="สร้างปีการศึกษาก่อน แล้วจึงเพิ่มภาคเรียนในปีนั้น (ภาคต้น / ภาคปลาย / ภาคฤดูร้อน)"
      actions={
        <Button variant="primary" onClick={openAddYear}>
          <Plus size={14} />เพิ่มปีการศึกษา
        </Button>
      }
    >
      {grouped.length === 0 ? (
        <div className="text-sm text-muted py-4">ยังไม่มีปีการศึกษา — กด "เพิ่มปีการศึกษา" เพื่อเริ่ม</div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[220px] max-w-sm">
              <SearchField
                value={yearFilter}
                onChange={setYearFilter}
                placeholder="ค้นหาปีการศึกษา… (เช่น 2568)"
                ariaLabel="ค้นหาปีการศึกษา"
              />
            </div>
            <div className="text-xs text-muted tabular ms-auto">
              {yearFilter.trim()
                ? `พบ ${visibleGroups.length} ปี`
                : totalYears !== undefined
                  ? `โหลด ${grouped.length} จาก ${totalYears} ปี`
                  : `${grouped.length} ปี`}
            </div>
          </div>

          {visibleGroups.length === 0 ? (
            <div className="space-y-2 py-6 text-center">
              <div className="text-sm text-muted">
                ไม่พบปีการศึกษา "{yearFilter}" ในที่โหลดไว้
              </div>
              {hiddenCount > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setYearFromLimit(null)}>
                  โหลดปีทั้งหมด ({hiddenCount} ปีที่ยังไม่โหลด) แล้วค้นใหม่
                </Button>
              )}
            </div>
          ) : (
            <Accordion
              allowsMultipleExpanded
              variant="surface"
              expandedKeys={expanded}
              onExpandedChange={keys => setExpanded(new Set(Array.from(keys as Set<React.Key>).map(String)))}
            >
              {(() => {
                // Only inject decade dividers when the visible list actually
                // spans multiple decades — otherwise the divider is noise.
                const decadesShown = new Set(visibleGroups.map(([y]) => Math.floor(y / 10) * 10));
                const showDecadeDividers = decadesShown.size > 1;
                let lastDecade: number | null = null;
                return visibleGroups.flatMap(([year, list]) => {
                  const decade = Math.floor(year / 10) * 10;
                  const nodes: React.ReactNode[] = [];
                  if (showDecadeDividers && decade !== lastDecade) {
                    nodes.push(
                      <div
                        key={`decade-${decade}`}
                        className="text-xs font-medium text-muted uppercase tracking-wider pt-3 pb-1 px-1 tabular"
                      >
                        ทศวรรษ {decade}
                      </div>
                    );
                    lastDecade = decade;
                  }
                  const usedSemesters = new Set(list.map(t => t.semester));
                  const hasEmptySlot = [1, 2, 3].some(s => !usedSemesters.has(s));
                  const hasActive = list.some(t => t.is_active);
                  nodes.push(
                    <Accordion.Item
                      key={year}
                      id={String(year)}
                      className={`border-l-4 ${hasActive ? "border-l-success" : "border-l-border"}`}
                    >
                    <Accordion.Heading>
                      <Accordion.Trigger>
                        <span className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-base font-bold tabular">ปีการศึกษา {year}</span>
                          <span className="text-xs text-muted">
                            {list.length > 0 ? `· ${list.length} ภาคเรียน` : "· ยังไม่ได้เพิ่มภาคเรียน"}
                          </span>
                          {hasActive && <Chip tone="success">active</Chip>}
                        </span>
                        <Accordion.Indicator />
                      </Accordion.Trigger>
                    </Accordion.Heading>
                    <Accordion.Panel>
                      <Accordion.Body>
                        <div className="flex justify-end mb-3">
                          {hasEmptySlot && (
                            <Button variant="secondary" size="sm" onClick={() => openAddTerm(year)}>
                              <Plus size={13} />เพิ่มภาคเรียน
                            </Button>
                          )}
                        </div>
                        {list.length === 0 ? (
                          <div className="text-sm text-muted py-4">
                            ยังไม่มีภาคเรียนในปีนี้ — กด "เพิ่มภาคเรียน" เพื่อเริ่ม
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="data-table w-full">
                              <thead>
                                <tr>
                                  <th>ภาคเรียน</th>
                                  <th>ช่วงวันสอน</th>
                                  <th className="num">จำนวนเดือน</th>
                                  <th>สถานะ</th>
                                  <th className="actions" />
                                </tr>
                              </thead>
                              <tbody>
                                {list.map(t => (
                                  <tr key={t.id}>
                                    <td className="font-medium">{semesterLabel(t.semester)}</td>
                                    <td className="text-muted text-sm">
                                      {formatThaiDate(t.starts_on)} → {formatThaiDate(t.ends_on)}
                                    </td>
                                    <td className="num tabular">{t.months ?? 4}</td>
                                    <td>
                                      {t.is_active
                                        ? <Chip tone="success">active</Chip>
                                        : <Chip tone="neutral">—</Chip>}
                                    </td>
                                    <td className="actions">
                                      <div className="inline-flex gap-1">
                                        <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                                          <Pencil size={13} />แก้ไข
                                        </Button>
                                        <Button variant="danger-soft" size="sm" onClick={() => setDeleteTarget(t)}>
                                          <Trash2 size={13} />ลบ
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </Accordion.Body>
                    </Accordion.Panel>
                  </Accordion.Item>
                  );
                  return nodes;
                });
              })()}
            </Accordion>
          )}

          {!yearFilter.trim() && hiddenCount > 0 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setYearFromLimit(v => (v === null ? null : v - YEAR_PAGE_SIZE))
                }
              >
                แสดงปีเก่ากว่านี้ ({hiddenCount} ปี)
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setYearFromLimit(null)}>
                โหลดทั้งหมด
              </Button>
            </div>
          )}
        </div>
      )}

      <YearPickerModal
        open={yearPickerOpen}
        onClose={() => setYearPickerOpen(false)}
        existingYears={existingYears}
        onPicked={onYearPicked}
      />

      <TermFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editingTerm}
        lockedYear={editingTerm ? editingTerm.academic_year : prefillYear}
        existing={terms}
        activeCount={activeCount}
        onSaved={onSavedTerm}
      />

      <TermDeleteModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDone={label => { setDeleteTarget(null); toast.success(`ลบ${label} เรียบร้อยแล้ว`); }}
      />
    </Panel>
  );
}

function YearPickerModal({
  open, onClose, existingYears, onPicked,
}: {
  open: boolean;
  onClose: () => void;
  existingYears: number[];
  onPicked: (year: number) => void;
}) {
  const [year, setYear] = useState<string>("");

  useEffect(() => {
    if (open) setYear(String(new Date().getFullYear() + 543));
  }, [open]);

  const yearNum = Number(year);
  const yearError =
    year.trim() === "" ? null :
    !Number.isInteger(yearNum) ? "ปีการศึกษาต้องเป็นจำนวนเต็ม" :
    yearNum < 2500 || yearNum > 2700 ? "ปีการศึกษาต้องอยู่ระหว่าง 2500–2700 (พ.ศ.)" :
    null;
  const duplicate = year.trim() !== "" && existingYears.includes(yearNum);
  const canPick = year.trim() !== "" && !yearError && !duplicate;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Plus size={18} />เพิ่มปีการศึกษา
        </span>
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={() => onPicked(yearNum)} disabled={!canPick}>
            ถัดไป — เพิ่มภาคเรียน
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-sm text-muted">
          กรอกปีการศึกษาที่ต้องการสร้าง จากนั้นจะให้เพิ่มภาคเรียน (ต้น / ปลาย / ฤดูร้อน) ภายในปีนั้น
        </div>
        <FieldGroup
          label="ปีการศึกษา (พ.ศ.)"
          hint="เช่น 2568"
          error={yearError ?? undefined}
        >
          <TextInput
            type="number" min={2500} max={2700} step={1}
            value={year}
            onChange={e => setYear(e.target.value)}
            placeholder="2568"
            autoFocus
          />
        </FieldGroup>
        {duplicate && (
          <Alert
            status="warning"
            icon={<CircleAlert size={16} />}
            title={`ปีการศึกษา ${yearNum} มีอยู่แล้ว`}
            description="ให้ปิดหน้านี้แล้วเลื่อนลงไปที่กลุ่มของปีนั้น กด 'เพิ่มภาคเรียน' แทน"
          />
        )}
      </div>
    </Modal>
  );
}

// Difference in whole months between two YYYY-MM-DD strings (inclusive of
// partial months). Returns null if either date is empty.
function monthsBetween(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || s >= e) return null;
  const days = (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
  return Math.round((days / 30.4375) * 10) / 10;
}

function TermFormModal({
  open, onClose, editing, lockedYear, existing, activeCount, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: Term | null;
  // When set (and no editing target), the year field is disabled and only
  // unused semesters within this year are offered.
  lockedYear: number | null;
  existing: Term[];
  activeCount: number;
  onSaved: (label: string, mode: "add" | "edit") => void;
}) {
  const isEdit = editing !== null;
  const yearIsLocked = isEdit || lockedYear !== null;
  const [draft, setDraft] = useState<Term>(() => ({
    academic_year: new Date().getFullYear() + 543,
    semester: 1,
    months: 4,
    starts_on: "",
    ends_on: "",
    is_active: false,
  }));
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Semesters already used in the target year (excludes self when editing).
  const usedSemesters = useMemo(() => {
    const year = editing?.academic_year ?? lockedYear ?? draft.academic_year;
    return new Set(
      existing
        .filter(t => t.academic_year === year && (!editing || t.id !== editing.id))
        .map(t => t.semester),
    );
  }, [existing, editing, lockedYear, draft.academic_year]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDraft(editing);
    } else {
      const year = lockedYear ?? new Date().getFullYear() + 543;
      const usedForYear = new Set(
        existing.filter(t => t.academic_year === year).map(t => t.semester),
      );
      const nextSem = [1, 2, 3].find(s => !usedForYear.has(s)) ?? 1;
      setDraft({
        academic_year: year,
        semester: nextSem,
        months: 4,
        starts_on: "",
        ends_on: "",
        is_active: false,
      });
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, lockedYear]);

  const yearError =
    !Number.isInteger(draft.academic_year) ? "ปีการศึกษาต้องเป็นจำนวนเต็ม" :
    draft.academic_year < 2500 || draft.academic_year > 2700 ? "ปีการศึกษาต้องอยู่ระหว่าง 2500–2700 (พ.ศ.)" :
    null;
  const semesterError =
    ![1, 2, 3].includes(draft.semester) ? "ภาคเรียนต้องเป็น 1, 2 หรือ 3 (ฤดูร้อน)" : null;
  const monthsError =
    !Number.isFinite(draft.months) || draft.months < 1 || draft.months > 12
      ? "จำนวนเดือนต้องอยู่ระหว่าง 1–12" : null;
  const startsError =
    !draft.starts_on ? "กรุณาระบุวันเริ่มสอน" : null;
  const endsError =
    !draft.ends_on ? "กรุณาระบุวันสิ้นสุดสอน" :
    draft.starts_on && draft.ends_on && draft.starts_on >= draft.ends_on
      ? "วันสิ้นสุดต้องหลังวันเริ่ม" : null;

  // Duplicate (year, semester) — only relevant in add mode; edit mode locks these.
  const duplicate = !isEdit
    ? existing.find(t => t.academic_year === draft.academic_year && t.semester === draft.semester)
    : null;

  // Sanity: months vs actual date span.
  const spanMonths = monthsBetween(draft.starts_on, draft.ends_on);
  const spanMismatch =
    spanMonths !== null && Math.abs(spanMonths - draft.months) > 1
      ? { span: spanMonths, months: draft.months } : null;

  // Activating this term while others are already active.
  const willAddAnotherActive =
    draft.is_active && (!editing || !editing.is_active) && activeCount > 0;

  const noChange = isEdit && editing &&
    draft.months === editing.months &&
    (draft.starts_on ?? "") === (editing.starts_on ?? "") &&
    (draft.ends_on ?? "") === (editing.ends_on ?? "") &&
    draft.is_active === editing.is_active;

  const canSave =
    !yearError && !semesterError && !monthsError && !startsError && !endsError &&
    !duplicate && !noChange;

  function askSave() {
    setError(null);
    if (!canSave) return;
    setConfirming(true);
  }

  async function doSave() {
    setSaving(true);
    setError(null);
    try {
      const payload: Term = {
        ...draft,
        ...(isEdit && editing ? { id: editing.id } : {}),
      };
      await api.post("/terms", payload);
      await mutateAllTerms();
      onSaved(termLabel(draft), isEdit ? "edit" : "add");
      setConfirming(false);
    } catch (e) {
      setError((e as Error).message || "บันทึกไม่สำเร็จ");
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={
          <span className="inline-flex items-center gap-2">
            {isEdit ? <Pencil size={18} /> : <Plus size={18} />}
            {isEdit
              ? `แก้ไข${termLabel(editing!)}`
              : lockedYear !== null
                ? `เพิ่มภาคเรียน — ปีการศึกษา ${lockedYear}`
                : "เพิ่มภาคเรียนใหม่"}
          </span>
        }
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
            <Button variant="primary" onClick={askSave} disabled={!canSave || saving} isPending={saving}>
              <Save size={14} />{isEdit ? "บันทึกการแก้ไข" : "เพิ่มภาคเรียน"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {isEdit && (
            <Alert
              status="default"
              icon={<CircleAlert size={16} />}
              title="แก้ไขภาคเรียน — ล็อกคีย์หลัก"
              description="ปีการศึกษาและภาคเรียนล็อกไว้ เพราะเป็นตัวอ้างอิงของวิชาที่เปิดสอน / ตารางสอน TA / งบประมาณ — หากต้องเปลี่ยน ให้ลบและสร้างใหม่ (ต้องไม่มีข้อมูลอ้างอิงเหลืออยู่)"
            />
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <FieldGroup
              label="ปีการศึกษา (พ.ศ.)"
              hint={yearIsLocked ? (isEdit ? "ล็อกไม่ให้แก้" : "เลือกจากขั้นก่อนหน้า") : "เช่น 2568"}
              error={yearError ?? undefined}
            >
              <TextInput
                type="number" min={2500} max={2700} step={1}
                value={draft.academic_year}
                disabled={yearIsLocked}
                onChange={e => setDraft({ ...draft, academic_year: Number(e.target.value) })}
                autoFocus={!yearIsLocked}
              />
            </FieldGroup>
            <FieldGroup
              label="ภาคเรียน"
              hint={
                isEdit
                  ? "ล็อกไม่ให้แก้"
                  : usedSemesters.size > 0
                    ? `ภาคที่มีแล้ว: ${Array.from(usedSemesters).sort().map(semesterLabel).join(", ")}`
                    : "ต้น / ปลาย / ฤดูร้อน"
              }
              error={semesterError ?? undefined}
            >
              <Select
                value={String(draft.semester)}
                disabled={isEdit}
                onChange={e => setDraft({ ...draft, semester: Number(e.target.value) })}
                autoFocus={!isEdit && yearIsLocked}
              >
                {[1, 2, 3].map(s => (
                  <option
                    key={s}
                    value={String(s)}
                    disabled={!isEdit && usedSemesters.has(s)}
                  >
                    {semesterLabel(s)}{!isEdit && usedSemesters.has(s) ? " (มีแล้ว)" : ""}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <FieldGroup
              label="จำนวนเดือนที่เปิด"
              hint="ใช้คำนวณค่าจ้าง"
              error={monthsError ?? undefined}
            >
              <TextInput
                type="number" min={1} max={12} step={1}
                value={draft.months}
                onChange={e => setDraft({ ...draft, months: Number(e.target.value) })}
              />
            </FieldGroup>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldGroup label="วันที่เริ่มสอน" error={startsError ?? undefined}>
              <TermDateField
                label="วันที่เริ่มสอน"
                value={draft.starts_on ?? ""}
                onChange={v => setDraft({ ...draft, starts_on: v })}
              />
            </FieldGroup>
            <FieldGroup label="วันที่สิ้นสุดสอน" error={endsError ?? undefined}>
              <TermDateField
                label="วันที่สิ้นสุดสอน"
                value={draft.ends_on ?? ""}
                onChange={v => setDraft({ ...draft, ends_on: v })}
              />
            </FieldGroup>
          </div>

          <div className="rounded-lg border border-border p-3 flex items-center gap-2">
            <input
              id="term-active-modal"
              type="checkbox"
              checked={draft.is_active}
              onChange={e => setDraft({ ...draft, is_active: e.target.checked })}
            />
            <label htmlFor="term-active-modal" className="text-sm select-none">
              ตั้งเป็นภาคเรียนปัจจุบัน (active)
            </label>
          </div>

          {duplicate && (
            <Alert
              status="danger"
              icon={<CircleAlert size={16} />}
              title={`${termLabel(duplicate)} มีอยู่แล้ว`}
              description="ห้ามซ้ำ — หากต้องการแก้ไข ให้ปิดหน้านี้แล้วกด 'แก้ไข' ที่แถวนั้นแทน"
            />
          )}

          {spanMismatch && (
            <Alert
              status="warning"
              icon={<CircleAlert size={16} />}
              title="จำนวนเดือนไม่ตรงกับช่วงวันที่"
              description={`ช่วงวันที่เริ่ม–สิ้นสุดคือประมาณ ${spanMismatch.span} เดือน แต่กรอกไว้ ${spanMismatch.months} เดือน — ค่าจ้างอาจคำนวณไม่ตรงกับที่คาด`}
            />
          )}

          {willAddAnotherActive && (
            <Alert
              status="warning"
              icon={<CircleAlert size={16} />}
              title={`มีภาคเรียนที่ active อยู่ ${activeCount} รายการแล้ว`}
              description="ระบบยอมให้มีหลาย active พร้อมกัน แต่จะกำกวมว่าอันไหนคือภาคปัจจุบัน — แนะนำให้ปิด active ของภาคเดิมก่อน"
            />
          )}

          {noChange && (
            <div className="text-xs text-muted">ยังไม่มีการเปลี่ยนแปลง</div>
          )}

          {error && (
            <Alert status="danger" icon={<CircleAlert size={16} />} title="บันทึกไม่สำเร็จ" description={error} />
          )}
        </div>
      </Modal>

      <ConfirmSaveModal
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={doSave}
        saving={saving}
        title={isEdit ? "ยืนยันบันทึกการแก้ไข?" : "ยืนยันเพิ่มภาคเรียน?"}
        description={
          `${isEdit ? "อัปเดต" : "สร้าง"}${termLabel(draft)} — ${draft.months} เดือน, ${formatThaiDate(draft.starts_on)} → ${formatThaiDate(draft.ends_on)}${draft.is_active ? ", active" : ""}`
        }
      />
    </>
  );
}

function TermDeleteModal({
  target, onClose, onDone,
}: {
  target: Term | null;
  onClose: () => void;
  onDone: (label: string) => void;
}) {
  const open = target !== null;
  const [usage, setUsage] = useState<TermUsage | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !target?.id) return;
    setTyped("");
    setError(null);
    setUsage(null);
    setLoadingUsage(true);
    api.get<TermUsage>(`/terms/${target.id}/usage`)
      .then(setUsage)
      .catch(e => setError((e as Error).message || "โหลดข้อมูลอ้างอิงไม่สำเร็จ"))
      .finally(() => setLoadingUsage(false));
  }, [open, target?.id]);

  if (!target) {
    return (
      <Modal open={false} onClose={onClose} title="">
        <span />
      </Modal>
    );
  }

  const label = termLabel(target);
  // Confirmation code — easier to type than the Thai label, unambiguous per term.
  const confirmCode = `${target.academic_year}/${target.semester}`;
  const blocking =
    usage !== null &&
    usage.teaching_courses + usage.class_schedules + usage.budget_allocations > 0;
  const cascadeWindows = (usage?.request_windows ?? 0) > 0;
  const codeMatch = typed.trim() === confirmCode;
  const canDelete = !loadingUsage && usage !== null && !blocking && codeMatch;

  async function doDelete() {
    if (!canDelete || !target?.id) return;
    setSaving(true);
    setError(null);
    try {
      await api.del(`/terms/${target.id}`);
      await mutateAllTerms();
      onDone(label);
    } catch (e) {
      setError((e as Error).message || "ลบไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ยืนยันลบภาคเรียน"
      icon={<CircleAlert size={20} />}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="danger" onClick={doDelete} disabled={!canDelete || saving} isPending={saving}>
            <Trash2 size={14} />ลบภาคเรียน
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-slate-50 p-3">
          <div className="text-xs text-muted mb-1">ภาคเรียนที่จะลบ</div>
          <div className="tabular font-medium">{label}</div>
          <div className="text-xs text-muted mt-1">
            {formatThaiDate(target.starts_on)} → {formatThaiDate(target.ends_on)} · {target.months} เดือน
            {target.is_active && " · active"}
          </div>
        </div>

        {loadingUsage ? (
          <div className="text-sm text-muted">กำลังตรวจข้อมูลอ้างอิง…</div>
        ) : usage ? (
          <>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                ผลกระทบ
              </div>
              <ul className="text-sm space-y-1">
                <li className="flex justify-between">
                  <span>รายวิชาที่เปิดสอนในภาคนี้</span>
                  <span className={usage.teaching_courses > 0 ? "text-red-600 font-medium tabular" : "tabular"}>
                    {usage.teaching_courses}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span>ตารางสอน TA</span>
                  <span className={usage.class_schedules > 0 ? "text-red-600 font-medium tabular" : "tabular"}>
                    {usage.class_schedules}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span>งบประมาณที่ผูกไว้</span>
                  <span className={usage.budget_allocations > 0 ? "text-red-600 font-medium tabular" : "tabular"}>
                    {usage.budget_allocations}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span>รอบเปิดรับ TA (จะถูกลบตาม)</span>
                  <span className="tabular text-muted">{usage.request_windows}</span>
                </li>
              </ul>
            </div>

            {blocking ? (
              <Alert
                status="danger"
                icon={<CircleAlert size={16} />}
                title="ลบไม่ได้ — มีข้อมูลอ้างอิงอยู่"
                description="ต้องลบ/ปิดวิชาที่เปิดสอน ตารางสอน TA และงบประมาณของภาคเรียนนี้ก่อน จึงจะลบได้ (ป้องกันข้อมูลกำพร้า)"
              />
            ) : (
              <>
                {cascadeWindows && (
                  <Alert
                    status="warning"
                    icon={<CircleAlert size={16} />}
                    title={`รอบเปิดรับ TA จำนวน ${usage.request_windows} รายการจะถูกลบพร้อมกัน`}
                    description="ตารางรอบเปิดรับผูกกับภาคเรียนแบบ cascade — เมื่อลบภาคเรียนจะลบตามอัตโนมัติ"
                  />
                )}
                <div className="text-sm">
                  การลบไม่สามารถย้อนกลับได้ — เพื่อยืนยัน กรุณาพิมพ์ <b className="tabular">{confirmCode}</b> ด้านล่าง
                </div>
                <FieldGroup label={`พิมพ์ "${confirmCode}" เพื่อยืนยัน`}>
                  <TextInput
                    value={typed}
                    onChange={e => setTyped(e.target.value)}
                    placeholder={confirmCode}
                    autoFocus
                  />
                </FieldGroup>
                {typed.trim() !== "" && !codeMatch && (
                  <div className="text-xs text-red-600">รหัสไม่ตรง</div>
                )}
              </>
            )}
          </>
        ) : null}

        {error && (
          <Alert status="danger" icon={<CircleAlert size={16} />} title="ลบไม่สำเร็จ" description={error} />
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                */
/* -------------------------------------------------------------------------- */

function ViewGroup({
  title, hint, children,
}: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border border-l-4 bg-default/40 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-semibold">{title}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {children}
      </dl>
    </div>
  );
}

function ViewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between py-1 border-b border-border/50 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function EditGroup({
  title, description, children,
}: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border border-l-4 p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold">{title}</div>
        {description && <div className="text-xs text-muted mt-0.5">{description}</div>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {children}
      </div>
    </div>
  );
}

function F({
  label, value, onChange, type = "text", error, min,
}: { label: string; value: string | number; onChange: (v: string) => void; type?: string; error?: string | null; min?: number }) {
  return (
    <FieldGroup label={label} error={error ?? undefined}>
      <TextInput
        type={type}
        min={min}
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={e => onChange(e.target.value)}
      />
    </FieldGroup>
  );
}

/* Positive-number validators shared by the pay-rate editor. */
function vPositive(v: number): string | null {
  if (!Number.isFinite(v)) return "กรุณากรอกตัวเลข";
  if (v <= 0) return "ต้องมากกว่า 0";
  return null;
}
function vPositiveInt(v: number): string | null {
  if (!Number.isFinite(v)) return "กรุณากรอกตัวเลข";
  if (!Number.isInteger(v) || v <= 0) return "ต้องเป็นจำนวนเต็มมากกว่า 0";
  return null;
}

function ConfirmSaveModal({
  open, onClose, onConfirm, saving, title, description,
  variant = "primary", confirmLabel = "ยืนยันบันทึก", confirmIcon,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  saving: boolean; title: string; description: string;
  variant?: "primary" | "danger";
  confirmLabel?: string;
  confirmIcon?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={<CircleAlert size={20} />}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant={variant} onClick={onConfirm} isPending={saving}>
            {confirmIcon ?? <Check size={14} />}{confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm">{description}</p>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* TA request windows — per-term open/close scheduling                         */
/* -------------------------------------------------------------------------- */

interface RequestWindow {
  id: string;
  term_id: string;
  opens_at: string;
  closes_at: string;
  is_open: boolean;
  note?: string | null;
}

function windowStatus(w: RequestWindow, now = Date.now()) {
  const opens = new Date(w.opens_at).getTime();
  const closes = new Date(w.closes_at).getTime();
  if (!w.is_open) {
    if (now > closes) return { tone: "neutral" as const, label: "หมดเวลา + ปิดไว้" };
    return { tone: "warn" as const, label: "ปิดชั่วคราว" };
  }
  if (now < opens) return { tone: "info" as const, label: "ยังไม่เริ่ม" };
  if (now > closes) return { tone: "neutral" as const, label: "หมดเวลาแล้ว" };
  return { tone: "success" as const, label: "กำลังเปิดรับสมัคร" };
}

function RequestWindowsSection() {
  const { data: terms } = useSWR<Term[]>("/terms");
  const [termId, setTermId] = useState<string>("");
  useEffect(() => {
    if (termId || !terms?.length) return;
    const pick = terms.find(t => t.is_active) ?? terms[0];
    if (pick?.id) setTermId(pick.id);
  }, [terms, termId]);

  const swrKey = termId ? `/ta-request/windows?term_id=${termId}` : null;
  const { data: windows } = useSWR<RequestWindow[]>(swrKey);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RequestWindow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RequestWindow | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Double-fire guards for the per-row Switch and the "เปิดด่วน" quick action.
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [quickOpening, setQuickOpening] = useState(false);

  const noTerms = terms !== undefined && terms.length === 0;
  const term = terms?.find(t => t.id === termId);
  const list = windows ?? [];

  async function toggleOpen(w: RequestWindow, next: boolean) {
    if (togglingId) return;
    setTogglingId(w.id);
    try {
      await api.post("/ta-request/windows", { ...w, is_open: next });
      await mutate(swrKey);
      toast.success(next ? "เปิดรับคำขอแล้ว" : "ปิดรับคำขอชั่วคราว");
    } catch (e) {
      toast.danger("บันทึกไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setTogglingId(null);
    }
  }

  async function quickOpen30Days() {
    if (!termId || quickOpening) return;
    setQuickOpening(true);
    const now = new Date();
    // 30 calendar days from now — matches the label (the old +1 month was wrong).
    const end = new Date();
    end.setDate(end.getDate() + 30);
    try {
      await api.post("/ta-request/windows", {
        term_id: termId,
        opens_at: now.toISOString(),
        closes_at: end.toISOString(),
        is_open: true,
        note: "เปิดด่วน (30 วัน)",
      });
      await mutate(swrKey);
      toast.success("เปิดรับสมัครทันทีแล้ว", { description: "ระยะเวลา 30 วัน" });
    } catch (e) {
      toast.danger("เปิดไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setQuickOpening(false);
    }
  }
  async function doDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.del(`/ta-request/windows/${deleteTarget.id}`);
      await mutate(swrKey);
      toast.success("ลบช่วงเวลารับสมัครแล้ว");
      setDeleteTarget(null);
    } catch (e) {
      toast.danger("ลบไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Panel
      title="ระยะเวลารับสมัคร TA"
      description="กำหนดช่วงเวลาที่อาจารย์สามารถยื่นคำขอ TA ในแต่ละภาคเรียน — นอกช่วงนี้ระบบจะไม่รับคำขอ"
      actions={
        !noTerms && (
          <>
            <Select
              value={termId}
              onChange={e => setTermId(e.target.value)}
              className="max-w-xs"
            >
              {terms?.map(t => (
                <option key={t.id} value={t.id}>
                  {t.academic_year}/{t.semester}{t.is_active ? " (active)" : ""}
                </option>
              ))}
            </Select>
            <Button
              variant="primary"
              disabled={!termId}
              onClick={() => { setEditing(null); setFormOpen(true); }}
            >
              <Plus size={14} /> เพิ่มช่วงเวลา
            </Button>
          </>
        )
      }
    >
      {noTerms ? (
        <Alert
          status="warning"
          title="ยังไม่มีปีการศึกษา / ภาคเรียน"
          description="ต้องสร้างภาคเรียนที่แท็บ 'ภาคเรียน' ก่อน จึงจะกำหนดช่วงเวลารับสมัครได้"
        />
      ) : !windows ? (
        <div className="py-6 text-sm text-muted">กำลังโหลด…</div>
      ) : list.length === 0 ? (
        <div className="py-8 flex flex-col items-center gap-3 text-center border border-dashed border-hairline rounded-lg">
          <CalendarDays size={28} className="text-muted" />
          <div>
            <div className="text-sm font-medium">
              ยังไม่ได้เปิดรับคำขอ TA สำหรับ {term?.academic_year}/{term?.semester}
            </div>
            <div className="text-xs text-muted mt-1">
              อาจารย์จะยังไม่สามารถส่งคำขอในภาคเรียนนี้ได้จนกว่าจะกำหนดช่วงเวลา
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => { setEditing(null); setFormOpen(true); }}
            >
              <CalendarDays size={14} /> กำหนดช่วงเวลาเอง
            </Button>
            <Button
              variant="primary"
              onClick={quickOpen30Days}
              disabled={quickOpening}
              isPending={quickOpening}
            >
              <Power size={14} /> เปิดรับสมัครทันที (30 วัน)
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(w => {
            const st = windowStatus(w);
            return (
              <div
                key={w.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-panel px-4 py-3"
              >
                <Chip tone={st.tone}>{st.label}</Chip>
                <div className="flex flex-col min-w-0">
                  <div className="text-sm font-medium tabular">
                    {formatThaiDateTime(w.opens_at)} → {formatThaiDateTime(w.closes_at)}
                  </div>
                  {w.note && <div className="text-xs text-muted truncate">{w.note}</div>}
                </div>
                <div className="ms-auto flex items-center gap-2">
                  <Switch
                    isSelected={w.is_open}
                    onChange={sel => toggleOpen(w, sel)}
                    isDisabled={togglingId === w.id}
                    aria-label={w.is_open ? "ปิดชั่วคราว" : "เปิดรับ"}
                  >
                    <Switch.Content>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      <span className="text-xs">{w.is_open ? "เปิด" : "ปิด"}</span>
                    </Switch.Content>
                  </Switch>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setEditing(w); setFormOpen(true); }}
                  >
                    <Pencil size={14} /> แก้ไข
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(w)}
                  >
                    <Trash2 size={14} /> ลบ
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <WindowFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        termId={termId}
        editing={editing}
        onSaved={async () => {
          setFormOpen(false);
          await mutate(swrKey);
          toast.success(editing ? "แก้ไขช่วงเวลาแล้ว" : "เพิ่มช่วงเวลาแล้ว");
        }}
      />

      <ConfirmSaveModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        saving={deleting}
        variant="danger"
        confirmLabel="ลบ"
        confirmIcon={<Trash2 size={14} />}
        title="ลบช่วงเวลารับสมัคร?"
        description="การลบจะไม่มีผลกับคำขอที่ส่งมาก่อนหน้านี้ แต่จะไม่สามารถลบได้ถ้ามีคำขออ้างอิงช่วงเวลานี้อยู่"
      />
    </Panel>
  );
}

function formatThaiDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dateStr = `${d.getDate()} ${THAI_MONTHS_ABBR[d.getMonth()]} ${d.getFullYear() + 543}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${dateStr} ${hh}:${mm} น.`;
}

// "YYYY-MM-DDTHH:mm" (local wall-clock) ↔ ISO round-trip. We deliberately treat
// the input as local time so the picker matches what the staff typed.
function dateToLocalMinute(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}`;
}
function isoToLocalMinute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dateToLocalMinute(d);
}
function localMinuteToISO(local: string): string {
  // new Date("YYYY-MM-DDTHH:mm") is parsed as local time — exactly the intent.
  return new Date(local).toISOString();
}

// Date + time (minute precision) picker in Thai locale. Mirrors TermDateField
// but uses parseDateTime so the calendar exposes hour/minute segments.
function TermDateTimeField({
  label, value, onChange, autoFocus,
}: {
  label: string;
  value: string;
  onChange: (localMinute: string) => void;
  autoFocus?: boolean;
}) {
  let dv: DateValue | null = null;
  if (value) {
    // Accept "YYYY-MM-DDTHH:mm" (no seconds) — parseDateTime wants seconds.
    const withSec = value.length === 16 ? `${value}:00` : value;
    try { dv = parseDateTime(withSec); } catch { dv = null; }
  }
  return (
    <I18nProvider locale="th-TH">
      <DatePicker
        aria-label={label}
        value={dv}
        onChange={v => onChange(v ? v.toString().slice(0, 16) : "")}
        autoFocus={autoFocus}
        granularity="minute"
        hourCycle={24}
      >
        <DateField.Group fullWidth>
          <DateField.Input>
            {segment => <DateField.Segment segment={segment} />}
          </DateField.Input>
          <DateField.Suffix>
            <DatePicker.Trigger>
              <DatePicker.TriggerIndicator />
            </DatePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DatePicker.Popover>
          <Calendar aria-label={label}>
            <Calendar.Header>
              <Calendar.YearPickerTrigger>
                <Calendar.YearPickerTriggerHeading />
                <Calendar.YearPickerTriggerIndicator />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton slot="previous" />
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>
                {day => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
              </Calendar.GridHeader>
              <Calendar.GridBody>{date => <Calendar.Cell date={date} />}</Calendar.GridBody>
            </Calendar.Grid>
            <Calendar.YearPickerGrid>
              <Calendar.YearPickerGridBody>
                {({ year }) => <Calendar.YearPickerCell year={year} />}
              </Calendar.YearPickerGridBody>
            </Calendar.YearPickerGrid>
          </Calendar>
        </DatePicker.Popover>
      </DatePicker>
    </I18nProvider>
  );
}

function WindowFormModal({
  open, onClose, termId, editing, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  termId: string;
  editing: RequestWindow | null;
  onSaved: () => void;
}) {
  // Local wall-clock strings in "YYYY-MM-DDTHH:mm" — timezone applied at submit.
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [isOpen, setIsOpen] = useState(true);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setOpensAt(isoToLocalMinute(editing.opens_at));
      setClosesAt(isoToLocalMinute(editing.closes_at));
      setIsOpen(editing.is_open);
      setNote(editing.note ?? "");
    } else {
      const now = new Date();
      const end = new Date();
      end.setDate(end.getDate() + 30);
      setOpensAt(dateToLocalMinute(now));
      setClosesAt(dateToLocalMinute(end));
      setIsOpen(true);
      setNote("");
    }
    setErr(null);
  }, [open, editing]);

  const canSave = !!termId && !!opensAt && !!closesAt && opensAt < closesAt;

  async function submit() {
    if (!canSave) {
      setErr("กรุณากรอกวันเวลาให้ครบและเวลาปิดต้องหลังเวลาเปิด");
      return;
    }
    setSaving(true); setErr(null);
    try {
      await api.post("/ta-request/windows", {
        id: editing?.id,
        term_id: termId,
        opens_at: localMinuteToISO(opensAt),
        closes_at: localMinuteToISO(closesAt),
        is_open: isOpen,
        note: note.trim() || null,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "แก้ไขช่วงเวลารับสมัคร" : "เพิ่มช่วงเวลารับสมัคร"}
      size="md"
      icon={<CalendarDays size={18} />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit} disabled={!canSave || saving} isPending={saving}>
            <Save size={14} /> บันทึก
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldGroup label="เริ่มรับสมัคร (วัน-เดือน-ปี เวลา)">
            <TermDateTimeField label="เวลาเริ่ม" value={opensAt} onChange={setOpensAt} />
          </FieldGroup>
          <FieldGroup label="ปิดรับสมัคร (วัน-เดือน-ปี เวลา)">
            <TermDateTimeField label="เวลาปิด" value={closesAt} onChange={setClosesAt} />
          </FieldGroup>
        </div>
        <FieldGroup label="สถานะ" hint="ปิดชั่วคราวเพื่อหยุดรับคำขอโดยไม่ต้องลบช่วงเวลา">
          <div className="flex items-center gap-3">
            <Switch isSelected={isOpen} onChange={setIsOpen} aria-label="สถานะเปิดรับ">
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <span>{isOpen ? "เปิดรับคำขอ" : "ปิดชั่วคราว"}</span>
              </Switch.Content>
            </Switch>
            {!isOpen && <PowerOff size={14} className="text-muted" />}
          </div>
        </FieldGroup>
        <FieldGroup label="หมายเหตุ (ถ้ามี)">
          <TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น 'รอบแรก' หรือ 'ขยายเวลาให้ CS'" />
        </FieldGroup>
        {err && <Alert status="danger" title="บันทึกไม่สำเร็จ" description={err} />}
      </div>
    </Modal>
  );
}
