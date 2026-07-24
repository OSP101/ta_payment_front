"use client";
import { use, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { CalendarOff, CheckCircle2, AlertTriangle, Plus, Pencil, Trash2, MapPin } from "lucide-react";
import { api } from "../../../../lib/api";
import { notify } from "../../../../lib/notify";
import {
  PageHeader, Panel, Button, IconButton, TextInput, FieldGroup, Modal, Chip, Alert, ConfirmDialog, EmptyState,
  DatePicker, TimePicker,
} from "../../../../components/ui";

interface Makeup {
  id: string;
  makeup_date: string;
  start_time?: string;
  end_time?: string;
  note?: string;
}
interface AffectedSection {
  section_id: string;
  sec_no: string;
  track: string;
  kind: "lecture" | "lab";
  start_time: string;
  end_time: string;
  room?: string;
  makeup: Makeup | null;
}
interface HolidayImpact {
  original_date: string;
  day_of_week: number;
  holiday_name_th: string;
  affected_sections: AffectedSection[];
}
interface ImpactsResponse {
  impacts: HolidayImpact[];
  unresolved_count: number;
}
interface SectionSchedule {
  id: string;
  kind: "lecture" | "lab";
  day_of_week: number;
  start_time: string;
  end_time: string;
}
interface CourseMakeup {
  id: string;
  original_date: string;
  makeup_date: string;
  start_time?: string;
  end_time?: string;
  note?: string;
}
interface CourseSection {
  id: string;
  sec_no: string;
  track: string;
  schedules?: SectionSchedule[];
  makeups?: CourseMakeup[];
}
interface TC {
  id: string;
  code: string;
  name_th: string;
  sections?: CourseSection[];
}

const MONTH_TH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const DOW_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const KIND_LABEL: Record<string, string> = { lecture: "บรรยาย", lab: "ปฏิบัติการ" };

function formatThaiDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTH_TH[d.getMonth()]} ${d.getFullYear() + 543}`;
}

export default function LecturerHolidaysPage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  const { data: course } = useSWR<TC>(`/teaching-courses/${tcId}`);
  const { data: impacts, isLoading } = useSWR<ImpactsResponse>(`/teaching-courses/${tcId}/holiday-impacts`);

  const [editingSlot, setEditingSlot] = useState<{ impact: HolidayImpact; section: AffectedSection } | null>(null);
  const [deletingMakeup, setDeletingMakeup] = useState<{ sectionId: string; makeupId: string; date: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  async function refresh() {
    await Promise.all([
      mutate(`/teaching-courses/${tcId}/holiday-impacts`),
      mutate(`/teaching-courses/${tcId}`),
    ]);
  }

  // Makeups filed manually (for a class cancelled for a non-holiday reason —
  // illness, conference, etc.) don't appear in the holiday-impacts list, so
  // surface them here with their section so the lecturer can review/delete them.
  const holidayKeys = useMemo(() => {
    const set = new Set<string>();
    for (const imp of impacts?.impacts ?? []) {
      for (const sec of imp.affected_sections) set.add(`${sec.section_id}|${imp.original_date}`);
    }
    return set;
  }, [impacts]);
  const manualMakeups = useMemo(() => {
    const out: { section: CourseSection; makeup: CourseMakeup }[] = [];
    for (const sec of course?.sections ?? []) {
      for (const mk of sec.makeups ?? []) {
        if (!holidayKeys.has(`${sec.id}|${mk.original_date}`)) out.push({ section: sec, makeup: mk });
      }
    }
    return out.sort((a, b) => a.makeup.original_date.localeCompare(b.makeup.original_date));
  }, [course, holidayKeys]);

  async function handleDeleteMakeup() {
    if (!deletingMakeup) return;
    setDeleting(true);
    try {
      await api.del(`/teaching-courses/${tcId}/makeup/${deletingMakeup.sectionId}/${deletingMakeup.makeupId}`);
      notify.success("ลบวันชดเชยแล้ว");
      await refresh();
    } catch (e) {
      notify.error(e);
    } finally {
      setDeleting(false);
      setDeletingMakeup(null);
    }
  }

  const unresolvedCount = impacts?.unresolved_count ?? 0;

  return (
    <div>
      <PageHeader
        title="วันหยุดและวันชดเชย"
        description="วันหยุดที่ตรงกับคาบเรียนของรายวิชานี้ และสถานะการกำหนดวันชดเชย — TA จะลงชั่วโมงคาบที่ตกวันหยุดไม่ได้จนกว่าคุณจะกำหนดวันชดเชย"
        actions={
          <Button variant="secondary" onClick={() => setManualOpen(true)} disabled={!course?.sections?.length}>
            <Plus size={14} /> เพิ่มวันชดเชย (กรณีอื่น)
          </Button>
        }
      />

      {/* ไม่ใช่แค่ "แจ้งให้ทราบ" — ถ้าไม่ทำ TA เสียเงินจริง จึงใช้ระดับ danger
          และบอกผลที่ตามมาให้ชัดตั้งแต่บรรทัดแรก */}
      {unresolvedCount > 0 && (
        <Alert
          status="danger"
          icon={<AlertTriangle size={16} />}
          title={`ต้องดำเนินการ: ${unresolvedCount} คาบยังไม่ได้กำหนดวันชดเชย`}
          description={
            <>
              คาบเหล่านี้ตรงกับวันหยุด ระบบจะ<b>ข้ามวันนั้นในบันทึกเวลา</b> —
              {" "}<b>TA จะลงเวลาไม่ได้ และเบิกค่าตอบแทนของคาบนั้นไม่ได้</b>
              {" "}จนกว่าคุณจะกดปุ่ม “กำหนดวันชดเชย” ในทุกคาบด้านล่าง
            </>
          }
        />
      )}

      <div className="mt-4">
        {isLoading && !impacts ? (
          <Panel>
            <div className="flex justify-center py-10 text-sm text-muted">กำลังโหลด…</div>
          </Panel>
        ) : !impacts || impacts.impacts.length === 0 ? (
          <Panel>
            <EmptyState
              icon={<CheckCircle2 size={28} />}
              title="ไม่มีวันหยุดที่ตรงกับคาบเรียน"
              description="ตารางเทอมนี้ไม่มีวันหยุดที่กระทบคาบเรียนของรายวิชานี้"
            />
          </Panel>
        ) : (
          <div className="flex flex-col gap-3">
            {impacts.impacts.map(imp => (
              <Panel
                key={imp.original_date}
                title={
                  <span className="flex items-center gap-2">
                    <span className="text-base">{formatThaiDate(imp.original_date)}</span>
                    <span className="text-xs text-muted">({DOW_TH[imp.day_of_week]})</span>
                    <Chip tone="danger">{imp.holiday_name_th}</Chip>
                  </span>
                }
                description={`มี ${imp.affected_sections.length} คาบที่ได้รับผลกระทบ`}
                padded={false}
              >
                <div className="divide-y divide-(--hairline)">
                  {imp.affected_sections.map((sec, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-4 flex-wrap md:flex-nowrap">
                      <div className="w-44 shrink-0">
                        <div className="flex items-center gap-2">
                          <span className={
                            "inline-flex items-center justify-center min-w-8 h-6 px-2 rounded-full text-xs font-semibold tabular-nums " +
                            (sec.track === "special" ? "bg-warning-soft text-warning-soft-foreground" : "bg-accent-soft text-accent-soft-foreground")
                          }>
                            sec {sec.sec_no}
                          </span>
                          <Chip tone={sec.kind === "lab" ? "warn" : "info"}>{KIND_LABEL[sec.kind]}</Chip>
                        </div>
                        <div className="text-xs text-muted mt-1 flex items-center gap-1 tabular-nums">
                          {sec.start_time.slice(0, 5)}–{sec.end_time.slice(0, 5)}
                          {sec.room && <><MapPin size={11} className="ml-1" /> {sec.room}</>}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        {sec.makeup ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <CheckCircle2 size={16} className="text-success" />
                            <span className="text-sm font-medium">
                              ชดเชย: {formatThaiDate(sec.makeup.makeup_date)}
                            </span>
                            {sec.makeup.start_time && sec.makeup.end_time && (
                              <span className="text-xs text-muted tabular-nums">
                                {sec.makeup.start_time.slice(0, 5)}–{sec.makeup.end_time.slice(0, 5)}
                              </span>
                            )}
                            {sec.makeup.note && (
                              <span className="text-xs text-muted">— {sec.makeup.note}</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <AlertTriangle size={16} className="text-warning" />
                            <span className="text-sm text-warning-soft-foreground">ยังไม่ได้กำหนดวันชดเชย</span>
                          </div>
                        )}
                      </div>
                      {sec.makeup ? (
                        <div className="flex items-center gap-1">
                          <IconButton label="แก้ไข" variant="ghost" size="sm" onClick={() => setEditingSlot({ impact: imp, section: sec })}>
                            <Pencil size={14} />
                          </IconButton>
                          <IconButton
                            label="ลบ"
                            variant="ghost" size="sm"
                            onClick={() => setDeletingMakeup({
                              sectionId: sec.section_id,
                              makeupId: sec.makeup!.id,
                              date: sec.makeup!.makeup_date,
                            })}
                          >
                            <Trash2 size={14} />
                          </IconButton>
                        </div>
                      ) : (
                        <Button variant="primary" size="sm" onClick={() => setEditingSlot({ impact: imp, section: sec })}>
                          <Plus size={14} /> กำหนดวันชดเชย
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>

      {manualMakeups.length > 0 && (
        <Panel
          className="mt-4"
          title="วันชดเชยที่กำหนดเอง (กรณีอื่น)"
          description="วันชดเชยของคาบที่งดด้วยเหตุอื่นนอกจากวันหยุดราชการ"
          padded={false}
        >
          <div className="divide-y divide-(--hairline)">
            {manualMakeups.map(({ section, makeup }) => (
              <div key={makeup.id} className="flex items-center gap-3 p-4 flex-wrap md:flex-nowrap">
                <div className="w-44 shrink-0">
                  <span className={
                    "inline-flex items-center justify-center min-w-8 h-6 px-2 rounded-full text-xs font-semibold tabular-nums " +
                    (section.track === "special" ? "bg-warning-soft text-warning-soft-foreground" : "bg-accent-soft text-accent-soft-foreground")
                  }>
                    sec {section.sec_no}
                  </span>
                </div>
                <div className="flex-1 min-w-0 text-sm">
                  <span className="text-muted">งดวันที่ </span>
                  <span className="font-medium">{formatThaiDate(makeup.original_date)}</span>
                  <span className="text-muted"> → ชดเชย </span>
                  <span className="font-medium text-success">{formatThaiDate(makeup.makeup_date)}</span>
                  {makeup.start_time && makeup.end_time && (
                    <span className="text-xs text-muted tabular-nums"> · {makeup.start_time.slice(0, 5)}–{makeup.end_time.slice(0, 5)}</span>
                  )}
                  {makeup.note && <span className="text-xs text-muted"> — {makeup.note}</span>}
                </div>
                <IconButton
                  label="ลบ"
                  variant="ghost" size="sm"
                  onClick={() => setDeletingMakeup({ sectionId: section.id, makeupId: makeup.id, date: makeup.makeup_date })}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {editingSlot && (
        <MakeupFormModal
          tcId={tcId}
          impact={editingSlot.impact}
          section={editingSlot.section}
          onClose={() => setEditingSlot(null)}
          onSaved={async () => { setEditingSlot(null); await refresh(); }}
        />
      )}

      {manualOpen && (
        <ManualMakeupModal
          tcId={tcId}
          sections={course?.sections ?? []}
          onClose={() => setManualOpen(false)}
          onSaved={async () => { setManualOpen(false); await refresh(); }}
        />
      )}

      <ConfirmDialog
        open={!!deletingMakeup}
        onClose={() => setDeletingMakeup(null)}
        onConfirm={handleDeleteMakeup}
        isPending={deleting}
        danger
        title="ลบวันชดเชย"
        confirmLabel="ลบ"
        message={deletingMakeup
          ? `ต้องการลบวันชดเชย ${formatThaiDate(deletingMakeup.date)} หรือไม่? รายการชั่วโมง (ร่าง) ของ TA ในวันนี้จะถูกลบด้วย ระบบจะปฏิเสธการลบถ้ามีชั่วโมงที่ส่งอนุมัติแล้ว`
          : ""}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MakeupFormModal — add or replace a makeup for the given (section, original_date).
// Because backend enforces UNIQUE(section, original_date), "edit" is really
// delete-then-insert — we do that here in two steps so the audit trail keeps
// both events.
// ---------------------------------------------------------------------------

function MakeupFormModal({
  tcId, impact, section, onClose, onSaved,
}: {
  tcId: string;
  impact: HolidayImpact;
  section: AffectedSection;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const isReplace = !!section.makeup;
  const [date, setDate] = useState(section.makeup?.makeup_date ?? "");
  // Default the times to the original class times — the common case is
  // "hold the same lesson on a different day".
  const [start, setStart] = useState(section.makeup?.start_time?.slice(0, 5) ?? section.start_time.slice(0, 5));
  const [end, setEnd] = useState(section.makeup?.end_time?.slice(0, 5) ?? section.end_time.slice(0, 5));
  const [note, setNote] = useState(section.makeup?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const original = useMemo(() => formatThaiDate(impact.original_date), [impact.original_date]);

  async function handleSave() {
    setError(null);
    if (!date) { setError("กรุณาระบุวันชดเชย"); return; }
    if (!start || !end) { setError("กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด"); return; }
    setSaving(true);
    try {
      // Replace flow: delete existing, then create fresh. The backend has no
      // PATCH for makeup because UNIQUE constraint requires the row to move
      // atomically; the deleted+inserted pair is what the audit log wants.
      if (isReplace && section.makeup) {
        await api.del(`/teaching-courses/${tcId}/makeup/${section.section_id}/${section.makeup.id}`);
      }
      await api.post(`/teaching-courses/${tcId}/makeup/${section.section_id}`, {
        original_date: impact.original_date,
        makeup_date: date,
        start_time: start,
        end_time: end,
        note: note || null,
      });
      notify.success(isReplace ? "แก้ไขวันชดเชยแล้ว" : "กำหนดวันชดเชยแล้ว");
      await onSaved();
    } catch (e) {
      notify.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isReplace ? "แก้ไขวันชดเชย" : "กำหนดวันชดเชย"}
      icon={<CalendarOff size={18} />}
      size="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" onClick={handleSave} isPending={saving} disabled={saving}>บันทึก</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-lg bg-surface-secondary border border-(--hairline) px-3 py-2 text-xs text-muted flex flex-col gap-0.5">
          <div>
            <span>วันเดิม: </span>
            <span className="font-semibold text-foreground">{original}</span>
            <span className="ml-2">({impact.holiday_name_th})</span>
          </div>
          <div>
            <span>section {section.sec_no} · </span>
            <span>{KIND_LABEL[section.kind]}</span>
            <span> · {section.start_time.slice(0, 5)}–{section.end_time.slice(0, 5)}</span>
          </div>
        </div>

        <FieldGroup label="วันที่ชดเชย">
          <DatePicker value={date} onChange={setDate} label="วันที่ชดเชย" autoFocus />
        </FieldGroup>

        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="เวลาเริ่ม">
            <TimePicker value={start} onChange={setStart} label="เวลาเริ่ม" />
          </FieldGroup>
          <FieldGroup label="เวลาสิ้นสุด">
            <TimePicker value={end} onChange={setEnd} label="เวลาสิ้นสุด" />
          </FieldGroup>
        </div>

        <FieldGroup label="หมายเหตุ (ระบุก็ได้)">
          <TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น เลื่อนไปเรียนวันเสาร์" />
        </FieldGroup>

        {error && <Alert status="danger" title={error} icon={<AlertTriangle size={14} />} />}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// ManualMakeupModal — file a makeup for a class cancelled for a NON-holiday
// reason (illness, conference, …). The lecturer picks any section + original
// date, unlike MakeupFormModal which is bound to a holiday-impacted slot.
// ---------------------------------------------------------------------------

function ManualMakeupModal({
  tcId, sections, onClose, onSaved,
}: {
  tcId: string;
  sections: CourseSection[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [originalDate, setOriginalDate] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const section = sections.find(s => s.id === sectionId);
  // Prefill the times from the section's first scheduled slot as a convenience.
  const defaultSlot = section?.schedules?.[0];

  async function handleSave() {
    setError(null);
    if (!sectionId) { setError("กรุณาเลือก section"); return; }
    if (!originalDate) { setError("กรุณาระบุวันเดิมที่งดสอน"); return; }
    if (!date) { setError("กรุณาระบุวันชดเชย"); return; }
    const st = start || defaultSlot?.start_time?.slice(0, 5) || "";
    const et = end || defaultSlot?.end_time?.slice(0, 5) || "";
    if (!st || !et) { setError("กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด"); return; }
    setSaving(true);
    try {
      await api.post(`/teaching-courses/${tcId}/makeup/${sectionId}`, {
        original_date: originalDate,
        makeup_date: date,
        start_time: st,
        end_time: et,
        note: note || null,
      });
      notify.success("เพิ่มวันชดเชยแล้ว");
      await onSaved();
    } catch (e) {
      notify.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="เพิ่มวันชดเชย (กรณีอื่น)"
      icon={<CalendarOff size={18} />}
      size="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" onClick={handleSave} isPending={saving} disabled={saving}>บันทึก</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted">
          สำหรับคาบที่งดด้วยเหตุอื่นนอกจากวันหยุดราชการ (เช่น ลา/ประชุม). เมื่อกำหนดแล้ว TA จะลงเวลาปฏิบัติงานในวันชดเชยได้
        </p>

        <FieldGroup label="Section">
          <select
            className="w-full h-9 rounded-lg border border-(--hairline) bg-surface px-3 text-sm"
            value={sectionId}
            onChange={e => setSectionId(e.target.value)}
          >
            {sections.map(s => (
              <option key={s.id} value={s.id}>
                sec {s.sec_no} ({s.track === "special" ? "พิเศษ" : "ปกติ"})
              </option>
            ))}
          </select>
        </FieldGroup>

        <FieldGroup label="วันเดิมที่งดสอน">
          <DatePicker value={originalDate} onChange={setOriginalDate} label="วันเดิมที่งดสอน" />
        </FieldGroup>

        <FieldGroup label="วันที่ชดเชย">
          <DatePicker value={date} onChange={setDate} label="วันที่ชดเชย" />
        </FieldGroup>

        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="เวลาเริ่ม">
            <TimePicker
              value={start || defaultSlot?.start_time?.slice(0, 5) || ""}
              onChange={setStart}
              label="เวลาเริ่ม"
            />
          </FieldGroup>
          <FieldGroup label="เวลาสิ้นสุด">
            <TimePicker
              value={end || defaultSlot?.end_time?.slice(0, 5) || ""}
              onChange={setEnd}
              label="เวลาสิ้นสุด"
            />
          </FieldGroup>
        </div>

        <FieldGroup label="หมายเหตุ (ระบุก็ได้)">
          <TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น อาจารย์ลาประชุม เลื่อนไปเรียนวันเสาร์" />
        </FieldGroup>

        {error && <Alert status="danger" title={error} icon={<AlertTriangle size={14} />} />}
      </div>
    </Modal>
  );
}
